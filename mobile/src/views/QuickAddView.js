'use strict';

import { icon } from '../icons.js';
import { mobileSettings } from '../storage/mobileSettings.js';
import { indexedDbQueue } from '../storage/indexedDbQueue.js';

/**
 * @fileoverview QuickAddView — Tactile Numpad & Instant Category Logging with Dynamic Currency
 */
export class QuickAddView {
  constructor() {
    this.container = null;
    this.amountStr = '0';
    this.selectedCategory = 'Food & Dining';
  }

  mount(parentEl) {
    this.container = parentEl;
    this.render();
    this.bindEvents();
  }

  render() {
    const categories = ['Food & Dining', 'Groceries', 'Transportation', 'Household & Bills', 'Personal'];
    const currSymbol = mobileSettings.getCurrencySymbol();

    this.container.innerHTML = `
      <div class="mobile-card" style="margin-bottom: 12px; padding: 12px 16px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="font-size: 13px; font-weight: 600; color: var(--text-secondary); display: flex; align-items: center; gap: 6px;">
            ${icon('zap', 14)} Quick Offline Add
          </span>
          <span style="font-size: 11px; color: var(--accent-primary); font-weight: 600;">One-Tap Log</span>
        </div>
      </div>

      <div class="amount-display-box">
        <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px;">Expense Amount</div>
        <div class="amount-display-val" id="numpad-amount-val">${currSymbol}${this.formatDisplayAmount(this.amountStr)}</div>
      </div>

      <div class="category-chips-row" id="quick-category-row">
        ${categories.map(cat => `
          <button type="button" class="cat-chip ${cat === this.selectedCategory ? 'active' : ''}" data-cat="${cat}">
            ${cat}
          </button>
        `).join('')}
      </div>

      <div class="mobile-card" style="padding: 12px; margin-bottom: 0;">
        <div class="numpad-grid" id="numpad-grid">
          <button type="button" class="numpad-key" data-key="1">1</button>
          <button type="button" class="numpad-key" data-key="2">2</button>
          <button type="button" class="numpad-key" data-key="3">3</button>
          <button type="button" class="numpad-key" data-key="4">4</button>
          <button type="button" class="numpad-key" data-key="5">5</button>
          <button type="button" class="numpad-key" data-key="6">6</button>
          <button type="button" class="numpad-key" data-key="7">7</button>
          <button type="button" class="numpad-key" data-key="8">8</button>
          <button type="button" class="numpad-key" data-key="9">9</button>
          <button type="button" class="numpad-key" data-key=".">.</button>
          <button type="button" class="numpad-key" data-key="0">0</button>
          <button type="button" class="numpad-key" data-key="DEL" style="color: var(--accent-rose); font-size: 15px;">DEL</button>
        </div>

        <div style="margin-top: 14px;">
          <button type="button" class="mobile-btn mobile-btn-primary" id="btn-submit-quick-expense">
            ${icon('check', 16)} Record Expense
          </button>
        </div>
      </div>
    `;
  }

  formatDisplayAmount(str) {
    if (!str || str === '0') return '0.00';
    if (!str.includes('.')) return `${str}.00`;
    const parts = str.split('.');
    return `${parts[0]}.${parts[1].padEnd(2, '0').slice(0, 2)}`;
  }

  bindEvents() {
    const keys = this.container.querySelectorAll('.numpad-key');
    const display = this.container.querySelector('#numpad-amount-val');

    keys.forEach(k => {
      k.addEventListener('click', () => {
        if (navigator.vibrate) navigator.vibrate(10);
        const val = k.getAttribute('data-key');
        if (val === 'DEL') {
          this.amountStr = this.amountStr.length > 1 ? this.amountStr.slice(0, -1) : '0';
        } else if (val === '.') {
          if (!this.amountStr.includes('.')) this.amountStr += '.';
        } else {
          this.amountStr = this.amountStr === '0' ? val : this.amountStr + val;
        }
        const currSymbol = mobileSettings.getCurrencySymbol();
        if (display) display.textContent = `${currSymbol}${this.formatDisplayAmount(this.amountStr)}`;
      });
    });

    const catChips = this.container.querySelectorAll('.cat-chip');
    catChips.forEach(c => {
      c.addEventListener('click', () => {
        if (navigator.vibrate) navigator.vibrate(10);
        catChips.forEach(chip => chip.classList.remove('active'));
        c.classList.add('active');
        this.selectedCategory = c.getAttribute('data-cat');
      });
    });

    const submitBtn = this.container.querySelector('#btn-submit-quick-expense');
    submitBtn?.addEventListener('click', async () => {
      const num = parseFloat(this.amountStr);
      if (!num || num <= 0 || isNaN(num)) {
        if (navigator.vibrate) navigator.vibrate([10, 50, 10]);
        if (display) {
          display.textContent = 'Enter Amount > 0';
          display.style.color = '#f87171';
          setTimeout(() => {
            const currSymbol = mobileSettings.getCurrencySymbol();
            display.textContent = `${currSymbol}${this.formatDisplayAmount(this.amountStr)}`;
            display.style.color = '';
          }, 1500);
        }
        return;
      }

      submitBtn.disabled = true;
      submitBtn.innerHTML = `${icon('refresh-cw', 16, 'spin')} Recording...`;

      try {
        const id = `exp-mob-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const tx = {
          id,
          title: this.selectedCategory,
          amount: num,
          category: this.selectedCategory,
          paymentMethod: 'UPI / GPay',
          date: new Date().toISOString().slice(0, 10),
          originNodeId: mobileSettings.getNodeId(),
          version: 1,
          updatedAt: new Date().toISOString(),
          deletedAt: null,
          syncStatus: 'pending',
          localCreatedAt: new Date().toISOString()
        };

        await indexedDbQueue.enqueueTransaction(tx);

        if (navigator.vibrate) navigator.vibrate(30);
        this.amountStr = '0';
        const currSymbol = mobileSettings.getCurrencySymbol();
        if (display) display.textContent = `${currSymbol}0.00`;

        window.dispatchEvent(new CustomEvent('ledgerly:switch-tab', { detail: { tab: 'queue' } }));
      } catch (err) {
        alert(`Failed to record offline expense: ${err.message}`);
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = `${icon('check', 16)} Record Expense`;
      }
    });

    window.addEventListener('ledgerly:settings-updated', () => {
      const currSymbol = mobileSettings.getCurrencySymbol();
      if (display) display.textContent = `${currSymbol}${this.formatDisplayAmount(this.amountStr)}`;
    });
  }
}
