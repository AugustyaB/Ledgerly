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
      return {
        success: false,
        locked: true,
        remainingSeconds: waitSec,
        error: `Too many failed login attempts. Please wait ${waitSec}s.`
      };
    }

    const userId = (payload.userId || '').trim();
    const password = payload.password || '';
    const rememberMe = Boolean(payload.rememberMe);

    // If active ledger is an encrypted vault, authenticate via unlockWithPassword
    if (this._db.isVaultEncrypted()) {
      return this.unlockWithPassword(password, { userId, rememberMe });
    }

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
        const waitSec = Math.ceil(DEFAULTS.LOCKOUT_DURATION_MS / 1000);
        return {
          success: false,
          locked: true,
          remainingSeconds: waitSec,
          error: `Too many failed login attempts. Locked for ${waitSec} seconds. Please wait ${waitSec}s.`
        };
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

    // Auto-migrate legacy unencrypted database to AES-256-GCM vault envelope (ADR-014)
    const recoveryKey = this.generateEmergencyRecoveryKey();
    const upgradeRes = this._db.upgradeToVault(
      password,
      recoveryKey,
      {
        userId: root.account.userId,
        rememberMe: root.account.rememberMe,
        workspaceMode: root.account.workspaceMode || 'household'
      },
      root
    );

    if (!upgradeRes.success) {
      this._db.write(root);
    }

    return {
      success: true,
      migratedToVault: Boolean(upgradeRes.success),
      recoveryKey: upgradeRes.success ? recoveryKey : undefined,
      account: {
        userId: root.account.userId,
        rememberMe: root.account.rememberMe,
        isConfigured: true
      }
    };
  }

  /**
   * Generates a cryptographically secure 16-character Emergency Recovery Key (`LEDG-XXXX-XXXX-XXXX-XXXX`).
   *
   * @returns {string} Formatted Emergency Recovery Key.
   */
  generateEmergencyRecoveryKey() {
    return this._db.vaultCipher.generateEmergencyRecoveryKey();
  }

  /**
   * Sets up a bank-grade AES-256-GCM encrypted vault on disk with 2-slot recovery (ADR-014).
   *
   * @param {{ userId?: string, password?: string, rememberMe?: boolean, recoveryKey?: string }} payload
   * @returns {import('../types').OperationResult & { recoveryKey?: string, account?: object }}
   */
  setupVault(payload = {}) {
    const userId = (payload.userId || '').trim();
    const password = payload.password || '';
    const rememberMe = Boolean(payload.rememberMe);
    const recoveryKey = payload.recoveryKey || this.generateEmergencyRecoveryKey();

    if (!userId) {
      return { success: false, error: 'User ID or Email is required.' };
    }

    if (!password || password.length < DEFAULTS.MIN_PASSWORD_LENGTH) {
      return { success: false, error: `Password must be at least ${DEFAULTS.MIN_PASSWORD_LENGTH} characters.` };
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

    const upgradeRes = this._db.upgradeToVault(
      password,
      recoveryKey,
      {
        userId,
        rememberMe,
        workspaceMode: root.account.workspaceMode
      },
      root
    );

    if (!upgradeRes.success) {
      return { success: false, error: upgradeRes.error || 'Failed to initialize encrypted vault.' };
    }

    return {
      success: true,
      recoveryKey,
      account: {
        userId,
        rememberMe,
        isConfigured: true
      }
    };
  }

  /**
   * Unlocks the encrypted vault using Master Password / PIN (Slot 1).
   *
   * @param {string} password - Master password / PIN.
   * @param {object} [options={}] - Optional credentials or rememberMe preferences.
   * @returns {import('../types').OperationResult & { account?: object }}
   */
  unlockWithPassword(password, options = {}) {
    const now = Date.now();
    if (this._lockoutUntil && now < this._lockoutUntil) {
      const waitSec = Math.ceil((this._lockoutUntil - now) / 1000);
      return {
        success: false,
        locked: true,
        remainingSeconds: waitSec,
        error: `Too many failed login attempts. Please wait ${waitSec}s.`
      };
    }

    if (!password) {
      return { success: false, error: 'Password is required.' };
    }

    if (this._db.isVaultEncrypted()) {
      const unlockRes = this._db.unlockVaultWithPassword(password);
      if (!unlockRes.success) {
        this._failedAttempts++;
        if (this._failedAttempts >= DEFAULTS.MAX_LOGIN_ATTEMPTS) {
          this._lockoutUntil = Date.now() + DEFAULTS.LOCKOUT_DURATION_MS;
          this._failedAttempts = 0;
          const waitSec = Math.ceil(DEFAULTS.LOCKOUT_DURATION_MS / 1000);
          return {
            success: false,
            locked: true,
            remainingSeconds: waitSec,
            error: `Too many failed login attempts. Locked for ${waitSec} seconds. Please wait ${waitSec}s.`
          };
        }
        return { success: false, error: 'Incorrect Password' };
      }

      this._failedAttempts = 0;
      this._lockoutUntil = null;
      const root = unlockRes.root || this._db.read();
      if (options.rememberMe !== undefined && root.account) {
        root.account.rememberMe = Boolean(options.rememberMe);
        root.account.lastLoggedIn = new Date().toISOString();
        this._db.write(root);
      }

      return {
        success: true,
        account: {
          userId: root.account?.userId || options.userId || '',
          rememberMe: Boolean(root.account?.rememberMe),
          isConfigured: true
        }
      };
    }

    return this.login({ password, ...options });
  }

  /**
   * Unlocks the encrypted vault using Emergency Recovery Key (Slot 2).
   *
   * @param {string} recoveryKey - Emergency recovery key (`LEDG-XXXX-...`).
   * @returns {import('../types').OperationResult & { account?: object }}
   */
  unlockWithRecoveryKey(recoveryKey) {
    const now = Date.now();
    if (this._lockoutUntil && now < this._lockoutUntil) {
      const waitSec = Math.ceil((this._lockoutUntil - now) / 1000);
      return {
        success: false,
        locked: true,
        remainingSeconds: waitSec,
        error: `Too many failed attempts. Please wait ${waitSec}s.`
      };
    }

    if (!recoveryKey || typeof recoveryKey !== 'string') {
      return { success: false, error: 'Emergency Recovery Key is required.' };
    }

    if (this._db.isVaultEncrypted()) {
      const unlockRes = this._db.unlockVaultWithRecoveryKey(recoveryKey);
      if (!unlockRes.success) {
        this._failedAttempts++;
        if (this._failedAttempts >= DEFAULTS.MAX_LOGIN_ATTEMPTS) {
          this._lockoutUntil = Date.now() + DEFAULTS.LOCKOUT_DURATION_MS;
          this._failedAttempts = 0;
          const waitSec = Math.ceil(DEFAULTS.LOCKOUT_DURATION_MS / 1000);
          return {
            success: false,
            locked: true,
            remainingSeconds: waitSec,
            error: `Too many failed recovery attempts. Locked for ${waitSec} seconds. Please wait ${waitSec}s.`
          };
        }
        return { success: false, error: 'Invalid Emergency Recovery Key' };
      }

      this._failedAttempts = 0;
      this._lockoutUntil = null;
      const root = unlockRes.root || this._db.read();

      return {
        success: true,
        account: {
          userId: root.account?.userId || '',
          rememberMe: Boolean(root.account?.rememberMe),
          isConfigured: true
        }
      };
    }

    return { success: false, error: 'Database is not an encrypted vault.' };
  }

  /**
   * Resets master password using valid recovery key (Slot 2 -> Slot 1 re-encryption).
   * Zeroizes in-memory keys upon completion.
   *
   * @param {string} recoveryKey - Emergency recovery key.
   * @param {string} newPassword - New master password / PIN.
   * @returns {import('../types').OperationResult}
   */
  resetPasswordWithRecoveryKey(recoveryKey, newPassword) {
    if (!recoveryKey || typeof recoveryKey !== 'string') {
      return { success: false, error: 'Emergency Recovery Key is required.' };
    }
    if (!newPassword || newPassword.length < DEFAULTS.MIN_PASSWORD_LENGTH) {
      return { success: false, error: `New password must be at least ${DEFAULTS.MIN_PASSWORD_LENGTH} characters.` };
    }

    if (this._db.isVaultEncrypted()) {
      const res = this._db.resetVaultPasswordWithRecoveryKey(recoveryKey, newPassword);
      if (!res.success) {
        return { success: false, error: res.error || 'Failed to reset password with recovery key.' };
      }

      // Re-hash password for account record in decrypted root if unlocked
      const salt = crypto.randomBytes(DEFAULTS.SALT_BYTES).toString('hex');
      const passwordHash = this._hashPassword(newPassword, salt, DEFAULTS.PBKDF2_ITERATIONS);
      const root = this._db.read();
      if (root.account) {
        root.account.passwordHash = passwordHash;
        root.account.salt = salt;
        root.account.hashVersion = 2;
        this._db.write(root);
      }

      // Zeroize master key in RAM after password reset
      this._db.lockVault();

      return { success: true, message: 'Master password has been reset successfully.' };
    }

    return { success: false, error: 'Database is not an encrypted vault.' };
  }

  /**
   * Changes master password for the active authenticated account.
   * Updates Slot 1 encryption and account record password hash.
   *
   * @param {string} currentPassword - Current master password / PIN.
   * @param {string} newPassword - New master password / PIN.
   * @returns {import('../types').OperationResult}
   */
  changePassword(currentPassword, newPassword) {
    if (!currentPassword || typeof currentPassword !== 'string') {
      return { success: false, error: 'Current password is required.' };
    }
    if (!newPassword || typeof newPassword !== 'string' || newPassword.length < DEFAULTS.MIN_PASSWORD_LENGTH) {
      return { success: false, error: `New password must be at least ${DEFAULTS.MIN_PASSWORD_LENGTH} characters.` };
    }

    if (this._db.isVaultEncrypted()) {
      const res = this._db.changeVaultPassword(currentPassword, newPassword);
      if (!res.success) {
        return { success: false, error: res.error || 'Failed to change master password.' };
      }

      // Re-hash password for account record in decrypted root
      const salt = crypto.randomBytes(DEFAULTS.SALT_BYTES).toString('hex');
      const passwordHash = this._hashPassword(newPassword, salt, DEFAULTS.PBKDF2_ITERATIONS);
      const root = this._db.read();
      if (root.account) {
        root.account.passwordHash = passwordHash;
        root.account.salt = salt;
        root.account.hashVersion = 2;
        this._db.write(root);
      }

      return { success: true, message: 'Master password changed successfully.' };
    }

    // Legacy unencrypted mode fallback
    const root = this._db.read();
    if (!root.account?.isConfigured) {
      return { success: false, error: 'No account configured.' };
    }

    const isLegacy = !root.account.hashVersion || root.account.hashVersion < 2;
    const iterations = isLegacy ? 1000 : DEFAULTS.PBKDF2_ITERATIONS;
    const testHash = this._hashPassword(currentPassword, root.account.salt, iterations);
    let isMatch;
    try {
      const testBuf = Buffer.from(testHash, 'hex');
      const targetBuf = Buffer.from(root.account.passwordHash, 'hex');
      isMatch = testBuf.length === targetBuf.length && crypto.timingSafeEqual(testBuf, targetBuf);
    } catch {
      isMatch = false;
    }

    if (!isMatch) {
      return { success: false, error: 'Incorrect current password.' };
    }

    const salt = crypto.randomBytes(DEFAULTS.SALT_BYTES).toString('hex');
    const passwordHash = this._hashPassword(newPassword, salt, DEFAULTS.PBKDF2_ITERATIONS);
    root.account.passwordHash = passwordHash;
    root.account.salt = salt;
    root.account.hashVersion = 2;
    this._db.write(root);

    return { success: true, message: 'Password changed successfully.' };
  }

  /**
   * Logs out the user by de-authorizing active session, clearing rememberMe, and zeroizing vault keys.
   *
   * @returns {import('../types').OperationResult}
   */
  logout() {
    const root = this._db.read();
    if (root.account) {
      root.account.rememberMe = false;
      this._db.write(root);
    }
    this._db.lockVault();
    return { success: true };
  }

  /**
   * Performs a destructive factory reset of the local encrypted vault.
   * Clears in-memory keys, wipes active storage file, and resets to an unconfigured initial state.
   *
   * @returns {import('../types').OperationResult}
   */
  factoryResetVault() {
    this._db.lockVault();
    const defaultSchema = this._db._createDefaultRootSchema();
    defaultSchema.account = {
      isConfigured: false,
      userId: '',
      passwordHash: '',
      salt: '',
      rememberMe: false,
      lastLoggedIn: null
    };
    this._db._activeEnvelope = null;
    this._db._unlockedRoot = defaultSchema;
    this._failedAttempts = 0;
    this._lockoutUntil = null;
    const writeRes = this._db._atomicWrite(this._db.activeFilePath, JSON.stringify(defaultSchema, null, 2));
    if (!writeRes.success) return writeRes;
    return { success: true, message: 'Vault has been factory reset to clean initial state.' };
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
