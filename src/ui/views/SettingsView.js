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
import { generateQRCodeSVG } from '../../utils/qrCodeGenerator.js';

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

  /** @type {any} */
  #pairingInterval = null;

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
    this.renderMirrorVaultPane();
    this.renderModelsPane();
    this.renderNotificationSettingsPane();
    this.renderMobileSyncPane();

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
    if (this.#pairingInterval) {
      clearInterval(this.#pairingInterval);
      this.#pairingInterval = null;
    }
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
  //  Continuous Mirroring & Backup Vault (Phase 0.7.3)
  // ==========================================================================

  /**
   * Renders the continuous mirror vault settings card, binds folder selection,
   * toggle state, manual sync, integrity verification, and safe 1-click restore.
   *
   * @returns {Promise<void>}
   */
  async renderMirrorVaultPane() {
    if (typeof document === 'undefined') return;

    const card = document.getElementById('settings-mirror-vault-card');
    if (!card) return;

    const badge = document.getElementById('mirror-status-badge');
    const dirInput = document.getElementById('mirror-target-dir-input');
    const toggle = document.getElementById('mirror-enabled-toggle');
    const details = document.getElementById('mirror-status-details');
    const selectBtn = document.getElementById('btn-mirror-select-folder');
    const syncBtn = document.getElementById('btn-mirror-sync-now');
    const verifyBtn = document.getElementById('btn-mirror-verify');
    const restoreBtn = document.getElementById('btn-mirror-restore');

    let status = null;
    try {
      if (this.#api?.getMirrorStatus) {
        status = await this.#api.getMirrorStatus();
      }
    } catch (err) {
      console.warn('[SettingsView] Failed to fetch mirror status:', err);
    }

    if (!status) {
      status = { enabled: false, targetDir: null, lastStatus: 'idle' };
    }

    // Update UI state
    if (dirInput) {
      dirInput.value = status.targetDir || '';
    }
    if (toggle) {
      toggle.checked = !!status.enabled;
    }

    // Badge styling & status text
    if (badge) {
      if (!status.targetDir) {
        badge.textContent = 'Not Configured';
        badge.style.background = 'rgba(148, 163, 184, 0.15)';
        badge.style.color = 'var(--text-muted)';
      } else if (status.lastStatus === 'success') {
        badge.textContent = 'Healthy & Synced';
        badge.style.background = 'rgba(16, 185, 129, 0.15)';
        badge.style.color = '#10b981';
      } else if (status.lastStatus === 'disconnected') {
        badge.textContent = 'Drive Disconnected';
        badge.style.background = 'rgba(251, 113, 133, 0.15)';
        badge.style.color = '#fb7185';
      } else if (status.lastStatus === 'error') {
        badge.textContent = 'Mirror Error';
        badge.style.background = 'rgba(251, 113, 133, 0.15)';
        badge.style.color = '#fb7185';
      } else if (status.lastStatus === 'syncing') {
        badge.textContent = 'Mirroring...';
        badge.style.background = 'rgba(245, 158, 11, 0.15)';
        badge.style.color = '#f59e0b';
      } else {
        badge.textContent = status.enabled ? 'Active / Idle' : 'Paused';
        badge.style.background = 'rgba(148, 163, 184, 0.15)';
        badge.style.color = 'var(--text-muted)';
      }
    }

    // Details text
    if (details) {
      if (status.targetDir) {
        details.style.display = 'block';
        const syncTimeText = status.lastSyncTime
          ? new Date(status.lastSyncTime).toLocaleString()
          : 'Never';
        const errText = status.lastError
          ? `<div style="color: #fb7185; margin-top: 4px;">Error: ${escapeHTML(status.lastError)}</div>`
          : '';
        setInnerHTML(
          details,
          `<div><strong>Target Vault:</strong> ${escapeHTML(status.targetDir)}</div>` +
            `<div><strong>Last Mirrored:</strong> ${syncTimeText} &bull; <strong>Auto-Mirror:</strong> ${status.enabled ? 'Enabled (2000ms debounce)' : 'Disabled'}</div>` +
            errText
        );
      } else {
        details.style.display = 'none';
      }
    }

    // Bind Select Folder Button
    if (selectBtn && !selectBtn.dataset.modularWired) {
      selectBtn.dataset.modularWired = 'true';
      selectBtn.addEventListener('click', async () => {
        try {
          const res = await this.#api?.selectMirrorFolder?.();
          if (res?.success && res.folderPath) {
            await this.#api.configureMirror({ targetDir: res.folderPath, enabled: true });
            showToast(`Backup vault set to: ${res.folderPath}`);
            const syncRes = await this.#api.syncMirrorNow();
            if (syncRes?.success) {
              showToast('Initial mirror backup completed successfully!');
            }
            await this.renderMirrorVaultPane();
          }
        } catch (err) {
          showToast(`Failed to select vault folder: ${err.message}`);
        }
      });
    }

    // Bind Toggle Checkbox
    if (toggle && !toggle.dataset.modularWired) {
      toggle.dataset.modularWired = 'true';
      toggle.addEventListener('change', async () => {
        try {
          const isEnabled = toggle.checked;
          if (isEnabled && !dirInput?.value) {
            showToast('Please choose a vault folder first.');
            toggle.checked = false;
            return;
          }
          await this.#api.configureMirror({ enabled: isEnabled });
          showToast(isEnabled ? 'Continuous mirroring enabled.' : 'Continuous mirroring disabled.');
          await this.renderMirrorVaultPane();
        } catch (err) {
          showToast(`Failed to update mirror config: ${err.message}`);
        }
      });
    }

    // Bind Backup Now Button
    if (syncBtn && !syncBtn.dataset.modularWired) {
      syncBtn.dataset.modularWired = 'true';
      syncBtn.addEventListener('click', async () => {
        if (!dirInput?.value) {
          showToast('Please choose a backup vault folder first.');
          return;
        }
        syncBtn.setAttribute('disabled', 'true');
        showToast('Mirroring database to vault...');
        try {
          const res = await this.#api?.syncMirrorNow?.();
          if (res?.success) {
            showToast(
              `Vault backup synced (${res.manifest?.sourceDatabase?.totalExpenses || 0} transactions)`
            );
          } else {
            showToast(`Mirror sync failed: ${res?.error || 'Unknown error'}`);
          }
        } catch (err) {
          showToast(`Mirror sync failed: ${err.message}`);
        } finally {
          syncBtn.removeAttribute('disabled');
          await this.renderMirrorVaultPane();
        }
      });
    }

    // Bind Verify Vault Button
    if (verifyBtn && !verifyBtn.dataset.modularWired) {
      verifyBtn.dataset.modularWired = 'true';
      verifyBtn.addEventListener('click', async () => {
        const vaultDir = dirInput?.value;
        if (!vaultDir) {
          showToast('Please choose a backup vault folder first.');
          return;
        }
        verifyBtn.setAttribute('disabled', 'true');
        showToast('Verifying vault cryptographic checksums...');
        try {
          const res = await this.#api?.verifyMirrorVault?.(vaultDir);
          if (res?.valid) {
            showToast(
              `Vault verified: 0 errors detected. ${res.manifest?.sourceDatabase?.totalExpenses || 0} transactions intact.`
            );
          } else {
            const errStr = (res?.errors || []).join('; ') || res?.error || 'Verification failed';
            alert(`⚠️ Vault Integrity Check Failed:\n\n${errStr}`);
            showToast('Vault integrity check failed.');
          }
        } catch (err) {
          showToast(`Verification error: ${err.message}`);
        } finally {
          verifyBtn.removeAttribute('disabled');
          await this.renderMirrorVaultPane();
        }
      });
    }

    // Bind Restore Button
    if (restoreBtn && !restoreBtn.dataset.modularWired) {
      restoreBtn.dataset.modularWired = 'true';
      restoreBtn.addEventListener('click', async () => {
        const vaultDir = dirInput?.value;
        if (!vaultDir) {
          showToast('Please choose a backup vault folder first.');
          return;
        }

        if (
          !confirm(
            '⚠️ Restore database from this backup vault?\n\n' +
              'Your current database will be automatically backed up to .pre-restore.bak safety snapshot before restoration.\n\n' +
              'Do you want to proceed?'
          )
        ) {
          return;
        }

        restoreBtn.setAttribute('disabled', 'true');
        showToast('Restoring database from vault...');
        try {
          const res = await this.#api?.restoreMirrorVault?.(vaultDir);
          if (res?.success) {
            showToast(`Restore complete! Restored ${res.restoredExpenses} transactions safely.`);
            await this.#refreshAppData();
            await this.render();
          } else {
            alert(`⚠️ Restore Failed:\n\n${res?.error || 'Unknown error'}`);
            showToast(`Restore failed: ${res?.error || 'Unknown error'}`);
          }
        } catch (err) {
          showToast(`Restore error: ${err.message}`);
        } finally {
          restoreBtn.removeAttribute('disabled');
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
  //  Mobile Companion & LAN Wi-Fi Sync (Phase 0.6.3 / BUG-007)
  // ==========================================================================

  /**
   * Renders the Mobile Companion & Wi-Fi LAN Sync configuration card,
   * server status badge, pairing PIN generator with countdown, and paired devices list.
   *
   * @returns {Promise<void>}
   */
  async renderMobileSyncPane() {
    if (typeof document === 'undefined') return;
    const container = document.getElementById('settings-sync-pane-container');
    if (!container) return;

    if (!this.#api?.getSyncServerStatus) {
      setInnerHTML(
        container,
        `<div class="empty-state" style="padding: 24px; text-align: center; color: var(--text-muted);">
          Sync server IPC interface unavailable in this environment.
        </div>`
      );
      return;
    }

    try {
      const statusRes = await this.#api.getSyncServerStatus();
      const status = statusRes?.data || statusRes || {};
      const isRunning = status.running ?? false;
      const port = status.port || 52410;
      const lanIps =
        Array.isArray(status.lanIps) && status.lanIps.length > 0 ? status.lanIps : [status.host || '127.0.0.1'];
      const machineName = status.machineName || 'Ledgerly Desktop';

      const devicesRes = await this.#api.getPairedDevices();
      const devices = Array.isArray(devicesRes)
        ? devicesRes
        : Array.isArray(devicesRes?.data)
          ? devicesRes.data
          : [];

      // Load Pairing Security Configuration
      let secConfig = { maxFailedAttempts: 15, lockoutDurationSeconds: 60, enableUdpBeacon: true };
      if (this.#api?.getPairingSecurityConfig) {
        try {
          const secRes = await this.#api.getPairingSecurityConfig();
          const loaded = secRes?.data || secRes || {};
          secConfig = {
            maxFailedAttempts: loaded.maxPairingAttempts || loaded.maxFailedAttempts || 15,
            lockoutDurationSeconds: loaded.pairingLockoutSeconds || loaded.lockoutDurationSeconds || 60,
            enableUdpBeacon: loaded.enableUdpBeacon !== false
          };
        } catch (err) {
          console.warn('[SettingsView] Error loading pairing security config:', err);
        }
      }

      // Build Paired Devices list HTML
      let devicesHtml = '';
      if (devices.length === 0) {
        devicesHtml = `
          <div style="padding: 24px; text-align: center; background: rgba(255,255,255,0.02); border: 1px dashed var(--border-color); border-radius: var(--radius-sm); margin-top: 14px;">
            <i data-icon="smartphone" data-icon-size="28" style="color: var(--text-muted); opacity: 0.5; margin-bottom: 8px; display: inline-block;"></i>
            <p style="font-size: 13px; color: var(--text-muted); margin: 0;">No mobile devices paired yet. Click <strong>Generate QR & PIN</strong> to pair your smartphone or tablet.</p>
          </div>
        `;
      } else {
        devicesHtml = `
          <div class="table-responsive" style="margin-top: 14px; border: 1px solid var(--border-color); border-radius: var(--radius-sm); overflow: hidden;">
            <table class="table" style="margin: 0; width: 100%; border-collapse: collapse; font-size: 13px;">
              <thead>
                <tr style="background: rgba(255,255,255,0.03); border-bottom: 1px solid var(--border-color); text-align: left;">
                  <th style="padding: 10px 14px; font-weight: 600; color: var(--text-muted); font-size: 11.5px; text-transform: uppercase; letter-spacing: 0.5px;">Device</th>
                  <th style="padding: 10px 14px; font-weight: 600; color: var(--text-muted); font-size: 11.5px; text-transform: uppercase; letter-spacing: 0.5px;">Device ID</th>
                  <th style="padding: 10px 14px; font-weight: 600; color: var(--text-muted); font-size: 11.5px; text-transform: uppercase; letter-spacing: 0.5px;">Paired At</th>
                  <th style="padding: 10px 14px; font-weight: 600; color: var(--text-muted); font-size: 11.5px; text-transform: uppercase; letter-spacing: 0.5px;">Last Synced</th>
                  <th style="padding: 10px 14px; font-weight: 600; color: var(--text-muted); font-size: 11.5px; text-transform: uppercase; letter-spacing: 0.5px; text-align: right;">Action</th>
                </tr>
              </thead>
              <tbody>
                ${devices
                  .map(dev => {
                    const pairedDate = dev.pairedAt
                      ? new Date(dev.pairedAt).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric'
                        })
                      : 'Unknown';
                    const lastSyncDate = dev.lastSyncAt
                      ? new Date(dev.lastSyncAt).toLocaleTimeString(undefined, {
                          hour: '2-digit',
                          minute: '2-digit',
                          month: 'short',
                          day: 'numeric'
                        })
                      : 'Never';
                    return `
                    <tr style="border-bottom: 1px solid rgba(255,255,255,0.03);">
                      <td style="padding: 12px 14px; font-weight: 600; color: var(--text-main); display: flex; align-items: center; gap: 8px;">
                        <i data-icon="smartphone" data-icon-size="16" style="color: var(--accent-spiced-chai);"></i>
                        ${escapeHTML(dev.deviceName || 'Mobile Companion')}
                      </td>
                      <td style="padding: 12px 14px; font-family: 'JetBrains Mono', monospace; font-size: 12px; color: var(--text-muted);">
                        ${escapeHTML((dev.deviceId || '').substring(0, 14))}...
                      </td>
                      <td style="padding: 12px 14px; color: var(--text-muted);">${escapeHTML(pairedDate)}</td>
                      <td style="padding: 12px 14px; color: var(--text-muted);">${escapeHTML(lastSyncDate)}</td>
                      <td style="padding: 12px 14px; text-align: right;">
                        <button class="btn btn-sm btn-ghost btn-revoke-device" data-device-id="${escapeHTML(dev.deviceId)}" data-device-name="${escapeHTML(dev.deviceName || 'Mobile Device')}" style="color: #fb7185; padding: 4px 8px; font-size: 12px;" title="Revoke Device Access">
                          <i data-icon="trash-2" data-icon-size="14"></i> Revoke
                        </button>
                      </td>
                    </tr>
                  `;
                  })
                  .join('')}
              </tbody>
            </table>
          </div>
        `;
      }

      const html = `
        <div style="background: var(--bg-surface-elevated); padding: 20px 24px; border-radius: var(--radius-md); border: 1px solid var(--border-color); margin-bottom: 20px;">
          <!-- Header -->
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px;">
            <div>
              <h3 style="font-size: 15px; font-weight: 700; display: flex; align-items: center; gap: 8px; margin: 0 0 4px 0;">
                <i data-icon="smartphone" data-icon-size="16" style="color: var(--accent-spiced-chai)"></i>
                Mobile Companion & Local Wi-Fi Sync
              </h3>
              <p style="font-size: 12.5px; color: var(--text-muted); margin: 0">
                Synchronize receipts captured with the Ledgerly Mobile Companion and offline quick-add transactions over your local Wi-Fi network without cloud dependencies.
              </p>
            </div>
            <div>
              <span class="badge ${isRunning ? 'badge-success' : 'badge-neutral'}" style="display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; font-size: 12px; font-weight: 600; border-radius: 20px; background: ${isRunning ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.06)'}; color: ${isRunning ? '#4ade80' : 'var(--text-muted)'}; border: 1px solid ${isRunning ? 'rgba(34,197,94,0.3)' : 'var(--border-color)'};">
                <span style="width: 8px; height: 8px; border-radius: 50%; background: ${isRunning ? '#22c55e' : '#94a3b8'}; box-shadow: ${isRunning ? '0 0 8px #22c55e' : 'none'};"></span>
                ${isRunning ? `Server Active (Port ${port})` : 'Server Offline'}
              </span>
            </div>
          </div>

          <!-- Server Network Details -->
          <div class="diagnostics-grid" style="margin-bottom: 18px; padding: 14px 16px; background: rgba(0,0,0,0.15); border-radius: var(--radius-sm); border: 1px solid rgba(255,255,255,0.04);">
            <div class="diagnostics-item">
              <span class="diagnostics-label">Desktop Machine</span>
              <span class="diagnostics-value">${escapeHTML(machineName)}</span>
            </div>
            <div class="diagnostics-item">
              <span class="diagnostics-label">LAN IP Address(es)</span>
              <span class="diagnostics-value" style="color: var(--accent-spiced-chai);">${escapeHTML(lanIps.join(', '))}</span>
            </div>
            <div class="diagnostics-item">
              <span class="diagnostics-label">Active Port</span>
              <span class="diagnostics-value">${escapeHTML(String(port))}</span>
            </div>
            <div class="diagnostics-item">
              <span class="diagnostics-label">Paired Companions</span>
              <span class="diagnostics-value">${devices.length}</span>
            </div>
          </div>

          <!-- Pairing Action Section -->
          <div style="padding: 16px; background: rgba(217, 130, 43, 0.04); border: 1px solid rgba(217, 130, 43, 0.2); border-radius: var(--radius-sm); margin-bottom: 20px;">
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
              <div>
                <strong style="font-size: 13.5px; color: var(--text-main); display: block; margin-bottom: 3px;">Pair New Mobile Device</strong>
                <span style="font-size: 12px; color: var(--text-muted);">Generate a secure optical QR code & 6-digit one-time PIN to connect Ledgerly Mobile Companion.</span>
              </div>
              <div style="display: flex; gap: 8px;">
                <button type="button" class="btn btn-primary" id="btn-generate-pairing-pin" style="display: inline-flex; align-items: center; gap: 8px; font-weight: 600;">
                  <i data-icon="qr-code" data-icon-size="15"></i> Generate QR & PIN
                </button>
              </div>
            </div>

            <!-- PIN & QR Display Card (Hidden by default, shown when token generated) -->
            <div id="pairing-pin-display-card" style="display: none; position: relative; overflow: hidden; margin-top: 16px; padding: 20px; background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: var(--radius-sm);">
              
              <!-- Expiration Overlay (Hidden by default, shown when countdown hits 0) -->
              <div id="pairing-expired-overlay" style="display: none; position: absolute; inset: 0; background: rgba(19, 18, 17, 0.94); backdrop-filter: blur(4px); z-index: 10; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 20px;">
                <i data-icon="clock" data-icon-size="32" style="color: #fb7185; margin-bottom: 10px;"></i>
                <h4 style="font-size: 15px; font-weight: 700; color: #ffffff; margin: 0 0 6px 0;">Pairing Session Expired</h4>
                <p style="font-size: 12px; color: var(--text-muted); margin: 0 0 16px 0; max-width: 320px; line-height: 1.4;">
                  The security window for this QR code and PIN has lapsed. Click below to regenerate fresh pairing credentials.
                </p>
                <button type="button" class="btn btn-primary" id="btn-regenerate-pairing" style="display: inline-flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; padding: 8px 16px;">
                  <i data-icon="refresh-cw" data-icon-size="14"></i> Regenerate QR & PIN
                </button>
              </div>

              <!-- Main Card Content: QR Code + PIN Side-by-Side -->
              <div style="display: flex; flex-wrap: wrap; gap: 24px; align-items: center; justify-content: center;">
                <!-- QR Code Column -->
                <div style="text-align: center; flex: 0 0 auto;">
                  <div id="pairing-qr-container" style="background: #131211; border: 1px solid rgba(217, 130, 43, 0.35); border-radius: 10px; padding: 10px; display: inline-flex; align-items: center; justify-content: center; box-shadow: 0 4px 20px rgba(0,0,0,0.5); min-width: 180px; min-height: 180px;">
                    <!-- Dynamic SVG injected here -->
                  </div>
                  <div style="font-size: 11px; color: var(--text-muted); margin-top: 8px; font-weight: 500;">
                    Scan with Mobile Camera / Sync View
                  </div>
                </div>

                <!-- PIN & Connection Details Column -->
                <div style="flex: 1 1 260px; min-width: 240px;">
                  <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
                    <span id="pairing-timer-badge" class="badge" style="background: rgba(251, 191, 36, 0.15); color: #fbbf24; border: 1px solid rgba(251, 191, 36, 0.3); font-weight: 600; font-size: 11.5px; padding: 3px 8px;">
                      Expires in: 05:00
                    </span>
                    <span style="font-size: 11px; color: var(--text-muted);">One-time Wi-Fi Handshake</span>
                  </div>

                  <div style="font-size: 11.5px; text-transform: uppercase; letter-spacing: 0.8px; color: var(--text-muted); font-weight: 600; margin-bottom: 4px;">
                    Or enter 6-Digit PIN manually:
                  </div>

                  <div id="pairing-pin-code" style="font-family: 'JetBrains Mono', monospace; font-size: 34px; font-weight: 800; letter-spacing: 8px; color: var(--accent-spiced-chai); margin: 6px 0; text-shadow: 0 0 12px rgba(217,130,43,0.3);">
                    ------
                  </div>

                  <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 12px;">
                    Desktop Host: <strong id="pairing-host-info" style="color: var(--text-main); font-family: 'JetBrains Mono', monospace;">-</strong>
                  </div>

                  <p style="font-size: 12px; color: var(--text-muted); margin: 0 0 14px 0; line-height: 1.45;">
                    Open <strong>Ledgerly Mobile</strong> &rarr; tap <strong>Sync</strong> tab &rarr; tap <strong>Scan QR Code</strong> for instant optical handshake.
                  </p>

                  <button type="button" class="btn btn-sm btn-ghost" id="btn-copy-pairing-details" style="font-size: 12px; display: inline-flex; align-items: center; gap: 6px;">
                    <i data-icon="clipboard" data-icon-size="14"></i> Copy Connection Details
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- Pairing & LAN Security Section -->
          <div style="padding: 18px 20px; background: rgba(0, 0, 0, 0.16); border: 1px solid var(--border-color); border-radius: var(--radius-sm); margin-bottom: 22px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; flex-wrap: wrap; gap: 8px;">
              <h4 style="font-size: 13.5px; font-weight: 700; margin: 0; color: var(--text-main); display: flex; align-items: center; gap: 8px;">
                <i data-icon="shield" data-icon-size="15" style="color: var(--accent-spiced-chai)"></i>
                Pairing & LAN Security Configuration
              </h4>
              <span id="pairing-lockout-badge" class="badge" style="background: rgba(34, 197, 94, 0.15); color: #4ade80; border: 1px solid rgba(34, 197, 94, 0.3); font-size: 11px; padding: 3px 8px;">
                Status: Normal (No Lockouts)
              </span>
            </div>
            <p style="font-size: 12px; color: var(--text-muted); margin: 0 0 14px 0;">
              Protect pairing endpoints against Wi-Fi brute-force attacks with IP attempt thresholds, cooldown lockouts, and UDP discovery beacons.
            </p>

            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 14px; margin-bottom: 14px;">
              <div>
                <label for="input-pairing-max-attempts" style="display: block; font-size: 12px; font-weight: 600; color: var(--text-main); margin-bottom: 5px;">
                  Max Failed Attempts (3–50)
                </label>
                <input
                  type="number"
                  id="input-pairing-max-attempts"
                  min="3"
                  max="50"
                  value="${secConfig.maxFailedAttempts}"
                  class="form-control"
                  style="width: 100%; font-size: 13px; font-family: 'JetBrains Mono', monospace;"
                />
                <span style="font-size: 11px; color: var(--text-muted); display: block; margin-top: 3px;">Attempts before client IP is temporarily locked out</span>
              </div>

              <div>
                <label for="input-pairing-lockout-duration" style="display: block; font-size: 12px; font-weight: 600; color: var(--text-main); margin-bottom: 5px;">
                  Lockout Duration (15–300 seconds)
                </label>
                <input
                  type="number"
                  id="input-pairing-lockout-duration"
                  min="15"
                  max="300"
                  step="5"
                  value="${secConfig.lockoutDurationSeconds}"
                  class="form-control"
                  style="width: 100%; font-size: 13px; font-family: 'JetBrains Mono', monospace;"
                />
                <span style="font-size: 11px; color: var(--text-muted); display: block; margin-top: 3px;">Cooldown period enforcing HTTP 429 Retry-After</span>
              </div>
            </div>

            <div style="display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); border-radius: var(--radius-sm); margin-bottom: 14px; flex-wrap: wrap; gap: 8px;">
              <div>
                <label for="toggle-pairing-udp-beacon" style="font-size: 12.5px; font-weight: 600; color: var(--text-main); display: flex; align-items: center; gap: 8px; cursor: pointer; margin-bottom: 2px;">
                  <input type="checkbox" id="toggle-pairing-udp-beacon" ${secConfig.enableUdpBeacon ? 'checked' : ''} style="accent-color: var(--accent-spiced-chai); width: 15px; height: 15px;" />
                  Enable UDP LAN Discovery Beacon
                </label>
                <span style="font-size: 11px; color: var(--text-muted);">Broadcasts discovery announcements on UDP:52411 strictly during active pairing</span>
              </div>
            </div>

            <div style="display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; background: rgba(0,0,0,0.22); border: 1px solid var(--border-color); border-radius: var(--radius-sm); flex-wrap: wrap; gap: 8px;">
              <div style="font-size: 12px; color: var(--text-muted);" id="pairing-lockout-details">
                No client IP addresses currently rate-limited or locked out.
              </div>
              <div style="display: flex; gap: 8px;">
                <button type="button" class="btn btn-sm btn-secondary" id="btn-clear-pairing-lockout" style="font-size: 12px; display: inline-flex; align-items: center; gap: 5px;">
                  <i data-icon="unlock" data-icon-size="13"></i> Clear Lockout
                </button>
                <button type="button" class="btn btn-sm btn-primary" id="btn-save-pairing-security" style="font-size: 12px; font-weight: 600; display: inline-flex; align-items: center; gap: 5px;">
                  <i data-icon="save" data-icon-size="13"></i> Save Security Settings
                </button>
              </div>
            </div>
          </div>

          <!-- Paired Devices List -->
          <div>
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <h4 style="font-size: 13.5px; font-weight: 700; margin: 0; color: var(--text-main); display: flex; align-items: center; gap: 6px;">
                <i data-icon="shield-check" data-icon-size="15" style="color: var(--accent-primary);"></i>
                Authorized Paired Devices (${devices.length})
              </h4>
              <button type="button" class="btn btn-sm btn-ghost" id="btn-refresh-paired-devices" style="font-size: 12px; padding: 4px 8px;" title="Refresh paired devices">
                <i data-icon="refresh-cw" data-icon-size="13"></i> Refresh
              </button>
            </div>
            ${devicesHtml}
          </div>
        </div>
      `;

      setInnerHTML(container, html);

      // Wire Event Handlers
      this.#bindMobileSyncEvents(container, lanIps[0] || '127.0.0.1', port);
    } catch (err) {
      console.error('[SettingsView] Error rendering mobile sync pane:', err);
      setInnerHTML(
        container,
        `<div class="empty-state" style="padding: 24px; color: #fb7185;">
          Failed to load Mobile Sync configuration: ${escapeHTML(err.message)}
        </div>`
      );
    }
  }

  /**
   * Binds interaction events for the Mobile Companion & LAN sync section.
   *
   * @param {HTMLElement} container - The sync pane container
   * @param {string} defaultHost - Default LAN host
   * @param {number} defaultPort - Default server port
   * @returns {void}
   */
  #bindMobileSyncEvents(container, defaultHost, defaultPort) {
    if (!container) return;

    const generateBtn = container.querySelector('#btn-generate-pairing-pin');
    const pinDisplayCard = container.querySelector('#pairing-pin-display-card');
    const pinCodeEl = container.querySelector('#pairing-pin-code');
    const hostInfoEl = container.querySelector('#pairing-host-info');
    const timerBadgeEl = container.querySelector('#pairing-timer-badge');
    const copyBtn = container.querySelector('#btn-copy-pairing-details');
    const qrContainer = container.querySelector('#pairing-qr-container');
    const expiredOverlay = container.querySelector('#pairing-expired-overlay');
    const regenerateBtn = container.querySelector('#btn-regenerate-pairing');

    const maxAttemptsInput = container.querySelector('#input-pairing-max-attempts');
    const lockoutDurationInput = container.querySelector('#input-pairing-lockout-duration');
    const udpBeaconToggle = container.querySelector('#toggle-pairing-udp-beacon');
    const lockoutBadge = container.querySelector('#pairing-lockout-badge');
    const lockoutDetails = container.querySelector('#pairing-lockout-details');
    const clearLockoutBtn = container.querySelector('#btn-clear-pairing-lockout');
    const saveSecurityBtn = container.querySelector('#btn-save-pairing-security');

    let currentPin = '';
    let currentHostPort = '';

    if (generateBtn && !generateBtn.dataset.wired) {
      generateBtn.dataset.wired = 'true';
      generateBtn.addEventListener('click', async () => {
        try {
          generateBtn.disabled = true;
          generateBtn.innerHTML = '<i data-icon="refresh-cw" data-icon-size="14" class="spin"></i> Generating...';
          if (typeof window.hydrateIcons === 'function') window.hydrateIcons(generateBtn);

          const res = await this.#api.generatePairingToken();
          const tokenData = res?.data || res;

          if (!tokenData || !tokenData.pin) {
            showToast('Failed to generate pairing PIN from server.', 'error');
            return;
          }

          if ((!udpBeaconToggle || udpBeaconToggle.checked) && this.#api.startPairingBeacon) {
            await this.#api.startPairingBeacon().catch(() => {});
          }

          currentPin = tokenData.pin;
          const host = tokenData.host || defaultHost;
          const port = tokenData.port || defaultPort;
          currentHostPort = `${host}:${port}`;

          if (expiredOverlay) {
            expiredOverlay.style.display = 'none';
          }
          if (pinDisplayCard) {
            pinDisplayCard.style.display = 'block';
          }
          if (pinCodeEl) {
            pinCodeEl.textContent = currentPin;
          }
          if (hostInfoEl) {
            hostInfoEl.textContent = currentHostPort;
          }

          // Generate and inject crisp Theme 3 QR Code SVG
          if (qrContainer) {
            const qrPayload =
              tokenData.qrPayload ||
              JSON.stringify({
                host,
                port,
                pin: currentPin,
                token: tokenData.token,
                machineName: tokenData.machineName || 'Ledgerly Desktop'
              });

            const qrSvg = generateQRCodeSVG(qrPayload, {
              width: 176,
              height: 176,
              fgColor: '#d9822b',
              bgColor: '#131211',
              title: 'Ledgerly Mobile Pairing QR Code'
            });
            setInnerHTML(qrContainer, qrSvg);
          }

          // Countdown timer
          if (this.#pairingInterval) {
            clearInterval(this.#pairingInterval);
            this.#pairingInterval = null;
          }

          let remainingSec = tokenData.expiresInSeconds || 300;
          const updateTimerText = () => {
            const mins = Math.floor(remainingSec / 60);
            const secs = remainingSec % 60;
            const formatted = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
            if (timerBadgeEl) {
              if (remainingSec > 0) {
                timerBadgeEl.textContent = `Expires in: ${formatted}`;
                timerBadgeEl.style.color = '#fbbf24';
              } else {
                timerBadgeEl.textContent = 'Session Expired';
                timerBadgeEl.style.color = '#fb7185';
              }
            }
          };

          updateTimerText();

          this.#pairingInterval = setInterval(() => {
            remainingSec--;
            updateTimerText();
            if (remainingSec <= 0) {
              clearInterval(this.#pairingInterval);
              this.#pairingInterval = null;
              if (this.#api.stopPairingBeacon) {
                this.#api.stopPairingBeacon().catch(() => {});
              }
              if (copyBtn) copyBtn.disabled = true;
              if (expiredOverlay) {
                expiredOverlay.style.display = 'flex';
                if (typeof window.hydrateIcons === 'function') window.hydrateIcons(expiredOverlay);
              }
            }
          }, 1000);

          if (copyBtn) copyBtn.disabled = false;
          showToast(`Pairing QR & PIN generated: ${currentPin}`);
        } catch (err) {
          console.error('[SettingsView] Error generating pairing token:', err);
          showToast(err.message || 'Error generating pairing PIN', 'error');
        } finally {
          if (generateBtn) {
            generateBtn.disabled = false;
            generateBtn.innerHTML = '<i data-icon="qr-code" data-icon-size="15"></i> Generate QR & PIN';
            if (typeof window.hydrateIcons === 'function') window.hydrateIcons(generateBtn);
          }
        }
      });
    }

    if (regenerateBtn && !regenerateBtn.dataset.wired) {
      regenerateBtn.dataset.wired = 'true';
      regenerateBtn.addEventListener('click', () => {
        if (expiredOverlay) expiredOverlay.style.display = 'none';
        if (generateBtn) generateBtn.click();
      });
    }

    if (saveSecurityBtn && !saveSecurityBtn.dataset.wired) {
      saveSecurityBtn.dataset.wired = 'true';
      saveSecurityBtn.addEventListener('click', async () => {
        const maxAttempts = Math.max(3, Math.min(50, parseInt(maxAttemptsInput?.value, 10) || 15));
        const lockoutSec = Math.max(15, Math.min(300, parseInt(lockoutDurationInput?.value, 10) || 60));
        const enableBeacon = Boolean(udpBeaconToggle?.checked);

        try {
          saveSecurityBtn.disabled = true;
          if (this.#api?.updatePairingSecurityConfig) {
            await this.#api.updatePairingSecurityConfig({
              maxPairingAttempts: maxAttempts,
              maxFailedAttempts: maxAttempts,
              pairingLockoutSeconds: lockoutSec,
              lockoutDurationSeconds: lockoutSec,
              enableUdpBeacon: enableBeacon
            });
          }
          showToast('Pairing & LAN security settings saved!');
        } catch (err) {
          showToast(err.message || 'Failed to save security settings', 'error');
        } finally {
          saveSecurityBtn.disabled = false;
        }
      });
    }

    if (clearLockoutBtn && !clearLockoutBtn.dataset.wired) {
      clearLockoutBtn.dataset.wired = 'true';
      clearLockoutBtn.addEventListener('click', async () => {
        try {
          clearLockoutBtn.disabled = true;
          if (this.#api?.resetPairingLockout) {
            await this.#api.resetPairingLockout();
          }
          if (lockoutBadge) {
            lockoutBadge.textContent = 'Status: Normal (Cleared)';
            lockoutBadge.style.color = '#4ade80';
          }
          if (lockoutDetails) {
            lockoutDetails.textContent = 'Active IP lockouts cleared successfully.';
          }
          showToast('Pairing brute-force lockouts cleared!');
        } catch (err) {
          showToast(err.message || 'Failed to clear lockouts', 'error');
        } finally {
          clearLockoutBtn.disabled = false;
        }
      });
    }

    if (copyBtn && !copyBtn.dataset.wired) {
      copyBtn.dataset.wired = 'true';
      copyBtn.addEventListener('click', async () => {
        if (!currentPin) return;
        const textToCopy = `Desktop Host: ${currentHostPort}\nPIN: ${currentPin}`;
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(textToCopy);
          } else {
            const ta = document.createElement('textarea');
            ta.value = textToCopy;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
          }
          showToast('Pairing connection details copied to clipboard!');
        } catch {
          showToast('Failed to copy to clipboard', 'error');
        }
      });
    }

    const refreshBtn = container.querySelector('#btn-refresh-paired-devices');
    if (refreshBtn && !refreshBtn.dataset.wired) {
      refreshBtn.dataset.wired = 'true';
      refreshBtn.addEventListener('click', async () => {
        refreshBtn.disabled = true;
        await this.renderMobileSyncPane();
        showToast('Paired devices refreshed');
      });
    }

    const revokeBtns = container.querySelectorAll('.btn-revoke-device');
    revokeBtns.forEach(btn => {
      if (btn.dataset.wired) return;
      btn.dataset.wired = 'true';
      btn.addEventListener('click', async () => {
        const deviceId = btn.getAttribute('data-device-id');
        const deviceName = btn.getAttribute('data-device-name') || 'Mobile Device';

        if (
          typeof confirm === 'function' &&
          !confirm(`Are you sure you want to revoke access for "${deviceName}"? It will be disconnected immediately.`)
        ) {
          return;
        }

        try {
          btn.disabled = true;
          const res = await this.#api.revokePairedDevice(deviceId);
          if (res?.success !== false) {
            showToast(`Access revoked for ${deviceName}`);
          } else {
            showToast(res?.error || 'Failed to revoke device access', 'error');
          }
        } catch (err) {
          showToast(err.message || 'Error revoking device', 'error');
        } finally {
          await this.renderMobileSyncPane();
        }
      });
    });
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
