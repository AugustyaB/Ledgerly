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
    if (customPath) {
      this.filePath = customPath;
    } else if (envPath) {
      this.filePath = envPath;
    } else {
      const userDataPath = app ? app.getPath('userData') : path.join(__dirname, '../../scratch');
      this.filePath = path.join(userDataPath, 'expenses_db.json');
    }

    this.ensureStorageExists();
  }

  // ==========================================================================
  // 1. Storage Initialization & Path Utilities
  // ==========================================================================

  /**
   * Returns the absolute file path on disk for this database.
   *
   * @returns {string} Absolute path to primary JSON file.
   */
  getFilePath() {
    return this.filePath;
  }

  /**
   * Returns the size of the database file on disk in bytes.
   * Returns 0 if the file does not exist.
   *
   * @returns {number} File size in bytes.
   */
  getFileSize() {
    try {
      if (fs.existsSync(this.filePath)) {
        const stats = fs.statSync(this.filePath);
        return stats.size;
      }
      return 0;
    } catch (err) {
      console.warn('Failed to retrieve database file size:', err.message);
      return 0;
    }
  }

  /**
   * Guarantees that the storage directory and primary file exist.
   * Generates a baseline schema if the database is missing.
   *
   * @returns {void}
   */
  ensureStorageExists() {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      if (!fs.existsSync(this.filePath)) {
        const initialSchema = this._createDefaultRootSchema();
        fs.writeFileSync(this.filePath, JSON.stringify(initialSchema, null, 2), 'utf-8');
      }
    } catch (err) {
      console.error('Failed to initialize storage directory or database file:', err);
    }
  }

  // ==========================================================================
  // 2. Read & Recovery Operations
  // ==========================================================================

  /**
   * Reads and parses the root database object from disk.
   * Recovers transparently from the rotating backup (.bak) if primary file
   * is missing or contains corrupt/invalid JSON.
   *
   * @returns {import('../types').RootData} Parsed root database object.
   */
  read() {
    try {
      this.ensureStorageExists();
      let raw;

      // 1. Read primary file, with fallback to .bak if unreadable
      try {
        raw = fs.readFileSync(this.filePath, 'utf-8');
      } catch (readErr) {
        const bakPath = `${this.filePath}.bak`;
        if (fs.existsSync(bakPath)) {
          console.warn('Primary database file missing, recovering from backup (.bak)');
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
        const bakPath = `${this.filePath}.bak`;
        if (fs.existsSync(bakPath)) {
          console.warn('Primary database JSON corrupt, recovering from backup (.bak)');
          raw = fs.readFileSync(bakPath, 'utf-8');
          parsed = JSON.parse(raw);
        } else {
          throw jsonErr;
        }
      }

      // 3. Ensure mandatory root keys exist
      return this._sanitizeRootStructure(parsed);
    } catch (err) {
      console.error('Failed to read root storage:', err);
      return this._createDefaultRootSchema();
    }
  }

  // ==========================================================================
  // 3. Atomic Write & Backup Rotation
  // ==========================================================================

  /**
   * Atomically persists root database object to disk.
   * Writes to a temporary file first (.tmp), rotates current file to (.bak),
   * then executes an atomic rename to prevent corruption during sudden power loss.
   *
   * @param {import('../types').RootData} rootData - Complete root data object to write.
   * @returns {import('../types').OperationResult} Status result object.
   */
  write(rootData) {
    try {
      const tempPath = `${this.filePath}.tmp`;
      const bakPath = `${this.filePath}.bak`;
      const serialized = JSON.stringify(rootData, null, 2);

      // Step 1: Write to temporary file first
      fs.writeFileSync(tempPath, serialized, 'utf-8');

      // Step 2: Backup current database file if it exists
      if (fs.existsSync(this.filePath)) {
        try {
          fs.copyFileSync(this.filePath, bakPath);
        } catch (copyErr) {
          console.warn('Failed to rotate backup file:', copyErr.message);
        }
      }

      // Step 3: Atomic rename temp file to primary file with Windows lock fallback
      let renamed = false;
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          fs.renameSync(tempPath, this.filePath);
          renamed = true;
          break;
        } catch (renameErr) {
          if (attempt === 4 || (renameErr.code !== 'EPERM' && renameErr.code !== 'EBUSY')) {
            // Fallback for Windows transient file locks
            try {
              fs.copyFileSync(tempPath, this.filePath);
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

      return { success: renamed };
    } catch (err) {
      console.error('Failed to atomically persist root data:', err);
      return { success: false, error: err.message };
    }
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
            householdMembers: ['Self', 'Partner', 'Roommate'],
            budgetGoal: 30000,
            notes: [],
            notifications: []
          }
        }
      ],
      settlements: [],
      recurringBills: [
        {
          id: 'rec-1',
          title: 'BESCOM Electricity Bill',
          icon: 'zap',
          amount: 1450,
          category: 'Utilities',
          dueDay: 10,
          frequency: 'monthly',
          paidBy: 'Self',
          splitWith: ['Self', 'Partner', 'Roommate'],
          autoSplit: true,
          lastPaidDate: null
        },
        {
          id: 'rec-2',
          title: 'Airtel Broadband Wi-Fi',
          icon: 'wifi',
          amount: 999,
          category: 'Utilities',
          dueDay: 15,
          frequency: 'monthly',
          paidBy: 'Self',
          splitWith: ['Self', 'Partner', 'Roommate'],
          autoSplit: true,
          lastPaidDate: null
        },
        {
          id: 'rec-3',
          title: 'Indane LPG Cylinder',
          icon: 'flame',
          amount: 850,
          category: 'Utilities',
          dueDay: 25,
          frequency: 'monthly',
          paidBy: 'Self',
          splitWith: ['Self', 'Partner', 'Roommate'],
          autoSplit: true,
          lastPaidDate: null
        }
      ],
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

    return parsed;
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
