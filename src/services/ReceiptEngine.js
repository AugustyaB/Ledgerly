/**
 * ============================================================================
 * Ledgerly — ReceiptEngine (Unified Perception & Receipt Intelligence Engine)
 * ============================================================================
 *
 * @fileoverview
 * Unified on-device receipt processing, perception, and document intelligence engine
 * for Ledgerly (Milestone v1.2.0 Phase 1 — Sec 3, Layer L3).
 *
 * Consolidates perception pipelines into a single, cohesive, 100% offline engine:
 * - Pure helper routines via receiptNormalizer.js
 * - Omni-regional parsing: DACH VAT (MwSt, USt), Indian GSTIN/CGST/SGST, US/UK/EU currencies
 * - Field confidence computation (merchant, date, total, tax) with low-confidence flagging
 * - Mirage OCR bounding box alignment & amber confidence box positioning
 * - Merchant learning & dynamic vendor layout memory
 * - Multi-page smart document classification
 */

'use strict';

const path = require('path');
const fs = require('fs');
const DocumentNormalizer = require('./DocumentNormalizer');
const receiptNormalizer = require('./receiptNormalizer');
const { CategoryMatcher } = require('../categoryMatcher');
const ReceiptLearningService = require('./ReceiptLearningService');
const smartDocumentAnalyzer = require('./SmartDocumentAnalyzer');
const { ErrorCode } = require('../constants');

// Dynamic requirement of tesseract.js for offline WASM OCR
let tesseractModule = null;
try {
  tesseractModule = require('tesseract.js');
} catch {
  // Graceful fallback if tesseract.js is unavailable in pure testing contexts
}

/**
 * Standard currency symbols map.
 */
const CURRENCY_SYMBOLS = Object.freeze({
  INR: '₹',
  USD: '$',
  EUR: '€',
  GBP: '£',
  JPY: '¥',
  AUD: 'A$',
  CAD: 'CA$'
});

/**
 * Common merchant header boilerplate terms to strip out when resolving vendor name.
 */
const BOILERPLATE_HEADER_PATTERNS = [
  /^(tax\s+invoice|retail\s+invoice|tax\s+receipt|invoice|bill|cash\s+bill|cash\s+receipt|receipt)$/i,
  /^(original\s+for\s+recipient|duplicate\s+for\s+transporter|triplicate\s+for\s+supplier)$/i,
  /^(bill\s+of\s+supply|gst\s+invoice|e-way\s+bill|order\s+receipt)$/i,
  /^(welcome|thank\s+you|thanks\s+for\s+visiting|have\s+a\s+nice\s+day)$/i,
  /^(customer\s+copy|merchant\s+copy|pos\s+slip|terminal\s+slip)$/i,
  /^(order\s+id|invoice\s+no|bill\s+no|token\s+no|table\s+no)[:\s]/i,
  /^(tel|phone|ph|mobile|email|website|gstin|gst\s*(?:reg\.?\s*)?no)[:\s]/i,
  /^(trade\s*\/?\s*legal\s*name|seller|client|vendor|customer|buyer|billed\s+to|shipped\s+to)(?:[:\s]|$)/i,
  /^(date\s+of\s+issue|issue\s+date|invoice\s+date|due\s+date)(?:[:\s]|$)/i,
  /^(tax\s*id|vat\s*id|vat\s*no|iban|swift|bic)(?:[:\s]|$)/i,
  /^(summary|items|description|qty|subtotal|gross\s*worth|net\s*worth)(?:[:\s]|$)/i,
  /^(billing\s+address|shipping\s+address)(?:[:\s]|$)/i,
  /^(google\s*pay|phonepe|paytm|bhim|upi\s+transaction|payment\s+successful|completed|paid\s+successfully)$/i,
  /^[- \s]*page\s+\d+(\s+of\s+\d+)?[- \s]*$/i
];

/**
 * Financial keyword lexicon for transaction verification.
 */
const FINANCIAL_KEYWORDS = Object.freeze([
  'total',
  'subtotal',
  'amount',
  'paid',
  'invoice',
  'receipt',
  'bill',
  'due',
  'balance',
  'gst',
  'tax',
  'cgst',
  'sgst',
  'igst',
  'vat',
  'mwst',
  'ust',
  'hsn',
  'mrp',
  'cash',
  'card',
  'payment',
  'order',
  'price',
  'qty',
  'rate',
  'debit',
  'credit',
  'upi',
  'gpay',
  'phonepe',
  'paytm',
  'bhim',
  'netbanking'
]);

class ReceiptEngine {
  /**
   * @param {Object} [options]
   * @param {DocumentNormalizer} [options.normalizer]
   * @param {CategoryMatcher} [options.categoryMatcher]
   * @param {ReceiptLearningService} [options.receiptLearning]
   * @param {ReceiptLearningService} [options.learningService]
   * @param {Object} [options.smartDocumentAnalyzer]
   * @param {string} [options.configPath]
   * @param {string} [options.localModelDir]
   */
  constructor(options = {}) {
    this.normalizer = options.normalizer || new DocumentNormalizer();
    this.categoryMatcher = options.categoryMatcher || new CategoryMatcher();
    this.receiptLearning =
      options.receiptLearning ||
      options.learningService ||
      (options.configPath ? new ReceiptLearningService({ configPath: options.configPath }) : new ReceiptLearningService());
    this.smartDocumentAnalyzer = options.smartDocumentAnalyzer || smartDocumentAnalyzer;

    this._worker = null;
    this._workerInitPromise = null;
    this._localModelDir = options.localModelDir || path.join(__dirname, '..', '..', 'assets', 'models', 'tesseract');
  }

  // ==========================================================================
  // 1. Worker Lifecycle Management (Lazy Loaded & Offline)
  // ==========================================================================

  /**
   * Initializes or returns the cached offline Tesseract WASM worker.
   *
   * @returns {Promise<any|null>}
   */
  async getWorker() {
    if (this._worker) return this._worker;
    if (this._workerInitPromise) return this._workerInitPromise;
    if (!tesseractModule || !tesseractModule.createWorker) return null;

    this._workerInitPromise = (async () => {
      try {
        const trainedDataExists = fs.existsSync(path.join(this._localModelDir, 'eng.traineddata'));
        const workerOptions = {
          cachePath: this._localModelDir,
          langPath: this._localModelDir,
          gzip: false,
          logger: () => {}
        };

        if (trainedDataExists) {
          const worker = await tesseractModule.createWorker('eng', 1, workerOptions);
          this._worker = worker;
          return worker;
        }

        const worker = await tesseractModule.createWorker('eng', 1, { logger: () => {} });
        this._worker = worker;
        return worker;
      } catch (err) {
        console.warn('[ReceiptEngine] OCR Worker initialization warning:', err.message);
        return null;
      } finally {
        this._workerInitPromise = null;
      }
    })();

    return this._workerInitPromise;
  }

  /**
   * Terminates background OCR worker to free resources.
   *
   * @returns {Promise<void>}
   */
  async terminateWorker() {
    if (this._worker) {
      try {
        await this._worker.terminate();
      } catch {
        // Ignore termination errors
      }
      this._worker = null;
    }
  }

  // ==========================================================================
  // 2. Primary Processing Pipeline
  // ==========================================================================

  /**
   * Primary entry point: processes receipt text, pre-normalized object, Buffer, or file.
   *
   * @param {string|Buffer|Uint8Array|Object} input
   * @param {Object} [options]
   * @returns {Promise<{ success: boolean, data: Object|null, error: string|null, code: string }>}
   */
  async processReceipt(input, options = {}) {
    const startTime = Date.now();

    try {
      let norm;
      const isExplicitFilePath =
        typeof input === 'string' &&
        !input.includes('\n') &&
        (/\.(png|jpe?g|webp|bmp|pdf)$/i.test(input) || input.includes('/') || input.includes('\\'));

      if (input && typeof input === 'object' && (input.fastPathText !== undefined || input.rawText !== undefined)) {
        norm = { success: true, data: input, error: null, code: 'OK' };
      } else if (typeof input === 'string' && !isExplicitFilePath && (input.includes('\n') || options.isFastPath)) {
        norm = { success: true, data: { fastPathText: input, rawText: input }, error: null, code: 'OK' };
      } else {
        norm = await this.normalizer.normalizeDocument(input, options);
      }

      if (!norm.success) {
        return {
          success: false,
          data: null,
          error: norm.error || 'Failed to normalize document.',
          code: norm.code || ErrorCode.INVALID_ARGUMENT
        };
      }

      const docData = norm.data;
      let rawText = '';
      let isVectorFastPath = false;

      if (docData.fastPathText || docData.rawText || docData.text) {
        rawText = docData.fastPathText || docData.rawText || docData.text;
        isVectorFastPath = Boolean(docData.isPdf && docData.hasFastPath);
      } else if (docData.isPdf) {
        return {
          success: false,
          data: null,
          error: 'PDF document contains no readable text streams.',
          code: ErrorCode.ERR_UNSUPPORTED_FORMAT
        };
      } else if (docData.processedBuffer || docData.documentBuffer || docData.imageBuffer) {
        const imageBuf = docData.processedBuffer || docData.documentBuffer || docData.imageBuffer;
        rawText = await this._extractOcrText(imageBuf, options);
      } else if (typeof input === 'string' && fs.existsSync(input)) {
        const fileBuf = fs.readFileSync(input);
        rawText = await this._extractOcrText(fileBuf, options);
      }

      if (!rawText || !rawText.trim()) {
        return {
          success: true,
          data: this._buildNegativeResult(
            'EMPTY_DOCUMENT_TEXT',
            'No legible text characters could be identified in this file.',
            rawText,
            Date.now() - startTime
          ),
          error: null,
          code: 'OK'
        };
      }

      const lines = receiptNormalizer.segmentLines(rawText);

      // Negative Transaction Gate
      const intentCheck = this.evaluateFinancialIntent(rawText, lines);
      if (!intentCheck.isTransaction) {
        return {
          success: true,
          data: this._buildNegativeResult(
            intentCheck.reason,
            intentCheck.message || 'No financial transactions detected in this file.',
            rawText,
            Date.now() - startTime,
            intentCheck.confidence,
            isVectorFastPath
          ),
          error: null,
          code: 'OK'
        };
      }

      // Currency Detection
      let currency = 'INR';
      const hasUSD = /(?:\$|\bUSD\b)/i.test(rawText);
      const hasEUR = /(?:€|\bEUR\b)/i.test(rawText);
      const hasGBP = /(?:£|\bGBP\b)/i.test(rawText);
      const hasJPY = /(?:¥|\bJPY\b)/i.test(rawText);
      const hasAUD = /(?:A\$|\bAUD\b)/i.test(rawText);
      const hasCAD = /(?:CA\$|\bCAD\b)/i.test(rawText);
      const hasINR = /(?:₹|\b(?:INR|Rs\.?)\b)/i.test(rawText);

      if (hasUSD && !hasINR) currency = 'USD';
      else if (hasEUR && !hasINR) currency = 'EUR';
      else if (hasGBP && !hasINR) currency = 'GBP';
      else if (hasJPY && !hasINR) currency = 'JPY';
      else if (hasAUD && !hasINR) currency = 'AUD';
      else if (hasCAD && !hasINR) currency = 'CAD';
      else if (hasINR) currency = 'INR';

      // Merchant Extraction & Learned Alias Resolution
      const merchantDetails = this.extractMerchantDetails(lines);
      // Tax & GSTIN Extraction
      const taxInfo = this.extractTaxAndGstin(lines, rawText);
      const layoutId = taxInfo.gstin || merchantDetails.merchant;
      let layoutMemory = this.receiptLearning ? this.receiptLearning.getLayout(layoutId) : null;
      if (!layoutMemory && taxInfo.gstin && this.receiptLearning) {
        layoutMemory = this.receiptLearning.getLayout(taxInfo.gstin);
      }
      if (!layoutMemory && merchantDetails.merchant && this.receiptLearning) {
        layoutMemory = this.receiptLearning.getLayout(merchantDetails.merchant);
      }

      // Check if layout memory provides canonicalMerchant for 100% repeat vendor accuracy
      if (layoutMemory && layoutMemory.canonicalMerchant && (!merchantDetails.aliasResolved || merchantDetails.confidence < 1.0)) {
        merchantDetails.merchant = layoutMemory.canonicalMerchant;
        merchantDetails.aliasResolved = true;
        merchantDetails.layoutResolved = true;
        merchantDetails.confidence = 1.0;
      }
      const merchant = merchantDetails.merchant;

      // Total & Subtotal Extraction
      const totalExtraction = this.extractTotal(lines, rawText, layoutMemory);
      const dateExtraction = this.extractDate(lines, rawText, layoutMemory, currency);
      const paymentMethod = this.extractPaymentMethod(rawText);
      const lineItems = this.extractLineItems(lines);
      const category = this.inferCategory(merchant, rawText, lineItems);

      // Subtotal + Tax == Total consistency check
      if (
        taxInfo.subtotal !== null &&
        taxInfo.taxAmount !== null &&
        totalExtraction.total !== null &&
        Math.abs(taxInfo.subtotal + taxInfo.taxAmount - totalExtraction.total) < 0.05
      ) {
        totalExtraction.confidence = Math.min(1.0, totalExtraction.confidence + 0.04);
        taxInfo.confidence = Math.min(1.0, taxInfo.confidence + 0.04);
      }

      // Repeat layout memory application
      let layoutMemoryApplied = false;
      if (layoutMemory) {
        if (
          (layoutMemory.totalAnchor && totalExtraction.anchorUsed === layoutMemory.totalAnchor) ||
          (layoutMemory.datePattern && dateExtraction.patternUsed === layoutMemory.datePattern)
        ) {
          layoutMemoryApplied = true;
        }
      }

      // Auto-learn vendor layout if confidence is high and anchor is explicit
      if (
        this.receiptLearning &&
        totalExtraction.anchorUsed &&
        totalExtraction.anchorUsed !== 'LARGEST_TAIL_FLOAT' &&
        totalExtraction.confidence >= 0.90 &&
        layoutId &&
        layoutId !== 'Unknown Merchant'
      ) {
        this.receiptLearning.learnLayout(layoutId, {
          totalAnchor: totalExtraction.anchorUsed,
          datePattern: dateExtraction.patternUsed || null,
          taxType: taxInfo.gstin ? 'GST' : taxInfo.taxAmount ? 'SALES_TAX' : null
        });
      }

      const totalAmount = totalExtraction.total;
      const subtotal = totalExtraction.subtotal !== null ? totalExtraction.subtotal : taxInfo.subtotal || null;
      const taxAmount = taxInfo.taxAmount;

      // Field Confidence Ratings
      const confidenceData = this.calculateConfidence(merchantDetails, dateExtraction, totalExtraction, taxInfo);
      const { fieldConfidence, lowConfidenceFields, overallConfidence } = confidenceData;

      // Mirage OCR Bounding Boxes alignment
      const boundingBoxes = {
        merchant: receiptNormalizer.getDefaultBoundingBox('merchant'),
        date: receiptNormalizer.getDefaultBoundingBox('date'),
        total: receiptNormalizer.getDefaultBoundingBox('total'),
        tax: receiptNormalizer.getDefaultBoundingBox('tax'),
        category: receiptNormalizer.getDefaultBoundingBox('category'),
        paymentMethod: receiptNormalizer.getDefaultBoundingBox('paymentMethod')
      };

      const elapsed = Date.now() - startTime;

      const resultData = {
        isTransaction: true,
        confidence: overallConfidence,
        overallConfidence: overallConfidence,
        fieldConfidence: fieldConfidence,
        lowConfidenceFields: lowConfidenceFields,
        boundingBoxes: boundingBoxes,
        aliasResolved: merchantDetails.aliasResolved,
        rawMerchant: merchantDetails.rawMerchant,
        layoutMemoryApplied: layoutMemoryApplied,
        merchant: merchant || 'Unknown Merchant',
        title: merchant || 'Unknown Merchant',
        date: dateExtraction.date || new Date().toISOString().split('T')[0],
        rawDate: dateExtraction.rawDate,
        total: totalAmount,
        amount: totalAmount !== null ? totalAmount : 0,
        subtotal: subtotal,
        tax: taxAmount,
        taxAmount: taxAmount,
        currency: currency,
        currencySymbol: CURRENCY_SYMBOLS[currency] || '₹',
        category: category,
        paymentMethod: paymentMethod,
        gstin: taxInfo.gstin,
        cgst: taxInfo.cgst,
        sgst: taxInfo.sgst,
        igst: taxInfo.igst,
        vatType: taxInfo.vatType,
        vatRate: taxInfo.vatRate,
        lineItems: lineItems,
        isVectorFastPath: isVectorFastPath,
        rawText: rawText,
        latencyMs: elapsed,
        metadata: {
          engineUsed: 'ReceiptEngine',
          lowConfidenceFields: lowConfidenceFields,
          boundingBoxes: boundingBoxes
        }
      };

      return {
        success: true,
        data: resultData,
        error: null,
        code: 'OK'
      };
    } catch (err) {
      return {
        success: false,
        data: null,
        error: `ReceiptEngine extraction failed: ${err.message}`,
        code: ErrorCode.INTERNAL_ERROR
      };
    }
  }

  /**
   * Alias to processReceipt for universal API convenience.
   */
  async parseReceipt(input, options = {}) {
    return this.processReceipt(input, options);
  }

  /**
   * Compatibility alias for ReceiptTier1Engine callers.
   */
  async processDocument(input, options = {}) {
    return this.processReceipt(input, options);
  }

  // ==========================================================================
  // 3. Confidence & Ambiguity Calculation
  // ==========================================================================

  /**
   * Computes granular field-level confidence ratings and tags low-confidence fields (<0.75).
   *
   * @param {Object} merchantDetails
   * @param {Object} dateExtraction
   * @param {Object} totalExtraction
   * @param {Object} taxInfo
   * @returns {{ fieldConfidence: Object, lowConfidenceFields: string[], overallConfidence: number }}
   */
  calculateConfidence(merchantDetails, dateExtraction, totalExtraction, taxInfo) {
    const merchantConf = Math.round((merchantDetails?.confidence || 0) * 100) / 100;
    const dateConf = Math.round(((dateExtraction?.confidence ?? (dateExtraction?.date ? 0.90 : 0.20)) || 0) * 100) / 100;
    const totalConf = Math.round((totalExtraction?.confidence || 0) * 100) / 100;
    const taxConf = Math.round((taxInfo?.confidence || 0.80) * 100) / 100;

    const fieldConfidence = {
      merchant: merchantConf,
      date: dateConf,
      total: totalConf,
      tax: taxConf
    };

    const lowConfidenceFields = Object.keys(fieldConfidence).filter(
      field => fieldConfidence[field] < 0.75
    );

    const overallConfidence =
      Math.round(
        (fieldConfidence.total * 0.40 +
          fieldConfidence.merchant * 0.30 +
          fieldConfidence.date * 0.20 +
          fieldConfidence.tax * 0.10) *
          100
      ) / 100;

    return { fieldConfidence, lowConfidenceFields, overallConfidence };
  }

  // ==========================================================================
  // 4. Learning & Layout Memory API
  // ==========================================================================

  /**
   * Learns a canonical merchant alias.
   *
   * @param {string} rawMerchant
   * @param {string} canonicalMerchant
   * @returns {boolean}
   */
  learnMerchantAlias(rawMerchant, canonicalMerchant) {
    if (this.receiptLearning && typeof this.receiptLearning.learnAlias === 'function') {
      return this.receiptLearning.learnAlias(rawMerchant, canonicalMerchant);
    }
    return false;
  }

  /**
   * Resolves a raw merchant name against learned aliases.
   *
   * @param {string} rawMerchant
   * @returns {{ resolved: boolean, name: string }}
   */
  resolveMerchantAlias(rawMerchant) {
    if (this.receiptLearning && typeof this.receiptLearning.resolveAlias === 'function') {
      return this.receiptLearning.resolveAlias(rawMerchant);
    }
    return { resolved: false, name: rawMerchant };
  }

  /**
   * Returns all learned merchant aliases.
   *
   * @returns {Object.<string, string>}
   */
  getLearnedAliases() {
    if (this.receiptLearning && typeof this.receiptLearning.getAliases === 'function') {
      return this.receiptLearning.getAliases();
    }
    return {};
  }

  /**
   * Learns layout characteristics for a specific merchant.
   *
   * @param {string} identifier
   * @param {Object} layoutData
   * @returns {boolean}
   */
  learnLayout(identifier, layoutData) {
    if (this.receiptLearning && typeof this.receiptLearning.learnLayout === 'function') {
      return this.receiptLearning.learnLayout(identifier, layoutData);
    }
    return false;
  }

  /**
   * Retrieves learned layout for a specific merchant.
   *
   * @param {string} identifier
   * @returns {Object|null}
   */
  getLayout(identifier) {
    if (this.receiptLearning && typeof this.receiptLearning.getLayout === 'function') {
      return this.receiptLearning.getLayout(identifier);
    }
    return null;
  }

  /**
   * Learns alias and structural layout from a user correction.
   *
   * @param {Object} correction
   * @returns {{ success: boolean, aliasLearned?: boolean, layoutLearned?: boolean, layout?: Object }}
   */
  learnFromCorrection(correction) {
    if (this.receiptLearning && typeof this.receiptLearning.learnFromCorrection === 'function') {
      return this.receiptLearning.learnFromCorrection(correction);
    }
    return { success: false, error: 'ReceiptLearningService not available' };
  }

  // ==========================================================================
  // 5. Smart Multi-Page Document Classification
  // ==========================================================================

  /**
   * Classifies a document or pages into invoice, multiple-bills, or statement.
   *
   * @param {Array<{ pageNumber: number, text: string }>} pages
   * @param {string} [filename='']
   * @returns {Object}
   */
  classifyDocumentStructure(pages, filename = '') {
    if (this.smartDocumentAnalyzer && typeof this.smartDocumentAnalyzer.classify === 'function') {
      return this.smartDocumentAnalyzer.classify(pages, filename);
    }
    return {
      type: 'invoice',
      confidence: 0.9,
      rationale: 'Single receipt processed.',
      pageCount: Array.isArray(pages) ? pages.length : 1,
      suggestedAction: 'Process as single receipt.'
    };
  }

  // ==========================================================================
  // 6. Extraction Attention Routines
  // ==========================================================================

  /**
   * Evaluates financial intent to prevent false positive hallucinations.
   *
   * @param {string} text
   * @param {string[]} lines
   * @returns {{ isTransaction: boolean, confidence: number, reason: string, message: string }}
   */
  evaluateFinancialIntent(text, lines) {
    if (!text || lines.length < 2) {
      return {
        isTransaction: false,
        confidence: 0.98,
        reason: 'INSUFFICIENT_DOCUMENT_LINES',
        message: 'Document contains insufficient content to identify a transaction.'
      };
    }

    const lower = text.toLowerCase();
    let keywordCount = 0;
    for (const kw of FINANCIAL_KEYWORDS) {
      if (lower.includes(kw)) keywordCount++;
    }

    const hasDecimalPrice = /\b\d{1,6}[.,]\d{2}\b/.test(text);
    const hasCurrencySymbol = /(?:₹|rs\.?|inr|\$|eur|€|£|¥)/i.test(text);
    const hasTaxStructure = /(?:gst|cgst|sgst|igst|vat|mwst|ust|tax|hsn)/i.test(text);
    const hasTotalStructure =
      /(?:grand\s*total|total\s*paid|net\s*amount|amount\s*due|total\s*amount|subtotal|total|amount\s*[:=]|amount\s*paid|paid\s*to|payment\s*to|paid\s*successfully|zwischensumme|gesamtsumme|summe|endbetrag)/i.test(
        lower
      );

    const hasNonFinancialSignals = [
      /\b(?:chapter|abstract|introduction|conclusion|literature\s+review)\b/i.test(lower),
      /\b(?:microservices|git\s+commit|pull\s+request|npm\s+run|function\s*\()\b/i.test(lower),
      /\b(?:meeting\s+minutes|quarterly\s+objectives|sprint\s+velocity|agenda)\b/i.test(lower),
      /\b(?:recipe|ingredients|bake|autolyse|sourdough)\b/i.test(lower),
      /\b(?:patient|diagnosis|blood\s+pressure|randomized\s+controlled)\b/i.test(lower),
      /\b(?:landscape|mountain|sunset|photography\s+series)\b/i.test(lower)
    ];

    const nonFinancialHitCount = hasNonFinancialSignals.filter(Boolean).length;

    const financialScore =
      (hasTotalStructure ? 0.45 : 0.0) +
      (hasDecimalPrice ? 0.25 : 0.0) +
      (hasTaxStructure ? 0.15 : 0.0) +
      (hasCurrencySymbol ? 0.1 : 0.0) +
      Math.min(keywordCount, 5) * 0.05 -
      nonFinancialHitCount * 0.35;

    if (financialScore >= 0.55 && (hasTotalStructure || (hasDecimalPrice && keywordCount >= 2))) {
      return {
        isTransaction: true,
        confidence: Math.min(0.96, Math.max(0.65, financialScore)),
        reason: 'FINANCIAL_TRANSACTION_CONFIRMED',
        message: 'Valid financial transaction detected.'
      };
    }

    return {
      isTransaction: false,
      confidence: Math.min(0.98, Math.max(0.85, 1.0 - financialScore)),
      reason: 'NO_FINANCIAL_TRANSACTION_DETECTED',
      message: 'No financial transactions detected in this file.'
    };
  }

  /**
   * Extracts total and subtotal amounts.
   *
   * @param {string[]} lines
   * @param {string} fullText
   * @param {Object|null} [layoutMemory=null]
   * @returns {{ total: number|null, subtotal: number|null, confidence: number, anchorUsed: string|null }}
   */
  extractTotal(lines, fullText, layoutMemory = null) {
    let grandTotal = null;
    let subtotal = null;
    let anchorUsed = null;
    let confidence = 0.0;

    // Check learned vendor layout anchor first
    if (layoutMemory && layoutMemory.totalAnchor) {
      try {
        const escapedAnchor = layoutMemory.totalAnchor
          .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          .replace(/\s+/g, '\\s*');
        const customAnchorRegex = new RegExp(
          `(?:^|\\s)(?:${escapedAnchor})\\s*[:=]?\\s*(?:₹|rs\\.?|inr|usd|\\$|eur|€|gbp|£)?\\s*([0-9]{1,3}(?:[.,][0-9]{3})*[.,][0-9]{2}|[0-9]{1,6}[.,][0-9]{2})(?:\\s*(?:₹|rs\\.?|inr|usd|\\$|eur|€|gbp|£))?`,
          'i'
        );

        for (let i = lines.length - 1; i >= 0; i--) {
          const match = lines[i].match(customAnchorRegex);
          if (match) {
            grandTotal = receiptNormalizer.normalizeAmount(match[1]);
            anchorUsed = layoutMemory.totalAnchor;
            confidence = 0.96;
            break;
          }
        }
      } catch {
        // Fallback
      }
    }

    const explicitTotalRegex =
      /(?:grand\s*total|total\s*paid|net\s*payable|amount\s*due|invoice\s*total|final\s*bill|total\s*amount|total\s*inr|total\s*usd|total\s*eur|total\s*gbp|amount\s*paid|gross\s*worth|gross|amount|gesamtsumme|gesamtbetrag|endbetrag|rechnungsbetrag|zu\s*zahlen)\s*[:=]?\s*(?:₹|rs\.?|inr|usd|\$|eur|€|gbp|£)?\s*([0-9]{1,3}(?:[.,][0-9]{3})+(?:[.,][0-9]{2})?|[0-9]{1,3}(?:[.,][0-9]{3})*[.,][0-9]{2}|[0-9]{1,6}[.,][0-9]{2}|[0-9]{2,8})(?:\s*(?:₹|rs\.?|inr|usd|\$|eur|€|gbp|£))?/i;

    const standardTotalRegex =
      /(?:^|\s)(?:total|balance|net|paid|summe)\s*[:=]?\s*(?:₹|rs\.?|inr|usd|\$|eur|€|gbp|£)?\s*([0-9]{1,3}(?:[.,][0-9]{3})+(?:[.,][0-9]{2})?|[0-9]{1,3}(?:[.,][0-9]{3})*[.,][0-9]{2}|[0-9]{1,6}[.,][0-9]{2}|[0-9]{2,8})(?:\s*(?:₹|rs\.?|inr|usd|\$|eur|€|gbp|£))?/i;

    const subtotalRegex =
      /(?:subtotal|sub-total|item\s+total|items\s+total|zwischensumme|netto|warenwert)\s*[:=]?\s*(?:₹|rs\.?|inr|usd|\$|eur|€|gbp|£)?\s*([0-9]{1,3}(?:[.,][0-9]{3})+(?:[.,][0-9]{2})?|[0-9]{1,3}(?:[.,][0-9]{3})*[.,][0-9]{2}|[0-9]{1,6}[.,][0-9]{2}|[0-9]{2,8})(?:\s*(?:₹|rs\.?|inr|usd|\$|eur|€|gbp|£))?/i;

    const analyzeMultiPriceLine = (line) => {
      const numMatches = line.match(/(?:[0-9]{1,3}(?:[.,][0-9]{3})+(?:[.,][0-9]{2})?|[0-9]{1,3}(?:[.,][0-9]{3})*[.,][0-9]{2}|[0-9]{1,6}[.,][0-9]{2}|[0-9]{2,8})/g);
      if (numMatches && numMatches.length >= 2) {
        const parsedVals = numMatches
          .map(m => receiptNormalizer.normalizeAmount(m))
          .filter(v => v !== null && v > 0);

        if (parsedVals.length >= 3) {
          const net = parsedVals[0];
          const tax = parsedVals[1];
          const gross = parsedVals[parsedVals.length - 1];
          if (Math.abs(net + tax - gross) <= 0.05) {
            return { subtotal: net, tax, total: gross };
          }
          const maxVal = Math.max(...parsedVals);
          if (gross === maxVal && maxVal > net) {
            return { subtotal: net, total: gross };
          }
        } else if (parsedVals.length === 2) {
          if (parsedVals[1] > parsedVals[0]) {
            return { subtotal: parsedVals[0], total: parsedVals[1] };
          }
        }
      }
      return null;
    };

    // 1. Reverse scan for explicit grand total and subtotal
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i];

      if (grandTotal === null) {
        if (/(?:grand\s*total|gross\s*worth|total|gesamtsumme|gesamtbetrag)\b/i.test(line)) {
          const multi = analyzeMultiPriceLine(line);
          if (multi) {
            grandTotal = multi.total;
            if (subtotal === null && multi.subtotal) subtotal = multi.subtotal;
            anchorUsed = anchorUsed || 'GROSS_MULTI_TOKEN';
            confidence = confidence || 0.95;
          }
        }

        if (grandTotal === null) {
          const expMatch = line.match(explicitTotalRegex);
          if (expMatch) {
            grandTotal = receiptNormalizer.normalizeAmount(expMatch[1]);
            const rawAnchor = expMatch[0].split(/[:=\d]/)[0].trim();
            anchorUsed = anchorUsed || rawAnchor;
            confidence = confidence || 0.94;
          }
        }
      }

      if (subtotal === null) {
        const subMatch = line.match(subtotalRegex);
        if (subMatch) {
          subtotal = receiptNormalizer.normalizeAmount(subMatch[1]);
        }
      }
    }

    // 2. Standard total
    if (grandTotal === null) {
      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i];
        if (/\b(?:cgst|sgst|igst|tax|vat|mwst|ust)\s*@?\s*[\d.,]+%/i.test(line)) continue;

        const stdMatch = line.match(standardTotalRegex);
        if (stdMatch) {
          const multi = analyzeMultiPriceLine(line);
          if (multi) {
            grandTotal = multi.total;
            if (subtotal === null && multi.subtotal) subtotal = multi.subtotal;
            anchorUsed = 'TOTAL_MULTI_TOKEN';
            confidence = 0.90;
            break;
          }
          grandTotal = receiptNormalizer.normalizeAmount(stdMatch[1]);
          const rawAnchor = stdMatch[0].split(/[:=\d]/)[0].trim();
          anchorUsed = rawAnchor;
          confidence = 0.85;
          break;
        }
      }
    }

    // 3. Fallback: scan last 6 lines for the largest valid floating point number
    if (grandTotal === null) {
      const tailLines = lines.slice(-6);
      const candidates = [];

      for (const line of tailLines) {
        if (/\b\d{4}[-/.]\d{1,2}[-/.]\d{1,2}\b/.test(line)) continue;
        if (/\b\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}\b/.test(line)) continue;
        if (/\b(?:gstin|order|tel|phone)\b/i.test(line)) continue;

        const nums = line.match(/\b\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{2})?\b|\b\d{1,6}[.,]\d{2}\b|\b\d{2,7}\b/g) || [];
        for (const num of nums) {
          const val = receiptNormalizer.normalizeAmount(num);
          if (val > 0 && val < 500000) {
            candidates.push(val);
          }
        }
      }

      if (candidates.length > 0) {
        grandTotal = Math.max(...candidates);
        anchorUsed = 'LARGEST_TAIL_FLOAT';
        confidence = 0.58;
      }
    }

    if (grandTotal !== null && subtotal !== null && subtotal > grandTotal) {
      const temp = grandTotal;
      grandTotal = subtotal;
      subtotal = temp;
    }

    return {
      total: grandTotal !== null ? Math.round(grandTotal * 100) / 100 : null,
      subtotal: subtotal !== null ? Math.round(subtotal * 100) / 100 : null,
      confidence: grandTotal !== null ? confidence : 0.0,
      anchorUsed
    };
  }

  /**
   * Extracts date from receipt text and normalizes to ISO standard YYYY-MM-DD.
   *
   * @param {string[]} lines
   * @param {string} fullText
   * @param {Object|null} [layoutMemory=null]
   * @param {string|null} [currencyHint='INR']
   * @returns {{ date: string|null, rawDate: string|null, confidence: number, patternUsed: string|null }}
   */
  extractDate(lines, fullText, layoutMemory = null, currencyHint = 'INR') {
    const preferredPattern = layoutMemory && layoutMemory.datePattern ? layoutMemory.datePattern.toUpperCase() : null;

    if (preferredPattern === 'DD/MM/YYYY' || preferredPattern === 'DD-MM-YYYY') {
      const match = fullText.match(/\b(0?[1-9]|[12]\d|3[01])[-/.](0?[1-9]|1[0-2])[-/.](20\d{2}|\d{2})\b/);
      if (match) {
        const canonical = receiptNormalizer.canonicalizeDate(match[0], 'EUR');
        if (canonical) {
          return { date: canonical, rawDate: match[0], confidence: 0.95, patternUsed: 'DD/MM/YYYY' };
        }
      }
    } else if (preferredPattern === 'MM/DD/YYYY' || preferredPattern === 'MM-DD-YYYY') {
      const match = fullText.match(/\b(0?[1-9]|1[0-2])[-/.](0?[1-9]|[12]\d|3[01])[-/.](20\d{2}|\d{2})\b/);
      if (match) {
        const canonical = receiptNormalizer.canonicalizeDate(match[0], 'USD');
        if (canonical) {
          return { date: canonical, rawDate: match[0], confidence: 0.95, patternUsed: 'MM/DD/YYYY' };
        }
      }
    }

    // Try ISO directly
    const isoMatch = fullText.match(/\b(20\d{2})[-/.](0?[1-9]|1[0-2])[-/.](0?[1-9]|[12]\d|3[01])\b/);
    if (isoMatch) {
      const canonical = receiptNormalizer.canonicalizeDate(isoMatch[0], currencyHint);
      if (canonical) {
        return { date: canonical, rawDate: isoMatch[0], confidence: 0.96, patternUsed: 'YYYY-MM-DD' };
      }
    }

    // Try textual month format (e.g. 14 Aug 2026 or 23-Jul-2026)
    const textMonthRegex =
      /\b(0?[1-9]|[12]\d|3[01])[-/\s]+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[-/,\s]+(20\d{2})\b/i;
    const textMatch = fullText.match(textMonthRegex);
    if (textMatch) {
      const canonical = receiptNormalizer.canonicalizeDate(textMatch[0], currencyHint);
      if (canonical) {
        return { date: canonical, rawDate: textMatch[0], confidence: 0.95, patternUsed: 'DD_MMM_YYYY' };
      }
    }

    // Search lines for any valid date token
    for (const line of lines) {
      const match = line.match(/\b\d{1,4}[-/.][A-Za-z0-9]{1,9}[-/.](?:20\d{2}|\d{2})\b/);
      if (match) {
        const canonical = receiptNormalizer.canonicalizeDate(match[0], currencyHint);
        if (canonical) {
          return { date: canonical, rawDate: match[0], confidence: 0.90, patternUsed: 'AUTO' };
        }
      }
    }

    return { date: null, rawDate: null, confidence: 0.0, patternUsed: null };
  }

  /**
   * Extracts merchant name, checks boilerplate exclusions, and queries learned alias store.
   *
   * @param {string[]} lines
   * @returns {{ merchant: string, rawMerchant: string, aliasResolved: boolean, confidence: number }}
   */
  extractMerchantDetails(lines) {
    if (!lines || lines.length === 0) {
      return { merchant: 'Unknown Merchant', rawMerchant: '', aliasResolved: false, confidence: 0.0 };
    }

    const candidates = lines.slice(0, 8);

    for (const rawLine of candidates) {
      const line = rawLine.trim();
      if (line.length < 2) continue;

      const isBoilerplate = BOILERPLATE_HEADER_PATTERNS.some(regex => regex.test(line));
      if (isBoilerplate) continue;

      if (/^\d{2}[A-Z]{5}\d{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/i.test(line)) continue;
      if (/^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}$/.test(line)) continue;
      if (/^[\d\s+\-()]{8,}$/.test(line)) continue;

      let cleanMerchant = line
        .replace(/^[#*->]+\s*/, '')
        .replace(/^(?:paid\s+to|payment\s+to|to:?)\s*/i, '')
        .replace(/\s*[,|-]\s*(?:branch|store|outlet|unit|no\.|plot|road|street|nagar).*$/i, '')
        .replace(/[:;]+$/, '')
        .trim();

      if (/[a-zA-Z]/.test(cleanMerchant) && cleanMerchant.length >= 3) {
        if (this.receiptLearning) {
          const aliasRes = this.receiptLearning.resolveAlias(cleanMerchant);
          if (aliasRes && aliasRes.resolved) {
            return {
              merchant: aliasRes.name,
              rawMerchant: cleanMerchant,
              aliasResolved: true,
              confidence: 1.0
            };
          }

          const layout = this.receiptLearning.getLayout(cleanMerchant);
          if (layout && layout.canonicalMerchant) {
            return {
              merchant: layout.canonicalMerchant,
              rawMerchant: cleanMerchant,
              aliasResolved: true,
              layoutResolved: true,
              confidence: 1.0
            };
          }
        }

        if (cleanMerchant === cleanMerchant.toUpperCase() && cleanMerchant.length > 3) {
          cleanMerchant = cleanMerchant
            .toLowerCase()
            .split(' ')
            .map(w => w.charAt(0).toUpperCase() + w.slice(1))
            .join(' ');
        }

        const isGoodLength = cleanMerchant.length >= 5;
        return {
          merchant: cleanMerchant,
          rawMerchant: line,
          aliasResolved: false,
          confidence: isGoodLength ? 0.88 : 0.70
        };
      }
    }

    const fallbackRaw = lines[0] || '';
    if (this.receiptLearning && fallbackRaw) {
      const aliasRes = this.receiptLearning.resolveAlias(fallbackRaw);
      if (aliasRes && aliasRes.resolved) {
        return {
          merchant: aliasRes.name,
          rawMerchant: fallbackRaw,
          aliasResolved: true,
          confidence: 1.0
        };
      }
    }

    return {
      merchant: fallbackRaw || 'Unknown Merchant',
      rawMerchant: fallbackRaw,
      aliasResolved: false,
      confidence: fallbackRaw ? 0.60 : 0.0
    };
  }

  /**
   * Backward-compatible merchant string extractor.
   *
   * @param {string[]} lines
   * @returns {string}
   */
  extractMerchant(lines) {
    return this.extractMerchantDetails(lines).merchant;
  }

  /**
   * Extracts Indian GSTIN, CGST/SGST/IGST breakdown, DACH MwSt/USt, or general sales tax.
   *
   * @param {string[]} lines
   * @param {string} fullText
   * @returns {{ gstin: string|null, cgst: number|null, sgst: number|null, igst: number|null, taxAmount: number|null, subtotal: number|null, vatType: string|null, vatRate: number|null, confidence: number }}
   */
  extractTaxAndGstin(lines, fullText) {
    let gstin = null;
    let cgst = null;
    let sgst = null;
    let igst = null;
    let taxAmount = null;
    let subtotal = null;
    let vatType = null;
    let vatRate = null;

    // Indian GSTIN
    const gstinMatch = fullText.match(/\b(\d{2}[A-Z]{5}\d{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1})\b/i);
    if (gstinMatch) {
      gstin = gstinMatch[1].toUpperCase();
    }

    for (const line of lines) {
      // CGST
      const cgstMatch = line.match(/CGST(?:\s*@?\s*[\d.]+%)?\s*[:=]?\s*(?:₹|rs\.?|inr|\$)?\s*(\d{1,6}(?:[.,]\d{2}))/i);
      if (cgstMatch) cgst = receiptNormalizer.normalizeAmount(cgstMatch[1]);

      // SGST
      const sgstMatch = line.match(/SGST(?:\s*@?\s*[\d.]+%)?\s*[:=]?\s*(?:₹|rs\.?|inr|\$)?\s*(\d{1,6}(?:[.,]\d{2}))/i);
      if (sgstMatch) sgst = receiptNormalizer.normalizeAmount(sgstMatch[1]);

      // IGST
      const igstMatch = line.match(/IGST(?:\s*@?\s*[\d.]+%)?\s*[:=]?\s*(?:₹|rs\.?|inr|\$)?\s*(\d{1,6}(?:[.,]\d{2}))/i);
      if (igstMatch) igst = receiptNormalizer.normalizeAmount(igstMatch[1]);

      // DACH / EU VAT / Sales Tax / General Tax
      const taxMatch = line.match(
        /(?:(?:inkl\.?\s*)?(?:[\d.,]+%\s*)?(?:tax\s*\/?\s*vat|vat\s*\/?\s*tax|mwst\s*\/?\s*vat|vat\s*\/?\s*mwst|mwst\s*\/?\s*ust|ust\s*\/?\s*mwst|sales\s+tax|total\s+tax|tax\s+amount|mehrwertsteuer|umsatzsteuer|mwst\.?(?:-satz|-betrag)?|ust\.?|\btax\b)(?:\s*@?\s*\(?[\d.,]+%\)?)?)\s*[:=]?\s*(?:₹|rs\.?|inr|usd|\$|eur|€|gbp|£)?\s*([0-9]{1,3}(?:[.,][0-9]{3})*[.,][0-9]{2}|[0-9]{1,6}[.,][0-9]{2})(?:\s*(?:₹|rs\.?|inr|usd|\$|eur|€|gbp|£))?/i
      );
      if (taxMatch && taxAmount === null) {
        taxAmount = receiptNormalizer.normalizeAmount(taxMatch[1]);
        const classified = receiptNormalizer.classifyTaxToken(line);
        if (classified.type) vatType = classified.type;
        if (classified.ratePercent) vatRate = classified.ratePercent;
      }

      // Subtotal / Zwischensumme
      const subMatch = line.match(
        /(?:subtotal|sub-total|zwischensumme|netto|warenwert)\s*[:=]?\s*(?:₹|rs\.?|inr|usd|\$|eur|€|gbp|£)?\s*([0-9]{1,3}(?:[.,][0-9]{3})*[.,][0-9]{2}|[0-9]{1,6}[.,][0-9]{2})(?:\s*(?:₹|rs\.?|inr|usd|\$|eur|€|gbp|£))?/i
      );
      if (subMatch && subtotal === null) {
        subtotal = receiptNormalizer.normalizeAmount(subMatch[1]);
      }
    }

    if (cgst !== null && sgst !== null) {
      taxAmount = Math.round((cgst + sgst) * 100) / 100;
    } else if (igst !== null) {
      taxAmount = igst;
    }

    let confidence = 0.80;
    if (gstin && (cgst !== null || sgst !== null)) {
      confidence = 0.98;
    } else if (gstin || (cgst !== null && sgst !== null) || taxAmount !== null) {
      confidence = 0.92;
    }

    return { gstin, cgst, sgst, igst, taxAmount, subtotal, vatType, vatRate, confidence };
  }

  /**
   * Infers payment method from text tokens.
   *
   * @param {string} text
   * @returns {string}
   */
  extractPaymentMethod(text) {
    const lower = text.toLowerCase();
    if (/\b(?:upi|gpay|google\s*pay|phonepe|paytm|bhim|upi\s+ref|utr)\b/i.test(lower)) {
      return 'UPI / GPay';
    }
    if (/\b(?:visa|mastercard|amex|rupay|credit\s+card|debit\s+card|card\s+ending|pos\s+sale)\b/i.test(lower)) {
      return 'Credit Card';
    }
    if (/\b(?:cash|tendered|change\s+due|cash\s+paid)\b/i.test(lower)) {
      return 'Cash';
    }
    if (/\b(?:neft|rtgs|imps|net\s*banking|bank\s+transfer|sepa|direct\s*debit)\b/i.test(lower)) {
      return 'Net Banking';
    }
    return 'UPI / GPay';
  }

  /**
   * Predicts expense category using CategoryMatcher.
   *
   * @param {string} merchant
   * @param {string} rawText
   * @param {Array<Object>} [lineItems]
   * @returns {string}
   */
  inferCategory(merchant, rawText, lineItems = []) {
    if (merchant && merchant !== 'Unknown Merchant') {
      const match = this.categoryMatcher.predictCategory(merchant);
      if (match) return match;
    }

    if (Array.isArray(lineItems)) {
      for (const item of lineItems) {
        if (item.description) {
          const match = this.categoryMatcher.predictCategory(item.description);
          if (match) return match;
        }
      }
    }

    const docMatch = this.categoryMatcher.predictCategory(rawText);
    if (docMatch) return docMatch;

    return 'Food & Dining';
  }

  /**
   * Parses tabular line items.
   *
   * @param {string[]} lines
   * @returns {Array<{ description: string, quantity: number, amount: number }>}
   */
  extractLineItems(lines) {
    const items = [];
    const itemRegex =
      /^(?:(\d+)[xX*]\s+)?([A-Za-z0-9\u00C0-\u017F\s&'%.-]{2,40}?)\s+(?:INR|USD|EUR|GBP|₹|\$|€)?\s*(\d{1,6}[.,]\d{2})(?:\s*(?:INR|USD|EUR|GBP|₹|\$|€))?$/i;

    let inItemsSection = false;

    for (const line of lines) {
      if (/^-{5,}|={5,}$/.test(line)) {
        inItemsSection = !inItemsSection;
        continue;
      }

      if (
        /(?:subtotal|grand\s*total|tax\s*invoice|cgst|sgst|gstin|zwischensumme|gesamtsumme|summe|endbetrag|mwst|ust|netto|gesamtbetrag|zu\s*zahlen)/i.test(
          line
        )
      ) {
        continue;
      }

      const match = line.match(itemRegex);
      if (match) {
        const qty = match[1] ? parseInt(match[1], 10) : 1;
        const desc = match[2].trim();
        const amt = receiptNormalizer.normalizeAmount(match[3]);

        if (amt && amt > 0 && desc.length >= 2) {
          items.push({
            description: desc,
            quantity: qty,
            amount: amt
          });
        }
      }
    }

    return items;
  }

  /**
   * Internal helper: runs OCR on image buffer if tesseract is available.
   *
   * @private
   * @param {Buffer} buffer
   * @param {Object} [options]
   * @returns {Promise<string>}
   */
  async _extractOcrText(buffer, options = {}) {
    if (!buffer || buffer.length === 0) return '';
    try {
      const worker = await this.getWorker();
      if (!worker) {
        return this._extractReadableAsciiFallback(buffer);
      }
      const { data } = await worker.recognize(buffer);
      return data?.text || '';
    } catch (err) {
      console.warn('[ReceiptEngine] OCR processing fallback:', err.message);
      return this._extractReadableAsciiFallback(buffer);
    }
  }

  /**
   * Cleans and parses a monetary string into a float.
   *
   * @param {string|number} str
   * @returns {number}
   */
  _parseCleanFloat(str) {
    const val = receiptNormalizer.normalizeAmount(str);
    return val !== null ? val : 0.0;
  }

  /**
   * Fast fallback extracting printable characters.
   *
   * @private
   * @param {Buffer} buffer
   * @returns {string}
   */
  _extractReadableAsciiFallback(buffer) {
    const minLength = 4;
    const str = buffer.toString('latin1');
    const matches = str.match(/[\x20-\x7E\r\n\t]{4,}/g) || [];
    return matches.filter(chunk => chunk.trim().length >= minLength).join('\n');
  }

  /**
   * Builds standardized negative rejection response.
   *
   * @private
   */
  _buildNegativeResult(reason, message, rawText, latencyMs, confidence = 0.95, isVectorFastPath = false) {
    return {
      isTransaction: false,
      confidence: confidence,
      overallConfidence: confidence,
      fieldConfidence: { merchant: 0.0, date: 0.0, total: 0.0, tax: 0.0 },
      lowConfidenceFields: ['merchant', 'date', 'total', 'tax'],
      reason,
      message,
      total: null,
      amount: null,
      subtotal: null,
      tax: null,
      taxAmount: null,
      merchant: null,
      title: null,
      date: null,
      category: null,
      paymentMethod: null,
      gstin: null,
      cgst: null,
      sgst: null,
      igst: null,
      lineItems: [],
      rawText,
      latencyMs,
      isVectorFastPath
    };
  }
}

module.exports = ReceiptEngine;
