/**
 * LEDGERLY — HOUSEHOLD VIEW COMPONENT
 * 
 * Component orchestrating the Household Split & Settlements Center.
 * Handles pairwise debt settlement streams, recurring utility bills,
 * member roster management, and repayment transaction audit trails.
 *
 * Architecture:
 * - Pure ES Module (import / export)
 * - Zero inline event handlers (100% delegated via data-action)
 * - Complete JSDoc contracts matching src/types.js
 * - Non-browser/SSR defensive guards for headless testing
 *
 * @module src/ui/views/HouseholdView
 */

// ============================================================================
// EXTERNAL DEPENDENCIES & HELPERS
// ============================================================================

import { escapeHTML, delegateEvent } from '../helpers/dom.js';
import { formatCurrency, currSym } from '../helpers/formatters.js';
import { showToast } from '../helpers/toast.js';

// ============================================================================
// SAFE ICON & MONOGRAM HELPERS
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

/**
 * Headless-safe monogram renderer.
 * @param {string} name - Entity or member name
 * @param {number} [size=32] - Pixel diameter
 * @param {string} [colorOverride] - Optional hex color
 * @returns {string} Monogram HTML
 */
function safeMonogram(name, size = 32, colorOverride) {
  if (typeof renderMonogram === 'function') {
    return renderMonogram(name, size, colorOverride);
  }
  const initial = (name || '?').trim().charAt(0).toUpperCase();
  return `<div class="monogram-fallback" style="width:${size}px;height:${size}px;border-radius:50%;background:#38BDF8;color:#0F172A;display:inline-flex;align-items:center;justify-content:center;font-weight:700;font-size:${Math.round(size * 0.45)}px;">${escapeHTML(initial)}</div>`;
}

// ============================================================================
// MAIN HOUSEHOLD VIEW CLASS
// ============================================================================

export class HouseholdView {
  /**
   * Container element reference.
   * @type {HTMLElement|null}
   */
  container = null;

  /**
   * Reactive state store reference.
   * @type {import('../AppState').AppState|null}
   */
  state = null;

  /**
   * IPC API bridge reference.
   * @type {any}
   */
  api = null;

  /**
   * Data refresh callback.
   * @type {(() => Promise<void>)|null}
   */
  onDataChanged = null;

  /**
   * Cleanup functions for unmounting.
   * @type {Array<() => void>}
   * @private
   */
  #cleanups = [];

  /**
   * Cached settlement computation.
   * @type {any}
   * @private
   */
  #currentSettlement = null;

  /**
   * Cached recurring bills.
   * @type {Array<any>}
   * @private
   */
  #recurringBills = [];

  /**
   * Cached settlements history.
   * @type {Array<any>}
   * @private
   */
  #settlementsHistory = [];

  /**
   * Construct HouseholdView with state, API bridge, and data reload hook.
   * @param {Object} options
   * @param {import('../AppState').AppState} options.state - AppState instance
   * @param {any} [options.api] - electronAPI bridge
   * @param {() => Promise<void>} [options.onDataChanged] - Mutation refresh hook
   */
  constructor(options = {}) {
    this.state = options.state || null;
    this.api = options.api || (typeof window !== 'undefined' ? window.electronAPI : null);
    this.onDataChanged = options.onDataChanged || null;
  }

  // ==========================================================================
  // LIFECYCLE HOOKS
  // ==========================================================================

  /**
   * Mount the view into the DOM and bind event listeners.
   * @param {HTMLElement} containerEl - Root view container (#view-household)
   */
  mount(containerEl) {
    this.container = containerEl;
    if (!this.container || typeof document === 'undefined') return;

    this.#bindDelegatedEvents();
    this.#bindModalForms();
  }

  /**
   * Unmount the view and detach all event listeners.
   */
  unmount() {
    this.#cleanups.forEach((cleanup) => {
      try {
        cleanup();
      } catch (err) {
        console.warn('HouseholdView cleanup error:', err);
      }
    });
    this.#cleanups = [];
    this.container = null;
  }

  /**
   * Render or re-render the complete Household Workspace.
   * @returns {Promise<void>}
   */
  async render() {
    if (!this.api) return;

    // Fetch live household settlement data and history from services
    try {
      this.#currentSettlement = (await this.api.getHouseholdSettlement()) || {};
      this.#settlementsHistory = (await this.api.getSettlements()) || [];
      this.#recurringBills = (await this.api.getRecurringBills()) || [];

      // Sync into AppState if available
      if (this.state) {
        this.state.set('settlements', this.#settlementsHistory);
        this.state.set('recurringBills', this.#recurringBills);
      }
    } catch (err) {
      console.error('Failed to load household data:', err);
      return;
    }

    // Render individual UI sections
    this.renderMetricCards();
    this.renderSettlementStreams();
    this.renderRecurringBills();
    this.renderSettlementHistory();
    this.renderMemberListTags();
  }

  // ==========================================================================
  // SECTION RENDERERS
  // ==========================================================================

  /**
   * Render top row executive household metric cards.
   */
  renderMetricCards() {
    if (typeof document === 'undefined') return;

    const settlement = this.#currentSettlement || {};

    // 1. Total Shared Outflow
    const totalSharedEl = document.getElementById('household-total-shared');
    if (totalSharedEl) {
      totalSharedEl.textContent = formatCurrency(settlement.totalSharedAmount || 0);
    }

    // 2. Shared Expenses Count
    const sharedCountEl = document.getElementById('household-shared-count');
    if (sharedCountEl) {
      sharedCountEl.textContent = `${settlement.sharedExpensesCount || 0} shared records logged`;
    }

    // 3. Active Members Count & Names
    const memberCountEl = document.getElementById('household-member-count');
    if (memberCountEl) {
      memberCountEl.textContent = `${(settlement.members || []).length} Active`;
    }

    const memberListStrEl = document.getElementById('household-member-list-str');
    if (memberListStrEl) {
      memberListStrEl.textContent = (settlement.members || []).join(', ');
    }

    // 4. User Net Position Card
    const activeProfile = this.state ? this.state.get('activeProfile') : null;
    const activeName = activeProfile ? activeProfile.name : 'Self';
    const userNet = settlement.balances ? (settlement.balances[activeName] || 0) : 0;

    const userNetEl = document.getElementById('household-user-net-position');
    const userNetSubEl = document.getElementById('household-net-position-sub');
    const userNetIconBox = document.getElementById('household-net-icon-box');

    if (userNetEl) {
      if (userNet > 0.01) {
        userNetEl.innerHTML = `<span style="color: #10B981; font-weight: 800; font-size: 19px;">YOU ARE OWED ${formatCurrency(userNet)}</span>`;
        if (userNetSubEl) userNetSubEl.textContent = 'Household members will reimburse you';
        if (userNetIconBox) {
          userNetIconBox.className = 'metric-icon-box icon-emerald';
          userNetIconBox.innerHTML = safeIcon('trending-up', 18);
        }
      } else if (userNet < -0.01) {
        userNetEl.innerHTML = `<span style="color: #FB7185; font-weight: 800; font-size: 19px;">YOU OWE ${formatCurrency(Math.abs(userNet))}</span>`;
        if (userNetSubEl) userNetSubEl.textContent = 'You have outstanding debts to settle';
        if (userNetIconBox) {
          userNetIconBox.className = 'metric-icon-box icon-rose';
          userNetIconBox.innerHTML = safeIcon('trending-down', 18);
        }
      } else {
        userNetEl.innerHTML = `<span style="color: #38BDF8; font-weight: 800; font-size: 19px;">SETTLED & BALANCED</span>`;
        if (userNetSubEl) userNetSubEl.textContent = `All household debts are balanced (${currSym()}0.00)`;
        if (userNetIconBox) {
          userNetIconBox.className = 'metric-icon-box icon-blue';
          userNetIconBox.innerHTML = safeIcon('scale', 18);
        }
      }
    }
  }

  /**
   * Render pairwise settlement streams ("Who Owes Whom").
   */
  renderSettlementStreams() {
    if (typeof document === 'undefined') return;

    const streamsContainer = document.getElementById('settlement-matrix-container');
    if (!streamsContainer) return;

    const settlements = this.#currentSettlement?.settlements || [];

    if (settlements.length === 0) {
      streamsContainer.innerHTML = `
        <div style="grid-column: 1 / -1; background: #14151B; padding: 28px; border-radius: 12px; text-align: center; color: var(--text-muted); font-size: 13.5px; border: 1px dashed #2D303C;">
          <div style="display: inline-flex; align-items: center; gap: 8px;">
            ${safeIcon('check-circle', 18)} <strong>All shared expenses are fully settled!</strong> No pending member-to-member debts.
          </div>
        </div>
      `;
      return;
    }

    streamsContainer.innerHTML = settlements.map((s) => `
      <div class="settlement-stream-card">
        <div class="stream-flow-visual">
          <div class="stream-person-node">
            <div class="stream-avatar-box">${safeMonogram(s.from, 36)}</div>
            <span class="stream-person-name">${escapeHTML(s.from)}</span>
          </div>

          <div class="stream-flow-track">
            <span class="stream-amount-tag">${formatCurrency(s.amount)}</span>
            <div class="stream-arrow-line"></div>
            <span style="font-size: 10.5px; color: var(--text-muted);">Direct Repayment</span>
          </div>

          <div class="stream-person-node">
            <div class="stream-avatar-box">${safeMonogram(s.to, 36)}</div>
            <span class="stream-person-name">${escapeHTML(s.to)}</span>
          </div>
        </div>

        <div class="stream-actions-row">
          <span class="stream-status-sub">Pending debt</span>
          <button type="button" class="btn btn-primary btn-sm"
                  data-action="open-settle"
                  data-from="${escapeHTML(s.from)}"
                  data-to="${escapeHTML(s.to)}"
                  data-amount="${s.amount}">
            ${safeIcon('credit-card', 13)} Settle Up
          </button>
        </div>
      </div>
    `).join('');
  }

  /**
   * Render recurring utilities cards with countdown badges.
   */
  renderRecurringBills() {
    if (typeof document === 'undefined') return;

    const billsContainer = document.getElementById('recurring-bills-container');
    if (!billsContainer) return;

    const bills = this.#recurringBills || [];
    if (bills.length === 0) {
      billsContainer.innerHTML = `
        <div style="grid-column: 1 / -1; background: #14151B; padding: 24px; border-radius: 12px; text-align: center; color: var(--text-muted); font-size: 13px; border: 1px dashed #2D303C;">
          No recurring utilities configured. Click "+ Add Recurring Bill" to track electricity, broadband, rent, or subscriptions.
        </div>
      `;
      return;
    }

    const today = new Date();
    const currentDay = today.getDate();

    billsContainer.innerHTML = bills.map((b) => {
      const daysDiff = b.dueDay - currentDay;
      let statusClass = 'status-due-soon';
      let statusStyle = 'background: rgba(56, 189, 248, 0.15); color: #38BDF8; border: 1px solid rgba(56, 189, 248, 0.3);';
      let statusText = `Due in ${daysDiff} days`;

      if (b.lastPaidDate && b.lastPaidDate.startsWith(today.toISOString().substring(0, 7))) {
        statusClass = 'status-paid';
        statusStyle = 'background: rgba(16, 185, 129, 0.15); color: #10B981; border: 1px solid rgba(16, 185, 129, 0.3);';
        statusText = `${safeIcon('check', 12)} Paid for Month`;
      } else if (daysDiff < 0) {
        statusClass = 'status-overdue';
        statusStyle = 'background: rgba(225, 29, 72, 0.2); color: #FB7185; border: 1px solid rgba(225, 29, 72, 0.4);';
        statusText = `${safeIcon('alert-triangle', 12)} Overdue by ${Math.abs(daysDiff)}d`;
      } else if (daysDiff === 0) {
        statusClass = 'status-due-today';
        statusStyle = 'background: rgba(225, 29, 72, 0.25); color: #FB7185; border: 1px solid rgba(225, 29, 72, 0.5); font-weight: 800;';
        statusText = `${safeIcon('alert-triangle', 12)} Due Today`;
      } else if (daysDiff <= 3) {
        statusClass = 'status-due-soon';
        statusStyle = 'background: rgba(217, 130, 43, 0.2); color: #E5943C; border: 1px solid rgba(217, 130, 43, 0.4); font-weight: 700;';
        statusText = `${safeIcon('zap', 12)} Due in ${daysDiff} days`;
      }

      return `
        <div class="utility-card">
          <div class="utility-card-header">
            <div class="utility-icon-title">
              <div class="utility-icon-box">${safeIcon(b.icon || 'zap', 18)}</div>
              <div class="utility-title-text">${escapeHTML(b.title)}</div>
            </div>
            <button type="button" class="btn-text-ghost" data-action="edit-bill" data-id="${escapeHTML(b.id)}" title="Edit Utility Bill">
              ${safeIcon('pencil', 13)}
            </button>
          </div>

          <div class="utility-amount-row">
            <span class="utility-amount-val">${formatCurrency(parseFloat(b.amount) || 0)}</span>
            <span class="utility-freq-sub">Due on ${b.dueDay}th</span>
          </div>

          <div class="utility-status-pill ${statusClass}" style="${statusStyle}">
            ${statusText}
          </div>

          <div class="utility-card-footer">
            <span style="font-size: 11px; color: var(--text-muted);">Payer: ${escapeHTML(b.paidBy || 'Self')}</span>
            <button type="button" class="btn btn-secondary btn-sm" data-action="pay-bill" data-id="${escapeHTML(b.id)}">
              ${safeIcon('zap', 13)} Pay & Split
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  /**
   * Render the audit trail table of recorded repayments.
   */
  renderSettlementHistory() {
    if (typeof document === 'undefined') return;

    const historyTbody = document.getElementById('settlement-history-tbody');
    if (!historyTbody) return;

    const settlements = this.#settlementsHistory || [];

    if (settlements.length === 0) {
      historyTbody.innerHTML = `
        <tr>
          <td colspan="8" style="text-align: center; color: var(--text-muted); padding: 30px; font-size: 13px;">
            No repayment settlements recorded yet. Use the "Settle Up" button on any pending balance to record a repayment.
          </td>
        </tr>
      `;
      return;
    }

    historyTbody.innerHTML = settlements.map((s) => `
      <tr>
        <td style="font-family: var(--font-mono); font-size: 12px; color: var(--text-muted);">${escapeHTML(s.date)}</td>
        <td><strong style="color: var(--text-main); font-size: 13px;">${escapeHTML(s.from)}</strong></td>
        <td style="color: var(--accent-primary); font-weight: 700; text-align: center;">➔</td>
        <td><strong style="color: var(--text-main); font-size: 13px;">${escapeHTML(s.to)}</strong></td>
        <td class="amount-text" style="color: var(--accent-emerald);">+${formatCurrency(parseFloat(s.amount) || 0)}</td>
        <td><span class="settlement-method-pill">${escapeHTML(s.paymentMethod || 'UPI')}</span></td>
        <td style="font-size: 12px; color: var(--text-muted);">${escapeHTML(s.notes || '—')}</td>
        <td>
          <button type="button" class="action-btn delete-btn" data-action="delete-settlement" data-id="${escapeHTML(s.id)}" title="Delete settlement record">
            ${safeIcon('trash-2', 13)}
          </button>
        </td>
      </tr>
    `).join('');
  }

  /**
   * Render member tag chips in the Manage Members modal.
   */
  renderMemberListTags() {
    if (typeof document === 'undefined') return;

    const memberTags = document.getElementById('member-list-tags');
    if (!memberTags) return;

    const members = this.getMergedMemberList();
    memberTags.innerHTML = members.map((m) => `
      <span class="member-tag-chip">
        <span style="display: inline-flex; align-items: center; gap: 4px;">${safeIcon('user', 12)} ${escapeHTML(m)}</span>
        ${m !== 'Self' ? `<span class="member-tag-remove" data-action="delete-member" data-name="${escapeHTML(m)}">✕</span>` : ''}
      </span>
    `).join('');
  }

  // ==========================================================================
  // MODAL MANAGEMENT & HELPERS
  // ==========================================================================

  /**
   * Produce a unified, unique list of all active household members and profiles.
   * @param {string[]} [extraNames=[]] - Additional names to ensure presence
   * @returns {string[]} Unique member names
   */
  getMergedMemberList(extraNames = []) {
    const set = new Set();

    const householdMembers = this.state?.get('householdMembers') || [];
    householdMembers.forEach((m) => set.add(m));

    const profiles = this.state?.get('profiles') || [];
    profiles.forEach((p) => {
      if (p.name) set.add(p.name);
    });

    extraNames.forEach((n) => {
      if (n) set.add(n);
    });

    if (set.size === 0) set.add('Self');
    return Array.from(set);
  }

  /**
   * Open Settle-Up modal pre-populated with debt parameters.
   * @param {string} from - Payer member name
   * @param {string} to - Recipient member name
   * @param {number|string} defaultAmount - Pending balance amount
   */
  openSettleModal(from, to, defaultAmount) {
    if (typeof document === 'undefined') return;

    const fromSelect = document.getElementById('settle-from-select');
    const toSelect = document.getElementById('settle-to-select');
    const amountInput = /** @type {HTMLInputElement} */ (document.getElementById('settle-amount-input'));
    const dateInput = /** @type {HTMLInputElement} */ (document.getElementById('settle-date-input'));
    const notesInput = /** @type {HTMLInputElement} */ (document.getElementById('settle-notes-input'));

    const members = this.getMergedMemberList([from, to]);

    if (fromSelect) {
      fromSelect.innerHTML = members.map((m) => `<option value="${escapeHTML(m)}">${escapeHTML(m)}</option>`).join('');
      if (from) fromSelect.value = from;
    }
    if (toSelect) {
      toSelect.innerHTML = members.map((m) => `<option value="${escapeHTML(m)}">${escapeHTML(m)}</option>`).join('');
      if (to) toSelect.value = to;
    }
    if (amountInput) {
      amountInput.value = defaultAmount ? parseFloat(defaultAmount).toFixed(2) : '';
    }
    if (dateInput) {
      dateInput.value = new Date().toISOString().split('T')[0];
    }
    if (notesInput) {
      notesInput.value = `Repayment settlement (${from} ➔ ${to})`;
    }

    document.getElementById('settle-modal')?.classList.add('active');
  }

  /**
   * Close Settle-Up modal.
   */
  closeSettleModal() {
    if (typeof document === 'undefined') return;
    document.getElementById('settle-modal')?.classList.remove('active');
  }

  /**
   * Open Add Recurring Bill modal.
   */
  openAddRecurringBillModal() {
    if (typeof document === 'undefined') return;

    const heading = document.getElementById('recurring-bill-modal-heading');
    if (heading) heading.textContent = 'Add Recurring Utility Bill';

    const idInput = /** @type {HTMLInputElement} */ (document.getElementById('recurring-bill-id'));
    const titleInput = /** @type {HTMLInputElement} */ (document.getElementById('recurring-bill-title'));
    const iconInput = /** @type {HTMLInputElement} */ (document.getElementById('recurring-bill-icon'));
    const amountInput = /** @type {HTMLInputElement} */ (document.getElementById('recurring-bill-amount'));
    const dueDayInput = /** @type {HTMLInputElement} */ (document.getElementById('recurring-bill-dueday'));
    const deleteBtn = document.getElementById('recurring-bill-delete-btn');

    if (idInput) idInput.value = '';
    if (titleInput) titleInput.value = '';
    if (iconInput) iconInput.value = 'zap';
    if (amountInput) amountInput.value = '';
    if (dueDayInput) dueDayInput.value = '10';
    if (deleteBtn) deleteBtn.classList.add('hidden');

    const catSelect = /** @type {HTMLSelectElement} */ (document.getElementById('recurring-bill-category'));
    if (catSelect) {
      const categories = this.state?.get('categories') || ['Utilities', 'Rent', 'Broadband'];
      catSelect.innerHTML = categories.map((c) => `<option value="${escapeHTML(c)}">${escapeHTML(c)}</option>`).join('');
      catSelect.value = 'Utilities';
    }

    const payerSelect = /** @type {HTMLSelectElement} */ (document.getElementById('recurring-bill-paidby'));
    if (payerSelect) {
      const members = this.getMergedMemberList();
      payerSelect.innerHTML = members.map((m) => `<option value="${escapeHTML(m)}">${escapeHTML(m)}</option>`).join('');
      const activeProfile = this.state?.get('activeProfile');
      payerSelect.value = activeProfile ? activeProfile.name : (members[0] || 'Self');
    }

    document.getElementById('recurring-bill-modal')?.classList.add('active');
  }

  /**
   * Open Edit Recurring Bill modal populated with bill details.
   * @param {string} id - Recurring bill ID
   */
  openEditRecurringBillModal(id) {
    if (typeof document === 'undefined') return;

    const bill = (this.#recurringBills || []).find((b) => b.id === id);
    if (!bill) {
      showToast('⚠️ Recurring utility bill not found');
      return;
    }

    const heading = document.getElementById('recurring-bill-modal-heading');
    if (heading) heading.textContent = 'Edit Recurring Utility Bill';

    const idInput = /** @type {HTMLInputElement} */ (document.getElementById('recurring-bill-id'));
    const titleInput = /** @type {HTMLInputElement} */ (document.getElementById('recurring-bill-title'));
    const iconInput = /** @type {HTMLInputElement} */ (document.getElementById('recurring-bill-icon'));
    const amountInput = /** @type {HTMLInputElement} */ (document.getElementById('recurring-bill-amount'));
    const dueDayInput = /** @type {HTMLInputElement} */ (document.getElementById('recurring-bill-dueday'));
    const freqInput = /** @type {HTMLSelectElement} */ (document.getElementById('recurring-bill-frequency'));
    const deleteBtn = document.getElementById('recurring-bill-delete-btn');

    if (idInput) idInput.value = bill.id;
    if (titleInput) titleInput.value = bill.title;
    if (iconInput) iconInput.value = bill.icon || 'zap';
    if (amountInput) amountInput.value = bill.amount;
    if (dueDayInput) dueDayInput.value = String(bill.dueDay || 10);
    if (freqInput) freqInput.value = bill.frequency || 'monthly';
    if (deleteBtn) deleteBtn.classList.remove('hidden');

    const catSelect = /** @type {HTMLSelectElement} */ (document.getElementById('recurring-bill-category'));
    if (catSelect) {
      const categories = this.state?.get('categories') || ['Utilities', 'Rent'];
      catSelect.innerHTML = categories.map((c) => `<option value="${escapeHTML(c)}">${escapeHTML(c)}</option>`).join('');
      catSelect.value = bill.category || 'Utilities';
    }

    const payerSelect = /** @type {HTMLSelectElement} */ (document.getElementById('recurring-bill-paidby'));
    if (payerSelect) {
      const members = this.getMergedMemberList([bill.paidBy]);
      payerSelect.innerHTML = members.map((m) => `<option value="${escapeHTML(m)}">${escapeHTML(m)}</option>`).join('');
      payerSelect.value = bill.paidBy || members[0] || 'Self';
    }

    document.getElementById('recurring-bill-modal')?.classList.add('active');
  }

  /**
   * Close Recurring Bill modal.
   */
  closeRecurringBillModal() {
    if (typeof document === 'undefined') return;
    document.getElementById('recurring-bill-modal')?.classList.remove('active');
  }

  /**
   * Open Manage Members modal.
   */
  openMemberModal() {
    if (typeof document === 'undefined') return;
    this.renderMemberListTags();
    document.getElementById('member-modal')?.classList.add('active');
  }

  /**
   * Close Manage Members modal.
   */
  closeMemberModal() {
    if (typeof document === 'undefined') return;
    document.getElementById('member-modal')?.classList.remove('active');
  }

  // ==========================================================================
  // ACTION HANDLERS
  // ==========================================================================

  /**
   * Process and split recurring bill payment.
   * @param {string} id - Recurring bill ID
   */
  async payRecurringBill(id) {
    const bill = (this.#recurringBills || []).find((b) => b.id === id);
    if (!bill) {
      showToast('⚠️ Recurring utility bill not found');
      return;
    }

    if (typeof confirm === 'function' && !confirm(`Mark "${bill.title}" (${formatCurrency(bill.amount)}) as paid for this cycle and split with household?`)) {
      return;
    }

    const activeProfile = this.state?.get('activeProfile');
    const res = await this.api.markRecurringBillPaid(id, {
      paymentMethod: 'UPI / GPay',
      paidBy: activeProfile ? activeProfile.name : 'Self'
    });

    if (res?.success) {
      showToast(`Logged and split ${bill.title}!`);
      if (this.onDataChanged) await this.onDataChanged();
      await this.render();
    } else {
      showToast(res?.error || 'Failed to process recurring payment');
    }
  }

  /**
   * Delete settlement audit record.
   * @param {string} id - Settlement ID
   */
  async deleteSettlement(id) {
    if (typeof confirm === 'function' && !confirm('Delete this recorded repayment settlement?')) {
      return;
    }

    const res = await this.api.deleteSettlement(id);
    if (res?.success) {
      showToast('Settlement record removed');
      if (this.onDataChanged) await this.onDataChanged();
      await this.render();
    } else {
      showToast(res?.error || 'Failed to delete settlement record');
    }
  }

  /**
   * Remove a member from the household roster.
   * @param {string} name - Member name
   */
  async removeMember(name) {
    if (name === 'Self') return;
    if (typeof confirm === 'function' && !confirm(`Remove "${name}" from household roster?`)) {
      return;
    }

    const res = await this.api.deleteHouseholdMember(name);
    if (res?.success) {
      showToast(`Removed ${name} from household`);
      if (res.householdMembers && this.state) {
        this.state.set('householdMembers', res.householdMembers);
      }
      if (this.onDataChanged) await this.onDataChanged();
      await this.render();
    } else {
      showToast(res?.error || 'Failed to remove member');
    }
  }

  // ==========================================================================
  // EVENT BINDINGS (ZERO INLINE ONCLICK)
  // ==========================================================================

  /**
   * Bind delegated click actions for settlement streams, utilities, and audit trail.
   * @private
   */
  #bindDelegatedEvents() {
    // Delegated actions on view container
    const unbindContainer = delegateEvent(this.container, 'click', '[data-action]', async (event, target) => {
      const action = target.getAttribute('data-action');
      if (!action) return;

      switch (action) {
        case 'open-settle': {
          const from = target.getAttribute('data-from') || '';
          const to = target.getAttribute('data-to') || '';
          const amount = target.getAttribute('data-amount') || '';
          this.openSettleModal(from, to, amount);
          break;
        }

        case 'edit-bill': {
          const id = target.getAttribute('data-id');
          if (id) this.openEditRecurringBillModal(id);
          break;
        }

        case 'pay-bill': {
          const id = target.getAttribute('data-id');
          if (id) await this.payRecurringBill(id);
          break;
        }

        case 'delete-settlement': {
          const id = target.getAttribute('data-id');
          if (id) await this.deleteSettlement(id);
          break;
        }

        default:
          break;
      }
    });
    this.#cleanups.push(unbindContainer);

    // Member tags removal delegated action inside member modal
    const memberModal = document.getElementById('member-modal');
    if (memberModal) {
      const unbindMemberModal = delegateEvent(memberModal, 'click', '[data-action="delete-member"]', async (event, target) => {
        const name = target.getAttribute('data-name');
        if (name) await this.removeMember(name);
      });
      this.#cleanups.push(unbindMemberModal);
    }

    // Static toolbar button bindings
    const bindBtn = (id, handler) => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('click', handler);
        this.#cleanups.push(() => el.removeEventListener('click', handler));
      }
    };

    bindBtn('btn-open-manage-members-hub', () => this.openMemberModal());
    bindBtn('btn-manage-members', () => this.openMemberModal());
    bindBtn('btn-open-add-recurring-bill', () => this.openAddRecurringBillModal());
  }

  /**
   * Bind form submissions and modal close buttons.
   * @private
   */
  #bindModalForms() {
    const bindEl = (id, event, handler) => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener(event, handler);
        this.#cleanups.push(() => el.removeEventListener(event, handler));
      }
    };

    // --- Settle-Up Modal ---
    bindEl('settle-modal-close', 'click', () => this.closeSettleModal());
    bindEl('settle-cancel-btn', 'click', () => this.closeSettleModal());

    bindEl('settle-form', 'submit', async (e) => {
      e.preventDefault();
      const from = /** @type {HTMLSelectElement} */ (document.getElementById('settle-from-select'))?.value;
      const to = /** @type {HTMLSelectElement} */ (document.getElementById('settle-to-select'))?.value;
      const amount = parseFloat(/** @type {HTMLInputElement} */ (document.getElementById('settle-amount-input'))?.value) || 0;
      const paymentMethod = /** @type {HTMLSelectElement} */ (document.getElementById('settle-method-select'))?.value;
      const date = /** @type {HTMLInputElement} */ (document.getElementById('settle-date-input'))?.value;
      const notes = /** @type {HTMLInputElement} */ (document.getElementById('settle-notes-input'))?.value.trim() || '';

      if (from === to) {
        showToast('⚠️ Payer and Recipient must be different members.');
        return;
      }

      if (amount <= 0) {
        showToast('⚠️ Please enter a valid positive settlement amount.');
        return;
      }

      const res = await this.api.addSettlement({ from, to, amount, paymentMethod, date, notes });
      if (res?.success) {
        this.closeSettleModal();
        showToast(`Recorded repayment: ${formatCurrency(amount)} from ${from} to ${to}!`);
        if (this.onDataChanged) await this.onDataChanged();
        await this.render();
      } else {
        showToast(res?.error || 'Failed to record settlement');
      }
    });

    // --- Recurring Bill Modal ---
    bindEl('recurring-bill-modal-close', 'click', () => this.closeRecurringBillModal());
    bindEl('recurring-bill-cancel-btn', 'click', () => this.closeRecurringBillModal());

    bindEl('recurring-bill-form', 'submit', async (e) => {
      e.preventDefault();
      const id = /** @type {HTMLInputElement} */ (document.getElementById('recurring-bill-id'))?.value;
      const billData = {
        title: /** @type {HTMLInputElement} */ (document.getElementById('recurring-bill-title'))?.value.trim() || '',
        icon: /** @type {HTMLInputElement} */ (document.getElementById('recurring-bill-icon'))?.value.trim() || 'zap',
        amount: parseFloat(/** @type {HTMLInputElement} */ (document.getElementById('recurring-bill-amount'))?.value) || 0,
        dueDay: parseInt(/** @type {HTMLInputElement} */ (document.getElementById('recurring-bill-dueday'))?.value, 10) || 10,
        category: /** @type {HTMLSelectElement} */ (document.getElementById('recurring-bill-category'))?.value || 'Utilities',
        paidBy: /** @type {HTMLSelectElement} */ (document.getElementById('recurring-bill-paidby'))?.value || 'Self',
        frequency: /** @type {HTMLSelectElement} */ (document.getElementById('recurring-bill-frequency'))?.value || 'monthly'
      };
      if (id) billData.id = id;

      const res = await this.api.saveRecurringBill(billData);
      if (res?.success !== false) {
        this.closeRecurringBillModal();
        showToast(`Saved recurring bill "${billData.title}"!`);
        if (this.onDataChanged) await this.onDataChanged();
        await this.render();
      } else {
        showToast(res?.error || 'Failed to save recurring bill');
      }
    });

    bindEl('recurring-bill-delete-btn', 'click', async () => {
      const id = /** @type {HTMLInputElement} */ (document.getElementById('recurring-bill-id'))?.value;
      if (id && (typeof confirm !== 'function' || confirm('Delete this recurring utility bill?'))) {
        const res = await this.api.deleteRecurringBill(id);
        if (res?.success !== false) {
          this.closeRecurringBillModal();
          showToast('Recurring bill deleted');
          if (this.onDataChanged) await this.onDataChanged();
          await this.render();
        } else {
          showToast(res?.error || 'Failed to delete recurring bill');
        }
      }
    });

    // --- Member Modal ---
    bindEl('member-modal-close', 'click', () => this.closeMemberModal());
    bindEl('member-close-btn', 'click', () => this.closeMemberModal());

    bindEl('add-member-form', 'submit', async (e) => {
      e.preventDefault();
      const input = /** @type {HTMLInputElement} */ (document.getElementById('new-member-name'));
      const name = input ? input.value.trim() : '';
      if (!name) return;

      const res = await this.api.addHouseholdMember(name);
      if (res?.success) {
        if (input) input.value = '';
        if (res.householdMembers && this.state) {
          this.state.set('householdMembers', res.householdMembers);
        }
        showToast(`Added ${name} to household!`);
        if (this.onDataChanged) await this.onDataChanged();
        this.renderMemberListTags();
        await this.render();
      } else {
        showToast(res?.error || 'Failed to add member');
      }
    });
  }
}
