/**
 * ============================================================================
 * Ledgerly Mobile — High-Performance Client-Side Image Preprocessor
 * ============================================================================
 *
 * @fileoverview
 * Zero-dependency HTML5 Canvas image downscaler and compressor.
 * Downscales multi-MB camera photos client-side to maximum 1600px dimensions
 * (~200KB–400KB JPEG/WebP) before writing to IndexedDB or transmitting over LAN.
 * Preserves crisp text contrast required for local OCR bill scanning.
 */

'use strict';

/**
 * Calculates aspect-ratio preserving dimensions capped at maxDimension.
 * Pure math function suitable for headless testing.
 *
 * @param {number} origWidth
 * @param {number} origHeight
 * @param {number} [maxDimension=1600]
 * @returns {{ width: number, height: number, scaled: boolean }}
 */
export function calculateScaledDimensions(origWidth, origHeight, maxDimension = 1600) {
  if (!origWidth || !origHeight || origWidth <= 0 || origHeight <= 0) {
    return { width: 0, height: 0, scaled: false };
  }

  if (origWidth <= maxDimension && origHeight <= maxDimension) {
    return { width: Math.round(origWidth), height: Math.round(origHeight), scaled: false };
  }

  let width;
  let height;

  if (origWidth >= origHeight) {
    height = Math.round((origHeight * maxDimension) / origWidth);
    width = maxDimension;
  } else {
    width = Math.round((origWidth * maxDimension) / origHeight);
    height = maxDimension;
  }

  return { width, height, scaled: true };
}

/**
 * Loads an image from a source (Blob, File, or URL string) into an HTMLImageElement.
 *
 * @param {Blob|File|string} source
 * @returns {Promise<{ img: HTMLImageElement, cleanup: () => void }>}
 */
function loadImage(source) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    let url = '';
    let isObjectUrl = false;

    if (typeof source === 'string') {
      url = source;
    } else if (source instanceof Blob || source instanceof File) {
      url = URL.createObjectURL(source);
      isObjectUrl = true;
    } else {
      return reject(new Error('Unsupported image source type.'));
    }

    const cleanup = () => {
      if (isObjectUrl && url) {
        URL.revokeObjectURL(url);
      }
    };

    img.onload = () => resolve({ img, cleanup });
    img.onerror = () => {
      cleanup();
      reject(new Error('Failed to load image into memory for processing.'));
    };

    img.src = url;
  });
}

/**
 * Compresses and downscales a receipt photo.
 *
 * @param {Blob|File|string} source - Input photo source.
 * @param {Object} [options]
 * @param {number} [options.maxDimension=1600] - Maximum width or height in pixels.
 * @param {number} [options.quality=0.82] - Compression quality (0.0 to 1.0).
 * @param {string} [options.mimeType='image/jpeg'] - Output image MIME type.
 * @returns {Promise<{
 *   blob: Blob,
 *   dataUrl: string,
 *   mimeType: string,
 *   fileSize: number,
 *   width: number,
 *   height: number,
 *   originalWidth: number,
 *   originalHeight: number
 * }>}
 */
export async function compressReceiptImage(source, options = {}) {
  const {
    maxDimension = 1600,
    quality = 0.82,
    mimeType = 'image/jpeg'
  } = options;

  const { img, cleanup } = await loadImage(source);

  try {
    const origWidth = img.naturalWidth || img.width;
    const origHeight = img.naturalHeight || img.height;

    if (!origWidth || !origHeight) {
      throw new Error('Image has zero dimensions.');
    }

    const { width, height } = calculateScaledDimensions(origWidth, origHeight, maxDimension);

    // Create offscreen canvas for downscaling
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to obtain 2D rendering context for image downscaling.');
    }

    // Apply high-quality bicubic image smoothing
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // Draw downscaled image
    ctx.drawImage(img, 0, 0, width, height);

    // Convert to Data URL
    const dataUrl = canvas.toDataURL(mimeType, quality);

    // Convert to Blob
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (b) => {
          if (b) resolve(b);
          else reject(new Error('Canvas toBlob conversion failed.'));
        },
        mimeType,
        quality
      );
    });

    return {
      blob,
      dataUrl,
      mimeType,
      fileSize: blob.size,
      width,
      height,
      originalWidth: origWidth,
      originalHeight: origHeight
    };
  } finally {
    cleanup();
  }
}

export default {
  calculateScaledDimensions,
  compressReceiptImage
};
