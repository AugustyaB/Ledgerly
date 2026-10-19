/**
 * ============================================================================
 * Ledgerly — SyncServer (Local Wi-Fi Pairing & LAN Sync Engine)
 * ============================================================================
 *
 * @fileoverview
 * Zero-dependency, offline-first local HTTP server running in Electron main process.
 * Coordinates peer-to-peer Wi-Fi pairing and synchronization between Ledgerly Desktop
 * and the Ledgerly Mobile companion application.
 *
 * ARCHITECTURAL PRINCIPLES:
 * - 100% Offline / Zero-Cloud: Exclusively communicates over the local Wi-Fi subnet.
 * - Zero External Dependencies: Built strictly on Node's native `http`, `crypto`, `os`.
 * - Defense-in-Depth: Timing-safe PIN verification, SHA-256 Bearer auth, LAN IP checks.
 * - Dynamic Profile Routing: Automatically routes mobile data into desktop's active profile.
 * - Resilient Port Binding: Auto-increments from default 52410 on EADDRINUSE collisions.
 */

'use strict';

const http = require('http');
const crypto = require('crypto');
const os = require('os');
const fs = require('fs');

const { validateMobileTransaction } = require('../validation/schemaValidator');
const SyncEngine = require('./SyncEngine');

const DEFAULT_PORT = 52410;
const PAIRING_TOKEN_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_JSON_BODY_BYTES = 2 * 1024 * 1024; // 2MB
const MAX_RECEIPT_BODY_BYTES = 50 * 1024 * 1024; // 50MB

class SyncServer {
  /**
   * @param {Object} options
   * @param {import('../storage')} options.storage - ExpenseStorage facade instance.
   * @param {import('../receiptStorage')} options.receiptStorage - ReceiptStorage instance.
   * @param {import('./DocumentIntelligenceService')} [options.documentIntelligenceService] - Optional OCR service for background ingestion.
   * @param {Function} [options.onSyncEvent] - Callback for desktop UI live notification on sync ingestion.
   * @param {number} [options.port=52410] - Initial binding port.
   * @param {string} [options.host='0.0.0.0'] - Binding address.
   */
  constructor(options = {}) {
    this.storage = options.storage;
    this.receiptStorage = options.receiptStorage;
    this.documentIntelligenceService = options.documentIntelligenceService || null;
    this.onSyncEvent = typeof options.onSyncEvent === 'function' ? options.onSyncEvent : null;
    this.preferredPort = options.port || DEFAULT_PORT;
    this.boundPort = null;
    this.host = options.host || '0.0.0.0';

    this.server = null;
    this.isRunning = false;

    // Ephemeral pairing state
    this.activePairingSession = null;

    // Rate limiter (IP -> { failedAttempts: number, lockoutUntil: number })
    this.ipRateLimitCache = new Map();

    // Beacon decommissioned per ADR-009 / Phase 0.9.2 in favor of zero-firewall Optical QR & HTTP status ping
    this.lanBeacon = null;

    // Receipt deduplication cache (SHA-256 hash -> { filename, absolutePath, timestamp })
    this.receiptHashCache = new Map();
  }

  // ==========================================================================
  // 1. Network Discovery & Local LAN IP Utilities
  // ==========================================================================

  /**
   * Enumerates active non-internal IPv4 LAN network interfaces.
   * Prioritizes common private address blocks (192.168.x.x, 10.x.x.x, 172.16-31.x.x).
   *
   * @returns {string[]} Array of LAN IP address strings.
   */
  getLanAddresses() {
    const interfaces = os.networkInterfaces();
    const addresses = [];

    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        // Filter out IPv6 and internal loopback interfaces
        if (iface.family === 'IPv4' && !iface.internal) {
          addresses.push(iface.address);
        }
      }
    }

    // Sort to prioritize typical Wi-Fi subnets (192.168.x.x first, then 10.x.x.x)
    addresses.sort((a, b) => {
      if (a.startsWith('192.168.') && !b.startsWith('192.168.')) return -1;
      if (!a.startsWith('192.168.') && b.startsWith('192.168.')) return 1;
      if (a.startsWith('10.') && !b.startsWith('10.')) return -1;
      if (!a.startsWith('10.') && b.startsWith('10.')) return 1;
      return 0;
    });

    return addresses.length > 0 ? addresses : ['127.0.0.1'];
  }

  /**
   * Returns primary LAN host IP for QR payload generation.
   *
   * @returns {string} Primary host IP.
   */
  getPrimaryHostIp() {
    const addrs = this.getLanAddresses();
    return addrs[0] || '127.0.0.1';
  }

  /**
   * Evaluates whether a client remote address belongs to a local private subnet.
   *
   * @param {string} remoteAddress
   * @returns {boolean} True if client is on LAN or loopback.
   */
  isLocalOrPrivateAddress(remoteAddress) {
    if (!remoteAddress) return false;
    const ip = remoteAddress.replace(/^.*:/, ''); // Strip IPv6 prefix if mapped (e.g. ::ffff:192.168.1.5)

    if (ip === '127.0.0.1' || ip === 'localhost' || remoteAddress === '::1') return true;
    if (ip.startsWith('192.168.')) return true;
    if (ip.startsWith('10.')) return true;

    // 172.16.0.0 - 172.31.255.255
    if (ip.startsWith('172.')) {
      const parts = ip.split('.');
      const secondOctet = parseInt(parts[1], 10);
      if (secondOctet >= 16 && secondOctet <= 31) return true;
    }

    return false;
  }

  // ==========================================================================
  // 2. Ephemeral Pairing Token & PIN Generation
  // ==========================================================================

  /**
   * Generates a 6-digit PIN and high-entropy pairing token with 5-minute TTL.
   * Enforces rate limiting (default 15 attempts) and scopes session to active profile.
   *
   * @param {Object} [options]
   * @param {number} [options.maxAttempts=15] - Maximum failed pairing attempts before lockout.
   * @param {string} [options.targetProfileId] - Explicit profile ID to tether (defaults to active).
   * @returns {{ pin: string, token: string, expiresAt: string, expiresInSeconds: number, qrPayload: string, machineName: string, host: string, port: number, targetProfileId: string|null, maxAttempts: number }}
   */
  generatePairingToken(options = {}) {
    const pin = crypto.randomInt(100000, 999999).toString();
    const token = crypto.randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + PAIRING_TOKEN_TTL_MS).toISOString();
    const host = this.getPrimaryHostIp();
    const port = this.boundPort || this.preferredPort;
    const machineName = os.hostname();

    const hasExplicitMaxAttempts = Boolean(
      options && typeof options.maxAttempts === 'number' && options.maxAttempts > 0
    );
    const maxAttempts = hasExplicitMaxAttempts ? options.maxAttempts : 15;

    let targetProfileId = options && options.targetProfileId ? options.targetProfileId : null;
    if (!targetProfileId && this.storage && typeof this.storage.getActiveProfileId === 'function') {
      targetProfileId = this.storage.getActiveProfileId();
    }

    this.activePairingSession = {
      pin,
      token,
      expiresAt: Date.now() + PAIRING_TOKEN_TTL_MS,
      host,
      port,
      machineName,
      targetProfileId,
      failedAttempts: 0,
      maxAttempts,
      hasExplicitMaxAttempts
    };

    const payloadObj = {
      host,
      port,
      token,
      pin,
      machineName,
      targetProfileId
    };

    return {
      pin,
      token,
      expiresAt,
      expiresInSeconds: Math.floor(PAIRING_TOKEN_TTL_MS / 1000),
      qrPayload: JSON.stringify(payloadObj),
      machineName,
      host,
      port,
      targetProfileId,
      maxAttempts
    };
  }

  /**
   * Timing-safe string comparison preventing side-channel attacks.
   *
   * @private
   * @param {string} a
   * @param {string} b
   * @returns {boolean} True if equal.
   */
  _timingSafeCompare(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') return false;
    const bufA = Buffer.from(a, 'utf8');
    const bufB = Buffer.from(b, 'utf8');
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  }

  // ==========================================================================
  // 3. Server Lifecycle (Start, Stop, Auto-Port Fallback)
  // ==========================================================================

  /**
   * Starts the local HTTP sync server with automatic incremental port fallback.
   *
   * @param {number} [startPort] - Port to start attempting.
   * @returns {Promise<{ running: boolean, port: number, host: string, lanIps: string[] }>}
   */
  async start(startPort = this.preferredPort) {
    if (this.isRunning && this.server) {
      return {
        running: true,
        port: this.boundPort,
        host: this.host,
        lanIps: this.getLanAddresses()
      };
    }

    return new Promise((resolve, reject) => {
      let currentPort = startPort;
      const maxAttempts = 10;
      let attempts = 0;

      const tryBind = () => {
        attempts++;
        const srv = http.createServer((req, res) => this._handleRequest(req, res));

        srv.once('error', err => {
          if (err.code === 'EADDRINUSE' && attempts < maxAttempts) {
            console.warn(`[SyncServer] Port ${currentPort} in use, attempting port ${currentPort + 1}...`);
            currentPort++;
            tryBind();
          } else {
            console.error('[SyncServer] Fatal server startup error:', err);
            reject(err);
          }
        });

        srv.once('listening', () => {
          this.server = srv;
          this.boundPort = currentPort;
          this.isRunning = true;
          console.log(`[SyncServer] LAN Pairing & Sync Server active at http://${this.host}:${this.boundPort}`);
          console.log(`[SyncServer] Available LAN IPs: ${this.getLanAddresses().join(', ')}`);

          resolve({
            running: true,
            port: this.boundPort,
            host: this.host,
            lanIps: this.getLanAddresses()
          });
        });

        srv.listen(currentPort, this.host);
      };

      tryBind();
    });
  }

  /**
   * Stops the server cleanly and releases bound port.
   *
   * @returns {Promise<void>}
   */
  async stop() {
    if (!this.server || !this.isRunning) return;

    return new Promise(resolve => {
      this.server.close(() => {
        this.server = null;
        this.isRunning = false;
        this.boundPort = null;
        this.activePairingSession = null;
        console.log('[SyncServer] Sync Server stopped.');
        resolve();
      });
    });
  }

  /**
   * Currently bound or preferred port.
   *
   * @returns {number}
   */
  get port() {
    return this.boundPort || this.preferredPort;
  }

  /**
   * Returns live status summary of the sync server.
   *
   * @returns {{ running: boolean, port: number|null, host: string, lanIps: string[], pairedDevicesCount: number, beaconRunning: boolean, discoveryMode: string }}
   */
  getStatus() {
    const paired = this.storage ? this.storage.getPairedDevices() : [];
    return {
      running: this.isRunning,
      port: this.boundPort,
      host: this.host,
      lanIps: this.getLanAddresses(),
      pairedDevicesCount: paired.length,
      beaconRunning: false,
      discoveryMode: 'optical-qr'
    };
  }

  /**
   * Safe no-op stub: UDP beacon decommissioned per ADR-009 in favor of Optical QR & HTTP status ping.
   *
   * @returns {{ success: boolean, mode: string }}
   */
  startPairingBeacon() {
    return { success: true, mode: 'optical-qr' };
  }

  /**
   * Safe no-op stub: UDP beacon decommissioned per ADR-009 in favor of Optical QR & HTTP status ping.
   *
   * @returns {{ success: boolean, mode: string }}
   */
  stopPairingBeacon() {
    return { success: true, mode: 'optical-qr' };
  }

  /**
   * Pings an IP address for Ledgerly Desktop status over HTTP.
   *
   * @param {string} host
   * @param {number} [port=52410]
   * @param {number} [timeoutMs=1500]
   * @returns {Promise<Object|null>}
   */
  static async pingServer(host, port = 52410, timeoutMs = 1500) {
    return new Promise(resolve => {
      const req = http.get(`http://${host}:${port}/api/v1/status`, { timeout: timeoutMs }, res => {
        let raw = '';
        res.on('data', chunk => {
          raw += chunk;
        });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(raw);
            resolve(parsed && parsed.name === 'Ledgerly Desktop' ? parsed : null);
          } catch {
            resolve(null);
          }
        });
      });
      req.on('error', () => resolve(null));
      req.on('timeout', () => {
        req.destroy();
        resolve(null);
      });
    });
  }

  resetPairingLockout() {
    this.ipRateLimitCache.clear();
  }

  // ==========================================================================
  // 4. HTTP Request Router & Middleware
  // ==========================================================================

  /**
   * Master HTTP request dispatcher.
   *
   * @private
   * @param {http.IncomingMessage} req
   * @param {http.ServerResponse} res
   */
  async _handleRequest(req, res) {
    // 1. CORS Preflight & Base Headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // 2. Private LAN Network Boundary Guard
    const remoteIp = req.socket.remoteAddress;
    if (!this.isLocalOrPrivateAddress(remoteIp)) {
      this._sendJson(res, 403, {
        success: false,
        error: 'Forbidden: Connections are only accepted from local network clients.',
        code: 'ERR_FORBIDDEN_ORIGIN'
      });
      return;
    }

    const hostHeader = req.headers.host || `127.0.0.1:${this.boundPort || this.preferredPort}`;
    const parsedUrl = new URL(req.url, `http://${hostHeader}`);
    const pathname = parsedUrl.pathname;
    const query = Object.fromEntries(parsedUrl.searchParams.entries());

    try {
      // 3. Unauthenticated Routes
      if (req.method === 'GET' && pathname === '/api/v1/status') {
        return this._handleStatus(req, res);
      }

      if (req.method === 'POST' && pathname === '/api/v1/pair') {
        return this._handlePair(req, res);
      }

      // 4. Authenticated Routes Boundary Guard
      const auth = this._authenticateBearer(req);
      if (!auth.authenticated) {
        this._sendJson(res, 401, {
          success: false,
          error: auth.error || 'Unauthorized: Missing or invalid session Bearer token.',
          code: 'UNAUTHORIZED'
        });
        return;
      }

      const clientDevice = auth.device;

      // 5. Authenticated Endpoints
      if (req.method === 'GET' && pathname === '/api/v1/sync/pull') {
        return this._handleSyncPull(req, res, query, clientDevice);
      }

      if (req.method === 'POST' && pathname === '/api/v1/sync/push') {
        return this._handleSyncPush(req, res, clientDevice);
      }

      if (req.method === 'POST' && pathname === '/api/v1/sync/receipt') {
        return this._handleSyncReceipt(req, res, clientDevice);
      }

      if (req.method === 'POST' && pathname === '/api/v1/unpair') {
        return this._handleUnpair(req, res, clientDevice);
      }

      // 404 Route Not Found
      this._sendJson(res, 404, {
        success: false,
        error: `Endpoint not found: ${req.method} ${pathname}`,
        code: 'NOT_FOUND'
      });
    } catch (err) {
      console.error(`[SyncServer] Internal error on ${req.method} ${pathname}:`, err);
      this._sendJson(res, 500, {
        success: false,
        error: err.message || 'Internal server error.',
        code: 'INTERNAL_ERROR'
      });
    }
  }

  /**
   * Verifies Bearer session token against paired devices registry in storage.
   *
   * @private
   * @param {http.IncomingMessage} req
   * @returns {{ authenticated: boolean, device?: Object, error?: string }}
   */
  _authenticateBearer(req) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return { authenticated: false, error: 'Missing Bearer token.' };
    }

    const token = authHeader.slice(7).trim();
    if (!token) {
      return { authenticated: false, error: 'Empty Bearer token.' };
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const device = this.storage.findPairedDeviceByTokenHash(tokenHash);

    if (!device) {
      return { authenticated: false, error: 'Device session token has expired or been revoked.' };
    }

    // Refresh lastSeen timestamp
    this.storage.updatePairedDeviceLastSeen(device.deviceId);

    return { authenticated: true, device };
  }

  /**
   * Reads and parses incoming JSON body with memory ceiling protection.
   *
   * @private
   * @param {http.IncomingMessage} req
   * @param {number} [maxBytes=MAX_JSON_BODY_BYTES]
   * @returns {Promise<Object>}
   */
  _readJsonBody(req, maxBytes = MAX_JSON_BODY_BYTES) {
    return new Promise((resolve, reject) => {
      let totalSize = 0;
      const chunks = [];

      req.on('data', chunk => {
        totalSize += chunk.length;
        if (totalSize > maxBytes) {
          req.destroy();
          reject(new Error(`Payload exceeds maximum size limit of ${maxBytes} bytes.`));
          return;
        }
        chunks.push(chunk);
      });

      req.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        if (!raw.trim()) {
          resolve({});
          return;
        }
        try {
          const parsed = JSON.parse(raw);
          resolve(parsed);
        } catch (err) {
          reject(new Error(`Malformed JSON request payload: ${err.message}`));
        }
      });

      req.on('close', () => {
        if (!req.complete) {
          reject(new Error('Connection closed by client before request completed.'));
        }
      });

      req.on('error', err => reject(err));
    });
  }

  /**
   * Reads binary buffer body with memory ceiling protection (for receipt uploads).
   *
   * @private
   * @param {http.IncomingMessage} req
   * @param {number} [maxBytes=MAX_RECEIPT_BODY_BYTES]
   * @returns {Promise<Buffer>}
   */
  _readBinaryBody(req, maxBytes = MAX_RECEIPT_BODY_BYTES) {
    return new Promise((resolve, reject) => {
      let totalSize = 0;
      const chunks = [];

      req.on('data', chunk => {
        totalSize += chunk.length;
        if (totalSize > maxBytes) {
          req.destroy();
          reject(new Error(`Receipt payload exceeds maximum size limit of ${maxBytes} bytes.`));
          return;
        }
        chunks.push(chunk);
      });

      req.on('end', () => {
        resolve(Buffer.concat(chunks));
      });

      req.on('close', () => {
        if (!req.complete) {
          reject(new Error('Connection closed by client before request completed.'));
        }
      });

      req.on('error', err => reject(err));
    });
  }

  /**
   * Helper to write structured JSON responses.
   *
   * @private
   * @param {http.ServerResponse} res
   * @param {number} statusCode
   * @param {Object} data
   */
  _sendJson(res, statusCode, data) {
    if (res.headersSent || res.destroyed || res.writableEnded) {
      return;
    }
    const body = JSON.stringify(data);
    res.writeHead(statusCode, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(body)
    });
    res.end(body);
  }

  _getActiveData() {
    if (!this.storage) return null;
    if (typeof this.storage.getActiveData === 'function') {
      return this.storage.getActiveData();
    }
    if (typeof this.storage.getData === 'function') {
      return this.storage.getData();
    }
    return null;
  }

  _saveActiveData(data) {
    if (!this.storage) return false;
    if (typeof this.storage.saveActiveData === 'function') {
      return this.storage.saveActiveData(data);
    }
    if (typeof this.storage.saveData === 'function') {
      return this.storage.saveData(data);
    }
    return false;
  }

  /**
   * Retrieves profile data for a specific paired device or explicit profileId.
   * Falls back to desktop active profile data if not scoped.
   *
   * @private
   * @param {Object} [clientDevice] - Authenticated paired device record.
   * @param {string} [explicitProfileId] - Optional explicit profile override.
   * @returns {import('../types').ProfileData|null}
   */
  _getProfileData(clientDevice, explicitProfileId) {
    if (!this.storage) return null;
    const profileId = explicitProfileId || (clientDevice && clientDevice.targetProfileId);
    if (profileId && typeof this.storage.getProfileData === 'function') {
      return this.storage.getProfileData(profileId);
    }
    return this._getActiveData();
  }

  /**
   * Persists profile data for a specific paired device or explicit profileId.
   * Falls back to saving active profile data if not scoped.
   *
   * @private
   * @param {Object} [clientDevice] - Authenticated paired device record.
   * @param {import('../types').ProfileData} data - Data to persist.
   * @param {string} [explicitProfileId] - Optional explicit profile override.
   * @returns {boolean|import('../types').OperationResult}
   */
  _saveProfileData(clientDevice, data, explicitProfileId) {
    if (!this.storage) return false;
    const profileId = explicitProfileId || (clientDevice && clientDevice.targetProfileId);
    if (profileId && typeof this.storage.saveProfileData === 'function') {
      return this.storage.saveProfileData(profileId, data);
    }
    return this._saveActiveData(data);
  }

  // ==========================================================================
  // 5. REST Endpoint Handlers
  // ==========================================================================

  /**
   * GET /api/v1/status
   */
  _handleStatus(req, res) {
    const activeData = this._getActiveData();
    const currency = (activeData && activeData.salaryConfig && activeData.salaryConfig.currencySymbol) || '₹';

    this._sendJson(res, 200, {
      success: true,
      status: 'online',
      name: 'Ledgerly Desktop',
      protocolVersion: '1.0',
      machineName: os.hostname(),
      currencySymbol: currency,
      serverTime: new Date().toISOString()
    });
  }

  /**
   * POST /api/v1/pair
   * Validates pairing PIN/token and issues long-lived session Bearer token.
   */
  async _handlePair(req, res) {
    const body = await this._readJsonBody(req);
    const { pin, token, deviceNodeId, deviceName } = body;

    if (!deviceNodeId) {
      return this._sendJson(res, 400, {
        success: false,
        error: 'Missing required field: deviceNodeId',
        code: 'INVALID_ARGUMENT'
      });
    }

    const forwardedIp =
      req.headers && (req.headers['x-forwarded-for'] || req.headers['x-client-ip']);
    const remoteIp =
      (forwardedIp ? String(forwardedIp).split(',')[0].trim() : req.socket.remoteAddress) ||
      'unknown';

    const ipRecord = this.ipRateLimitCache.get(remoteIp) || { failedAttempts: 0, lockoutUntil: 0 };

    if (ipRecord.lockoutUntil > 0) {
      if (Date.now() < ipRecord.lockoutUntil) {
        const remainingSec = Math.max(1, Math.ceil((ipRecord.lockoutUntil - Date.now()) / 1000));
        res.setHeader('Retry-After', String(remainingSec));
        return this._sendJson(res, 429, {
          success: false,
          error: `Too many failed pairing attempts. IP is locked out. Try again in ${remainingSec} seconds.`,
          code: 'TOO_MANY_ATTEMPTS',
          remainingAttempts: 0,
          retryAfter: remainingSec
        });
      }
      // Lockout window elapsed; reset counter for fresh window
      ipRecord.failedAttempts = 0;
      ipRecord.lockoutUntil = 0;
      this.ipRateLimitCache.delete(remoteIp);
    }

    if (!this.activePairingSession) {
      return this._sendJson(res, 403, {
        success: false,
        error: 'No active pairing session on desktop. Please generate a new pairing PIN on Ledgerly Desktop.',
        code: 'PAIRING_SESSION_INACTIVE'
      });
    }

    if (Date.now() > this.activePairingSession.expiresAt) {
      this.activePairingSession = null;
      this.stopPairingBeacon();
      return this._sendJson(res, 403, {
        success: false,
        error: 'Pairing session has expired (5 minute TTL). Please generate a fresh PIN on desktop.',
        code: 'PAIRING_EXPIRED'
      });
    }

    // Fetch dynamic security config
    let maxAttempts = (this.activePairingSession && this.activePairingSession.maxAttempts) || 15;
    let lockoutSec = 60;
    try {
      let secConfig = null;
      if (
        this.storage &&
        this.storage.intelligence &&
        typeof this.storage.intelligence.getPairingSecurityConfig === 'function'
      ) {
        secConfig = this.storage.intelligence.getPairingSecurityConfig();
      } else {
        const dbFile =
          (this.storage && this.storage.filePath) ||
          (this.storage && this.storage.db && typeof this.storage.db.getFilePath === 'function'
            ? this.storage.db.getFilePath()
            : null) ||
          (this.storage && typeof this.storage.getFilePath === 'function'
            ? this.storage.getFilePath()
            : null);
        const configPath = dbFile
          ? require('path').join(require('path').dirname(dbFile), 'expenses_config.json')
          : null;
        if (configPath && require('fs').existsSync(configPath)) {
          const config = JSON.parse(require('fs').readFileSync(configPath, 'utf8'));
          secConfig = config.securityConfig_v1 || null;
        }
      }

      if (secConfig) {
        if (!this.activePairingSession.hasExplicitMaxAttempts) {
          maxAttempts =
            secConfig.maxFailedAttempts || secConfig.maxPairingAttempts || maxAttempts;
        }
        lockoutSec =
          secConfig.lockoutDurationSeconds || secConfig.pairingLockoutSeconds || 60;
      }
    } catch {
      // Ignore config read transient
    }

    // Timing-safe comparison: matches either 6-digit numeric PIN or 24-byte QR token
    const pinMatches =
      pin && this._timingSafeCompare(String(pin).trim(), this.activePairingSession.pin);
    const tokenMatches =
      token && this._timingSafeCompare(String(token).trim(), this.activePairingSession.token);

    if (!pinMatches && !tokenMatches) {
      ipRecord.failedAttempts++;
      if (ipRecord.failedAttempts >= maxAttempts) {
        ipRecord.lockoutUntil = Date.now() + lockoutSec * 1000;
        this.ipRateLimitCache.set(remoteIp, ipRecord);

        res.setHeader('Retry-After', String(lockoutSec));
        return this._sendJson(res, 429, {
          success: false,
          error: `Too many failed pairing attempts. IP locked out. Try again in ${lockoutSec} seconds.`,
          code: 'TOO_MANY_ATTEMPTS',
          remainingAttempts: 0,
          retryAfter: lockoutSec
        });
      }

      this.ipRateLimitCache.set(remoteIp, ipRecord);
      const remaining = Math.max(0, maxAttempts - ipRecord.failedAttempts);

      return this._sendJson(res, 401, {
        success: false,
        error: `Invalid pairing PIN or token. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`,
        code: 'INVALID_CREDENTIALS',
        remainingAttempts: remaining
      });
    }

    // Success, reset rate limit for this IP
    this.ipRateLimitCache.delete(remoteIp);

    // Success: Generate persistent session token (32 bytes hex)
    const sessionToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(sessionToken).digest('hex');

    const targetProfileId = this.activePairingSession.targetProfileId || null;

    const pairedRecord = {
      deviceId: deviceNodeId,
      deviceName: deviceName || 'Mobile Companion',
      tokenHash,
      targetProfileId,
      pairedAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString()
    };

    this.storage.addPairedDevice(pairedRecord);

    // Expire active ephemeral pairing session and stop UDP beacon after successful claim
    this.activePairingSession = null;
    this.stopPairingBeacon();

    const targetData = this._getProfileData({ targetProfileId });
    const currency =
      (targetData && targetData.salaryConfig && targetData.salaryConfig.currencySymbol) || '₹';

    return this._sendJson(res, 200, {
      success: true,
      sessionToken,
      machineName: os.hostname(),
      currencySymbol: currency,
      targetProfileId,
      pairedAt: pairedRecord.pairedAt,
      serverTime: new Date().toISOString()
    });
  }

  /**
   * GET /api/v1/sync/pull?since=<ISO_TIMESTAMP>&profileId=<PROFILE_ID>
   * Returns expenses, categories, presets from targeted profile modified since timestamp.
   */
  _handleSyncPull(req, res, query, clientDevice) {
    const explicitProfileId = query && query.profileId ? query.profileId : null;
    const targetData = this._getProfileData(clientDevice, explicitProfileId) || {};
    const allExpenses = targetData.expenses || [];
    const sinceTime = query && query.since ? new Date(query.since).getTime() : 0;
    const since = isNaN(sinceTime) ? 0 : sinceTime;

    const deltaExpenses = allExpenses.filter(e => {
      const updated = new Date(e.updatedAt || e.date || 0).getTime();
      return updated >= since;
    });

    const currencySymbol = (targetData.salaryConfig && targetData.salaryConfig.currencySymbol) || '₹';
    const resolvedProfileId = explicitProfileId || (clientDevice && clientDevice.targetProfileId) || null;

    return this._sendJson(res, 200, {
      success: true,
      expenses: deltaExpenses,
      categories: targetData.categories || [],
      presets: targetData.presets || [],
      currencySymbol,
      profileId: resolvedProfileId,
      serverTime: new Date().toISOString()
    });
  }

  /**
   * POST /api/v1/sync/push
   * Ingests mobile transactions into targeted profile using SyncEngine reconciliation.
   */
  async _handleSyncPush(req, res, clientDevice) {
    const body = await this._readJsonBody(req);
    const transactions = Array.isArray(body.transactions)
      ? body.transactions
      : Array.isArray(body.mutations)
        ? body.mutations.map(m => m.payload || m)
        : [];

    if (!Array.isArray(transactions) || transactions.length === 0) {
      return this._sendJson(res, 200, {
        success: true,
        appliedCount: 0,
        failedCount: 0,
        errors: [],
        serverTime: new Date().toISOString()
      });
    }

    const explicitProfileId = body && body.profileId ? body.profileId : null;
    const targetData = this._getProfileData(clientDevice, explicitProfileId) || {};
    const currentExpenses = targetData.expenses || [];
    const applied = [];
    const errors = [];

    for (let i = 0; i < transactions.length; i++) {
      const tx = transactions[i];

      // Validate schema
      const val = validateMobileTransaction(tx);
      if (!val.valid) {
        errors.push({ id: tx.id || `item-${i}`, errors: val.errors });
        continue;
      }

      // Check if transaction already exists in this profile
      const existingIdx = currentExpenses.findIndex(e => e.id === tx.id);

      if (existingIdx === -1) {
        // If incoming transaction is already soft-deleted, do not resurrect into active expenses
        if (tx.deletedAt) {
          applied.push({ id: tx.id, deleted: true });
          continue;
        }

        // New transaction: stamp and prepend to target profile expenses
        const normalized = {
          ...tx,
          originNodeId: tx.originNodeId || (clientDevice ? clientDevice.deviceId : 'mobile'),
          version: typeof tx.version === 'number' ? tx.version : 1,
          updatedAt: tx.updatedAt || new Date().toISOString(),
          deletedAt: null,
          syncStatus: 'synced'
        };
        currentExpenses.unshift(normalized);
        applied.push(normalized);
      } else {
        // Existing transaction: perform Last-Write-Wins comparison
        const existing = currentExpenses[existingIdx];
        const cmp = SyncEngine.compareLWW(existing, tx);

        if (cmp < 0) {
          // Incoming mobile is newer -> update profile
          if (tx.deletedAt) {
            // Tombstone / Deletion: remove from profile expenses
            currentExpenses.splice(existingIdx, 1);
            applied.push({ id: tx.id, deleted: true });
          } else {
            const updated = {
              ...existing,
              ...tx,
              version: (tx.version || existing.version || 1) + 1,
              updatedAt: new Date().toISOString(),
              deletedAt: null,
              syncStatus: 'synced'
            };
            currentExpenses[existingIdx] = updated;
            applied.push(updated);
          }
        } else {
          // Profile record is newer or identical -> keep existing record
          applied.push(existing);
        }
      }
    }

    targetData.expenses = currentExpenses;
    this._saveProfileData(clientDevice, targetData, explicitProfileId);

    const resolvedProfileId = explicitProfileId || (clientDevice && clientDevice.targetProfileId) || null;

    if (this.onSyncEvent && applied.length > 0) {
      try {
        this.onSyncEvent({
          type: 'mobile-sync',
          action: 'transactions-pushed',
          appliedCount: applied.length,
          profileId: resolvedProfileId,
          device: clientDevice ? clientDevice.deviceName : 'Mobile Companion',
          timestamp: new Date().toISOString()
        });
      } catch (evtErr) {
        console.warn('[SyncServer] onSyncEvent callback warning:', evtErr.message);
      }
    }

    return this._sendJson(res, 200, {
      success: true,
      appliedCount: applied.length,
      failedCount: errors.length,
      applied,
      errors,
      profileId: resolvedProfileId,
      serverTime: new Date().toISOString()
    });
  }

  /**
   * POST /api/v1/sync/receipt
   * Ingests receipt image binary or Base64, saves to ReceiptStorage,
   * and optionally triggers background DocumentIntelligence for Option B review cockpit.
   */
  async _handleSyncReceipt(req, res, clientDevice) {
    const contentType = req.headers['content-type'] || '';
    let imageBuffer;
    let extension = '.jpg';
    let hasManualDetails = false;
    let jsonBody = null;

    if (contentType.includes('application/json')) {
      const body = await this._readJsonBody(req, MAX_RECEIPT_BODY_BYTES);
      jsonBody = body;
      if (!body.imageData && !body.imageBase64) {
        return this._sendJson(res, 400, {
          success: false,
          error: 'Missing imageData / imageBase64 in JSON payload',
          code: 'INVALID_ARGUMENT'
        });
      }
      const rawB64 = body.imageData || body.imageBase64;
      imageBuffer = Buffer.from(rawB64.replace(/^data:image\/\w+;base64,/, ''), 'base64');
      if (body.mimeType === 'image/png') extension = '.png';
      if (body.mimeType === 'application/pdf') extension = '.pdf';
      hasManualDetails = Boolean(body.hasManualDetails);
    } else {
      // Raw binary stream
      imageBuffer = await this._readBinaryBody(req, MAX_RECEIPT_BODY_BYTES);
      if (contentType.includes('png')) extension = '.png';
      if (contentType.includes('pdf')) extension = '.pdf';
    }

    if (!imageBuffer || imageBuffer.length === 0) {
      return this._sendJson(res, 400, {
        success: false,
        error: 'Empty receipt image buffer received.',
        code: 'INVALID_ARGUMENT'
      });
    }

    // Deduplication check via SHA-256 content hash
    const contentHash = crypto.createHash('sha256').update(imageBuffer).digest('hex');
    const explicitProfileId = jsonBody && jsonBody.profileId ? jsonBody.profileId : null;
    const resolvedProfileId = explicitProfileId || (clientDevice && clientDevice.targetProfileId) || null;

    if (this.receiptHashCache.has(contentHash)) {
      const cached = this.receiptHashCache.get(contentHash);
      if (fs.existsSync(cached.absolutePath)) {
        if (this.onSyncEvent) {
          try {
            this.onSyncEvent({
              type: 'mobile-sync',
              action: 'receipt-uploaded',
              filename: cached.filename,
              deduplicated: true,
              profileId: resolvedProfileId,
              device: clientDevice ? clientDevice.deviceName : 'Mobile Companion',
              timestamp: new Date().toISOString()
            });
          } catch (evtErr) {
            console.warn('[SyncServer] onSyncEvent callback warning:', evtErr.message);
          }
        }

        return this._sendJson(res, 200, {
          success: true,
          filename: cached.filename,
          absolutePath: cached.absolutePath,
          deduplicated: true,
          profileId: resolvedProfileId,
          serverTime: new Date().toISOString()
        });
      }
    }

    // Save receipt to local disk via ReceiptStorage
    const saved = this.receiptStorage.saveReceiptBuffer(imageBuffer, extension);
    if (!saved.success) {
      return this._sendJson(res, 500, {
        success: false,
        error: saved.error || 'Failed to persist receipt buffer to disk.',
        code: 'DISK_WRITE_ERROR'
      });
    }

    // Cache content hash for deduplication
    this.receiptHashCache.set(contentHash, {
      filename: saved.filename,
      absolutePath: saved.absolutePath,
      timestamp: Date.now()
    });
    if (this.receiptHashCache.size > 500) {
      const oldestKey = this.receiptHashCache.keys().next().value;
      this.receiptHashCache.delete(oldestKey);
    }

    // BUG-005 Remediation: If manual details are present, create an Expense entry in targeted profile
    let createdExpense = null;
    const draftAmount = jsonBody && jsonBody.draftAmount !== null && jsonBody.draftAmount !== undefined
      ? parseFloat(String(jsonBody.draftAmount))
      : null;
    const draftMerchant = jsonBody && jsonBody.draftMerchant ? String(jsonBody.draftMerchant).trim() : null;

    if (draftAmount !== null || draftMerchant) {
      const targetData = this._getProfileData(clientDevice, explicitProfileId) || {};
      targetData.expenses = targetData.expenses || [];
      createdExpense = {
        id: 'exp-rcpt-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
        title: draftMerchant || 'Receipt Purchase',
        amount: draftAmount !== null && !isNaN(draftAmount) ? draftAmount : 0,
        category: (jsonBody && jsonBody.category) || 'Miscellaneous',
        date: (jsonBody && jsonBody.draftDate) || new Date().toISOString().slice(0, 10),
        notes: (jsonBody && jsonBody.notes) || 'Captured via Ledgerly Mobile Camera',
        receiptFilename: saved.filename,
        paymentMethod: 'UPI / GPay',
        originNodeId: clientDevice ? clientDevice.deviceId : 'mobile',
        version: 1,
        updatedAt: new Date().toISOString(),
        deletedAt: null,
        syncStatus: 'synced'
      };
      targetData.expenses.unshift(createdExpense);
      this._saveProfileData(clientDevice, targetData, explicitProfileId);
    }

    // Option B: If captured without complete manual details, run background OCR
    if (!hasManualDetails && !createdExpense && this.documentIntelligenceService) {
      setTimeout(async () => {
        try {
          const ocrResult = await this.documentIntelligenceService.processDocument(saved.absolutePath);
          if (ocrResult && ocrResult.success && ocrResult.transaction) {
            const tx = ocrResult.transaction;
            const targetDataNow = this._getProfileData(clientDevice, explicitProfileId) || {};
            targetDataNow.expenses = targetDataNow.expenses || [];
            const ocrExpense = {
              id: 'exp-ocr-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
              title: tx.merchant || tx.title || 'Receipt Purchase',
              amount: parseFloat(tx.total || tx.amount) || 0,
              category: tx.category || 'Miscellaneous',
              date: tx.date || new Date().toISOString().slice(0, 10),
              notes: 'Auto-extracted from mobile receipt via OCR',
              receiptFilename: saved.filename,
              paymentMethod: tx.paymentMethod || 'Cash',
              originNodeId: clientDevice ? clientDevice.deviceId : 'mobile',
              version: 1,
              updatedAt: new Date().toISOString(),
              deletedAt: null,
              syncStatus: 'synced'
            };
            targetDataNow.expenses.unshift(ocrExpense);
            this._saveProfileData(clientDevice, targetDataNow, explicitProfileId);
            if (this.onSyncEvent) {
              try {
                this.onSyncEvent({
                  type: 'mobile-sync',
                  action: 'ocr-expense-created',
                  expense: ocrExpense,
                  profileId: resolvedProfileId,
                  device: clientDevice ? clientDevice.deviceName : 'Mobile Companion',
                  timestamp: new Date().toISOString()
                });
              } catch (evtErr) {
                console.warn('[SyncServer] onSyncEvent OCR error:', evtErr.message);
              }
            }
          }
        } catch (ocrErr) {
          console.warn('[SyncServer] Background OCR warning on mobile receipt:', ocrErr.message);
        }
      }, 0);
    }

    if (this.onSyncEvent) {
      try {
        this.onSyncEvent({
          type: 'mobile-sync',
          action: 'receipt-uploaded',
          filename: saved.filename,
          deduplicated: false,
          expense: createdExpense,
          profileId: resolvedProfileId,
          device: clientDevice ? clientDevice.deviceName : 'Mobile Companion',
          timestamp: new Date().toISOString()
        });
      } catch (evtErr) {
        console.warn('[SyncServer] onSyncEvent callback warning:', evtErr.message);
      }
    }

    return this._sendJson(res, 200, {
      success: true,
      filename: saved.filename,
      absolutePath: saved.absolutePath,
      expenseId: createdExpense ? createdExpense.id : null,
      expense: createdExpense,
      profileId: resolvedProfileId,
      deduplicated: false,
      serverTime: new Date().toISOString()
    });
  }

  /**
   * POST /api/v1/unpair
   * Revokes the requesting device's session token.
   */
  _handleUnpair(req, res, clientDevice) {
    this.storage.revokePairedDevice(clientDevice.deviceId);

    return this._sendJson(res, 200, {
      success: true,
      unpaired: true,
      deviceId: clientDevice.deviceId,
      serverTime: new Date().toISOString()
    });
  }
}

module.exports = SyncServer;
