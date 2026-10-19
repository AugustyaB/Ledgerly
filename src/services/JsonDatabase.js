/**
 * ============================================================================
 * Ledgerly — JsonDatabase Service (Disk Persistence Layer)
 * ============================================================================
 *
 * @fileoverview
 * Low-level persistence service encapsulating all file system I/O for Ledgerly.
 * Handles database path resolution, directory initialization, safe schema initialization,
 * atomic write-renaming (.tmp -> .json), and automated rotating backups (.bak).
 *
 * ARCHITECTURAL PRINCIPLES:
 * - Single Responsibility: Exclusively responsible for physical file I/O and integrity.
 * - Encapsulation: Hides raw fs calls from domain services.
 * - Fault Tolerance: Recovers gracefully from corrupted primary database via .bak rotation.
 * - Zero Side-Effects: No business logic or entity validation performed here.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const VaultCipherService = require('./VaultCipherService');

/**
 * @class JsonDatabase
 * Manages raw read, write, atomic persistence, and backup rotation for JSON databases.
 */
class JsonDatabase {
  /**
   * Initializes the JsonDatabase instance with a target file path.
   * Resolves to Electron's userData directory by default if no path is provided.
   *
   * @param {string} [customPath] - Explicit file path override (useful for testing).
   */
  constructor(customPath) {
    const envPath = process.env.LEDGERLY_DB_PATH;
    let targetPath;
    if (customPath) {
      targetPath = customPath;
    } else if (envPath) {
      targetPath = envPath;
    } else {
      const userDataPath = app ? app.getPath('userData') : path.join(__dirname, '../../scratch');
      targetPath = path.join(userDataPath, 'expenses_db.json');
    }

    if (targetPath) {
      try {
        if (fs.existsSync(targetPath) && fs.statSync(targetPath).isDirectory()) {
          targetPath = path.join(targetPath, 'expenses_db.json');
        } else if (!path.extname(targetPath)) {
          targetPath = path.join(targetPath, 'expenses_db.json');
        }
      } catch {
        // Fallback
      }
    }

    this.filePath = targetPath;
    this.activeFilePath = targetPath;
    this.dataDir = path.dirname(targetPath);
    this.archiveFilePath = path.join(this.dataDir, 'legacy_archive.json');
    this.legacyFilePath = targetPath;

    this.vaultCipher = new VaultCipherService();
    this._activeEnvelope = null;
    this._unlockedRoot = null;

    this.ensureStorageExists();
  }

  // ==========================================================================
  // 1. Storage Initialization & Path Utilities
  // ==========================================================================

  /**
   * Returns the absolute file path on disk for this database (points to active ledger).
   *
   * @returns {string} Absolute path to active JSON ledger.
   */
  getFilePath() {
    return this.activeFilePath;
  }

  /**
   * Returns the active working set file path (<90 days).
   *
   * @returns {string} Absolute path to active_ledger.json.
   */
  getActiveFilePath() {
    return this.activeFilePath;
  }

  /**
   * Returns the cold archive file path (>90 days).
   *
   * @returns {string} Absolute path to legacy_archive.json.
   */
  getArchiveFilePath() {
    return this.archiveFilePath;
  }

  /**
   * Returns the legacy unpartitioned database path (pre-v0.7).
   *
   * @returns {string} Absolute path to expenses_db.json.
   */
  getLegacyFilePath() {
    return this.legacyFilePath;
  }

  /**
   * Returns the size of the active database file on disk in bytes.
   * Returns 0 if the file does not exist.
   *
   * @returns {number} File size in bytes.
   */
  getFileSize() {
    try {
      if (fs.existsSync(this.activeFilePath)) {
        const stats = fs.statSync(this.activeFilePath);
        return stats.size;
      }
      return 0;
    } catch (err) {
      console.warn('Failed to retrieve database file size:', err.message);
      return 0;
    }
  }

  /**
   * Returns diagnostic partition statistics. Single unified ledger indicates isPartitioned: false.
   *
   * @returns {object} Health statistics.
   */
  getPartitionStats() {
    try {
      const activeSize = fs.existsSync(this.filePath) ? fs.statSync(this.filePath).size : 0;
      let totalExpensesCount = 0;
      try {
        const root = this.read();
        if (Array.isArray(root.profiles)) {
          for (const p of root.profiles) {
            if (p && p.data && Array.isArray(p.data.expenses)) {
              totalExpensesCount += p.data.expenses.length;
            }
          }
        }
      } catch {
        // Suppress read error in stats
      }

      return {
        activeFilePath: this.filePath,
        archiveFilePath: this.archiveFilePath,
        activeSizeBytes: activeSize,
        archiveSizeBytes: 0,
        totalSizeBytes: activeSize,
        activeExpensesCount: totalExpensesCount,
        archivedExpensesCount: 0,
        totalExpensesCount,
        isPartitioned: false
      };
    } catch (err) {
      return {
        activeFilePath: this.filePath,
        archiveFilePath: this.archiveFilePath,
        activeSizeBytes: 0,
        archiveSizeBytes: 0,
        totalSizeBytes: 0,
        activeExpensesCount: 0,
        archivedExpensesCount: 0,
        totalExpensesCount: 0,
        isPartitioned: false,
        error: err.message
      };
    }
  }

  /**
   * Retrieves an in-memory working-set slice for the active pay-cycle or specified days (default 90d)
   * for ultra-fast query responsiveness while retaining a single unified file on disk.
   *
   * @param {string} [profileId=null] - Target profile ID or active profile.
   * @param {number} [days=90] - Days in hot working window.
   * @returns {import('../types').Expense[]} Filtered working-set expenses.
   */
  getWorkingSet(profileId = null, days = 90) {
    const root = this.read();
    const targetId = profileId || root.activeProfileId || (root.profiles && root.profiles[0]?.id);
    const profile = (root.profiles || []).find(p => p.id === targetId);
    if (!profile || !profile.data || !Array.isArray(profile.data.expenses)) {
      return [];
    }
    const cutoffMs = Date.now() - days * 24 * 60 * 60 * 1000;
    return profile.data.expenses.filter(e => {
      const expTime = e && e.date ? new Date(e.date).getTime() : 0;
      return !isNaN(expTime) && expTime >= cutoffMs;
    });
  }

  /**
   * Guarantees that storage directory and the single unified database file exist.
   * Automatically folds legacy partitioned files (active_ledger.json + legacy_archive.json)
   * back into a single unified ledger.
   *
   * @returns {void}
   */
  ensureStorageExists() {
    try {
      if (!fs.existsSync(this.dataDir)) {
        fs.mkdirSync(this.dataDir, { recursive: true });
      }

      const partitionedActive = path.join(this.dataDir, 'data', 'active_ledger.json');
      const partitionedArchive = path.join(this.dataDir, 'data', 'legacy_archive.json');

      // 1. If target file does not exist, check if legacy partitioned files can be migrated
      if (!fs.existsSync(this.filePath)) {
        let sourcePath = null;
        if (fs.existsSync(partitionedActive)) {
          sourcePath = partitionedActive;
        }

        if (sourcePath) {
          try {
            const raw = fs.readFileSync(sourcePath, 'utf-8');
            const root = this._sanitizeRootStructure(JSON.parse(raw));

            const archivePath = fs.existsSync(partitionedArchive) ? partitionedArchive : this.archiveFilePath;
            if (fs.existsSync(archivePath)) {
              try {
                const archiveRaw = fs.readFileSync(archivePath, 'utf-8');
                this._mergeArchiveIntoRoot(root, JSON.parse(archiveRaw));
                fs.renameSync(archivePath, `${archivePath}.merged.bak`);
              } catch (archErr) {
                console.warn('Failed to merge archive during consolidation:', archErr.message);
              }
            }

            fs.writeFileSync(this.filePath, JSON.stringify(root, null, 2), 'utf-8');
            return;
          } catch (migErr) {
            console.error('Failed to consolidate from active_ledger:', migErr);
          }
        }

        // Initialize fresh root schema
        const initialSchema = this._createDefaultRootSchema();
        fs.writeFileSync(this.filePath, JSON.stringify(initialSchema, null, 2), 'utf-8');
        return;
      }

      // 2. Target file exists. Check if any orphaned legacy archive file needs folding in
      const candidateArchives = Array.from(new Set([this.archiveFilePath, partitionedArchive]));
      for (const archPath of candidateArchives) {
        if (fs.existsSync(archPath)) {
          try {
            const archiveRaw = fs.readFileSync(archPath, 'utf-8');
            const archiveParsed = JSON.parse(archiveRaw);
            if (archiveParsed && archiveParsed.profiles && Object.keys(archiveParsed.profiles).length > 0) {
              try {
                const rootRaw = fs.readFileSync(this.filePath, 'utf-8');
                const root = this._sanitizeRootStructure(JSON.parse(rootRaw));
                if (root && !root.isLockedVault) {
                  const mergedCount = this._mergeArchiveIntoRoot(root, archiveParsed);
                  if (mergedCount > 0) {
                    this._atomicWrite(this.filePath, JSON.stringify(root, null, 2));
                  }
                }
              } catch (readErr) {
                console.warn('Failed to parse existing ledger during archive fold:', readErr.message);
              }
            }
            const bakName = `${archPath}.merged.bak`;
            if (fs.existsSync(bakName)) {
              try {
                fs.unlinkSync(bakName);
              } catch {
                // ignore
              }
            }
            fs.renameSync(archPath, bakName);
          } catch (archErr) {
            console.warn('Failed to fold archive into existing ledger:', archErr.message);
          }
        }
      }
    } catch (err) {
      console.error('Failed to initialize storage directory or database file:', err);
    }
  }

  /**
   * Helper to merge archived expense records into root data profiles.
   * Preserves chronological sort and deduplicates by ID.
   *
   * @private
   * @param {import('../types').RootData} root - Root database object.
   * @param {object} archiveData - Parsed archive data object.
   * @returns {number} Total merged expenses count.
   */
  _mergeArchiveIntoRoot(root, archiveData) {
    if (!archiveData || !archiveData.profiles || typeof archiveData.profiles !== 'object') {
      return 0;
    }
    let mergedTotal = 0;
    for (const [profId, archivedList] of Object.entries(archiveData.profiles)) {
      if (!Array.isArray(archivedList) || archivedList.length === 0) continue;
      const targetProf = (root.profiles || []).find(p => p.id === profId) ||
        (root.profiles || []).find(p => p.id === root.activeProfileId);
      if (targetProf && targetProf.data) {
        if (!Array.isArray(targetProf.data.expenses)) {
          targetProf.data.expenses = [];
        }
        const existingIds = new Set(targetProf.data.expenses.map(e => e.id));
        for (const exp of archivedList) {
          if (exp && exp.id && !existingIds.has(exp.id)) {
            targetProf.data.expenses.push(exp);
            existingIds.add(exp.id);
            mergedTotal++;
          }
        }
        targetProf.data.expenses.sort((a, b) => {
          const tA = a && a.date ? new Date(a.date).getTime() : 0;
          const tB = b && b.date ? new Date(b.date).getTime() : 0;
          if (tB !== tA) return tB - tA;
          return (b.id || '').localeCompare(a.id || '');
        });
      }
    }
    return mergedTotal;
  }


  // ==========================================================================
  // 2. Read & Recovery Operations
  // ==========================================================================

  /**
   * Reads and parses the active root database object (<90d working set) from disk.
   * Recovers transparently from the rotating backup (.bak) if primary file
   * is missing or contains corrupt/invalid JSON.
   *
   * @returns {import('../types').RootData} Parsed root database object.
   */
  read() {
    try {
      this.ensureStorageExists();
      let raw;

      // 1. Read active file, with fallback to .bak if unreadable
      try {
        raw = fs.readFileSync(this.activeFilePath, 'utf-8');
      } catch (readErr) {
        const bakPath = `${this.activeFilePath}.bak`;
        if (fs.existsSync(bakPath)) {
          console.warn('Active database file missing, recovering from backup (.bak)');
          raw = fs.readFileSync(bakPath, 'utf-8');
        } else {
          throw readErr;
        }
      }

      // 2. Parse JSON, with fallback to .bak if primary is corrupt
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch (jsonErr) {
        const bakPath = `${this.activeFilePath}.bak`;
        if (fs.existsSync(bakPath)) {
          console.warn('Active database JSON corrupt, recovering from backup (.bak)');
          raw = fs.readFileSync(bakPath, 'utf-8');
          parsed = JSON.parse(raw);
        } else {
          throw jsonErr;
        }
      }

      // 3. Handle encrypted vault envelope if detected
      if (this.vaultCipher.isVaultEnvelope(parsed)) {
        this._activeEnvelope = parsed;
        if (this.vaultCipher.isUnlocked()) {
          try {
            const decryptedStr = this.vaultCipher.decryptPayload(parsed);
            this._unlockedRoot = this._sanitizeRootStructure(JSON.parse(decryptedStr));
            return this._unlockedRoot;
          } catch (decErr) {
            console.error('Failed to decrypt vault payload with active key:', decErr);
          }
        }
        if (this._unlockedRoot) {
          return this._unlockedRoot;
        }
        // Return safe locked envelope stub indicating configured account
        return {
          version: 1,
          isLockedVault: true,
          account: {
            isConfigured: true,
            userId: parsed.metadata?.userId || '',
            rememberMe: Boolean(parsed.metadata?.rememberMe),
            workspaceMode: parsed.metadata?.workspaceMode || 'household'
          },
          profiles: [],
          activeProfileId: null
        };
      }

      // 4. Ensure mandatory root keys exist (unencrypted)
      return this._sanitizeRootStructure(parsed);
    } catch (err) {
      console.error('Failed to read root storage:', err);
      return this._createDefaultRootSchema();
    }
  }

  /**
   * Compatibility method for reading archived records. In the unified ledger architecture,
   * all historical expenses reside directly within the single unified ledger.
   *
   * @returns {{ version: number, archivedAt: string, profiles: Record<string, import('../types').Expense[]> }}
   */
  readArchive() {
    return this._createDefaultArchiveSchema();
  }

  // ==========================================================================
  // 3. Atomic Write & Backup Rotation
  // ==========================================================================

  /**
   * Atomically persists active root database object to disk.
   * Writes to a temporary file first (.tmp), rotates current file to (.bak),
   * then executes an atomic rename to prevent corruption during sudden power loss.
   *
   * @param {import('../types').RootData} rootData - Complete root data object to write.
   * @returns {import('../types').OperationResult} Status result object.
   */
  write(rootData) {
    try {
      if (this.vaultCipher.isUnlocked() || this._activeEnvelope) {
        if (!this.vaultCipher.isUnlocked()) {
          return { success: false, error: 'Database is encrypted and currently locked.' };
        }
        let envelope = this._activeEnvelope;
        if (!envelope && fs.existsSync(this.activeFilePath)) {
          try {
            const onDisk = JSON.parse(fs.readFileSync(this.activeFilePath, 'utf-8'));
            if (this.vaultCipher.isVaultEnvelope(onDisk)) {
              envelope = onDisk;
            }
          } catch {
            // ignore
          }
        }
        if (envelope) {
          if (rootData.account) {
            envelope.metadata = {
              ...envelope.metadata,
              userId: rootData.account.userId || envelope.metadata?.userId || '',
              rememberMe: Boolean(rootData.account.rememberMe),
              workspaceMode: rootData.account.workspaceMode || 'household'
            };
          }
          const updated = this.vaultCipher.encryptPayload(rootData, envelope);
          this._activeEnvelope = updated;
          this._unlockedRoot = rootData;
          const serialized = JSON.stringify(updated, null, 2);
          return this._atomicWrite(this.activeFilePath, serialized);
        }
      }

      const serialized = JSON.stringify(rootData, null, 2);
      return this._atomicWrite(this.activeFilePath, serialized);
    } catch (err) {
      console.error('Failed to atomically persist root data:', err);
      return { success: false, error: err.message };
    }
  }

  /**
   * Compatibility method for persisting archived records. In the unified ledger architecture,
   * cold partitioned archive writes are decommissioned in favor of the single ledger.
   *
   * @param {object} [archiveData] - Archive object.
   * @returns {import('../types').OperationResult} Status result object.
   */
  writeArchive(archiveData = null) {
    return { success: true };
  }

  /**
   * Atomic write worker implementing .tmp -> .bak rotation and Windows lock retry loops.
   *
   * @private
   * @param {string} targetFilePath - Destination file path.
   * @param {string} serialized - Serialized string content.
   * @returns {import('../types').OperationResult}
   */
  _atomicWrite(targetFilePath, serialized) {
    try {
      const tempPath = `${targetFilePath}.tmp`;
      const bakPath = `${targetFilePath}.bak`;

      // Step 1: Write to temporary file first
      fs.writeFileSync(tempPath, serialized, 'utf-8');

      // Step 2: Backup current database file if it exists
      if (fs.existsSync(targetFilePath)) {
        try {
          fs.copyFileSync(targetFilePath, bakPath);
        } catch (copyErr) {
          console.warn('Failed to rotate backup file:', copyErr.message);
        }
      }

      // Step 3: Atomic rename temp file to primary file with Windows lock fallback
      let renamed = false;
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          fs.renameSync(tempPath, targetFilePath);
          renamed = true;
          break;
        } catch (renameErr) {
          if (attempt === 4 || (renameErr.code !== 'EPERM' && renameErr.code !== 'EBUSY')) {
            // Fallback for Windows transient file locks
            try {
              fs.copyFileSync(tempPath, targetFilePath);
              try {
                fs.unlinkSync(tempPath);
              } catch {
                // Best effort temporary file cleanup
              }
              renamed = true;
              break;
            } catch {
              throw renameErr;
            }
          }
          // Micro-wait for Windows file system lock release
          const start = Date.now();
          while (Date.now() - start < 10) {
            // Spin-wait briefly to let Windows filesystem release handle
          }
        }
      }

      // If writing to activeFilePath and legacyFilePath is different, touch legacyFilePath
      if (targetFilePath === this.activeFilePath && this.legacyFilePath && this.legacyFilePath !== this.activeFilePath) {
        try {
          fs.writeFileSync(this.legacyFilePath, '', { flag: 'a' });
        } catch {
          // Best effort
        }
      }

      if (renamed && typeof this.onDidWrite === 'function') {
        try {
          this.onDidWrite(targetFilePath);
        } catch {
          // Best effort
        }
      }

      return { success: renamed };
    } catch (err) {
      console.error(`Failed to atomically persist to ${targetFilePath}:`, err);
      return { success: false, error: err.message };
    }
  }

  /**
   * Registers a callback listener invoked after successful atomic disk writes.
   *
   * @param {Function} callback - Callback function(targetFilePath).
   */
  setOnDidWrite(callback) {
    this.onDidWrite = typeof callback === 'function' ? callback : null;
  }

  /**
   * Generates a baseline archive schema object.
   *
   * @private
   * @returns {{ version: number, archivedAt: string, profiles: Record<string, any[]> }}
   */
  _createDefaultArchiveSchema() {
    return {
      version: 1,
      archivedAt: new Date().toISOString(),
      profiles: {}
    };
  }

  /**
   * Sanitizes parsed archive data.
   *
   * @private
   * @param {any} parsed - Parsed archive data.
   * @returns {{ version: number, archivedAt: string, profiles: Record<string, any[]> }}
   */
  _sanitizeArchiveStructure(parsed) {
    if (!parsed || typeof parsed !== 'object') {
      return this._createDefaultArchiveSchema();
    }
    if (!parsed.version) {
      parsed.version = 1;
    }
    if (!parsed.profiles || typeof parsed.profiles !== 'object') {
      parsed.profiles = {};
    }
    return parsed;
  }

  // ==========================================================================
  // 4. Internal Helpers & Default Factory
  // ==========================================================================

  /**
   * Generates a pristine baseline root database schema with 0 expenses.
   *
   * @private
   * @returns {import('../types').RootData} Baseline schema.
   */
  _createDefaultRootSchema() {
    return {
      account: {
        isConfigured: false,
        userId: '',
        passwordHash: '',
        salt: '',
        rememberMe: false,
        lastLoggedIn: null
      },
      activeProfileId: 'prof-default',
      profiles: [
        {
          id: 'prof-default',
          name: 'Personal',
          avatar: '#D9822B',
          color: '#D9822B',
          createdAt: new Date().toISOString(),
          data: {
            expenses: [],
            categories: [
              'Food & Dining',
              'Transportation',
              'Office & Tech',
              'Subscriptions & Software',
              'Utilities & Bills',
              'Travel & Lodging',
              'Healthcare & Wellness',
              'Entertainment',
              'Miscellaneous'
            ],
            presets: [
              {
                id: 'pst-1',
                icon: 'coffee',
                title: 'Chai / Coffee',
                amount: 20.0,
                category: 'Food & Dining',
                paymentMethod: 'UPI / GPay'
              },
              {
                id: 'pst-2',
                icon: 'utensils',
                title: 'Lunch / Snacks',
                amount: 120.0,
                category: 'Food & Dining',
                paymentMethod: 'UPI / GPay'
              },
              {
                id: 'pst-3',
                icon: 'fuel',
                title: 'Petrol / Fuel',
                amount: 300.0,
                category: 'Transportation',
                paymentMethod: 'UPI / GPay'
              },
              {
                id: 'pst-4',
                icon: 'car',
                title: 'Auto / Cab / Metro',
                amount: 80.0,
                category: 'Transportation',
                paymentMethod: 'UPI / GPay'
              },
              {
                id: 'pst-5',
                icon: 'shopping-cart',
                title: 'Groceries & Kirana',
                amount: 450.0,
                category: 'Food & Dining',
                paymentMethod: 'UPI / GPay'
              }
            ],
            salaryConfig: {
              monthlyIncome: 60000,
              fixedBills: 20000,
              savingsGoal: 10000,
              payday: 1,
              currentCycleStartDate: null,
              nextPaydayOverride: null,
              currencySymbol: '₹'
            },
            householdMembers: ['Self'],
            budgetGoal: 30000,
            notes: [],
            notifications: []
          }
        }
      ],
      settlements: [],
      recurringBills: [],
      pairedDevices: [],
      schemaVersion: 2
    };
  }

  /**
   * Sanitizes a parsed root data object to ensure accounts and profile arrays exist.
   *
   * @private
   * @param {any} parsed - Parsed data to validate.
   * @returns {import('../types').RootData} Sanitized root data.
   */
  _sanitizeRootStructure(parsed) {
    if (!parsed || typeof parsed !== 'object') {
      return this._createDefaultRootSchema();
    }

    if (!parsed.account || typeof parsed.account !== 'object') {
      parsed.account = {
        isConfigured: false,
        userId: '',
        passwordHash: '',
        salt: '',
        rememberMe: false,
        lastLoggedIn: null
      };
    }

    if (!Array.isArray(parsed.profiles) || parsed.profiles.length === 0) {
      const defaultSchema = this._createDefaultRootSchema();
      parsed.profiles = defaultSchema.profiles;
      parsed.activeProfileId = defaultSchema.activeProfileId;
      this.write(parsed);
    }

    if (!parsed.activeProfileId || !parsed.profiles.some(p => p.id === parsed.activeProfileId)) {
      parsed.activeProfileId = parsed.profiles[0].id;
      this.write(parsed);
    }

    if (!Array.isArray(parsed.settlements)) {
      parsed.settlements = [];
    }

    if (!Array.isArray(parsed.recurringBills)) {
      parsed.recurringBills = [];
    }

    if (!Array.isArray(parsed.pairedDevices)) {
      parsed.pairedDevices = [];
    }

    return parsed;
  }

  // ==========================================================================
  // 4. Vault Encryption & Security Operations (ADR-014)
  // ==========================================================================

  /**
   * Evaluates whether the active ledger file on disk is an encrypted vault envelope.
   *
   * @returns {boolean} True if file exists and has vault envelope format.
   */
  isVaultEncrypted() {
    try {
      if (fs.existsSync(this.activeFilePath)) {
        const raw = fs.readFileSync(this.activeFilePath, 'utf-8');
        return this.vaultCipher.isVaultEnvelope(raw);
      }
    } catch {
      // Suppress read error
    }
    return false;
  }

  /**
   * Upgrades the database to an AES-256-GCM encrypted vault envelope.
   *
   * @param {string} password - Master password / PIN.
   * @param {string} recoveryKey - Emergency recovery key.
   * @param {object} [metadata={}] - Account metadata header.
   * @returns {import('../types').OperationResult & { envelope?: object }}
   */
  upgradeToVault(password, recoveryKey, metadata = {}, rootData = null) {
    try {
      let currentRoot = rootData || this._unlockedRoot;
      if (!currentRoot) {
        if (fs.existsSync(this.activeFilePath)) {
          try {
            const raw = fs.readFileSync(this.activeFilePath, 'utf-8');
            const parsed = JSON.parse(raw);
            if (!this.vaultCipher.isVaultEnvelope(parsed)) {
              currentRoot = this._sanitizeRootStructure(parsed);
            }
          } catch {
            // Ignore parse failure
          }
        }
      }
      if (!currentRoot) {
        currentRoot = this._createDefaultRootSchema();
      }

      // Backup existing unencrypted database file if present
      if (fs.existsSync(this.activeFilePath)) {
        try {
          fs.copyFileSync(this.activeFilePath, `${this.activeFilePath}.pre-vault.bak`);
        } catch {
          // Best effort backup
        }
      }

      const meta = {
        userId: currentRoot.account?.userId || metadata.userId || '',
        rememberMe: Boolean(currentRoot.account?.rememberMe || metadata.rememberMe),
        workspaceMode: currentRoot.account?.workspaceMode || metadata.workspaceMode || 'household',
        ...metadata
      };

      const envelope = this.vaultCipher.createEnvelope(currentRoot, password, recoveryKey, meta);
      this._activeEnvelope = envelope;
      this._unlockedRoot = currentRoot;

      const res = this._atomicWrite(this.activeFilePath, JSON.stringify(envelope, null, 2));
      if (!res.success) {
        return res;
      }
      return { success: true, envelope };
    } catch (err) {
      console.error('Failed to upgrade database to encrypted vault:', err);
      return { success: false, error: err.message };
    }
  }

  /**
   * Unlocks the encrypted vault envelope using Master Password (Slot 1).
   *
   * @param {string} password - Master password / PIN.
   * @returns {import('../types').OperationResult & { root?: import('../types').RootData }}
   */
  unlockVaultWithPassword(password) {
    try {
      let envelope = this._activeEnvelope;
      if (!envelope && fs.existsSync(this.activeFilePath)) {
        const raw = fs.readFileSync(this.activeFilePath, 'utf-8');
        envelope = JSON.parse(raw);
      }
      if (!envelope) {
        return { success: false, error: 'Vault database file not found.' };
      }

      const decryptedStr = this.vaultCipher.unlockWithPassword(envelope, password);
      this._activeEnvelope = envelope;
      this._unlockedRoot = this._sanitizeRootStructure(JSON.parse(decryptedStr));
      return { success: true, root: this._unlockedRoot };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Unlocks the encrypted vault envelope using Emergency Recovery Key (Slot 2).
   *
   * @param {string} recoveryKey - Emergency recovery key.
   * @returns {import('../types').OperationResult & { root?: import('../types').RootData }}
   */
  unlockVaultWithRecoveryKey(recoveryKey) {
    try {
      let envelope = this._activeEnvelope;
      if (!envelope && fs.existsSync(this.activeFilePath)) {
        const raw = fs.readFileSync(this.activeFilePath, 'utf-8');
        envelope = JSON.parse(raw);
      }
      if (!envelope) {
        return { success: false, error: 'Vault database file not found.' };
      }

      const decryptedStr = this.vaultCipher.unlockWithRecoveryKey(envelope, recoveryKey);
      this._activeEnvelope = envelope;
      this._unlockedRoot = this._sanitizeRootStructure(JSON.parse(decryptedStr));
      return { success: true, root: this._unlockedRoot };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Resets master password using valid recovery key (updates Slot 1).
   *
   * @param {string} recoveryKey - Emergency recovery key.
   * @param {string} newPassword - New master password / PIN.
   * @returns {import('../types').OperationResult}
   */
  resetVaultPasswordWithRecoveryKey(recoveryKey, newPassword) {
    try {
      let envelope = this._activeEnvelope;
      if (!envelope && fs.existsSync(this.activeFilePath)) {
        const raw = fs.readFileSync(this.activeFilePath, 'utf-8');
        envelope = JSON.parse(raw);
      }
      if (!envelope) {
        return { success: false, error: 'Vault database file not found.' };
      }

      const updatedEnvelope = this.vaultCipher.resetPasswordWithRecoveryKey(envelope, recoveryKey, newPassword);
      this._activeEnvelope = updatedEnvelope;

      const res = this._atomicWrite(this.activeFilePath, JSON.stringify(updatedEnvelope, null, 2));
      if (!res.success) return res;
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Changes master password using valid current password (updates Slot 1).
   *
   * @param {string} currentPassword - Current master password / PIN.
   * @param {string} newPassword - New master password / PIN.
   * @returns {import('../types').OperationResult}
   */
  changeVaultPassword(currentPassword, newPassword) {
    try {
      let envelope = this._activeEnvelope;
      if (!envelope && fs.existsSync(this.activeFilePath)) {
        const raw = fs.readFileSync(this.activeFilePath, 'utf-8');
        envelope = JSON.parse(raw);
      }
      if (!envelope) {
        return { success: false, error: 'Vault database file not found.' };
      }

      const updatedEnvelope = this.vaultCipher.changePasswordWithCurrentPassword(envelope, currentPassword, newPassword);
      this._activeEnvelope = updatedEnvelope;

      const res = this._atomicWrite(this.activeFilePath, JSON.stringify(updatedEnvelope, null, 2));
      if (!res.success) return res;
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Rotates Slot 2 Emergency Recovery Key when the vault is unlocked and persists to disk.
   *
   * @param {string} [newRecoveryKey] - Optional new recovery key.
   * @returns {import('../types').OperationResult & { recoveryKey?: string }}
   */
  rotateVaultRecoveryKey(newRecoveryKey = null) {
    try {
      let envelope = this._activeEnvelope;
      if (!envelope && fs.existsSync(this.activeFilePath)) {
        const raw = fs.readFileSync(this.activeFilePath, 'utf-8');
        envelope = JSON.parse(raw);
      }
      if (!envelope || !this.vaultCipher.isVaultEnvelope(envelope) || !this.vaultCipher.isUnlocked()) {
        return {
          success: true,
          recoveryKey: newRecoveryKey || this.vaultCipher.generateEmergencyRecoveryKey()
        };
      }

      const { envelope: updatedEnvelope, recoveryKey } = this.vaultCipher.rotateRecoveryKey(envelope, newRecoveryKey);
      this._activeEnvelope = updatedEnvelope;

      const res = this._atomicWrite(this.activeFilePath, JSON.stringify(updatedEnvelope, null, 2));
      if (!res.success) return res;
      return { success: true, recoveryKey };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Locks the vault by zeroizing in-memory keys and clearing active root data.
   *
   * @returns {import('../types').OperationResult}
   */
  lockVault() {
    this.vaultCipher.zeroize();
    this._unlockedRoot = null;
    return { success: true };
  }

  /**
   * Executes a self-healing audit pass across this database file using DatabaseAuditor.
   *
   * @returns {{ healthy: boolean, issuesFound: string[], repairsApplied: string[], backupCreated: string|null, timestamp: string }}
   */
  runIntegrityAudit() {
    const DatabaseAuditor = require('./DatabaseAuditor');
    return DatabaseAuditor.auditAndRepair(this);
  }
}

module.exports = JsonDatabase;
