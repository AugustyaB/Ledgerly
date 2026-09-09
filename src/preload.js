/**
 * ============================================================================
 * Ledgerly — Preload IPC Bridge & Safe Invoker (Phase 5)
 * ============================================================================
 * 
 * @fileoverview
 * Electron contextBridge script exposing sanitized, safe `window.electronAPI`
 * to the renderer process. Integrates with the Phase 5 standardized response
 * envelope contract.
 */

'use strict';

const { contextBridge, ipcRenderer } = require('electron');

/**
 * Safe IPC invocation bridge.
 * Ensures uniform handling of standardized envelopes:
 * - Array responses: attached with `.success = true` and `.data = arr` for dual array and envelope compatibility.
 * - Object responses: preserves `.success`, `.data`, and all payload properties.
 * - Failure responses: returns standardized `{ success: false, error, code, details }`.
 * 
 * @param {string} channel - The IPC channel name.
 * @param {...any} args - Invocations arguments.
 * @returns {Promise<any>}
 */
async function invokeIPC(channel, ...args) {
  const res = await ipcRenderer.invoke(channel, ...args);
  if (res && typeof res === 'object' && res.success === true && Array.isArray(res.data)) {
    const arr = res.data;
    arr.success = true;
    arr.data = res.data;
    return arr;
  }
  return res;
}

contextBridge.exposeInMainWorld('electronAPI', {
  // Window controls
  minimizeWindow: () => ipcRenderer.send('window-minimize'),
  maximizeWindow: () => ipcRenderer.send('window-maximize'),
  closeWindow: () => ipcRenderer.send('window-close'),

  // Account Authentication & Remember-Me
  getAccountStatus: () => invokeIPC('account-get-status'),
  setupAccount: (payload) => invokeIPC('account-setup', payload),
  loginAccount: (payload) => invokeIPC('account-login', payload),
  logoutAccount: () => invokeIPC('account-logout'),
  updateAccountPreferences: (prefs) => invokeIPC('account-update-prefs', prefs),

  // Multi-User Profile Management
  getProfiles: () => invokeIPC('get-profiles'),
  getActiveProfile: () => invokeIPC('get-active-profile'),
  switchProfile: (profileId) => invokeIPC('switch-profile', profileId),
  createProfile: (profileData) => invokeIPC('create-profile', profileData),
  updateProfile: (profileData) => invokeIPC('update-profile', profileData),
  deleteProfile: (profileId) => invokeIPC('delete-profile', profileId),

  // Storage CRUD & Query operations
  getExpenses: () => invokeIPC('get-expenses'),
  getCombinedExpenses: () => invokeIPC('get-combined-expenses'),
  getExpenseById: (id) => invokeIPC('get-expense-by-id', id),
  getFilteredExpenses: (filters) => invokeIPC('get-filtered-expenses', filters),
  addExpense: (expense) => invokeIPC('add-expense', expense),
  updateExpense: (expense) => invokeIPC('update-expense', expense),
  deleteExpense: (id) => invokeIPC('delete-expense', id),
  setBudgetGoal: (amount) => invokeIPC('set-budget-goal', amount),

  // Category Management
  addCategory: (categoryName) => invokeIPC('add-category', categoryName),
  deleteCategory: (categoryName) => invokeIPC('delete-category', categoryName),

  // Preset Management
  getPresets: () => invokeIPC('get-presets'),
  addPreset: (preset) => invokeIPC('add-preset', preset),
  updatePreset: (preset) => invokeIPC('update-preset', preset),
  deletePreset: (id) => invokeIPC('delete-preset', id),

  // Salary Allocator & Daily Budget
  getSalaryConfig: () => invokeIPC('get-salary-config'),
  setSalaryConfig: (config) => invokeIPC('set-salary-config', config),
  getDailyBudgetMetrics: (targetDateStr) => invokeIPC('get-daily-budget-metrics', targetDateStr),

  // Household Members & Split Settlement
  getHouseholdMembers: () => invokeIPC('get-household-members'),
  addHouseholdMember: (name) => invokeIPC('add-household-member', name),
  deleteHouseholdMember: (name) => invokeIPC('delete-household-member', name),
  getHouseholdSettlement: () => invokeIPC('get-household-settlement'),

  // Settlements & Repayments
  getSettlements: () => invokeIPC('get-settlements'),
  addSettlement: (settlementData) => invokeIPC('add-settlement', settlementData),
  deleteSettlement: (id) => invokeIPC('delete-settlement', id),

  // Recurring Utility Bills
  getRecurringBills: () => invokeIPC('get-recurring-bills'),
  saveRecurringBill: (billData) => invokeIPC('save-recurring-bill', billData),
  deleteRecurringBill: (id) => invokeIPC('delete-recurring-bill', id),
  markRecurringBillPaid: (id, paymentDetails) => invokeIPC('mark-recurring-bill-paid', id, paymentDetails),

  // Receipt Image Storage
  selectReceiptFile: () => invokeIPC('select-receipt-file'),
  saveReceipt: (sourceFilePath) => invokeIPC('save-receipt', sourceFilePath),
  deleteReceipt: (filename) => invokeIPC('delete-receipt', filename),
  getReceiptPath: (filename) => invokeIPC('get-receipt-path', filename),

  // File Exports
  exportCSV: () => invokeIPC('export-csv'),
  exportJSON: () => invokeIPC('export-json'),
  exportExcel: () => invokeIPC('export-excel'),

  // File Import
  importFile: () => invokeIPC('import-file'),
  importFilePath: (filePath) => invokeIPC('import-file-path', filePath),
  confirmImport: (expenses) => invokeIPC('confirm-import', expenses),

  // Contextual Notes
  getNotes: (filters) => invokeIPC('get-notes', filters),
  getNotesForExpense: (expenseId) => invokeIPC('get-notes-for-expense', expenseId),
  getNotesForDate: (dateStr) => invokeIPC('get-notes-for-date', dateStr),
  getNotesForWeek: (weekStr) => invokeIPC('get-notes-for-week', weekStr),
  getNotesForMonth: (monthStr) => invokeIPC('get-notes-for-month', monthStr),
  addNote: (note) => invokeIPC('add-note', note),
  updateNote: (note) => invokeIPC('update-note', note),
  deleteNote: (id) => invokeIPC('delete-note', id),

  // Frictionless UX & Ambient Intelligence
  saveReceiptBuffer: (bufferBase64) => invokeIPC('save-receipt-buffer', bufferBase64),
  hideQuickPill: () => invokeIPC('quick-pill-hide'),
  submitQuickPillExpense: (expenseData) => invokeIPC('quick-pill-submit', expenseData),
  nlpParse: (phrase, knownMembers) => invokeIPC('nlp-parse', phrase, knownMembers),
  predictCategory: (title) => invokeIPC('predict-category', title),
  learnCategoryKeyword: (keyword, category) => invokeIPC('learn-category-keyword', keyword, category),
  getCategoryKeywords: () => invokeIPC('get-category-keywords'),
  deleteCategoryKeyword: (keyword) => invokeIPC('delete-category-keyword', keyword),
  getStorageDiagnostics: () => invokeIPC('get-storage-diagnostics'),
  clearAllExpenses: () => invokeIPC('clear-all-expenses'),
  simulateWhatIf: (extraAmount, targetDateStr) => invokeIPC('simulate-what-if', extraAmount, targetDateStr),
  getWorkspaceMode: () => invokeIPC('get-workspace-mode'),
  setWorkspaceMode: (mode) => invokeIPC('set-workspace-mode', mode),

  // Notifications Engine APIs
  getNotifications: () => invokeIPC('get-notifications'),
  evaluateNotifications: () => invokeIPC('evaluate-notifications'),
  addNotification: (notif) => invokeIPC('add-notification', notif),
  markNotificationRead: (id) => invokeIPC('mark-notification-read', id),
  markAllNotificationsRead: () => invokeIPC('mark-all-notifications-read'),
  deleteNotification: (id) => invokeIPC('delete-notification', id),
  clearAllNotifications: () => invokeIPC('clear-all-notifications'),
  getNotificationConfig: () => invokeIPC('get-notification-config'),
  saveNotificationConfig: (cfg) => invokeIPC('save-notification-config', cfg),
  showNativeNotification: (payload) => invokeIPC('show-native-notification', payload),

  // Crash Diagnostics & Error Telemetry (Phase 6)
  reportRendererError: (payload) => invokeIPC('report-renderer-error', payload),
  getCrashLogs: (maxLines) => invokeIPC('get-crash-logs', maxLines),
  clearCrashLogs: () => invokeIPC('clear-crash-logs'),

  // Enterprise Resilience & Telemetry (Phase 7)
  auditDatabase: () => invokeIPC('audit-database'),
  exportDiagnosticReport: () => invokeIPC('export-diagnostic-report'),
  checkPendingBills: () => invokeIPC('check-pending-bills'),
  executeBillPayment: (billId, customAmount) => invokeIPC('execute-bill-payment', { billId, customAmount }),

  // Document Intake & ML Normalization (Phase 0.5.2)
  normalizeDocument: (input, options) => invokeIPC('normalize-document', input, options),
  getNativeAddonStatus: () => invokeIPC('get-native-addon-status'),

  // Event Subscriptions
  onNavigateToTab: (callback) => {
    ipcRenderer.removeAllListeners('navigate-to-tab');
    ipcRenderer.on('navigate-to-tab', (event, tab) => callback(tab));
  },

  onDataUpdated: (callback) => {
    ipcRenderer.removeAllListeners('data-updated');
    ipcRenderer.on('data-updated', (event, data) => callback(data));
  }
});
