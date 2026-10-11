/**
 * ============================================================================
 * Ledgerly — FinancialIntelligenceFacade (Data Foundation & Intelligence Contract)
 * ============================================================================
 *
 * @fileoverview
 * Master domain facade decoupling UI components and client views from raw
 * statistical algorithms, mathematical aggregation rollups, data quality audits,
 * and versioned configuration schemas (Phase 0.8.2).
 *
 * ARCHITECTURAL PRINCIPLES:
 * - Data Contract Isolation: UI components interact exclusively with stable,
 *   standardized result envelopes rather than managing raw math or ledger traversal.
 * - Forward-Compatible Versioned Schemas: Manages `behavioralProfiles_v1` and
 *   `deduplicationSignatures_v1` in `expenses_config.json` with auto-migration.
 * - High-Performance Mathematical Pipelines: Leverages `AggregationRollupService`
 *   to ensure sub-5ms analytics even across >10,000 transactions.
 * - Non-Destructive Ingestion: Pairs with `DataQualityAuditor` for safe data sanitization.
 * - Zero Native Dependencies: Pure JavaScript running 100% offline.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const DataQualityAuditor = require('./DataQualityAuditor');
const AggregationRollupService = require('./AggregationRollupService');
const ForesightEngine = require('../foresightEngine');
const {
  validateReconciliationBatchInput,
  validateReconciliationSingleInput,
  validateApplyReconciliationInput,
  validateSubscriptionDetectInput,
  validateForesightForecastInput
} = require('../validation/schemaValidator');

class FinancialIntelligenceFacade {
  /**
   * @param {object} options
   * @param {import('./JsonDatabase')} options.db - JsonDatabase instance
   * @param {import('./ExpenseService')} [options.expenses] - ExpenseService instance
   * @param {import('./ProfileService')} [options.profiles] - ProfileService instance
   * @param {import('./BudgetService')} [options.budget] - BudgetService instance
   * @param {import('./ReceiptLearningService')} [options.receiptLearning] - ReceiptLearningService instance
   * @param {import('./StatementReconciliationService')} [options.reconciliation] - StatementReconciliationService instance
   * @param {import('./SubscriptionHunterService')} [options.subscriptionHunter] - SubscriptionHunterService instance
   * @param {string} [options.configPath] - Explicit path override for expenses_config.json
   */
  constructor(options = {}) {
    this._db = options.db;
    this._expenses = options.expenses;
    this._profiles = options.profiles;
    this._budget = options.budget;
    this._receiptLearning = options.receiptLearning;
    this._reconciliation = options.reconciliation;
    this._subscriptionHunter = options.subscriptionHunter;

    let baseDir = process.cwd();
    if (this._db && typeof this._db.dataDir === 'string') {
      baseDir = path.dirname(this._db.dataDir);
    } else if (this._db && typeof this._db.getFilePath === 'function') {
      baseDir = path.dirname(this._db.getFilePath());
    }

    this._configPath = options.configPath || path.join(baseDir, 'expenses_config.json');
    this._rollupService = new AggregationRollupService({ db: this._db });

    // Ensure versioned schemas are present in expenses_config.json
    this.migrateConfigSchemas();
  }

  // ==========================================================================
  // 1. Versioned Schema Management & Migration (expenses_config.json)
  // ==========================================================================

  /**
   * Reads raw config JSON from disk safely.
   *
   * @private
   * @returns {Record<string, any>}
   */
  _loadConfig() {
    try {
      if (fs.existsSync(this._configPath)) {
        const raw = fs.readFileSync(this._configPath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          return parsed;
        }
      }
    } catch {
      // Fallback
    }

    return {
      version: 1
    };
  }

  /**
   * Saves updated config to disk atomically while preserving foreign keys.
   *
   * @private
   * @param {Record<string, any>} partialUpdates
   */
  _saveConfig(partialUpdates = {}) {
    try {
      const dir = path.dirname(this._configPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      let currentOnDisk = {};
      try {
        if (fs.existsSync(this._configPath)) {
          currentOnDisk = JSON.parse(fs.readFileSync(this._configPath, 'utf-8')) || {};
        }
      } catch {
        // Fallback
      }

      const merged = {
        ...currentOnDisk,
        ...partialUpdates
      };

      const tmpPath = `${this._configPath}.tmp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      fs.writeFileSync(tmpPath, JSON.stringify(merged, null, 2), 'utf-8');
      fs.renameSync(tmpPath, this._configPath);
    } catch (err) {
      console.warn('[FinancialIntelligenceFacade] Failed to save expenses_config.json:', err.message);
    }
  }

  /**
   * Scaffolds and migrates forward-compatible schemas in expenses_config.json:
   * - `behavioralProfiles_v1`
   * - `deduplicationSignatures_v1`
   *
   * @returns {{ migrated: boolean, version: number }}
   */
  migrateConfigSchemas() {
    const config = this._loadConfig();
    let mutated = false;

    // 1. Behavioral Profiles Schema (v1)
    if (!config.behavioralProfiles_v1 || typeof config.behavioralProfiles_v1 !== 'object') {
      config.behavioralProfiles_v1 = {
        version: 1,
        lastUpdated: new Date().toISOString(),
        profiles: {}
      };
      mutated = true;
    } else if (!config.behavioralProfiles_v1.profiles) {
      config.behavioralProfiles_v1.profiles = {};
      mutated = true;
    }

    // 2. Deduplication Signatures Schema (v1)
    if (!config.deduplicationSignatures_v1 || typeof config.deduplicationSignatures_v1 !== 'object') {
      config.deduplicationSignatures_v1 = {
        version: 1,
        lastIndexedAt: new Date().toISOString(),
        signatures: {}
      };
      mutated = true;
    } else if (!config.deduplicationSignatures_v1.signatures) {
      config.deduplicationSignatures_v1.signatures = {};
      mutated = true;
    }

    // 3. Pairing Security Config Schema (v1)
    if (!config.securityConfig_v1 || typeof config.securityConfig_v1 !== 'object') {
      config.securityConfig_v1 = {
        version: 1,
        maxFailedAttempts: 15,
        lockoutDurationSeconds: 60,
        lastUpdated: new Date().toISOString()
      };
      mutated = true;
    }

    if (mutated) {
      this._saveConfig({
        behavioralProfiles_v1: config.behavioralProfiles_v1,
        deduplicationSignatures_v1: config.deduplicationSignatures_v1,
        securityConfig_v1: config.securityConfig_v1
      });
    }

    return {
      migrated: mutated,
      version: 1
    };
  }

  /**
   * Retrieves pairing security configuration.
   *
   * @returns {Record<string, any>}
   */
  getPairingSecurityConfig() {
    const config = this._loadConfig();
    const sec = config.securityConfig_v1 || {};
    return {
      version: 1,
      maxFailedAttempts:
        typeof sec.maxFailedAttempts === 'number' && Number.isFinite(sec.maxFailedAttempts) && sec.maxFailedAttempts > 0
          ? sec.maxFailedAttempts
          : 15,
      lockoutDurationSeconds:
        typeof sec.lockoutDurationSeconds === 'number' && Number.isFinite(sec.lockoutDurationSeconds) && sec.lockoutDurationSeconds > 0
          ? sec.lockoutDurationSeconds
          : 60,
      enableUdpBeacon: typeof sec.enableUdpBeacon === 'boolean' ? sec.enableUdpBeacon : true,
      lastUpdated: sec.lastUpdated || new Date().toISOString()
    };
  }

  /**
   * Updates pairing security configuration with bounds sanitization.
   *
   * @param {object} newConfig
   * @returns {{ success: boolean, config: Record<string, any> }}
   */
  updatePairingSecurityConfig(newConfig = {}) {
    const safeInput = newConfig && typeof newConfig === 'object' ? newConfig : {};
    const config = this._loadConfig();
    const existing = this.getPairingSecurityConfig();

    const rawMaxAttempts =
      safeInput.maxFailedAttempts !== undefined
        ? Number(safeInput.maxFailedAttempts)
        : safeInput.maxPairingAttempts !== undefined
          ? Number(safeInput.maxPairingAttempts)
          : existing.maxFailedAttempts;

    const rawLockoutSec =
      safeInput.lockoutDurationSeconds !== undefined
        ? Number(safeInput.lockoutDurationSeconds)
        : safeInput.pairingLockoutSeconds !== undefined
          ? Number(safeInput.pairingLockoutSeconds)
          : existing.lockoutDurationSeconds;

    const maxFailedAttempts =
      Number.isFinite(rawMaxAttempts) && rawMaxAttempts > 0
        ? Math.max(1, Math.min(100, Math.floor(rawMaxAttempts)))
        : existing.maxFailedAttempts;

    const lockoutDurationSeconds =
      Number.isFinite(rawLockoutSec) && rawLockoutSec > 0
        ? Math.max(1, Math.min(3600, Math.floor(rawLockoutSec)))
        : existing.lockoutDurationSeconds;

    const enableUdpBeacon =
      typeof safeInput.enableUdpBeacon === 'boolean'
        ? safeInput.enableUdpBeacon
        : existing.enableUdpBeacon;

    config.securityConfig_v1 = {
      ...existing,
      ...safeInput,
      version: 1,
      maxFailedAttempts,
      lockoutDurationSeconds,
      enableUdpBeacon,
      lastUpdated: new Date().toISOString()
    };

    this._saveConfig({
      securityConfig_v1: config.securityConfig_v1
    });

    return { success: true, config: config.securityConfig_v1 };
  }

  /**
   * Retrieves a behavioral profile for a given profile ID.
   *
   * @param {string} profileId
   * @returns {any|null}
   */
  getBehavioralProfile(profileId) {
    const config = this._loadConfig();
    if (config.behavioralProfiles_v1 && config.behavioralProfiles_v1.profiles) {
      return config.behavioralProfiles_v1.profiles[profileId] || null;
    }
    return null;
  }

  /**
   * Updates or saves a behavioral profile in expenses_config.json.
   *
   * @param {string} profileId
   * @param {object} profileData
   * @returns {{ success: boolean, profileId: string }}
   */
  updateBehavioralProfile(profileId, profileData = {}) {
    if (!profileId || typeof profileId !== 'string') {
      return { success: false, error: 'Valid profileId is required.' };
    }

    const config = this._loadConfig();
    if (!config.behavioralProfiles_v1) {
      this.migrateConfigSchemas();
    }

    const profilesMap = config.behavioralProfiles_v1.profiles || {};
    profilesMap[profileId] = {
      profileId,
      lastCalculated: new Date().toISOString(),
      ...profileData
    };

    config.behavioralProfiles_v1.profiles = profilesMap;
    config.behavioralProfiles_v1.lastUpdated = new Date().toISOString();

    this._saveConfig({
      behavioralProfiles_v1: config.behavioralProfiles_v1
    });

    return { success: true, profileId };
  }

  /**
   * Retrieves registered deduplication signatures.
   *
   * @returns {Record<string, any>}
   */
  getDeduplicationSignatures() {
    const config = this._loadConfig();
    return (config.deduplicationSignatures_v1 && config.deduplicationSignatures_v1.signatures) || {};
  }

  /**
   * Records or updates deduplication signatures in expenses_config.json.
   *
   * @param {Record<string, any>} newSignatures
   * @returns {{ success: boolean, count: number }}
   */
  recordDeduplicationSignatures(newSignatures = {}) {
    const config = this._loadConfig();
    const existing = (config.deduplicationSignatures_v1 && config.deduplicationSignatures_v1.signatures) || {};

    const merged = {
      ...existing,
      ...newSignatures
    };

    const count = Object.keys(merged).length;
    this._saveConfig({
      deduplicationSignatures_v1: {
        version: 1,
        lastIndexedAt: new Date().toISOString(),
        signatures: merged
      }
    });

    return { success: true, count };
  }

  // ==========================================================================
  // 2. Data Quality & Integrity Auditing APIs
  // ==========================================================================

  /**
   * Resolves target transactions to audit/process.
   *
   * @private
   * @param {object} [options]
   * @returns {any[]}
   */
  _resolveExpenses(options = {}) {
    if (options && Array.isArray(options.expenses)) {
      return options.expenses;
    }
    if (this._expenses && typeof this._expenses.getAll === 'function') {
      return this._expenses.getAll({ includeArchive: options && options.includeArchive === true });
    }
    return [];
  }

  /**
   * Executes a diagnostic data quality audit across transactions.
   *
   * @param {object} [options={}]
   * @param {any[]} [options.expenses] - Optional explicit transaction array
   * @param {boolean} [options.includeArchive=false] - Whether to audit cold archive
   * @returns {import('../types').ServiceResult<import('../types').DataQualityAuditResult>}
   */
  auditLedgerQuality(options = {}) {
    try {
      const expenses = this._resolveExpenses(options);
      const report = DataQualityAuditor.audit(expenses, options);
      return {
        success: true,
        data: report
      };
    } catch (err) {
      return {
        success: false,
        error: `Ledger quality audit failed: ${err.message}`
      };
    }
  }

  /**
   * Non-destructively sanitizes transactions and optionally writes them back to DB.
   *
   * @param {object} [options={}]
   * @param {any[]} [options.expenses] - Optional explicit transaction array
   * @param {boolean} [options.applyToDb=false] - If true, persists repaired records
   * @returns {import('../types').ServiceResult<import('../types').DataQualitySanitizationResult>}
   */
  sanitizeLedgerQuality(options = {}) {
    try {
      const expenses = this._resolveExpenses(options);
      const result = DataQualityAuditor.sanitize(expenses, options);

      // If applyToDb is enabled and we have valid profiles service, persist
      if (options.applyToDb === true && this._profiles && typeof this._profiles.getActiveData === 'function') {
        const activeData = this._profiles.getActiveData();
        activeData.expenses = result.sanitizedExpenses;
        this._profiles.saveActiveData(activeData);
        this.invalidateRollupCache();
      }

      return {
        success: true,
        data: result
      };
    } catch (err) {
      return {
        success: false,
        error: `Ledger sanitization failed: ${err.message}`
      };
    }
  }

  // ==========================================================================
  // 3. Mathematical Aggregation Rollup APIs (Sub-5ms Engine)
  // ==========================================================================

  /**
   * Invalidates rollup memoization cache.
   */
  invalidateRollupCache() {
    this._rollupService.invalidateCache();
  }

  /**
   * Retrieves aggregated rollups (daily, weekly, monthly, category).
   *
   * @param {'daily'|'weekly'|'monthly'|'category'} timeframe
   * @param {object} [options={}]
   * @returns {import('../types').ServiceResult<any>}
   */
  getAggregationRollup(timeframe = 'daily', options = {}) {
    try {
      const expenses = this._resolveExpenses(options);
      const rollup = this._rollupService.getRollup(timeframe, expenses, options);
      return {
        success: true,
        data: rollup
      };
    } catch (err) {
      return {
        success: false,
        error: `Rollup computation failed: ${err.message}`
      };
    }
  }

  /**
   * Retrieves category rollup breakdown with percentages and averages.
   *
   * @param {string} [period] - Optional period filter (e.g. '2026-10')
   * @param {object} [options={}]
   * @returns {import('../types').ServiceResult<any>}
   */
  getCategoryRollup(period, options = {}) {
    try {
      const expenses = this._resolveExpenses(options);
      const combinedOptions = { ...options, period: period || options.period };
      const rollup = this._rollupService.getCategoryRollup(expenses, combinedOptions);
      return {
        success: true,
        data: rollup
      };
    } catch (err) {
      return {
        success: false,
        error: `Category rollup failed: ${err.message}`
      };
    }
  }

  /**
   * Retrieves sliding-window velocity metrics (7d, 30d, daily avg, std dev).
   *
   * @param {object} [options={}]
   * @returns {import('../types').ServiceResult<import('../types').VelocityMetrics>}
   */
  getVelocityMetrics(options = {}) {
    try {
      const expenses = this._resolveExpenses(options);
      const metrics = this._rollupService.getVelocityMetrics(expenses, options);
      return {
        success: true,
        data: metrics
      };
    } catch (err) {
      return {
        success: false,
        error: `Velocity calculation failed: ${err.message}`
      };
    }
  }

  // ==========================================================================
  // 4. Intelligence Contract Methods (Foundation for Phase 0.8.4)
  // ==========================================================================

  /**
   * Computes proactive safe-to-spend dynamic daily allowance.
   * Decouples UI from salary pacing and velocity formulas.
   *
   * @param {Date|string} [targetDate] - Target calculation date
   * @param {object} [options={}]
   * @returns {import('../types').ServiceResult<import('../types').SafeToSpendForecast>}
   */
  getSafeToSpend(targetDate = new Date(), options = {}) {
    try {
      const d = targetDate instanceof Date ? targetDate : new Date(targetDate);
      const targetDateIso = !isNaN(d.getTime()) ? d.toISOString().split('T')[0] : new Date().toISOString().split('T')[0];

      let salaryConfig = {
        monthlyIncome: 50000,
        fixedBills: 15000,
        savingsGoal: 10000,
        currencySymbol: '₹'
      };

      if (this._budget && typeof this._budget.getSalaryConfig === 'function') {
        salaryConfig = this._budget.getSalaryConfig();
      }

      const expenses = this._resolveExpenses(options);
      const velocity = this._rollupService.getVelocityMetrics(expenses, { referenceDate: targetDateIso });

      const income = Math.max(0, parseFloat(salaryConfig.monthlyIncome) || 0);
      const bills = Math.max(0, parseFloat(salaryConfig.fixedBills) || 0);
      const savings = Math.max(0, parseFloat(salaryConfig.savingsGoal) || 0);
      const discretionaryPool = Math.max(0, income - bills - savings);

      // Current month bounds
      const [yearStr, monthStr, dayStr] = targetDateIso.split('-');
      const y = parseInt(yearStr, 10);
      const m = parseInt(monthStr, 10);
      const dayOfMonth = parseInt(dayStr, 10);
      const daysInMonth = AggregationRollupService.getDaysInMonth(y, m);
      const daysRemaining = Math.max(1, daysInMonth - dayOfMonth + 1);

      // Sum spent month-to-date
      const currentMonthPrefix = `${yearStr}-${monthStr}`;
      let spentMTD = 0;
      for (let i = 0; i < expenses.length; i++) {
        const exp = expenses[i];
        if (exp && typeof exp.date === 'string' && exp.date.startsWith(currentMonthPrefix) && exp.date <= targetDateIso) {
          const amt = typeof exp.amount === 'number' ? exp.amount : parseFloat(exp.amount);
          if (!isNaN(amt) && isFinite(amt)) spentMTD += Math.max(0, amt);
        }
      }

      const remainingDiscretionary = Math.max(0, discretionaryPool - spentMTD);
      const unadjustedDaily = daysRemaining > 0 ? remainingDiscretionary / daysRemaining : 0;

      // Modulate by 7-day velocity
      let velocityAdjustment = 1.0;
      if (velocity.velocity7d > 0 && unadjustedDaily > 0) {
        if (velocity.velocity7d > unadjustedDaily * 1.3) {
          velocityAdjustment = 0.85; // Tighten allowance if recently overspending
        } else if (velocity.velocity7d < unadjustedDaily * 0.7) {
          velocityAdjustment = 1.1; // Loosen slightly if recently frugal
        }
      }

      const safeDailyAllowance = Math.round(unadjustedDaily * velocityAdjustment * 100) / 100;

      let pacingStatus = 'healthy';
      if (remainingDiscretionary <= 0 || safeDailyAllowance <= 0) {
        pacingStatus = 'critical';
      } else if (safeDailyAllowance < (discretionaryPool / daysInMonth) * 0.5) {
        pacingStatus = 'caution';
      }

      return {
        success: true,
        data: {
          targetDate: targetDateIso,
          safeDailyAllowance,
          remainingDiscretionary: Math.round(remainingDiscretionary * 100) / 100,
          daysRemaining,
          velocityAdjustment: Math.round(velocityAdjustment * 100) / 100,
          pacingStatus,
          currencySymbol: salaryConfig.currencySymbol || '₹'
        }
      };
    } catch (err) {
      return {
        success: false,
        error: `Safe to spend calculation failed: ${err.message}`
      };
    }
  }

  /**
   * Statistical outlier anomaly detection algorithm using category-level Z-scores.
   *
   * @param {object} [options={}]
   * @param {number} [options.zThreshold=2.5] - Z-score outlier cutoff
   * @param {number} [options.minAnomalyAmount=200] - Absolute minimum transaction amount to qualify
   * @returns {import('../types').ServiceResult<any>}
   */
  detectAnomalies(options = {}) {
    try {
      const zThreshold = options.zThreshold !== undefined ? options.zThreshold : 2.5;
      const minAnomalyAmount = options.minAnomalyAmount !== undefined ? options.minAnomalyAmount : 200;

      const expenses = this._resolveExpenses(options);
      if (expenses.length < 5) {
        return {
          success: true,
          data: {
            totalScanned: expenses.length,
            anomaliesFound: 0,
            anomalies: []
          }
        };
      }

      // Group amounts by category to compute category mean and std dev
      const categoryMap = {};
      for (let i = 0; i < expenses.length; i++) {
        const exp = expenses[i];
        if (!exp || typeof exp !== 'object') continue;
        const cat = exp.category || 'Uncategorized';
        const amt = typeof exp.amount === 'number' ? exp.amount : parseFloat(exp.amount);
        if (isNaN(amt) || !isFinite(amt) || amt <= 0) continue;

        if (!categoryMap[cat]) categoryMap[cat] = [];
        categoryMap[cat].push(amt);
      }

      const categoryStats = {};
      for (const [cat, amounts] of Object.entries(categoryMap)) {
        if (amounts.length < 2) {
          categoryStats[cat] = { mean: amounts[0] || 0, stdDev: 0, count: amounts.length };
          continue;
        }
        const mean = amounts.reduce((a, b) => a + b, 0) / amounts.length;
        const variance = amounts.reduce((sum, v) => sum + (v - mean) * (v - mean), 0) / (amounts.length - 1);
        const stdDev = Math.sqrt(variance);
        categoryStats[cat] = { mean, stdDev, count: amounts.length };
      }

      const anomalies = [];

      for (let j = 0; j < expenses.length; j++) {
        const exp = expenses[j];
        if (!exp || typeof exp !== 'object') continue;

        const amt = typeof exp.amount === 'number' ? exp.amount : parseFloat(exp.amount);
        if (isNaN(amt) || amt < minAnomalyAmount) continue;

        const cat = exp.category || 'Uncategorized';
        const stats = categoryStats[cat];
        if (!stats || stats.stdDev === 0) continue;

        const zScore = (amt - stats.mean) / stats.stdDev;
        if (zScore >= zThreshold) {
          let severity = 'moderate';
          if (zScore >= 4.0) severity = 'extreme';
          else if (zScore >= 3.0) severity = 'high';

          anomalies.push({
            expenseId: exp.id,
            title: exp.title || 'Untitled Expense',
            amount: amt,
            date: exp.date,
            category: cat,
            zScore: Math.round(zScore * 100) / 100,
            categoryMean: Math.round(stats.mean * 100) / 100,
            severity,
            explanation: `Amount (${amt}) is ${Math.round(zScore * 10) / 10}x standard deviations above category average (${Math.round(stats.mean)}).`
          });
        }
      }

      // Sort anomalies descending by Z-score
      anomalies.sort((a, b) => b.zScore - a.zScore);

      return {
        success: true,
        data: {
          totalScanned: expenses.length,
          anomaliesFound: anomalies.length,
          anomalies
        }
      };
    } catch (err) {
      return {
        success: false,
        error: `Anomaly detection failed: ${err.message}`
      };
    }
  }

  // ==========================================================================
  // 5. Statement Reconciliation & Smart Deduplication (Phase 0.8.3)
  // ==========================================================================

  /**
   * Lazily instantiates the StatementReconciliationService instance.
   *
   * @private
   * @returns {import('./StatementReconciliationService')}
   */
  _getReconciliationService() {
    if (!this._reconciliation) {
      const StatementReconciliationService = require('./StatementReconciliationService');
      this._reconciliation = new StatementReconciliationService({
        db: this._db,
        expenses: this._expenses,
        receiptLearning: this._receiptLearning,
        intelligence: this,
        configPath: this._configPath
      });
    }
    return this._reconciliation;
  }

  /**
   * Evaluates an array of imported statement transactions against ledger history
   * using multi-signal fuzzy matching and quick-add 1-to-1 protection.
   *
   * @param {any[]} incomingTransactions
   * @param {object} [options={}]
   * @returns {import('../types').ServiceResult<import('../types').ReconciliationBatchResult>}
   */
  reconcileStatementBatch(incomingTransactions, options = {}) {
    const val = validateReconciliationBatchInput(incomingTransactions, options);
    if (!val.valid) {
      return { success: false, error: `Invalid reconciliation batch input: ${val.errors.join(' ')}` };
    }

    try {
      const ledgerExpenses = this._resolveExpenses(options);
      const reconService = this._getReconciliationService();
      const result = reconService.reconcileBatch(incomingTransactions, ledgerExpenses, options);
      return { success: true, data: result };
    } catch (err) {
      return { success: false, error: `Batch reconciliation failed: ${err.message}` };
    }
  }

  /**
   * Evaluates a single incoming transaction against ledger history.
   *
   * @param {object} incomingTx
   * @param {object} [options={}]
   * @returns {import('../types').ServiceResult<import('../types').ReconciliationItemResult>}
   */
  reconcileStatementSingle(incomingTx, options = {}) {
    const val = validateReconciliationSingleInput(incomingTx, options);
    if (!val.valid) {
      return { success: false, error: `Invalid reconciliation single input: ${val.errors.join(' ')}` };
    }

    try {
      const ledgerExpenses = this._resolveExpenses(options);
      const reconService = this._getReconciliationService();
      const result = reconService.reconcileSingle(incomingTx, ledgerExpenses, options);
      return { success: true, data: result };
    } catch (err) {
      return { success: false, error: `Single reconciliation failed: ${err.message}` };
    }
  }

  /**
   * Applies user-approved reconciliation resolutions (merge, import, skip).
   *
   * @param {import('../types').ReconciliationResolution[]} resolutions
   * @returns {import('../types').ServiceResult<import('../types').ReconciliationApplyResult>}
   */
  applyReconciliation(resolutions) {
    const val = validateApplyReconciliationInput(resolutions);
    if (!val.valid) {
      return { success: false, error: `Invalid apply reconciliation input: ${val.errors.join(' ')}` };
    }

    try {
      const reconService = this._getReconciliationService();
      const result = reconService.applyReconciliation(resolutions);
      return { success: true, data: result };
    } catch (err) {
      return { success: false, error: `Apply reconciliation failed: ${err.message}` };
    }
  }

  // ==========================================================================
  // 6. Smart Insights, Foresight Forecasting & Subscriptions (Phase 0.8.4)
  // ==========================================================================

  /**
   * Resolves active salary configuration safely.
   *
   * @private
   * @param {object} [options={}]
   * @returns {Record<string, any>}
   */
  _resolveSalaryConfig(options = {}) {
    if (options && options.salaryConfig && typeof options.salaryConfig === 'object') {
      return options.salaryConfig;
    }
    if (this._budget && typeof this._budget.getSalaryConfig === 'function') {
      return this._budget.getSalaryConfig();
    }
    return {
      monthlyIncome: 50000,
      fixedBills: 15000,
      savingsGoal: 10000,
      currencySymbol: '₹'
    };
  }

  /**
   * Lazily instantiates SubscriptionHunterService.
   *
   * @private
   * @returns {import('./SubscriptionHunterService')}
   */
  _getSubscriptionHunterService() {
    if (!this._subscriptionHunter) {
      const SubscriptionHunterService = require('./SubscriptionHunterService');
      this._subscriptionHunter = new SubscriptionHunterService({
        db: this._db,
        expenses: this._expenses
      });
    }
    return this._subscriptionHunter;
  }

  /**
   * Identifies recurring subscriptions, vendor price hikes, and annual commitments.
   *
   * @param {object} [options={}]
   * @returns {import('../types').ServiceResult<import('../types').SubscriptionDetectionResult>}
   */
  detectSubscriptions(options = {}) {
    const val = validateSubscriptionDetectInput(options);
    if (!val.valid) {
      return { success: false, error: `Invalid subscription detect input: ${val.errors.join(' ')}` };
    }

    try {
      const expenses = this._resolveExpenses(options);
      const hunter = this._getSubscriptionHunterService();
      const result = hunter.detectSubscriptions(expenses, options);
      return { success: true, data: result };
    } catch (err) {
      return { success: false, error: `Subscription detection failed: ${err.message}` };
    }
  }

  /**
   * Computes purchase impact simulation with data-gated statistical burn rate and runway forecasting.
   *
   * @param {number} extraAmount
   * @param {object} [options={}]
   * @returns {import('../types').ServiceResult<import('../types').ForesightBurnRateResult>}
   */
  getForesightForecast(extraAmount, options = {}) {
    const val = validateForesightForecastInput(extraAmount, options);
    if (!val.valid) {
      return { success: false, error: `Invalid foresight forecast input: ${val.errors.join(' ')}` };
    }

    try {
      const salaryConfig = this._resolveSalaryConfig(options);
      const targetDate = (options && options.targetDate) || new Date();
      const expenses = this._resolveExpenses(options);

      // Compute spentMonthToDate
      const d = targetDate instanceof Date ? targetDate : new Date(targetDate);
      const yearStr = d.getFullYear();
      const monthStr = String(d.getMonth() + 1).padStart(2, '0');
      const monthPrefix = `${yearStr}-${monthStr}`;
      const targetDateIso = !isNaN(d.getTime()) ? d.toISOString().split('T')[0] : new Date().toISOString().split('T')[0];

      let spentMTD = 0;
      for (let i = 0; i < expenses.length; i++) {
        const exp = expenses[i];
        if (exp && typeof exp.date === 'string' && exp.date.startsWith(monthPrefix) && exp.date <= targetDateIso) {
          const amt = typeof exp.amount === 'number' ? exp.amount : parseFloat(exp.amount) || 0;
          if (!isNaN(amt) && isFinite(amt)) spentMTD += Math.max(0, amt);
        }
      }

      const sim = ForesightEngine.simulatePurchase(extraAmount, salaryConfig, spentMTD, targetDate, expenses);
      return { success: true, data: sim };
    } catch (err) {
      return { success: false, error: `Foresight forecast failed: ${err.message}` };
    }
  }

  /**
   * Returns gamified pacing and velocity encouragement facts.
   *
   * @param {object} [options={}]
   * @returns {import('../types').ServiceResult<import('../types').PacingInsightResult>}
   */
  getPacingInsights(options = {}) {
    try {
      const safeRes = this.getSafeToSpend(new Date(), options);
      if (!safeRes.success || !safeRes.data) {
        return safeRes;
      }

      const d = safeRes.data;
      const sym = d.currencySymbol || '₹';
      let headline = 'Pacing On Track';
      let message = `You have ${sym}${Math.round(d.safeDailyAllowance)} safe to spend today (${d.daysRemaining} days remaining). Great pacing discipline!`;

      if (d.pacingStatus === 'caution') {
        headline = 'Spending Tightening';
        message = `Daily breathing room is narrowing to ${sym}${Math.round(d.safeDailyAllowance)}/day with ${d.daysRemaining} days left. Stick to essential spends.`;
      } else if (d.pacingStatus === 'critical') {
        headline = 'Budget Exhaustion Alert';
        message = `Discretionary budget is depleted (${sym}0 remaining). Avoid non-essential expenses for the next ${d.daysRemaining} days.`;
      }

      return {
        success: true,
        data: {
          title: headline,
          message,
          safeDailyAllowance: d.safeDailyAllowance,
          daysRemaining: d.daysRemaining,
          pacingStatus: d.pacingStatus,
          currencySymbol: sym
        }
      };
    } catch (err) {
      return { success: false, error: `Pacing insight generation failed: ${err.message}` };
    }
  }
}

module.exports = FinancialIntelligenceFacade;


