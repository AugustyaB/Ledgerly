/**
 * LEDGERLY — EXPENSE FEED VIEW COMPONENT
 * 
 * High-performance transaction ledger and precision expense management hub.
 * Features:
 * - Multi-criteria live filtering (search, category, payment method, member split, date range)
 * - Sortable columns (date, title, category, amount) with direction toggles
 * - Pagination with dynamic page size and record count summaries
 * - Sticky date grouping headers with count & subtotal calculation
 * - Multi-row selection with Shift+Click range support and sticky batch actions (bulk delete, CSV export)
 * - In-place double-click inline cell editing (title, amount, category)
 * - Contextual expense modal with household splitting and local receipt attachments
 * - 100% delegated events (zero inline event handlers)
 *
 * @module src/ui/views/ExpenseFeedView
 */

// ============================================================================
// EXTERNAL DEPENDENCIES & HELPERS
// ============================================================================

import { escapeHTML, delegateEvent } from '../helpers/dom.js';
import { formatCurrency } from '../helpers/formatters.js';
import { showToast, showActionToast } from '../helpers/toast.js';

// ============================================================================
// SAFE ICON HELPER
// ============================================================================

/**
 * Headless-safe SVG icon renderer.
 * @param {string} name - Icon identifier
 * @param {number} [size=16] - Pixel size
 * @returns {string} SVG HTML or fallback
 */
function safeIcon(name, size = 16) {
  if (typeof icon === 'function') {
    return icon(name, size);
  }
  return `<i data-icon="${escapeHTML(name)}" data-icon-size="${size}"></i>`;
}

// ============================================================================
// DATE GROUPING UTILITY
// ============================================================================

/**
 * Generate human-readable date group headers for transaction feed.
 * @param {string} dateStr - ISO date string (YYYY-MM-DD)
 * @returns {string} Group label
 */
export function getDateGroupLabel(dateStr) {
  if (!dateStr) return 'UNKNOWN DATE';
  const today = new Date();
  const d = new Date(dateStr);
  const todayStr = today.toISOString().split('T')[0];

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];

  if (dateStr === todayStr) return 'TODAY';
  if (dateStr === yesterdayStr) return 'YESTERDAY';

  const diffDays = Math.round((today.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays >= 2 && diffDays <= 7) return 'EARLIER THIS WEEK';

  try {
    return d.toLocaleDateString('en-IN', { month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase();
  } catch {
    return dateStr.toUpperCase();
  }
}

// ============================================================================
// MAIN EXPENSE FEED VIEW CLASS
// ============================================================================

export class ExpenseFeedView {
  /**
   * Root container element reference.
   * @type {HTMLElement|null}
   */
  container = null;

  /**
   * Reactive state store reference.
   * @type {import('../AppState').AppState|null}
   */
  state = null;

  /**
   * Electron IPC API bridge.
   * @type {any}
   */
  api = null;

  /**
   * Callback hook triggered when underlying data changes.
   * @type {(() => Promise<void>)|null}
   */
  onDataChanged = null;

  /**
   * Hook to open note modal for an expense.
   * @type {((expenseId: string, title: string) => void)|null}
   */
  onOpenNote = null;

  /**
   * Cleanups collected during mounting.
   * @type {Array<() => void>}
   * @private
   */
  #cleanups = [];

  /**
   * Index of the last checked checkbox for Shift+Click range selection.
   * @type {number|null}
   * @private
   */
  #lastCheckedIndex = null;

  /**
   * Construct ExpenseFeedView instance.
   * @param {Object} options
   * @param {import('../AppState').AppState} options.state - AppState instance
   * @param {any} [options.api] - electronAPI bridge
   * @param {() => Promise<void>} [options.onDataChanged] - Mutation refresh hook
   * @param {(expenseId: string, title: string) => void} [options.onOpenNote] - Open note modal hook
   */
  constructor(options = {}) {
    this.state = options.state || null;
    this.api = options.api || (typeof window !== 'undefined' ? window.electronAPI : null);
    this.onDataChanged = options.onDataChanged || null;
    this.onOpenNote = options.onOpenNote || null;
  }

  // ==========================================================================
  // LIFECYCLE HOOKS
  // ==========================================================================

  /**
   * Mount the view, bind event listeners, and set up modal forms.
   * @param {HTMLElement} containerEl - Container element (#view-expenses)
   */
  mount(containerEl) {
    this.container = containerEl;
    if (!this.container || typeof document === 'undefined') return;

    this.#bindFilterBar();
    this.#bindDelegatedTableEvents();
    this.#bindBatchBar();
    this.#bindPaginationControls();
    this.#bindExpenseModal();
    this.#bindReceiptLightbox();
  }

  /**
   * Unmount the view and remove all event listeners.
   */
  unmount() {
    this.#cleanups.forEach((cleanup) => {
      try {
        cleanup();
      } catch (err) {
        console.warn('ExpenseFeedView cleanup error:', err);
      }
    });
    this.#cleanups = [];
    this.container = null;
  }

  // ==========================================================================
  // RENDERING PIPELINE
  // ==========================================================================

  /**
   * Compute filtered and sorted records based on current state.
   * @returns {{ pagedList: any[], totalCount: number, totalPages: number, startIndex: number, pageSize: number }}
   */
  computeFeedData() {
    const expenses = this.state?.get('expenses') || [];
    const filters = this.state?.get('feedFilters') || {
      search: '',
      category: 'ALL',
      paymentMethod: 'ALL',
      member: 'ALL',
      dateRange: 'ALL'
    };
    const sort = this.state?.get('feedSort') || { column: 'date', direction: 'desc' };

    let list = [...expenses];

    // 1. Search Query Filter
    const q = (filters.search || '').trim().toLowerCase();
    if (q) {
      list = list.filter((e) =>
        (e.title && e.title.toLowerCase().includes(q)) ||
        (e.description && e.description.toLowerCase().includes(q)) ||
        (e.category && e.category.toLowerCase().includes(q)) ||
        (e.tags && Array.isArray(e.tags) && e.tags.some((t) => t.toLowerCase().includes(q)))
      );
    }

    // 2. Category Filter
    if (filters.category && filters.category !== 'ALL') {
      list = list.filter((e) => e.category === filters.category);
    }

    // 3. Payment Method Filter
    if (filters.paymentMethod && filters.paymentMethod !== 'ALL') {
      list = list.filter((e) => (e.paymentMethod || 'UPI / GPay') === filters.paymentMethod);
    }

    // 4. Member / Split Filter
    if (filters.member === 'SHARED') {
      list = list.filter((e) => e.isHouseholdExpense || (e.splitWith && e.splitWith.length > 0));
    } else if (filters.member === 'PERSONAL') {
      list = list.filter((e) => !e.isHouseholdExpense && (!e.splitWith || e.splitWith.length === 0));
    }

    // 5. Date Range Filter
    const now = new Date();
    if (filters.dateRange === 'THIS_MONTH') {
      const monthStr = now.toISOString().substring(0, 7);
      list = list.filter((e) => e.date && e.date.startsWith(monthStr));
    } else if (filters.dateRange === 'LAST_30') {
      const cutoff = new Date(now.getTime() - 30 * 24 * 3600 * 1000).toISOString().split('T')[0];
      list = list.filter((e) => e.date && e.date >= cutoff);
    }

    // 6. Sorting
    const sortCol = sort.column || 'date';
    const sortDir = sort.direction === 'asc' ? 1 : -1;
    list.sort((a, b) => {
      if (sortCol === 'date') return (new Date(a.date).getTime() - new Date(b.date).getTime()) * sortDir;
      if (sortCol === 'amount') return ((parseFloat(a.amount) || 0) - (parseFloat(b.amount) || 0)) * sortDir;
      if (sortCol === 'title') return (a.title || '').localeCompare(b.title || '') * sortDir;
      if (sortCol === 'category') return (a.category || '').localeCompare(b.category || '') * sortDir;
      return 0;
    });

    // 7. Pagination
    const totalCount = list.length;
    const pageSize = this.state?.get('feedPageSize') || 20;
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
    let currentPage = this.state?.get('feedPage') || 1;

    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;
    if (this.state) this.state.set('feedPage', currentPage);

    const startIndex = (currentPage - 1) * pageSize;
    const pagedList = list.slice(startIndex, startIndex + pageSize);

    return { pagedList, totalCount, totalPages, startIndex, pageSize };
  }

  /**
   * Render the entire Expense Feed table, pagination, and sticky batch controls.
   */
  render() {
    if (typeof document === 'undefined') return;

    this.populateCategoryDropdown();

    const tbody = document.getElementById('feed-expense-table-body');
    if (!tbody) return;

    const { pagedList, totalCount, totalPages, startIndex, pageSize } = this.computeFeedData();
    const currentPage = this.state?.get('feedPage') || 1;
    const selectedIds = this.state?.get('feedSelectedIds') || new Set();
    const notes = this.state?.get('notes') || [];

    // Update Pagination Display
    const infoEl = document.getElementById('feed-pagination-info');
    if (infoEl) {
      infoEl.textContent = totalCount > 0
        ? `Showing ${startIndex + 1}–${Math.min(startIndex + pageSize, totalCount)} of ${totalCount} records`
        : '0 records found';
    }

    const pageBadge = document.getElementById('feed-current-page-badge');
    if (pageBadge) {
      pageBadge.textContent = `Page ${currentPage} of ${totalPages}`;
    }

    const prevBtn = /** @type {HTMLButtonElement|null} */ (document.getElementById('feed-btn-prev-page'));
    const nextBtn = /** @type {HTMLButtonElement|null} */ (document.getElementById('feed-btn-next-page'));
    if (prevBtn) prevBtn.disabled = currentPage <= 1;
    if (nextBtn) nextBtn.disabled = currentPage >= totalPages;

    // Handle Empty State
    if (pagedList.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" style="text-align: center; color: var(--text-muted); padding: 40px; font-size: 13.5px;">
            No transactions match the selected filters.
          </td>
        </tr>
      `;
      this.updateStickyBatchBar();
      return;
    }

    // Build Table Rows with Sticky Date Grouping Headers
    let lastDateGroup = null;
    let html = '';
    let rowIdx = 0;

    pagedList.forEach((item) => {
      const groupLabel = getDateGroupLabel(item.date);
      if (groupLabel !== lastDateGroup) {
        lastDateGroup = groupLabel;
        const groupItems = pagedList.filter((x) => getDateGroupLabel(x.date) === groupLabel);
        const groupSubtotal = groupItems.reduce((acc, c) => acc + (parseFloat(c.amount) || 0), 0);

        html += `
          <tr class="feed-date-group-header">
            <td colspan="8">
              <span style="display: flex; align-items: center; justify-content: space-between;">
                <span>${groupLabel}</span>
                <span class="feed-date-group-badge">${groupItems.length} records • ${formatCurrency(groupSubtotal)}</span>
              </span>
            </td>
          </tr>
        `;
      }

      const isChecked = selectedIds.has(item.id);
      const expenseNotes = notes.filter((n) => n.relation === 'transaction' && n.relationId === item.id);
      const hasNotes = expenseNotes.length > 0;
      const isShared = Boolean(item.isHouseholdExpense);
      const currentIndex = rowIdx++;

      html += `
        <tr>
          <td>
            <input type="checkbox" class="feed-row-checkbox"
                   data-id="${escapeHTML(item.id)}"
                   data-index="${currentIndex}"
                   ${isChecked ? 'checked' : ''}>
          </td>
          <td style="font-family: var(--font-mono); font-size: 12px; color: var(--text-muted);">${escapeHTML(item.date)}</td>
          <td class="feed-editable-title" data-id="${escapeHTML(item.id)}" title="Double click to edit title inline">
            <strong style="color: var(--text-main); font-size: 13.5px;">${escapeHTML(item.title)}</strong>
            ${item.description ? `<div style="font-size: 11.5px; color: var(--text-dim); margin-top: 2px;">${escapeHTML(item.description)}</div>` : ''}
          </td>
          <td class="feed-editable-category" data-id="${escapeHTML(item.id)}" title="Double click to change category inline">
            <span class="category-pill">${escapeHTML(item.category)}</span>
          </td>
          <td>
            <div style="display: flex; align-items: center; gap: 6px;">
              <span style="font-size: 12px; color: var(--text-main); font-weight: 700;">${escapeHTML(item.paidBy || 'Personal')}</span>
              ${isShared ? `<span style="font-size: 10px; background: rgba(217, 130, 43, 0.15); color: var(--accent-primary); padding: 2px 6px; border-radius: 4px; font-weight: 700; display: inline-flex; align-items: center; gap: 4px;">${safeIcon('users', 11)} Shared</span>` : '<span style="font-size: 10px; background: #1E212A; color: var(--text-muted); padding: 2px 6px; border-radius: 4px;">Personal</span>'}
            </div>
          </td>
          <td class="amount-text feed-editable-amount" data-id="${escapeHTML(item.id)}" title="Double click to edit amount inline">
            -${formatCurrency(parseFloat(item.amount) || 0)}
          </td>
          <td>
            ${item.receiptFilename ? `
              <button type="button" class="action-btn" data-action="view-receipt" data-filename="${escapeHTML(item.receiptFilename)}" title="View Receipt Image">
                ${safeIcon('camera', 13)} View
              </button>
            ` : '<span style="color:var(--text-dim); font-size:11px;">—</span>'}
          </td>
          <td class="actions-cell">
            <button type="button" class="action-btn note-indicator-btn ${hasNotes ? 'has-notes' : ''}"
                    data-action="open-note"
                    data-id="${escapeHTML(item.id)}"
                    data-title="${escapeHTML(item.title)}"
                    title="${hasNotes ? `${expenseNotes.length} Note(s) linked` : 'Attach contextual note'}">
              ${safeIcon('file-text', 13)}
              ${hasNotes ? `<span style="font-size:9px; font-weight:800; margin-left:2px;">${expenseNotes.length}</span>` : ''}
            </button>
            <button type="button" class="action-btn edit-btn" data-action="edit-expense" data-id="${escapeHTML(item.id)}" title="Edit Expense">
              ${safeIcon('pencil', 13)}
            </button>
            <button type="button" class="action-btn delete-btn" data-action="delete-expense" data-id="${escapeHTML(item.id)}" title="Delete Expense">
              ${safeIcon('trash-2', 13)}
            </button>
          </td>
        </tr>
      `;
    });

    tbody.innerHTML = html;
    this.updateStickyBatchBar();
    this.updateSortIcons();
  }

  /**
   * Populate Category select dropdowns in filter bar and expense modal.
   */
  populateCategoryDropdown() {
    if (typeof document === 'undefined') return;

    const categories = this.state?.get('categories') || [];
    const catSelect = /** @type {HTMLSelectElement|null} */ (document.getElementById('feed-filter-category'));
    if (catSelect && catSelect.options.length <= 1) {
      categories.forEach((c) => {
        const opt = document.createElement('option');
        opt.value = c;
        opt.textContent = c;
        catSelect.appendChild(opt);
      });
    }

    const formCat = /** @type {HTMLSelectElement|null} */ (document.getElementById('form-category'));
    if (formCat && formCat.options.length === 0) {
      categories.forEach((c) => {
        const opt = document.createElement('option');
        opt.value = c;
        opt.textContent = c;
        formCat.appendChild(opt);
      });
    }
  }

  /**
   * Update table header sort arrows.
   */
  updateSortIcons() {
    if (typeof document === 'undefined') return;

    const sort = this.state?.get('feedSort') || { column: 'date', direction: 'desc' };
    ['date', 'title', 'category', 'amount'].forEach((c) => {
      const iconEl = document.getElementById(`feed-sort-${c}-icon`);
      if (iconEl) {
        if (sort.column === c) {
          iconEl.textContent = sort.direction === 'asc' ? '▲' : '▼';
        } else {
          iconEl.textContent = '';
        }
      }
    });
  }

  /**
   * Update sticky batch bar visibility, count, and select-all checkbox.
   */
  updateStickyBatchBar() {
    if (typeof document === 'undefined') return;

    const selectedIds = this.state?.get('feedSelectedIds') || new Set();
    const bar = document.getElementById('feed-sticky-batch-bar');
    const countEl = document.getElementById('feed-selected-count');
    const allCheckbox = /** @type {HTMLInputElement|null} */ (document.getElementById('feed-select-all-checkbox'));

    if (countEl) countEl.textContent = String(selectedIds.size);
    if (bar) {
      bar.classList.toggle('hidden', selectedIds.size === 0);
    }
    if (allCheckbox) {
      const visibleCheckboxes = document.querySelectorAll('.feed-row-checkbox');
      const allChecked = visibleCheckboxes.length > 0 && Array.from(visibleCheckboxes).every((cb) => /** @type {HTMLInputElement} */ (cb).checked);
      allCheckbox.checked = allChecked;
    }
  }

  // ==========================================================================
  // INLINE EDITING (DOUBLE-CLICK)
  // ==========================================================================

  /**
   * Start in-place inline editing for Title.
   * @param {HTMLElement} cell
   * @param {string} expenseId
   */
  async startInlineEditTitle(cell, expenseId) {
    const expenses = this.state?.get('expenses') || [];
    const item = expenses.find((e) => e.id === expenseId);
    if (!item) {
      showToast('⚠️ Expense record not found');
      return;
    }

    const currentVal = item.title;
    cell.classList.add('inline-editing-cell');
    cell.innerHTML = `<input type="text" class="inline-cell-input" value="${escapeHTML(currentVal)}">`;
    const input = cell.querySelector('input');
    if (!input) return;

    input.focus();
    input.select();

    let saved = false;
    const save = async () => {
      if (saved) return;
      saved = true;
      const newVal = input.value.trim();
      if (newVal && newVal !== currentVal) {
        item.title = newVal;
        const res = await this.api.updateExpense(item);
        if (res?.success) {
          showToast(`Updated "${newVal}"`);
          if (this.onDataChanged) await this.onDataChanged();
        } else {
          showToast(res?.error || 'Failed to update title');
        }
      }
      this.render();
    };

    input.addEventListener('blur', save);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        input.blur();
      }
      if (e.key === 'Escape') {
        saved = true;
        this.render();
      }
    });
  }

  /**
   * Start in-place inline editing for Amount.
   * @param {HTMLElement} cell
   * @param {string} expenseId
   */
  async startInlineEditAmount(cell, expenseId) {
    const expenses = this.state?.get('expenses') || [];
    const item = expenses.find((e) => e.id === expenseId);
    if (!item) {
      showToast('⚠️ Expense record not found');
      return;
    }

    const currentVal = parseFloat(item.amount) || 0;
    cell.classList.add('inline-editing-cell');
    cell.innerHTML = `<input type="number" step="0.01" class="inline-cell-input" value="${currentVal}">`;
    const input = cell.querySelector('input');
    if (!input) return;

    input.focus();
    input.select();

    let saved = false;
    const save = async () => {
      if (saved) return;
      saved = true;
      const newVal = parseFloat(input.value);
      if (!isNaN(newVal) && newVal > 0 && newVal !== currentVal) {
        item.amount = newVal;
        const res = await this.api.updateExpense(item);
        if (res?.success) {
          showToast(`Updated amount: ${formatCurrency(newVal)}`);
          if (this.onDataChanged) await this.onDataChanged();
        } else {
          showToast(res?.error || 'Failed to update amount');
        }
      }
      this.render();
    };

    input.addEventListener('blur', save);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        input.blur();
      }
      if (e.key === 'Escape') {
        saved = true;
        this.render();
      }
    });
  }

  /**
   * Start in-place inline editing for Category.
   * @param {HTMLElement} cell
   * @param {string} expenseId
   */
  async startInlineEditCategory(cell, expenseId) {
    const expenses = this.state?.get('expenses') || [];
    const item = expenses.find((e) => e.id === expenseId);
    if (!item) {
      showToast('⚠️ Expense record not found');
      return;
    }

    const currentVal = item.category;
    const categories = this.state?.get('categories') || [];
    const options = categories.map((c) => `<option value="${escapeHTML(c)}" ${c === currentVal ? 'selected' : ''}>${escapeHTML(c)}</option>`).join('');

    cell.classList.add('inline-editing-cell');
    cell.innerHTML = `<select class="inline-cell-select">${options}</select>`;
    const select = cell.querySelector('select');
    if (!select) return;

    select.focus();

    let saved = false;
    const save = async () => {
      if (saved) return;
      saved = true;
      const newVal = select.value;
      if (newVal && newVal !== currentVal) {
        item.category = newVal;
        const res = await this.api.updateExpense(item);
        if (res?.success) {
          showToast(`Updated category: ${newVal}`);
          if (this.onDataChanged) await this.onDataChanged();
        } else {
          showToast(res?.error || 'Failed to update category');
        }
      }
      this.render();
    };

    select.addEventListener('blur', save);
    select.addEventListener('change', () => select.blur());
    select.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        saved = true;
        this.render();
      }
    });
  }

  // ==========================================================================
  // EXPENSE MODAL CONTROLLER
  // ==========================================================================

  /**
   * Open Add Expense Modal.
   */
  openAddModal() {
    if (typeof document === 'undefined') return;

    const heading = document.getElementById('modal-heading');
    if (heading) heading.textContent = 'Log New Expense';

    const idInput = /** @type {HTMLInputElement} */ (document.getElementById('form-expense-id'));
    const titleInput = /** @type {HTMLInputElement} */ (document.getElementById('form-title'));
    const amountInput = /** @type {HTMLInputElement} */ (document.getElementById('form-amount'));
    const dateInput = /** @type {HTMLInputElement} */ (document.getElementById('form-date'));
    const descInput = /** @type {HTMLTextAreaElement} */ (document.getElementById('form-description'));
    const receiptInput = /** @type {HTMLInputElement} */ (document.getElementById('form-receipt-filename'));
    const receiptStatus = document.getElementById('receipt-status-text');
    const isHouseholdCb = /** @type {HTMLInputElement} */ (document.getElementById('form-is-household'));
    const splitOptions = document.getElementById('form-split-options');

    if (idInput) idInput.value = '';
    if (titleInput) titleInput.value = '';
    if (amountInput) amountInput.value = '';
    if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];
    if (descInput) descInput.value = '';
    if (receiptInput) receiptInput.value = '';
    if (receiptStatus) receiptStatus.textContent = 'No receipt image attached';
    if (isHouseholdCb) isHouseholdCb.checked = false;
    if (splitOptions) splitOptions.classList.add('hidden');

    this.populateCategoryDropdown();
    this.populateHouseholdFormSplitters();

    document.getElementById('expense-modal')?.classList.add('active');
  }

  /**
   * Open Edit Expense Modal.
   * @param {string} id - Expense ID
   */
  async openEditModal(id) {
    if (typeof document === 'undefined') return;

    let expenses = this.state?.get('expenses') || [];
    let item = expenses.find((e) => e.id === id);

    if (!item && this.api?.getExpenseById) {
      const res = await this.api.getExpenseById(id);
      if (res?.success) item = res.expense;
    }

    if (!item) {
      showToast('⚠️ Expense record not found');
      return;
    }

    const heading = document.getElementById('modal-heading');
    if (heading) heading.textContent = 'Edit Expense Record';

    const idInput = /** @type {HTMLInputElement} */ (document.getElementById('form-expense-id'));
    const titleInput = /** @type {HTMLInputElement} */ (document.getElementById('form-title'));
    const amountInput = /** @type {HTMLInputElement} */ (document.getElementById('form-amount'));
    const dateInput = /** @type {HTMLInputElement} */ (document.getElementById('form-date'));
    const catInput = /** @type {HTMLSelectElement} */ (document.getElementById('form-category'));
    const payInput = /** @type {HTMLSelectElement} */ (document.getElementById('form-payment'));
    const descInput = /** @type {HTMLTextAreaElement} */ (document.getElementById('form-description'));
    const receiptInput = /** @type {HTMLInputElement} */ (document.getElementById('form-receipt-filename'));
    const receiptStatus = document.getElementById('receipt-status-text');
    const isHouseholdCb = /** @type {HTMLInputElement} */ (document.getElementById('form-is-household'));
    const splitOptions = document.getElementById('form-split-options');

    if (idInput) idInput.value = item.id;
    if (titleInput) titleInput.value = item.title;
    if (amountInput) amountInput.value = item.amount;
    if (dateInput) dateInput.value = item.date;
    if (catInput) catInput.value = item.category;
    if (payInput) payInput.value = item.paymentMethod || 'UPI / GPay';
    if (descInput) descInput.value = item.description || '';
    if (receiptInput) receiptInput.value = item.receiptFilename || '';
    if (receiptStatus) {
      receiptStatus.textContent = item.receiptFilename ? `Attached: ${item.receiptFilename}` : 'No receipt image attached';
    }

    const isHousehold = Boolean(item.isHouseholdExpense);
    if (isHouseholdCb) isHouseholdCb.checked = isHousehold;
    if (splitOptions) splitOptions.classList.toggle('hidden', !isHousehold);

    this.populateHouseholdFormSplitters(item.paidBy, item.splitWith);

    document.getElementById('expense-modal')?.classList.add('active');
  }

  /**
   * Close Expense Modal.
   */
  closeModal() {
    if (typeof document === 'undefined') return;
    document.getElementById('expense-modal')?.classList.remove('active');
  }

  /**
   * Populate Paid By select and Split With checkboxes inside expense modal.
   * @param {string} [paidBy='Self']
   * @param {string[]} [splitWith=[]]
   */
  populateHouseholdFormSplitters(paidBy = 'Self', splitWith = []) {
    if (typeof document === 'undefined') return;

    const members = this.state?.get('householdMembers') || ['Self', 'Partner', 'Roommate'];
    const paidBySelect = /** @type {HTMLSelectElement} */ (document.getElementById('form-paid-by'));
    const splitContainer = document.getElementById('form-split-with-container');

    if (paidBySelect) {
      paidBySelect.innerHTML = members.map((m) => `<option value="${escapeHTML(m)}">${escapeHTML(m)}</option>`).join('');
      paidBySelect.value = paidBy || members[0] || 'Self';
    }

    if (splitContainer) {
      splitContainer.innerHTML = members.map((m) => {
        const isChecked = splitWith && splitWith.length > 0 ? splitWith.includes(m) : true;
        return `
          <label style="display: inline-flex; align-items: center; gap: 4px; font-size: 12px; cursor: pointer; background: var(--bg-card); padding: 4px 8px; border-radius: var(--radius-sm); border: 1px solid var(--border-color);">
            <input type="checkbox" name="split-member" value="${escapeHTML(m)}" ${isChecked ? 'checked' : ''} style="width: auto;">
            ${escapeHTML(m)}
          </label>
        `;
      }).join('');
    }
  }

  // ==========================================================================
  // RECEIPT LIGHTBOX & ACTIONS
  // ==========================================================================

  /**
   * View local receipt image in preview box.
   * @param {string} filename
   */
  viewReceiptImage(filename) {
    if (typeof document === 'undefined' || !filename) return;

    const previewBox = document.getElementById('receipt-preview-box');
    const previewImg = /** @type {HTMLImageElement|null} */ (document.getElementById('receipt-preview-img'));

    if (previewImg) {
      previewImg.src = `local-receipt://${filename}`;
      previewImg.onerror = () => {
        showToast('⚠️ Receipt image could not be loaded');
      };
    }
    if (previewBox) {
      previewBox.classList.remove('hidden');
    }
    showToast(`Viewing receipt: ${filename}`);
  }

  /**
   * Delete an expense record with confirmation.
   * @param {string} id
   */
  async confirmDeleteExpense(id) {
    if (typeof confirm === 'function' && !confirm('Are you sure you want to delete this expense record?')) {
      return;
    }

    const allExpenses = this.state?.get('expenses') || [];
    const deletedExpense = allExpenses.find(e => String(e.id) === String(id)) || null;

    const res = await this.api.deleteExpense(id);
    if (res?.success) {
      if (deletedExpense && typeof this.state?.pushUndoAction === 'function') {
        this.state.pushUndoAction({
          type: 'DELETE_EXPENSE',
          description: `Deleted "${deletedExpense.title || 'Expense'}"`,
          payload: deletedExpense,
          undo: async () => {
            await this.api.addExpense(deletedExpense);
            if (this.onDataChanged) await this.onDataChanged();
            this.render();
          }
        });
      }
      showActionToast({
        icon: 'rotate-ccw',
        title: 'Expense record deleted',
        subtext: 'Press Ctrl+Z to undo'
      });
      const selectedIds = this.state?.get('feedSelectedIds') || new Set();
      selectedIds.delete(id);
      if (this.onDataChanged) await this.onDataChanged();
      this.render();
    } else {
      showToast(res?.error || 'Failed to delete expense record');
    }
  }

  // ==========================================================================
  // EVENT BINDINGS
  // ==========================================================================

  /**
   * Bind filter command bar inputs and reset button.
   * @private
   */
  #bindFilterBar() {
    const bindInput = (id, event, handler) => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener(event, handler);
        this.#cleanups.push(() => el.removeEventListener(event, handler));
      }
    };

    const updateFilter = (key, value) => {
      const filters = this.state?.get('feedFilters') || {};
      filters[key] = value;
      if (this.state) {
        this.state.set('feedFilters', filters);
        this.state.set('feedPage', 1);
      }
      this.render();
    };

    bindInput('feed-search-input', 'input', (e) => updateFilter('search', e.target.value));
    bindInput('feed-filter-category', 'change', (e) => updateFilter('category', e.target.value));
    bindInput('feed-filter-payment', 'change', (e) => updateFilter('paymentMethod', e.target.value));
    bindInput('feed-filter-member', 'change', (e) => updateFilter('member', e.target.value));
    bindInput('feed-filter-date-range', 'change', (e) => updateFilter('dateRange', e.target.value));

    bindInput('feed-btn-reset-filters', 'click', () => {
      if (this.state) {
        this.state.set('feedFilters', {
          search: '',
          category: 'ALL',
          paymentMethod: 'ALL',
          member: 'ALL',
          dateRange: 'ALL'
        });
        this.state.set('feedPage', 1);
      }

      const searchInput = /** @type {HTMLInputElement|null} */ (document.getElementById('feed-search-input'));
      const catSelect = /** @type {HTMLSelectElement|null} */ (document.getElementById('feed-filter-category'));
      const paySelect = /** @type {HTMLSelectElement|null} */ (document.getElementById('feed-filter-payment'));
      const memSelect = /** @type {HTMLSelectElement|null} */ (document.getElementById('feed-filter-member'));
      const dateSelect = /** @type {HTMLSelectElement|null} */ (document.getElementById('feed-filter-date-range'));

      if (searchInput) searchInput.value = '';
      if (catSelect) catSelect.value = 'ALL';
      if (paySelect) paySelect.value = 'ALL';
      if (memSelect) memSelect.value = 'ALL';
      if (dateSelect) dateSelect.value = 'ALL';

      this.render();
    });

    // Column sort header listeners
    const bindSort = (id, column) => {
      const el = document.getElementById(id);
      if (el) {
        const handler = () => this.toggleSort(column);
        el.addEventListener('click', handler);
        this.#cleanups.push(() => el.removeEventListener('click', handler));
      }
    };

    bindSort('th-sort-date', 'date');
    bindSort('th-sort-title', 'title');
    bindSort('th-sort-category', 'category');
    bindSort('th-sort-amount', 'amount');
  }

  /**
   * Toggle sort column and direction.
   * @param {string} col - Column name
   */
  toggleSort(col) {
    const sort = this.state?.get('feedSort') || { column: 'date', direction: 'desc' };
    if (sort.column === col) {
      sort.direction = sort.direction === 'asc' ? 'desc' : 'asc';
    } else {
      sort.column = col;
      sort.direction = col === 'date' ? 'desc' : 'asc';
    }
    if (this.state) this.state.set('feedSort', sort);
    this.render();
  }

  /**
   * Bind delegated table events (actions, checkboxes, inline double-clicks).
   * @private
   */
  #bindDelegatedTableEvents() {
    // Delegated actions (view-receipt, open-note, edit-expense, delete-expense)
    const unbindActions = delegateEvent(this.container, 'click', '[data-action]', async (event, target) => {
      const action = target.getAttribute('data-action');
      if (!action) return;

      switch (action) {
        case 'view-receipt': {
          const filename = target.getAttribute('data-filename');
          if (filename) this.viewReceiptImage(filename);
          break;
        }
        case 'open-note': {
          const id = target.getAttribute('data-id');
          const title = target.getAttribute('data-title') || '';
          if (id) {
            if (this.onOpenNote) {
              this.onOpenNote(id, title);
            } else if (typeof window !== 'undefined' && typeof window.openNoteModalForExpense === 'function') {
              window.openNoteModalForExpense(id, title);
            }
          }
          break;
        }
        case 'edit-expense': {
          const id = target.getAttribute('data-id');
          if (id) await this.openEditModal(id);
          break;
        }
        case 'delete-expense': {
          const id = target.getAttribute('data-id');
          if (id) await this.confirmDeleteExpense(id);
          break;
        }
        default:
          break;
      }
    });
    this.#cleanups.push(unbindActions);

    // Delegated Row Checkbox Click with Shift+Click range support
    const tbody = document.getElementById('feed-expense-table-body');
    if (tbody) {
      const handleCheckbox = (event) => {
        const target = /** @type {HTMLInputElement} */ (event.target);
        if (!target || !target.classList.contains('feed-row-checkbox')) return;

        const isChecked = target.checked;
        const id = target.getAttribute('data-id');
        const index = parseInt(target.getAttribute('data-index') || '0', 10);
        const selectedIds = this.state?.get('feedSelectedIds') || new Set();
        const allCheckboxes = Array.from(document.querySelectorAll('.feed-row-checkbox'));

        if (event.shiftKey && this.#lastCheckedIndex !== null) {
          const start = Math.min(this.#lastCheckedIndex, index);
          const end = Math.max(this.#lastCheckedIndex, index);

          for (let i = start; i <= end; i++) {
            const cb = /** @type {HTMLInputElement} */ (allCheckboxes[i]);
            if (cb) {
              cb.checked = isChecked;
              const cbId = cb.getAttribute('data-id');
              if (cbId) {
                if (isChecked) selectedIds.add(cbId);
                else selectedIds.delete(cbId);
              }
            }
          }
        } else {
          if (id) {
            if (isChecked) selectedIds.add(id);
            else selectedIds.delete(id);
          }
        }

        this.#lastCheckedIndex = index;
        if (this.state) this.state.set('feedSelectedIds', selectedIds);
        this.updateStickyBatchBar();
      };

      tbody.addEventListener('click', handleCheckbox);
      this.#cleanups.push(() => tbody.removeEventListener('click', handleCheckbox));

      // Delegated Double-Click for Inline Editing
      const handleDblClick = (event) => {
        const cell = /** @type {HTMLElement} */ (event.target)?.closest('td');
        if (!cell) return;

        const id = cell.getAttribute('data-id');
        if (!id) return;

        if (cell.classList.contains('feed-editable-title')) {
          this.startInlineEditTitle(cell, id);
        } else if (cell.classList.contains('feed-editable-amount')) {
          this.startInlineEditAmount(cell, id);
        } else if (cell.classList.contains('feed-editable-category')) {
          this.startInlineEditCategory(cell, id);
        }
      };

      tbody.addEventListener('dblclick', handleDblClick);
      this.#cleanups.push(() => tbody.removeEventListener('dblclick', handleDblClick));
    }
  }

  /**
   * Bind sticky batch action bar controls (select all, deselect, bulk delete, bulk export).
   * @private
   */
  #bindBatchBar() {
    const bindEl = (id, event, handler) => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener(event, handler);
        this.#cleanups.push(() => el.removeEventListener(event, handler));
      }
    };

    // Select all checkbox
    bindEl('feed-select-all-checkbox', 'change', (e) => {
      const isChecked = /** @type {HTMLInputElement} */ (e.target).checked;
      const selectedIds = this.state?.get('feedSelectedIds') || new Set();

      document.querySelectorAll('.feed-row-checkbox').forEach((cb) => {
        const input = /** @type {HTMLInputElement} */ (cb);
        input.checked = isChecked;
        const id = input.getAttribute('data-id');
        if (id) {
          if (isChecked) selectedIds.add(id);
          else selectedIds.delete(id);
        }
      });

      if (this.state) this.state.set('feedSelectedIds', selectedIds);
      this.updateStickyBatchBar();
    });

    // Deselect all button
    bindEl('feed-btn-deselect-all', 'click', () => {
      const selectedIds = this.state?.get('feedSelectedIds') || new Set();
      selectedIds.clear();
      document.querySelectorAll('.feed-row-checkbox').forEach((cb) => {
        /** @type {HTMLInputElement} */ (cb).checked = false;
      });
      if (this.state) this.state.set('feedSelectedIds', selectedIds);
      this.updateStickyBatchBar();
    });

    // Bulk Delete
    bindEl('feed-btn-bulk-delete', 'click', async () => {
      const selectedIds = this.state?.get('feedSelectedIds') || new Set();
      if (selectedIds.size === 0) return;

      const totalSelected = selectedIds.size;
      if (typeof confirm === 'function' && !confirm(`Delete all ${totalSelected} selected transaction records?`)) {
        return;
      }

      let deletedCount = 0;
      let failedCount = 0;
      for (const id of selectedIds) {
        const res = await this.api.deleteExpense(id);
        if (res?.success) deletedCount++;
        else failedCount++;
      }

      if (failedCount > 0) {
        showToast(`Deleted ${deletedCount} records (${failedCount} not found)`);
      } else {
        showToast(`Deleted ${deletedCount} record(s) successfully`);
      }

      selectedIds.clear();
      if (this.state) this.state.set('feedSelectedIds', selectedIds);
      if (this.onDataChanged) await this.onDataChanged();
      this.render();
    });

    // Bulk Export CSV
    bindEl('feed-btn-bulk-export', 'click', async () => {
      if (!this.api?.exportCSV) return;
      const res = await this.api.exportCSV();
      if (res?.success) {
        showToast('Exported CSV successfully!');
      }
    });
  }

  /**
   * Bind pagination previous/next buttons.
   * @private
   */
  #bindPaginationControls() {
    const bindEl = (id, event, handler) => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener(event, handler);
        this.#cleanups.push(() => el.removeEventListener(event, handler));
      }
    };

    bindEl('feed-btn-prev-page', 'click', () => {
      const currentPage = this.state?.get('feedPage') || 1;
      if (currentPage > 1) {
        if (this.state) this.state.set('feedPage', currentPage - 1);
        this.render();
      }
    });

    bindEl('feed-btn-next-page', 'click', () => {
      const currentPage = this.state?.get('feedPage') || 1;
      if (this.state) this.state.set('feedPage', currentPage + 1);
      this.render();
    });
  }

  /**
   * Bind Expense Modal opening triggers, close buttons, and form submit.
   * @private
   */
  #bindExpenseModal() {
    const bindEl = (id, event, handler) => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener(event, handler);
        this.#cleanups.push(() => el.removeEventListener(event, handler));
      }
    };

    bindEl('btn-open-add-modal', 'click', () => this.openAddModal());
    bindEl('modal-close-btn', 'click', () => this.closeModal());
    bindEl('form-cancel-btn', 'click', () => this.closeModal());

    // Household split toggle checkbox
    bindEl('form-is-household', 'change', (e) => {
      const checked = /** @type {HTMLInputElement} */ (e.target).checked;
      document.getElementById('form-split-options')?.classList.toggle('hidden', !checked);
    });

    // Expense Form submission
    bindEl('expense-form', 'submit', async (e) => {
      e.preventDefault();
      const id = /** @type {HTMLInputElement} */ (document.getElementById('form-expense-id'))?.value;
      const isHousehold = /** @type {HTMLInputElement} */ (document.getElementById('form-is-household'))?.checked;

      let splitWithMembers = [];
      if (isHousehold) {
        document.querySelectorAll('input[name="split-member"]:checked').forEach((cb) => {
          splitWithMembers.push(/** @type {HTMLInputElement} */ (cb).value);
        });
      }

      const expenseData = {
        title: /** @type {HTMLInputElement} */ (document.getElementById('form-title'))?.value,
        amount: parseFloat(/** @type {HTMLInputElement} */ (document.getElementById('form-amount'))?.value) || 0,
        date: /** @type {HTMLInputElement} */ (document.getElementById('form-date'))?.value,
        category: /** @type {HTMLSelectElement} */ (document.getElementById('form-category'))?.value,
        paymentMethod: /** @type {HTMLSelectElement} */ (document.getElementById('form-payment'))?.value,
        description: /** @type {HTMLTextAreaElement} */ (document.getElementById('form-description'))?.value || '',
        receiptFilename: /** @type {HTMLInputElement} */ (document.getElementById('form-receipt-filename'))?.value || null,
        paidBy: /** @type {HTMLSelectElement} */ (document.getElementById('form-paid-by'))?.value || 'Self',
        splitWith: splitWithMembers,
        isHouseholdExpense: Boolean(isHousehold)
      };

      if (id) {
        expenseData.id = id;
        await this.api.updateExpense(expenseData);
        showToast(`Updated "${expenseData.title}"`);
      } else {
        await this.api.addExpense(expenseData);
        showToast(`Logged "${expenseData.title}"`);
      }

      this.closeModal();
      if (this.onDataChanged) await this.onDataChanged();
      this.render();
    });
  }

  /**
   * Bind receipt attachment file picker and remove button.
   * @private
   */
  /**
   * Bind receipt attachment file picker, dropzone, and remove button.
   * @private
   */
  #bindReceiptLightbox() {
    const bindEl = (id, event, handler) => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener(event, handler);
        this.#cleanups.push(() => el.removeEventListener(event, handler));
      }
    };

    // Attach receipt button click
    bindEl('btn-select-receipt', 'click', async () => {
      if (!this.api?.selectReceiptFile) return;
      const res = await this.api.selectReceiptFile();
      if (res?.success && res.filePath) {
        await this.#handleReceiptFile(res.filePath);
      }
    });

    // Receipt Dropzone drag-and-drop
    const dropzone = document.getElementById('receipt-dropzone');
    if (dropzone) {
      const onDragOver = (e) => {
        e.preventDefault();
        dropzone.classList.add('drag-active');
      };
      const onDragLeave = () => {
        dropzone.classList.remove('drag-active');
      };
      const onDrop = async (e) => {
        e.preventDefault();
        dropzone.classList.remove('drag-active');
        if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
          const file = e.dataTransfer.files[0];
          if (file.path) {
            await this.#handleReceiptFile(file.path);
          }
        }
      };

      dropzone.addEventListener('dragover', onDragOver);
      dropzone.addEventListener('dragleave', onDragLeave);
      dropzone.addEventListener('drop', onDrop);
      this.#cleanups.push(() => {
        dropzone.removeEventListener('dragover', onDragOver);
        dropzone.removeEventListener('dragleave', onDragLeave);
        dropzone.removeEventListener('drop', onDrop);
      });
    }

    // Remove receipt button
    bindEl('btn-remove-receipt', 'click', () => {
      const filenameInput = /** @type {HTMLInputElement} */ (document.getElementById('form-receipt-filename'));
      const statusText = document.getElementById('receipt-status-text');
      if (filenameInput) filenameInput.value = '';
      if (statusText) statusText.textContent = 'No receipt image attached';
      document.getElementById('receipt-preview-box')?.classList.add('hidden');
      showToast('Receipt attachment removed');
    });
  }

  /**
   * Processes a receipt file: saves to disk and scans with Tier 1 ML engine.
   * @private
   * @param {string} filePath 
   */
  async #handleReceiptFile(filePath) {
    if (!filePath || !this.api?.saveReceipt) return;

    const statusText = document.getElementById('receipt-status-text');
    if (statusText) statusText.textContent = 'Scanning receipt with Tier 1 Fast-Lite...';

    const saveRes = await this.api.saveReceipt(filePath);
    if (!saveRes?.success) {
      if (statusText) statusText.textContent = 'Failed to attach receipt.';
      showToast(saveRes?.error || 'Failed to attach receipt image.');
      return;
    }

    const filenameInput = /** @type {HTMLInputElement|null} */ (document.getElementById('form-receipt-filename'));
    if (filenameInput) filenameInput.value = saveRes.filename;
    if (statusText) statusText.textContent = `Attached: ${saveRes.filename}`;

    // Show preview thumbnail if available
    const previewBox = document.getElementById('receipt-preview-box');
    const previewImg = /** @type {HTMLImageElement|null} */ (document.getElementById('receipt-preview-img'));
    if (previewBox && previewImg && this.api?.getReceiptPath) {
      const absPathRes = await this.api.getReceiptPath(saveRes.filename);
      const absPath = typeof absPathRes === 'string' ? absPathRes : absPathRes?.data;
      if (absPath) {
        previewImg.src = `file://${absPath.replace(/\\/g, '/')}`;
        previewBox.classList.remove('hidden');
      }
    }

    // Tier 1 Fast-Lite On-Device Document Intelligence Scan
    if (this.api?.scanReceiptDocument) {
      try {
        const scanRes = await this.api.scanReceiptDocument(filePath);
        if (scanRes?.success && scanRes.data) {
          const data = scanRes.data;
          if (data.isTransaction && data.total !== null) {
            this.#autofillExpenseForm(data);
            if (statusText) {
              statusText.textContent = `Attached: ${saveRes.filename} (Scanned: ₹${data.total.toFixed(2)})`;
            }
            showToast(`Receipt scanned: ₹${data.total.toFixed(2)} at ${data.merchant}`);
          } else {
            if (statusText) {
              statusText.textContent = `Attached: ${saveRes.filename} (No receipt data detected)`;
            }
            showToast(data.message || 'No financial transactions detected in file.');
          }
        }
      } catch (scanErr) {
        console.warn('[ExpenseFeedView] Receipt scan exception:', scanErr);
      }
    } else {
      showToast(`Attached receipt: ${saveRes.filename}`);
    }
  }

  /**
   * Smartly autofills empty or default fields in the expense modal form.
   * @private
   * @param {Object} data - Scanned receipt metadata
   */
  #autofillExpenseForm(data) {
    if (typeof document === 'undefined' || !data) return;

    const titleEl = /** @type {HTMLInputElement|null} */ (document.getElementById('form-title'));
    const amountEl = /** @type {HTMLInputElement|null} */ (document.getElementById('form-amount'));
    const dateEl = /** @type {HTMLInputElement|null} */ (document.getElementById('form-date'));
    const categoryEl = /** @type {HTMLSelectElement|null} */ (document.getElementById('form-category'));
    const paymentEl = /** @type {HTMLSelectElement|null} */ (document.getElementById('form-payment'));
    const descEl = /** @type {HTMLTextAreaElement|null} */ (document.getElementById('form-description'));

    if (titleEl && (!titleEl.value.trim() || titleEl.value.toLowerCase() === 'new expense')) {
      if (data.merchant && data.merchant !== 'Unknown Merchant') {
        titleEl.value = data.merchant;
      }
    }

    if (amountEl && (!amountEl.value || parseFloat(amountEl.value) === 0)) {
      if (data.total !== null && data.total !== undefined) {
        amountEl.value = String(data.total);
      }
    }

    if (dateEl && !dateEl.value && data.date) {
      dateEl.value = data.date;
    }

    if (categoryEl && data.category) {
      for (let i = 0; i < categoryEl.options.length; i++) {
        if (categoryEl.options[i].value.toLowerCase() === data.category.toLowerCase()) {
          categoryEl.selectedIndex = i;
          break;
        }
      }
    }

    if (paymentEl && data.paymentMethod) {
      for (let i = 0; i < paymentEl.options.length; i++) {
        if (paymentEl.options[i].value.toLowerCase().includes(data.paymentMethod.toLowerCase()) ||
            data.paymentMethod.toLowerCase().includes(paymentEl.options[i].value.toLowerCase())) {
          paymentEl.selectedIndex = i;
          break;
        }
      }
    }

    if (descEl && !descEl.value.trim()) {
      const notes = [];
      if (data.gstin) notes.push(`GSTIN: ${data.gstin}`);
      if (data.cgst || data.sgst) notes.push(`CGST: ₹${data.cgst || 0}, SGST: ₹${data.sgst || 0}`);
      if (notes.length > 0) {
        descEl.value = notes.join(' | ');
      }
    }
  }
}
