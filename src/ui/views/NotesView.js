'use strict';

/**
 * @fileoverview Contextual Notes Workspace View
 *
 * Architecture Position: src/ui/views/NotesView.js
 * Role: Manages contextual financial memos, reflections, and insights linked
 *       to expenses, days, weeks, or months. Handles masonry rendering, modal
 *       CRUD interactions, and relation filtering.
 * Dependencies: AppState, window.electronAPI, dom helpers, formatters, toast
 * Extracted from: src/app.js L4084-4261, L1696-1750
 *
 * FUTURE: Rich markdown note formatting, pinning, tag indexing, cross-profile sharing
 */

import { escapeHTML, delegateEvent, setInnerHTML } from '../helpers/dom.js';
import { formatCurrency } from '../helpers/formatters.js';
import { showToast } from '../helpers/toast.js';

// ============================================================================
//  NotesView Class
// ============================================================================

export class NotesView {
  /** @type {HTMLElement|null} */
  #container = null;

  /** @type {import('../AppState.js').AppState} */
  #state;

  /** @type {any} */
  #api;

  /** @type {function(): void} */
  #cleanupContainerEvents = () => {};

  /** @type {function(): void} */
  #cleanupPillEvents = () => {};

  /** @type {function(): void} */
  #cleanupModalEvents = () => {};

  /** @type {Array<function(): void>} */
  #unsubscribers = [];

  /** @type {function(): Promise<void>} */
  #refreshAppData;

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
   * Mounts the view into its DOM container, binds event listeners,
   * subscribes to state changes, and triggers initial render.
   *
   * @param {HTMLElement|null} container - DOM container element (#view-notes)
   * @returns {void}
   */
  mount(container) {
    this.#container = container || document.getElementById('view-notes');
    this.#bindEvents();
    this.#subscribeToState();
    if (this.#container) {
      this.render();
    }
  }

  /**
   * Renders the notes masonry gallery and updates badge counters.
   *
   * @returns {void}
   */
  render() {
    if (typeof document === 'undefined') return;
    const listContainer = document.getElementById('notes-list-container');
    if (!listContainer) return;

    const allNotes = this.#state.get('notes') || [];
    const activeRelation = this.#state.get('activeNoteRelation') || 'ALL';
    const searchQuery = (this.#state.get('filterNotesSearch') || '').toLowerCase();

    // 1. Update Count Badges
    this.#updateCountBadges(allNotes);

    // 2. Filter Notes by relation and search
    const filtered = allNotes.filter(note => {
      const matchesRelation = activeRelation === 'ALL' || note.relation === activeRelation;
      const matchesSearch =
        !searchQuery ||
        (note.content && note.content.toLowerCase().includes(searchQuery)) ||
        (note.relationId && note.relationId.toLowerCase().includes(searchQuery));
      return matchesRelation && matchesSearch;
    });

    // 3. Render Empty State
    if (filtered.length === 0) {
      setInnerHTML(
        listContainer,
        `
        <div style="grid-column: 1 / -1; padding: 40px; text-align: center; color: var(--text-muted); font-size: 13.5px; background: #14151B; border-radius: var(--radius-md); border: 1px dashed var(--border-color);">
          No contextual notes found in this category. Click "+ New Note" or click the note icon on any expense in the table to log a reflection.
        </div>
      `
      );
      return;
    }

    // 4. Render Masonry Cards
    const expenses = this.#state.get('expenses') || [];
    const salaryConfig = this.#state.get('salaryConfig');

    const html = filtered
      .map(note => {
        let relationRibbon = 'ribbon-transaction';
        let relationIconName = 'banknote';
        let relationLabel = 'Linked Expense';
        let targetDisplay = note.relationId;

        if (note.relation === 'day') {
          relationRibbon = 'ribbon-day';
          relationIconName = 'calendar';
          relationLabel = 'Daily Reflection';
        } else if (note.relation === 'week') {
          relationRibbon = 'ribbon-week';
          relationIconName = 'bar-chart-2';
          relationLabel = 'Weekly Review';
        } else if (note.relation === 'month') {
          relationRibbon = 'ribbon-month';
          relationIconName = 'target';
          relationLabel = 'Monthly Goal';
        } else if (note.relation === 'transaction') {
          const matchedExp = expenses.find(e => e.id === note.relationId);
          if (matchedExp) {
            targetDisplay = `${matchedExp.title} (-${formatCurrency(parseFloat(matchedExp.amount) || 0, 2, salaryConfig)})`;
          }
        }

        const dateStr = note.createdAt
          ? new Date(note.createdAt).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })
          : '';

        const iconFn = typeof window !== 'undefined' && typeof window.icon === 'function' ? window.icon : () => '';

        return `
        <div class="note-masonry-card ${relationRibbon}">
          <div class="note-card-header-row">
            <span class="note-relation-tag" style="display: inline-flex; align-items: center; gap: 4px;">
              ${iconFn(relationIconName, 12)} ${relationLabel}
            </span>
            <span style="font-size: 11px; font-family: var(--font-mono); color: var(--text-muted);">${escapeHTML(targetDisplay)}</span>
          </div>

          <div class="note-card-body-text">"${escapeHTML(note.content)}"</div>

          <div class="note-card-footer-row">
            <span>${dateStr}</span>
            <div style="display: flex; gap: 6px;">
              <button type="button" class="btn-text-ghost" data-action="edit-note" data-note-id="${escapeHTML(note.id)}" title="Edit Note">
                ${iconFn('pencil', 12)}
              </button>
              <button type="button" class="btn-text-ghost" data-action="delete-note" data-note-id="${escapeHTML(note.id)}" title="Delete Note">
                ${iconFn('trash-2', 12)}
              </button>
            </div>
          </div>
        </div>
      `;
      })
      .join('');

    setInnerHTML(listContainer, html);
  }

  /**
   * Unmounts the view, tearing down event listeners and state subscriptions.
   *
   * @returns {void}
   */
  unmount() {
    this.#cleanupContainerEvents();
    this.#cleanupPillEvents();
    this.#cleanupModalEvents();

    for (const unsub of this.#unsubscribers) {
      unsub();
    }
    this.#unsubscribers = [];
  }

  // ==========================================================================
  //  Modal & Action Controllers
  // ==========================================================================

  /**
   * Opens the note creation modal with clean default inputs.
   *
   * @returns {void}
   */
  openAddModal() {
    const heading = document.getElementById('note-modal-heading');
    const idInput = document.getElementById('form-note-id');
    const relationInput = document.getElementById('form-note-relation');
    const contentInput = document.getElementById('form-note-content');
    const deleteBtn = document.getElementById('note-delete-btn');
    const modal = document.getElementById('note-modal');

    if (heading) heading.textContent = 'Create Contextual Note';
    if (idInput) idInput.value = '';
    if (relationInput) relationInput.value = 'day';
    if (contentInput) contentInput.value = '';
    if (deleteBtn) deleteBtn.classList.add('hidden');

    this.updateTargetInput('day', new Date().toISOString().split('T')[0]);
    if (modal) modal.classList.add('active');
  }

  /**
   * Opens note creation modal linked to a specific expense record.
   *
   * @param {string} expenseId - Expense unique ID
   * @param {string} [expenseTitle='Expense'] - Expense title label
   * @returns {void}
   */
  openForExpense(expenseId, expenseTitle = 'Expense') {
    const heading = document.getElementById('note-modal-heading');
    const idInput = document.getElementById('form-note-id');
    const relationInput = document.getElementById('form-note-relation');
    const contentInput = document.getElementById('form-note-content');
    const deleteBtn = document.getElementById('note-delete-btn');
    const modal = document.getElementById('note-modal');

    if (heading) heading.textContent = `Note for: ${expenseTitle || 'Expense'}`;
    if (idInput) idInput.value = '';
    if (relationInput) relationInput.value = 'transaction';
    if (contentInput) contentInput.value = '';
    if (deleteBtn) deleteBtn.classList.add('hidden');

    this.updateTargetInput('transaction', expenseId);
    if (modal) modal.classList.add('active');
  }

  /**
   * Opens the note editing modal populated with existing note details.
   *
   * @param {string} id - Note unique ID
   * @returns {void}
   */
  openEditModal(id) {
    const allNotes = this.#state.get('notes') || [];
    const note = allNotes.find(n => n.id === id);

    if (!note) {
      showToast('⚠️ Contextual note not found');
      return;
    }

    const heading = document.getElementById('note-modal-heading');
    const idInput = document.getElementById('form-note-id');
    const relationInput = document.getElementById('form-note-relation');
    const contentInput = document.getElementById('form-note-content');
    const deleteBtn = document.getElementById('note-delete-btn');
    const modal = document.getElementById('note-modal');

    if (heading) heading.textContent = 'Edit Contextual Note';
    if (idInput) idInput.value = note.id;
    if (relationInput) relationInput.value = note.relation;
    if (contentInput) contentInput.value = note.content;
    if (deleteBtn) deleteBtn.classList.remove('hidden');

    this.updateTargetInput(note.relation, note.relationId);
    if (modal) modal.classList.add('active');
  }

  /**
   * Closes the note modal dialog.
   *
   * @returns {void}
   */
  closeModal() {
    const modal = document.getElementById('note-modal');
    if (modal) modal.classList.remove('active');
  }

  /**
   * Dynamically renders the target input control based on selected relation type.
   *
   * @param {string} relation - 'transaction' | 'day' | 'week' | 'month'
   * @param {string} [defaultVal] - Optional default value to pre-fill
   * @returns {void}
   */
  updateTargetInput(relation, defaultVal) {
    const group = document.getElementById('form-note-target-group');
    if (!group) return;

    const today = new Date().toISOString().split('T')[0];
    const thisMonth = today.substring(0, 7);
    const now = new Date();
    const weekNum = Math.ceil(((now - new Date(now.getFullYear(), 0, 1)) / 86400000 + 1) / 7);
    const thisWeek = `${now.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;

    if (relation === 'transaction') {
      const expenses = this.#state.get('expenses') || [];
      const salaryConfig = this.#state.get('salaryConfig');

      const options = expenses
        .map(
          e => `
        <option value="${escapeHTML(e.id)}" ${defaultVal === e.id ? 'selected' : ''}>
          ${escapeHTML(e.title)} (-${formatCurrency(parseFloat(e.amount) || 0, 2, salaryConfig)}, ${e.date})
        </option>
      `
        )
        .join('');

      setInnerHTML(
        group,
        `
        <label>Select Linked Expense *</label>
        <select id="form-note-relation-id" required>
          ${options || '<option value="">No expenses available</option>'}
        </select>
      `
      );
    } else if (relation === 'day') {
      setInnerHTML(
        group,
        `
        <label>Select Date *</label>
        <input type="date" id="form-note-relation-id" value="${defaultVal || today}" required>
      `
      );
    } else if (relation === 'week') {
      setInnerHTML(
        group,
        `
        <label>Week Identifier (e.g. 2026-W34) *</label>
        <input type="text" id="form-note-relation-id" value="${defaultVal || thisWeek}" placeholder="YYYY-Www" required>
      `
      );
    } else if (relation === 'month') {
      setInnerHTML(
        group,
        `
        <label>Select Month *</label>
        <input type="month" id="form-note-relation-id" value="${defaultVal || thisMonth}" required>
      `
      );
    }
  }

  /**
   * Prompts user for confirmation and deletes a note.
   *
   * @param {string} id - Note unique ID
   * @returns {Promise<void>}
   */
  async confirmDelete(id) {
    if (confirm('Are you sure you want to delete this note?')) {
      const res = await this.#api.deleteNote(id);
      if (res && res.success) {
        showToast('Note deleted');
        await this.#refreshAppData();
        this.render();
      } else {
        showToast(res?.error || 'Failed to delete note', 'error');
      }
    }
  }

  // ==========================================================================
  //  Event Binding & Delegation
  // ==========================================================================

  #bindEvents() {
    const listContainer = document.getElementById('notes-list-container');

    // 1. Delegated click handlers on note masonry cards (zero inline onclick)
    if (listContainer) {
      this.#cleanupContainerEvents = delegateEvent(listContainer, {
        'edit-note': target => {
          const id = target.getAttribute('data-note-id');
          if (id) this.openEditModal(id);
        },
        'delete-note': target => {
          const id = target.getAttribute('data-note-id');
          if (id) this.confirmDelete(id);
        }
      });
    }

    // 2. Filter Pills delegation
    const pillsBar = document.querySelector('.notes-filter-pills-bar');
    if (pillsBar) {
      const pillListener = e => {
        const btn = e.target.closest('.notes-filter-pill');
        if (!btn) return;

        const rel = btn.getAttribute('data-relation') || 'ALL';
        this.#state.set('activeNoteRelation', rel);

        // Update active class on pills
        pillsBar.querySelectorAll('.notes-filter-pill').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');

        this.render();
      };

      pillsBar.addEventListener('click', pillListener);
      this.#cleanupPillEvents = () => pillsBar.removeEventListener('click', pillListener);
    }

    // 3. Search Input listener
    const searchInput = document.getElementById('notes-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', e => {
        this.#state.set('filterNotesSearch', e.target.value);
        this.render();
      });
    }

    // 4. Modal Triggers & Form submission
    const addBtn = document.getElementById('btn-open-add-note-modal');
    if (addBtn) {
      addBtn.addEventListener('click', () => this.openAddModal());
    }

    const closeBtn = document.getElementById('note-modal-close');
    if (closeBtn) closeBtn.addEventListener('click', () => this.closeModal());

    const cancelBtn = document.getElementById('note-cancel-btn');
    if (cancelBtn) cancelBtn.addEventListener('click', () => this.closeModal());

    const relationSelect = document.getElementById('form-note-relation');
    if (relationSelect) {
      relationSelect.addEventListener('change', e => {
        this.updateTargetInput(e.target.value);
      });
    }

    const form = document.getElementById('note-form');
    if (form) {
      form.addEventListener('submit', async e => {
        e.preventDefault();
        const id = document.getElementById('form-note-id')?.value;
        const relation = document.getElementById('form-note-relation')?.value;
        const relationId = document.getElementById('form-note-relation-id')?.value?.trim();
        const content = document.getElementById('form-note-content')?.value?.trim();

        if (!content) return;

        if (id) {
          await this.#api.updateNote({ id, content });
          showToast('Note updated!');
        } else {
          await this.#api.addNote({ content, relation, relationId });
          showToast('Contextual note created!');
        }

        this.closeModal();
        await this.#refreshAppData();
        this.render();
      });
    }

    const deleteBtn = document.getElementById('note-delete-btn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', async () => {
        const id = document.getElementById('form-note-id')?.value;
        if (id && confirm('Delete this note?')) {
          await this.#api.deleteNote(id);
          this.closeModal();
          showToast('Note deleted');
          await this.#refreshAppData();
          this.render();
        }
      });
    }
  }

  // ==========================================================================
  //  State Subscriptions & Helpers
  // ==========================================================================

  #subscribeToState() {
    this.#unsubscribers.push(
      this.#state.subscribe('notes', () => this.render()),
      this.#state.subscribe('activeNoteRelation', () => this.render())
    );
  }

  #updateCountBadges(allNotes) {
    const countAllEl = document.getElementById('notes-count-all');
    const countTxEl = document.getElementById('notes-count-transaction');
    const countDayEl = document.getElementById('notes-count-day');
    const countWeekEl = document.getElementById('notes-count-week');
    const countMonthEl = document.getElementById('notes-count-month');

    if (countAllEl) countAllEl.textContent = allNotes.length;
    if (countTxEl) countTxEl.textContent = allNotes.filter(n => n.relation === 'transaction').length;
    if (countDayEl) countDayEl.textContent = allNotes.filter(n => n.relation === 'day').length;
    if (countWeekEl) countWeekEl.textContent = allNotes.filter(n => n.relation === 'week').length;
    if (countMonthEl) countMonthEl.textContent = allNotes.filter(n => n.relation === 'month').length;
  }
}
