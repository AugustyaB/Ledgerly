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

  /** @type {string} */
  #activeModelFilter = 'all';

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
    this.#bindModelManager();

    const backBtn =
      document.getElementById('btn-settings-back-dashboard') ||
      this.#container.querySelector('button[onclick*="dashboard"]');
    if (backBtn) {
      const clickHandler = e => {
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
    this.renderModelsPane();
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

      const formatDate = dateStr => {
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
      const chipsHtml = categories
        .map(
          cat => `
        <span class="settings-category-chip">
          ${escapeHTML(cat)}
          <button type="button" class="chip-delete-btn" data-action="delete-category" data-cat-name="${escapeHTML(cat)}" title="Remove ${escapeHTML(cat)}">×</button>
        </span>
      `
        )
        .join('');

      setInnerHTML(chipsContainer, chipsHtml);

      delegateEvent(chipsContainer, {
        'delete-category': async target => {
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
      addForm.addEventListener('submit', async e => {
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
          setInnerHTML(
            tbody,
            '<tr><td colspan="3" style="text-align: center; color: var(--text-dim); padding: 16px;">No keyword rules yet. Add one below to teach the auto-categorizer.</td></tr>'
          );
        } else {
          const rowsHtml = entries
            .map(
              ([kw, cat]) => `
            <tr class="keyword-rule-row">
              <td style="font-weight: 600;">${escapeHTML(kw)}</td>
              <td>${escapeHTML(cat)}</td>
              <td>
                <button type="button" class="keyword-delete-btn" data-action="delete-keyword" data-kw-name="${escapeHTML(kw)}" title="Delete rule">
                  <i data-icon="x" data-icon-size="13"></i>
                </button>
              </td>
            </tr>
          `
            )
            .join('');

          setInnerHTML(tbody, rowsHtml);

          delegateEvent(tbody, {
            'delete-keyword': async target => {
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
      kwForm.addEventListener('submit', async e => {
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

      setInnerHTML(
        diagContainer,
        `
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
      `
      );
    } catch {
      diagContainer.textContent = 'Failed to load storage diagnostics';
    }

    // Wire Clear All Expenses button
    const clearBtn = document.getElementById('settings-clear-all-expenses-btn');
    if (clearBtn && !clearBtn.dataset.modularWired) {
      clearBtn.dataset.modularWired = 'true';
      clearBtn.addEventListener('click', async () => {
        if (!confirm('⚠️ Are you sure you want to delete ALL stored expenses? This cannot be undone.')) return;
        if (!confirm('This is your final confirmation. All expense records will be permanently erased. Continue?'))
          return;

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
            const summary = logs
              .slice(0, 10)
              .map(l => `[${l.timestamp}] ${l.type}: ${l.message}`)
              .join('\n');
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
        form.addEventListener('submit', async e => {
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
      const clickHandler = e => {
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
        ? appContent.scrollHeight - appContent.scrollTop - appContent.clientHeight < 80
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
      form.addEventListener('submit', async e => {
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
      form.addEventListener('submit', async e => {
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

  // ==========================================================================
  //  On-Device AI Models & Intelligence (Phase 0.5.4)
  // ==========================================================================

  #isModelManagerBound = false;

  #bindModelManager() {
    if (this.#isModelManagerBound || typeof document === 'undefined') return;
    this.#isModelManagerBound = true;

    const refreshBtn = document.getElementById('btn-refresh-models');
    if (refreshBtn) {
      const onRefresh = e => {
        e.preventDefault();
        this.renderModelsPane();
        showToast('Model catalog refreshed.');
      };
      refreshBtn.addEventListener('click', onRefresh);
      this.#cleanupListeners.push(() => refreshBtn.removeEventListener('click', onRefresh));
    }

    // Delegate clicks inside #models-cards-grid
    const gridEl = document.getElementById('models-cards-grid');
    if (gridEl) {
      const onGridClick = async e => {
        const btn = e.target.closest('button[data-model-action]');
        if (!btn) return;
        e.preventDefault();

        const action = btn.getAttribute('data-model-action');
        const modelId = btn.getAttribute('data-model-id');
        if (!action || !modelId) return;

        if (action === 'download') {
          await this.#handleDownloadModel(modelId, btn);
        } else if (action === 'delete') {
          await this.#handleDeleteModel(modelId, btn);
        } else if (action === 'set-active') {
          await this.#handleSetActiveModel(modelId, btn);
        } else if (action === 'verify') {
          await this.#handleVerifyModel(modelId, btn);
        }
      };
      gridEl.addEventListener('click', onGridClick);
      this.#cleanupListeners.push(() => gridEl.removeEventListener('click', onGridClick));
    }

    // Filter bar tabs delegation (#models-filter-bar)
    const filterBar = document.getElementById('models-filter-bar');
    if (filterBar) {
      const onFilterClick = e => {
        const btn = e.target.closest('button[data-action="filter-models"]');
        if (!btn) return;
        e.preventDefault();
        const filter = btn.getAttribute('data-filter') || 'all';
        this.#activeModelFilter = filter;
        filterBar.querySelectorAll('.models-filter-btn').forEach(b => {
          b.classList.remove('btn-primary');
          b.classList.add('btn-secondary');
        });
        btn.classList.remove('btn-secondary');
        btn.classList.add('btn-primary');
        this.renderModelsPane();
      };
      filterBar.addEventListener('click', onFilterClick);
      this.#cleanupListeners.push(() => filterBar.removeEventListener('click', onFilterClick));
    }

    // Subscribe to IPC download progress events
    if (this.#api?.onModelDownloadProgress) {
      this.#api.onModelDownloadProgress(progress => {
        this.#updateDownloadProgressUI(progress);
      });
    }

    // Subscribe to active model change events
    if (this.#api?.onActiveModelChanged) {
      this.#api.onActiveModelChanged(() => {
        this.renderModelsPane();
      });
    }
  }

  /**
   * Renders the Handy-style model cards grid and storage metrics.
   * @returns {Promise<void>}
   */
  async renderModelsPane() {
    if (typeof document === 'undefined') return;
    const gridEl = document.getElementById('models-cards-grid');
    const storagePill = document.getElementById('models-storage-pill');
    const activeTitle = document.getElementById('active-model-title');
    const activeDesc = document.getElementById('active-model-desc');
    if (!gridEl) return;

    try {
      if (!this.#api?.listModels) {
        setInnerHTML(
          gridEl,
          '<div style="color: var(--text-muted); padding: 16px;">Model management API unavailable.</div>'
        );
        return;
      }

      const activeCurrency = this.#state.get('salaryConfig')?.currencySymbol || '₹';
      const modelsRes = await this.#api.listModels(activeCurrency);
      let models = Array.isArray(modelsRes) ? modelsRes : modelsRes?.data || [];

      // Filter by active region/tier tab
      if (this.#activeModelFilter && this.#activeModelFilter !== 'all') {
        if (this.#activeModelFilter === 'vision') {
          models = models.filter(m => m.tier === 2 || (m.id && m.id.includes('vision')));
        } else {
          models = models.filter(m => m.region === this.#activeModelFilter);
        }
      }

      // Update storage pill
      if (this.#api.getModelsStorageUsage) {
        const usageRes = await this.#api.getModelsStorageUsage();
        const usage = usageRes?.data || usageRes || {};
        if (storagePill) {
          storagePill.textContent = `Storage: ${usage.totalMb || 0} MB installed`;
        }
      }

      if (!models || models.length === 0) {
        setInnerHTML(
          gridEl,
          '<div style="color: var(--text-muted); padding: 16px;">No models found matching the selected filter.</div>'
        );
        return;
      }

      // Identify active model
      const activeModel = models.find(m => m.isActive) || models[0];
      if (activeTitle && activeModel) {
        activeTitle.textContent = `Active Engine: ${activeModel.name}`;
      }
      if (activeDesc && activeModel) {
        activeDesc.textContent = activeModel.description;
      }

      // Render cards
      let html = '';
      for (const m of models) {
        const cardBorder = m.isActive ? 'border-color: #10B981; box-shadow: 0 0 12px rgba(16, 185, 129, 0.15);' : '';

        let statusBadge = '';
        if (m.isActive) {
          statusBadge =
            '<span class="badge" style="background: rgba(16, 185, 129, 0.2); color: #34D399; font-weight: 700; font-size: 11px;">✓ ACTIVE ENGINE</span>';
        } else if (m.isBundled) {
          statusBadge =
            '<span class="badge" style="background: rgba(56, 189, 248, 0.2); color: #38BDF8; font-weight: 600; font-size: 11px;">BUNDLED (OFFLINE)</span>';
        } else if (m.isDownloaded) {
          statusBadge =
            '<span class="badge" style="background: rgba(16, 185, 129, 0.15); color: #10B981; font-weight: 600; font-size: 11px;">INSTALLED</span>';
        } else {
          statusBadge =
            '<span class="badge" style="background: rgba(255, 255, 255, 0.08); color: var(--text-muted); font-size: 11px;">AVAILABLE FOR DOWNLOAD</span>';
        }

        const recommendationBadge = m.isRecommended
          ? '<span class="badge" style="background: rgba(217, 130, 43, 0.25); color: var(--accent-primary); font-weight: 700; font-size: 10.5px; border: 1px solid rgba(217, 130, 43, 0.4);">⭐ Recommended for your currency</span>'
          : '';

        const featuresHtml = (m.features || [])
          .map(
            f => `
          <div style="font-size: 11.5px; color: var(--text-muted); display: flex; align-items: center; gap: 6px; margin-bottom: 4px;">
            <span style="color: var(--accent-primary); font-weight: 700;">✓</span> ${escapeHTML(f)}
          </div>
        `
          )
          .join('');

        let actionsHtml = '';
        if (m.isActive) {
          actionsHtml = `
            <button class="btn btn-secondary btn-sm" disabled style="opacity: 0.75; cursor: default; width: 100%;">
              <i data-icon="check" data-icon-size="13"></i> Currently Active Engine
            </button>
          `;
        } else if (m.isDownloaded || m.isBundled) {
          actionsHtml = `
            <div style="display: flex; gap: 8px; width: 100%;">
              <button class="btn btn-primary btn-sm" data-model-action="set-active" data-model-id="${m.id}" style="flex: 1;">
                <i data-icon="zap" data-icon-size="13"></i> Set as Active
              </button>
              ${
                !m.isBundled
                  ? `
                <button class="btn btn-secondary btn-sm" data-model-action="delete" data-model-id="${m.id}" title="Delete model to reclaim disk space" style="color: #FB7185; border-color: rgba(251, 113, 133, 0.3);">
                  <i data-icon="trash-2" data-icon-size="13"></i>
                </button>
              `
                  : ''
              }
            </div>
          `;
        } else if (m.isDownloading) {
          actionsHtml = `
            <div style="width: 100%;">
              <div class="progress-bar-container" style="background: rgba(255, 255, 255, 0.08); border-radius: 4px; height: 6px; margin-bottom: 8px; overflow: hidden;">
                <div id="progress-bar-${m.id}" style="background: var(--accent-primary); height: 100%; width: ${m.downloadProgress?.percentage || 0}%; transition: width 0.2s;"></div>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span id="progress-text-${m.id}" style="font-size: 11px; color: var(--accent-primary); font-weight: 600;">Downloading (${m.downloadProgress?.percentage || 0}%)...</span>
                <button class="btn btn-secondary btn-sm" data-model-action="cancel" data-model-id="${m.id}" style="padding: 2px 8px; font-size: 11px;">Cancel</button>
              </div>
            </div>
          `;
        } else {
          actionsHtml = `
            <button class="btn btn-primary btn-sm" data-model-action="download" data-model-id="${m.id}" style="width: 100%;">
              <i data-icon="download" data-icon-size="13"></i> Download (${m.sizeMb} MB)
            </button>
          `;
        }

        html += `
          <div class="model-card" id="card-${m.id}" style="background: var(--bg-surface-elevated); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 18px; display: flex; flex-direction: column; justify-content: space-between; ${cardBorder}">
            <div>
              <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; flex-wrap: wrap; gap: 6px;">
                <span style="font-size: 10.5px; font-weight: 700; color: var(--accent-primary); letter-spacing: 0.5px;">${m.flag ? `<span style="font-size: 13px; margin-right: 4px;">${m.flag}</span>` : ''}TIER ${m.tier}</span>
                ${statusBadge}
              </div>

              <h4 style="font-size: 15px; font-weight: 700; margin: 0 0 6px 0; color: var(--text-main);">${escapeHTML(m.name)}</h4>
              ${recommendationBadge ? `<div style="margin-bottom: 8px;">${recommendationBadge}</div>` : ''}
              
              <p style="font-size: 12px; color: var(--text-muted); line-height: 1.4; margin: 0 0 12px 0;">${escapeHTML(m.description)}</p>

              <!-- Specs Row -->
              <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 14px;">
                <span class="badge" style="background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.08); font-size: 11px; padding: 3px 7px;">
                  💾 ${m.sizeMb} MB
                </span>
                <span class="badge" style="background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.08); font-size: 11px; padding: 3px 7px;">
                  ⚡ ~${m.latencyMs}ms
                </span>
                <span class="badge" style="background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.08); font-size: 11px; padding: 3px 7px;">
                  🧠 ${m.ramMb} MB RAM
                </span>
              </div>

              <!-- Features Checklist -->
              <div style="margin-bottom: 16px;">
                ${featuresHtml}
              </div>
            </div>

            <div class="model-card-actions" id="actions-${m.id}" style="margin-top: 8px;">
              ${actionsHtml}
            </div>
          </div>
        `;
      }

      setInnerHTML(gridEl, html);
      if (typeof window !== 'undefined' && typeof window.renderIcons === 'function') {
        window.renderIcons(gridEl);
      }
    } catch (err) {
      console.error('[SettingsView] Error rendering models pane:', err);
    }
  }

  #updateDownloadProgressUI(progress) {
    if (!progress || !progress.modelId) return;
    const bar = document.getElementById(`progress-bar-${progress.modelId}`);
    const text = document.getElementById(`progress-text-${progress.modelId}`);
    if (bar) {
      bar.style.width = `${progress.percentage}%`;
    }
    if (text) {
      const speedMb = (progress.speedBps / (1024 * 1024)).toFixed(1);
      text.textContent = `Downloading ${progress.percentage}% (${speedMb} MB/s)...`;
    }
  }

  async #handleDownloadModel(modelId, btn) {
    if (!this.#api?.downloadModel) return;
    try {
      if (btn) {
        btn.disabled = true;
        btn.textContent = 'Initiating download...';
      }
      showToast(`Starting download for ${modelId}...`);

      const res = await this.#api.downloadModel(modelId);
      if (res?.success) {
        showToast(`Model ${modelId} downloaded & verified successfully!`);
        this.#promptActivateDownloadedModel(modelId);
        await this.renderModelsPane();
      } else {
        showToast(res?.error || 'Download failed.', 'error');
        await this.renderModelsPane();
      }
    } catch (err) {
      showToast(err.message || 'Download error.', 'error');
      await this.renderModelsPane();
    }
  }

  #promptActivateDownloadedModel(modelId) {
    const meta =
      {
        'tier2-visionpro': 'Vision-Pro (Tier 2)',
        'tier2-vision-precision': 'Vision Precision & Inpainting (Tier 2)',
        'tier2-vision-degraded': 'Degraded & Thermal Paper (Tier 2)',
        'tier2-vision-handwritten': 'Handwritten Chits & Vouchers (Tier 2)',
        'tier2-vision-multilingual': 'Travel & Multi-Script Vision (Tier 2)',
        'tier3-regional-in': 'India GST & UPI Specialist (Tier 3)',
        'tier3-regional-us': 'North America Tax & Tips Specialist (Tier 3)',
        'tier3-regional-eu': 'Europe & UK VAT Specialist (Tier 3)',
        'tier3-regional-apac': 'Australia & Japan Specialist (Tier 3)'
      }[modelId] || modelId;

    showToast(`${meta} is ready! Click 'Set as Active' in AI Models to use it.`);
  }

  async #handleDeleteModel(modelId, btn) {
    if (!this.#api?.deleteModel) return;
    if (
      typeof confirm === 'function' &&
      !confirm('Are you sure you want to delete this model? You can re-download it anytime.')
    ) {
      return;
    }

    try {
      if (btn) btn.disabled = true;
      const res = await this.#api.deleteModel(modelId);
      if (res?.success) {
        const mbFreed = Math.round((res.data?.freedBytes || res.freedBytes || 0) / (1024 * 1024));
        showToast(`Model deleted. Freed ${mbFreed} MB disk space.`);
      } else {
        showToast(res?.error || 'Failed to delete model.', 'error');
      }
    } catch (err) {
      showToast(err.message || 'Error deleting model.', 'error');
    } finally {
      await this.renderModelsPane();
    }
  }

  async #handleSetActiveModel(modelId, btn) {
    if (!this.#api?.setActiveModel) return;
    try {
      if (btn) btn.disabled = true;
      const res = await this.#api.setActiveModel(modelId);
      if (res?.success) {
        showToast(`Switched active processing engine to ${modelId}.`);
      } else {
        showToast(res?.error || 'Failed to activate model.', 'error');
      }
    } catch (err) {
      showToast(err.message || 'Error activating model.', 'error');
    } finally {
      await this.renderModelsPane();
    }
  }

  async #handleVerifyModel(modelId, btn) {
    if (!this.#api?.verifyModelIntegrity) return;
    try {
      if (btn) btn.disabled = true;
      const res = await this.#api.verifyModelIntegrity(modelId);
      const data = res?.data || res;
      if (data?.valid) {
        showToast('Model checksum verified. 100% integrity valid!');
      } else {
        showToast(`Integrity check failed: ${data?.error || 'Checksum mismatch'}`, 'error');
      }
    } catch (err) {
      showToast(err.message || 'Verification error.', 'error');
    } finally {
      if (btn) btn.disabled = false;
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
