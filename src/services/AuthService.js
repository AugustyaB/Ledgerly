/**
 * ============================================================================
 * Ledgerly — AuthService (Authentication & Security Service)
 * ============================================================================
 *
 * @fileoverview
 * Domain service responsible for user identity, secure credential management,
 * password hashing (PBKDF2-SHA512 with 210K iterations), constant-time verification,
 * brute-force rate limiting, and account preferences.
 *
 * ARCHITECTURAL PRINCIPLES:
 * - Single Responsibility: Handles authentication, session state, and password security.
 * - Encapsulation: Password hashing and attempt counts are kept private to this service.
 * - Dependency Injection: Receives JsonDatabase instance via constructor.
 * - Defense in Depth: Uses crypto.timingSafeEqual to prevent side-channel timing attacks.
 */

'use strict';

const crypto = require('crypto');
const { DEFAULTS } = require('../constants');

/**
 * @class AuthService
 * Manages master account configuration, login validation, session flags, and security rules.
 */
class AuthService {
  /**
   * Initializes the AuthService with an injected database instance.
   *
   * @param {import('./JsonDatabase')} db - The database persistence service.
   */
  constructor(db) {
    if (!db) {
      throw new Error('AuthService requires a valid JsonDatabase instance.');
    }

    /** @private */
    this._db = db;

    /** @private {number} Track consecutive failed authentication attempts */
    this._failedAttempts = 0;

    /** @private {number|null} Timestamp in ms until which login attempts are rejected */
    this._lockoutUntil = null;
  }

  // ==========================================================================
  // 1. Account Status & Query Methods
  // ==========================================================================

  /**
   * Retrieves the current configuration and login state of the master account.
   *
   * @returns {{ isConfigured: boolean, userId: string, rememberMe: boolean, hasProfiles: boolean, activeProfileId: string|null, workspaceMode: string }}
   */
  getStatus() {
    const root = this._db.read();
    return {
      isConfigured: Boolean(root.account?.isConfigured),
      userId: root.account?.userId || '',
      rememberMe: Boolean(root.account?.rememberMe),
      hasProfiles: Array.isArray(root.profiles) && root.profiles.length > 0,
      activeProfileId: root.activeProfileId || null,
      workspaceMode: root.account?.workspaceMode || 'household'
    };
  }

  /**
   * Gets the active workspace view mode ('household' or 'solo').
   *
   * @returns {'household'|'solo'} The active workspace mode.
   */
  getWorkspaceMode() {
    const root = this._db.read();
    return root.account?.workspaceMode || 'household';
  }

  // ==========================================================================
  // 2. Authentication & Account Lifecycle
  // ==========================================================================

  /**
   * Sets up the master account with a user ID and password on initial onboarding.
   * Salts and hashes the password using OWASP-compliant 210,000 PBKDF2 iterations.
   *
   * @param {{ userId?: string, password?: string, rememberMe?: boolean }} payload - Setup details.
   * @returns {import('../types').OperationResult & { account?: { userId: string, rememberMe: boolean, isConfigured: boolean } }}
   */
  setup(payload = {}) {
    const userId = (payload.userId || '').trim();
    const password = payload.password || '';
    const rememberMe = Boolean(payload.rememberMe);

    if (!userId) {
      return { success: false, error: 'User ID or Email is required' };
    }

    if (!password || password.length < DEFAULTS.MIN_PASSWORD_LENGTH) {
      return { success: false, error: `Password must be at least ${DEFAULTS.MIN_PASSWORD_LENGTH} characters` };
    }

    const salt = crypto.randomBytes(DEFAULTS.SALT_BYTES).toString('hex');
    const passwordHash = this._hashPassword(password, salt, DEFAULTS.PBKDF2_ITERATIONS);

    const root = this._db.read();
    root.account = {
      isConfigured: true,
      userId,
      passwordHash,
      salt,
      hashVersion: 2,
      rememberMe,
      lastLoggedIn: new Date().toISOString(),
      workspaceMode: root.account?.workspaceMode || 'household'
    };

    const saveRes = this._db.write(root);
    if (!saveRes.success) {
      return { success: false, error: saveRes.error || 'Failed to save account setup' };
    }

    return {
      success: true,
      account: {
        userId,
        rememberMe,
        isConfigured: true
      }
    };
  }

  /**
   * Authenticates user credentials with rate limiting and timingSafeEqual.
   * Transparently auto-migrates legacy 1,000-iteration hashes to 210,000 iterations upon successful login.
   *
   * @param {{ userId?: string, password?: string, rememberMe?: boolean }} payload - Login details.
   * @returns {import('../types').OperationResult & { account?: { userId: string, rememberMe: boolean, isConfigured: boolean } }}
   */
  login(payload = {}) {
    const now = Date.now();
    if (this._lockoutUntil && now < this._lockoutUntil) {
      const waitSec = Math.ceil((this._lockoutUntil - now) / 1000);
      return { success: false, error: `Too many failed login attempts. Please wait ${waitSec}s.` };
    }

    const userId = (payload.userId || '').trim();
    const password = payload.password || '';
    const rememberMe = Boolean(payload.rememberMe);

    const root = this._db.read();
    if (!root.account?.isConfigured) {
      return { success: false, error: 'No account configured yet. Please sign up.' };
    }

    if (userId.toLowerCase() !== root.account.userId.toLowerCase()) {
      return { success: false, error: 'Invalid User ID or Email' };
    }

    // Determine legacy hash iteration vs modern standard
    const isLegacy = !root.account.hashVersion || root.account.hashVersion < 2;
    const iterations = isLegacy ? 1000 : DEFAULTS.PBKDF2_ITERATIONS;
    const testHash = this._hashPassword(password, root.account.salt, iterations);

    let isMatch;
    try {
      const testBuf = Buffer.from(testHash, 'hex');
      const targetBuf = Buffer.from(root.account.passwordHash, 'hex');
      isMatch = testBuf.length === targetBuf.length && crypto.timingSafeEqual(testBuf, targetBuf);
    } catch {
      isMatch = false;
    }

    if (!isMatch) {
      this._failedAttempts++;
      if (this._failedAttempts >= DEFAULTS.MAX_LOGIN_ATTEMPTS) {
        this._lockoutUntil = Date.now() + DEFAULTS.LOCKOUT_DURATION_MS;
        this._failedAttempts = 0;
        return { success: false, error: 'Too many failed login attempts. Locked for 30 seconds.' };
      }
      return { success: false, error: 'Incorrect Password' };
    }

    // Authentication succeeded: reset lockout state
    this._failedAttempts = 0;
    this._lockoutUntil = null;

    // Transparently auto-migrate legacy password hashes
    if (isLegacy) {
      root.account.passwordHash = this._hashPassword(password, root.account.salt, DEFAULTS.PBKDF2_ITERATIONS);
      root.account.hashVersion = 2;
    }

    root.account.rememberMe = rememberMe;
    root.account.lastLoggedIn = new Date().toISOString();
    this._db.write(root);

    return {
      success: true,
      account: {
        userId: root.account.userId,
        rememberMe: root.account.rememberMe,
        isConfigured: true
      }
    };
  }

  /**
   * Logs out the user by de-authorizing the active session and clearing the rememberMe flag.
   *
   * @returns {import('../types').OperationResult}
   */
  logout() {
    const root = this._db.read();
    if (root.account) {
      root.account.rememberMe = false;
      this._db.write(root);
    }
    return { success: true };
  }

  // ==========================================================================
  // 3. User Preferences & Workspace Mode
  // ==========================================================================

  /**
   * Updates global account preferences such as rememberMe and workspace viewing mode.
   *
   * @param {{ rememberMe?: boolean, workspaceMode?: 'household'|'solo' }} [prefs] - Preferences.
   * @returns {import('../types').OperationResult & { rememberMe?: boolean, workspaceMode?: string }}
   */
  updatePreferences(prefs = {}) {
    const root = this._db.read();
    if (root.account) {
      if (prefs.rememberMe !== undefined) {
        root.account.rememberMe = Boolean(prefs.rememberMe);
      }
      if (prefs.workspaceMode !== undefined) {
        root.account.workspaceMode = prefs.workspaceMode;
      }
      this._db.write(root);
    }

    return {
      success: true,
      rememberMe: root.account?.rememberMe,
      workspaceMode: root.account?.workspaceMode || 'household'
    };
  }

  /**
   * Sets the active workspace mode ('household' or 'solo').
   *
   * @param {'household'|'solo'} mode - The workspace mode to set.
   * @returns {import('../types').OperationResult & { workspaceMode?: string }}
   */
  setWorkspaceMode(mode) {
    return this.updatePreferences({ workspaceMode: mode });
  }

  // ==========================================================================
  // 4. Internal Cryptographic Helpers
  // ==========================================================================

  /**
   * Computes a PBKDF2-SHA512 hash key for a given password and salt.
   *
   * @private
   * @param {string} password - Raw user password.
   * @param {string} salt - Hex salt.
   * @param {number} [iterations=210000] - Hash iterations.
   * @returns {string} Hex-encoded derived password hash.
   */
  _hashPassword(password, salt, iterations = DEFAULTS.PBKDF2_ITERATIONS) {
    return crypto
      .pbkdf2Sync(String(password), String(salt), iterations, DEFAULTS.PBKDF2_KEY_LENGTH, DEFAULTS.PBKDF2_DIGEST)
      .toString('hex');
  }
}

module.exports = AuthService;
