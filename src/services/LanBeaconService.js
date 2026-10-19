'use strict';

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

  start() {
    if (this.isRunning) return;
    this.isRunning = false; // Decommissioned per ADR-009: zero raw UDP sockets to prevent OS firewall alerts
    this.emit('started');
    console.log('[LanBeaconService] UDP beacon decommissioned in favor of zero-firewall Optical QR & HTTP ping');
  }

  /**
   * Stops the beacon service cleanly.
   */
  stop() {
    this.isRunning = false;
    this._isStarting = false;
    this.emit('stopped');
  }
}

module.exports = LanBeaconService;
