'use strict';

import { icon } from '../icons.js';
import { indexedDbQueue } from '../storage/indexedDbQueue.js';
import { mobileSettings } from '../storage/mobileSettings.js';

/**
 * @fileoverview QueueView — Unified Pending Offline Ingestion Gallery
 * Renders both staged camera receipts and offline quick-add transactions awaiting LAN sync.
 */
export class QueueView {
  constructor() {
    this.container = null;
    this.receipts = [];
    this.transactions = [];
  }

  mount(parentEl) {
    this.container = parentEl;
    this.render();
    this.bindEvents();
    this.loadDataAndRender();
    this.bindGlobalEvents();
  }

  async loadDataAndRender() {
    try {
      const [receipts, transactions] = await Promise.all([
        indexedDbQueue.getAllReceipts(),
        indexedDbQueue.getAllTransactions()
      ]);
      this.receipts = receipts || [];
      this.transactions = transactions || [];
    } catch {
      this.receipts = [];
      this.transactions = [];
    }
    this.render();
    this.bindEvents();
  }

  bindGlobalEvents() {
    window.addEventListener('ledgerly:queue-updated', () => {
      this.loadDataAndRender();
    });

    window.addEventListener('ledgerly:settings-updated', () => {
      this.render();
      this.bindEvents();
    });
  }

  render() {
    const rcptCount = this.receipts.length;
    const txCount = this.transactions.length;
    const totalCount = rcptCount + txCount;

    const rcptTotal = this.receipts.reduce((acc, r) => acc + (Number(r.draftAmount) || 0), 0);
    const txTotal = this.transactions.reduce((acc, t) => acc + (Number(t.amount) || 0), 0);
    const totalAmount = rcptTotal + txTotal;
    const formattedTotal = mobileSettings.formatCurrency(totalAmount);

    this.container.innerHTML = `
      <div class="mobile-card">
        <div class="mobile-card-header">
          <div class="mobile-card-title">${icon('receipt', 16)} Pending Offline Queue</div>
          <span style="font-family: var(--font-mono); font-size: 12px; color: var(--accent-primary); font-weight: 700;">
            ${totalCount} ${totalCount === 1 ? 'Item' : 'Items'} (${txCount} tx, ${rcptCount} rcpt)
          </span>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: baseline; margin-top: 6px;">
          <span style="font-size: 13px; color: var(--text-secondary);">Total Un-synced</span>
          <span style="font-family: var(--font-mono); font-size: 24px; font-weight: 700; color: #ffffff;" id="queue-total-amount">
            ${formattedTotal}
          </span>
        </div>
      </div>

      <div style="margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center;">
        <span style="font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-muted);">
          Staged Queue (${totalCount})
        </span>
        <span style="font-size: 11px; color: var(--accent-emerald); display: flex; align-items: center; gap: 4px;">
          ${icon('shield-check', 12)} Stored 100% Locally
        </span>
      </div>

      ${totalCount === 0 ? this.renderEmptyState() : this.renderUnifiedList()}

      ${totalCount > 0 ? `
        <div style="margin-top: 18px;">
          <button type="button" class="mobile-btn mobile-btn-primary" id="btn-trigger-queue-sync">
            ${icon('wifi', 16)} Sync ${totalCount} ${totalCount === 1 ? 'Item' : 'Items'} to Desktop
          </button>
        </div>
      ` : ''}
    `;
  }

  renderEmptyState() {
    return `
      <div class="mobile-card queue-empty-box">
        <div style="width: 48px; height: 48px; border-radius: 12px; background: var(--bg-surface-elevated); display: flex; align-items: center; justify-content: center; color: var(--text-muted); margin-bottom: 12px;">
          ${icon('receipt', 24)}
        </div>
        <div style="font-size: 14px; font-weight: 600; color: #ffffff; margin-bottom: 4px;">No Pending Items</div>
        <div style="font-size: 12px; color: var(--text-muted); max-width: 240px; margin-bottom: 16px;">
          Receipt photos and quick-add expenses are safely staged offline here until you sync with your desktop.
        </div>
        <div style="display: flex; gap: 8px;">
          <button type="button" class="mobile-btn mobile-btn-secondary" id="btn-empty-goto-capture" style="height: 38px; font-size: 12px; width: auto; padding: 0 14px;">
            ${icon('camera', 14)} Scan Receipt
          </button>
          <button type="button" class="mobile-btn mobile-btn-secondary" id="btn-empty-goto-quickadd" style="height: 38px; font-size: 12px; width: auto; padding: 0 14px;">
            ${icon('zap', 14)} Quick Add
          </button>
        </div>
      </div>
    `;
  }

  renderUnifiedList() {
    return `
      <div class="queue-list" style="display: flex; flex-direction: column; gap: 14px;">
        ${this.transactions.length > 0 ? this.renderTransactionSection() : ''}
        ${this.receipts.length > 0 ? this.renderReceiptSection() : ''}
      </div>
    `;
  }

  renderTransactionSection() {
    return `
      <div style="display: flex; flex-direction: column; gap: 8px;">
        <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: var(--accent-primary);">
          Offline Quick-Add Expenses (${this.transactions.length})
        </div>
        ${this.transactions.map(t => {
          const dateDisplay = this.formatDate(t.date || t.localCreatedAt);
          const hasError = t.syncStatus === 'error';
          const displayAmount = mobileSettings.formatCurrency(t.amount);

          return `
            <div class="mobile-card" style="padding: 10px 12px; margin-bottom: 0; display: flex; align-items: center; justify-content: space-between; gap: 10px; border-left: 3px solid ${hasError ? '#f87171' : 'var(--accent-primary)'};" data-tx-id="${t.id}">
              <div style="display: flex; align-items: center; gap: 10px; min-width: 0;">
                <div style="width: 36px; height: 36px; border-radius: 8px; background: rgba(229, 152, 102, 0.12); color: var(--accent-primary); display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                  ${icon('zap', 18)}
                </div>
                <div style="min-width: 0;">
                  <div style="font-size: 13px; font-weight: 600; color: #ffffff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                    ${t.title || t.category || 'Quick Expense'}
                  </div>
                  <div style="font-size: 11px; color: var(--text-muted);">
                    ${t.category} • ${dateDisplay}
                  </div>
                  ${hasError && t.lastError ? `
                    <div style="font-size: 10px; color: #f87171; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${t.lastError}">
                      Error: ${t.lastError}
                    </div>
                  ` : ''}
                </div>
              </div>

              <div style="display: flex; align-items: center; gap: 10px; flex-shrink: 0;">
                <div style="text-align: right;">
                  <div style="font-family: var(--font-mono); font-size: 14px; font-weight: 700; color: var(--accent-primary);">
                    ${displayAmount}
                  </div>
                  <div style="font-size: 10px; color: ${hasError ? '#f87171' : 'var(--accent-emerald)'}; font-weight: 600; text-transform: uppercase;">
                    ${hasError ? 'Sync Failed' : 'Ready to Sync'}
                  </div>
                </div>

                <button type="button" class="btn-delete-transaction" data-id="${t.id}" title="Remove Transaction" style="background: none; border: none; color: var(--text-muted); cursor: pointer; padding: 6px; border-radius: 6px; display: flex; align-items: center;">
                  ${icon('trash-2', 14)}
                </button>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  renderReceiptSection() {
    return `
      <div style="display: flex; flex-direction: column; gap: 8px;">
        <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: var(--accent-primary);">
          Staged Receipts (${this.receipts.length})
        </div>
        ${this.receipts.map(r => {
          const dateDisplay = this.formatDate(r.capturedAt);
          const sizeKb = r.fileSize ? `${Math.round(r.fileSize / 1024)} KB` : '';
          const hasDraftAmount = r.draftAmount !== null && r.draftAmount !== undefined;
          const displayAmount = hasDraftAmount ? mobileSettings.formatCurrency(r.draftAmount) : 'Pending OCR';
          const hasError = r.syncStatus === 'error';

          return `
            <div class="mobile-card" style="padding: 10px 12px; margin-bottom: 0; display: flex; align-items: center; justify-content: space-between; gap: 10px; border-left: 3px solid ${hasError ? '#f87171' : 'var(--accent-emerald)'};" data-receipt-id="${r.id}">
              <div style="display: flex; align-items: center; gap: 12px; min-width: 0;">
                ${r.imageData ? `
                  <img src="${r.imageData}" alt="Receipt thumbnail" class="queue-card-thumb" />
                ` : `
                  <div style="width: 48px; height: 48px; border-radius: 8px; background: var(--bg-surface-elevated); display: flex; align-items: center; justify-content: center; color: var(--accent-primary); flex-shrink: 0;">
                    ${icon('receipt', 20)}
                  </div>
                `}
                <div style="min-width: 0;">
                  <div style="font-size: 13px; font-weight: 600; color: #ffffff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                    ${r.draftMerchant || 'Receipt Scan'}
                  </div>
                  <div style="font-size: 11px; color: var(--text-muted);">
                    ${dateDisplay} ${sizeKb ? `• ${sizeKb}` : ''}
                  </div>
                  ${hasError && r.lastError ? `
                    <div style="font-size: 10px; color: #f87171; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${r.lastError}">
                      Error: ${r.lastError} (retry #${r.retryCount || 1})
                    </div>
                  ` : ''}
                </div>
              </div>

              <div style="display: flex; align-items: center; gap: 10px; flex-shrink: 0;">
                <div style="text-align: right;">
                  <div style="font-family: var(--font-mono); font-size: 14px; font-weight: 700; color: ${hasDraftAmount ? 'var(--accent-primary)' : 'var(--text-muted)'};">
                    ${displayAmount}
                  </div>
                  <div style="font-size: 10px; color: ${hasError ? '#f87171' : 'var(--accent-emerald)'}; font-weight: 600; text-transform: uppercase;">
                    ${hasError ? 'Retry Pending' : 'Ready to Sync'}
                  </div>
                </div>

                <button type="button" class="btn-delete-receipt" data-id="${r.id}" title="Remove Receipt" style="background: none; border: none; color: var(--text-muted); cursor: pointer; padding: 6px; border-radius: 6px; display: flex; align-items: center;">
                  ${icon('trash-2', 14)}
                </button>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  formatDate(isoStr) {
    if (!isoStr) return '';
    try {
      const d = new Date(isoStr);
      const now = new Date();
      const isToday = d.toDateString() === now.toDateString();
      const timeStr = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
      return isToday ? `Today, ${timeStr}` : `${d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}, ${timeStr}`;
    } catch {
      return '';
    }
  }

  bindEvents() {
    // Empty state buttons
    const emptyCaptureBtn = this.container.querySelector('#btn-empty-goto-capture');
    emptyCaptureBtn?.addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('ledgerly:switch-tab', { detail: { tab: 'capture' } }));
    });

    const emptyQuickBtn = this.container.querySelector('#btn-empty-goto-quickadd');
    emptyQuickBtn?.addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('ledgerly:switch-tab', { detail: { tab: 'quickadd' } }));
    });

    // Sync button -> switch to sync tab
    const syncBtn = this.container.querySelector('#btn-trigger-queue-sync');
    syncBtn?.addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('ledgerly:switch-tab', { detail: { tab: 'sync' } }));
    });

    // Delete receipt buttons
    const deleteRcptBtns = this.container.querySelectorAll('.btn-delete-receipt');
    deleteRcptBtns.forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-id');
        if (!id) return;
        if (confirm('Delete this receipt from offline queue?')) {
          if (navigator.vibrate) navigator.vibrate(15);
          await indexedDbQueue.deleteReceipt(id);
        }
      });
    });

    // Delete transaction buttons
    const deleteTxBtns = this.container.querySelectorAll('.btn-delete-transaction');
    deleteTxBtns.forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-id');
        if (!id) return;
        if (confirm('Delete this offline transaction from queue?')) {
          if (navigator.vibrate) navigator.vibrate(15);
          await indexedDbQueue.deleteTransaction(id);
        }
      });
    });
  }
}
