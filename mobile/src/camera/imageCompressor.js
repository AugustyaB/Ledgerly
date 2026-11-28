/**
 * ============================================================================
 * Ledgerly Mobile — High-Performance Client-Side Image Preprocessor & CV Pipeline
 * ============================================================================
 *
 * @fileoverview
 * Zero-dependency HTML5 Canvas image downscaler, compressor, and computer vision
 * pre-processing pipeline for mobile receipt intake.
 *
 * Capabilities:
 *   1. Client-side aspect-ratio preserving downscaling capped at maxDimension.
 *   2. Document edge & corner contour detection on HTML5 Canvas / ImageData.
 *   3. 4-point perspective transform warping angled phone captures into flat top-down scans.
 *   4. Adaptive local binarization (Sauvola thresholding filter via integral images)
 *      to normalize uneven phone shadows, paper folds, and faded thermal printing.
 *   5. Horizontal projection profiling and text strip line height normalization (~48px).
 *   6. Headless pure JS math execution suitable for Node.js test environments.
 */

'use strict';

/**
 * Creates an ImageData-compatible container supporting both browser DOM and Node.js headless.
 *
 * @param {number} width
 * @param {number} height
 * @param {Uint8ClampedArray} [data]
 * @returns {ImageData|{ width: number, height: number, data: Uint8ClampedArray }}
 */
export function createImageDataObject(width, height, data = null) {
  const pixelData = data || new Uint8ClampedArray(width * height * 4);
  if (typeof globalThis !== 'undefined' && typeof globalThis.ImageData === 'function') {
    try {
      return new globalThis.ImageData(pixelData, width, height);
    } catch {
      // Fall through to object representation
    }
  }
  return { width, height, data: pixelData };
}

export const createImageContainer = createImageDataObject;

export { createImageDataObject as createImageDataContainer, createImageDataObject as createImageData };

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
 * Solves an N x N linear system A * x = b using Gaussian elimination with partial pivoting.
 * Pure math function with zero external dependencies.
 *
 * @param {Array<Array<number>>} A - Matrix of size N x N
 * @param {Array<number>|Float64Array} b - Vector of size N
 * @returns {Float64Array|null} Solution vector x, or null if singular
 */
export function solveLinearSystem(A, b) {
  const n = b.length;
  const M = new Array(n);
  for (let i = 0; i < n; i++) {
    M[i] = new Float64Array(n + 1);
    for (let j = 0; j < n; j++) {
      M[i][j] = A[i][j];
    }
    M[i][n] = b[i];
  }

  // Forward elimination with partial pivoting
  for (let p = 0; p < n; p++) {
    let maxRow = p;
    let maxVal = Math.abs(M[p][p]);
    for (let i = p + 1; i < n; i++) {
      const val = Math.abs(M[i][p]);
      if (val > maxVal) {
        maxVal = val;
        maxRow = i;
      }
    }

    if (maxVal < 1e-12) {
      return null; // Singular matrix
    }

    if (maxRow !== p) {
      const tmp = M[p];
      M[p] = M[maxRow];
      M[maxRow] = tmp;
    }

    for (let i = p + 1; i < n; i++) {
      const factor = M[i][p] / M[p][p];
      for (let j = p; j <= n; j++) {
        M[i][j] -= factor * M[p][j];
      }
    }
  }

  // Backward substitution
  const x = new Float64Array(n);
  for (let i = n - 1; i >= 0; i--) {
    let sum = M[i][n];
    for (let j = i + 1; j < n; j++) {
      sum -= M[i][j] * x[j];
    }
    x[i] = sum / M[i][i];
  }

  return x;
}

/**
 * Orders 4 arbitrary points into canonical quadrilateral order:
 * Top-Left, Top-Right, Bottom-Right, Bottom-Left.
 *
 * @param {Array<{x: number, y: number}>|{ topLeft: Object, topRight: Object, bottomRight: Object, bottomLeft: Object }} points
 * @returns {{ topLeft: {x: number, y: number}, topRight: {x: number, y: number}, bottomRight: {x: number, y: number}, bottomLeft: {x: number, y: number} }}
 */
export function orderCorners(points) {
  let pts;
  if (Array.isArray(points)) {
    pts = points;
  } else if (points && typeof points === 'object') {
    pts = [points.topLeft, points.topRight, points.bottomRight, points.bottomLeft];
  } else {
    pts = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
  }

  // Top-Left has minimum (x + y)
  // Bottom-Right has maximum (x + y)
  // Top-Right has maximum (x - y)
  // Bottom-Left has minimum (x - y)
  let tl = pts[0];
  let br = pts[0];
  let tr = pts[0];
  let bl = pts[0];

  let minSum = pts[0].x + pts[0].y;
  let maxSum = minSum;
  let maxDiff = pts[0].x - pts[0].y;
  let minDiff = maxDiff;

  for (let i = 1; i < pts.length; i++) {
    const pt = pts[i];
    const sum = pt.x + pt.y;
    const diff = pt.x - pt.y;

    if (sum < minSum) {
      minSum = sum;
      tl = pt;
    }
    if (sum > maxSum) {
      maxSum = sum;
      br = pt;
    }
    if (diff > maxDiff) {
      maxDiff = diff;
      tr = pt;
    }
    if (diff < minDiff) {
      minDiff = diff;
      bl = pt;
    }
  }

  return {
    topLeft: { x: Math.round(tl.x), y: Math.round(tl.y) },
    topRight: { x: Math.round(tr.x), y: Math.round(tr.y) },
    bottomRight: { x: Math.round(br.x), y: Math.round(br.y) },
    bottomLeft: { x: Math.round(bl.x), y: Math.round(bl.y) }
  };
}

/**
 * Detects document edge and corner contours from image data.
 * Identifies paper boundaries against darker or contrasting surfaces.
 *
 * @param {ImageData|{ width: number, height: number, data: Uint8ClampedArray|Uint8Array }} imageData
 * @param {Object} [options]
 * @param {number} [options.minAreaFraction=0.15]
 * @returns {{
 *   detected: boolean,
 *   confidence: number,
 *   corners: {
 *     topLeft: { x: number, y: number },
 *     topRight: { x: number, y: number },
 *     bottomRight: { x: number, y: number },
 *     bottomLeft: { x: number, y: number }
 *   }
 * }}
 */
export function detectDocumentCorners(imageData, options = {}) {
  const { minAreaFraction = 0.15 } = options;
  const { width, height, data } = imageData;

  const defaultCorners = {
    topLeft: { x: 0, y: 0 },
    topRight: { x: width, y: 0 },
    bottomRight: { x: width, y: height },
    bottomLeft: { x: 0, y: height }
  };

  if (!width || !height || width < 30 || height < 30 || !data) {
    return { detected: false, confidence: 0, corners: defaultCorners };
  }

  // Work on downsampled thumbnail for high performance (< 10ms execution)
  const targetDimension = 240;
  const scale = Math.min(1.0, targetDimension / Math.max(width, height));
  const thumbW = Math.max(20, Math.round(width * scale));
  const thumbH = Math.max(20, Math.round(height * scale));
  const thumbLen = thumbW * thumbH;

  const thumbGray = new Uint8Array(thumbLen);
  for (let ty = 0; ty < thumbH; ty++) {
    const srcY = Math.min(height - 1, Math.round(ty / scale));
    const srcRowOffset = srcY * width * 4;
    const thumbRowOffset = ty * thumbW;

    for (let tx = 0; tx < thumbW; tx++) {
      const srcX = Math.min(width - 1, Math.round(tx / scale));
      const idx = srcRowOffset + (srcX * 4);
      // Standard luminance formula
      thumbGray[thumbRowOffset + tx] = Math.round(
        data[idx] * 0.299 + data[idx + 1] * 0.587 + data[idx + 2] * 0.114
      );
    }
  }

  // Compute gradient magnitude map using Sobel kernel
  const grad = new Float32Array(thumbLen);
  let totalGrad = 0;
  let gradCount = 0;

  for (let y = 1; y < thumbH - 1; y++) {
    const yOff = y * thumbW;
    const prevYOff = (y - 1) * thumbW;
    const nextYOff = (y + 1) * thumbW;

    for (let x = 1; x < thumbW - 1; x++) {
      // Horizontal gradient
      const gx =
        (thumbGray[prevYOff + x + 1] + 2 * thumbGray[yOff + x + 1] + thumbGray[nextYOff + x + 1]) -
        (thumbGray[prevYOff + x - 1] + 2 * thumbGray[yOff + x - 1] + thumbGray[nextYOff + x - 1]);

      // Vertical gradient
      const gy =
        (thumbGray[nextYOff + x - 1] + 2 * thumbGray[nextYOff + x] + thumbGray[nextYOff + x + 1]) -
        (thumbGray[prevYOff + x - 1] + 2 * thumbGray[prevYOff + x] + thumbGray[prevYOff + x + 1]);

      const mag = Math.sqrt(gx * gx + gy * gy);
      grad[yOff + x] = mag;
      totalGrad += mag;
      gradCount++;
    }
  }

  const avgGrad = gradCount > 0 ? totalGrad / gradCount : 10;
  const edgeThreshold = Math.max(25, avgGrad * 1.6);

  // Cast rays from center (cx, cy) outward in radial directions to find boundary candidates
  const cx = thumbW / 2;
  const cy = thumbH / 2;
  const numRays = 48;
  const boundaryPoints = [];

  for (let r = 0; r < numRays; r++) {
    const angle = (r / numRays) * (2 * Math.PI);
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);

    let maxMag = 0;
    let bestPt = null;

    // Scan ray from center outward to thumbnail boundary
    const limitX = cosA > 0 ? (thumbW - 2 - cx) / cosA : (cosA < 0 ? (1 - cx) / cosA : 1000);
    const limitY = sinA > 0 ? (thumbH - 2 - cy) / sinA : (sinA < 0 ? (1 - cy) / sinA : 1000);
    const rayDistMax = Math.min(limitX, limitY);

    for (let dist = Math.max(5, Math.round(rayDistMax * 0.15)); dist <= rayDistMax; dist += 2) {
      const px = Math.round(cx + dist * cosA);
      const py = Math.round(cy + dist * sinA);

      if (px >= 1 && px < thumbW - 1 && py >= 1 && py < thumbH - 1) {
        const mag = grad[py * thumbW + px];
        if (mag > edgeThreshold && mag > maxMag) {
          maxMag = mag;
          bestPt = { x: px, y: py };
        }
      }
    }

    if (bestPt) {
      boundaryPoints.push(bestPt);
    }
  }

  // If not enough edge points found, return default image rect
  if (boundaryPoints.length < 8) {
    return { detected: false, confidence: 0, corners: defaultCorners };
  }

  // Derive bounding corners from extreme sum/diff projections
  const ordered = orderCorners(boundaryPoints);

  // Scale corners back to original image dimensions
  const origCorners = {
    topLeft: {
      x: Math.max(0, Math.min(width, Math.round(ordered.topLeft.x / scale))),
      y: Math.max(0, Math.min(height, Math.round(ordered.topLeft.y / scale)))
    },
    topRight: {
      x: Math.max(0, Math.min(width, Math.round(ordered.topRight.x / scale))),
      y: Math.max(0, Math.min(height, Math.round(ordered.topRight.y / scale)))
    },
    bottomRight: {
      x: Math.max(0, Math.min(width, Math.round(ordered.bottomRight.x / scale))),
      y: Math.max(0, Math.min(height, Math.round(ordered.bottomRight.y / scale)))
    },
    bottomLeft: {
      x: Math.max(0, Math.min(width, Math.round(ordered.bottomLeft.x / scale))),
      y: Math.max(0, Math.min(height, Math.round(ordered.bottomLeft.y / scale)))
    }
  };

  // Shoelace formula to compute quadrilateral area
  const pts = [origCorners.topLeft, origCorners.topRight, origCorners.bottomRight, origCorners.bottomLeft];
  let quadArea = 0;
  for (let i = 0; i < 4; i++) {
    const next = (i + 1) % 4;
    quadArea += (pts[i].x * pts[next].y) - (pts[next].x * pts[i].y);
  }
  quadArea = Math.abs(quadArea) * 0.5;

  const totalImageArea = width * height;
  const areaFraction = quadArea / totalImageArea;

  // Validate that corners form a sensible polygon (not collapsed or degenerate)
  if (areaFraction >= minAreaFraction && areaFraction <= 0.98) {
    const confidence = Math.min(0.95, Math.round((areaFraction / 0.8) * 100) / 100);
    return {
      detected: true,
      confidence,
      corners: origCorners
    };
  }

  return { detected: false, confidence: 0.1, corners: defaultCorners };
}

/**
 * Computes backward homography matrix mapping destination (u, v) to source (x, y).
 * Given 4 corresponding point pairs.
 *
 * @param {Array<{x: number, y: number}>} srcPoints - 4 points in source coordinates [TL, TR, BR, BL]
 * @param {Array<{x: number, y: number}>} dstPoints - 4 points in destination coordinates [TL, TR, BR, BL]
 * @returns {Float64Array|null} 3x3 homography matrix entries [h00..h22]
 */
export function computePerspectiveTransform(srcPoints, dstPoints) {
  if (!srcPoints || !dstPoints || srcPoints.length < 4 || dstPoints.length < 4) {
    return null;
  }

  // 8 equations for 8 unknowns (h00, h01, h02, h10, h11, h12, h20, h21), with h22 = 1.0
  const A = [];
  const b = [];

  for (let i = 0; i < 4; i++) {
    const u = dstPoints[i].x;
    const v = dstPoints[i].y;
    const x = srcPoints[i].x;
    const y = srcPoints[i].y;

    // x-mapping: h00*u + h01*v + h02 - h20*u*x - h21*v*x = x
    A.push([u, v, 1, 0, 0, 0, -u * x, -v * x]);
    b.push(x);

    // y-mapping: h10*u + h11*v + h12 - h20*u*y - h21*v*y = y
    A.push([0, 0, 0, u, v, 1, -u * y, -v * y]);
    b.push(y);
  }

  const solution = solveLinearSystem(A, b);
  if (!solution) return null;

  // Construct full 3x3 matrix [h00, h01, h02, h10, h11, h12, h20, h21, h22]
  const H = new Float64Array(9);
  for (let i = 0; i < 8; i++) {
    H[i] = solution[i];
  }
  H[8] = 1.0;

  return H;
}

/**
 * Warps an angled perspective quadrilateral into a rectified top-down rectangular scan.
 * Uses backward homography mapping with bilinear interpolation.
 *
 * @param {ImageData|{ width: number, height: number, data: Uint8ClampedArray }} sourceData
 * @param {Object|Array} srcCorners - Detected corner points
 * @param {number} [targetWidth]
 * @param {number} [targetHeight]
 * @returns {ImageData|{ width: number, height: number, data: Uint8ClampedArray }}
 */
export function applyPerspectiveWarp(sourceData, srcCorners, targetWidth, targetHeight) {
  const corners = orderCorners(srcCorners);
  const srcW = sourceData.width;
  const srcH = sourceData.height;
  const srcPix = sourceData.data;

  // Determine output dimensions if not provided
  const tl = corners.topLeft;
  const tr = corners.topRight;
  const br = corners.bottomRight;
  const bl = corners.bottomLeft;

  const wTop = Math.hypot(tr.x - tl.x, tr.y - tl.y);
  const wBottom = Math.hypot(br.x - bl.x, br.y - bl.y);
  const outW = targetWidth || Math.max(50, Math.round(Math.max(wTop, wBottom)));

  const hLeft = Math.hypot(bl.x - tl.x, bl.y - tl.y);
  const hRight = Math.hypot(br.x - tr.x, br.y - tr.y);
  const outH = targetHeight || Math.max(50, Math.round(Math.max(hLeft, hRight)));

  const srcPts = [tl, tr, br, bl];
  const dstPts = [
    { x: 0, y: 0 },
    { x: outW, y: 0 },
    { x: outW, y: outH },
    { x: 0, y: outH }
  ];

  const H = computePerspectiveTransform(srcPts, dstPts);
  if (!H) {
    // Return original unwarped if degenerate
    return sourceData;
  }

  const outData = new Uint8ClampedArray(outW * outH * 4);
  const h00 = H[0], h01 = H[1], h02 = H[2];
  const h10 = H[3], h11 = H[4], h12 = H[5];
  const h20 = H[6], h21 = H[7];

  for (let v = 0; v < outH; v++) {
    const outRowOffset = v * outW * 4;
    for (let u = 0; u < outW; u++) {
      const w = h20 * u + h21 * v + 1.0;
      if (Math.abs(w) < 1e-9) continue;

      const srcX = (h00 * u + h01 * v + h02) / w;
      const srcY = (h10 * u + h11 * v + h12) / w;

      if (srcX >= 0 && srcX < srcW - 1 && srcY >= 0 && srcY < srcH - 1) {
        // Bilinear interpolation
        const x0 = Math.floor(srcX);
        const y0 = Math.floor(srcY);
        const x1 = x0 + 1;
        const y1 = y0 + 1;

        const dx = srcX - x0;
        const dy = srcY - y0;
        const w00 = (1 - dx) * (1 - dy);
        const w10 = dx * (1 - dy);
        const w01 = (1 - dx) * dy;
        const w11 = dx * dy;

        const idx00 = (y0 * srcW + x0) * 4;
        const idx10 = (y0 * srcW + x1) * 4;
        const idx01 = (y1 * srcW + x0) * 4;
        const idx11 = (y1 * srcW + x1) * 4;

        const outIdx = outRowOffset + (u * 4);
        outData[outIdx] = Math.round(
          w00 * srcPix[idx00] + w10 * srcPix[idx10] + w01 * srcPix[idx01] + w11 * srcPix[idx11]
        );
        outData[outIdx + 1] = Math.round(
          w00 * srcPix[idx00 + 1] + w10 * srcPix[idx10 + 1] + w01 * srcPix[idx01 + 1] + w11 * srcPix[idx11 + 1]
        );
        outData[outIdx + 2] = Math.round(
          w00 * srcPix[idx00 + 2] + w10 * srcPix[idx10 + 2] + w01 * srcPix[idx01 + 2] + w11 * srcPix[idx11 + 2]
        );
        outData[outIdx + 3] = 255;
      } else if (srcX >= 0 && srcX < srcW && srcY >= 0 && srcY < srcH) {
        // Nearest-neighbor fallback on exact image boundary edges
        const idx = (Math.round(srcY) * srcW + Math.round(srcX)) * 4;
        const outIdx = outRowOffset + (u * 4);
        outData[outIdx] = srcPix[idx];
        outData[outIdx + 1] = srcPix[idx + 1];
        outData[outIdx + 2] = srcPix[idx + 2];
        outData[outIdx + 3] = 255;
      }
    }
  }

  return createImageDataObject(outW, outH, outData);
}

/**
 * Adaptive local binarization using Sauvola's thresholding algorithm.
 * Implemented with Float64Array Summed Area Tables (Integral Images) for O(1) local window queries.
 *
 * Sauvola formula:
 *   T(x, y) = m(x, y) * (1 + k * (s(x, y) / R - 1))
 *
 * Normalizes uneven smartphone lighting, shadows, creases, and faded thermal ink.
 *
 * @param {ImageData|{ width: number, height: number, data: Uint8ClampedArray }} imageData
 * @param {Object} [options]
 * @param {number} [options.windowSize=25] - Sliding local window diameter (odd integer)
 * @param {number} [options.k=0.2] - Sensitivity parameter (0.1 to 0.5)
 * @param {number} [options.r=128] - Dynamic range parameter
 * @param {'binary'|'contrast'} [options.outputMode='binary'] - 'binary' for 0/255 mask, 'contrast' for enhanced grayscale
 * @returns {ImageData|{ width: number, height: number, data: Uint8ClampedArray }}
 */
export function applySauvolaThreshold(imageData, options = {}) {
  const {
    windowSize = 25,
    k = 0.2,
    r = 128,
    outputMode = 'binary'
  } = options;

  const width = imageData.width;
  const height = imageData.height;
  const data = imageData.data;
  const len = width * height;

  // 1. Convert to grayscale luminance
  const gray = new Uint8Array(len);
  for (let i = 0, p = 0; p < len; p++, i += 4) {
    gray[p] = Math.round(data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
  }

  // 2. Build Integral Images (Sum and Sum of Squares)
  const intW = width + 1;
  const intH = height + 1;
  const integral = new Float64Array(intW * intH);
  const integralSq = new Float64Array(intW * intH);

  for (let y = 0; y < height; y++) {
    let rowSum = 0;
    let rowSumSq = 0;
    const yOffset = (y + 1) * intW;
    const prevYOffset = y * intW;
    const grayRowOffset = y * width;

    for (let x = 0; x < width; x++) {
      const val = gray[grayRowOffset + x];
      rowSum += val;
      rowSumSq += val * val;
      integral[yOffset + (x + 1)] = integral[prevYOffset + (x + 1)] + rowSum;
      integralSq[yOffset + (x + 1)] = integralSq[prevYOffset + (x + 1)] + rowSumSq;
    }
  }

  // 3. Compute local threshold using Sauvola formula
  const halfWin = Math.floor(windowSize / 2);
  const outData = new Uint8ClampedArray(data.length);

  for (let y = 0; y < height; y++) {
    const y1 = Math.max(0, y - halfWin);
    const y2 = Math.min(height - 1, y + halfWin);
    const y1Idx = y1 * intW;
    const y2Idx = (y2 + 1) * intW;
    const countY = (y2 - y1 + 1);
    const grayOffset = y * width;
    const pixelOffset = grayOffset * 4;

    for (let x = 0; x < width; x++) {
      const x1 = Math.max(0, x - halfWin);
      const x2 = Math.min(width - 1, x + halfWin);
      const area = countY * (x2 - x1 + 1);

      const sum = integral[y2Idx + (x2 + 1)] - integral[y1Idx + (x2 + 1)] -
                  integral[y2Idx + x1] + integral[y1Idx + x1];
      const sumSq = integralSq[y2Idx + (x2 + 1)] - integralSq[y1Idx + (x2 + 1)] -
                    integralSq[y2Idx + x1] + integralSq[y1Idx + x1];

      const mean = sum / area;
      const variance = Math.max(0, (sumSq / area) - (mean * mean));
      const stdDev = Math.sqrt(variance);

      // Sauvola local threshold with low-variance stroke interior preservation
      let threshold;
      if (stdDev < 8) {
        threshold = mean < 128 ? 255 : 0;
      } else {
        threshold = mean * (1.0 + k * ((stdDev / r) - 1.0));
      }
      const val = gray[grayOffset + x];
      const outIdx = pixelOffset + (x * 4);

      if (outputMode === 'binary') {
        const binVal = val < threshold ? 0 : 255;
        outData[outIdx] = binVal;
        outData[outIdx + 1] = binVal;
        outData[outIdx + 2] = binVal;
        outData[outIdx + 3] = 255;
      } else {
        // High-contrast document enhancement mode
        const enhanced = val < threshold ? Math.round(val * 0.45) : Math.min(255, Math.round(val * 1.15));
        outData[outIdx] = enhanced;
        outData[outIdx + 1] = enhanced;
        outData[outIdx + 2] = enhanced;
        outData[outIdx + 3] = 255;
      }
    }
  }

  return createImageDataObject(width, height, outData);
}

/**
 * Estimates median text line height using horizontal projection profiling.
 * Identifies contiguous dark pixel clusters corresponding to text line heights.
 *
 * @param {ImageData|{ width: number, height: number, data: Uint8ClampedArray }} imageData
 * @returns {number} Estimated median line height in pixels (or 0 if indeterminate)
 */
export function estimateTextLineHeight(imageData) {
  const { width, height, data } = imageData;
  if (!width || !height || !data) return 0;

  // Horizontal projection profile: count dark pixels (< 128) per row
  const rowInkCounts = new Int32Array(height);
  for (let y = 0; y < height; y++) {
    let darkCount = 0;
    const rowOffset = y * width * 4;
    for (let x = 0; x < width; x++) {
      const idx = rowOffset + (x * 4);
      const lum = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
      if (lum < 128) darkCount++;
    }
    rowInkCounts[y] = darkCount;
  }

  // Row is considered part of a text line if dark pixels exceed minimum density
  const minInkPerRow = Math.max(3, Math.round(width * 0.015));
  const lineHeights = [];
  let inLine = false;
  let lineStart = 0;

  for (let y = 0; y < height; y++) {
    if (rowInkCounts[y] >= minInkPerRow) {
      if (!inLine) {
        inLine = true;
        lineStart = y;
      }
    } else {
      if (inLine) {
        inLine = false;
        const h = y - lineStart;
        if (h >= 6 && h <= 120) {
          lineHeights.push(h);
        }
      }
    }
  }

  if (inLine) {
    const h = height - lineStart;
    if (h >= 6 && h <= 120) lineHeights.push(h);
  }

  if (lineHeights.length === 0) return 0;

  lineHeights.sort((a, b) => a - b);
  const mid = Math.floor(lineHeights.length / 2);
  return lineHeights.length % 2 !== 0
    ? lineHeights[mid]
    : Math.round((lineHeights[mid - 1] + lineHeights[mid]) / 2);
}

/**
 * Calculates optimal scaling factor to normalize text lines to target height (~48px).
 *
 * @param {number} currentLineHeight
 * @param {number} [targetLineHeight=48]
 * @returns {number} Scale multiplier clamped between 0.5 and 2.5
 */
export function calculateLineHeightScale(currentLineHeight, targetLineHeight = 48) {
  if (!currentLineHeight || currentLineHeight <= 0) return 1.0;
  const rawScale = targetLineHeight / currentLineHeight;
  const clampedScale = Math.max(0.5, Math.min(2.5, rawScale));

  // If already within 10% of target, avoid unnecessary resampling blur
  if (Math.abs(clampedScale - 1.0) < 0.1) return 1.0;
  return Math.round(clampedScale * 100) / 100;
}

/**
 * Normalizes text line height to ~48px for optimal local OCR recognition.
 *
 * @param {ImageData|{ width: number, height: number, data: Uint8ClampedArray }} imageData
 * @param {Object} [options]
 * @param {number} [options.targetLineHeight=48]
 * @returns {{
 *   scaled: boolean,
 *   currentLineHeight: number,
 *   scale: number,
 *   imageData: ImageData|{ width: number, height: number, data: Uint8ClampedArray }
 * }}
 */
export function normalizeTextLineHeight(imageData, options = {}) {
  const { targetLineHeight = 48 } = options;
  const currentLineHeight = estimateTextLineHeight(imageData);
  const scale = calculateLineHeightScale(currentLineHeight, targetLineHeight);

  if (scale === 1.0) {
    return {
      scaled: false,
      currentLineHeight,
      scale: 1.0,
      imageData
    };
  }

  const srcW = imageData.width;
  const srcH = imageData.height;
  const srcData = imageData.data;
  const newW = Math.max(50, Math.round(srcW * scale));
  const newH = Math.max(50, Math.round(srcH * scale));
  const outData = new Uint8ClampedArray(newW * newH * 4);

  // Bilinear resampling
  for (let y = 0; y < newH; y++) {
    const srcY = y / scale;
    const y0 = Math.floor(srcY);
    const y1 = Math.min(srcH - 1, y0 + 1);
    const dy = srcY - y0;
    const outRowOffset = y * newW * 4;

    for (let x = 0; x < newW; x++) {
      const srcX = x / scale;
      const x0 = Math.floor(srcX);
      const x1 = Math.min(srcW - 1, x0 + 1);
      const dx = srcX - x0;

      const idx00 = (y0 * srcW + x0) * 4;
      const idx10 = (y0 * srcW + x1) * 4;
      const idx01 = (y1 * srcW + x0) * 4;
      const idx11 = (y1 * srcW + x1) * 4;

      const w00 = (1 - dx) * (1 - dy);
      const w10 = dx * (1 - dy);
      const w01 = (1 - dx) * dy;
      const w11 = dx * dy;

      const outIdx = outRowOffset + (x * 4);
      outData[outIdx] = Math.round(
        w00 * srcData[idx00] + w10 * srcData[idx10] + w01 * srcData[idx01] + w11 * srcData[idx11]
      );
      outData[outIdx + 1] = Math.round(
        w00 * srcData[idx00 + 1] + w10 * srcData[idx10 + 1] + w01 * srcData[idx01 + 1] + w11 * srcData[idx11 + 1]
      );
      outData[outIdx + 2] = Math.round(
        w00 * srcData[idx00 + 2] + w10 * srcData[idx10 + 2] + w01 * srcData[idx01 + 2] + w11 * srcData[idx11 + 2]
      );
      outData[outIdx + 3] = 255;
    }
  }

  return {
    scaled: true,
    currentLineHeight,
    scale,
    imageData: createImageDataObject(newW, newH, outData)
  };
}

/**
 * Complete computer vision pre-processing pipeline on raw image data.
 * Sequential stages: Corner Detection -> 4-Point Warp -> Sauvola Binarization -> Line Height Normalization.
 *
 * @param {ImageData|{ width: number, height: number, data: Uint8ClampedArray }} sourceData
 * @param {Object} [options]
 * @param {boolean} [options.autoWarp=true]
 * @param {boolean} [options.binarize=true]
 * @param {boolean} [options.normalizeLineHeight=true]
 * @param {number} [options.targetLineHeight=48]
 * @param {number} [options.sauvolaK=0.2]
 * @param {number} [options.sauvolaWindow=25]
 * @returns {{
 *   imageData: ImageData|{ width: number, height: number, data: Uint8ClampedArray },
 *   cvMetadata: {
 *     warped: boolean,
 *     corners: Object,
 *     cornerConfidence: number,
 *     binarized: boolean,
 *     detectedLineHeight: number,
 *     lineHeightScale: number
 *   }
 * }}
 */
export function preprocessReceiptImageData(sourceData, options = {}) {
  const {
    autoWarp = true,
    binarize = true,
    normalizeLineHeight: doNormLineHeight = true,
    targetLineHeight = 48,
    sauvolaK = 0.2,
    sauvolaWindow = 25
  } = options;

  let current = sourceData;
  let warped = false;
  const cornerRes = detectDocumentCorners(current);

  // 1. Perspective Transform
  if (autoWarp && cornerRes.detected && cornerRes.confidence >= 0.5) {
    current = applyPerspectiveWarp(current, cornerRes.corners);
    warped = true;
  }

  // 2. Adaptive Sauvola Binarization
  if (binarize) {
    current = applySauvolaThreshold(current, {
      windowSize: sauvolaWindow,
      k: sauvolaK,
      outputMode: 'binary'
    });
  }

  // 3. Line Height Normalization
  let lineRes = { scaled: false, currentLineHeight: 0, scale: 1.0, imageData: current };
  if (doNormLineHeight) {
    lineRes = normalizeTextLineHeight(current, { targetLineHeight });
    if (lineRes.scaled) {
      current = lineRes.imageData;
    }
  }

  return {
    imageData: current,
    cvMetadata: {
      warped,
      corners: cornerRes.corners,
      cornerConfidence: cornerRes.confidence,
      binarized: Boolean(binarize),
      detectedLineHeight: lineRes.currentLineHeight,
      lineHeightScale: lineRes.scale
    }
  };
}

/**
 * Applies the full CV pre-processing pipeline onto an HTML5 Canvas element.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {Object} [options]
 * @returns {{
 *   warped: boolean,
 *   corners: Object,
 *   cornerConfidence: number,
 *   binarized: boolean,
 *   detectedLineHeight: number,
 *   lineHeightScale: number
 * }}
 */
export function preprocessReceiptCanvas(canvas, options = {}) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return { warped: false, binarized: false };

  const rawImgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const { imageData, cvMetadata } = preprocessReceiptImageData(rawImgData, options);

  // Update canvas dimensions and write back enhanced pixel data
  canvas.width = imageData.width;
  canvas.height = imageData.height;

  // Re-acquire context if width/height changed reset it
  const outCtx = canvas.getContext('2d');
  if (outCtx) {
    if (typeof globalThis.ImageData === 'function' && imageData instanceof globalThis.ImageData) {
      outCtx.putImageData(imageData, 0, 0);
    } else {
      const domImageData = outCtx.createImageData(imageData.width, imageData.height);
      domImageData.data.set(imageData.data);
      outCtx.putImageData(domImageData, 0, 0);
    }
  }

  return cvMetadata;
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
 * Compresses, downscales, and enhances a receipt photo via the client-side CV pipeline.
 *
 * @param {Blob|File|string} source - Input photo source.
 * @param {Object} [options]
 * @param {number} [options.maxDimension=1600] - Maximum width or height in pixels.
 * @param {number} [options.quality=0.82] - Compression quality (0.0 to 1.0).
 * @param {string} [options.mimeType='image/jpeg'] - Output image MIME type.
 * @param {boolean} [options.preprocess=true] - Whether to execute the CV pre-processing pipeline.
 * @param {Object} [options.cvOptions] - Options passed to preprocessReceiptCanvas.
 * @returns {Promise<{
 *   blob: Blob,
 *   dataUrl: string,
 *   mimeType: string,
 *   fileSize: number,
 *   width: number,
 *   height: number,
 *   originalWidth: number,
 *   originalHeight: number,
 *   cvMetadata?: Object
 * }>}
 */
export async function compressReceiptImage(source, options = {}) {
  const {
    maxDimension = 1600,
    quality = 0.82,
    mimeType = 'image/jpeg',
    preprocess = true,
    cvOptions = {}
  } = options;

  const { img, cleanup } = await loadImage(source);

  try {
    const origWidth = img.naturalWidth || img.width;
    const origHeight = img.naturalHeight || img.height;

    if (!origWidth || !origHeight) {
      throw new Error('Image has zero dimensions.');
    }

    const { width, height } = calculateScaledDimensions(origWidth, origHeight, maxDimension);

    // Create offscreen canvas for downscaling & CV transformations
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

    // Draw initial downscaled image
    ctx.drawImage(img, 0, 0, width, height);

    // Apply client-side CV pre-processing (contour detection, 4-point warp, Sauvola binarization)
    let cvMetadata = null;
    if (preprocess) {
      cvMetadata = preprocessReceiptCanvas(canvas, cvOptions);
    }

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
      width: canvas.width,
      height: canvas.height,
      originalWidth: origWidth,
      originalHeight: origHeight,
      cvMetadata
    };
  } finally {
    cleanup();
  }
}

export default {
  createImageDataObject,
  calculateScaledDimensions,
  solveLinearSystem,
  orderCorners,
  detectDocumentCorners,
  computePerspectiveTransform,
  applyPerspectiveWarp,
  applySauvolaThreshold,
  estimateTextLineHeight,
  calculateLineHeightScale,
  normalizeTextLineHeight,
  preprocessReceiptImageData,
  preprocessReceiptCanvas,
  compressReceiptImage
};
