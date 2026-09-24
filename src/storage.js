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

class ExpenseStorage {
  constructor(customPath) {
    this.db = new JsonDatabase(customPath);
    this.auth = new AuthService(this.db);
    this.profiles = new ProfileService(this.db);
    this.expenses = new ExpenseService(this.db, this.profiles);
    this.budget = new BudgetService(this.db, this.profiles);
    this.household = new HouseholdService(this.db, this.profiles, this.expenses);
    this.notes = new NotesService(this.db, this.profiles);
    this.notifications = new NotificationEngine(this.db, this.profiles, this.budget, this.household);
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

  clearAllExpenses() {
    return this.expenses.clearAll();
  }

  getExpenses() {
    return this.expenses.getAll();
  }

  getAllExpenses() {
    return this.expenses.getAll();
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
}

module.exports = ExpenseStorage;
