/**
 * ============================================================================
 * Ledgerly Mobile — Native Camera Subsystem & Browser Fallback Service
 * ============================================================================
 *
 * @fileoverview
 * Cross-platform camera interface providing native Android/iOS camera capture via
 * @capacitor/camera with seamless fallback to HTML5 file capture inputs for web
 * previews and automated Playwright testing. Integrates client-side downscaling
 * and CV pre-processing pipeline (corner detection, 4-point warp, Sauvola binarization).
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
   * then applies client-side CV pre-processing and downscaling prior to saving drafts or OCR queue.
   *
   * @param {Object} [options]
   * @param {'camera'|'photos'|'prompt'} [options.source='camera']
   * @param {boolean} [options.preprocess=true] - Whether to apply CV pre-processing (contour, warp, binarization)
   * @param {Object} [options.cvOptions] - Options for the CV pipeline (autoWarp, binarize, targetLineHeight, etc.)
   * @returns {Promise<{
   *   blob: Blob,
   *   dataUrl: string,
   *   mimeType: string,
   *   fileSize: number,
   *   width: number,
   *   height: number,
   *   capturedAt: string,
   *   cvMetadata?: Object
   * }>}
   */
  async captureReceipt(options = {}) {
    const sourceMode = options.source || 'camera';
    const compressOptions = {
      preprocess: options.preprocess !== false,
      cvOptions: options.cvOptions || {},
      quality: options.quality || 0.82,
      maxDimension: options.maxDimension || 1600,
      mimeType: options.mimeType || 'image/jpeg'
    };

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

        // Fetch the photo as a Blob to pass to downscaler & CV pre-processor
        const response = await fetch(rawUrl);
        const rawBlob = await response.blob();

        const compressed = await compressReceiptImage(rawBlob, compressOptions);
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
    return this.captureViaFileInput({ source: sourceMode, ...compressOptions });
  }

  /**
   * Captures image via HTML5 <input type="file">.
   * @private
   * @param {'camera'|'photos'|Object} options
   * @returns {Promise<Object>}
   */
  captureViaFileInput(options = 'camera') {
    const mode = typeof options === 'string' ? options : (options.source || 'camera');
    const compressOptions = typeof options === 'object' ? options : {};

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
          const compressed = await compressReceiptImage(file, compressOptions);
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
   * Shortcut to choose photo from device photo gallery with CV pre-processing.
   * @param {Object} [options]
   * @returns {Promise<Object>}
   */
  async pickFromGallery(options = {}) {
    return this.captureReceipt({ source: 'photos', ...options });
  }

  /**
   * Directly pre-processes and enhances an existing receipt image source.
   *
   * @param {Blob|File|string} source
   * @param {Object} [options]
   * @returns {Promise<Object>}
   */
  async preprocessReceipt(source, options = {}) {
    return compressReceiptImage(source, {
      preprocess: true,
      ...options
    });
  }
}

export const cameraService = new CameraService();
export default cameraService;
