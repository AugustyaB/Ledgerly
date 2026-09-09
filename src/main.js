const { app, BrowserWindow, ipcMain, dialog, globalShortcut, Notification } = require('electron');
const path = require('path');
const fs = require('fs');
const ExpenseStorage = require('./storage');
const ReceiptStorage = require('./receiptStorage');
const FileImporter = require('./fileImporter');
const NLPParser = require('./nlpParser');
const ForesightEngine = require('./foresightEngine');
const { CategoryMatcher } = require('./categoryMatcher');
const DocumentNormalizer = require('./services/DocumentNormalizer');
const ReceiptTier1Engine = require('./services/ReceiptTier1Engine');
const XLSX = require('xlsx');
const { wrapIPC } = require('./validation/ipcGuard');
const { crashLogger } = require('./logger/crashLogger');
const { VALIDATION_LIMITS } = require('./constants');
const {
  validateExpenseInput,
  validateProfileInput,
  validateBudgetConfig,
  validateHouseholdMember,
  validateSettlement,
  validateNoteInput,
  validateRecurringBill,
  validateCategoryName,
  validatePresetInput,
  validateBudgetGoal,
  validateWorkspaceMode,
  validateDocumentNormalizeInput,
  validateReceiptScanInput,
  validateId,
  isPlainObject
} = require('./validation/schemaValidator');

// ============================================================================
// Main Process Crash Traps (Phase 6)
// ============================================================================

process.on('uncaughtException', (err) => {
  crashLogger.logCrash('MAIN_UNCAUGHT_EXCEPTION', err);
  console.error('[Main] Uncaught Exception:', err);
  if (app && !app.isQuitting) {
    try {
      dialog.showErrorBox(
        'Ledgerly System Error',
        `An unexpected background error occurred:\n\n${err?.message || err}\n\nDiagnostic details have been recorded to crash.log.`
      );
    } catch {
      // Suppress secondary dialog display errors
    }
  }
});

process.on('unhandledRejection', (reason) => {
  crashLogger.logCrash('MAIN_UNHANDLED_REJECTION', reason);
  console.error('[Main] Unhandled Rejection:', reason);
});

let mainWindow;
let quickPillWindow;
let storage;
let receiptStorage;
let fileImporter;
let nlpParser;
let categoryMatcher;
let documentNormalizer;
let receiptTier1Engine;

function sanitizeSpreadsheetCell(val) {
  const str = String(val === null || val === undefined ? '' : val);
  if (/^[=+\-@\t\r]/.test(str)) {
    return `'${str}`;
  }
  return str;
}

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
      sandbox: true
    }
  });

  quickPillWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== quickPillWindow.webContents.getURL()) {
      event.preventDefault();
    }
  });

  quickPillWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

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
  try {
    const auditResult = storage.runIntegrityAudit();
    if (!auditResult.healthy) {
      console.log('[Startup Auditor] Repaired database issues:', auditResult.repairsApplied);
    }
  } catch (auditErr) {
    console.error('[Startup Auditor] Startup integrity check error:', auditErr.message);
  }
  receiptStorage = new ReceiptStorage();
  documentNormalizer = new DocumentNormalizer();
  categoryMatcher = new CategoryMatcher(storage.getCategoryKeywords());
  receiptTier1Engine = new ReceiptTier1Engine({ normalizer: documentNormalizer, categoryMatcher });
  fileImporter = new FileImporter({ tier1Engine: receiptTier1Engine });
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
      sandbox: true
    },
    show: false,
    icon: process.platform === 'win32' && fs.existsSync(path.join(__dirname, '../assets/icon.ico'))
      ? path.join(__dirname, '../assets/icon.ico')
      : path.join(__dirname, '../assets/icon.png')
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== mainWindow.webContents.getURL()) {
      event.preventDefault();
    }
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  // Interface Crash Diagnostics & Recovery (Phase 6)
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    crashLogger.logCrash('RENDERER_PROCESS_GONE', details.reason, details);
    console.error('[Main] Renderer process gone:', details);
    if (details.reason !== 'clean-exit' && mainWindow && !mainWindow.isDestroyed()) {
      dialog.showMessageBox(mainWindow, {
        type: 'error',
        title: 'Display Process Error',
        message: 'The user interface encountered an unexpected crash.',
        detail: `Reason: ${details.reason}\n\nDiagnostic trace recorded to crash.log. Would you like to reload?`,
        buttons: ['Reload Application', 'Close'],
        defaultId: 0
      }).then(({ response }) => {
        if (response === 0 && mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.reload();
        }
      }).catch(() => {});
    }
  });

  mainWindow.on('unresponsive', () => {
    crashLogger.logCrash('RENDERER_UNRESPONSIVE', 'MainWindow became unresponsive');
    console.warn('[Main] Window became unresponsive');
  });

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
ipcMain.handle('account-get-status', wrapIPC('account-get-status', null, async () => {
  return storage.getAccountStatus();
}));

ipcMain.handle('account-setup', wrapIPC('account-setup', (payload) => {
  if (!isPlainObject(payload)) return { valid: false, errors: ['Setup payload must be an object.'] };
  return { valid: true, errors: [] };
}, async (event, payload) => {
  return storage.setupAccount(payload);
}));

ipcMain.handle('account-login', wrapIPC('account-login', (payload) => {
  if (!isPlainObject(payload)) return { valid: false, errors: ['Login payload must be an object.'] };
  return { valid: true, errors: [] };
}, async (event, payload) => {
  return storage.loginAccount(payload);
}));

ipcMain.handle('account-logout', wrapIPC('account-logout', null, async () => {
  return storage.logoutAccount();
}));

ipcMain.handle('account-update-prefs', wrapIPC('account-update-prefs', (prefs) => {
  if (!isPlainObject(prefs)) return { valid: false, errors: ['Preferences payload must be an object.'] };
  return { valid: true, errors: [] };
}, async (event, prefs) => {
  return storage.updateAccountPreferences(prefs);
}));

// Storage & Profile IPC Handlers
ipcMain.handle('get-profiles', wrapIPC('get-profiles', null, async () => {
  return storage.getProfiles();
}));

ipcMain.handle('get-active-profile', wrapIPC('get-active-profile', null, async () => {
  return storage.getActiveProfile();
}));

ipcMain.handle('switch-profile', wrapIPC('switch-profile', (profileId) => validateId(profileId, 'Profile ID'), async (event, profileId) => {
  return storage.switchProfile(profileId);
}));

ipcMain.handle('create-profile', wrapIPC('create-profile', (profileData) => validateProfileInput(profileData, false), async (event, profileData) => {
  return storage.createProfile(profileData);
}));

ipcMain.handle('update-profile', wrapIPC('update-profile', (profileData) => validateProfileInput(profileData, true), async (event, profileData) => {
  return storage.updateProfile(profileData);
}));

ipcMain.handle('delete-profile', wrapIPC('delete-profile', (profileId) => validateId(profileId, 'Profile ID'), async (event, profileId) => {
  return storage.deleteProfile(profileId);
}));

ipcMain.handle('get-expenses', wrapIPC('get-expenses', null, async () => {
  return storage.getData();
}));

ipcMain.handle('get-combined-expenses', wrapIPC('get-combined-expenses', null, async () => {
  return storage.getCombinedExpenses();
}));

ipcMain.handle('get-filtered-expenses', wrapIPC('get-filtered-expenses', null, async (event, filters) => {
  return storage.getFilteredExpenses(filters);
}));

ipcMain.handle('add-expense', wrapIPC('add-expense', (expense) => validateExpenseInput(expense, false), async (event, expense) => {
  return storage.addExpense(expense);
}));

ipcMain.handle('get-expense-by-id', wrapIPC('get-expense-by-id', (id) => validateId(id, 'Expense ID'), async (event, id) => {
  return storage.getExpenseById(id);
}));

ipcMain.handle('update-expense', wrapIPC('update-expense', (expense) => validateExpenseInput(expense, true), async (event, expense) => {
  return storage.updateExpense(expense);
}));

ipcMain.handle('delete-expense', wrapIPC('delete-expense', (id) => validateId(id, 'Expense ID'), async (event, id) => {
  const allExpenses = storage.getCombinedExpenses();
  const target = allExpenses.find(e => e.id === id);
  if (target && target.receiptFilename) {
    receiptStorage.deleteReceipt(target.receiptFilename);
  }
  return storage.deleteExpense(id);
}));

ipcMain.handle('set-budget-goal', wrapIPC('set-budget-goal', (amount) => validateBudgetGoal(amount), async (event, amount) => {
  return storage.setBudgetGoal(amount);
}));

ipcMain.handle('add-category', wrapIPC('add-category', (categoryName) => validateCategoryName(categoryName), async (event, categoryName) => {
  return storage.addCategory(categoryName);
}));

ipcMain.handle('delete-category', wrapIPC('delete-category', (categoryName) => validateCategoryName(categoryName), async (event, categoryName) => {
  return storage.deleteCategory(categoryName);
}));

// Preset IPC Handlers
ipcMain.handle('get-presets', wrapIPC('get-presets', null, async () => {
  return storage.getPresets();
}));

ipcMain.handle('add-preset', wrapIPC('add-preset', (preset) => validatePresetInput(preset, false), async (event, preset) => {
  return storage.addPreset(preset);
}));

ipcMain.handle('update-preset', wrapIPC('update-preset', (preset) => validatePresetInput(preset, true), async (event, preset) => {
  return storage.updatePreset(preset);
}));

ipcMain.handle('delete-preset', wrapIPC('delete-preset', (id) => validateId(id, 'Preset ID'), async (event, id) => {
  return storage.deletePreset(id);
}));

// Salary Allocator & Daily Budget IPC Handlers
ipcMain.handle('get-salary-config', wrapIPC('get-salary-config', null, async () => {
  return storage.getSalaryConfig();
}));

ipcMain.handle('set-salary-config', wrapIPC('set-salary-config', (config) => validateBudgetConfig(config), async (event, config) => {
  return storage.setSalaryConfig(config);
}));

ipcMain.handle('get-daily-budget-metrics', wrapIPC('get-daily-budget-metrics', null, async (event, targetDateStr) => {
  return storage.calculateDailyBudgetMetrics(targetDateStr);
}));

// Household Member & Split Settlement IPC Handlers
ipcMain.handle('get-household-members', wrapIPC('get-household-members', null, async () => {
  return storage.getHouseholdMembers();
}));

ipcMain.handle('add-household-member', wrapIPC('add-household-member', (name) => validateHouseholdMember(name), async (event, name) => {
  return storage.addHouseholdMember(name);
}));

ipcMain.handle('delete-household-member', wrapIPC('delete-household-member', (name) => validateHouseholdMember(name), async (event, name) => {
  return storage.deleteHouseholdMember(name);
}));

ipcMain.handle('get-household-settlement', wrapIPC('get-household-settlement', null, async () => {
  return storage.calculateHouseholdSettlement();
}));

// Settlements & Repayments IPC Handlers
ipcMain.handle('get-settlements', wrapIPC('get-settlements', null, async () => {
  return storage.getSettlements();
}));

ipcMain.handle('add-settlement', wrapIPC('add-settlement', (settlementData) => validateSettlement(settlementData), async (event, settlementData) => {
  return storage.addSettlement(settlementData);
}));

ipcMain.handle('delete-settlement', wrapIPC('delete-settlement', (id) => validateId(id, 'Settlement ID'), async (event, id) => {
  return storage.deleteSettlement(id);
}));

// Recurring Utility Bills IPC Handlers
ipcMain.handle('get-recurring-bills', wrapIPC('get-recurring-bills', null, async () => {
  return storage.getRecurringBills();
}));

ipcMain.handle('save-recurring-bill', wrapIPC('save-recurring-bill', (billData) => validateRecurringBill(billData, Boolean(billData && billData.id)), async (event, billData) => {
  return storage.saveRecurringBill(billData);
}));

ipcMain.handle('delete-recurring-bill', wrapIPC('delete-recurring-bill', (id) => validateId(id, 'Bill ID'), async (event, id) => {
  return storage.deleteRecurringBill(id);
}));

ipcMain.handle('mark-recurring-bill-paid', wrapIPC('mark-recurring-bill-paid', (id) => validateId(id, 'Bill ID'), async (event, id, paymentDetails) => {
  return storage.markRecurringBillPaid(id, paymentDetails);
}));

// Receipt Photo IPC Handlers
ipcMain.handle('select-receipt-file', wrapIPC('select-receipt-file', null, async (event) => {
  const win = getValidWindow(event);
  const options = {
    title: 'Select Receipt Photo',
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif'] }]
  };
  const { filePath, canceled } = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
  if (canceled || !filePath || filePath.length === 0) return { success: false, canceled: true };
  return { success: true, filePath: filePath[0] };
}));

ipcMain.handle('save-receipt', wrapIPC('save-receipt', (sourceFilePath) => {
  if (typeof sourceFilePath !== 'string' || !sourceFilePath.trim()) {
    return { valid: false, errors: ['sourceFilePath must be a non-empty string.'] };
  }
  return { valid: true, errors: [] };
}, async (event, sourceFilePath) => {
  return receiptStorage.saveReceipt(sourceFilePath);
}));

ipcMain.handle('delete-receipt', wrapIPC('delete-receipt', (filename) => {
  if (typeof filename !== 'string' || !filename.trim()) {
    return { valid: false, errors: ['Receipt filename is required.'] };
  }
  if (filename.includes('..') || /[/\\]/.test(filename)) {
    return { valid: false, errors: ['Receipt filename cannot contain path traversal.'] };
  }
  return { valid: true, errors: [] };
}, async (event, filename) => {
  return receiptStorage.deleteReceipt(filename);
}));

ipcMain.handle('get-receipt-path', wrapIPC('get-receipt-path', (filename) => {
  if (typeof filename !== 'string' || !filename.trim()) {
    return { valid: false, errors: ['Receipt filename is required.'] };
  }
  return { valid: true, errors: [] };
}, async (event, filename) => {
  return receiptStorage.getReceiptAbsolutePath(filename);
}));

// File Export Handlers
ipcMain.handle('export-csv', wrapIPC('export-csv', null, async (event) => {
  const data = storage.getData();
  if (!data.expenses || data.expenses.length === 0) {
    return { success: false, error: 'No expenses available to export.' };
  }

  const headers = ['ID', 'Date', 'Title', 'Category', 'Amount', 'Payment Method', 'Description', 'Tags'];
  const rows = data.expenses.map(e => [
    `"${sanitizeSpreadsheetCell(e.id)}"`,
    `"${sanitizeSpreadsheetCell(e.date)}"`,
    `"${sanitizeSpreadsheetCell(e.title).replace(/"/g, '""')}"`,
    `"${sanitizeSpreadsheetCell(e.category)}"`,
    e.amount.toFixed(2),
    `"${sanitizeSpreadsheetCell(e.paymentMethod)}"`,
    `"${sanitizeSpreadsheetCell(e.description || '').replace(/"/g, '""')}"`,
    `"${sanitizeSpreadsheetCell((e.tags || []).join(', '))}"`
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
}));

ipcMain.handle('export-json', wrapIPC('export-json', null, async (event) => {
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
}));

// File Import IPC Handlers
ipcMain.handle('import-file', wrapIPC('import-file', null, async (event) => {
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

  const result = await fileImporter.parseFile(filePaths[0]);
  return result;
}));

ipcMain.handle('import-file-path', wrapIPC('import-file-path', (filePath) => {
  if (typeof filePath !== 'string' || !filePath.trim()) {
    return { valid: false, errors: ['filePath must be a non-empty string.'] };
  }
  return { valid: true, errors: [] };
}, async (event, filePath) => {
  const result = await fileImporter.parseFile(filePath);
  return result;
}));

// Document Intake & Preprocessing Engine (Phase 0.5.2)
ipcMain.handle('normalize-document', wrapIPC('normalize-document', (input, options) => {
  return validateDocumentNormalizeInput(input, options);
}, async (event, input, options) => {
  return documentNormalizer.normalizeDocument(input, options);
}));

ipcMain.handle('get-native-addon-status', wrapIPC('get-native-addon-status', null, async () => {
  return documentNormalizer.getNativeAddonStatus();
}));

// Tier 1 Fast-Lite Receipt Document Intelligence (Phase 0.5.3)
ipcMain.handle('scan-receipt-document', wrapIPC('scan-receipt-document', (input, options) => {
  return validateReceiptScanInput(input, options);
}, async (event, input, options) => {
  return receiptTier1Engine.processDocument(input, options);
}));

ipcMain.handle('confirm-import', wrapIPC('confirm-import', (expenses) => {
  if (!Array.isArray(expenses)) {
    return { valid: false, errors: ['Import expenses payload must be an array.'] };
  }
  const maxRows = VALIDATION_LIMITS?.MAX_IMPORT_ROWS || 25000;
  if (expenses.length > maxRows) {
    return { valid: false, errors: [`Import batch exceeds maximum limit of ${maxRows} records.`] };
  }
  return { valid: true, errors: [] };
}, async (event, expenses) => {
  return storage.bulkAddExpenses(expenses);
}));

// Excel Export
ipcMain.handle('export-excel', wrapIPC('export-excel', null, async (event) => {
  const data = storage.getData();
  if (!data.expenses || data.expenses.length === 0) {
    return { success: false, error: 'No expenses available to export.' };
  }

  const rows = data.expenses.map(e => ({
    'Date': sanitizeSpreadsheetCell(e.date),
    'Title': sanitizeSpreadsheetCell(e.title),
    'Category': sanitizeSpreadsheetCell(e.category),
    'Amount': e.amount,
    'Payment Method': sanitizeSpreadsheetCell(e.paymentMethod),
    'Description': sanitizeSpreadsheetCell(e.description || ''),
    'Tags': sanitizeSpreadsheetCell((e.tags || []).join(', ')),
    'Paid By': sanitizeSpreadsheetCell(e.paidBy || 'Self'),
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
}));

// --- Phase 5: Notes IPC Handlers ---

// --- Notes IPC Handlers ---
ipcMain.handle('get-notes', wrapIPC('get-notes', null, async (event, filters) => {
  return storage.getNotes(filters || {});
}));

ipcMain.handle('get-notes-for-expense', wrapIPC('get-notes-for-expense', (expenseId) => validateId(expenseId, 'Expense ID'), async (event, expenseId) => {
  return storage.getNotesForExpense(expenseId);
}));

ipcMain.handle('get-notes-for-date', wrapIPC('get-notes-for-date', null, async (event, dateStr) => {
  return storage.getNotesForDate(dateStr);
}));

ipcMain.handle('get-notes-for-week', wrapIPC('get-notes-for-week', null, async (event, weekStr) => {
  return storage.getNotesForWeek(weekStr);
}));

ipcMain.handle('get-notes-for-month', wrapIPC('get-notes-for-month', null, async (event, monthStr) => {
  return storage.getNotesForMonth(monthStr);
}));

ipcMain.handle('add-note', wrapIPC('add-note', (note) => validateNoteInput(note, false), async (event, note) => {
  return storage.addNote(note);
}));

ipcMain.handle('update-note', wrapIPC('update-note', (note) => validateNoteInput(note, true), async (event, note) => {
  return storage.updateNote(note);
}));

ipcMain.handle('delete-note', wrapIPC('delete-note', (id) => validateId(id, 'Note ID'), async (event, id) => {
  return storage.deleteNote(id);
}));

// ==========================================================================
// Frictionless UX & Ambient Intelligence IPC Handlers
// ==========================================================================

// Direct Clipboard Image Paste Handler
ipcMain.handle('save-receipt-buffer', wrapIPC('save-receipt-buffer', (bufferBase64) => {
  if (typeof bufferBase64 !== 'string' || !bufferBase64.trim()) {
    return { valid: false, errors: ['Receipt buffer must be a non-empty base64 string.'] };
  }
  return { valid: true, errors: [] };
}, async (event, bufferBase64) => {
  return receiptStorage.saveReceiptBuffer(bufferBase64);
}));

// Quick Pill Floating Widget Handlers
ipcMain.handle('quick-pill-hide', wrapIPC('quick-pill-hide', null, () => {
  if (quickPillWindow) quickPillWindow.hide();
  return { success: true };
}));

ipcMain.handle('quick-pill-submit', wrapIPC('quick-pill-submit', (expenseData) => validateExpenseInput(expenseData, false), async (event, expenseData) => {
  const res = await storage.addExpense(expenseData);
  if (quickPillWindow) quickPillWindow.hide();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('data-updated', { type: 'expense-added', data: expenseData });
  }
  return res;
}));

// Natural Language Parser
ipcMain.handle('nlp-parse', wrapIPC('nlp-parse', (inputPhrase) => {
  if (typeof inputPhrase !== 'string') {
    return { valid: false, errors: ['Input phrase must be a string.'] };
  }
  return { valid: true, errors: [] };
}, async (event, inputPhrase, knownMembers) => {
  const members = knownMembers || storage.getHouseholdMembers();
  return nlpParser.parse(inputPhrase, members);
}));

// Category Prediction & Keyword Learning
ipcMain.handle('predict-category', wrapIPC('predict-category', null, async (event, titleText) => {
  const keywords = storage.getCategoryKeywords();
  return categoryMatcher.predictCategory(titleText, keywords);
}));

ipcMain.handle('learn-category-keyword', wrapIPC('learn-category-keyword', (keyword, category) => {
  const errors = [];
  if (typeof keyword !== 'string' || !keyword.trim()) errors.push('Keyword is required.');
  if (typeof category !== 'string' || !category.trim()) errors.push('Category is required.');
  return { valid: errors.length === 0, errors };
}, async (event, keyword, category) => {
  return storage.learnCategoryKeyword(keyword, category);
}));

// Category Keywords Getter
ipcMain.handle('get-category-keywords', wrapIPC('get-category-keywords', null, async () => {
  return storage.getCategoryKeywords();
}));

// Delete a learned category keyword
ipcMain.handle('delete-category-keyword', wrapIPC('delete-category-keyword', (keyword) => {
  if (typeof keyword !== 'string' || !keyword.trim()) {
    return { valid: false, errors: ['Keyword is required.'] };
  }
  return { valid: true, errors: [] };
}, async (event, keyword) => {
  const data = storage.getData();
  if (data.categoryKeywords && data.categoryKeywords[keyword]) {
    delete data.categoryKeywords[keyword];
    storage.saveData(data);
    return { success: true };
  }
  return { success: false, error: 'Keyword not found' };
}));

// Storage Diagnostics
ipcMain.handle('get-storage-diagnostics', wrapIPC('get-storage-diagnostics', null, async () => {
  const data = storage.getData();
  const dbPath = storage.filePath || 'Unknown';
  let fileSizeBytes = 0;
  try {
    const stats = fs.statSync(dbPath);
    fileSizeBytes = stats.size;
  } catch { /* file may not exist yet */ }
  return {
    dbPath,
    profileName: data.activeProfile || 'Default',
    transactionCount: Array.isArray(data.expenses) ? data.expenses.length : 0,
    categoryCount: Array.isArray(data.categories) ? data.categories.length : 0,
    presetCount: Array.isArray(data.presets) ? data.presets.length : 0,
    noteCount: Array.isArray(data.notes) ? data.notes.length : 0,
    fileSizeBytes
  };
}));

// Clear All Expenses
ipcMain.handle('clear-all-expenses', wrapIPC('clear-all-expenses', null, async () => {
  return storage.clearAllExpenses();
}));

// "What-If" Spending Impact Simulator
ipcMain.handle('simulate-what-if', wrapIPC('simulate-what-if', (extraAmount) => {
  const num = Number(extraAmount);
  if (isNaN(num) || !isFinite(num) || num < 0) {
    return { valid: false, errors: ['extraAmount must be a non-negative finite number.'] };
  }
  return { valid: true, errors: [] };
}, async (event, extraAmount, targetDateStr) => {
  const salaryConfig = storage.getSalaryConfig();
  const dailyMetrics = storage.calculateDailyBudgetMetrics(targetDateStr);
  return ForesightEngine.simulatePurchase(
    extraAmount,
    salaryConfig,
    dailyMetrics.spentMonthToDate,
    targetDateStr || new Date()
  );
}));

// Workspace Mode (Solo vs Household)
ipcMain.handle('get-workspace-mode', wrapIPC('get-workspace-mode', null, async () => {
  return storage.getWorkspaceMode();
}));

ipcMain.handle('set-workspace-mode', wrapIPC('set-workspace-mode', (mode) => validateWorkspaceMode(mode), async (event, mode) => {
  return storage.setWorkspaceMode(mode);
}));

// Notifications Engine Handlers
function showNativeDesktopNotification(title, body, actionTab = null) {
  if (!Notification || !Notification.isSupported()) return;
  const iconPath = path.join(__dirname, '../assets/icon.png');
  const notif = new Notification({
    title: title || 'Ledgerly Alert',
    body: body || '',
    icon: fs.existsSync(iconPath) ? iconPath : undefined
  });

  notif.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
      if (actionTab) {
        mainWindow.webContents.send('navigate-to-tab', actionTab);
      }
    }
  });

  notif.show();
}

ipcMain.handle('get-notifications', wrapIPC('get-notifications', null, async () => {
  return storage.getNotifications();
}));

ipcMain.handle('evaluate-notifications', wrapIPC('evaluate-notifications', null, async () => {
  const result = storage.evaluateAutoNotifications();
  const cfg = storage.getNotificationConfig();

  // If native desktop alerts are enabled, show native popup for newly created critical alerts
  if (cfg.enableNative && Array.isArray(result.criticalAlerts) && result.criticalAlerts.length > 0) {
    result.criticalAlerts.forEach(crit => {
      showNativeDesktopNotification(crit.title, crit.message, crit.actionTab);
    });
  }

  return result;
}));

ipcMain.handle('get-notification-config', wrapIPC('get-notification-config', null, async () => {
  return storage.getNotificationConfig();
}));

ipcMain.handle('save-notification-config', wrapIPC('save-notification-config', (config) => {
  if (!isPlainObject(config)) {
    return { valid: false, errors: ['Notification config must be a non-null object.'] };
  }
  return { valid: true, errors: [] };
}, async (event, config) => {
  return storage.saveNotificationConfig(config);
}));

ipcMain.handle('show-native-notification', wrapIPC('show-native-notification', (payload) => {
  if (!isPlainObject(payload)) {
    return { valid: false, errors: ['Native notification payload must be an object.'] };
  }
  return { valid: true, errors: [] };
}, async (event, { title, message, actionTab }) => {
  showNativeDesktopNotification(title, message, actionTab);
  return { success: true };
}));

ipcMain.handle('add-notification', wrapIPC('add-notification', (notif) => {
  if (!isPlainObject(notif)) {
    return { valid: false, errors: ['Notification payload must be an object.'] };
  }
  return { valid: true, errors: [] };
}, async (event, notif) => {
  return storage.addNotification(notif);
}));

ipcMain.handle('mark-notification-read', wrapIPC('mark-notification-read', (id) => validateId(id, 'Notification ID'), async (event, id) => {
  return storage.markNotificationRead(id);
}));

ipcMain.handle('mark-all-notifications-read', wrapIPC('mark-all-notifications-read', null, async () => {
  return storage.markAllNotificationsRead();
}));

ipcMain.handle('delete-notification', wrapIPC('delete-notification', (id) => validateId(id, 'Notification ID'), async (event, id) => {
  return storage.deleteNotification(id);
}));

ipcMain.handle('clear-all-notifications', wrapIPC('clear-all-notifications', null, async () => {
  return storage.clearAllNotifications();
}));

// ============================================================================
// Crash Logging & Diagnostic IPC Handlers (Phase 6)
// ============================================================================

ipcMain.handle('report-renderer-error', wrapIPC('report-renderer-error', (payload) => {
  if (!isPlainObject(payload)) {
    return { valid: false, errors: ['Renderer error payload must be an object.'] };
  }
  return { valid: true, errors: [] };
}, async (_event, payload) => {
  crashLogger.logCrash(payload.type || 'RENDERER_ERROR', payload.message || payload.error || 'Unknown renderer error', {
    source: payload.filename || 'renderer',
    lineno: payload.lineno,
    colno: payload.colno,
    stack: payload.stack,
    url: payload.url
  });
  return { success: true };
}));

ipcMain.handle('get-crash-logs', wrapIPC('get-crash-logs', null, async (_event, maxLines) => {
  const lines = typeof maxLines === 'number' && maxLines > 0 ? maxLines : 100;
  return crashLogger.getRecentCrashLogs(lines);
}));

ipcMain.handle('clear-crash-logs', wrapIPC('clear-crash-logs', null, async () => {
  return crashLogger.clearCrashLogs();
}));

// ============================================================================
// Enterprise Resilience & Telemetry IPC Handlers (Phase 7)
// ============================================================================

ipcMain.handle('audit-database', wrapIPC('audit-database', null, async () => {
  return storage.runIntegrityAudit();
}));

ipcMain.handle('export-diagnostic-report', wrapIPC('export-diagnostic-report', null, async (event) => {
  const report = storage.generateDiagnosticReport(app.getVersion() || '0.4.7');
  const win = getValidWindow(event);
  const options = {
    title: 'Export Diagnostic Telemetry Report (JSON)',
    defaultPath: path.join(app.getPath('documents'), `Ledgerly_Diagnostic_Report_${new Date().toISOString().split('T')[0]}.json`),
    filters: [{ name: 'JSON Files', extensions: ['json'] }]
  };
  const { filePath, canceled } = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options);

  if (canceled || !filePath) return { success: false, canceled: true };

  fs.writeFileSync(filePath, JSON.stringify(report, null, 2), 'utf-8');
  return { success: true, filePath, report };
}));

ipcMain.handle('check-pending-bills', wrapIPC('check-pending-bills', null, async () => {
  const recurringBills = storage.getRecurringBills ? storage.getRecurringBills() : [];
  const today = new Date();
  const currentDay = today.getDate();
  const currentMonthYear = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;

  const pending = recurringBills.filter(bill => {
    if (!bill || !bill.dueDay) return false;
    if (bill.lastPaidDate && bill.lastPaidDate.startsWith(currentMonthYear)) {
      return false;
    }
    return currentDay >= bill.dueDay;
  });

  return pending;
}));

ipcMain.handle('execute-bill-payment', wrapIPC('execute-bill-payment', (payload) => {
  if (!isPlainObject(payload) || !payload.billId) {
    return { valid: false, errors: ['billId is required in payment payload.'] };
  }
  return { valid: true, errors: [] };
}, async (_event, { billId, customAmount }) => {
  const recurringBills = storage.getRecurringBills();
  const bill = recurringBills.find(b => b.id === billId);
  if (!bill) {
    return { success: false, error: 'Bill not found' };
  }

  const amount = (customAmount !== undefined && customAmount > 0) ? customAmount : (bill.amount || 0);
  const todayStr = new Date().toISOString().split('T')[0];

  const expResult = storage.addExpense({
    title: bill.title || 'Utility Bill',
    amount,
    category: bill.category || 'Utilities',
    date: todayStr,
    paymentMethod: 'Auto / NetBanking',
    isHouseholdExpense: bill.autoSplit !== false,
    paidBy: bill.paidBy || 'Self',
    splitWith: bill.splitWith || ['Self', 'Partner'],
    metadata: { recurringBillId: bill.id }
  });

  storage.saveRecurringBill({
    ...bill,
    lastPaidDate: todayStr
  });

  return { success: true, expense: expResult, billId };
}));


