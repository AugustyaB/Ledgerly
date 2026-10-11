'use strict';

const dgram = require('dgram');
const os = require('os');
const { EventEmitter } = require('events');

const UDP_PORT = 52411;
const BROADCAST_INTERVAL_MS = 2000;
const BEACON_TTL_MS = 5 * 60 * 1000; // 5 minutes

class LanBeaconService extends EventEmitter {
  /**
   * @param {Object} options
   * @param {number} [options.port] - UDP port to bind
   * @param {number} [options.serverPort] - TCP SyncServer port to announce
   * @param {string} [options.machineName] - Host machine name override
   * @param {number} [options.intervalMs] - Broadcast interval in ms (default 2000ms)
   * @param {number} [options.ttlMs] - Auto-shutdown TTL in ms (default 5 minutes)
   */
  constructor(options = {}) {
    super();
    this.port = options.port || UDP_PORT;
    this.serverPort = options.serverPort || 52410;
    this.machineName = options.machineName || os.hostname();
    this.intervalMs =
      typeof options.intervalMs === 'number' && options.intervalMs > 0
        ? options.intervalMs
        : BROADCAST_INTERVAL_MS;
    this.ttlMs =
      typeof options.ttlMs === 'number' && options.ttlMs > 0
        ? options.ttlMs
        : BEACON_TTL_MS;

    this.socket = null;
    this.broadcastInterval = null;
    this.shutdownTimeout = null;
    this.isRunning = false;
    this._isStarting = false;
  }

  /**
   * Resolves primary LAN IPv4 address for announcement payloads.
   * @private
   * @returns {string}
   */
  _getPrimaryLanIp() {
    try {
      const interfaces = os.networkInterfaces();
      const candidates = [];
      for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name] || []) {
          if (iface && iface.family === 'IPv4' && !iface.internal && iface.address) {
            candidates.push(iface.address);
          }
        }
      }
      candidates.sort((a, b) => {
        if (a.startsWith('192.168.') && !b.startsWith('192.168.')) return -1;
        if (!a.startsWith('192.168.') && b.startsWith('192.168.')) return 1;
        if (a.startsWith('10.') && !b.startsWith('10.')) return -1;
        if (!a.startsWith('10.') && b.startsWith('10.')) return 1;
        return 0;
      });
      return candidates[0] || '127.0.0.1';
    } catch {
      return '127.0.0.1';
    }
  }

  /**
   * Builds the public zero-secret discovery announcement payload.
   * Explicitly excludes any PIN, pairing token, or session secret.
   *
   * @returns {{ type: string, service: string, machineName: string, host: string, port: number, protocolVersion: string }}
   */
  getBeaconPayload() {
    return {
      type: 'LEDGERLY_BEACON',
      service: '_ledgerly._udp',
      machineName: this.machineName,
      host: this._getPrimaryLanIp(),
      port: this.serverPort,
      protocolVersion: '1.0'
    };
  }

  /**
   * @private
   */
  _getBroadcastAddresses() {
    try {
      const interfaces = os.networkInterfaces();
      const addresses = [];
      for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name] || []) {
          if (iface && iface.family === 'IPv4' && !iface.internal) {
            addresses.push('255.255.255.255');
          }
        }
      }
      return [...new Set(addresses)];
    } catch {
      return ['255.255.255.255'];
    }
  }

  start() {
    if (this.isRunning || this._isStarting) return;

    this._isStarting = true;
    this.isRunning = true;

    const sock = dgram.createSocket('udp4');
    this.socket = sock;

    sock.on('listening', () => {
      if (this.socket !== sock || !this.isRunning) {
        try {
          sock.close();
        } catch {
          // Ignore close errors
        }
        return;
      }

      this._isStarting = false;

      try {
        sock.setBroadcast(true);
      } catch (err) {
        // Non-fatal on restricted EACCES network interfaces; unicast probes remain operational
        console.warn('[LanBeaconService] Broadcast permission restricted (EACCES fallback):', err.message);
      }

      this._broadcastBeacon();

      this.broadcastInterval = setInterval(() => {
        this._broadcastBeacon();
      }, this.intervalMs);
      if (this.broadcastInterval && typeof this.broadcastInterval.unref === 'function') {
        this.broadcastInterval.unref();
      }

      this.shutdownTimeout = setTimeout(() => {
        this.emit('ttl-expired');
        this.stop();
      }, this.ttlMs);
      if (this.shutdownTimeout && typeof this.shutdownTimeout.unref === 'function') {
        this.shutdownTimeout.unref();
      }

      this.emit('started');
      console.log(`[LanBeaconService] Broadcasting beacon on UDP port ${this.port}`);
    });

    sock.on('message', (msg, rinfo) => {
      try {
        const raw = msg.toString('utf8').trim();
        if (raw === 'DISCOVER_LEDGERLY') {
          this._sendBeacon(rinfo.address, rinfo.port);
          return;
        }
        const payload = JSON.parse(raw);
        if (
          payload &&
          (payload.type === 'DISCOVER_LEDGERLY' ||
            payload.type === 'ledgerly_probe' ||
            payload.probe === 'DISCOVER_LEDGERLY')
        ) {
          this._sendBeacon(rinfo.address, rinfo.port);
        }
      } catch {
        // Ignore malformed or unrelated UDP packets
      }
    });

    sock.on('error', err => {
      console.warn('[LanBeaconService] UDP socket error:', err.message || err);
      this.stop();
    });

    try {
      sock.bind(this.port);
    } catch (err) {
      console.warn('[LanBeaconService] UDP bind error:', err.message || err);
      this.stop();
    }
  }

  /**
   * @private
   */
  _broadcastBeacon() {
    if (!this.isRunning || !this.socket) return;
    const addresses = this._getBroadcastAddresses();
    if (addresses.length === 0) addresses.push('255.255.255.255');

    addresses.forEach(addr => {
      this._sendBeacon(addr, this.port);
    });
  }

  /**
   * @private
   */
  _sendBeacon(address, port) {
    if (!this.isRunning || !this.socket) return;
    const payload = JSON.stringify(this.getBeaconPayload());
    const buffer = Buffer.from(payload);
    try {
      this.socket.send(buffer, 0, buffer.length, port, address, err => {
        if (err && err.code === 'EACCES') {
          // Suppress broadcast EACCES permission error cleanly without crashing
        }
      });
    } catch {
      // Suppress synchronous send error on restricted interfaces
    }
  }

  stop() {
    if (!this.isRunning && !this._isStarting && !this.socket) return;

    if (this.broadcastInterval) {
      clearInterval(this.broadcastInterval);
      this.broadcastInterval = null;
    }
    if (this.shutdownTimeout) {
      clearTimeout(this.shutdownTimeout);
      this.shutdownTimeout = null;
    }

    const sock = this.socket;
    this.socket = null;
    this.isRunning = false;
    this._isStarting = false;

    if (sock) {
      try {
        sock.removeAllListeners('message');
        sock.close();
      } catch {
        // Ignore already-closed socket errors
      }
    }

    this.emit('stopped');
    console.log('[LanBeaconService] Beacon stopped');
  }
}

module.exports = LanBeaconService;
