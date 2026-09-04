const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Window controls
  minimizeWindow: () => ipcRenderer.send('window-minimize'),
  maximizeWindow: () => ipcRenderer.send('window-maximize'),
  closeWindow: () => ipcRenderer.send('window-close'),

  // Account Authentication & Remember-Me
  getAccountStatus: () => ipcRenderer.invoke('account-get-status'),
  setupAccount: (payload) => ipcRenderer.invoke('account-setup', payload),
  loginAccount: (payload) => ipcRenderer.invoke('account-login', payload),
  logoutAccount: () => ipcRenderer.invoke('account-logout'),
  updateAccountPreferences: (prefs) => ipcRenderer.invoke('account-update-prefs', prefs),

  // Multi-User Profile Management
  getProfiles: () => ipcRenderer.invoke('get-profiles'),
  getActiveProfile: () => ipcRenderer.invoke('get-active-profile'),
  switchProfile: (profileId) => ipcRenderer.invoke('switch-profile', profileId),
  createProfile: (profileData) => ipcRenderer.invoke('create-profile', profileData),
  updateProfile: (profileData) => ipcRenderer.invoke('update-profile', profileData),
  deleteProfile: (profileId) => ipcRenderer.invoke('delete-profile', profileId),

  // Storage CRUD & Query operations
  getExpenses: () => ipcRenderer.invoke('get-expenses'),
  getCombinedExpenses: () => ipcRenderer.invoke('get-combined-expenses'),
  getExpenseById: (id) => ipcRenderer.invoke('get-expense-by-id', id),
  getFilteredExpenses: (filters) => ipcRenderer.invoke('get-filtered-expenses', filters),
  addExpense: (expense) => ipcRenderer.invoke('add-expense', expense),
  updateExpense: (expense) => ipcRenderer.invoke('update-expense', expense),
  deleteExpense: (id) => ipcRenderer.invoke('delete-expense', id),
  setBudgetGoal: (amount) => ipcRenderer.invoke('set-budget-goal', amount),

  // Category Management
  addCategory: (categoryName) => ipcRenderer.invoke('add-category', categoryName),
  deleteCategory: (categoryName) => ipcRenderer.invoke('delete-category', categoryName),

  // Preset Management
  getPresets: () => ipcRenderer.invoke('get-presets'),
  addPreset: (preset) => ipcRenderer.invoke('add-preset', preset),
  updatePreset: (preset) => ipcRenderer.invoke('update-preset', preset),
  deletePreset: (id) => ipcRenderer.invoke('delete-preset', id),

  // Salary Allocator & Daily Budget
  getSalaryConfig: () => ipcRenderer.invoke('get-salary-config'),
  setSalaryConfig: (config) => ipcRenderer.invoke('set-salary-config', config),
  getDailyBudgetMetrics: (targetDateStr) => ipcRenderer.invoke('get-daily-budget-metrics', targetDateStr),

  // Household Members & Split Settlement
  getHouseholdMembers: () => ipcRenderer.invoke('get-household-members'),
  addHouseholdMember: (name) => ipcRenderer.invoke('add-household-member', name),
  deleteHouseholdMember: (name) => ipcRenderer.invoke('delete-household-member', name),
  getHouseholdSettlement: () => ipcRenderer.invoke('get-household-settlement'),

  // Settlements & Repayments
  getSettlements: () => ipcRenderer.invoke('get-settlements'),
  addSettlement: (settlementData) => ipcRenderer.invoke('add-settlement', settlementData),
  deleteSettlement: (id) => ipcRenderer.invoke('delete-settlement', id),

  // Recurring Utility Bills
  getRecurringBills: () => ipcRenderer.invoke('get-recurring-bills'),
  saveRecurringBill: (billData) => ipcRenderer.invoke('save-recurring-bill', billData),
  deleteRecurringBill: (id) => ipcRenderer.invoke('delete-recurring-bill', id),
  markRecurringBillPaid: (id, paymentDetails) => ipcRenderer.invoke('mark-recurring-bill-paid', id, paymentDetails),

  // Receipt Image Storage
  selectReceiptFile: () => ipcRenderer.invoke('select-receipt-file'),
  saveReceipt: (sourceFilePath) => ipcRenderer.invoke('save-receipt', sourceFilePath),
  deleteReceipt: (filename) => ipcRenderer.invoke('delete-receipt', filename),
  getReceiptPath: (filename) => ipcRenderer.invoke('get-receipt-path', filename),

  // File Exports
  exportCSV: () => ipcRenderer.invoke('export-csv'),
  exportJSON: () => ipcRenderer.invoke('export-json'),
  exportExcel: () => ipcRenderer.invoke('export-excel'),

  // Phase 5: File Import
  importFile: () => ipcRenderer.invoke('import-file'),
  importFilePath: (filePath) => ipcRenderer.invoke('import-file-path', filePath),
  confirmImport: (expenses) => ipcRenderer.invoke('confirm-import', expenses),

  // Phase 5: Contextual Notes
  getNotes: (filters) => ipcRenderer.invoke('get-notes', filters),
  getNotesForExpense: (expenseId) => ipcRenderer.invoke('get-notes-for-expense', expenseId),
  getNotesForDate: (dateStr) => ipcRenderer.invoke('get-notes-for-date', dateStr),
  getNotesForWeek: (weekStr) => ipcRenderer.invoke('get-notes-for-week', weekStr),
  getNotesForMonth: (monthStr) => ipcRenderer.invoke('get-notes-for-month', monthStr),
  addNote: (note) => ipcRenderer.invoke('add-note', note),
  updateNote: (note) => ipcRenderer.invoke('update-note', note),
  deleteNote: (id) => ipcRenderer.invoke('delete-note', id),

  // Phase 5: Frictionless UX & Ambient Intelligence
  saveReceiptBuffer: (bufferBase64) => ipcRenderer.invoke('save-receipt-buffer', bufferBase64),
  hideQuickPill: () => ipcRenderer.invoke('quick-pill-hide'),
  submitQuickPillExpense: (expenseData) => ipcRenderer.invoke('quick-pill-submit', expenseData),
  nlpParse: (phrase, knownMembers) => ipcRenderer.invoke('nlp-parse', phrase, knownMembers),
  predictCategory: (title) => ipcRenderer.invoke('predict-category', title),
  learnCategoryKeyword: (keyword, category) => ipcRenderer.invoke('learn-category-keyword', keyword, category),
  simulateWhatIf: (extraAmount, targetDateStr) => ipcRenderer.invoke('simulate-what-if', extraAmount, targetDateStr),
  getWorkspaceMode: () => ipcRenderer.invoke('get-workspace-mode'),
  setWorkspaceMode: (mode) => ipcRenderer.invoke('set-workspace-mode', mode),

  // Notifications Engine APIs (v1.2 Phase 3)
  getNotifications: () => ipcRenderer.invoke('get-notifications'),
  evaluateNotifications: () => ipcRenderer.invoke('evaluate-notifications'),
  addNotification: (notif) => ipcRenderer.invoke('add-notification', notif),
  markNotificationRead: (id) => ipcRenderer.invoke('mark-notification-read', id),
  markAllNotificationsRead: () => ipcRenderer.invoke('mark-all-notifications-read'),
  deleteNotification: (id) => ipcRenderer.invoke('delete-notification', id),
  clearAllNotifications: () => ipcRenderer.invoke('clear-all-notifications'),

  onDataUpdated: (callback) => {
    ipcRenderer.on('data-updated', (event, data) => callback(data));
  }
});
