'use strict';

/**
 * @fileoverview File Importer View & Drag-and-Drop Controller
 *
 * Architecture Position: src/ui/views/ImportView.js
 * Role: Manages file import parsing (CSV, XLSX, OFX, JSON), preview table
 *       rendering, duplicate record flagging, selection filtering, batch insertion,
 *       and window drag-and-drop dropzone overlays.
 * Dependencies: AppState, window.electronAPI, dom helpers, formatters, toast
 * Extracted from: src/app.js L3926-4060, L1686-1718
 *
 * FUTURE: Custom column mapping presets, auto-categorization learning from imports
 */

import { escapeHTML, setInnerHTML } from '../helpers/dom.js';
import { formatCurrency } from '../helpers/formatters.js';
import { showToast } from '../helpers/toast.js';


// ============================================================================
//  ImportView Class
// ============================================================================

export class ImportView {

  /** @type {import('../AppState.js').AppState} */
  #state;

  /** @type {any} */
  #api;

  /** @type {function(): Promise<void>} */
  #refreshAppData;

  /** @type {Array<any>} */
  #pendingExpenses = [];

  /** @type {Array<function(): void>} */
  #cleanupListeners = [];


  // ==========================================================================
  //  Constructor
  // ==========================================================================

  /**
   * @param {import('../AppState.js').AppState} state - Application state store
   * @param {any} [api] - IPC bridge (defaults to window.electronAPI)
   * @param {function(): Promise<void>} [refreshAppData] - Global data loader callback
   */
  constructor(state, api = window.electronAPI, refreshAppData = async () => {}) {
    this.#state = state;
    this.#api = api;
    this.#refreshAppData = refreshAppData;
  }


  // ==========================================================================
  //  Lifecycle Interface (ViewContract)
  // ==========================================================================

  /**
   * Mounts the import view controls and registers drag & drop listeners.
   *
   * @param {HTMLElement|null} [container]
   * @returns {void}
   */
  mount(container) {
    this.#bindModalControls();
    this.setupDragAndDrop();
  }


  /**
   * Re-renders the import preview table if modal is active.
   *
   * @returns {void}
   */
  render() {
    this.renderPreviewTable();
  }


  /**
   * Unmounts the import view and removes all event listeners.
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
  //  File Selection & Import Handlers
  // ==========================================================================

  /**
   * Opens the native file dialog to choose an import file.
   *
   * @returns {Promise<void>}
   */
  async openFileDialog() {
    if (!this.#api?.importFile) return;

    try {
      const res = await this.#api.importFile();
      this.handleImportResult(res);
    } catch (err) {
      console.error('[ImportView] File selection failed:', err);
    }
  }


  /**
   * Processes the backend parse result and displays the preview modal.
   *
   * @param {any} res - Import result from main process
   * @returns {void}
   */
  handleImportResult(res) {
    if (!res || res.canceled) return;

    if (!res.success || !Array.isArray(res.expenses) || res.expenses.length === 0) {
      const errMsg = (res.errors && res.errors.length)
        ? res.errors.join('\n')
        : 'No valid expense records could be parsed from the file.';
      if (typeof alert !== 'undefined') alert(`Import Error:\n${errMsg}`);
      return;
    }

    this.#pendingExpenses = res.expenses;
    this.#state.set('importPendingExpenses', res.expenses);

    if (typeof document === 'undefined') return;

    const formatBadge = document.getElementById('import-format-badge');
    const countText = document.getElementById('import-count-text');
    const warningsBox = document.getElementById('import-warnings-box');
    const selectAllCb = document.getElementById('import-select-all');
    const modal = document.getElementById('import-modal');

    if (formatBadge) formatBadge.textContent = (res.format || 'CSV').toUpperCase();
    if (countText) countText.textContent = String(res.expenses.length);

    if (warningsBox) {
      if (res.warnings && res.warnings.length) {
        warningsBox.classList.remove('hidden');
        const iconFn = (typeof window !== 'undefined' && typeof window.icon === 'function')
          ? window.icon
          : () => '';
        warningsBox.innerHTML = `
          <strong style="display: flex; align-items: center; gap: 6px;">
            ${iconFn('alert-triangle', 14)} Parser Notes:
          </strong><br>${res.warnings.join('<br>')}
        `;
      } else {
        warningsBox.classList.add('hidden');
      }
    }

    this.renderPreviewTable();

    if (selectAllCb) {
      selectAllCb.checked = true;
      selectAllCb.onchange = (e) => {
        document.querySelectorAll('.import-row-checkbox').forEach(cb => {
          cb.checked = e.target.checked;
        });
        this.updateSelectedCount();
      };
    }

    if (modal) modal.classList.add('active');
  }


  /**
   * Renders the parsed records preview table in the import modal.
   *
   * @returns {void}
   */
  renderPreviewTable() {
    if (typeof document === 'undefined') return;

    const tbody = document.getElementById('import-preview-table-body');
    if (!tbody) return;

    const expenses = this.#pendingExpenses.length > 0
      ? this.#pendingExpenses
      : (this.#state.get('importPendingExpenses') || []);

    if (expenses.length === 0) {
      tbody.innerHTML = '';
      return;
    }

    const salaryConfig = this.#state.get('salaryConfig');
    const iconFn = (typeof window !== 'undefined' && typeof window.icon === 'function')
      ? window.icon
      : () => '';

    let dupCount = 0;

    const html = expenses.slice(0, 100).map((exp, idx) => {
      const isDup = this.isPotentialDuplicate(exp);
      if (isDup) dupCount++;
      return `
        <tr style="${isDup ? 'background: rgba(245, 158, 11, 0.06);' : ''}">
          <td>
            <input type="checkbox" class="import-row-checkbox" data-idx="${idx}" ${isDup ? '' : 'checked'}>
          </td>
          <td style="font-family: var(--font-mono); font-size: 11.5px; color: var(--text-muted);">${escapeHTML(exp.date || 'Today')}</td>
          <td><strong>${escapeHTML(exp.title || 'Expense')}</strong></td>
          <td><span class="category-pill">${escapeHTML(exp.category || 'Imported')}</span></td>
          <td class="amount-text">-${formatCurrency(parseFloat(exp.amount) || 0, 2, salaryConfig)}</td>
          <td style="font-size: 11px; color: var(--text-dim);">${escapeHTML(exp.paymentMethod || 'UPI / GPay')}</td>
          <td>
            ${isDup
              ? `<span class="import-duplicate-badge" title="Matching amount found within ±2 days in database" style="display: inline-flex; align-items: center; gap: 4px;">${iconFn('alert-triangle', 11)} Duplicate</span>`
              : `<span style="color: #10B981; font-size: 11px; font-weight: 700; display: inline-flex; align-items: center; gap: 4px;">${iconFn('check', 11)} Ready</span>`}
          </td>
        </tr>
      `;
    }).join('');

    setInnerHTML(tbody, html);
    this.updateSelectedCount();

    // Manage smart reconciliation bar
    const reconBar = document.getElementById('import-reconciliation-bar');
    const dupCountText = document.getElementById('import-duplicates-count-text');
    const skipDupsBtn = document.getElementById('btn-skip-duplicates');
    const selectAllImportsBtn = document.getElementById('btn-select-all-imports');

    if (reconBar) {
      if (dupCount > 0) {
        reconBar.classList.remove('hidden');
        if (dupCountText) {
          dupCountText.innerHTML = `${iconFn('alert-triangle', 14)} Found <strong>${dupCount}</strong> potential duplicate transaction${dupCount > 1 ? 's' : ''} within ±2 days.`;
        }
      } else {
        reconBar.classList.add('hidden');
      }
    }

    if (skipDupsBtn && !skipDupsBtn.dataset.wired) {
      skipDupsBtn.dataset.wired = 'true';
      skipDupsBtn.addEventListener('click', () => {
        tbody.querySelectorAll('.import-row-checkbox').forEach(cb => {
          const idx = parseInt(cb.getAttribute('data-idx') || '-1', 10);
          if (idx >= 0 && idx < expenses.length && this.isPotentialDuplicate(expenses[idx])) {
            cb.checked = false;
          }
        });
        this.updateSelectedCount();
      });
    }

    if (selectAllImportsBtn && !selectAllImportsBtn.dataset.wired) {
      selectAllImportsBtn.dataset.wired = 'true';
      selectAllImportsBtn.addEventListener('click', () => {
        tbody.querySelectorAll('.import-row-checkbox').forEach(cb => {
          cb.checked = true;
        });
        this.updateSelectedCount();
      });
    }

    tbody.querySelectorAll('.import-row-checkbox').forEach(cb => {
      cb.addEventListener('change', () => this.updateSelectedCount());
    });
  }


  /**
   * Updates the counter on the import confirmation button.
   *
   * @returns {void}
   */
  updateSelectedCount() {
    if (typeof document === 'undefined') return;
    const checked = document.querySelectorAll('.import-row-checkbox:checked').length;
    const countEl = document.getElementById('import-btn-count');
    if (countEl) countEl.textContent = String(checked);
  }


  /**
   * Commits the checked preview records into persistent database storage.
   *
   * @returns {Promise<void>}
   */
  async confirmImport() {
    if (this.#pendingExpenses.length === 0) return;

    if (typeof document === 'undefined') return;

    const checkedRows = Array.from(document.querySelectorAll('.import-row-checkbox:checked'));
    const selectedExpenses = checkedRows.map(cb => {
      const idx = parseInt(cb.getAttribute('data-idx') || '0', 10);
      return this.#pendingExpenses[idx];
    }).filter(Boolean);

    if (selectedExpenses.length === 0) {
      if (typeof alert !== 'undefined') alert('Please select at least one record to import.');
      return;
    }

    const res = await this.#api.confirmImport(selectedExpenses);
    this.closeModal();

    if (res?.success) {
      showToast(`Successfully imported ${res.imported} expense records!`);
      await this.#refreshAppData();
    } else {
      const errorMsg = res?.errors?.join(', ') || 'Failed to insert expenses';
      if (typeof alert !== 'undefined') alert(`Import error: ${errorMsg}`);
    }
  }


  /**
   * Closes the import modal and clears temporary records.
   *
   * @returns {void}
   */
  closeModal() {
    if (typeof document !== 'undefined') {
      document.getElementById('import-modal')?.classList.remove('active');
    }
    this.#pendingExpenses = [];
    this.#state.set('importPendingExpenses', []);
  }


  /**
   * Checks if an incoming parsed expense resembles an already existing record.
   *
   * @param {any} exp - Parsed expense candidate
   * @returns {boolean} True if matching title, date, and amount exists
   */
  isPotentialDuplicate(exp) {
    if (!exp || !exp.date || !exp.amount) return false;
    const existingExpenses = this.#state.get('expenses') || [];

    return existingExpenses.some(existing =>
      existing.date === exp.date &&
      Math.abs(parseFloat(existing.amount) - parseFloat(exp.amount)) < 0.01 &&
      (existing.title || '').trim().toLowerCase() === (exp.title || '').trim().toLowerCase()
    );
  }


  // ==========================================================================
  //  Drag & Drop Setup
  // ==========================================================================

  /**
   * Configures window-level drag and drop overlay and file ingestion.
   *
   * @returns {void}
   */
  setupDragAndDrop() {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    const overlay = document.getElementById('dropzone-overlay');
    let dragCounter = 0;

    const onDragEnter = (e) => {
      e.preventDefault();
      dragCounter++;
      if (e.dataTransfer?.types && Array.from(e.dataTransfer.types).includes('Files')) {
        overlay?.classList.remove('hidden');
      }
    };

    const onDragOver = (e) => {
      e.preventDefault();
    };

    const onDragLeave = (e) => {
      e.preventDefault();
      dragCounter--;
      if (dragCounter <= 0) {
        dragCounter = 0;
        overlay?.classList.add('hidden');
      }
    };

    const onDrop = async (e) => {
      e.preventDefault();
      dragCounter = 0;
      overlay?.classList.add('hidden');

      if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
        const file = e.dataTransfer.files[0];
        const filePath = file.path;
        if (filePath && this.#api?.importFilePath) {
          showToast(`Parsing dropped file: ${file.name}...`);
          const res = await this.#api.importFilePath(filePath);
          this.handleImportResult(res);
        }
      }
    };

    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('drop', onDrop);

    this.#cleanupListeners.push(() => {
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('drop', onDrop);
    });
  }


  // ==========================================================================
  //  Private Modal Controls
  // ==========================================================================

  #bindModalControls() {
    if (typeof document === 'undefined') return;

    const importBtn = document.getElementById('btn-import-file');
    const closeBtn = document.getElementById('import-modal-close');
    const cancelBtn = document.getElementById('import-cancel-btn');
    const confirmBtn = document.getElementById('btn-confirm-import');

    const handleImportClick = async () => {
      await this.openFileDialog();
    };

    const handleCloseClick = () => {
      this.closeModal();
    };

    const handleConfirmClick = async () => {
      await this.confirmImport();
    };

    importBtn?.addEventListener('click', handleImportClick);
    closeBtn?.addEventListener('click', handleCloseClick);
    cancelBtn?.addEventListener('click', handleCloseClick);
    confirmBtn?.addEventListener('click', handleConfirmClick);

    this.#cleanupListeners.push(() => {
      importBtn?.removeEventListener('click', handleImportClick);
      closeBtn?.removeEventListener('click', handleCloseClick);
      cancelBtn?.removeEventListener('click', handleCloseClick);
      confirmBtn?.removeEventListener('click', handleConfirmClick);
    });
  }
}
