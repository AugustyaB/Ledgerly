'use strict';

import { icon } from '../icons.js';
import { syncClient } from '../services/SyncClient.js';

/**
 * @fileoverview SyncView — Local-First Wi-Fi Pairing & Live Sync Status
 */
export class SyncView {
  constructor() {
    this.container = null;
    this.onPaired = () => this.render();
    this.onComplete = () => this.render();
    this.onUnpaired = () => this.render();
  }

  mount(parentEl) {
    this.container = parentEl;
    this.render();
    this.bindEvents();

    if (typeof window !== 'undefined') {
      window.addEventListener('ledgerly:sync-paired', this.onPaired);
      window.addEventListener('ledgerly:sync-complete', this.onComplete);
      window.addEventListener('ledgerly:sync-unpaired', this.onUnpaired);
    }
  }

  unmount() {
    if (typeof window !== 'undefined') {
      window.removeEventListener('ledgerly:sync-paired', this.onPaired);
      window.removeEventListener('ledgerly:sync-complete', this.onComplete);
      window.removeEventListener('ledgerly:sync-unpaired', this.onUnpaired);
    }
  }

  render() {
    if (!this.container) return;
    const info = syncClient.getPairedInfo();
    const isPaired = info.isPaired;

    this.container.innerHTML = `
      <div class="mobile-card">
        <div class="mobile-card-header">
          <div class="mobile-card-title">${icon('wifi', 16)} Local Wi-Fi Sync Engine</div>
          <span style="font-size: 11px; color: var(--accent-emerald); font-weight: 600; display: flex; align-items: center; gap: 4px;">
            ${icon('shield-check', 12)} 100% Offline LAN
          </span>
        </div>
        <p style="font-size: 13px; color: var(--text-secondary); margin-bottom: 14px;">
          Seamlessly sync receipts and expenses to your desktop Ledgerly over your home Wi-Fi with zero cloud transmission.
        </p>

        <div style="background: var(--bg-surface-elevated); border: 1px solid var(--border-color); border-radius: 12px; padding: 14px; margin-bottom: 14px;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
            <span style="font-size: 12px; color: var(--text-muted);">Paired Machine</span>
            <span style="font-size: 11px; font-weight: 600; color: ${isPaired ? 'var(--accent-emerald)' : 'var(--text-muted)'};">
              ${isPaired ? 'CONNECTED' : 'DISCONNECTED'}
            </span>
          </div>
          <div style="display: flex; align-items: center; gap: 10px;">
            <div style="width: 36px; height: 36px; border-radius: 8px; background: rgba(229, 152, 102, 0.12); color: var(--accent-primary); display: flex; align-items: center; justify-content: center;">
              ${icon('monitor', 18)}
            </div>
            <div>
              <div style="font-size: 13px; font-weight: 600; color: #ffffff;">
                ${isPaired ? `${info.machineName} (${info.host}:${info.port})` : 'No Desktop Paired'}
              </div>
              <div style="font-size: 11px; color: var(--text-muted);">
                ${isPaired ? `Last sync: ${info.lastSync}` : 'Pair with your computer on the same Wi-Fi'}
              </div>
            </div>
          </div>
        </div>

        ${
          isPaired
            ? `
          <button type="button" class="mobile-btn mobile-btn-primary" id="btn-start-wifi-sync">
            ${icon('refresh-cw', 16)} Sync Now to Desktop
          </button>
        `
            : `
          <button type="button" class="mobile-btn mobile-btn-primary" id="btn-open-pair-modal">
            ${icon('link', 16)} Pair with Desktop
          </button>
        `
        }
      </div>

      <div class="mobile-card">
        <div class="mobile-card-header">
          <div class="mobile-card-title">${icon('settings', 16)} Device Pairing</div>
        </div>
        <p style="font-size: 12px; color: var(--text-secondary); margin-bottom: 12px;">
          To pair with a new desktop or reset connection credentials, enter the 6-digit PIN shown on Ledgerly Desktop.
        </p>
        <div style="display: flex; gap: 8px;">
          <button type="button" class="mobile-btn mobile-btn-secondary" id="btn-manual-pair" style="height: 42px; font-size: 13px; flex: 1;">
            ${icon('key', 14)} Enter PIN / IP
          </button>
          ${
            isPaired
              ? `
            <button type="button" class="mobile-btn" id="btn-unpair-desktop" style="height: 42px; font-size: 13px; border: 1px solid rgba(239, 68, 68, 0.3); color: #f87171; background: transparent; padding: 0 14px;">
              ${icon('trash-2', 14)} Unpair
            </button>
          `
              : ''
          }
        </div>
      </div>

      <!-- Pairing Dialog / Modal Overlay -->
      <div id="pairing-modal-overlay" style="display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.75); z-index: 999; align-items: center; justify-content: center; padding: 20px;">
        <div style="background: var(--bg-surface-elevated); border: 1px solid var(--border-color); border-radius: 16px; padding: 20px; width: 100%; max-width: 360px;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px;">
            <h3 style="font-size: 15px; font-weight: 600; color: #ffffff; margin: 0;">Pair with Ledgerly Desktop</h3>
            <button type="button" id="btn-close-pair-modal" style="background: none; border: none; color: var(--text-muted); cursor: pointer;">✕</button>
          </div>
          <p style="font-size: 12px; color: var(--text-secondary); margin-bottom: 14px;">
            Enter the host LAN IP and 6-digit PIN displayed on your computer.
          </p>

          <label style="font-size: 11px; color: var(--text-muted); display: block; margin-bottom: 4px;">Desktop IP Address</label>
          <input type="text" id="input-pair-host" placeholder="e.g. 192.168.1.45" value="${info.host || ''}" style="width: 100%; height: 40px; background: rgba(0,0,0,0.3); border: 1px solid var(--border-color); border-radius: 8px; color: #fff; padding: 0 10px; font-size: 16px; margin-bottom: 12px; box-sizing: border-box;" />

          <label style="font-size: 11px; color: var(--text-muted); display: block; margin-bottom: 4px;">6-Digit Pairing PIN or QR Token</label>
          <input type="text" id="input-pair-pin" placeholder="e.g. 482910" style="width: 100%; height: 40px; background: rgba(0,0,0,0.3); border: 1px solid var(--border-color); border-radius: 8px; color: #fff; padding: 0 10px; font-size: 16px; letter-spacing: 2px; font-weight: 600; margin-bottom: 16px; box-sizing: border-box;" />

          <div id="pair-error-msg" style="display: none; font-size: 12px; color: #f87171; margin-bottom: 12px;"></div>

          <button type="button" class="mobile-btn mobile-btn-primary" id="btn-submit-pair" style="height: 42px; font-size: 14px;">
            Verify & Connect
          </button>
        </div>
      </div>
    `;

    this.bindEvents();
  }

  bindEvents() {
    if (!this.container) return;

    // Sync Button
    const syncBtn = this.container.querySelector('#btn-start-wifi-sync');
    syncBtn?.addEventListener('click', async () => {
      if (navigator.vibrate) navigator.vibrate(20);
      syncBtn.disabled = true;
      syncBtn.innerHTML = `${icon('refresh-cw', 16, 'spin')} Syncing Receipts...`;

      try {
        const res = await syncClient.syncNow();
        syncBtn.innerHTML = `${icon('check', 16)} Synced (${res.pushedCount} tx, ${res.uploadedReceipts} img)!`;
        setTimeout(() => {
          this.render();
        }, 2000);
      } catch (err) {
        syncBtn.innerHTML = `${icon('alert-circle', 16)} Sync Failed`;
        alert(`Sync Error: ${err.message}`);
        setTimeout(() => {
          this.render();
        }, 2500);
      }
    });

    // Open Modal
    const openModalBtn = this.container.querySelector('#btn-open-pair-modal');
    const manualPairBtn = this.container.querySelector('#btn-manual-pair');
    const modal = this.container.querySelector('#pairing-modal-overlay');
    const closeModalBtn = this.container.querySelector('#btn-close-pair-modal');

    const showModal = () => {
      if (modal) modal.style.display = 'flex';
    };
    const hideModal = () => {
      if (modal) modal.style.display = 'none';
    };

    openModalBtn?.addEventListener('click', showModal);
    manualPairBtn?.addEventListener('click', showModal);
    closeModalBtn?.addEventListener('click', hideModal);

    // Submit Pairing
    const submitBtn = this.container.querySelector('#btn-submit-pair');
    submitBtn?.addEventListener('click', async () => {
      const hostInput = this.container.querySelector('#input-pair-host');
      const pinInput = this.container.querySelector('#input-pair-pin');
      const errEl = this.container.querySelector('#pair-error-msg');

      const host = hostInput?.value?.trim();
      const pin = pinInput?.value?.trim();

      if (!host) {
        if (errEl) {
          errEl.textContent = 'Please enter Desktop IP address';
          errEl.style.display = 'block';
        }
        return;
      }
      if (!pin) {
        if (errEl) {
          errEl.textContent = 'Please enter 6-digit PIN';
          errEl.style.display = 'block';
        }
        return;
      }

      submitBtn.disabled = true;
      submitBtn.innerHTML = 'Connecting...';
      if (errEl) errEl.style.display = 'none';

      try {
        await syncClient.pairWithDesktop({ host, pin });
        hideModal();
        this.render();
      } catch (err) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = 'Verify & Connect';
        if (errEl) {
          errEl.textContent = err.message || 'Pairing failed';
          errEl.style.display = 'block';
        }
      }
    });

    // Unpair Button
    const unpairBtn = this.container.querySelector('#btn-unpair-desktop');
    unpairBtn?.addEventListener('click', async () => {
      if (confirm('Are you sure you want to disconnect from this desktop?')) {
        await syncClient.unpair();
        this.render();
      }
    });
  }
}
