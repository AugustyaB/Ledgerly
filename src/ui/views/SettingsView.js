'use strict';

/**
 * @fileoverview General Settings & Preferences View Controller
 *
 * Architecture Position: src/ui/views/SettingsView.js
 * Role: Unified configuration hub for salary allocations, payday cycles,
 *       currency & preferences, category chip management, auto-categorizer
 *       keyword rules, database storage diagnostics, and notification toggles.
 * Dependencies: AppState, window.electronAPI, dom helpers, formatters, toast
 * Extracted from: src/app.js L3186-3615
 *
 * FUTURE: Cloud backup sync config, custom color theme creator, multi-currency wallets
 */

import { escapeHTML, delegateEvent, setInnerHTML } from '../helpers/dom.js';
import { showToast } from '../helpers/toast.js';


// ============================================================================
//  SettingsView Class
// ============================================================================

export class SettingsView {

  /** @type {HTMLElement|null} */
  #container = null;

  /** @type {import('../AppState.js').AppState} */
  #state;

  /** @type {any} */
  #api;

  /** @type {function(): Promise<void>} */
  #refreshAppData;

  /** @type {function(string): void} */
  #tabSwitcher;

  /** @type {Array<function(): void>} */
  #cleanupListeners = [];


  // ==========================================================================
  //  Constructor
  // ==========================================================================

  /**
   * @param {import('../AppState.js').AppState} state - Application state store
   * @param {any} [api] - IPC bridge (defaults to window.electronAPI)
   * @param {function(): Promise<void>} [refreshAppData] - Global data loader callback
   * @param {function(string): void} [tabSwitcher] - Tab switcher callback
   */
  constructor(state, api = window.electronAPI, refreshAppData = async () => {}, tabSwitcher = () => {}) {
    this.#state = state;
    this.#api = api;
    this.#refreshAppData = refreshAppData;
    this.#tabSwitcher = tabSwitcher;
  }


  // ==========================================================================
  //  Lifecycle Interface (ViewContract)
  // ==========================================================================

  /**
   * Mounts the settings workspace, initializes scrollspy navigation,
   * forms, and renders all settings sub-panes.
   *
   * @param {HTMLElement|null} [container] - Target container element (#view-settings)
   * @returns {void}
   */
  mount(container) {
    this.#container = container || document.getElementById('view-settings');
    if (!this.#container) return;

    this.#initSubTabNavigation();
    this.#bindSalaryForm();
    this.#bindPreferencesForm();
    this.#bindReducedMotion();

    const backBtn = document.getElementById('btn-settings-back-dashboard') || this.#container.querySelector('button[onclick*="dashboard"]');
    if (backBtn) {
      const clickHandler = (e) => {
        e.preventDefault();
        this.#tabSwitcher('dashboard');
      };
      backBtn.addEventListener('click', clickHandler);
      this.#cleanupListeners.push(() => backBtn.removeEventListener('click', clickHandler));
    }

    this.render();
  }


  /**
   * Orchestrates rendering across all settings panels.
   *
   * @returns {void}
   */
  render() {
    if (typeof document === 'undefined') return;

    const salary = this.#state.get('salaryConfig') || {
      monthlyIncome: 60000,
      fixedBills: 20000,
      savingsGoal: 10000,
      payday: 1,
      currencySymbol: '₹'
    };

    // 1. Populate salary inputs
    const incomeEl = document.getElementById('settings-salary-income');
    const billsEl = document.getElementById('settings-salary-bills');
    const savingsEl = document.getElementById('settings-salary-savings');
    const paydayEl = document.getElementById('settings-salary-payday');
    const actualDateEl = document.getElementById('settings-salary-actual-date');
    const nextOverrideEl = document.getElementById('settings-salary-next-override');

    if (incomeEl) incomeEl.value = salary.monthlyIncome || '';
    if (billsEl) billsEl.value = salary.fixedBills || '';
    if (savingsEl) savingsEl.value = salary.savingsGoal || '';
    if (paydayEl) paydayEl.value = salary.payday || 1;
    if (actualDateEl) actualDateEl.value = salary.currentCycleStartDate || '';
    if (nextOverrideEl) nextOverrideEl.value = salary.nextPaydayOverride || '';

    // 2. Set active shift chip
    this.#updateShiftChips(salary);

    // 3. Populate preferences pane
    const currencyEl = document.getElementById('settings-pref-currency');
    const modeEl = document.getElementById('settings-pref-workspace-mode');
    if (currencyEl) currencyEl.value = salary.currencySymbol || '₹';
    if (modeEl) modeEl.value = this.#state.get('workspaceMode') || 'household';

    // 4. Update all .global-curr-symbol spans in DOM
    const sym = salary.currencySymbol || '₹';
    document.querySelectorAll('.global-curr-symbol').forEach(el => {
      el.textContent = sym;
    });

    // 5. Render individual sub-panes
    this.updateCycleBanner();
    this.renderCategoriesPane();
    this.renderDataStoragePane();
    this.renderNotificationSettingsPane();

    const navItems = document.querySelectorAll('.settings-nav-item');
    if (navItems.length > 0 && !document.querySelector('.settings-nav-item.active')) {
      navItems[0].classList.add('active');
    }
  }


  /**
   * Unmounts the settings view and tears down listeners.
   *
   * @returns {void}
   */
  unmount() {
    for (const cleanup of this.#cleanupListeners) {
      cleanup();
    }
    this.#cleanupListeners = [];
  }


  // ==========================================================================
  //  Salary Cycle Banner
  // ==========================================================================

  /**
   * Updates the cycle metrics title and daily allowance summary banner.
   *
   * @returns {Promise<void>}
   */
  async updateCycleBanner() {
    if (typeof document === 'undefined') return;

    const titleEl = document.getElementById('settings-cycle-title');
    const subtextEl = document.getElementById('settings-cycle-subtext');
    if (!titleEl || !subtextEl) return;

    try {
      if (!this.#api?.getDailyBudgetMetrics) return;
      const metrics = await this.#api.getDailyBudgetMetrics();
      if (!metrics) return;

      const currSym = this.#state.get('salaryConfig')?.currencySymbol || '₹';

      const formatDate = (dateStr) => {
        if (!dateStr) return '—';
        const d = new Date(dateStr);
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
      };

      const cycleStart = formatDate(metrics.cycleStartDate);
      const nextPayday = formatDate(metrics.nextPaydayDate);
      const totalDays = metrics.totalDaysInCycle || 30;

      let shiftNote = '';
      if (metrics.shiftDays > 0) {
        shiftNote = ` • Salary delayed ${metrics.shiftDays}d`;
      } else if (metrics.shiftDays < 0) {
        shiftNote = ` • Salary ${Math.abs(metrics.shiftDays)}d early`;
      }

      titleEl.textContent = `Active Cycle: ${cycleStart} – ${nextPayday} (${totalDays} days)${shiftNote}`;
      subtextEl.textContent = `Remaining days: ${metrics.remainingDays} • Calculated Daily Allowance: ${currSym}${metrics.dailyAllowance?.toFixed(2) || '0.00'}/day`;
    } catch {
      titleEl.textContent = 'Cycle data unavailable';
      subtextEl.textContent = 'Save salary settings to calculate cycle metrics';
    }
  }


  // ==========================================================================
  //  Categories & Auto-Categorizer Keywords
  // ==========================================================================

  /**
   * Renders active category chips and keyword matching rules.
   *
   * @returns {Promise<void>}
   */
  async renderCategoriesPane() {
    if (typeof document === 'undefined') return;

    const categories = this.#state.get('categories') || [];

    // 1. Render Category Chips with delegated delete
    const chipsContainer = document.getElementById('settings-category-chips');
    if (chipsContainer) {
      const chipsHtml = categories.map(cat => `
        <span class="settings-category-chip">
          ${escapeHTML(cat)}
          <button type="button" class="chip-delete-btn" data-action="delete-category" data-cat-name="${escapeHTML(cat)}" title="Remove ${escapeHTML(cat)}">×</button>
        </span>
      `).join('');

      setInnerHTML(chipsContainer, chipsHtml);

      delegateEvent(chipsContainer, {
        'delete-category': async (target) => {
          const catName = target.getAttribute('data-cat-name');
          if (!catName) return;
          if (confirm(`Remove category "${catName}"? Existing expenses won't be affected.`)) {
            const res = await this.#api.deleteCategory(catName);
            if (res?.success) {
              await this.#refreshAppData();
              this.renderCategoriesPane();
              showToast(`Category "${catName}" removed`);
            }
          }
        }
      });
    }

    // 2. Wire Add Category Form
    const addForm = document.getElementById('settings-add-category-form');
    if (addForm && !addForm.dataset.modularWired) {
      addForm.dataset.modularWired = 'true';
      addForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const input = document.getElementById('settings-new-category-input');
        const name = input?.value.trim();
        if (!name) return;

        const res = await this.#api.addCategory(name);
        if (res?.success) {
          if (input) input.value = '';
          await this.#refreshAppData();
          this.renderCategoriesPane();
          showToast(`Category "${name}" added`);
        } else {
          showToast(res?.error || 'Failed to add category');
        }
      });
    }

    // 3. Render Keyword Rules Table
    const tbody = document.getElementById('settings-keywords-tbody');
    if (tbody && this.#api?.getCategoryKeywords) {
      try {
        const keywords = await this.#api.getCategoryKeywords();
        const entries = Object.entries(keywords || {});

        if (entries.length === 0) {
          setInnerHTML(tbody, '<tr><td colspan="3" style="text-align: center; color: var(--text-dim); padding: 16px;">No keyword rules yet. Add one below to teach the auto-categorizer.</td></tr>');
        } else {
          const rowsHtml = entries.map(([kw, cat]) => `
            <tr class="keyword-rule-row">
              <td style="font-weight: 600;">${escapeHTML(kw)}</td>
              <td>${escapeHTML(cat)}</td>
              <td>
                <button type="button" class="keyword-delete-btn" data-action="delete-keyword" data-kw-name="${escapeHTML(kw)}" title="Delete rule">
                  <i data-icon="x" data-icon-size="13"></i>
                </button>
              </td>
            </tr>
          `).join('');

          setInnerHTML(tbody, rowsHtml);

          delegateEvent(tbody, {
            'delete-keyword': async (target) => {
              const kw = target.getAttribute('data-kw-name');
              if (!kw) return;
              const res = await this.#api.deleteCategoryKeyword(kw);
              if (res?.success) {
                this.renderCategoriesPane();
                showToast(`Keyword rule "${kw}" removed`);
              }
            }
          });
        }
      } catch {
        setInnerHTML(tbody, '<tr><td colspan="3" style="color: var(--text-dim);">Failed to load keywords</td></tr>');
      }
    }

    // 4. Populate Keyword Category Dropdown
    const catSelect = document.getElementById('settings-keyword-category-select');
    if (catSelect) {
      catSelect.innerHTML = categories.map(c => `<option value="${escapeHTML(c)}">${escapeHTML(c)}</option>`).join('');
    }

    // 5. Wire Add Keyword Form
    const kwForm = document.getElementById('settings-add-keyword-form');
    if (kwForm && !kwForm.dataset.modularWired) {
      kwForm.dataset.modularWired = 'true';
      kwForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const kwInput = document.getElementById('settings-new-keyword-input');
        const catSel = document.getElementById('settings-keyword-category-select');
        const keyword = kwInput?.value.trim().toLowerCase();
        const category = catSel?.value;
        if (!keyword || !category) return;

        const res = await this.#api.learnCategoryKeyword(keyword, category);
        if (res?.success) {
          if (kwInput) kwInput.value = '';
          this.renderCategoriesPane();
          showToast(`Keyword "${keyword}" → ${category}`);
        }
      });
    }
  }


  // ==========================================================================
  //  Data & Storage Diagnostics
  // ==========================================================================

  /**
   * Renders database diagnostics and handles purge confirmation.
   *
   * @returns {Promise<void>}
   */
  async renderDataStoragePane() {
    if (typeof document === 'undefined') return;

    const diagContainer = document.getElementById('settings-storage-diagnostics');
    if (!diagContainer) return;

    try {
      if (!this.#api?.getStorageDiagnostics) return;
      const diag = await this.#api.getStorageDiagnostics();
      const fileSizeKB = (diag.fileSizeBytes / 1024).toFixed(1);
      const fileSizeMB = (diag.fileSizeBytes / (1024 * 1024)).toFixed(2);
      const sizeDisplay = diag.fileSizeBytes > 1048576 ? `${fileSizeMB} MB` : `${fileSizeKB} KB`;

      setInnerHTML(diagContainer, `
        <div class="diagnostics-grid">
          <div class="diagnostics-item">
            <span class="diagnostics-label">Database Path</span>
            <span class="diagnostics-value" style="font-size: 11px; max-width: 300px; overflow: hidden; text-overflow: ellipsis;" title="${escapeHTML(diag.dbPath)}">${escapeHTML(diag.dbPath)}</span>
          </div>
          <div class="diagnostics-item">
            <span class="diagnostics-label">Active Profile</span>
            <span class="diagnostics-value">${escapeHTML(diag.profileName)}</span>
          </div>
          <div class="diagnostics-item">
            <span class="diagnostics-label">Total Transactions</span>
            <span class="diagnostics-value">${diag.transactionCount.toLocaleString()}</span>
          </div>
          <div class="diagnostics-item">
            <span class="diagnostics-label">Categories</span>
            <span class="diagnostics-value">${diag.categoryCount}</span>
          </div>
          <div class="diagnostics-item">
            <span class="diagnostics-label">Quick Presets</span>
            <span class="diagnostics-value">${diag.presetCount}</span>
          </div>
          <div class="diagnostics-item">
            <span class="diagnostics-label">Contextual Notes</span>
            <span class="diagnostics-value">${diag.noteCount}</span>
          </div>
          <div class="diagnostics-item">
            <span class="diagnostics-label">File Size on Disk</span>
            <span class="diagnostics-value">${sizeDisplay}</span>
          </div>
        </div>
      `);
    } catch {
      diagContainer.textContent = 'Failed to load storage diagnostics';
    }

    // Wire Clear All Expenses button
    const clearBtn = document.getElementById('settings-clear-all-expenses-btn');
    if (clearBtn && !clearBtn.dataset.modularWired) {
      clearBtn.dataset.modularWired = 'true';
      clearBtn.addEventListener('click', async () => {
        if (!confirm('⚠️ Are you sure you want to delete ALL stored expenses? This cannot be undone.')) return;
        if (!confirm('This is your final confirmation. All expense records will be permanently erased. Continue?')) return;

        const res = await this.#api.clearAllExpenses();
        if (res?.success) {
          showToast(`Cleared ${res.clearedCount} expense records`);
          await this.#refreshAppData();
          this.renderDataStoragePane();
        }
      });
    }

    // Wire Data Backups & Exports buttons
    const exportCsvBtn = document.getElementById('btn-settings-export-csv');
    if (exportCsvBtn && !exportCsvBtn.dataset.modularWired) {
      exportCsvBtn.dataset.modularWired = 'true';
      exportCsvBtn.addEventListener('click', async () => {
        const res = await this.#api?.exportCSV?.();
        if (res?.success) {
          showToast('Exported CSV file successfully!');
        } else if (res && !res.canceled) {
          showToast(`Export Failed: ${res.error || 'Unknown error'}`);
        }
      });
    }

    const exportExcelBtn = document.getElementById('btn-settings-export-excel');
    if (exportExcelBtn && !exportExcelBtn.dataset.modularWired) {
      exportExcelBtn.dataset.modularWired = 'true';
      exportExcelBtn.addEventListener('click', async () => {
        const res = await this.#api?.exportExcel?.();
        if (res?.success) {
          showToast('Exported Excel file successfully!');
        } else if (res && !res.canceled) {
          showToast(`Export Failed: ${res.error || 'Unknown error'}`);
        }
      });
    }

    const exportJsonBtn = document.getElementById('btn-settings-export-json');
    if (exportJsonBtn && !exportJsonBtn.dataset.modularWired) {
      exportJsonBtn.dataset.modularWired = 'true';
      exportJsonBtn.addEventListener('click', async () => {
        const res = await this.#api?.exportJSON?.();
        if (res?.success) {
          showToast(`Exported JSON backup: ${res.filePath || ''}`);
        } else if (res && !res.canceled) {
          showToast(`Export Failed: ${res.error || 'Unknown error'}`);
        }
      });
    }

    // Wire Database Integrity Audit Button (Phase 7)
    const auditBtn = document.getElementById('btn-run-db-audit');
    if (auditBtn && !auditBtn.dataset.modularWired) {
      auditBtn.dataset.modularWired = 'true';
      auditBtn.addEventListener('click', async () => {
        auditBtn.setAttribute('disabled', 'true');
        showToast('Running database integrity audit...');
        try {
          const res = await this.#api?.auditDatabase?.();
          if (res?.success) {
            const report = res.report || {};
            const repairedCount = report.repairedIssues?.length || 0;
            const issuesCount = report.issuesFound?.length || 0;
            if (repairedCount > 0 || issuesCount > 0) {
              showToast(`Audit complete: repaired ${repairedCount} of ${issuesCount} issues.`);
            } else {
              showToast('Database integrity verified: 0 errors detected.');
            }
            await this.#refreshAppData();
            this.renderDataStoragePane();
          } else {
            showToast(`Audit failed: ${res?.error || 'Unknown error'}`);
          }
        } catch (err) {
          showToast(`Audit failed: ${err.message || 'Error'}`);
        } finally {
          auditBtn.removeAttribute('disabled');
        }
      });
    }

    // Wire Privacy-Sanitized Offline Telemetry Exporter (Phase 7)
    const diagBtn = document.getElementById('btn-export-diagnostic-report');
    if (diagBtn && !diagBtn.dataset.modularWired) {
      diagBtn.dataset.modularWired = 'true';
      diagBtn.addEventListener('click', async () => {
        diagBtn.setAttribute('disabled', 'true');
        showToast('Generating sanitized diagnostic bundle...');
        try {
          const res = await this.#api?.exportDiagnosticReport?.();
          if (res?.success) {
            showToast(`Diagnostic bundle exported: ${res.filePath || 'Saved'}`);
          } else if (res && !res.canceled) {
            showToast(`Export failed: ${res.error || 'Unknown error'}`);
          }
        } catch (err) {
          showToast(`Export failed: ${err.message || 'Error'}`);
        } finally {
          diagBtn.removeAttribute('disabled');
        }
      });
    }

    // Wire View Crash Logs Button (Phase 7)
    const viewLogsBtn = document.getElementById('btn-view-crash-logs');
    if (viewLogsBtn && !viewLogsBtn.dataset.modularWired) {
      viewLogsBtn.dataset.modularWired = 'true';
      viewLogsBtn.addEventListener('click', async () => {
        try {
          const logs = await this.#api?.getCrashLogs?.(50);
          if (!logs || logs.length === 0) {
            showToast('No crash or error entries recorded.');
          } else {
            const summary = logs.slice(0, 10).map(l => `[${l.timestamp}] ${l.type}: ${l.message}`).join('\n');
            alert(`Recent Application Error / Crash Logs (${logs.length} total):\n\n${summary}`);
          }
        } catch (err) {
          showToast(`Failed to fetch logs: ${err.message}`);
        }
      });
    }
  }


  // ==========================================================================
  //  Notification Settings
  // ==========================================================================

  /**
   * Renders notification preference toggles and binds form submission.
   *
   * @returns {Promise<void>}
   */
  async renderNotificationSettingsPane() {
    if (typeof document === 'undefined') return;
    if (!this.#api?.getNotificationConfig) return;

    try {
      const cfg = await this.#api.getNotificationConfig();
      const nativeToggle = document.getElementById('settings-notif-enable-native');
      const nudgeToggle = document.getElementById('settings-notif-daily-nudge');
      const nudgeTimeSelect = document.getElementById('settings-notif-nudge-time');
      const overdueToggle = document.getElementById('settings-notif-overdue-alerts');

      if (nativeToggle) nativeToggle.checked = cfg.enableNative !== false;
      if (nudgeToggle) nudgeToggle.checked = cfg.dailyNudge !== false;
      if (nudgeTimeSelect) nudgeTimeSelect.value = cfg.nudgeTime || '18:00';
      if (overdueToggle) overdueToggle.checked = cfg.overdueDebtAlerts !== false;

      const form = document.getElementById('settings-notif-form');
      if (form && !form.dataset.modularWired) {
        form.dataset.modularWired = 'true';
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          const updated = {
            enableNative: !!nativeToggle?.checked,
            dailyNudge: !!nudgeToggle?.checked,
            nudgeTime: nudgeTimeSelect?.value || '18:00',
            overdueDebtAlerts: !!overdueToggle?.checked
          };

          const res = await this.#api.saveNotificationConfig(updated);
          if (res?.success) {
            showToast('Notification preferences saved');
          }
        });
      }
    } catch (err) {
      console.error('[SettingsView] Failed to render notification settings:', err);
    }
  }


  // ==========================================================================
  //  Private Form & Navigation Handlers
  // ==========================================================================

  #initSubTabNavigation() {
    if (typeof document === 'undefined') return;

    const appContent = document.querySelector('.app-content');
    const sections = document.querySelectorAll('.settings-section');
    const navItems = document.querySelectorAll('.settings-nav-item');

    let isProgrammaticScroll = false;
    let scrollTimer = null;

    navItems.forEach(item => {
      const clickHandler = (e) => {
        e.preventDefault();
        const targetId = item.getAttribute('data-settings-target');
        if (!targetId) return;

        const targetPane = document.getElementById(targetId);
        if (targetPane) {
          isProgrammaticScroll = true;
          clearTimeout(scrollTimer);
          navItems.forEach(n => n.classList.remove('active'));
          item.classList.add('active');
          targetPane.scrollIntoView({ behavior: 'smooth', block: 'start' });
          scrollTimer = setTimeout(() => {
            isProgrammaticScroll = false;
          }, 800);
        }
      };

      item.addEventListener('click', clickHandler);
      this.#cleanupListeners.push(() => item.removeEventListener('click', clickHandler));
    });

    const updateActiveSettingsSection = () => {
      if (isProgrammaticScroll) return;
      const activeSettingsView = document.getElementById('view-settings');
      if (!activeSettingsView || activeSettingsView.classList.contains('hidden')) return;
      if (sections.length === 0) return;

      const containerTop = appContent ? appContent.getBoundingClientRect().top : 0;
      const isAtBottom = appContent
        ? (appContent.scrollHeight - appContent.scrollTop - appContent.clientHeight) < 80
        : false;

      let currentActiveId = null;

      if (isAtBottom && sections.length > 0) {
        currentActiveId = sections[sections.length - 1].id;
      } else {
        sections.forEach(sec => {
          const rect = sec.getBoundingClientRect();
          if (rect.top - containerTop <= 200) {
            currentActiveId = sec.id;
          }
        });
      }

      if (currentActiveId) {
        navItems.forEach(item => {
          const target = item.getAttribute('data-settings-target');
          item.classList.toggle('active', target === currentActiveId);
        });
      }
    };

    let isScrollThrottled = false;
    const onScrollHandler = () => {
      if (!isScrollThrottled && typeof window !== 'undefined') {
        window.requestAnimationFrame(() => {
          updateActiveSettingsSection();
          isScrollThrottled = false;
        });
        isScrollThrottled = true;
      }
    };

    if (appContent) {
      appContent.addEventListener('scroll', onScrollHandler, { passive: true });
      this.#cleanupListeners.push(() => appContent.removeEventListener('scroll', onScrollHandler));
    }
  }


  #bindSalaryForm() {
    if (typeof document === 'undefined') return;

    const form = document.getElementById('settings-salary-form');
    if (form && !form.dataset.modularWired) {
      form.dataset.modularWired = 'true';
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const income = parseFloat(document.getElementById('settings-salary-income')?.value) || 0;
        const bills = parseFloat(document.getElementById('settings-salary-bills')?.value) || 0;
        const savings = parseFloat(document.getElementById('settings-salary-savings')?.value) || 0;
        const payday = parseInt(document.getElementById('settings-salary-payday')?.value, 10) || 1;
        const actualDate = document.getElementById('settings-salary-actual-date')?.value || null;
        const nextOverride = document.getElementById('settings-salary-next-override')?.value || null;

        const updated = {
          monthlyIncome: income,
          fixedBills: bills,
          savingsGoal: savings,
          payday,
          currentCycleStartDate: actualDate,
          nextPaydayOverride: nextOverride
        };

        const res = await this.#api.setSalaryConfig(updated);
        if (res?.success) {
          this.#state.set('salaryConfig', res.salaryConfig || updated);
          showToast('Salary settings saved');
          await this.#refreshAppData();
          this.updateCycleBanner();
        }
      });
    }

    // Payday Shift Chips
    document.querySelectorAll('.btn-shift-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('.btn-shift-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        const shiftDays = parseInt(chip.getAttribute('data-shift') || '0', 10);
        const payday = parseInt(document.getElementById('settings-salary-payday')?.value, 10) || 1;
        const now = new Date();
        const target = new Date(now.getFullYear(), now.getMonth(), payday + shiftDays);
        const overrideInput = document.getElementById('settings-salary-next-override');
        if (overrideInput) {
          overrideInput.value = target.toISOString().split('T')[0];
        }
      });
    });
  }


  #bindPreferencesForm() {
    if (typeof document === 'undefined') return;

    const form = document.getElementById('settings-prefs-form');
    if (form && !form.dataset.modularWired) {
      form.dataset.modularWired = 'true';
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const currencySymbol = document.getElementById('settings-pref-currency')?.value || '₹';
        const workspaceMode = document.getElementById('settings-pref-workspace-mode')?.value || 'household';

        const currentSalary = this.#state.get('salaryConfig') || {};
        const res = await this.#api.setSalaryConfig({
          ...currentSalary,
          currencySymbol
        });

        if (this.#api?.setWorkspaceMode) {
          await this.#api.setWorkspaceMode(workspaceMode);
          this.#state.set('workspaceMode', workspaceMode);
        }

        if (res?.success) {
          this.#state.set('salaryConfig', res.salaryConfig || { ...currentSalary, currencySymbol });
          showToast('Preferences updated');
          await this.#refreshAppData();
          this.render();
        }
      });
    }
  }


  #bindReducedMotion() {
    if (typeof document === 'undefined') return;

    const isReduced = typeof localStorage !== 'undefined' && localStorage.getItem('ledgerly-reduced-motion') === 'true';
    if (isReduced) document.body.classList.add('reduced-motion');

    const checkbox = document.getElementById('settings-reduced-motion');
    if (checkbox && !checkbox.dataset.modularWired) {
      checkbox.dataset.modularWired = 'true';
      checkbox.checked = isReduced;
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) {
          document.body.classList.add('reduced-motion');
          if (typeof localStorage !== 'undefined') localStorage.setItem('ledgerly-reduced-motion', 'true');
        } else {
          document.body.classList.remove('reduced-motion');
          if (typeof localStorage !== 'undefined') localStorage.setItem('ledgerly-reduced-motion', 'false');
        }
      });
    }
  }


  #updateShiftChips(salary) {
    const chips = document.querySelectorAll('.btn-shift-chip');
    if (chips.length > 0 && salary.nextPaydayOverride) {
      const payday = Math.max(1, Math.min(31, parseInt(salary.payday, 10) || 1));
      const now = new Date();
      const cycleMonth = now.getDate() >= payday ? now.getMonth() : now.getMonth() - 1;
      const cycleYear = now.getFullYear();
      const standardNext = new Date(cycleYear, cycleMonth + 1, payday);
      const actualNext = new Date(salary.nextPaydayOverride);
      const msPerDay = 1000 * 60 * 60 * 24;
      const shiftDelta = Math.round((actualNext.getTime() - standardNext.getTime()) / msPerDay);

      chips.forEach(c => {
        c.classList.toggle('active', parseInt(c.getAttribute('data-shift') || '0', 10) === shiftDelta);
      });
    } else {
      chips.forEach(c => {
        c.classList.toggle('active', (c.getAttribute('data-shift') || '0') === '0');
      });
    }
  }
}
