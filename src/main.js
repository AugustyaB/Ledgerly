const { app, BrowserWindow, ipcMain, dialog, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');
const ExpenseStorage = require('./storage');
const ReceiptStorage = require('./receiptStorage');
const FileImporter = require('./fileImporter');
const NLPParser = require('./nlpParser');
const ForesightEngine = require('./foresightEngine');
const { CategoryMatcher } = require('./categoryMatcher');
const XLSX = require('xlsx');

let mainWindow;
let quickPillWindow;
let storage;
let receiptStorage;
let fileImporter;
let nlpParser;
let categoryMatcher;

function createQuickPillWindow() {
  quickPillWindow = new BrowserWindow({
    width: 600,
    height: 72,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    show: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false
    }
  });

  quickPillWindow.loadFile(path.join(__dirname, 'quickPill.html'));

  quickPillWindow.on('blur', () => {
    if (quickPillWindow && !quickPillWindow.isDestroyed()) {
      quickPillWindow.hide();
    }
  });

  quickPillWindow.on('closed', () => {
    quickPillWindow = null;
  });
}

function getValidWindow(event) {
  if (event && event.sender) {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win && !win.isDestroyed()) return win;
  }
  if (mainWindow && !mainWindow.isDestroyed()) return mainWindow;
  return null;
}

function createWindow() {
  storage = new ExpenseStorage();
  receiptStorage = new ReceiptStorage();
  fileImporter = new FileImporter();
  categoryMatcher = new CategoryMatcher(storage.getCategoryKeywords());
  nlpParser = new NLPParser(storage.getCategoryKeywords());

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 960,
    minHeight: 650,
    frame: false, // Frameless custom desktop window for sleek glassmorphism titlebar
    transparent: false,
    backgroundColor: '#0F172A',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false
    },
    show: false,
    icon: path.join(__dirname, '../assets/icon.png')
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  mainWindow.once('ready-to-show', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  createQuickPillWindow();

  // Register Global Shortcut Ctrl+Alt+L
  try {
    globalShortcut.register('CommandOrControl+Alt+L', () => {
      if (quickPillWindow && !quickPillWindow.isDestroyed()) {
        if (quickPillWindow.isVisible()) {
          quickPillWindow.hide();
        } else {
          quickPillWindow.show();
          quickPillWindow.focus();
        }
      }
    });
  } catch (err) {
    console.warn('Global shortcut registration warning:', err);
  }
}

// Enforce Single Instance Lock on Windows to prevent GPU/disk cache collision
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  // App Lifecycles
  app.whenReady().then(createWindow);

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
}

// Window Control IPC Handlers (Safe against destroyed references)
ipcMain.on('window-minimize', (event) => {
  const win = getValidWindow(event);
  if (win) win.minimize();
});

ipcMain.on('window-maximize', (event) => {
  const win = getValidWindow(event);
  if (win) {
    if (win.isMaximized()) {
      win.unmaximize();
    } else {
      win.maximize();
    }
  }
});

ipcMain.on('window-close', (event) => {
  const win = getValidWindow(event);
  if (win) win.close();
});

// Account Authentication & Session IPC Handlers
ipcMain.handle('account-get-status', async () => {
  return storage.getAccountStatus();
});

ipcMain.handle('account-setup', async (event, payload) => {
  return storage.setupAccount(payload);
});

ipcMain.handle('account-login', async (event, payload) => {
  return storage.loginAccount(payload);
});

ipcMain.handle('account-logout', async () => {
  return storage.logoutAccount();
});

ipcMain.handle('account-update-prefs', async (event, prefs) => {
  return storage.updateAccountPreferences(prefs);
});

// Storage & Profile IPC Handlers
ipcMain.handle('get-profiles', async () => {
  return storage.getProfiles();
});

ipcMain.handle('get-active-profile', async () => {
  return storage.getActiveProfile();
});

ipcMain.handle('switch-profile', async (event, profileId) => {
  return storage.switchProfile(profileId);
});

ipcMain.handle('create-profile', async (event, profileData) => {
  return storage.createProfile(profileData);
});

ipcMain.handle('update-profile', async (event, profileData) => {
  return storage.updateProfile(profileData);
});

ipcMain.handle('delete-profile', async (event, profileId) => {
  return storage.deleteProfile(profileId);
});

ipcMain.handle('get-expenses', async () => {
  return storage.getData();
});

ipcMain.handle('get-combined-expenses', async () => {
  return storage.getCombinedExpenses();
});

ipcMain.handle('get-filtered-expenses', async (event, filters) => {
  return storage.getFilteredExpenses(filters);
});

ipcMain.handle('add-expense', async (event, expense) => {
  return storage.addExpense(expense);
});

ipcMain.handle('get-expense-by-id', async (event, id) => {
  return storage.getExpenseById(id);
});

ipcMain.handle('update-expense', async (event, expense) => {
  return storage.updateExpense(expense);
});

ipcMain.handle('delete-expense', async (event, id) => {
  const allExpenses = storage.getCombinedExpenses();
  const target = allExpenses.find(e => e.id === id);
  if (target && target.receiptFilename) {
    receiptStorage.deleteReceipt(target.receiptFilename);
  }
  return storage.deleteExpense(id);
});

ipcMain.handle('set-budget-goal', async (event, amount) => {
  return storage.setBudgetGoal(amount);
});

ipcMain.handle('add-category', async (event, categoryName) => {
  return storage.addCategory(categoryName);
});

ipcMain.handle('delete-category', async (event, categoryName) => {
  return storage.deleteCategory(categoryName);
});

// Preset IPC Handlers
ipcMain.handle('get-presets', async () => {
  return storage.getPresets();
});

ipcMain.handle('add-preset', async (event, preset) => {
  return storage.addPreset(preset);
});

ipcMain.handle('update-preset', async (event, preset) => {
  return storage.updatePreset(preset);
});

ipcMain.handle('delete-preset', async (event, id) => {
  return storage.deletePreset(id);
});

// Salary Allocator & Daily Budget IPC Handlers
ipcMain.handle('get-salary-config', async () => {
  return storage.getSalaryConfig();
});

ipcMain.handle('set-salary-config', async (event, config) => {
  return storage.setSalaryConfig(config);
});

ipcMain.handle('get-daily-budget-metrics', async (event, targetDateStr) => {
  return storage.calculateDailyBudgetMetrics(targetDateStr);
});

// Household Member & Split Settlement IPC Handlers
ipcMain.handle('get-household-members', async () => {
  return storage.getHouseholdMembers();
});

ipcMain.handle('add-household-member', async (event, name) => {
  return storage.addHouseholdMember(name);
});

ipcMain.handle('delete-household-member', async (event, name) => {
  return storage.deleteHouseholdMember(name);
});

ipcMain.handle('get-household-settlement', async () => {
  return storage.calculateHouseholdSettlement();
});

// Settlements & Repayments IPC Handlers
ipcMain.handle('get-settlements', async () => {
  return storage.getSettlements();
});

ipcMain.handle('add-settlement', async (event, settlementData) => {
  return storage.addSettlement(settlementData);
});

ipcMain.handle('delete-settlement', async (event, id) => {
  return storage.deleteSettlement(id);
});

// Recurring Utility Bills IPC Handlers
ipcMain.handle('get-recurring-bills', async () => {
  return storage.getRecurringBills();
});

ipcMain.handle('save-recurring-bill', async (event, billData) => {
  return storage.saveRecurringBill(billData);
});

ipcMain.handle('delete-recurring-bill', async (event, id) => {
  return storage.deleteRecurringBill(id);
});

ipcMain.handle('mark-recurring-bill-paid', async (event, id, paymentDetails) => {
  return storage.markRecurringBillPaid(id, paymentDetails);
});

// Receipt Photo IPC Handlers
ipcMain.handle('select-receipt-file', async (event) => {
  const win = getValidWindow(event);
  const options = {
    title: 'Select Receipt Photo',
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif'] }]
  };
  const { filePath, canceled } = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
  if (canceled || !filePath || filePath.length === 0) return { success: false, canceled: true };
  return { success: true, filePath: filePath[0] };
});

ipcMain.handle('save-receipt', async (event, sourceFilePath) => {
  return receiptStorage.saveReceipt(sourceFilePath);
});

ipcMain.handle('delete-receipt', async (event, filename) => {
  return receiptStorage.deleteReceipt(filename);
});

ipcMain.handle('get-receipt-path', async (event, filename) => {
  return receiptStorage.getReceiptAbsolutePath(filename);
});

// File Export Handlers
ipcMain.handle('export-csv', async (event) => {
  try {
    const data = storage.getData();
    if (!data.expenses || data.expenses.length === 0) {
      return { success: false, error: 'No expenses available to export.' };
    }

    const headers = ['ID', 'Date', 'Title', 'Category', 'Amount', 'Payment Method', 'Description', 'Tags'];
    const rows = data.expenses.map(e => [
      `"${e.id}"`,
      `"${e.date}"`,
      `"${e.title.replace(/"/g, '""')}"`,
      `"${e.category}"`,
      e.amount.toFixed(2),
      `"${e.paymentMethod}"`,
      `"${(e.description || '').replace(/"/g, '""')}"`,
      `"${(e.tags || []).join(', ')}"`
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');

    const win = getValidWindow(event);
    const options = {
      title: 'Export Expenses as CSV',
      defaultPath: path.join(app.getPath('documents'), `Expense_Report_${new Date().toISOString().split('T')[0]}.csv`),
      filters: [{ name: 'CSV Files', extensions: ['csv'] }]
    };
    const { filePath, canceled } = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options);

    if (canceled || !filePath) return { success: false, canceled: true };

    fs.writeFileSync(filePath, csvContent, 'utf-8');
    return { success: true, filePath };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('export-json', async (event) => {
  try {
    const data = storage.getData();
    const win = getValidWindow(event);
    const options = {
      title: 'Export Expenses Backup (JSON)',
      defaultPath: path.join(app.getPath('documents'), `Expense_Backup_${new Date().toISOString().split('T')[0]}.json`),
      filters: [{ name: 'JSON Files', extensions: ['json'] }]
    };
    const { filePath, canceled } = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options);

    if (canceled || !filePath) return { success: false, canceled: true };

    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    return { success: true, filePath };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// --- Phase 5: File Import IPC Handlers ---

ipcMain.handle('import-file', async (event) => {
  try {
    const win = getValidWindow(event);
    const options = {
      title: 'Import Financial Data',
      properties: ['openFile'],
      filters: [
        { name: 'All Supported', extensions: ['csv', 'xls', 'xlsx', 'ofx', 'qfx', 'json', 'pdf'] },
        { name: 'CSV Files', extensions: ['csv'] },
        { name: 'Excel Files', extensions: ['xls', 'xlsx'] },
        { name: 'OFX/QFX Files', extensions: ['ofx', 'qfx'] },
        { name: 'JSON Files', extensions: ['json'] },
        { name: 'PDF Files', extensions: ['pdf'] }
      ]
    };
    const { filePaths, canceled } = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);

    if (canceled || !filePaths || filePaths.length === 0) {
      return { success: false, canceled: true };
    }

    const result = fileImporter.parseFile(filePaths[0]);
    return result;
  } catch (err) {
    return { success: false, expenses: [], errors: [err.message], warnings: [], format: 'unknown' };
  }
});

ipcMain.handle('import-file-path', async (event, filePath) => {
  try {
    const result = fileImporter.parseFile(filePath);
    return result;
  } catch (err) {
    return { success: false, expenses: [], errors: [err.message], warnings: [], format: 'unknown' };
  }
});

ipcMain.handle('confirm-import', async (event, expenses) => {
  try {
    return storage.bulkAddExpenses(expenses);
  } catch (err) {
    return { success: false, imported: 0, errors: [err.message] };
  }
});

// Phase 5: Excel Export
ipcMain.handle('export-excel', async (event) => {
  try {
    const data = storage.getData();
    if (!data.expenses || data.expenses.length === 0) {
      return { success: false, error: 'No expenses available to export.' };
    }

    const rows = data.expenses.map(e => ({
      'Date': e.date,
      'Title': e.title,
      'Category': e.category,
      'Amount': e.amount,
      'Payment Method': e.paymentMethod,
      'Description': e.description || '',
      'Tags': (e.tags || []).join(', '),
      'Paid By': e.paidBy || 'Self',
      'Household': e.isHouseholdExpense ? 'Yes' : 'No'
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);

    // Auto-size columns
    const colWidths = Object.keys(rows[0]).map(key => ({
      wch: Math.max(key.length, ...rows.map(r => String(r[key] || '').length))
    }));
    ws['!cols'] = colWidths;

    XLSX.utils.book_append_sheet(wb, ws, 'Expenses');

    const win = getValidWindow(event);
    const options = {
      title: 'Export Expenses as Excel Sheet',
      defaultPath: path.join(app.getPath('documents'), `Expense_Report_${new Date().toISOString().split('T')[0]}.xlsx`),
      filters: [{ name: 'Excel Files', extensions: ['xlsx'] }]
    };
    const { filePath, canceled } = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options);

    if (canceled || !filePath) return { success: false, canceled: true };

    XLSX.writeFile(wb, filePath);
    return { success: true, filePath };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// --- Phase 5: Notes IPC Handlers ---

ipcMain.handle('get-notes', async (event, filters) => {
  return storage.getNotes(filters || {});
});

ipcMain.handle('get-notes-for-expense', async (event, expenseId) => {
  return storage.getNotesForExpense(expenseId);
});

ipcMain.handle('get-notes-for-date', async (event, dateStr) => {
  return storage.getNotesForDate(dateStr);
});

ipcMain.handle('get-notes-for-week', async (event, weekStr) => {
  return storage.getNotesForWeek(weekStr);
});

ipcMain.handle('get-notes-for-month', async (event, monthStr) => {
  return storage.getNotesForMonth(monthStr);
});

ipcMain.handle('add-note', async (event, note) => {
  return storage.addNote(note);
});

ipcMain.handle('update-note', async (event, note) => {
  return storage.updateNote(note);
});

ipcMain.handle('delete-note', async (event, id) => {
  return storage.deleteNote(id);
});

// ==========================================================================
// Phase 5: Frictionless UX & Ambient Intelligence IPC Handlers
// ==========================================================================

// Direct Clipboard Image Paste Handler
ipcMain.handle('save-receipt-buffer', async (event, bufferBase64) => {
  return receiptStorage.saveReceiptBuffer(bufferBase64);
});

// Quick Pill Floating Widget Handlers
ipcMain.handle('quick-pill-hide', () => {
  if (quickPillWindow) quickPillWindow.hide();
  return { success: true };
});

ipcMain.handle('quick-pill-submit', async (event, expenseData) => {
  const res = await storage.addExpense(expenseData);
  if (quickPillWindow) quickPillWindow.hide();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('data-updated', { type: 'expense-added', data: expenseData });
  }
  return res;
});

// Natural Language Parser
ipcMain.handle('nlp-parse', async (event, inputPhrase, knownMembers) => {
  const members = knownMembers || storage.getHouseholdMembers();
  return nlpParser.parse(inputPhrase, members);
});

// Category Prediction & Keyword Learning
ipcMain.handle('predict-category', async (event, titleText) => {
  const keywords = storage.getCategoryKeywords();
  return categoryMatcher.predictCategory(titleText, keywords);
});

ipcMain.handle('learn-category-keyword', async (event, keyword, category) => {
  return storage.learnCategoryKeyword(keyword, category);
});

// "What-If" Spending Impact Simulator
ipcMain.handle('simulate-what-if', async (event, extraAmount, targetDateStr) => {
  const salaryConfig = storage.getSalaryConfig();
  const dailyMetrics = storage.calculateDailyBudgetMetrics(targetDateStr);
  return ForesightEngine.simulatePurchase(
    extraAmount,
    salaryConfig,
    dailyMetrics.spentMonthToDate,
    targetDateStr || new Date()
  );
});

// Workspace Mode (Solo vs Household)
ipcMain.handle('get-workspace-mode', async () => {
  return storage.getWorkspaceMode();
});

ipcMain.handle('set-workspace-mode', async (event, mode) => {
  return storage.setWorkspaceMode(mode);
});

// Notifications Engine Handlers (v1.2 Phase 3)
ipcMain.handle('get-notifications', async () => {
  return storage.getNotifications();
});

ipcMain.handle('evaluate-notifications', async () => {
  return storage.evaluateAutoNotifications();
});

ipcMain.handle('add-notification', async (event, notif) => {
  return storage.addNotification(notif);
});

ipcMain.handle('mark-notification-read', async (event, id) => {
  return storage.markNotificationRead(id);
});

ipcMain.handle('mark-all-notifications-read', async () => {
  return storage.markAllNotificationsRead();
});

ipcMain.handle('delete-notification', async (event, id) => {
  return storage.deleteNotification(id);
});

ipcMain.handle('clear-all-notifications', async () => {
  return storage.clearAllNotifications();
});

