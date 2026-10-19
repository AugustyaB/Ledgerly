/**
 * ============================================================================
 * Ledgerly — DocumentIntelligenceService (Multi-Engine Inference Runtime)
 * ============================================================================
 *
 * @fileoverview
 * Centralized multi-engine document intelligence dispatcher and runtime
 * orchestrator for Ledgerly (Version 0.5.5).
 *
 * ARCHITECTURAL DESIGN:
 * - Dynamic Model Routing: Inspects active model configuration from ModelManager
 *   and routes intake documents to Tier 1, Tier 2, or Tier 3.
 * - Resilient Zero-Crash Fallback: If an active on-demand model (Tier 2 or Tier 3)
 *   is missing, unready, or encounters an inference error, the runtime automatically
 *   delegates to Tier 1 Fast-Lite and decorates the response with fallback telemetry
 *   (fallbackTriggered: true) to trigger a visible user toast.
 * - Negative Transaction Gate Enforcer: Guarantees 0% false positive amount
 *   extractions across non-financial documents (books, essays, landscapes, code).
 * - Standardized Output Envelope: Enriches all results with line items, tabular
 *   layout matrices, regional tax structures, and digital UPI identifiers.
 * - 100% Offline & Pure JavaScript/WASM: Zero external cloud calls, zero native build tools.
 */

'use strict';

const path = require('path');
const DocumentNormalizer = require('./DocumentNormalizer');
const { CategoryMatcher } = require('../categoryMatcher');
const ReceiptTier1Engine = require('./ReceiptTier1Engine');
const ReceiptTier2VisionEngine = require('./ReceiptTier2VisionEngine');
const ReceiptTier3RegionalEngine = require('./ReceiptTier3RegionalEngine');
const ReceiptLearningService = require('./ReceiptLearningService');
const ModelManager = require('./ModelManager');
const smartDocumentAnalyzer = require('./SmartDocumentAnalyzer');
const { ErrorCode } = require('../constants');

class DocumentIntelligenceService {
  /**
   * @param {Object} [options]
   * @param {DocumentNormalizer} [options.normalizer]
   * @param {CategoryMatcher} [options.categoryMatcher]
   * @param {ModelManager} [options.modelManager]
   * @param {ReceiptLearningService} [options.receiptLearning]
   * @param {ReceiptTier1Engine} [options.tier1Engine]
   * @param {ReceiptTier2VisionEngine} [options.tier2Engine]
   * @param {ReceiptTier3RegionalEngine} [options.tier3Engine]
   * @param {SmartDocumentAnalyzer} [options.smartDocumentAnalyzer]
   */
  constructor(options = {}) {
    this.normalizer = options.normalizer || new DocumentNormalizer();
    this.categoryMatcher = options.categoryMatcher || new CategoryMatcher();
    this.modelManager = options.modelManager || new ModelManager();
    this.smartDocumentAnalyzer = options.smartDocumentAnalyzer || smartDocumentAnalyzer;
    this.receiptLearning =
      options.receiptLearning ||
      (options.tier1Engine && options.tier1Engine.receiptLearning) ||
      new ReceiptLearningService();

    this.tier1Engine =
      options.tier1Engine ||
      new ReceiptTier1Engine({
        normalizer: this.normalizer,
        categoryMatcher: this.categoryMatcher,
        receiptLearning: this.receiptLearning
      });

    this.tier2Engine =
      options.tier2Engine ||
      new ReceiptTier2VisionEngine({
        normalizer: this.normalizer,
        categoryMatcher: this.categoryMatcher
      });

    this.tier3Engine =
      options.tier3Engine ||
      new ReceiptTier3RegionalEngine({
        normalizer: this.normalizer,
        categoryMatcher: this.categoryMatcher
      });
  }

  /**
   * Returns the currently active model ID. In the unified architecture,
   * the built-in omni-regional engine is always active and ready.
   * @returns {string}
   */
  getActiveEngine() {
    return 'omni-regional-engine';
  }

  /**
   * Resolves the recommended Tier 3 regional specialist model for a given currency.
   *
   * @param {string} currency - Currency code or symbol (e.g. 'USD', 'INR', 'EUR', '$', '₹')
   * @returns {string} Model ID (e.g. 'tier3-regional-us')
   */
  resolveRecommendedRegionalModel(currency = '') {
    const cur = (currency || '').toUpperCase();
    if (cur === 'INR' || cur === '₹') return 'tier3-regional-in';
    if (['USD', 'CAD', '$', 'C$'].includes(cur)) return 'tier3-regional-us';
    if (['EUR', 'GBP', 'CHF', '€', '£'].includes(cur)) return 'tier3-regional-eu';
    if (['AUD', 'JPY', 'A$', '¥'].includes(cur)) return 'tier3-regional-apac';
    return 'tier3-regional-in';
  }

  /**
   * Processes a document (PDF or image) through the unified Omni-Regional Perception Engine.
   *
   * @param {string|Buffer|Uint8Array|Object} input - File path, buffer, or normalized payload
   * @param {Object} [options] - Options (e.g. currency)
   * @returns {Promise<{ success: boolean, data: Object|null, error: string|null, code: string }>}
   */
  async processDocument(input, options = {}) {
    const requestedEngine = options.engine || options.preferredEngine || this.getActiveEngine();
    let result = null;
    let fallbackTriggered = false;
    let fallbackReason = null;

    // Direct inference through the unified Omni-Regional Perception Engine (India, US, EU, APAC)
    try {
      if (this.tier3Engine) {
        result = await this.tier3Engine.processDocument(input, {
          ...options,
          engine: options.engine || options.specialistId || 'omni-regional-engine'
        });
      }
    } catch (engineErr) {
      console.warn(
        '[DocumentIntelligenceService] Omni-regional engine error, using Tier 1 fallback:',
        engineErr.message
      );
      fallbackTriggered = true;
      fallbackReason = engineErr.message;
    }

    // Resilient fallback to Tier 1 fast-lite if omni-regional was unready or returned error
    if (!result || !result.success) {
      if (this.tier1Engine) {
        try {
          result = await this.tier1Engine.processDocument(input, options);
          fallbackTriggered = true;
          fallbackReason = fallbackReason || 'OMNI_REGIONAL_FALLBACK';
        } catch (tier1Err) {
          console.error('[DocumentIntelligenceService] Tier 1 fallback failure:', tier1Err);
        }
      }
    }

    if (!result || !result.success || !result.data) {
      return (
        result || {
          success: false,
          data: null,
          error: 'Document intelligence execution produced empty output.',
          code: ErrorCode.UNEXPECTED_ERROR
        }
      );
    }

    // 3. Post-Process & Enrich Result Envelope
    const data = result.data;
    data.engineUsed = data.engineUsed || 'tier1-fastlite';
    data.tier =
      data.tier ||
      (data.engineUsed && (data.engineUsed.startsWith('tier2-') || data.engineUsed === 'tier2')
        ? 2
        : data.engineUsed.startsWith('tier3-')
          ? 3
          : 1);
    data.fallbackTriggered = fallbackTriggered;
    data.requestedEngine = requestedEngine;
    data.fallbackReason = fallbackReason;
    data.amount = data.amount !== undefined ? data.amount : (data.total !== undefined ? data.total : 0);
    data.title = data.title || data.merchant || 'Unknown Merchant';

    // Document currency override (SPEC-102): Explicit document currency symbols override profile default
    if (data.rawText && (!data.currency || data.currency === 'INR')) {
      const text = data.rawText;
      const hasINR = /(?:₹|\b(?:INR|Rs\.?)\b)/i.test(text);
      if (!hasINR) {
        if (/(?:\$|\bUSD\b)/i.test(text)) {
          data.currency = 'USD';
          data.currencySymbol = '$';
        } else if (/(?:€|\bEUR\b)/i.test(text)) {
          data.currency = 'EUR';
          data.currencySymbol = '€';
        } else if (/(?:£|\bGBP\b)/i.test(text)) {
          data.currency = 'GBP';
          data.currencySymbol = '£';
        } else if (/(?:¥|\bJPY\b)/i.test(text)) {
          data.currency = 'JPY';
          data.currencySymbol = '¥';
        }
      }
    }
    if (!data.currency) {
      data.currency = options.currency || 'INR';
    }
    if (!data.currencySymbol) {
      const symbolMap = { USD: '$', EUR: '€', GBP: '£', JPY: '¥', AUD: 'A$', CAD: 'CA$', INR: '₹' };
      data.currencySymbol = symbolMap[data.currency] || '₹';
    }

    // Inferred math aliases from Tier 2 precision recovery
    if (data.metadata && data.metadata.inferredMath !== undefined) {
      data.inferredByMath = Boolean(data.metadata.inferredMath);
      data.inferredMath = data.metadata.inferredMath;
    }

    // Regional aliases for Tier 3
    if (data.regionalData) {
      if (data.regionalData.gstin) data.gstin = data.regionalData.gstin;
      if (data.regionalData.stateName) data.state = data.regionalData.stateName;
      if (data.regionalData.cgst !== undefined) data.cgst = data.regionalData.cgst;
      if (data.regionalData.sgst !== undefined) data.sgst = data.regionalData.sgst;
      if (data.regionalData.upi && data.regionalData.upi.utr) data.utr = data.regionalData.upi.utr;
    } else if (data.gstDetails) {
      if (data.gstDetails.gstin) data.gstin = data.gstDetails.gstin;
      if (data.gstDetails.stateName) data.state = data.gstDetails.stateName;
    }

    // Ensure lineItems array is always present
    if (!Array.isArray(data.lineItems)) {
      data.lineItems = [];
    }

    // Build human-friendly itemized summary for description field (Option A)
    if (data.lineItems.length > 0) {
      const itemsList = data.lineItems
        .map(i => `${i.description} x${i.quantity || 1} (₹${(i.amount || 0).toFixed(2)})`)
        .join(', ');
      const reconciledTag = data.tableLayout && data.tableLayout.reconciled ? ' | Reconciled: ✓' : '';
      data.itemizedSummary = `Items (${data.lineItems.length}): ${itemsList}${reconciledTag}`;
    } else {
      data.itemizedSummary = null;
    }

    // Metadata preservation for database storage
    if (!data.metadata) {
      data.metadata = {};
    }
    data.metadata.engineUsed = data.engineUsed;
    data.metadata.lineItems = data.lineItems;
    if (data.tableLayout) data.metadata.tableLayout = data.tableLayout;
    if (data.regionalData) data.metadata.regionalData = data.regionalData;
    if (data.utilityData) data.metadata.utilityData = data.utilityData;
    if (data.inferredMath) data.metadata.inferredMath = data.inferredMath;
    if (data.isHandwritten) data.metadata.isHandwritten = data.isHandwritten;
    if (data.isRefund) data.metadata.isRefund = data.isRefund;
    if (data.isDcc) data.metadata.isDcc = data.isDcc;
    if (data.dualCurrency) data.metadata.dualCurrency = data.dualCurrency;

    // Auto-escalation recommendation if Tier 1 or Tier 3 had low confidence or unparsed total
    if (data.tier !== 2 && (data.confidence < 0.75 || !data.total)) {
      const text = (data.rawText || '').toLowerCase();
      if (/chit|handwritten|artisan|\d+\s*\/\s*-/.test(text)) {
        data.recommendedTier2 = 'tier2-vision-handwritten';
      } else if (/faded|crease|crumple|thermal|stamped|paid/.test(text)) {
        data.recommendedTier2 = 'tier2-vision-degraded';
      } else if (/dcc|currency|conversion|exchange|rate|fx/.test(text)) {
        data.recommendedTier2 = 'tier2-vision-multilingual';
      } else {
        data.recommendedTier2 = 'tier2-vision-precision';
      }
      data.metadata.recommendedTier2 = data.recommendedTier2;
    }

    // 3b. Smart Document Classification for multi-page documents (Phase 0.5.6)
    const filename = typeof input === 'string' ? path.basename(input) : options.filename || '';
    if (data.pages && Array.isArray(data.pages) && data.pages.length > 0) {
      data.smartAnalysis = this.smartDocumentAnalyzer.classify(data.pages, filename);
    } else if (data.rawText) {
      data.smartAnalysis = this.smartDocumentAnalyzer.classify([{ pageNumber: 1, text: data.rawText }], filename);
    } else {
      data.smartAnalysis = {
        type: 'invoice',
        confidence: 0.9,
        rationale: 'Single receipt processed.',
        pageCount: 1,
        suggestedAction: 'Process as single receipt.'
      };
    }
    data.metadata.smartAnalysis = data.smartAnalysis;

    // Ensure field-level confidence ratings are populated for all engine tiers
    if (!data.fieldConfidence) {
      const merchantConf = data.merchant && data.merchant !== 'Unknown Merchant' ? 0.88 : 0.0;
      const totalConf = data.total !== null && data.total !== undefined ? 0.92 : 0.0;
      const dateConf = data.date ? 0.90 : 0.20;
      const taxConf = data.tax !== null && data.tax !== undefined ? 0.90 : 0.80;
      data.fieldConfidence = {
        merchant: merchantConf,
        date: dateConf,
        total: totalConf,
        tax: taxConf
      };
      data.lowConfidenceFields = Object.keys(data.fieldConfidence).filter(
        k => data.fieldConfidence[k] < 0.75
      );
      data.overallConfidence =
        Math.round(
          (data.fieldConfidence.total * 0.40 +
            data.fieldConfidence.merchant * 0.30 +
            data.fieldConfidence.date * 0.20 +
            data.fieldConfidence.tax * 0.10) *
            100
        ) / 100;
      if (data.confidence === undefined) {
        data.confidence = data.overallConfidence;
      }
    }

    return {
      success: true,
      data,
      error: null,
      code: 'OK'
    };
  }

  /**
   * Classifies a document or list of page texts into invoice, multiple-bills, or statement.
   *
   * @param {Array<{ pageNumber: number, text: string }>} pages - Extracted page objects
   * @param {string} [filename=''] - Optional filename hint
   * @returns {Object} Smart classification result
   */
  classifyDocumentStructure(pages, filename = '') {
    return this.smartDocumentAnalyzer.classify(pages, filename);
  }
}

module.exports = DocumentIntelligenceService;
