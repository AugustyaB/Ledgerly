/**
 * ============================================================================
 * Ledgerly Mobile — Native Camera Subsystem & Browser Fallback Service
 * ============================================================================
 *
 * @fileoverview
 * Cross-platform camera interface providing native Android/iOS camera capture via
 * @capacitor/camera with seamless fallback to HTML5 file capture inputs for web
 * previews and automated Playwright testing. Integrates client-side downscaling.
 */

'use strict';

import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { compressReceiptImage } from './imageCompressor.js';

class CameraService {
  constructor() {
    this.fallbackInput = null;
    this.initFallbackInput();
  }

  /**
   * Creates an invisible HTML5 file input for browser/test environments.
   * @private
   */
  initFallbackInput() {
    if (typeof document === 'undefined') return;

    let input = document.getElementById('ledgerly-camera-fallback-input');
    if (!input) {
      input = document.createElement('input');
      input.id = 'ledgerly-camera-fallback-input';
      input.type = 'file';
      input.accept = 'image/jpeg,image/png,image/webp';
      input.capture = 'environment';
      input.style.display = 'none';
      document.body.appendChild(input);
    }
    this.fallbackInput = input;
  }

  /**
   * Detects if native Capacitor Camera is available and supported.
   * @returns {boolean}
   */
  isNativeCameraAvailable() {
    try {
      if (typeof window !== 'undefined' && window.Capacitor) {
        return window.Capacitor.isPluginAvailable('Camera') && window.Capacitor.isNativePlatform();
      }
    } catch {
      // Ignore detection errors
    }
    return false;
  }

  /**
   * Captures a receipt photo using the native camera or browser fallback,
   * then applies client-side downscaling.
   *
   * @param {Object} [options]
   * @param {'camera'|'photos'|'prompt'} [options.source='camera']
   * @returns {Promise<{
   *   blob: Blob,
   *   dataUrl: string,
   *   mimeType: string,
   *   fileSize: number,
   *   width: number,
   *   height: number,
   *   capturedAt: string
   * }>}
   */
  async captureReceipt(options = {}) {
    const sourceMode = options.source || 'camera';

    if (this.isNativeCameraAvailable()) {
      try {
        const capSource = sourceMode === 'photos' ? CameraSource.Photos : CameraSource.Camera;
        const photo = await Camera.getPhoto({
          quality: 90,
          allowEditing: false,
          resultType: CameraResultType.Uri,
          source: capSource,
          correctOrientation: true,
          saveToGallery: false
        });

        const rawUrl = photo.webPath || photo.path;
        if (!rawUrl) {
          throw new Error('Native camera returned no valid photo URI.');
        }

        // Fetch the photo as a Blob to pass to downscaler
        const response = await fetch(rawUrl);
        const rawBlob = await response.blob();

        const compressed = await compressReceiptImage(rawBlob);
        return {
          ...compressed,
          capturedAt: new Date().toISOString()
        };
      } catch (err) {
        // If native camera is canceled by user, bubble cancel without falling back
        if (err.message && (err.message.includes('User cancelled') || err.message.includes('cancelled'))) {
          throw err;
        }
        console.warn('Native camera failed, falling back to file input:', err);
      }
    }

    // Fallback to HTML5 file input (Browser / Playwright testing)
    return this.captureViaFileInput(sourceMode);
  }

  /**
   * Captures image via HTML5 <input type="file">.
   * @private
   * @param {'camera'|'photos'} mode
   * @returns {Promise<Object>}
   */
  captureViaFileInput(mode = 'camera') {
    return new Promise((resolve, reject) => {
      if (!this.fallbackInput) {
        this.initFallbackInput();
      }

      const input = this.fallbackInput;
      if (!input) {
        return reject(new Error('HTML5 file input unavailable.'));
      }

      if (mode === 'camera') {
        input.setAttribute('capture', 'environment');
      } else {
        input.removeAttribute('capture');
      }

      // Reset value to ensure change event fires even for the same file
      input.value = '';

      const handleChange = async (e) => {
        cleanup();
        const file = e.target.files?.[0];
        if (!file) {
          return reject(new Error('User cancelled photo selection.'));
        }

        try {
          const compressed = await compressReceiptImage(file);
          resolve({
            ...compressed,
            capturedAt: new Date().toISOString()
          });
        } catch (compErr) {
          reject(compErr);
        }
      };

      const handleCancel = () => {
        cleanup();
        reject(new Error('User cancelled photo selection.'));
      };

      const cleanup = () => {
        input.removeEventListener('change', handleChange);
        input.removeEventListener('cancel', handleCancel);
        window.removeEventListener('focus', handleFocusCheck);
      };

      // Detect cancel in mobile browsers when focus returns without a change event
      const handleFocusCheck = () => {
        setTimeout(() => {
          if (!input.files || input.files.length === 0) {
            cleanup();
            reject(new Error('User cancelled photo selection.'));
          }
        }, 1000);
      };

      input.addEventListener('change', handleChange, { once: true });
      input.addEventListener('cancel', handleCancel, { once: true });
      window.addEventListener('focus', handleFocusCheck, { once: true });

      // Trigger file selector
      input.click();
    });
  }

  /**
   * Shortcut to choose photo from device photo gallery.
   * @returns {Promise<Object>}
   */
  async pickFromGallery() {
    return this.captureReceipt({ source: 'photos' });
  }
}

export const cameraService = new CameraService();
export default cameraService;
