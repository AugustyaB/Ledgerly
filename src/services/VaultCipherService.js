/**
 * ============================================================================
 * Ledgerly — VaultCipherService (Bank-Grade Envelope Encryption Engine)
 * ============================================================================
 *
 * @fileoverview
 * Layer 1 (Data & Persistence) / Section 6 (Security & Vault) service providing
 * 100% offline, zero-knowledge AES-256-GCM envelope encryption at rest with
 * 2-Slot key recovery (Master Password + Emergency Recovery Key) (ADR-014).
 *
 * ARCHITECTURAL PRINCIPLES:
 * - Bank-Grade Cryptography: 256-bit CSPRNG Master Vault Key (Vk), AES-256-GCM
 *   authenticated encryption with 12-byte random IVs and 16-byte authTags.
 * - 2-Slot Lockbox: Slot 1 derived from Master Password/PIN via PBKDF2-HMAC-SHA512
 *   (310,000 iterations, 16-byte salt); Slot 2 derived from 16-char Emergency
 *   Recovery Key (`LEDG-XXXX-XXXX-XXXX-XXXX`).
 * - Zero-Knowledge & Anti-Tampering: Modifying 1 byte of ciphertext causes GCM
 *   authTag verification failure.
 * - RAM Zeroization: Master key buffer is explicitly filled with zeros (`buffer.fill(0)`)
 *   upon session lock or application exit.
 * - Zero External Dependencies: Exclusively utilizes Node.js native `crypto`.
 */

'use strict';

const crypto = require('crypto');

const VAULT_FORMAT = 'ledgerly_vault_v1';
const VAULT_VERSION = 1;
const CIPHER_ALGO = 'aes-256-gcm';
const KDF_ALGO = 'pbkdf2-sha512';
const PBKDF2_ITERATIONS = 310000;
const PBKDF2_KEY_BYTES = 32; // 256 bits
const SALT_BYTES = 16;
const IV_BYTES = 12; // 96 bits for GCM
const AUTH_TAG_BYTES = 16; // 128 bits
const RECOVERY_KEY_PREFIX = 'LEDG';
const RECOVERY_KEY_CHARS = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // Unambiguous Base32 charset

class VaultCipherService {
  /**
   * Initializes VaultCipherService with empty in-memory master key state.
   */
  constructor() {
    /** @private {Buffer|null} 256-bit decrypted master vault key in memory */
    this._masterVaultKey = null;
  }

  // ==========================================================================
  // 1. Key Derivation & Random Generators
  // ==========================================================================

  /**
   * Formats a cryptographically secure 16-character Emergency Recovery Key.
   * Pattern: `LEDG-XXXX-XXXX-XXXX-XXXX`
   *
   * @returns {string} Canonical Emergency Recovery Key.
   */
  generateEmergencyRecoveryKey() {
    const randomBytes = crypto.randomBytes(16);
    let keyChars = '';
    for (let i = 0; i < 16; i++) {
      const idx = randomBytes[i] % RECOVERY_KEY_CHARS.length;
      keyChars += RECOVERY_KEY_CHARS[idx];
    }
    return `${RECOVERY_KEY_PREFIX}-${keyChars.slice(0, 4)}-${keyChars.slice(4, 8)}-${keyChars.slice(8, 12)}-${keyChars.slice(12, 16)}`;
  }

  /**
   * Normalizes an Emergency Recovery Key string for consistent derivation.
   *
   * @param {string} rawKey - User-entered recovery key string.
   * @returns {string} Cleaned, uppercase normalized recovery key.
   */
  normalizeRecoveryKey(rawKey) {
    if (typeof rawKey !== 'string') return '';
    const trimmed = rawKey.trim().toUpperCase();
    const compact = trimmed.replace(/[\s-]+/g, '');
    const match16 = compact.match(/^LEDG([A-Z0-9]{16})$/);
    if (match16) {
      const body = match16[1];
      return `LEDG-${body.slice(0, 4)}-${body.slice(4, 8)}-${body.slice(8, 12)}-${body.slice(12, 16)}`;
    }
    return trimmed.replace(/\s*-\s*/g, '-').replace(/\s+/g, '-');
  }

  /**
   * Derives a 256-bit symmetric key from a secret string using PBKDF2-HMAC-SHA512.
   *
   * @param {string|Buffer} secret - Password, PIN, or Recovery Key.
   * @param {Buffer} salt - 16-byte cryptographic salt.
   * @param {number} [iterations=310000] - PBKDF2 iterations.
   * @returns {Buffer} 32-byte derived key buffer.
   */
  deriveKey(secret, salt, iterations = PBKDF2_ITERATIONS) {
    if (!secret) throw new Error('Secret must not be empty.');
    if (!Buffer.isBuffer(salt) || salt.length < 16) {
      throw new Error('Salt must be a Buffer of at least 16 bytes.');
    }
    return crypto.pbkdf2Sync(secret, salt, iterations, PBKDF2_KEY_BYTES, 'sha512');
  }

  // ==========================================================================
  // 2. AES-256-GCM Primitives
  // ==========================================================================

  /**
   * Encrypts plaintext buffer using AES-256-GCM with a unique 12-byte IV.
   *
   * @param {Buffer|string} plaintext - Data to encrypt.
   * @param {Buffer} key - 32-byte AES-256 key.
   * @returns {{ iv: string, authTag: string, ciphertext: string }} Hex-encoded components.
   */
  encryptGCM(plaintext, key) {
    if (!Buffer.isBuffer(key) || key.length !== PBKDF2_KEY_BYTES) {
      throw new Error('Encryption key must be a 32-byte Buffer.');
    }
    const iv = crypto.randomBytes(IV_BYTES);
    const cipher = crypto.createCipheriv(CIPHER_ALGO, key, iv);
    const plaintextBuf = Buffer.isBuffer(plaintext) ? plaintext : Buffer.from(plaintext, 'utf-8');

    const ciphertext = Buffer.concat([cipher.update(plaintextBuf), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return {
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex'),
      ciphertext: ciphertext.toString('hex')
    };
  }

  /**
   * Decrypts and authenticates AES-256-GCM ciphertext. Throws on tampering.
   *
   * @param {{ iv: string, authTag: string, ciphertext: string }} encryptedData
   * @param {Buffer} key - 32-byte AES-256 key.
   * @returns {Buffer} Decrypted plaintext buffer.
   */
  decryptGCM(encryptedData, key) {
    if (!Buffer.isBuffer(key) || key.length !== PBKDF2_KEY_BYTES) {
      throw new Error('Decryption key must be a 32-byte Buffer.');
    }
    if (!encryptedData || !encryptedData.iv || !encryptedData.authTag || !encryptedData.ciphertext) {
      throw new Error('Invalid encrypted payload structure.');
    }

    const iv = Buffer.from(encryptedData.iv, 'hex');
    const authTag = Buffer.from(encryptedData.authTag, 'hex');
    const ciphertext = Buffer.from(encryptedData.ciphertext, 'hex');

    if (iv.length !== IV_BYTES) {
      throw new Error(`Invalid IV length: expected ${IV_BYTES} bytes.`);
    }
    if (authTag.length !== AUTH_TAG_BYTES) {
      throw new Error(`Invalid authTag length: expected ${AUTH_TAG_BYTES} bytes.`);
    }

    const decipher = crypto.createDecipheriv(CIPHER_ALGO, key, iv);
    decipher.setAuthTag(authTag);

    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  }

  // ==========================================================================
  // 3. 2-Slot Envelope Vault Lifecycle
  // ==========================================================================

  /**
   * Creates a complete AES-256-GCM vault envelope with Slot 1 (Password) and Slot 2 (Recovery Key).
   *
   * @param {object|string} payload - Database payload to encrypt.
   * @param {string} password - Master password / PIN.
   * @param {string} recoveryKey - Emergency recovery key (`LEDG-XXXX-...`).
   * @param {object} [metadata={}] - Unencrypted account metadata header (userId, isConfigured).
   * @returns {object} Canonical vault envelope JSON object.
   */
  createEnvelope(payload, password, recoveryKey, metadata = {}) {
    if (!password || typeof password !== 'string') {
      throw new Error('Master password is required to create vault envelope.');
    }
    if (!recoveryKey || typeof recoveryKey !== 'string') {
      throw new Error('Emergency recovery key is required to create vault envelope.');
    }

    // 1. Generate fresh 256-bit CSPRNG Master Vault Key (Vk)
    const vk = crypto.randomBytes(PBKDF2_KEY_BYTES);

    // 2. Encrypt Vk into Slot 1 (Master Password / PIN)
    const salt1 = crypto.randomBytes(SALT_BYTES);
    const kPass = this.deriveKey(password, salt1);
    const encVk1 = this.encryptGCM(vk, kPass);
    kPass.fill(0); // Zeroize derived password key immediately

    // 3. Encrypt Vk into Slot 2 (Emergency Recovery Key)
    const normRecKey = this.normalizeRecoveryKey(recoveryKey);
    const salt2 = crypto.randomBytes(SALT_BYTES);
    const kRec = this.deriveKey(normRecKey, salt2);
    const encVk2 = this.encryptGCM(vk, kRec);
    kRec.fill(0); // Zeroize derived recovery key immediately

    // 4. Encrypt data payload with Vk
    const payloadStr = typeof payload === 'string' ? payload : JSON.stringify(payload);
    const encPayload = this.encryptGCM(Buffer.from(payloadStr, 'utf-8'), vk);

    // 5. Store active master key in memory
    this.zeroize();
    this._masterVaultKey = Buffer.from(vk);
    vk.fill(0);

    return {
      format: VAULT_FORMAT,
      version: VAULT_VERSION,
      cipher: CIPHER_ALGO,
      kdf: {
        algorithm: KDF_ALGO,
        iterations: PBKDF2_ITERATIONS
      },
      metadata: {
        isConfigured: true,
        createdAt: new Date().toISOString(),
        ...metadata
      },
      slots: {
        slot1: {
          type: 'password',
          salt: salt1.toString('hex'),
          iv: encVk1.iv,
          authTag: encVk1.authTag,
          encryptedKey: encVk1.ciphertext
        },
        slot2: {
          type: 'recovery_key',
          salt: salt2.toString('hex'),
          iv: encVk2.iv,
          authTag: encVk2.authTag,
          encryptedKey: encVk2.ciphertext
        }
      },
      payload: {
        iv: encPayload.iv,
        authTag: encPayload.authTag,
        ciphertext: encPayload.ciphertext
      }
    };
  }

  /**
   * Unlocks the vault using Master Password (Slot 1), caching Vk and decrypting payload.
   *
   * @param {object} envelope - Vault envelope object.
   * @param {string} password - Master password / PIN.
   * @returns {string} Decrypted payload UTF-8 JSON string.
   */
  unlockWithPassword(envelope, password) {
    if (!this.isVaultEnvelope(envelope)) {
      throw new Error('Provided data is not a valid Ledgerly vault envelope.');
    }
    if (!password || typeof password !== 'string') {
      throw new Error('Password must be provided.');
    }

    const slot1 = envelope.slots?.slot1;
    if (!slot1 || !slot1.salt || !slot1.encryptedKey) {
      throw new Error('Vault envelope is missing Slot 1 (Password credentials).');
    }

    const salt = Buffer.from(slot1.salt, 'hex');
    const kPass = this.deriveKey(password, salt, envelope.kdf?.iterations || PBKDF2_ITERATIONS);

    let decryptedVk;
    try {
      decryptedVk = this.decryptGCM(
        {
          iv: slot1.iv,
          authTag: slot1.authTag,
          ciphertext: slot1.encryptedKey
        },
        kPass
      );
    } catch {
      kPass.fill(0);
      throw new Error('Authentication failed: Incorrect master password.');
    } finally {
      kPass.fill(0);
    }

    // Set active in-memory master key
    this.zeroize();
    this._masterVaultKey = decryptedVk;

    // Decrypt and return payload string
    const decryptedPayloadBuf = this.decryptGCM(envelope.payload, this._masterVaultKey);
    return decryptedPayloadBuf.toString('utf-8');
  }

  /**
   * Unlocks the vault using Emergency Recovery Key (Slot 2), caching Vk and decrypting payload.
   *
   * @param {object} envelope - Vault envelope object.
   * @param {string} recoveryKey - Emergency recovery key (`LEDG-XXXX-...`).
   * @returns {string} Decrypted payload UTF-8 JSON string.
   */
  unlockWithRecoveryKey(envelope, recoveryKey) {
    if (!this.isVaultEnvelope(envelope)) {
      throw new Error('Provided data is not a valid Ledgerly vault envelope.');
    }
    if (!recoveryKey || typeof recoveryKey !== 'string') {
      throw new Error('Recovery key must be provided.');
    }

    const slot2 = envelope.slots?.slot2;
    if (!slot2 || !slot2.salt || !slot2.encryptedKey) {
      throw new Error('Vault envelope is missing Slot 2 (Recovery credentials).');
    }

    const normKey = this.normalizeRecoveryKey(recoveryKey);
    const salt = Buffer.from(slot2.salt, 'hex');
    const kRec = this.deriveKey(normKey, salt, envelope.kdf?.iterations || PBKDF2_ITERATIONS);

    let decryptedVk;
    try {
      decryptedVk = this.decryptGCM(
        {
          iv: slot2.iv,
          authTag: slot2.authTag,
          ciphertext: slot2.encryptedKey
        },
        kRec
      );
    } catch {
      kRec.fill(0);
      throw new Error('Authentication failed: Invalid Emergency Recovery Key.');
    } finally {
      kRec.fill(0);
    }

    // Set active in-memory master key
    this.zeroize();
    this._masterVaultKey = decryptedVk;

    const decryptedPayloadBuf = this.decryptGCM(envelope.payload, this._masterVaultKey);
    return decryptedPayloadBuf.toString('utf-8');
  }

  /**
   * Resets the Master Password (Slot 1) using a valid Emergency Recovery Key (Slot 2).
   * Unlocks Slot 2, re-encrypts the existing Master Key into Slot 1 with new password,
   * and preserves existing payload ciphertext.
   *
   * @param {object} envelope - Current vault envelope object.
   * @param {string} recoveryKey - Emergency recovery key.
   * @param {string} newPassword - New master password / PIN.
   * @returns {object} Updated vault envelope object.
   */
  resetPasswordWithRecoveryKey(envelope, recoveryKey, newPassword) {
    if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 4) {
      throw new Error('New password must be at least 4 characters long.');
    }

    // Step 1: Unlock Slot 2 to retrieve Vk
    this.unlockWithRecoveryKey(envelope, recoveryKey);

    // Step 2: Re-derive Slot 1 with new salt and new password
    const newSalt = crypto.randomBytes(SALT_BYTES);
    const kPass = this.deriveKey(newPassword, newSalt, envelope.kdf?.iterations || PBKDF2_ITERATIONS);
    const encVk1 = this.encryptGCM(this._masterVaultKey, kPass);
    kPass.fill(0);

    // Step 3: Update envelope Slot 1
    const updated = {
      ...envelope,
      metadata: {
        ...envelope.metadata,
        passwordResetAt: new Date().toISOString()
      },
      slots: {
        ...envelope.slots,
        slot1: {
          type: 'password',
          salt: newSalt.toString('hex'),
          iv: encVk1.iv,
          authTag: encVk1.authTag,
          encryptedKey: encVk1.ciphertext
        }
      }
    };

    return updated;
  }

  /**
   * Changes Master Password (Slot 1) by verifying current password and re-encrypting Vk with new password.
   *
   * @param {object} envelope - Current vault envelope object.
   * @param {string} currentPassword - Existing master password / PIN.
   * @param {string} newPassword - New master password / PIN.
   * @returns {object} Updated vault envelope object.
   */
  changePasswordWithCurrentPassword(envelope, currentPassword, newPassword) {
    if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 4) {
      throw new Error('New password must be at least 4 characters long.');
    }

    // Step 1: Unlock Slot 1 to retrieve and verify Vk using currentPassword
    this.unlockWithPassword(envelope, currentPassword);

    // Step 2: Re-derive Slot 1 with fresh salt and new password
    const newSalt = crypto.randomBytes(SALT_BYTES);
    const kPass = this.deriveKey(newPassword, newSalt, envelope.kdf?.iterations || PBKDF2_ITERATIONS);
    const encVk1 = this.encryptGCM(this._masterVaultKey, kPass);
    kPass.fill(0);

    // Step 3: Update envelope Slot 1
    const updated = {
      ...envelope,
      metadata: {
        ...envelope.metadata,
        passwordChangedAt: new Date().toISOString()
      },
      slots: {
        ...envelope.slots,
        slot1: {
          type: 'password',
          salt: newSalt.toString('hex'),
          iv: encVk1.iv,
          authTag: encVk1.authTag,
          encryptedKey: encVk1.ciphertext
        }
      }
    };

    return updated;
  }

  /**
   * Re-encrypts Slot 2 (Emergency Recovery Key slot) using the active in-memory Master Key.
   *
   * @param {object} envelope - Active vault envelope object.
   * @param {string} [newRecoveryKey] - Optional new recovery key (auto-generated if omitted).
   * @returns {{ envelope: object, recoveryKey: string }}
   */
  rotateRecoveryKey(envelope, newRecoveryKey = null) {
    if (!this.isUnlocked()) {
      throw new Error('Vault is locked. Master key is not in memory.');
    }
    if (!this.isVaultEnvelope(envelope)) {
      throw new Error('Target envelope is invalid.');
    }

    const rawKey = newRecoveryKey || this.generateEmergencyRecoveryKey();
    const normRec = this.normalizeRecoveryKey(rawKey);
    const newSalt2 = crypto.randomBytes(SALT_BYTES);
    const kRec = this.deriveKey(normRec, newSalt2, envelope.kdf?.iterations || PBKDF2_ITERATIONS);
    const encVk2 = this.encryptGCM(this._masterVaultKey, kRec);
    kRec.fill(0);

    const updated = {
      ...envelope,
      metadata: {
        ...envelope.metadata,
        recoveryKeyRotatedAt: new Date().toISOString()
      },
      slots: {
        ...envelope.slots,
        slot2: {
          type: 'recovery_key',
          salt: newSalt2.toString('hex'),
          iv: encVk2.iv,
          authTag: encVk2.authTag,
          encryptedKey: encVk2.ciphertext
        }
      }
    };

    return { envelope: updated, recoveryKey: normRec };
  }

  /**
   * Re-encrypts an updated payload into an existing vault envelope using the active Master Key.
   *
   * @param {object|string} payload - Updated database payload.
   * @param {object} existingEnvelope - Active envelope to update.
   * @returns {object} Updated envelope with fresh payload IV, authTag, and ciphertext.
   */
  encryptPayload(payload, existingEnvelope) {
    if (!this.isUnlocked()) {
      throw new Error('Vault is locked. Master key is not in memory.');
    }
    if (!this.isVaultEnvelope(existingEnvelope)) {
      throw new Error('Target envelope is invalid.');
    }

    const payloadStr = typeof payload === 'string' ? payload : JSON.stringify(payload);
    const encPayload = this.encryptGCM(Buffer.from(payloadStr, 'utf-8'), this._masterVaultKey);

    return {
      ...existingEnvelope,
      metadata: {
        ...existingEnvelope.metadata,
        updatedAt: new Date().toISOString()
      },
      payload: {
        iv: encPayload.iv,
        authTag: encPayload.authTag,
        ciphertext: encPayload.ciphertext
      }
    };
  }

  /**
   * Decrypts the payload of an envelope using the currently active in-memory master key.
   *
   * @param {object} envelope - Envelope object to decrypt.
   * @returns {string} Decrypted payload UTF-8 JSON string.
   */
  decryptPayload(envelope) {
    if (!this.isUnlocked()) {
      throw new Error('Vault is locked. Master key is not in memory.');
    }
    if (!this.isVaultEnvelope(envelope)) {
      throw new Error('Provided object is not a valid vault envelope.');
    }

    const decrypted = this.decryptGCM(envelope.payload, this._masterVaultKey);
    return decrypted.toString('utf-8');
  }

  // ==========================================================================
  // 4. Memory Zeroization & State Checks
  // ==========================================================================

  /**
   * Evaluates whether a given object or parsed JSON string is a valid Ledgerly vault envelope.
   *
   * @param {any} data
   * @returns {boolean}
   */
  isVaultEnvelope(data) {
    if (!data) return false;
    let parsed = data;
    if (typeof data === 'string') {
      try {
        parsed = JSON.parse(data);
      } catch {
        return false;
      }
    }
    return Boolean(
      parsed &&
        typeof parsed === 'object' &&
        parsed.format === VAULT_FORMAT &&
        parsed.slots?.slot1 &&
        parsed.slots?.slot2 &&
        parsed.payload
    );
  }

  /**
   * Checks whether the vault is currently unlocked and key is present in memory.
   *
   * @returns {boolean}
   */
  isUnlocked() {
    return Boolean(this._masterVaultKey && Buffer.isBuffer(this._masterVaultKey) && this._masterVaultKey.length === PBKDF2_KEY_BYTES);
  }

  /**
   * Zeroizes the master key in RAM (`buffer.fill(0)`) and sets pointer to null.
   * Prevents cold-boot or memory inspection leakage.
   *
   * @returns {void}
   */
  zeroize() {
    if (this._masterVaultKey && Buffer.isBuffer(this._masterVaultKey)) {
      this._masterVaultKey.fill(0);
      this._masterVaultKey = null;
    }
  }

  /**
   * Alias for `zeroize()` to lock the vault.
   *
   * @returns {void}
   */
  lock() {
    this.zeroize();
  }
}

module.exports = VaultCipherService;
