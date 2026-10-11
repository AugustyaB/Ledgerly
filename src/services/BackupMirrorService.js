/**
 * ============================================================================
 * Ledgerly — BackupMirrorService (Continuous Mirroring & Local Backup Vault)
 * ============================================================================
 *
 * @fileoverview
 * Domain service providing continuous background mirroring of partitioned storage
 * (active_ledger.json, legacy_archive.json, and expenses_config.json) to a user-selected
 * local directory, USB flash drive, external HDD, or cloud-synced folder (Dropbox, OneDrive,
 * Nextcloud, Synology).
 *
 * ARCHITECTURAL PRINCIPLES:
 * - Single Responsibility: Encapsulates all continuous backup mirroring and vault recovery.
 * - Fault Tolerance: Gracefully handles disconnected drives/folders without throwing.
 * - Cryptographic Integrity: Computes SHA-256 manifests (mirror_manifest.json) to guarantee
 *   tamper-evident and corruption-free backups.
 * - Zero Disk Thrashing: Debounces rapid mutations (2000ms window) during batch/spreadsheet edits.
 * - Zero Data Loss: Always creates pre-restore snapshots (.pre-restore.bak) before applying restores.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class BackupMirrorService {
  /**
   * Initializes the BackupMirrorService.
   *
   * @param {object} options
   * @param {import('./JsonDatabase')} options.db - JsonDatabase persistence service.
   * @param {string} [options.configPath] - Explicit path to expenses_config.json.
   * @param {Function} [options.onStatusChange] - Status update callback listener.
   */
  constructor({ db, configPath, onStatusChange } = {}) {
    if (!db) {
      throw new Error('BackupMirrorService requires a valid JsonDatabase instance.');
    }

    /** @private */
    this._db = db;

    /** @private */
    this._onStatusChange = typeof onStatusChange === 'function' ? onStatusChange : () => {};

    /** @private */
    const baseDir = typeof db.dataDir === 'string' ? path.dirname(db.dataDir) : path.dirname(db.getFilePath());
    this._configPath = configPath || path.join(baseDir, 'expenses_config.json');

    /** @private */
    this._debounceTimer = null;

    /** @private */
    this._isSyncing = false;

    /** @private */
    this._config = this._loadConfig();

    /** @private */
    this._status = {
      lastStatus: this._config.backupMirror?.lastStatus || 'idle',
      lastError: this._config.backupMirror?.lastError || null,
      lastMirroredAt: this._config.backupMirror?.lastMirroredAt || null
    };
  }

  // ==========================================================================
  // 1. Configuration & Status Methods
  // ==========================================================================

  /**
   * Retrieves the current configuration and operational status of the backup mirror.
   *
   * @returns {object} Status object.
   */
  getStatus() {
    const mirrorCfg = this._config.backupMirror || {};
    const connected = this.isTargetConnected();
    const manifestStats = this.getVaultStats();

    return {
      enabled: Boolean(mirrorCfg.enabled),
      targetDir: mirrorCfg.targetDir || null,
      debounceMs: mirrorCfg.debounceMs || 2000,
      lastMirroredAt: this._status.lastMirroredAt || mirrorCfg.lastMirroredAt || null,
      lastSyncTime: this._status.lastMirroredAt || mirrorCfg.lastMirroredAt || null,
      lastStatus:
        this._status.lastStatus === 'error'
          ? 'error'
          : connected
            ? this._status.lastStatus
            : mirrorCfg.enabled
              ? 'disconnected'
              : 'idle',
      lastError: this._status.lastError || mirrorCfg.lastError || null,
      connected,
      manifestStats
    };
  }

  /**
   * Checks if the configured target directory exists and has read/write permissions.
   *
   * @returns {boolean} True if accessible, false if disconnected or missing.
   */
  isTargetConnected() {
    const targetDir = this._config.backupMirror?.targetDir;
    if (!targetDir || typeof targetDir !== 'string') return false;

    try {
      if (!fs.existsSync(targetDir)) return false;
      fs.accessSync(targetDir, fs.constants.R_OK | fs.constants.W_OK);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Reads telemetry and health stats from mirror_manifest.json in the target vault.
   *
   * @returns {object|null} Manifest stats or null if unavailable.
   */
  getVaultStats() {
    const targetDir = this._config.backupMirror?.targetDir;
    if (!targetDir || !this.isTargetConnected()) return null;

    try {
      const manifestPath = path.join(targetDir, 'mirror_manifest.json');
      if (fs.existsSync(manifestPath)) {
        return JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      }
    } catch {
      // Best-effort
    }
    return null;
  }

  /**
   * Configures mirror target folder, enabled state, and debounce interval.
   *
   * @param {object} payload
   * @param {boolean} [payload.enabled]
   * @param {string} [payload.targetDir]
   * @param {number} [payload.debounceMs]
   * @returns {{ success: boolean, status: object, error?: string }}
   */
  configure(payload = {}) {
    try {
      if (!this._config.backupMirror) {
        this._config.backupMirror = this._getDefaultMirrorConfig();
      }

      if (payload.enabled !== undefined) {
        this._config.backupMirror.enabled = Boolean(payload.enabled);
      }

      if (payload.targetDir !== undefined) {
        const trimmed = String(payload.targetDir).trim();

        if (trimmed) {
          const resolvedTarget = path.resolve(trimmed);
          const forbiddenPaths = [
            this._db.dataDir ? path.resolve(this._db.dataDir) : null,
            this._db.getFilePath() ? path.resolve(path.dirname(this._db.getFilePath())) : null,
            this._configPath ? path.resolve(path.dirname(this._configPath)) : null
          ].filter(Boolean);

          if (forbiddenPaths.some(fp => resolvedTarget === fp)) {
            this._status.lastStatus = 'error';
            this._status.lastError = 'Target vault directory cannot be the application internal data directory.';
            return { success: false, status: this.getStatus(), error: this._status.lastError };
          }
        }

        this._config.backupMirror.targetDir = trimmed;

        // Auto-create directory if enabled and missing
        if (this._config.backupMirror.enabled && trimmed && !fs.existsSync(trimmed)) {
          try {
            fs.mkdirSync(trimmed, { recursive: true });
          } catch (mkdirErr) {
            this._status.lastStatus = 'disconnected';
            this._status.lastError = `Target directory cannot be created: ${mkdirErr.message}`;
            this._saveConfig(this._config);
            return { success: false, status: this.getStatus(), error: this._status.lastError };
          }
        }
      }

      if (payload.debounceMs !== undefined) {
        const ms = Number(payload.debounceMs);
        if (!isNaN(ms) && ms >= 200 && ms <= 60000) {
          this._config.backupMirror.debounceMs = ms;
        }
      }

      this._saveConfig(this._config);

      // If enabled and connected, trigger initial sync
      if (this._config.backupMirror.enabled && this.isTargetConnected()) {
        this.syncNow();
      } else if (!this._config.backupMirror.enabled) {
        this._status.lastStatus = 'idle';
        this._status.lastError = null;
        this._notifyStatus();
      }

      return { success: true, status: this.getStatus(), config: this.getStatus() };
    } catch (err) {
      console.error('[BackupMirrorService] Failed to configure:', err);
      return { success: false, error: err.message, status: this.getStatus() };
    }
  }

  // ==========================================================================
  // 2. Debounced Change Notification & Background Synchronization
  // ==========================================================================

  /**
   * Schedules a debounced background mirror pass.
   * Triggered automatically whenever local transactions are added, edited, or deleted.
   *
   * @returns {void}
   */
  notifyChange() {
    if (!this._config.backupMirror?.enabled) return;
    if (!this._config.backupMirror?.targetDir) return;

    const delay = this._config.backupMirror.debounceMs || 2000;

    if (this._debounceTimer) {
      clearTimeout(this._debounceTimer);
    }

    this._debounceTimer = setTimeout(() => {
      this._debounceTimer = null;
      this.syncNow().catch(err => {
        console.warn('[BackupMirrorService] Background sync error:', err.message);
      });
    }, delay);
  }

  /**
   * Cancels any pending debounced sync timers.
   *
   * @returns {void}
   */
  cancelPendingSync() {
    if (this._debounceTimer) {
      clearTimeout(this._debounceTimer);
      this._debounceTimer = null;
    }
  }

  /**
   * Executes an immediate mirroring pass from live database files to the target vault.
   *
   * @returns {Promise<{ success: boolean, reason?: string, error?: string, manifest?: object }>}
   */
  async syncNow() {
    this.cancelPendingSync();

    const mirrorCfg = this._config.backupMirror || {};
    if (!mirrorCfg.enabled) {
      return { success: false, reason: 'disabled' };
    }

    const targetDir = mirrorCfg.targetDir;
    if (!targetDir) {
      return { success: false, reason: 'no_target' };
    }

    // Check drive connection
    if (!this.isTargetConnected()) {
      this._status.lastStatus = 'disconnected';
      this._status.lastError = 'Target directory or drive is not accessible (disconnected)';
      this._notifyStatus();
      return { success: false, reason: 'disconnected', status: 'disconnected', error: this._status.lastError };
    }

    if (this._isSyncing) {
      return { success: false, reason: 'in_progress' };
    }

    this._isSyncing = true;
    this._status.lastStatus = 'syncing';
    this._status.lastError = null;
    this._notifyStatus();

    try {
      const activeFilePath = typeof this._db.getActiveFilePath === 'function' ? this._db.getActiveFilePath() : this._db.getFilePath();
      const archiveFilePath = typeof this._db.getArchiveFilePath === 'function' ? this._db.getArchiveFilePath() : null;

      // 1. Ensure config file exists live before copying
      this._saveConfig(this._config);

      const filesToMirror = [];
      if (activeFilePath && fs.existsSync(activeFilePath)) {
        filesToMirror.push({ src: activeFilePath, name: 'active_ledger.json' });
      }
      if (archiveFilePath && fs.existsSync(archiveFilePath)) {
        filesToMirror.push({ src: archiveFilePath, name: 'legacy_archive.json' });
      }
      if (fs.existsSync(this._configPath)) {
        filesToMirror.push({ src: this._configPath, name: 'expenses_config.json' });
      }

      const fileManifests = {};

      // 2. Atomically copy each file into the vault and compute SHA-256
      for (const item of filesToMirror) {
        const destPath = path.join(targetDir, item.name);
        const copyMeta = this._atomicCopyAndHash(item.src, destPath);
        fileManifests[item.name] = {
          relativePath: item.name,
          sha256: copyMeta.sha256,
          sizeBytes: copyMeta.sizeBytes
        };
      }

      // 3. Count live records for row-count invariant verification
      let activeExpensesCount = 0;
      let archivedExpensesCount = 0;
      let schemaVersion = 2;
      let activeProfileId = 'prof-default';

      try {
        const root = this._db.read();
        schemaVersion = root.schemaVersion || 2;
        activeProfileId = root.activeProfileId || 'prof-default';
        if (Array.isArray(root.profiles)) {
          for (const p of root.profiles) {
            if (p && p.data && Array.isArray(p.data.expenses)) {
              activeExpensesCount += p.data.expenses.length;
            }
          }
        }
      } catch {
        // Fallback
      }

      try {
        if (typeof this._db.readArchive === 'function') {
          const archive = this._db.readArchive();
          if (archive && archive.profiles) {
            for (const list of Object.values(archive.profiles)) {
              if (Array.isArray(list)) {
                archivedExpensesCount += list.length;
              }
            }
          }
        }
      } catch {
        // Fallback
      }

      // 4. Construct and write mirror_manifest.json
      const timestamp = new Date().toISOString();
      const manifest = {
        manifestVersion: 1,
        version: 1,
        appVersion: '0.7.3',
        generatedAt: timestamp,
        sourceDatabase: {
          schemaVersion,
          activeProfileId,
          totalActiveExpenses: activeExpensesCount,
          totalArchivedExpenses: archivedExpensesCount,
          totalExpenses: activeExpensesCount + archivedExpensesCount
        },
        files: fileManifests
      };

      const manifestPath = path.join(targetDir, 'mirror_manifest.json');
      const manifestSerialized = JSON.stringify(manifest, null, 2);
      this._atomicWriteString(manifestPath, manifestSerialized);

      // 5. Update service and persistent state
      this._status.lastStatus = 'success';
      this._status.lastMirroredAt = timestamp;
      this._status.lastError = null;

      this._config.backupMirror.lastMirroredAt = timestamp;
      this._config.backupMirror.lastStatus = 'success';
      this._config.backupMirror.lastError = null;
      this._saveConfig(this._config);

      this._isSyncing = false;
      this._notifyStatus();

      return { success: true, status: 'success', timestamp, manifest };
    } catch (err) {
      console.error('[BackupMirrorService] Mirror sync failed:', err);
      this._status.lastStatus = 'error';
      this._status.lastError = err.message;
      this._isSyncing = false;
      this._notifyStatus();
      return { success: false, status: 'error', error: err.message };
    }
  }

  // ==========================================================================
  // 3. Vault Integrity Audit & 1-Click Restore
  // ==========================================================================

  /**
   * Inspects a vault directory, validates manifest syntax, and verifies cryptographic SHA-256 hashes.
   *
   * @param {string} [vaultDir] - Target vault folder to audit (defaults to configured targetDir).
   * @returns {{ valid: boolean, manifest: object|null, errors: string[], fileCounts: object }}
   */
  verifyVault(vaultDir) {
    const dir = vaultDir || this._config.backupMirror?.targetDir;
    const errors = [];

    if (!dir || typeof dir !== 'string') {
      return { valid: false, manifest: null, errors: ['Vault directory is not specified.'], fileCounts: {} };
    }

    if (!fs.existsSync(dir)) {
      return { valid: false, manifest: null, errors: [`Vault directory does not exist: ${dir}`], fileCounts: {} };
    }

    const manifestPath = path.join(dir, 'mirror_manifest.json');
    if (!fs.existsSync(manifestPath)) {
      return { valid: false, manifest: null, errors: ['Missing mirror_manifest.json in vault directory.'], fileCounts: {} };
    }

    let manifest;
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    } catch (jsonErr) {
      return { valid: false, manifest: null, errors: [`Corrupt mirror_manifest.json: ${jsonErr.message}`], fileCounts: {} };
    }

    if (!manifest || typeof manifest !== 'object' || !manifest.files) {
      return { valid: false, manifest: null, errors: ['Invalid manifest schema (missing files declaration).'], fileCounts: {} };
    }

    // Verify SHA-256 checksums
    for (const [fileName, fileInfo] of Object.entries(manifest.files)) {
      const filePath = path.join(dir, fileName);
      if (!fs.existsSync(filePath)) {
        errors.push(`Missing mirrored file: ${fileName}`);
        continue;
      }

      const calculatedHash = this._calculateSha256(filePath);
      if (calculatedHash !== fileInfo.sha256) {
        errors.push(`Cryptographic checksum mismatch for ${fileName}: expected ${fileInfo.sha256}, got ${calculatedHash}`);
      }
    }

    return {
      valid: errors.length === 0,
      manifest,
      errors,
      fileCounts: manifest.sourceDatabase || {}
    };
  }

  /**
   * Restores live database from a verified vault directory.
   * Always takes a safety .pre-restore.bak snapshot before overwriting live storage.
   *
   * @param {string} [vaultDir] - Vault directory to restore from (defaults to configured targetDir).
   * @returns {{ success: boolean, error?: string, errors?: string[], restoredAt?: string, totalExpenses?: number }}
   */
  restoreFromVault(vaultDir) {
    const dir = vaultDir || this._config.backupMirror?.targetDir;
    const verification = this.verifyVault(dir);

    if (!verification.valid) {
      return {
        success: false,
        error: 'Vault integrity verification failed. Restore aborted to prevent data corruption.',
        errors: verification.errors
      };
    }

    let activeFilePath = null;
    let archiveFilePath = null;

    try {
      activeFilePath = typeof this._db.getActiveFilePath === 'function' ? this._db.getActiveFilePath() : this._db.getFilePath();
      archiveFilePath = typeof this._db.getArchiveFilePath === 'function' ? this._db.getArchiveFilePath() : null;

      // Step 1: Snapshot live files to .pre-restore.bak
      if (activeFilePath && fs.existsSync(activeFilePath)) {
        fs.copyFileSync(activeFilePath, `${activeFilePath}.pre-restore.bak`);
      }
      if (archiveFilePath && fs.existsSync(archiveFilePath)) {
        fs.copyFileSync(archiveFilePath, `${archiveFilePath}.pre-restore.bak`);
      }
      if (fs.existsSync(this._configPath)) {
        fs.copyFileSync(this._configPath, `${this._configPath}.pre-restore.bak`);
      }

      // Step 2: Copy vault files to live destinations
      const vaultActive = path.join(dir, 'active_ledger.json');
      const vaultArchive = path.join(dir, 'legacy_archive.json');
      const vaultConfig = path.join(dir, 'expenses_config.json');

      if (fs.existsSync(vaultActive) && activeFilePath) {
        fs.copyFileSync(vaultActive, activeFilePath);
      }
      if (fs.existsSync(vaultArchive) && archiveFilePath) {
        fs.copyFileSync(vaultArchive, archiveFilePath);
      }
      if (fs.existsSync(vaultConfig) && this._configPath) {
        fs.copyFileSync(vaultConfig, this._configPath);
        this._config = this._loadConfig();
      }

      // Step 3: Verify restored state and row-count invariant
      const restoredActive = this._db.read();
      let restoredActiveCount = 0;
      let restoredArchivedCount = 0;

      if (Array.isArray(restoredActive.profiles)) {
        for (const p of restoredActive.profiles) {
          if (p && p.data && Array.isArray(p.data.expenses)) {
            restoredActiveCount += p.data.expenses.length;
          }
        }
      }

      if (typeof this._db.readArchive === 'function') {
        const restoredArchive = this._db.readArchive();
        if (restoredArchive && restoredArchive.profiles) {
          for (const list of Object.values(restoredArchive.profiles)) {
            if (Array.isArray(list)) {
              restoredArchivedCount += list.length;
            }
          }
        }
      }

      const expectedTotal = verification.manifest.sourceDatabase?.totalExpenses;
      if (expectedTotal !== undefined && (restoredActiveCount + restoredArchivedCount) !== expectedTotal) {
        throw new Error(
          `Restored row count mismatch: restored (${restoredActiveCount + restoredArchivedCount}) !== manifest (${expectedTotal})`
        );
      }

      const timestamp = new Date().toISOString();
      return {
        success: true,
        restoredAt: timestamp,
        restoredExpenses: restoredActiveCount + restoredArchivedCount,
        totalExpenses: restoredActiveCount + restoredArchivedCount
      };
    } catch (restoreErr) {
      console.error('[BackupMirrorService] Restore failed, rolling back to .pre-restore.bak:', restoreErr);
      this._rollbackFromPreRestoreBak(activeFilePath, archiveFilePath);
      return {
        success: false,
        error: `Restore failed: ${restoreErr.message}`,
        rolledBack: true
      };
    }
  }

  /**
   * Emergency rollback restoring live database files from .pre-restore.bak snapshots.
   *
   * @private
   * @param {string} [activeFilePath]
   * @param {string} [archiveFilePath]
   * @returns {void}
   */
  _rollbackFromPreRestoreBak(activeFilePath, archiveFilePath) {
    try {
      if (activeFilePath && fs.existsSync(`${activeFilePath}.pre-restore.bak`)) {
        fs.copyFileSync(`${activeFilePath}.pre-restore.bak`, activeFilePath);
      }
      if (archiveFilePath && fs.existsSync(`${archiveFilePath}.pre-restore.bak`)) {
        fs.copyFileSync(`${archiveFilePath}.pre-restore.bak`, archiveFilePath);
      }
      if (this._configPath && fs.existsSync(`${this._configPath}.pre-restore.bak`)) {
        fs.copyFileSync(`${this._configPath}.pre-restore.bak`, this._configPath);
        this._config = this._loadConfig();
      }
    } catch (rollbackErr) {
      console.error('[BackupMirrorService] Emergency rollback error:', rollbackErr);
    }
  }

  // ==========================================================================
  // 4. Internal Helpers & File Utilities
  // ==========================================================================

  /**
   * Computes the SHA-256 hexadecimal digest for a file.
   *
   * @private
   * @param {string} filePath - Absolute path to file.
   * @returns {string} SHA-256 hash string.
   */
  _calculateSha256(filePath) {
    const data = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Copies a file to a destination atomically using .tmp and returns SHA-256 checksum and size.
   *
   * @private
   * @param {string} srcPath - Source file path.
   * @param {string} destPath - Destination file path.
   * @returns {{ sha256: string, sizeBytes: number }}
   */
  _atomicCopyAndHash(srcPath, destPath) {
    const tempDest = `${destPath}.tmp`;
    const buffer = fs.readFileSync(srcPath);
    const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');

    fs.writeFileSync(tempDest, buffer);

    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        fs.renameSync(tempDest, destPath);
        break;
      } catch (renameErr) {
        if (attempt === 4 || (renameErr.code !== 'EPERM' && renameErr.code !== 'EBUSY')) {
          fs.copyFileSync(tempDest, destPath);
          try {
            fs.unlinkSync(tempDest);
          } catch {
            // Best effort
          }
          break;
        }
        // Micro-wait for Windows filesystem lock
        const start = Date.now();
        while (Date.now() - start < 10) {
          // wait
        }
      }
    }

    return { sha256, sizeBytes: buffer.length };
  }

  /**
   * Writes string content to a destination atomically using .tmp rename.
   *
   * @private
   * @param {string} destPath - Destination file path.
   * @param {string} content - Serialized string content.
   * @returns {void}
   */
  _atomicWriteString(destPath, content) {
    const tempDest = `${destPath}.tmp`;
    fs.writeFileSync(tempDest, content, 'utf-8');

    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        fs.renameSync(tempDest, destPath);
        break;
      } catch (renameErr) {
        if (attempt === 4 || (renameErr.code !== 'EPERM' && renameErr.code !== 'EBUSY')) {
          fs.copyFileSync(tempDest, destPath);
          try {
            fs.unlinkSync(tempDest);
          } catch {
            // Best effort
          }
          break;
        }
        const start = Date.now();
        while (Date.now() - start < 10) {
          // wait
        }
      }
    }
  }

  /**
   * Emits status update event to registered callback.
   *
   * @private
   * @returns {void}
   */
  _notifyStatus() {
    try {
      this._onStatusChange(this.getStatus());
    } catch {
      // Suppress listener error
    }
  }

  /**
   * Loads or initializes expenses_config.json.
   *
   * @private
   * @returns {object} Configuration object.
   */
  _loadConfig() {
    try {
      if (fs.existsSync(this._configPath)) {
        const parsed = JSON.parse(fs.readFileSync(this._configPath, 'utf-8'));
        if (parsed && typeof parsed === 'object') {
          if (!parsed.backupMirror) {
            parsed.backupMirror = this._getDefaultMirrorConfig();
          }
          return parsed;
        }
      }
    } catch {
      // Fallback
    }

    const initial = {
      version: 1,
      backupMirror: this._getDefaultMirrorConfig()
    };
    this._saveConfig(initial);
    return initial;
  }

  /**
   * Saves configuration to expenses_config.json atomically.
   *
   * @private
   * @param {object} config - Configuration object.
   * @returns {void}
   */
  _saveConfig(config) {
    try {
      const dir = path.dirname(this._configPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      this._atomicWriteString(this._configPath, JSON.stringify(config, null, 2));
    } catch (err) {
      console.warn('[BackupMirrorService] Failed to persist expenses_config.json:', err.message);
    }
  }

  /**
   * Generates default mirror configuration block.
   *
   * @private
   * @returns {object}
   */
  _getDefaultMirrorConfig() {
    return {
      enabled: false,
      targetDir: '',
      debounceMs: 2000,
      lastMirroredAt: null,
      lastStatus: 'idle',
      lastError: null
    };
  }
}

module.exports = BackupMirrorService;
