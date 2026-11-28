/**
 * ============================================================================
 * Ledgerly — receiptNormalizer (Pure Receipt Normalization Helpers)
 * ============================================================================
 *
 * @fileoverview
 * Pure, side-effect-free helper functions for receipt parsing and token normalization
 * (Milestone v1.2.0 Phase 1 — Sec 3, Layer L3).
 *
 * Responsibilities:
 * - Line segmentation & token cleaning
 * - Currency symbol stripping (EUR, INR, USD, GBP, JPY, AUD, CAD)
 * - European comma vs. period decimal normalization (normalizeAmount)
 * - Date canonicalization across regional conventions (ISO YYYY-MM-DD)
 * - Tax token classification (DACH MwSt/USt, Indian GST, US Sales Tax)
 * - Mirage OCR bounding box coordinate math and default positioning
 */

'use strict';

/**
 * Currency symbols and abbreviations regex.
 */
const CURRENCY_STRIP_REGEX = /^(?:₹|Rs\.?|INR|\$|USD|€|EUR|£|GBP|¥|JPY|A\$|AUD|CA\$|CAD)\s*|\s*(?:₹|Rs\.?|INR|\$|USD|€|EUR|£|GBP|¥|JPY|A\$|AUD|CA\$|CAD)$/gi;

/**
 * Common month name abbreviations for text dates.
 */
const MONTH_NAMES = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12
};

/**
 * Segments raw receipt text into clean, non-empty, trimmed lines.
 *
 * @param {string} text - Raw OCR or extracted text.
 * @returns {string[]} Array of non-empty trimmed lines.
 */
function segmentLines(text) {
  if (typeof text !== 'string') return [];
  return text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0);
}

/**
 * Cleans an individual token or line, removing control characters and excess whitespace.
 *
 * @param {string} token - Raw string token.
 * @returns {string} Sanitized string.
 */
function cleanToken(token) {
  if (typeof token !== 'string') return '';
  return token
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Strips leading and trailing currency symbols or ISO currency codes from a string.
 *
 * @param {string} str - Raw monetary or text string.
 * @returns {string} Cleaned string without peripheral currency tokens.
 */
function stripCurrencySymbols(str) {
  if (typeof str !== 'string') return '';
  let cleaned = str.trim();
  // Iteratively strip until stable
  let prev;
  do {
    prev = cleaned;
    cleaned = cleaned.replace(CURRENCY_STRIP_REGEX, '').trim();
  } while (cleaned !== prev);
  return cleaned;
}

/**
 * Normalizes a monetary amount string into a floating-point number.
 * Correctly distinguishes European comma decimals (e.g. 17,39 € or 1.234,56 €)
 * from standard US/UK period decimals (e.g. $1,234.56 or $12.06).
 *
 * @param {string|number} input - Amount string or number.
 * @returns {number|null} Parsed numeric amount or null if invalid.
 */
function normalizeAmount(input) {
  if (typeof input === 'number') {
    return Number.isFinite(input) ? Math.round(input * 100) / 100 : null;
  }
  if (typeof input !== 'string') return null;

  let str = stripCurrencySymbols(input).trim();
  if (!str) return null;

  // Extract core numeric component (ignoring prefix words like "TOTAL:")
  const numMatch = str.match(/[-+]?[0-9][0-9.,\s]*/);
  if (!numMatch) return null;
  str = numMatch[0].replace(/\s+/g, '');

  // Check for European format with period thousands and comma decimal: 1.234,56 or 1234,56
  if (/^[+-]?(?:\d{1,3}(?:\.\d{3})+|\d+),\d{2}$/.test(str)) {
    const standard = str.replace(/\./g, '').replace(',', '.');
    const val = parseFloat(standard);
    return Number.isFinite(val) ? Math.round(val * 100) / 100 : null;
  }

  // Check for standard format with comma thousands and period decimal: 1,234.56 or 1234.56
  if (/^[+-]?(?:\d{1,3}(?:,\d{3})+|\d+)\.\d{2}$/.test(str)) {
    const standard = str.replace(/,/g, '');
    const val = parseFloat(standard);
    return Number.isFinite(val) ? Math.round(val * 100) / 100 : null;
  }

  // Period as thousands separator without decimals: e.g. 60.000 or 1.250.000 (CORD / IDR / VND)
  if (/^[+-]?(?:\d{1,3}(?:\.\d{3})+)$/.test(str)) {
    const val = parseFloat(str.replace(/\./g, ''));
    return Number.isFinite(val) ? val : null;
  }

  // Comma as solitary separator: e.g. 17,39 or 420,5
  if (/^[+-]?\d+,\d{1,2}$/.test(str)) {
    const val = parseFloat(str.replace(',', '.'));
    return Number.isFinite(val) ? Math.round(val * 100) / 100 : null;
  }

  // Period as solitary separator: e.g. 17.39 or 420.5
  if (/^[+-]?\d+\.\d{1,2}$/.test(str)) {
    const val = parseFloat(str);
    return Number.isFinite(val) ? Math.round(val * 100) / 100 : null;
  }

  // Plain integer: e.g. 420 or 1500
  if (/^[+-]?\d+$/.test(str)) {
    const val = parseFloat(str);
    return Number.isFinite(val) ? val : null;
  }

  // General fallback: replace all commas if period exists, or convert last comma to period
  if (str.includes(',') && str.includes('.')) {
    if (str.lastIndexOf(',') > str.lastIndexOf('.')) {
      // 1.234,56
      str = str.replace(/\./g, '').replace(',', '.');
    } else {
      // 1,234.56
      str = str.replace(/,/g, '');
    }
  } else if (str.includes(',')) {
    str = str.replace(',', '.');
  }

  const val = parseFloat(str);
  return Number.isFinite(val) ? Math.round(val * 100) / 100 : null;
}

/**
 * Helper to format two-digit numbers with leading zeros.
 * @param {number} n
 * @returns {string}
 */
function pad2(n) {
  return String(n).padStart(2, '0');
}

/**
 * Validates whether year, month, and day represent a calendar date.
 * @param {number} y
 * @param {number} m
 * @param {number} d
 * @returns {boolean}
 */
function isValidDate(y, m, d) {
  if (y < 1970 || y > 2099) return false;
  if (m < 1 || m > 12) return false;
  if (d < 1 || d > 31) return false;
  const daysInMonth = new Date(y, m, 0).getDate();
  return d <= daysInMonth;
}

/**
 * Canonicalizes raw date text into ISO standard format: YYYY-MM-DD.
 * Resolves regional format ambiguities (DD/MM vs MM/DD) using currency hints.
 *
 * @param {string} dateStr - Raw date string.
 * @param {string} [currencyHint='INR'] - Currency code ('USD', 'EUR', 'INR', 'GBP', etc.)
 * @returns {string|null} ISO date string (YYYY-MM-DD) or null.
 */
function canonicalizeDate(dateStr, currencyHint = 'INR') {
  if (typeof dateStr !== 'string') return null;
  const raw = dateStr.trim();
  if (!raw) return null;

  // 1. ISO format: YYYY-MM-DD or YYYY/MM/DD
  const isoMatch = raw.match(/\b(20\d{2})[-/.](0[1-9]|1[0-2])[-/.](0[1-9]|[12]\d|3[01])\b/);
  if (isoMatch) {
    const y = parseInt(isoMatch[1], 10);
    const m = parseInt(isoMatch[2], 10);
    const d = parseInt(isoMatch[3], 10);
    if (isValidDate(y, m, d)) {
      return `${y}-${pad2(m)}-${pad2(d)}`;
    }
  }

  // 2. Named month format: 23-Jul-2026, 23 July 2026, July 23, 2026
  const namedMatch1 = raw.match(/\b(0?[1-9]|[12]\d|3[01])[-/\s.]([A-Za-z]{3,9})[-/\s.](20\d{2})\b/);
  if (namedMatch1) {
    const d = parseInt(namedMatch1[1], 10);
    const mStr = namedMatch1[2].toLowerCase();
    const y = parseInt(namedMatch1[3], 10);
    const m = MONTH_NAMES[mStr];
    if (m && isValidDate(y, m, d)) {
      return `${y}-${pad2(m)}-${pad2(d)}`;
    }
  }

  const namedMatch2 = raw.match(/\b([A-Za-z]{3,9})\s+(0?[1-9]|[12]\d|3[01]),?\s+(20\d{2})\b/);
  if (namedMatch2) {
    const mStr = namedMatch2[1].toLowerCase();
    const d = parseInt(namedMatch2[2], 10);
    const y = parseInt(namedMatch2[3], 10);
    const m = MONTH_NAMES[mStr];
    if (m && isValidDate(y, m, d)) {
      return `${y}-${pad2(m)}-${pad2(d)}`;
    }
  }

  // 3. European dot format: DD.MM.YYYY
  const dotMatch = raw.match(/\b(0?[1-9]|[12]\d|3[01])\.(0?[1-9]|1[0-2])\.(20\d{2}|\d{2})\b/);
  if (dotMatch) {
    const d = parseInt(dotMatch[1], 10);
    const m = parseInt(dotMatch[2], 10);
    let y = parseInt(dotMatch[3], 10);
    if (y < 100) y += 2000;
    if (isValidDate(y, m, d)) {
      return `${y}-${pad2(m)}-${pad2(d)}`;
    }
  }

  // 4. Slash / hyphen format: DD/MM/YYYY vs MM/DD/YYYY
  const slashMatch = raw.match(/\b(0?[1-9]|[12]\d|3[01])[-/](0?[1-9]|[12]\d|3[01])[-/](20\d{2}|\d{2})\b/);
  if (slashMatch) {
    const p1 = parseInt(slashMatch[1], 10);
    const p2 = parseInt(slashMatch[2], 10);
    let y = parseInt(slashMatch[3], 10);
    if (y < 100) y += 2000;

    let day, month;
    if (p1 > 12 && p2 <= 12) {
      // Definitely DD/MM
      day = p1;
      month = p2;
    } else if (p2 > 12 && p1 <= 12) {
      // Definitely MM/DD
      day = p2;
      month = p1;
    } else {
      // Ambiguous: use currencyHint
      const isUsLocale = currencyHint === 'USD' || currencyHint === 'CAD' || currencyHint === '$';
      if (isUsLocale) {
        month = p1;
        day = p2;
      } else {
        day = p1;
        month = p2;
      }
    }

    if (isValidDate(y, month, day)) {
      return `${y}-${pad2(month)}-${pad2(day)}`;
    }
  }

  return null;
}

/**
 * Classifies tax tokens and rates in receipt lines (DACH MwSt/USt, Indian GST, Sales Tax).
 *
 * @param {string} lineOrToken - Line or token containing tax text.
 * @returns {{
 *   isTax: boolean,
 *   type: 'GST'|'VAT'|'SALES_TAX'|'OTHER'|null,
 *   ratePercent: number|null,
 *   amount: number|null,
 *   raw: string
 * }}
 */
function classifyTaxToken(lineOrToken) {
  if (typeof lineOrToken !== 'string') {
    return { isTax: false, type: null, ratePercent: null, amount: null, raw: '' };
  }
  const raw = lineOrToken.trim();
  const lower = raw.toLowerCase();

  let type = null;
  let ratePercent = null;
  let amount = null;

  // Rate extraction e.g. "19%", "7.0%", "9 %", "18%"
  const rateMatch = raw.match(/(\d+(?:\.\d+)?)\s*%/);
  if (rateMatch) {
    ratePercent = parseFloat(rateMatch[1]);
  }

  // Amount extraction e.g. "3,80 EUR", "₹116.91", "$1.10"
  const amtMatch = raw.match(/(?:[₹$€£¥]|EUR|USD|INR|GBP)?\s*([-+]?\d+(?:[.,]\d{2}))(?:\s*(?:[₹$€£¥]|EUR|USD|INR|GBP))?/i);
  if (amtMatch) {
    amount = normalizeAmount(amtMatch[1]);
  }

  // DACH / EU VAT
  if (/\b(?:mwst|ust|mehrwertsteuer|vat|iva|tva)\b/i.test(lower)) {
    type = 'VAT';
  }
  // Indian GST
  else if (/\b(?:cgst|sgst|igst|gstin|gst)\b/i.test(lower)) {
    type = 'GST';
  }
  // US / General Sales Tax
  else if (/\b(?:sales\s*tax|state\s*tax|city\s*tax|tax)\b/i.test(lower)) {
    type = 'SALES_TAX';
  } else if (ratePercent !== null || /\btax\b/i.test(lower)) {
    type = 'OTHER';
  }

  return {
    isTax: type !== null,
    type,
    ratePercent,
    amount,
    raw
  };
}

/**
 * Default bounding boxes (in percentages 0-100) for receipt fields.
 */
const DEFAULT_BOUNDING_BOXES = Object.freeze({
  merchant: { top: 8, left: 15, width: 70, height: 8 },
  date: { top: 18, left: 15, width: 35, height: 6 },
  category: { top: 25, left: 15, width: 40, height: 6 },
  tax: { top: 70, left: 50, width: 35, height: 6 },
  total: { top: 78, left: 50, width: 35, height: 8 },
  paymentMethod: { top: 86, left: 20, width: 60, height: 6 }
});

/**
 * Returns the default standardized bounding box for a given field name.
 *
 * @param {string} field - Field name ('merchant', 'date', 'total', 'tax', etc.)
 * @returns {{ top: number, left: number, width: number, height: number }}
 */
function getDefaultBoundingBox(field) {
  return DEFAULT_BOUNDING_BOXES[field] ? { ...DEFAULT_BOUNDING_BOXES[field] } : { top: 0, left: 0, width: 100, height: 10 };
}

/**
 * Normalizes bounding box coordinates into valid percentage dimensions (0 to 100).
 * Handles pixel coordinate conversion if document dimensions are provided.
 *
 * @param {Object} box - Box with { top, left, width, height } or { x, y, width, height }
 * @param {{ width: number, height: number }} [docDimensions] - Optional reference dimensions in pixels
 * @returns {{ top: number, left: number, width: number, height: number }}
 */
function normalizeBoundingBox(box, docDimensions = { width: 100, height: 100 }) {
  if (!box || typeof box !== 'object') {
    return { top: 0, left: 0, width: 100, height: 100 };
  }

  const docW = docDimensions && docDimensions.width > 0 ? docDimensions.width : 100;
  const docH = docDimensions && docDimensions.height > 0 ? docDimensions.height : 100;

  let left = box.left !== undefined ? box.left : (box.x !== undefined ? box.x : 0);
  let top = box.top !== undefined ? box.top : (box.y !== undefined ? box.y : 0);
  let width = box.width !== undefined ? box.width : 100;
  let height = box.height !== undefined ? box.height : 100;

  // Convert pixel coordinates to percentage if values exceed 100 or docDimensions are pixel-scale
  if (docW > 100 || docH > 100 || left > 100 || top > 100 || width > 100 || height > 100) {
    left = (left / docW) * 100;
    top = (top / docH) * 100;
    width = (width / docW) * 100;
    height = (height / docH) * 100;
  }

  // Clamp within [0, 100] bounds with 2 decimal precision
  const clamp = (val, min, max) => Math.max(min, Math.min(max, val));
  const round2 = val => Math.round(val * 100) / 100;

  const clampLeft = round2(clamp(left, 0, 100));
  const clampTop = round2(clamp(top, 0, 100));
  const clampWidth = round2(clamp(width, 0, 100 - clampLeft));
  const clampHeight = round2(clamp(height, 0, 100 - clampTop));

  return {
    top: clampTop,
    left: clampLeft,
    width: Math.max(1, clampWidth),
    height: Math.max(1, clampHeight)
  };
}

module.exports = {
  segmentLines,
  cleanToken,
  stripCurrencySymbols,
  normalizeAmount,
  canonicalizeDate,
  classifyTaxToken,
  normalizeBoundingBox,
  getDefaultBoundingBox,
  DEFAULT_BOUNDING_BOXES
};
