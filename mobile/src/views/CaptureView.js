'use strict';

import { icon } from '../icons.js';
import { cameraService } from '../camera/cameraService.js';
import { indexedDbQueue } from '../storage/indexedDbQueue.js';
import { mobileSettings } from '../storage/mobileSettings.js';

/**
 * @fileoverview CaptureView — Fullscreen Camera Viewfinder, Shutter HUD & Review Bottom Sheet
 */
export class CaptureView {
  constructor() {
    this.container = null;
    this.currentPendingCapture = null;
  }

  mount(parentEl) {
    this.container = parentEl;
    this.render();
    this.bindEvents();
  }

  render() {
    const currSymbol = mobileSettings.getCurrencySymbol();

    this.container.innerHTML = `
      <div class="camera-hud-container">
        <div class="camera-viewfinder-frame" id="camera-viewfinder">
          <div class="viewfinder-target">
            <div class="viewfinder-corner corner-tl"></div>
            <div class="viewfinder-corner corner-tr"></div>
            <div class="viewfinder-corner corner-bl"></div>
            <div class="viewfinder-corner corner-br"></div>
            <div style="color: var(--accent-primary); opacity: 0.85;">${icon('camera', 40)}</div>
            <div style="font-size: 13px; font-weight: 600; color: var(--text-secondary); text-align: center;">
              Frame Receipt or Bill<br/>
              <span style="font-size: 11px; color: var(--text-muted);">Auto-crops & downscales client-side</span>
            </div>
          </div>
        </div>

        <div class="mobile-card" style="margin-bottom: 0; width: 100%;">
          <div class="shutter-btn-wrap">
            <button type="button" class="shutter-btn" id="btn-shutter-trigger" title="Take Receipt Photo">
              <div class="shutter-inner-ring" id="shutter-ring"></div>
            </button>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 8px;">
            <button type="button" class="mobile-btn mobile-btn-secondary" style="height: 38px; font-size: 12px; width: 48%;" id="btn-choose-photo">
              ${icon('image', 14)} Choose Photo
            </button>
            <button type="button" class="mobile-btn mobile-btn-secondary" style="height: 38px; font-size: 12px; width: 48%;" id="btn-auto-torch">
              ${icon('zap', 14)} Auto Flash
            </button>
          </div>
        </div>
      </div>

      <!-- Post-Capture Review Bottom Sheet -->
      <div class="bottom-sheet-backdrop" id="review-sheet-backdrop">
        <div class="bottom-sheet-dialog" id="review-sheet-dialog" role="dialog" aria-modal="true" aria-label="Review Captured Receipt">
          <div class="bottom-sheet-handle"></div>
          
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
            <div style="font-size: 15px; font-weight: 700; color: #ffffff; display: flex; align-items: center; gap: 6px;">
              ${icon('receipt', 16)} Review Captured Receipt
            </div>
            <span style="font-size: 11px; color: var(--accent-emerald); font-weight: 600;">Client Compressed</span>
          </div>

          <div class="review-preview-box">
            <img class="review-preview-img" id="review-preview-img" alt="Captured receipt preview" src="" />
            <div class="review-badge-spec" id="review-badge-spec">0 KB</div>
          </div>

          <div class="review-input-group">
            <div class="review-input-label">Draft Total Amount (${currSymbol})</div>
            <input type="number" step="0.01" min="0" placeholder="0.00 (Optional - Key in or OCR)" class="review-input-field" id="review-input-amount" />
          </div>

          <div class="review-input-group">
            <div class="review-input-label">Merchant or Store Name</div>
            <input type="text" maxlength="100" placeholder="e.g. Starbucks, Metro Grocery (Optional)" class="review-input-field" id="review-input-merchant" />
          </div>

          <div class="review-actions-row">
            <button type="button" class="mobile-btn mobile-btn-secondary" id="btn-review-retake" style="flex: 1; height: 44px;">
              ${icon('refresh-cw', 14)} Retake
            </button>
            <button type="button" class="mobile-btn mobile-btn-primary" id="btn-review-save" style="flex: 2; height: 44px;">
              ${icon('check', 16)} Save to Queue
            </button>
          </div>
        </div>
      </div>
    `;
  }

  bindEvents() {
    const shutter = this.container.querySelector('#btn-shutter-trigger');
    const chooseBtn = this.container.querySelector('#btn-choose-photo');
    const torchBtn = this.container.querySelector('#btn-auto-torch');
    const backdrop = this.container.querySelector('#review-sheet-backdrop');
    const retakeBtn = this.container.querySelector('#btn-review-retake');
    const saveBtn = this.container.querySelector('#btn-review-save');

    // Trigger capture via Shutter
    shutter?.addEventListener('click', async () => {
      if (navigator.vibrate) navigator.vibrate(25);
      await this.handleCapture('camera');
    });

    // Trigger capture via Photo Picker
    chooseBtn?.addEventListener('click', async () => {
      if (navigator.vibrate) navigator.vibrate(15);
      await this.handleCapture('photos');
    });

    // Auto Flash toggle visual feedback
    let flashOn = false;
    torchBtn?.addEventListener('click', () => {
      flashOn = !flashOn;
      torchBtn.style.color = flashOn ? 'var(--accent-primary)' : '';
      torchBtn.innerHTML = flashOn ? `${icon('zap', 14)} Flash ON` : `${icon('zap', 14)} Auto Flash`;
      if (navigator.vibrate) navigator.vibrate(10);
    });

    // Retake action
    retakeBtn?.addEventListener('click', () => {
      this.closeReviewSheet();
    });

    // Close on backdrop outside tap
    backdrop?.addEventListener('click', (e) => {
      if (e.target === backdrop) {
        this.closeReviewSheet();
      }
    });

    // Save to Offline Queue
    saveBtn?.addEventListener('click', async () => {
      await this.savePendingReceipt();
    });

    // Handle currency updates
    window.addEventListener('ledgerly:settings-updated', () => {
      const label = this.container.querySelector('.review-input-label');
      if (label) {
        label.textContent = `Draft Total Amount (${mobileSettings.getCurrencySymbol()})`;
      }
    });
  }

  async handleCapture(mode = 'camera') {
    const ring = this.container.querySelector('#shutter-ring');
    if (ring) ring.style.transform = 'scale(0.85)';

    try {
      const result = await cameraService.captureReceipt({ source: mode });
      this.currentPendingCapture = result;
      this.openReviewSheet(result);
    } catch (err) {
      // Ignore user cancellations
      if (!err.message || (!err.message.includes('cancel') && !err.message.includes('cancelled'))) {
        alert(`Camera error: ${err.message}`);
      }
    } finally {
      if (ring) ring.style.transform = 'scale(1)';
    }
  }

  openReviewSheet(captureData) {
    const backdrop = this.container.querySelector('#review-sheet-backdrop');
    const previewImg = this.container.querySelector('#review-preview-img');
    const badgeSpec = this.container.querySelector('#review-badge-spec');
    const amountInput = this.container.querySelector('#review-input-amount');
    const merchantInput = this.container.querySelector('#review-input-merchant');

    if (previewImg) previewImg.src = captureData.dataUrl;
    if (badgeSpec) {
      const sizeKb = Math.round(captureData.fileSize / 1024);
      badgeSpec.textContent = `${sizeKb} KB • ${captureData.width}×${captureData.height}`;
    }
    if (amountInput) amountInput.value = '';
    if (merchantInput) merchantInput.value = '';

    backdrop?.classList.add('open');
  }

  closeReviewSheet() {
    const backdrop = this.container.querySelector('#review-sheet-backdrop');
    backdrop?.classList.remove('open');
    this.currentPendingCapture = null;
  }

  async savePendingReceipt() {
    if (!this.currentPendingCapture) return;

    const amountInput = this.container.querySelector('#review-input-amount');
    const merchantInput = this.container.querySelector('#review-input-merchant');
    const saveBtn = this.container.querySelector('#btn-review-save');

    const draftAmountVal = amountInput?.value ? parseFloat(amountInput.value) : null;
    const draftMerchantVal = merchantInput?.value?.trim() || null;

    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.innerHTML = `${icon('refresh-cw', 16, 'spin')} Storing...`;
    }

    try {
      const id = `rcq-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const item = {
        id,
        localUri: `indexeddb://receipts/${id}.jpg`,
        capturedAt: this.currentPendingCapture.capturedAt || new Date().toISOString(),
        fileSize: this.currentPendingCapture.fileSize,
        mimeType: this.currentPendingCapture.mimeType || 'image/jpeg',
        draftAmount: draftAmountVal,
        draftMerchant: draftMerchantVal,
        draftDate: new Date().toISOString().slice(0, 10),
        notes: 'Captured via Ledgerly Mobile Camera',
        syncStatus: 'queued',
        retryCount: 0,
        lastError: null,
        imageData: this.currentPendingCapture.dataUrl
      };

      await indexedDbQueue.enqueueReceipt(item);

      if (navigator.vibrate) navigator.vibrate([20, 50, 20]);
      this.closeReviewSheet();

      // Switch to Queue View
      window.dispatchEvent(new CustomEvent('ledgerly:switch-tab', { detail: { tab: 'queue' } }));
    } catch (err) {
      alert(`Failed to save receipt to offline queue: ${err.message}`);
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.innerHTML = `${icon('check', 16)} Save to Queue`;
      }
    }
  }
}
