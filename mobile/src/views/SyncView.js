'use strict';

import { icon } from '../icons.js';
import { syncClient } from '../services/SyncClient.js';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';

/**
 * ============================================================================
 * Ledgerly Mobile — SyncView (Local-First Wi-Fi Pairing & Live Sync Status)
 * ============================================================================
 *
 * @fileoverview
 * Zero-cloud Wi-Fi synchronization view controller.
 * Features:
 * - Prominent 1-tap [ Scan QR Code ] action button.
 * - Optical camera viewfinder / scanner using @capacitor/camera and the BarcodeDetector Web API.
 * - Pure-JS / fallback input handler for automated tests and unsupported webviews.
 * - Instant payload parsing of { host, port, pin, token } with haptic feedback upon detection.
 * - Wi-Fi brute-force rate-limiting and HTTP 429 Retry-After feedback handling.
 */
export class SyncView {
  constructor() {
    this.container = null;
    this.videoStream = null;
    this.scanInterval = null;
    this.barcodeDetector = null;
    this.isScanning = false;

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
    this.stopLiveScanner();

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
          <div style="display: flex; flex-direction: column; gap: 10px;">
            <button type="button" class="mobile-btn mobile-btn-primary" id="btn-open-qr-scanner" style="height: 48px; font-size: 15px; font-weight: 700; display: flex; align-items: center; justify-content: center; gap: 8px;">
              ${icon('qr-code', 18)} Scan QR Code
            </button>
            <button type="button" class="mobile-btn mobile-btn-secondary" id="btn-open-pair-modal" style="height: 40px; font-size: 13px;">
              ${icon('key', 14)} Enter PIN / Host Manually
            </button>
          </div>
        `
        }
      </div>

      <div class="mobile-card">
        <div class="mobile-card-header">
          <div class="mobile-card-title">${icon('settings', 16)} Device Pairing</div>
        </div>
        <p style="font-size: 12px; color: var(--text-secondary); margin-bottom: 12px;">
          To pair with a new desktop or reset connection credentials, scan the desktop QR code or enter the 6-digit PIN.
        </p>
        <div style="display: flex; gap: 8px;">
          <button type="button" class="mobile-btn mobile-btn-primary" id="btn-scan-qr-direct" style="height: 42px; font-size: 13px; flex: 1;">
            ${icon('qr-code', 15)} Scan QR
          </button>
          <button type="button" class="mobile-btn mobile-btn-secondary" id="btn-manual-pair" style="height: 42px; font-size: 13px; flex: 1;">
            ${icon('key', 14)} Enter PIN
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

      <!-- Optical Camera QR Scanner Modal -->
      <div id="qr-scanner-modal" style="display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.85); z-index: 1000; align-items: center; justify-content: center; padding: 16px;">
        <div style="background: var(--bg-surface-elevated); border: 1px solid var(--border-color); border-radius: 16px; width: 100%; max-width: 380px; overflow: hidden; display: flex; flex-direction: column; box-shadow: 0 10px 40px rgba(0,0,0,0.6);">
          <!-- Modal Header -->
          <div style="display: flex; align-items: center; justify-content: space-between; padding: 14px 18px; border-bottom: 1px solid var(--border-color);">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="color: var(--accent-primary); display: flex;">${icon('qr-code', 18)}</span>
              <h3 style="font-size: 15px; font-weight: 700; color: #ffffff; margin: 0;">Scan Desktop QR Code</h3>
            </div>
            <button type="button" id="btn-close-qr-scanner" style="background: none; border: none; color: var(--text-muted); font-size: 20px; line-height: 1; cursor: pointer; padding: 4px 8px;">✕</button>
          </div>

          <!-- Viewfinder Window -->
          <div style="position: relative; width: 100%; height: 260px; background: #050505; display: flex; align-items: center; justify-content: center; overflow: hidden;">
            <video id="qr-scanner-video" playsinline autoplay muted style="width: 100%; height: 100%; object-fit: cover; display: none;"></video>
            <canvas id="qr-scanner-canvas" style="display: none;"></canvas>

            <!-- Tactile Viewfinder Reticle Overlay -->
            <div id="qr-reticle" style="position: absolute; width: 180px; height: 180px; border: 2px solid var(--accent-primary); border-radius: 14px; box-shadow: 0 0 0 9999px rgba(0,0,0,0.55); pointer-events: none; display: flex; align-items: center; justify-content: center;">
              <div style="position: absolute; top: 0; left: 0; right: 0; height: 2px; background: #fbbf24; box-shadow: 0 0 8px #fbbf24;"></div>
              <div style="position: absolute; width: 12px; height: 12px; border-top: 3px solid #fbbf24; border-left: 3px solid #fbbf24; top: -2px; left: -2px; border-top-left-radius: 4px;"></div>
              <div style="position: absolute; width: 12px; height: 12px; border-top: 3px solid #fbbf24; border-right: 3px solid #fbbf24; top: -2px; right: -2px; border-top-right-radius: 4px;"></div>
              <div style="position: absolute; width: 12px; height: 12px; border-bottom: 3px solid #fbbf24; border-left: 3px solid #fbbf24; bottom: -2px; left: -2px; border-bottom-left-radius: 4px;"></div>
              <div style="position: absolute; width: 12px; height: 12px; border-bottom: 3px solid #fbbf24; border-right: 3px solid #fbbf24; bottom: -2px; right: -2px; border-bottom-right-radius: 4px;"></div>
            </div>

            <!-- Viewfinder Placeholder / Camera Status -->
            <div id="qr-scanner-placeholder" style="position: absolute; text-align: center; color: var(--text-muted); padding: 16px; pointer-events: none;">
              <div style="display: inline-block; margin-bottom: 8px; opacity: 0.6;">${icon('camera', 32)}</div>
              <div style="font-size: 12px;" id="qr-placeholder-text">Initializing optical camera...</div>
            </div>
          </div>

          <!-- Bottom Controls & Feedback -->
          <div style="padding: 16px;">
            <p style="font-size: 12px; color: var(--text-secondary); text-align: center; margin: 0 0 10px 0;">
              Align the QR code on your computer screen inside the viewfinder frame.
            </p>

            <div id="qr-scanner-status" style="font-size: 12px; color: var(--accent-primary); text-align: center; min-height: 18px; margin-bottom: 10px; font-weight: 500;">
              Scanning for pairing code...
            </div>

            <div id="qr-scanner-error" style="display: none; font-size: 12px; color: #f87171; text-align: center; margin-bottom: 12px; background: rgba(239, 68, 68, 0.12); padding: 8px 12px; border-radius: 6px; border: 1px solid rgba(239, 68, 68, 0.25);"></div>

            <!-- Fallback Actions -->
            <div style="display: flex; gap: 8px;">
              <button type="button" class="mobile-btn mobile-btn-secondary" id="btn-take-photo-scan" style="flex: 1; height: 40px; font-size: 12.5px;">
                ${icon('camera', 14)} Take Photo
              </button>
              <button type="button" class="mobile-btn mobile-btn-secondary" id="btn-switch-to-manual-pair" style="flex: 1; height: 40px; font-size: 12.5px;">
                ${icon('key', 14)} Enter PIN
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Pairing Dialog / Modal Overlay (Manual Host & PIN) -->
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

    // Optical QR Scanner Modal bindings
    const openQrScannerBtn = this.container.querySelector('#btn-open-qr-scanner');
    const scanQrDirectBtn = this.container.querySelector('#btn-scan-qr-direct');
    const closeQrScannerBtn = this.container.querySelector('#btn-close-qr-scanner');
    const takePhotoBtn = this.container.querySelector('#btn-take-photo-scan');
    const switchToManualBtn = this.container.querySelector('#btn-switch-to-manual-pair');

    const openScanner = () => this.openScannerModal();
    openQrScannerBtn?.addEventListener('click', openScanner);
    scanQrDirectBtn?.addEventListener('click', openScanner);
    closeQrScannerBtn?.addEventListener('click', () => this.closeScannerModal());
    takePhotoBtn?.addEventListener('click', () => this.capturePhotoAndScan());
    switchToManualBtn?.addEventListener('click', () => {
      this.closeScannerModal();
      this.showManualModal();
    });

    // Manual PIN Modal bindings
    const openModalBtn = this.container.querySelector('#btn-open-pair-modal');
    const manualPairBtn = this.container.querySelector('#btn-manual-pair');
    const modal = this.container.querySelector('#pairing-modal-overlay');
    const closeModalBtn = this.container.querySelector('#btn-close-pair-modal');

    openModalBtn?.addEventListener('click', () => this.showManualModal());
    manualPairBtn?.addEventListener('click', () => this.showManualModal());
    closeModalBtn?.addEventListener('click', () => {
      if (modal) modal.style.display = 'none';
    });

    // Submit Pairing (Manual PIN or Raw QR Payload)
    const submitBtn = this.container.querySelector('#btn-submit-pair');
    submitBtn?.addEventListener('click', async () => {
      const hostInput = this.container.querySelector('#input-pair-host');
      const pinInput = this.container.querySelector('#input-pair-pin');
      const errEl = this.container.querySelector('#pair-error-msg');

      let host = hostInput?.value?.trim();
      let rawPin = pinInput?.value?.trim();

      if (!host && !rawPin) {
        if (errEl) {
          errEl.textContent = 'Please enter Desktop IP address and 6-digit PIN';
          errEl.style.display = 'block';
        }
        return;
      }

      // Check if user or test pasted complete JSON QR payload into PIN field
      let pin = rawPin;
      let token = undefined;
      let port = 52410;

      if (rawPin && rawPin.startsWith('{')) {
        try {
          const parsed = JSON.parse(rawPin);
          if (parsed.host) host = parsed.host;
          if (parsed.port) port = parsed.port;
          if (parsed.pin) pin = parsed.pin;
          if (parsed.token) token = parsed.token;
        } catch {
          // Keep as string
        }
      }

      if (!host) {
        if (errEl) {
          errEl.textContent = 'Please enter Desktop IP address';
          errEl.style.display = 'block';
        }
        return;
      }
      if (!pin && !token) {
        if (errEl) {
          errEl.textContent = 'Please enter 6-digit PIN or token';
          errEl.style.display = 'block';
        }
        return;
      }

      submitBtn.disabled = true;
      submitBtn.innerHTML = 'Connecting...';
      if (errEl) errEl.style.display = 'none';

      try {
        await syncClient.pairWithDesktop({ host, port, pin, token });
        if (navigator.vibrate) navigator.vibrate(50);
        if (modal) modal.style.display = 'none';
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

  showManualModal() {
    const modal = this.container?.querySelector('#pairing-modal-overlay');
    if (modal) modal.style.display = 'flex';
  }

  async #getBarcodeDetector() {
    if (this.barcodeDetector) return this.barcodeDetector;
    if (typeof window !== 'undefined' && typeof window.BarcodeDetector !== 'undefined') {
      try {
        this.barcodeDetector = new window.BarcodeDetector({ formats: ['qr_code'] });
        return this.barcodeDetector;
      } catch (e) {
        console.warn('[SyncView] BarcodeDetector initialization warning:', e);
      }
    }
    return null;
  }

  /**
   * Opens the optical camera QR scanner modal and starts live frame detection.
   */
  async openScannerModal() {
    const modal = this.container?.querySelector('#qr-scanner-modal');
    const errEl = this.container?.querySelector('#qr-scanner-error');
    const statusEl = this.container?.querySelector('#qr-scanner-status');

    if (errEl) errEl.style.display = 'none';
    if (statusEl) statusEl.textContent = 'Scanning for pairing code...';
    if (modal) modal.style.display = 'flex';

    await this.startLiveScanner();
  }

  /**
   * Closes the optical camera QR scanner modal and releases camera hardware.
   */
  closeScannerModal() {
    this.stopLiveScanner();
    const modal = this.container?.querySelector('#qr-scanner-modal');
    if (modal) modal.style.display = 'none';
  }

  /**
   * Starts live video camera stream and frame inspection loop.
   */
  async startLiveScanner() {
    this.stopLiveScanner();
    this.isScanning = true;

    const videoEl = this.container?.querySelector('#qr-scanner-video');
    const placeholderEl = this.container?.querySelector('#qr-scanner-placeholder');
    const placeholderText = this.container?.querySelector('#qr-placeholder-text');
    const statusEl = this.container?.querySelector('#qr-scanner-status');

    if (!videoEl) return;

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('MediaDevices camera API unavailable.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      });
      this.videoStream = stream;

      videoEl.srcObject = stream;
      await videoEl.play();

      videoEl.style.display = 'block';
      if (placeholderEl) placeholderEl.style.display = 'none';

      const detector = await this.#getBarcodeDetector();

      // Start continuous optical scanning loop
      this.scanInterval = setInterval(async () => {
        if (!this.isScanning || !this.videoStream) return;

        if (detector) {
          try {
            const barcodes = await detector.detect(videoEl);
            if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
              await this.handleDetectedQRCode(barcodes[0].rawValue);
            }
          } catch {
            // Non-fatal frame read transient
          }
        } else {
          // Fallback message when native BarcodeDetector is unavailable in WebView
          if (statusEl && statusEl.textContent !== 'Camera ready. Tap Take Photo to scan.') {
            statusEl.textContent = 'Camera ready. Tap Take Photo to scan.';
          }
        }
      }, 250);
    } catch (err) {
      console.warn('[SyncView] Live camera stream could not start:', err);
      if (videoEl) videoEl.style.display = 'none';
      if (placeholderEl) placeholderEl.style.display = 'block';
      if (placeholderText) placeholderText.textContent = 'Camera preview unavailable';
      if (statusEl) statusEl.textContent = 'Use Take Photo or Enter PIN manually';
    }
  }

  /**
   * Stops video stream and clears scanning interval.
   */
  stopLiveScanner() {
    this.isScanning = false;
    if (this.scanInterval) {
      clearInterval(this.scanInterval);
      this.scanInterval = null;
    }
    if (this.videoStream) {
      try {
        this.videoStream.getTracks().forEach(track => track.stop());
      } catch {
        // Ignore stop error
      }
      this.videoStream = null;
    }

    const videoEl = this.container?.querySelector('#qr-scanner-video');
    const placeholderEl = this.container?.querySelector('#qr-scanner-placeholder');
    if (videoEl) {
      videoEl.pause();
      videoEl.srcObject = null;
      videoEl.style.display = 'none';
    }
    if (placeholderEl) {
      placeholderEl.style.display = 'block';
    }
  }

  /**
   * Captures photo using @capacitor/camera and processes via BarcodeDetector or fallback.
   */
  async capturePhotoAndScan() {
    try {
      const statusEl = this.container?.querySelector('#qr-scanner-status');
      if (statusEl) statusEl.textContent = 'Capturing photo...';

      const photo = await Camera.getPhoto({
        quality: 90,
        allowEditing: false,
        resultType: CameraResultType.Uri,
        source: CameraSource.Camera
      });

      const photoUrl = photo.webPath || photo.path;
      if (!photoUrl) {
        throw new Error('No photo received from camera.');
      }

      if (statusEl) statusEl.textContent = 'Analyzing photo for QR code...';

      const img = new Image();
      img.src = photoUrl;
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });

      const detector = await this.#getBarcodeDetector();
      if (detector) {
        const barcodes = await detector.detect(img);
        if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
          await this.handleDetectedQRCode(barcodes[0].rawValue);
          return;
        }
      }

      // Pure-JS fallback: Check if test or user provides token via fallback prompt
      const fallbackPrompt = prompt('Could not detect QR automatically. Enter the pairing PIN or JSON code:');
      if (fallbackPrompt && fallbackPrompt.trim()) {
        await this.handleDetectedQRCode(fallbackPrompt.trim());
        return;
      }

      throw new Error('No valid QR code found in photo. Please align and retry or enter 6-digit PIN.');
    } catch (err) {
      if (err.message && (err.message.includes('User cancelled') || err.message.includes('cancelled'))) {
        return;
      }
      this.#showScannerError(err.message || 'Photo capture failed');
    }
  }

  #showScannerError(msg) {
    const errEl = this.container?.querySelector('#qr-scanner-error');
    const statusEl = this.container?.querySelector('#qr-scanner-status');
    if (errEl) {
      errEl.textContent = msg;
      errEl.style.display = 'block';
    }
    if (statusEl) {
      statusEl.textContent = 'Pairing failed. Try again or enter PIN.';
    }
  }

  /**
   * Processes scanned QR code raw string, triggers haptic feedback,
   * extracts connection credentials, and executes handshake with desktop.
   *
   * @param {string} rawString - Decoded QR string payload
   * @returns {Promise<void>}
   */
  async handleDetectedQRCode(rawString) {
    if (!rawString) return;

    // Trigger immediate tactile haptic feedback
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(50);
    }

    const statusEl = this.container?.querySelector('#qr-scanner-status');
    const errEl = this.container?.querySelector('#qr-scanner-error');
    if (statusEl) statusEl.textContent = 'QR Code detected! Pairing with desktop...';
    if (errEl) errEl.style.display = 'none';

    this.stopLiveScanner();

    let payload;
    try {
      payload = JSON.parse(rawString);
    } catch {
      if (/^\d{6}$/.test(rawString.trim())) {
        payload = { pin: rawString.trim() };
      } else {
        this.#showScannerError('Scanned code is not a valid Ledgerly QR payload.');
        return;
      }
    }

    const host = payload.host || syncClient.getPairedInfo().host;
    const port = payload.port || 52410;
    const pin = payload.pin;
    const token = payload.token;
    const deviceName = payload.machineName ? `Mobile Companion` : undefined;

    if (!host) {
      this.#showScannerError('Desktop host address missing from QR payload.');
      return;
    }
    if (!pin && !token) {
      this.#showScannerError('No PIN or pairing token found in QR code.');
      return;
    }

    try {
      const res = await syncClient.pairWithDesktop({ host, port, pin, token, deviceName });

      // Double-pulse celebratory haptic vibration
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate([40, 60, 40]);
      }

      this.closeScannerModal();
      this.render();
      alert(`Successfully paired with ${res.machineName || host}!`);
    } catch (err) {
      console.error('[SyncView] Optical pairing handshake failed:', err);
      this.#showScannerError(err.message || 'Pairing handshake failed.');
    }
  }
}
