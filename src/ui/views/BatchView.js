'use strict';

/**
 * @fileoverview Inline Batch Spreadsheet Entry View
 *
 * Architecture Position: src/ui/views/BatchView.js
 * Role: Provides a keyboard-first, spreadsheet-like data entry grid for rapid
 *       multi-row transaction logging, clipboard Excel/Sheets pasting, date
 *       shorthand resolution, live running totals, and bulk ledger commits.
 * Dependencies: AppState, window.electronAPI, dom helpers, formatters, toast
 * Extracted from: src/app.js L2268-2520, L1446-1454, L1973-1985
 *
 * FUTURE: Custom column layouts, auto-fill drag handle, undo/redo row buffer
 */

import { escapeHTML, delegateEvent } from '../helpers/dom.js';
import { formatCurrency } from '../helpers/formatters.js';
import { showToast, showActionToast } from '../helpers/toast.js';


// ============================================================================
//  BatchView Class
// ============================================================================

export class BatchView {

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

  /** @type {function(): void} */
  #cleanupTableEvents = () => {};

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
   * Mounts the batch spreadsheet view, binds toolbar actions and table delegation.
   *
   * @param {HTMLElement|null} [container] - Target container element (#view-batch)
   * @returns {void}
   */
  mount(container) {
    this.#container = container || document.getElementById('view-batch');
    if (!this.#container) return;

    this.#bindToolbarControls();
    this.#bindTableDelegation();
    this.render();
  }


  /**
   * Renders the batch grid. Populates initial blank rows if table body is empty.
   *
   * @returns {void}
   */
  render() {
    if (typeof document === 'undefined') return;

    const tbody = document.getElementById('batch-table-body');
    if (!tbody) return;

    // Populate initial 4 empty rows if grid is currently blank
    if (tbody.children.length === 0) {
      tbody.innerHTML = '';
      for (let i = 0; i < 4; i++) {
        this.addBatchRow();
      }
    }

    this.updateBatchRunningTotal();
  }


  /**
   * Unmounts the batch view, cleaning up toolbar and table listeners.
   *
   * @returns {void}
   */
  unmount() {
    this.#cleanupTableEvents();
    for (const cleanup of this.#cleanupListeners) {
      cleanup();
    }
    this.#cleanupListeners = [];
  }


  // ==========================================================================
  //  Row Operations & Grid Management
  // ==========================================================================

  /**
   * Appends a new data entry row to the batch spreadsheet grid.
   *
   * @param {Object|null} [initialData=null] - Optional pre-filled row values
   * @returns {HTMLTableRowElement|null} The created table row element
   */
  addBatchRow(initialData = null) {
    if (typeof document === 'undefined') return null;

    const tbody = document.getElementById('batch-table-body');
    if (!tbody) return null;

    const today = new Date().toISOString().split('T')[0];
    const tr = document.createElement('tr');
    const categories = this.#state.get('categories') || ['Food & Dining', 'Shopping', 'Bills & Utilities'];
    const catOptions = categories.map(c => `<option value="${escapeHTML(c)}">${escapeHTML(c)}</option>`).join('');

    const d = initialData || {
      date: today,
      title: '',
      amount: '',
      category: categories[0] || 'Food & Dining',
      paymentMethod: 'UPI / GPay',
      description: ''
    };

    tr.innerHTML = `
      <td class="batch-row-num" style="font-family: var(--font-mono); font-size: 11px; color: var(--text-muted); text-align: center;"></td>
      <td><input type="text" class="batch-cell-input batch-date" value="${escapeHTML(d.date || today)}" placeholder="YYYY-MM-DD, 't', 'y', '-2'"></td>
      <td><input type="text" class="batch-cell-input batch-title" value="${escapeHTML(d.title || '')}" placeholder="e.g. Chai, Groceries, Cab"></td>
      <td><input type="number" step="0.01" class="batch-cell-input batch-amount" value="${escapeHTML(String(d.amount || ''))}" placeholder="0.00"></td>
      <td><select class="batch-cell-select batch-category">${catOptions}</select></td>
      <td>
        <select class="batch-cell-select batch-payment">
          <option value="UPI / GPay">UPI / GPay / PhonePe</option>
          <option value="Credit Card">Credit Card</option>
          <option value="Debit Card">Debit Card</option>
          <option value="Net Banking">Net Banking</option>
          <option value="Cash">Cash</option>
        </select>
      </td>
      <td><input type="text" class="batch-cell-input batch-desc" value="${escapeHTML(d.description || '')}" placeholder="Optional notes..."></td>
      <td><button type="button" class="btn-batch-remove" data-action="remove-batch-row" title="Remove Row">✕</button></td>
    `;

    if (d.category) {
      const catSelect = tr.querySelector('.batch-category');
      if (catSelect) catSelect.value = d.category;
    }

    if (d.paymentMethod) {
      const paySelect = tr.querySelector('.batch-payment');
      if (paySelect) paySelect.value = d.paymentMethod;
    }

    tbody.appendChild(tr);
    this.updateBatchRowNumbers();

    // Wire input listeners for running total and arrow-key cell navigation
    tr.querySelectorAll('.batch-cell-input, .batch-cell-select').forEach(input => {
      input.addEventListener('input', () => this.updateBatchRunningTotal());
      input.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          const colClass = Array.from(input.classList).find(c => c.startsWith('batch-') && c !== 'batch-cell-input' && c !== 'batch-cell-select');
          if (colClass) {
            const targetTr = e.key === 'ArrowDown' ? tr.nextElementSibling : tr.previousElementSibling;
            if (targetTr) {
              e.preventDefault();
              targetTr.querySelector(`.${colClass}`)?.focus();
            }
          }
        }
      });
    });

    // Date input shorthand resolver on blur & Enter
    const dateInput = tr.querySelector('.batch-date');
    dateInput?.addEventListener('blur', (e) => {
      e.target.value = this.resolveDateShorthand(e.target.value);
      this.updateBatchRunningTotal();
    });
    dateInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.target.value = this.resolveDateShorthand(e.target.value);
        this.updateBatchRunningTotal();
      }
    });

    // Auto-add next row on Enter or Tab from the last cell
    const descInput = tr.querySelector('.batch-desc');
    descInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === 'Tab') {
        const isLastRow = !tr.nextElementSibling;
        if (isLastRow) {
          this.addBatchRow();
          setTimeout(() => {
            tr.nextElementSibling?.querySelector('.batch-title')?.focus();
          }, 50);
        }
      }
    });

    return tr;
  }


  /**
   * Re-numbers all spreadsheet rows sequentially and recalculates live totals.
   *
   * @returns {void}
   */
  updateBatchRowNumbers() {
    if (typeof document === 'undefined') return;

    document.querySelectorAll('#batch-table-body tr').forEach((tr, idx) => {
      const numCell = tr.querySelector('.batch-row-num');
      if (numCell) numCell.textContent = String(idx + 1);
    });

    this.updateBatchRunningTotal();
  }


  /**
   * Calculates running batch total, total rows, and valid rows count in the sticky footer.
   *
   * @returns {void}
   */
  updateBatchRunningTotal() {
    if (typeof document === 'undefined') return;

    const rows = document.querySelectorAll('#batch-table-body tr');
    let total = 0;
    let validCount = 0;

    rows.forEach(tr => {
      const title = tr.querySelector('.batch-title')?.value.trim();
      const amt = parseFloat(tr.querySelector('.batch-amount')?.value);
      if (!isNaN(amt) && amt > 0) {
        total += amt;
        if (title) validCount++;
      }
    });

    const totalRowsEl = document.getElementById('batch-total-rows');
    const validRowsEl = document.getElementById('batch-valid-rows');
    const liveTotalEl = document.getElementById('batch-live-total');
    const salaryConfig = this.#state.get('salaryConfig');

    if (totalRowsEl) totalRowsEl.textContent = String(rows.length);
    if (validRowsEl) validRowsEl.textContent = String(validCount);
    if (liveTotalEl) liveTotalEl.textContent = formatCurrency(total, 2, salaryConfig);
  }


  /**
   * Resolves friendly date shorthands into ISO YYYY-MM-DD date strings.
   * Supports: 't' / 'today', 'y' / 'yesterday', '-N' (days ago), and numeric day of month.
   *
   * @param {string|null|undefined} val - User-entered date string
   * @returns {string} Standardized YYYY-MM-DD date string
   */
  resolveDateShorthand(val) {
    if (!val) return new Date().toISOString().split('T')[0];
    const clean = String(val).trim().toLowerCase();
    const today = new Date();

    if (clean === 't' || clean === 'today') {
      return today.toISOString().split('T')[0];
    }
    if (clean === 'y' || clean === 'yesterday') {
      today.setDate(today.getDate() - 1);
      return today.toISOString().split('T')[0];
    }
    if (/^-\d+$/.test(clean)) {
      const daysAgo = parseInt(clean.replace('-', ''), 10);
      today.setDate(today.getDate() - daysAgo);
      return today.toISOString().split('T')[0];
    }
    if (/^\d{1,2}$/.test(clean)) {
      const dayNum = parseInt(clean, 10);
      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, '0');
      return `${year}-${month}-${String(dayNum).padStart(2, '0')}`;
    }
    return val;
  }


  /**
   * Commits all valid batch spreadsheet rows to the database.
   *
   * @returns {Promise<void>}
   */
  async saveAllBatchRows() {
    if (typeof document === 'undefined') return;

    const rows = document.querySelectorAll('#batch-table-body tr');
    let savedCount = 0;
    const activeProfile = this.#state.get('activeProfile');
    const paidBy = activeProfile ? activeProfile.name : 'Self';

    for (const tr of rows) {
      const title = tr.querySelector('.batch-title')?.value.trim();
      const amount = parseFloat(tr.querySelector('.batch-amount')?.value);
      const dateRaw = tr.querySelector('.batch-date')?.value;
      const date = this.resolveDateShorthand(dateRaw);
      const category = tr.querySelector('.batch-category')?.value;
      const paymentMethod = tr.querySelector('.batch-payment')?.value;
      const description = tr.querySelector('.batch-desc')?.value.trim();

      if (title && !isNaN(amount) && amount > 0) {
        await this.#api.addExpense({
          title,
          amount,
          date,
          category,
          paymentMethod,
          description,
          paidBy,
          isHouseholdExpense: false
        });
        savedCount++;
      }
    }

    if (savedCount > 0) {
      showActionToast({
        icon: 'clipboard',
        title: `Saved ${savedCount} Batch Records`,
        subtext: 'Added to your financial ledger'
      });
      await this.#refreshAppData();
      this.#tabSwitcher('dashboard');
    } else {
      if (typeof alert !== 'undefined') {
        alert('No valid rows to save. Please enter a Title and Amount for at least one row.');
      }
    }
  }


  /**
   * Pastes tab-delimited rows from system clipboard (Excel / Google Sheets) into the grid.
   *
   * @returns {Promise<void>}
   */
  async handlePasteFromClipboard() {
    if (typeof navigator === 'undefined' || !navigator.clipboard) return;

    try {
      const text = await navigator.clipboard.readText();
      if (!text || !text.trim()) {
        if (typeof alert !== 'undefined') {
          alert('Clipboard is empty. Copy tab-delimited rows from Excel or Google Sheets first.');
        }
        return;
      }

      const lines = text.trim().split(/\r?\n/);
      let parsedCount = 0;
      const categories = this.#state.get('categories') || ['Food & Dining'];

      lines.forEach(line => {
        const parts = line.split('\t');
        if (parts.length >= 2) {
          let date = new Date().toISOString().split('T')[0];
          let title;
          let amount;
          let category = categories[0] || 'Food & Dining';
          let description = '';

          if (/^\d{4}-\d{2}-\d{2}$/.test(parts[0].trim()) || /^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(parts[0].trim())) {
            date = parts[0].trim();
            title = parts[1] || '';
            amount = parseFloat((parts[2] || '').replace(/[^0-9.]/g, '')) || '';
            if (parts[3]) category = parts[3].trim();
            if (parts[5]) description = parts[5].trim();
          } else {
            title = parts[0] || '';
            amount = parseFloat((parts[1] || '').replace(/[^0-9.]/g, '')) || '';
            if (parts[2]) category = parts[2].trim();
            if (parts[3]) description = parts[3].trim();
          }

          if (title || amount) {
            this.addBatchRow({ date, title, amount, category, description });
            parsedCount++;
          }
        }
      });

      if (parsedCount > 0) {
        showToast(`Pasted and inserted ${parsedCount} rows from clipboard!`);
      } else {
        if (typeof alert !== 'undefined') {
          alert('No tab-delimited tabular rows detected in clipboard.');
        }
      }
    } catch (err) {
      if (typeof alert !== 'undefined') {
        alert('Clipboard read error: ' + err.message);
      }
    }
  }


  /**
   * Clears rows that have both empty title and empty amount.
   *
   * @returns {void}
   */
  clearEmptyRows() {
    if (typeof document === 'undefined') return;

    document.querySelectorAll('#batch-table-body tr').forEach(tr => {
      const title = tr.querySelector('.batch-title')?.value.trim();
      const amount = tr.querySelector('.batch-amount')?.value.trim();
      if (!title && !amount) tr.remove();
    });

    this.updateBatchRowNumbers();

    if (document.querySelectorAll('#batch-table-body tr').length === 0) {
      this.addBatchRow();
    }
  }


  // ==========================================================================
  //  Private Event Binding & Delegation
  // ==========================================================================

  #bindToolbarControls() {
    if (typeof document === 'undefined') return;

    const addBtn = document.getElementById('btn-add-batch-row');
    const pasteBtn = document.getElementById('btn-batch-paste-clipboard');
    const clearBtn = document.getElementById('btn-batch-clear-empty');
    const saveBtn = document.getElementById('btn-save-batch-all');

    const handleAdd = () => this.addBatchRow();
    const handlePaste = async () => await this.handlePasteFromClipboard();
    const handleClear = () => this.clearEmptyRows();
    const handleSave = async () => await this.saveAllBatchRows();

    addBtn?.addEventListener('click', handleAdd);
    pasteBtn?.addEventListener('click', handlePaste);
    clearBtn?.addEventListener('click', handleClear);
    saveBtn?.addEventListener('click', handleSave);

    this.#cleanupListeners.push(() => {
      addBtn?.removeEventListener('click', handleAdd);
      pasteBtn?.removeEventListener('click', handlePaste);
      clearBtn?.removeEventListener('click', handleClear);
      saveBtn?.removeEventListener('click', handleSave);
    });
  }


  #bindTableDelegation() {
    if (typeof document === 'undefined') return;

    const tbody = document.getElementById('batch-table-body');
    if (!tbody) return;

    // Delegated row removal replacing inline onclick (zero onclick in rows)
    this.#cleanupTableEvents = delegateEvent(tbody, {
      'remove-batch-row': (target) => {
        const tr = target.closest('tr');
        if (tr) {
          tr.remove();
          this.updateBatchRowNumbers();
        }
      }
    });
  }
}
