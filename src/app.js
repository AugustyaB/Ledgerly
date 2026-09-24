'use strict';

/**
 * @fileoverview Ledgerly Desktop Application — Main Orchestrator & Bootstrap
 *
 * Architecture Position: src/app.js
 * Role: Modern ES Module entry point and lifecycle coordinator.
 *       Instantiates AppState, AppRouter, views, and standalone components.
 *       Manages data synchronization, global window controls, shortcuts,
 *       and real-time IPC messaging.
 *
 * Before Phase 4: 4,862 lines (monolithic renderer)
 * After Phase 4:  Clean, modular orchestrator
 */

// ============================================================================
// MODULE IMPORTS
// ============================================================================

import { AppState } from './ui/AppState.js';
import { AppRouter } from './ui/AppRouter.js';
import { DashboardView } from './ui/views/DashboardView.js';
import { ExpenseFeedView } from './ui/views/ExpenseFeedView.js';
import { HouseholdView } from './ui/views/HouseholdView.js';
import { BatchView } from './ui/views/BatchView.js';
import { SettingsView } from './ui/views/SettingsView.js';
import { NotesView } from './ui/views/NotesView.js';
import { NotificationView } from './ui/views/NotificationView.js';
import { ImportView } from './ui/views/ImportView.js';
import { AuthScreen } from './ui/components/AuthScreen.js';
import { CommandPalette } from './ui/components/CommandPalette.js';
import { escapeHTML } from './ui/helpers/dom.js';
import { showToast, showActionToast } from './ui/helpers/toast.js';

// ============================================================================
// STATE & MODULE SINGLETONS
// ============================================================================

const state = new AppState();
const api = typeof window !== 'undefined' ? window.electronAPI : null;

let router = null;
let dashboardView = null;
let expenseFeedView = null;
let householdView = null;
let batchView = null;
let settingsView = null;
let notesView = null;
let notificationView = null;
let importView = null;
let authScreen = null;
let commandPalette = null;

// ============================================================================
// APPLICATION INITIALIZATION & MOUNTING
// ============================================================================

/**
 * Instantiates all views and standalone components, wiring dependencies and hooks.
 */
function initApplication() {
  const switchTab = tab => router?.switchTo(tab);

  notesView = new NotesView(state, api, loadAppData);
  notificationView = new NotificationView(api, switchTab);
  importView = new ImportView(state, api, loadAppData, switchTab);
  batchView = new BatchView(state, api, loadAppData, switchTab);
  settingsView = new SettingsView(state, api, loadAppData, switchTab);

  householdView = new HouseholdView({
    state,
    api,
    onDataChanged: loadAppData
  });

  expenseFeedView = new ExpenseFeedView({
    state,
    api,
    onDataChanged: loadAppData,
    onOpenNote: (id, title) => notesView.openForExpense(id, title)
  });

  dashboardView = new DashboardView({
    state,
    api,
    onDataChanged: loadAppData,
    onNavigateTab: switchTab,
    onOpenExpenseModal: id => expenseFeedView.openEditModal(id),
    onOpenNoteModal: (id, title) => notesView.openForExpense(id, title),
    onViewReceipt: filename => expenseFeedView.viewReceiptImage(filename)
  });

  authScreen = new AuthScreen({
    state,
    api,
    onSessionReady: async () => {
      await loadAppData();
      router.switchTo('dashboard');
    }
  });

  commandPalette = new CommandPalette({
    state,
    handlers: {
      onOpenAddExpense: () => expenseFeedView.openAddModal(),
      onImportFile: () => document.getElementById('btn-import-file')?.click(),
      onOpenSalaryModal: () => dashboardView.openSalaryModal(),
      onExportExcel: () => document.getElementById('btn-export-excel')?.click(),
      onExportCsv: () => document.getElementById('btn-export-csv')?.click(),
      onTogglePrivacy: () => togglePrivacyMode(),
      onOpenProfilePicker: () => authScreen.showProfilePickerScreen(),
      onNavigateTab: tab => switchTab(tab),
      onOpenExpenseModal: id => expenseFeedView.openEditModal(id),
      onSetScope: pid => {
        state.set('dashboardScope', pid);
        const select = /** @type {HTMLSelectElement|null} */ (document.getElementById('dashboard-scope-filter'));
        if (select) select.value = pid;
        router.refreshCurrentView();
        switchTab('dashboard');
      }
    }
  });

  // Mount views to persistent HTML containers
  dashboardView.mount(document.getElementById('view-dashboard'));
  householdView.mount(document.getElementById('view-household'));
  batchView.mount(document.getElementById('view-batch'));
  expenseFeedView.mount(document.getElementById('view-expenses'));
  notesView.mount(document.getElementById('view-notes'));
  settingsView.mount(document.getElementById('view-settings'));
  notificationView.mount();
  importView.mount(document.getElementById('view-import'));
  authScreen.mount();
  commandPalette.mount();

  // Initialize Tab Lifecycle Router
  router = new AppRouter(state, {
    dashboard: dashboardView,
    household: householdView,
    batch: batchView,
    expenses: expenseFeedView,
    notes: notesView,
    settings: settingsView,
    import: importView
  });
}

// ============================================================================
// DATA FETCHING & SYNCHRONIZATION
// ============================================================================

/**
 * Fetches all domain data from Electron backend and updates reactive AppState.
 */
async function loadAppData() {
  if (!api) return;

  try {
    const [
      profiles,
      activeProfile,
      data,
      combined,
      presets,
      salaryConfig,
      householdMembers,
      notes,
      settlements,
      recurringBills,
      workspaceMode
    ] = await Promise.all([
      api.getProfiles?.() || [],
      api.getActiveProfile?.() || null,
      api.getExpenses?.() || { expenses: [], categories: [], budgetGoal: 30000 },
      api.getCombinedExpenses?.() || [],
      api.getPresets?.() || [],
      api.getSalaryConfig?.() || { monthlyIncome: 60000, fixedBills: 20000, savingsGoal: 10000 },
      api.getHouseholdMembers?.() || ['Self', 'Partner', 'Roommate'],
      api.getNotes?.() || [],
      api.getSettlements?.() || [],
      api.getRecurringBills?.() || [],
      api.getWorkspaceMode?.() || 'household'
    ]);

    state.update({
      profiles: profiles || [],
      activeProfile: activeProfile || null,
      expenses: data.expenses || [],
      allHouseholdExpenses: combined || [],
      categories: data.categories || [],
      budgetGoal: data.budgetGoal || 30000,
      presets: presets || data.presets || [],
      salaryConfig: salaryConfig ||
        data.salaryConfig || { monthlyIncome: 60000, fixedBills: 20000, savingsGoal: 10000 },
      householdMembers: householdMembers || data.householdMembers || ['Self', 'Partner', 'Roommate'],
      notes: notes || [],
      settlements: settlements || [],
      recurringBills: recurringBills || [],
      workspaceMode: workspaceMode || 'household'
    });

    updateHeaderAndSidebarUI();
    populateCategorySelects();
    populateHouseholdMemberControls();
    if (router) router.refreshCurrentView();
  } catch (err) {
    console.error('[App] Error loading application data:', err);
  }
}

/**
 * Updates top-bar profile info, solo-mode body class, and scope dropdown options.
 */
function updateHeaderAndSidebarUI() {
  if (typeof document === 'undefined') return;

  const activeProfile = state.get('activeProfile');
  const expenses = state.get('expenses') || [];
  const profiles = state.get('profiles') || [];
  const workspaceMode = state.get('workspaceMode') || 'household';

  if (activeProfile) {
    const avatarEl = document.getElementById('current-profile-avatar');
    const nameEl = document.getElementById('current-profile-name');
    const countEl = document.getElementById('profile-stat-count');
    if (avatarEl && typeof renderMonogram === 'function') {
      const name = activeProfile.name || 'Personal';
      const color =
        activeProfile.color ||
        activeProfile.avatar ||
        (typeof getAvatarColor === 'function' ? getAvatarColor(name) : '#D9822B');
      avatarEl.innerHTML = renderMonogram(name, 28, color);
    }
    if (nameEl) nameEl.textContent = activeProfile.name || 'Personal';
    if (countEl) countEl.textContent = `${expenses.length} expenses`;
  }

  // Solo Workspace Mode Styling
  document.body.classList.toggle('mode-solo', workspaceMode === 'solo');
  const modeText = document.getElementById('menu-mode-text');
  const modeIcon = document.getElementById('menu-mode-icon');
  if (modeText) modeText.textContent = workspaceMode === 'solo' ? 'Switch to Household Mode' : 'Switch to Solo Mode';
  if (modeIcon && typeof icon === 'function')
    modeIcon.innerHTML = workspaceMode === 'solo' ? icon('users', 14) : icon('user', 14);

  // Multi-User Scope Filter in Dashboard Header
  const scopeSelect = /** @type {HTMLSelectElement|null} */ (document.getElementById('dashboard-scope-filter'));
  if (scopeSelect) {
    const prevVal = state.get('dashboardScope') || 'ALL';
    scopeSelect.innerHTML = `
      <option value="ALL">Combined Household</option>
      ${profiles.map(p => `<option value="${escapeHTML(p.id)}">${escapeHTML(p.name)}</option>`).join('')}
    `;
    scopeSelect.value = prevVal;
  }
}

/**
 * Populates category dropdown select elements across all forms.
 */
function populateCategorySelects() {
  if (typeof document === 'undefined') return;

  const categories = state.get('categories') || [];
  const filterSelect = document.getElementById('filter-category');
  const formSelect = document.getElementById('form-category');
  const expressSelect = document.getElementById('express-category');
  const presetSelect = document.getElementById('preset-form-category');
  const recurringSelect = document.getElementById('recurring-bill-category');

  if (filterSelect) filterSelect.innerHTML = '<option value="ALL">All Categories</option>';
  if (formSelect) formSelect.innerHTML = '';
  if (expressSelect) expressSelect.innerHTML = '';
  if (presetSelect) presetSelect.innerHTML = '';
  if (recurringSelect) recurringSelect.innerHTML = '';

  categories.forEach(cat => {
    if (filterSelect) filterSelect.appendChild(new Option(cat, cat));
    if (formSelect) formSelect.appendChild(new Option(cat, cat));
    if (expressSelect) expressSelect.appendChild(new Option(cat, cat));
    if (presetSelect) presetSelect.appendChild(new Option(cat, cat));
    if (recurringSelect) recurringSelect.appendChild(new Option(cat, cat));
  });
}

/**
 * Populates household member dropdown selects and split checkbox containers.
 */
function populateHouseholdMemberControls() {
  if (typeof document === 'undefined') return;

  const members = state.get('householdMembers') || ['Self', 'Partner'];
  const paidBySelect = document.getElementById('form-paid-by');
  const recurringPaidBy = document.getElementById('recurring-bill-paidby');
  const splitWithContainer = document.getElementById('form-split-with-container');

  if (paidBySelect) {
    paidBySelect.innerHTML = '';
    members.forEach(m => paidBySelect.appendChild(new Option(m, m)));
  }

  if (recurringPaidBy) {
    recurringPaidBy.innerHTML = '';
    members.forEach(m => recurringPaidBy.appendChild(new Option(m, m)));
  }

  if (splitWithContainer) {
    splitWithContainer.innerHTML = members
      .map(
        m => `
      <label style="display: inline-flex; align-items: center; gap: 4px; font-size: 12px; cursor: pointer; background: var(--bg-card); padding: 4px 8px; border-radius: var(--radius-sm); border: 1px solid var(--border-color);">
        <input type="checkbox" name="split-member" value="${escapeHTML(m)}" checked style="width: auto;">
        ${escapeHTML(m)}
      </label>
    `
      )
      .join('');
  }
}

// ============================================================================
// PRIVACY MODE & SIDEBAR DRAWER ENGINES
// ============================================================================

/**
 * Toggles stealth privacy mode, masking monetary values across the application.
 * @param {boolean|null} [forceState=null]
 */
function togglePrivacyMode(forceState = null) {
  const current = state.get('isPrivacyMode') || false;
  const next = forceState !== null ? forceState : !current;
  state.set('isPrivacyMode', next);
  document.body.classList.toggle('privacy-mode', next);

  const lockBadge = document.getElementById('privacy-lock-badge');
  const titlebarIcon = document.getElementById('brand-logo-icon');
  const dashboardBrandIcon = document.getElementById('dashboard-brand-icon');
  const dashboardPrivacyBadge = document.getElementById('dashboard-privacy-badge');

  if (lockBadge) lockBadge.classList.toggle('hidden', !next);
  if (titlebarIcon) {
    titlebarIcon.innerHTML =
      next && typeof icon === 'function'
        ? icon('lock', 14)
        : '<img src="../assets/icon-taskbar.png" alt="Ledgerly" class="titlebar-brand-img">';
  }
  if (dashboardBrandIcon) {
    dashboardBrandIcon.innerHTML =
      next && typeof icon === 'function'
        ? icon('lock', 18)
        : '<img src="../assets/icon-taskbar.png" alt="Ledgerly" class="dashboard-brand-img">';
  }
  if (dashboardPrivacyBadge) {
    dashboardPrivacyBadge.innerHTML = next
      ? `<span style="display: inline-flex; align-items: center; gap: 4px;">${typeof icon === 'function' ? icon('lock', 12) : ''} Stealth</span>`
      : `<span style="display: inline-flex; align-items: center; gap: 4px;">${typeof icon === 'function' ? icon('eye', 12) : ''} Normal</span>`;
  }

  showToast(next ? 'Stealth Mode Active (Amounts Masked)' : 'Normal Visibility Mode Restored');
}

/**
 * Toggles navigation sidebar drawer open/close.
 * @param {boolean|null} [forceState=null]
 */
function toggleSidebar(forceState = null) {
  const sidebar = document.getElementById('app-sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');
  if (!sidebar) return;

  const isExpanded = forceState !== null ? forceState : !sidebar.classList.contains('expanded');
  sidebar.classList.toggle('expanded', isExpanded);
  if (backdrop) backdrop.classList.toggle('hidden', !isExpanded);
}

/**
 * Pops and executes the most recent undo action from the state undo stack.
 * @returns {Promise<void>}
 */
async function handleGlobalUndo() {
  const action = state.popUndoAction();
  if (!action) {
    showToast('Nothing to undo');
    return;
  }

  try {
    if (typeof action.undo === 'function') {
      await action.undo();
    } else if (action.type === 'DELETE_EXPENSE' && action.payload && api?.addExpense) {
      await api.addExpense(action.payload);
      await loadAppData();
      router.refreshCurrentView();
    }
    showToast(`Undone: ${action.description || 'Action reverted'}`);
  } catch (err) {
    console.error('[GlobalUndo] Error reverting action:', err);
    showToast('Failed to revert action');
  }
}

// ============================================================================
// GLOBAL EVENT LISTENERS & SHORTCUTS
// ============================================================================

/**
 * Sets up window titlebar buttons, navigation links, keyboard shortcuts,
 * and clipboard paste handlers.
 */
function setupGlobalListeners() {
  // 1. Window Controls
  document.getElementById('btn-minimize')?.addEventListener('click', () => api?.minimizeWindow?.());
  document.getElementById('btn-maximize')?.addEventListener('click', () => api?.maximizeWindow?.());
  document.getElementById('btn-close')?.addEventListener('click', () => api?.closeWindow?.());

  // 2. Sidebar Navigation & Drawer
  document.getElementById('sidebar-toggle-btn')?.addEventListener('click', () => toggleSidebar());
  document.getElementById('sidebar-backdrop')?.addEventListener('click', () => toggleSidebar(false));
  document.getElementById('sidebar-mini-budget-wrap')?.addEventListener('click', () => toggleSidebar(true));

  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      const tab = item.getAttribute('data-tab');
      if (tab) {
        router.switchTo(tab);
        toggleSidebar(false);
      }
    });
  });

  // Settings & Import Header Quick Links
  document.getElementById('btn-open-settings-header')?.addEventListener('click', () => {
    router.switchTo('settings');
  });
  document.getElementById('btn-import-file')?.addEventListener('click', () => {
    router.switchTo('import');
  });

  // Privacy Mode Triggers
  document.getElementById('titlebar-logo-btn')?.addEventListener('click', () => togglePrivacyMode());
  document.getElementById('dashboard-brand-privacy-btn')?.addEventListener('click', () => togglePrivacyMode());

  // Scope Selector
  document.getElementById('dashboard-scope-filter')?.addEventListener('change', e => {
    state.set('dashboardScope', /** @type {HTMLSelectElement} */ (e.target).value);
    router.refreshCurrentView();
  });

  // 3. Global Keyboard Shortcuts
  document.addEventListener('keydown', e => {
    // Ctrl+N / Cmd+N -> Focus Express NLP Entry Bar on Dashboard
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
      e.preventDefault();
      router.switchTo('dashboard');
      const nlpInput = document.getElementById('express-nlp-input') || document.getElementById('express-title');
      if (nlpInput) {
        nlpInput.focus();
        /** @type {HTMLInputElement} */ (nlpInput).select();
      }
      return;
    }

    // Ctrl+K / Cmd+K -> Universal Command Palette
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      commandPalette.open();
      return;
    }

    // P -> Privacy Mode Toggle (when not actively typing in an input)
    if (
      e.key.toLowerCase() === 'p' &&
      !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName || '')
    ) {
      e.preventDefault();
      togglePrivacyMode();
      return;
    }

    // Alt+1 .. Alt+9 -> Trigger One-Click Preset Hotkeys
    if (e.altKey && !isNaN(parseInt(e.key, 10))) {
      const num = parseInt(e.key, 10);
      const presets = state.get('presets') || [];
      if (num >= 1 && num <= presets.length) {
        e.preventDefault();
        dashboardView.logPresetExpense(presets[num - 1].id);
        return;
      }
    }

    // Ctrl+Z / Cmd+Z -> Global Undo (Phase 7)
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName || '')) {
        return;
      }
      e.preventDefault();
      handleGlobalUndo();
      return;
    }

    // Escape -> Close Command Palette if open
    if (e.key === 'Escape') {
      const paletteModal = document.getElementById('command-palette-modal');
      if (paletteModal && paletteModal.classList.contains('active')) {
        commandPalette.close();
      }
    }
  });

  // 4. Global Direct Clipboard Image Paste (Ctrl+V)
  window.addEventListener('paste', async e => {
    const items = e.clipboardData && e.clipboardData.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        if (file) {
          const reader = new FileReader();
          reader.onload = async () => {
            const base64Data = reader.result;
            if (api?.saveReceiptBuffer) {
              const res = await api.saveReceiptBuffer(base64Data);
              if (res && res.success) {
                state.set('pendingReceiptFilename', res.filename);
                const filenameInput = /** @type {HTMLInputElement|null} */ (
                  document.getElementById('form-receipt-filename')
                );
                const statusText = document.getElementById('receipt-status-text');
                if (filenameInput) filenameInput.value = res.filename;
                if (statusText) statusText.textContent = `Attached from Clipboard: ${res.filename}`;

                const modal = document.getElementById('expense-modal');
                if (modal && !modal.classList.contains('active')) {
                  expenseFeedView.openAddModal();
                  if (filenameInput) filenameInput.value = res.filename;
                  if (statusText) statusText.textContent = `Attached from Clipboard: ${res.filename}`;
                }
                showActionToast({ icon: 'camera', title: 'Receipt Screenshot Attached', subtext: res.filename });
              }
            }
          };
          reader.readAsDataURL(file);
          break;
        }
      }
    }
  });

  // 5. Dynamic Merchant Category Prediction on Expense Form
  document.getElementById('form-title')?.addEventListener('input', async e => {
    const title = /** @type {HTMLInputElement} */ (e.target).value.trim();
    if (title && api?.predictCategory) {
      const predicted = await api.predictCategory(title);
      if (predicted) {
        const catSelect = /** @type {HTMLSelectElement|null} */ (document.getElementById('form-category'));
        if (catSelect && catSelect.value !== predicted) {
          catSelect.value = predicted;
        }
      }
    }
  });

  document.getElementById('form-category')?.addEventListener('change', async e => {
    const title = /** @type {HTMLInputElement|null} */ (document.getElementById('form-title'))?.value.trim();
    const cat = /** @type {HTMLSelectElement} */ (e.target).value;
    if (title && cat && api?.learnCategoryKeyword) {
      await api.learnCategoryKeyword(title, cat);
    }
  });

  // 6. Real-Time Data Sync from Desktop Floating Widget & Mobile Companion
  if (api?.onDataUpdated) {
    api.onDataUpdated(async (event) => {
      await loadAppData();
      if (event?.type === 'mobile-sync') {
        const deviceName = event.device || 'Mobile Companion';
        if (event.action === 'receipt-uploaded') {
          showActionToast({
            icon: 'camera',
            title: 'Receipt Image Received',
            subtext: `Uploaded from ${deviceName}${event.deduplicated ? ' (deduplicated)' : ''}`
          });
        } else {
          const count = event.appliedCount || 1;
          showActionToast({
            icon: 'smartphone',
            title: 'Mobile Companion Synced',
            subtext: `Ingested ${count} item(s) from ${deviceName}`
          });
        }
      } else {
        showActionToast({
          icon: 'zap',
          title: 'Quick Pill Expense Logged',
          subtext: 'Logged via desktop floating widget'
        });
      }
    });
  }
}

// ============================================================================
// GLOBAL RENDERER ERROR & EXCEPTION TRAPS (Phase 6)
// ============================================================================

function setupGlobalErrorTraps() {
  if (typeof window === 'undefined') return;

  window.addEventListener('error', event => {
    const errorDetails = {
      type: 'RENDERER_UNCAUGHT_ERROR',
      message: event.message || 'Uncaught renderer error',
      filename: event.filename || 'unknown',
      lineno: event.lineno,
      colno: event.colno,
      stack: event.error?.stack || '(none)',
      url: window.location?.href
    };

    console.error('[Global Error Trap]', errorDetails);

    if (api?.reportRendererError) {
      api.reportRendererError(errorDetails).catch(() => {});
    }

    showToast(`Unexpected error: ${event.message || 'Script error'}`, 'error');
  });

  window.addEventListener('unhandledrejection', event => {
    const reason = event.reason;
    const errorDetails = {
      type: 'RENDERER_UNHANDLED_REJECTION',
      message: reason?.message || String(reason || 'Unhandled promise rejection'),
      stack: reason?.stack || '(none)',
      url: window.location?.href
    };

    console.error('[Global Unhandled Rejection Trap]', errorDetails);

    if (api?.reportRendererError) {
      api.reportRendererError(errorDetails).catch(() => {});
    }

    showToast(`Unhandled rejection: ${errorDetails.message}`, 'error');
  });
}

// Immediately initialize traps upon script loading
setupGlobalErrorTraps();

// ============================================================================
// BACKWARD COMPATIBILITY WINDOW BRIDGES
// ============================================================================

if (typeof window !== 'undefined') {
  window.switchTab = tab => router?.switchTo(tab);
  window.recoverToTab = tab => router?.recoverToTab(tab);
  window.togglePrivacyMode = togglePrivacyMode;
  window.toggleSidebar = toggleSidebar;
  window.openCommandPalette = () => commandPalette?.open();
  window.closeCommandPalette = () => commandPalette?.close();
  window.openProfilePickerScreen = () => authScreen?.showProfilePickerScreen();
  window.openPersonModal = id => authScreen?.openPersonModal(id);
  window.closePersonModal = () => authScreen?.closePersonModal();
  window.openManageProfilesModal = () => authScreen?.openManageProfilesModal();
  window.closeManageProfilesModal = () => authScreen?.closeManageProfilesModal();
  window.openAddModal = () => expenseFeedView?.openAddModal();
  window.openEditModal = id => expenseFeedView?.openEditModal(id);
  window.closeModal = () => expenseFeedView?.closeModal();
  window.viewReceiptImage = filename => expenseFeedView?.viewReceiptImage(filename);
  window.openSettleModal = (...args) => householdView?.openSettleModal(...args);
  window.closeSettleModal = () => householdView?.closeSettleModal();
  window.openAddRecurringBillModal = () => householdView?.openAddRecurringBillModal();
  window.openEditRecurringBillModal = (...args) => householdView?.openEditRecurringBillModal(...args);
  window.closeRecurringBillModal = () => householdView?.closeRecurringBillModal();
  window.openAddPresetModal = () => dashboardView?.openAddPresetModal();
  window.openEditPresetModal = id => dashboardView?.openEditPresetModal(id);
  window.closePresetModal = () => dashboardView?.closePresetModal();
  window.logPresetExpense = id => dashboardView?.logPresetExpense(id);
  window.openSalaryModal = () => dashboardView?.openSalaryModal();
  window.closeSalaryModal = () => dashboardView?.closeSalaryModal();
  window.openNoteModalForExpense = (id, title) => notesView?.openForExpense(id, title);
  window.getCrashLogs = maxLines => api?.getCrashLogs?.(maxLines);
  window.undoLastAction = handleGlobalUndo;
}

// ============================================================================
// BOOTSTRAP ENTRY POINT
// ============================================================================

document.addEventListener('DOMContentLoaded', async () => {
  initApplication();
  setupGlobalListeners();
  await authScreen.initAppSession();
});
