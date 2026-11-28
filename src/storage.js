/**
 * ============================================================================
 * Ledgerly — ExpenseStorage (Core Facade & Dependency Orchestrator)
 * ============================================================================
 *
 * @fileoverview
 * Master facade delegating domain capabilities across specialized subsystem services:
 * - JsonDatabase: Atomic disk persistence, backup rotations, and schema baseline.
 * - AuthService: PBKDF2 authentication, lockout defense, and session management.
 * - ProfileService: Profile lifecycle, clean-slate workspaces, and category learning.
 * - ExpenseService: Expense CRUD, query filtering, bulk ingestion, categories & presets.
 * - BudgetService: Salary allocation, payday cycles, and daily spending pace engine.
 * - HouseholdService: Multi-member expenses, split math, settlements, and utility bills.
 * - NotesService: Multi-dimensional contextual notes (transaction, day, week, month).
 * - NotificationEngine: In-app notifications, smart deduplication, and automated rules.
 *
 * ARCHITECTURAL PRINCIPLES:
 * - Facade Pattern: Exposes a stable, backwards-compatible interface for IPC and UI consumers.
 * - High Cohesion & Low Coupling: All domain logic is encapsulated inside dedicated services.
 * - Zero Breaking Changes: All legacy storage methods remain identical in signature and output.
 */

'use strict';

const JsonDatabase = require('./services/JsonDatabase');
const AuthService = require('./services/AuthService');
const ProfileService = require('./services/ProfileService');
const ExpenseService = require('./services/ExpenseService');
const BudgetService = require('./services/BudgetService');
const HouseholdService = require('./services/HouseholdService');
const NotesService = require('./services/NotesService');
const NotificationEngine = require('./services/NotificationEngine');
const BackupMirrorService = require('./services/BackupMirrorService');
const ReceiptLearningService = require('./services/ReceiptLearningService');
const ReceiptEngine = require('./services/ReceiptEngine');
const DatabaseAuditor = require('./services/DatabaseAuditor');
const AggregationRollupService = require('./services/AggregationRollupService');
const StatementReconciliationService = require('./services/StatementReconciliationService');
const FinancialIntelligenceFacade = require('./services/FinancialIntelligenceFacade');
const SubscriptionHunterService = require('./services/SubscriptionHunterService');
const ForesightEngine = require('./foresightEngine');
const {
  validateReconciliationBatchInput,
  validateReconciliationSingleInput,
  validateApplyReconciliationInput,
  validateSubscriptionDetectInput,
  validateForesightForecastInput
} = require('./validation/schemaValidator');

class ExpenseStorage {
  constructor(customPath) {
    this.db = new JsonDatabase(customPath);
    this.auth = new AuthService(this.db);
    this.profiles = new ProfileService(this.db);
    this.expenses = new ExpenseService(this.db, this.profiles);
    this.budget = new BudgetService(this.db, this.profiles);
    this.household = new HouseholdService(this.db, this.profiles, this.expenses);
    this.notes = new NotesService(this.db, this.profiles);
    this.notifications = new NotificationEngine(
      this.db,
      this.profiles,
      this.budget,
      this.household
    );
    this.mirror = new BackupMirrorService({ db: this.db });
    this.receiptLearning = new ReceiptLearningService({ db: this.db });
    this.receiptEngine = new ReceiptEngine({ receiptLearning: this.receiptLearning });
    this.databaseAuditor = DatabaseAuditor;
    this.auditor = DatabaseAuditor;
    this.rollup = new AggregationRollupService({ db: this.db });
    this.rollups = this.rollup;
    this.foresight = ForesightEngine;
    this.reconciliation = new StatementReconciliationService({
      db: this.db,
      expenses: this.expenses,
      receiptLearning: this.receiptLearning,
      receiptEngine: this.receiptEngine
    });
    this.subscriptionHunter = new SubscriptionHunterService({
      db: this.db,
      expenses: this.expenses
    });
    this.intelligence = new FinancialIntelligenceFacade({
      db: this.db,
      expenses: this.expenses,
      profiles: this.profiles,
      budget: this.budget,
      receiptLearning: this.receiptLearning,
      subscriptionHunter: this.subscriptionHunter,
      reconciliation: this.reconciliation,
      rollups: this.rollup,
      auditor: this.databaseAuditor
    });
    this.notifications.setIntelligence(this.intelligence);
    this.notifications.setDomainServices({
      storage: this,
      intelligence: this.intelligence,
      hunter: this.subscriptionHunter,
      rollups: this.rollups,
      budget: this.budget
    });
    this.db.setOnDidWrite(() => {
      this.mirror.notifyChange();
      this.rollups.invalidateCache();
      this.intelligence.invalidateRollupCache();
    });
    this.filePath = this.db.getFilePath();
  }

  _hashPassword(password, salt, iterations = 210000) {
    return this.auth._hashPassword(password, salt, iterations);
  }

  get _lockoutUntil() {
    return this.auth._lockoutUntil;
  }
  set _lockoutUntil(val) {
    this.auth._lockoutUntil = val;
  }

  get _failedLoginAttempts() {
    return this.auth._failedAttempts;
  }
  set _failedLoginAttempts(val) {
    this.auth._failedAttempts = val;
  }

  _getDefaultCategories() {
    return this.profiles.getDefaultCategories();
  }

  _getDefaultPresets() {
    return this.profiles.getDefaultPresets();
  }

  _getDefaultSalaryConfig() {
    return this.profiles.getDefaultSalaryConfig();
  }

  _createEmptyProfileData() {
    return this.profiles.createEmptyProfileData();
  }

  ensureStorageExists() {
    return this.db.ensureStorageExists();
  }

  _getRootData() {
    return this.db.read();
  }

  _saveRootData(rootData) {
    return this.db.write(rootData);
  }

  // ==========================================================================
  // Account Authentication & Remember-Me APIs
  // ==========================================================================

  getAccountStatus() {
    return this.auth.getStatus();
  }

  setupAccount(payload = {}) {
    return this.auth.setup(payload);
  }

  loginAccount(payload = {}) {
    return this.auth.login(payload);
  }

  logoutAccount() {
    return this.auth.logout();
  }

  setupVault(payload = {}) {
    return this.auth.setupVault(payload);
  }

  unlockVault(payload = {}) {
    return this.auth.unlockWithPassword(payload.password, payload);
  }

  recoverVault(payload = {}) {
    return this.auth.resetPasswordWithRecoveryKey(payload.recoveryKey, payload.newPassword);
  }

  getRecoveryKey() {
    return this.db.rotateVaultRecoveryKey();
  }

  lockVault() {
    return this.db.lockVault();
  }

  factoryResetVault() {
    return this.auth.factoryResetVault();
  }

  changePassword(payload = {}) {
    return this.auth.changePassword(payload.currentPassword, payload.newPassword);
  }

  updateAccountPreferences(prefs = {}) {
    return this.auth.updatePreferences(prefs);
  }

  getWorkspaceMode() {
    return this.auth.getWorkspaceMode();
  }

  setWorkspaceMode(mode) {
    return this.auth.setWorkspaceMode(mode);
  }

  getCategoryKeywords() {
    return this.profiles.getCategoryKeywords();
  }

  learnCategoryKeyword(keyword, category) {
    return this.profiles.learnCategoryKeyword(keyword, category);
  }

  getData() {
    return this.profiles.getActiveData();
  }

  getActiveData() {
    return this.profiles.getActiveData();
  }

  saveData(data) {
    return this.profiles.saveActiveData(data);
  }

  saveActiveData(data) {
    return this.profiles.saveActiveData(data);
  }

  getProfileData(profileId) {
    return this.profiles.getProfileData(profileId);
  }

  saveProfileData(profileId, data) {
    return this.profiles.saveProfileData(profileId, data);
  }

  getActiveProfileId() {
    const active = this.getActiveProfile();
    return active ? active.id : null;
  }

  getProfiles() {
    return this.profiles.getAll();
  }

  getActiveProfile() {
    return this.profiles.getActive();
  }

  switchProfile(profileId) {
    return this.profiles.switchTo(profileId);
  }

  createProfile(profileInput = {}) {
    return this.profiles.create(profileInput);
  }

  updateProfile(profileInput = {}) {
    return this.profiles.update(profileInput);
  }

  deleteProfile(profileId) {
    return this.profiles.delete(profileId);
  }

  getCombinedExpenses() {
    return this.profiles.getCombinedExpenses();
  }

  addExpense(expense) {
    return this.expenses.add(expense);
  }

  updateExpense(updated) {
    return this.expenses.update(updated);
  }

  deleteExpense(id) {
    return this.expenses.delete(id);
  }

  clearAllExpenses(options) {
    return this.expenses.clearAll(options);
  }

  getExpenses(options) {
    return this.expenses.getAll(options);
  }

  getAllExpenses(options) {
    return this.expenses.getAll(options);
  }

  getFilteredExpenses(filters = {}) {
    return this.expenses.getFiltered(filters);
  }

  addCategory(categoryName) {
    return this.expenses.addCategory(categoryName);
  }

  deleteCategory(categoryName) {
    return this.expenses.deleteCategory(categoryName);
  }

  getCategories() {
    return this.expenses.getCategories();
  }

  getPresets() {
    return this.expenses.getPresets();
  }

  addPreset(preset) {
    return this.expenses.addPreset(preset);
  }

  updatePreset(updated) {
    return this.expenses.updatePreset(updated);
  }

  deletePreset(id) {
    return this.expenses.deletePreset(id);
  }

  // --- Flexible Salary Allocator & Payday Cycle Engine (v0.2) ---

  setBudgetGoal(amount) {
    return this.budget.setBudgetGoal(amount);
  }

  getSalaryConfig() {
    return this.budget.getSalaryConfig();
  }

  setSalaryConfig(config) {
    return this.budget.setSalaryConfig(config);
  }

  _getSalaryCycleDates(salaryConfig, targetDateStr = null) {
    return this.budget.getSalaryCycleDates(salaryConfig, targetDateStr);
  }

  calculateDailyBudgetMetrics(targetDateStr) {
    return this.budget.calculateDailyBudgetMetrics(targetDateStr);
  }

  getDailyBudgetMetrics(targetDateStr) {
    return this.budget.getDailyBudgetMetrics(targetDateStr);
  }

  calculateDailyImpact(additionalAmount, targetDateStr = null) {
    return this.budget.calculateDailyImpact(additionalAmount, targetDateStr);
  }

  // --- Phase 4: Shared Household Member & Split Calculation Engine ---

  getHouseholdMembers() {
    return this.household.getMembers();
  }

  addHouseholdMember(name) {
    return this.household.addMember(name);
  }

  deleteHouseholdMember(name) {
    return this.household.deleteMember(name);
  }

  _ensureSettlements(root) {
    return this.household._ensureSettlements(root);
  }

  _ensureRecurringBills(root) {
    return this.household._ensureRecurringBills(root);
  }

  getSettlements() {
    return this.household.getSettlements();
  }

  addSettlement(settlementData) {
    return this.household.addSettlement(settlementData);
  }

  deleteSettlement(id) {
    return this.household.deleteSettlement(id);
  }

  getRecurringBills() {
    return this.household.getRecurringBills();
  }

  saveRecurringBill(billData) {
    return this.household.saveRecurringBill(billData);
  }

  deleteRecurringBill(id) {
    return this.household.deleteRecurringBill(id);
  }

  markRecurringBillPaid(id, paymentDetails = {}) {
    return this.household.markRecurringBillPaid(id, paymentDetails);
  }

  calculateHouseholdSettlement() {
    return this.household.calculateHouseholdSettlement();
  }

  getHouseholdSettlement() {
    return this.household.getHouseholdSettlement();
  }

  // --- Phase 5: Bulk Import ---

  /**
   * Bulk inserts an array of parsed expenses from file import.
   * @param {Array} expenseArray - Array of expense objects with at least { title, amount, date }
   * @returns {{ success: boolean, imported: number, errors: string[] }}
   */
  bulkAddExpenses(expenseArray) {
    return this.expenses.bulkAdd(expenseArray);
  }

  /**
   * Atomically deletes multiple expenses by ID.
   * @param {string[]} idsArray
   * @returns {{ success: boolean, deletedCount: number, deletedIds: string[], deletedExpenses: import('./types').Expense[] }}
   */
  bulkDeleteExpenses(idsArray) {
    return this.expenses.bulkDelete(idsArray);
  }

  // --- Phase 5: Contextual Notes System ---

  _ensureNotes(data) {
    return this.notes._ensureNotes(data);
  }

  getNotes(filters = {}) {
    return this.notes.getNotes(filters);
  }

  getNotesForExpense(expenseId) {
    return this.notes.getNotesForExpense(expenseId);
  }

  getNotesForDate(dateStr) {
    return this.notes.getNotesForDate(dateStr);
  }

  getNotesForWeek(weekStr) {
    return this.notes.getNotesForWeek(weekStr);
  }

  getNotesForMonth(monthStr) {
    return this.notes.getNotesForMonth(monthStr);
  }

  addNote(note) {
    return this.notes.addNote(note);
  }

  getExpenseById(id) {
    return this.expenses.getById(id);
  }

  updateNote(updated) {
    return this.notes.updateNote(updated);
  }

  deleteNote(id) {
    return this.notes.deleteNote(id);
  }

  // ==========================================================================
  // Ledgerly v0.2 Phase 3: Persistent Active Notifications Engine
  // ==========================================================================

  _getDefaultNotificationConfig() {
    return this.notifications.getDefaultConfig();
  }

  getNotificationConfig() {
    return this.notifications.getConfig();
  }

  saveNotificationConfig(cfg) {
    return this.notifications.saveConfig(cfg);
  }

  getNotifications() {
    return this.notifications.getNotifications();
  }

  addNotification(notif) {
    return this.notifications.addNotification(notif);
  }

  markNotificationRead(id) {
    return this.notifications.markNotificationRead(id);
  }

  markAllNotificationsRead() {
    return this.notifications.markAllNotificationsRead();
  }

  deleteNotification(id) {
    return this.notifications.deleteNotification(id);
  }

  clearAllNotifications() {
    return this.notifications.clearAllNotifications();
  }

  evaluateAutoNotifications() {
    return this.notifications.evaluateAutoNotifications();
  }

  // ==========================================================================
  // Ledgerly v0.4 Phase 7: Integrity Auditor & Telemetry Diagnostics
  // ==========================================================================

  runIntegrityAudit() {
    return this.db.runIntegrityAudit();
  }

  getPartitionStats() {
    return typeof this.db.getPartitionStats === 'function'
      ? this.db.getPartitionStats()
      : { isPartitioned: false };
  }

  rollAgedExpenses(cutoffDays = 90) {
    const DatabaseAuditor = require('./services/DatabaseAuditor');
    return DatabaseAuditor.rollAgedExpenses(this.db, cutoffDays);
  }

  auditDatabase() {
    const DatabaseAuditor = require('./services/DatabaseAuditor');
    return DatabaseAuditor.auditAndRepair(this.db);
  }

  generateDiagnosticReport(appVersion = '0.4.7') {
    const DiagnosticExporter = require('./services/DiagnosticExporter');
    return DiagnosticExporter.generateReport(this.db, appVersion);
  }

  // ==========================================================================
  // Mobile LAN Pairing & Synced Devices Management (Phase 0.6.3)
  // ==========================================================================

  getPairedDevices() {
    const root = this.db.read();
    const devices = Array.isArray(root.pairedDevices) ? root.pairedDevices : [];
    // Return sanitized copy excluding tokenHash for security
    return devices.map(d => ({
      deviceId: d.deviceId,
      deviceName: d.deviceName,
      pairedAt: d.pairedAt,
      lastSeenAt: d.lastSeenAt,
      permissions: d.permissions || ['sync:push', 'sync:pull', 'sync:receipt']
    }));
  }

  addPairedDevice(device) {
    if (!device || !device.deviceId || !device.tokenHash) {
      return { success: false, error: 'Invalid device payload' };
    }
    const root = this.db.read();
    if (!Array.isArray(root.pairedDevices)) {
      root.pairedDevices = [];
    }
    const existingIdx = root.pairedDevices.findIndex(d => d.deviceId === device.deviceId);
    const record = {
      deviceId: device.deviceId,
      deviceName: device.deviceName || 'Mobile Companion',
      tokenHash: device.tokenHash,
      targetProfileId: device.targetProfileId || null,
      pairedAt: device.pairedAt || new Date().toISOString(),
      lastSeenAt: device.lastSeenAt || new Date().toISOString(),
      permissions: device.permissions || ['sync:push', 'sync:pull', 'sync:receipt']
    };
    if (existingIdx !== -1) {
      root.pairedDevices[existingIdx] = record;
    } else {
      root.pairedDevices.push(record);
    }
    this.db.write(root);
    return { success: true, device: record };
  }

  findPairedDeviceByTokenHash(tokenHash) {
    if (!tokenHash) return null;
    const root = this.db.read();
    const devices = Array.isArray(root.pairedDevices) ? root.pairedDevices : [];
    return devices.find(d => d.tokenHash === tokenHash) || null;
  }

  updatePairedDeviceLastSeen(deviceId) {
    if (!deviceId) return false;
    const root = this.db.read();
    const devices = Array.isArray(root.pairedDevices) ? root.pairedDevices : [];
    const target = devices.find(d => d.deviceId === deviceId);
    if (target) {
      target.lastSeenAt = new Date().toISOString();
      this.db.write(root);
      return true;
    }
    return false;
  }

  revokePairedDevice(deviceId) {
    if (!deviceId) return { success: false, error: 'Device ID is required' };
    const root = this.db.read();
    if (!Array.isArray(root.pairedDevices)) {
      return { success: true, removed: false };
    }
    const initialLen = root.pairedDevices.length;
    root.pairedDevices = root.pairedDevices.filter(d => d.deviceId !== deviceId);
    this.db.write(root);
    return { success: true, removed: root.pairedDevices.length < initialLen };
  }

  // ==========================================================================
  // Continuous Mirroring & Local Backup Vault Engine (Phase 0.7.3)
  // ==========================================================================

  getMirrorStatus() {
    return this.mirror.getStatus();
  }

  configureMirror(payload = {}) {
    return this.mirror.configure(payload);
  }

  syncMirrorNow() {
    return this.mirror.syncNow();
  }

  verifyMirrorVault(vaultDir) {
    return this.mirror.verifyVault(vaultDir);
  }

  restoreFromMirrorVault(vaultDir) {
    return this.mirror.restoreFromVault(vaultDir);
  }

  // ==========================================================================
  // Adaptive Receipt Vision & Learning Loop (Phase 0.8.1)
  // ==========================================================================

  getMerchantAliases() {
    return this.receiptLearning.getAliases();
  }

  learnMerchantAlias(rawMerchant, canonicalMerchant) {
    return this.receiptLearning.learnAlias(rawMerchant, canonicalMerchant);
  }

  resolveMerchantAlias(rawMerchant) {
    return this.receiptLearning.resolveAlias(rawMerchant);
  }

  deleteMerchantAlias(rawMerchant) {
    return this.receiptLearning.deleteAlias(rawMerchant);
  }

  clearMerchantAliases() {
    return this.receiptLearning.clearAliases();
  }

  getMerchantLayouts() {
    return this.receiptLearning.getLayouts();
  }

  getMerchantLayout(identifier) {
    return this.receiptLearning.getLayout(identifier);
  }

  learnMerchantLayout(identifier, layoutData = {}) {
    return this.receiptLearning.learnLayout(identifier, layoutData);
  }

  clearMerchantLayouts() {
    return this.receiptLearning.clearLayouts();
  }

  // ==========================================================================
  // Longitudinal Accuracy Telemetry & Self-Learning (Phase 1.3.0)
  // ==========================================================================

  learnFromCorrection(correction) {
    if (!this.receiptLearning) return { success: false, error: 'ReceiptLearningService not initialized' };
    return this.receiptLearning.learnFromCorrection(correction);
  }

  getReceiptAccuracyScoreboard(referenceDate) {
    if (!this.receiptLearning) return null;
    return this.receiptLearning.getAccuracyScoreboard(referenceDate);
  }

  recordReceiptAccuracyEvent(event) {
    if (!this.receiptLearning) return { success: false, error: 'ReceiptLearningService not initialized' };
    return this.receiptLearning.recordReceiptEvent(event);
  }

  clearReceiptAccuracyTelemetry() {
    if (!this.receiptLearning) return { success: false, error: 'ReceiptLearningService not initialized' };
    return this.receiptLearning.clearTelemetry();
  }

  // ==========================================================================
  // EDA & Financial Intelligence Foundation (Phase 0.8.2)
  // ==========================================================================

  // ==========================================================================
  // Helper: In-Memory / Target Ledger Resolution
  // ==========================================================================

  _resolveExpenses(options = {}) {
    if (options && Array.isArray(options.expenses)) {
      return options.expenses;
    }
    if (this.expenses && typeof this.expenses.getAll === 'function') {
      return this.expenses.getAll({ includeArchive: options && options.includeArchive === true });
    }
    return [];
  }

  // ==========================================================================
  // EDA & Financial Intelligence Foundation (Milestone v1.2.0 Direct Domain Routing)
  // ==========================================================================

  auditLedgerQuality(options = {}) {
    try {
      const expenses = this._resolveExpenses(options);
      const report = this.auditor.auditDataset(expenses, options);
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

  sanitizeLedgerQuality(options = {}) {
    try {
      const expenses = this._resolveExpenses(options);
      const result = this.auditor.sanitizeExpenseList(expenses, options);

      if (options && options.applyToDb === true && this.profiles && typeof this.profiles.getActiveData === 'function') {
        const activeData = this.profiles.getActiveData();
        activeData.expenses = result.sanitizedExpenses;
        this.profiles.saveActiveData(activeData);
        if (this.rollups) this.rollups.invalidateCache();
        if (this.intelligence) this.intelligence.invalidateRollupCache();
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

  getAggregationRollup(timeframe = 'daily', options = {}) {
    try {
      const expenses = this._resolveExpenses(options);
      const rollup = this.rollups.getRollup(timeframe, expenses, options);
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

  getCategoryRollup(period, options = {}) {
    try {
      const expenses = this._resolveExpenses(options);
      const combinedOptions = { ...options, period: period || (options && options.period) };
      const rollup = this.rollups.getCategoryRollup(expenses, combinedOptions);
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

  getVelocityMetrics(options = {}) {
    try {
      const expenses = this._resolveExpenses(options);
      const metrics = this.rollups.getVelocityMetrics(expenses, options);
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

      if (this.budget && typeof this.budget.getSalaryConfig === 'function') {
        salaryConfig = this.budget.getSalaryConfig();
      }

      const expenses = this._resolveExpenses(options);
      const velocity = this.rollups.getVelocityMetrics(expenses, { referenceDate: targetDateIso });

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

  detectAnomalies(options = {}) {
    return this.intelligence.detectAnomalies(options);
  }

  getBehavioralProfile(profileId) {
    return this.intelligence.getBehavioralProfile(profileId);
  }

  updateBehavioralProfile(profileId, profileData) {
    return this.intelligence.updateBehavioralProfile(profileId, profileData);
  }

  getDeduplicationSignatures() {
    return this.intelligence.getDeduplicationSignatures();
  }

  recordDeduplicationSignatures(signatures) {
    return this.intelligence.recordDeduplicationSignatures(signatures);
  }

  // ==========================================================================
  // Statement Reconciliation & Fuzzy Deduplication (Phase 0.8.3)
  // ==========================================================================

  reconcileStatementBatch(incomingTransactions, options = {}) {
    const val = validateReconciliationBatchInput(incomingTransactions, options);
    if (!val.valid) {
      return { success: false, error: `Invalid reconciliation batch input: ${val.errors.join(' ')}` };
    }

    try {
      const ledgerExpenses = this._resolveExpenses(options);
      const result = this.reconciliation.reconcileBatch(incomingTransactions, ledgerExpenses, options);
      return { success: true, data: result };
    } catch (err) {
      return { success: false, error: `Batch reconciliation failed: ${err.message}` };
    }
  }

  reconcileStatementSingle(incomingTransaction, options = {}) {
    const val = validateReconciliationSingleInput(incomingTransaction, options);
    if (!val.valid) {
      return { success: false, error: `Invalid reconciliation single input: ${val.errors.join(' ')}` };
    }

    try {
      const ledgerExpenses = this._resolveExpenses(options);
      const result = this.reconciliation.reconcileSingle(incomingTransaction, ledgerExpenses, options);
      return { success: true, data: result };
    } catch (err) {
      return { success: false, error: `Single reconciliation failed: ${err.message}` };
    }
  }

  applyReconciliation(resolutions, options = {}) {
    const val = validateApplyReconciliationInput(resolutions);
    if (!val.valid) {
      return { success: false, error: `Invalid apply reconciliation input: ${val.errors.join(' ')}` };
    }

    try {
      const result = typeof this.reconciliation.applyResolutions === 'function'
        ? this.reconciliation.applyResolutions(resolutions, options)
        : this.reconciliation.applyReconciliation(resolutions, options);
      return { success: true, data: result };
    } catch (err) {
      return { success: false, error: `Apply reconciliation failed: ${err.message}` };
    }
  }

  // ==========================================================================
  // Smart Insights, Foresight Forecasting & Subscriptions (Phase 0.8.4)
  // ==========================================================================

  detectSubscriptions(options = {}) {
    const val = validateSubscriptionDetectInput(options);
    if (!val.valid) {
      return { success: false, error: `Invalid subscription detect input: ${val.errors.join(' ')}` };
    }

    try {
      const expenses = this._resolveExpenses(options);
      const result = this.subscriptionHunter.detectSubscriptions(expenses, options);
      return { success: true, data: result };
    } catch (err) {
      return { success: false, error: `Subscription detection failed: ${err.message}` };
    }
  }

  /**
   * Generates a comprehensive summary of recurring subscriptions, upcoming renewals,
   * price jumps, and total annualized commitments for the active profile.
   *
   * @param {object} [options={}]
   * @returns {{
   *   subscriptions: Array,
   *   totalAnnualizedCommitment: number,
   *   monthlyCommitment: number,
   *   upcomingRenewals: Array,
   *   priceJumps: Array
   * }}
   */
  getSubscriptionsSummary(options = {}) {
    const data = this.profiles.getActiveData();
    const dismissed = Array.isArray(data.dismissedSubscriptionAlerts) ? data.dismissedSubscriptionAlerts : [];
    const expenses = this.expenses.getAll(options);
    const result = this.subscriptionHunter.detectSubscriptions(expenses, options);
    const subscriptions = (result.subscriptions || []).map(sub => ({
      ...sub,
      isDismissed: dismissed.includes(sub.id)
    }));

    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    const upcomingRenewals = subscriptions.filter(s => {
      if (!s.nextExpectedDate || s.isDismissed) return false;
      const daysDiff = this.subscriptionHunter._daysDifference(todayStr, s.nextExpectedDate);
      return daysDiff >= 0 && daysDiff <= 14;
    });

    const priceJumps = subscriptions
      .filter(s => s.hasPriceHike && s.priceHikeDetails && !s.isDismissed)
      .map(s => ({
        id: s.id,
        merchant: s.merchant,
        cadence: s.cadence,
        ...s.priceHikeDetails
      }));

    return {
      subscriptions,
      totalAnnualizedCommitment: result.summary ? result.summary.totalAnnualCommitment : 0,
      monthlyCommitment: result.summary ? result.summary.totalMonthlyCommitment : 0,
      upcomingRenewals,
      priceJumps
    };
  }

  /**
   * Persistently dismisses a subscription alert (e.g. price hike or renewal notice) for the active profile.
   *
   * @param {string} subscriptionId
   * @returns {{ success: boolean, dismissedId?: string, error?: string }}
   */
  dismissSubscriptionAlert(subscriptionId) {
    if (!subscriptionId || typeof subscriptionId !== 'string') {
      return { success: false, error: 'Subscription ID is required' };
    }
    const data = this.profiles.getActiveData();
    if (!Array.isArray(data.dismissedSubscriptionAlerts)) {
      data.dismissedSubscriptionAlerts = [];
    }
    if (!data.dismissedSubscriptionAlerts.includes(subscriptionId)) {
      data.dismissedSubscriptionAlerts.push(subscriptionId);
      this.profiles.saveActiveData(data);
    }
    return { success: true, dismissedId: subscriptionId };
  }

  getForesightForecast(extraAmount, options = {}) {
    const val = validateForesightForecastInput(extraAmount, options);
    if (!val.valid) {
      return { success: false, error: `Invalid foresight forecast input: ${val.errors.join(' ')}` };
    }

    try {
      const salaryConfig = (options && options.salaryConfig) ||
        (this.budget && typeof this.budget.getSalaryConfig === 'function'
          ? this.budget.getSalaryConfig()
          : {
              monthlyIncome: 50000,
              fixedBills: 15000,
              savingsGoal: 10000,
              currencySymbol: '₹'
            });
      const expenses = this._resolveExpenses(options);
      const sim = ForesightEngine.forecast(extraAmount, options, { salaryConfig, expenses });
      return { success: true, data: sim };
    } catch (err) {
      return { success: false, error: `Foresight forecast failed: ${err.message}` };
    }
  }

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

module.exports = ExpenseStorage;


