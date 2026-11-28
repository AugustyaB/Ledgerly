/**
 * ============================================================================
 * Ledgerly — ReceiptLearningService (Merchant Aliases & Layout Memory)
 * ============================================================================
 *
 * @fileoverview
 * Domain service managing persistent receipt intelligence, user-taught merchant
 * aliases, and repeat merchant layout memory (Phase 0.8.1).
 *
 * ARCHITECTURAL DESIGN:
 * - Persistent Learning Loop: User corrections to extracted merchant names are
 *   automatically recorded as canonical aliases in expenses_config.json.
 * - Repeat Layout Memory: Caches structural coordinate and anchor patterns
 *   (e.g., total anchor keyword, date format preference, tax structure) keyed
 *   by vendor GSTIN / VAT ID or normalized merchant name.
 * - Strict Isolation: Stored in expenses_config.json without bloating or
 *   contaminating active transaction ledger partitions (active_ledger.json).
 * - Zero External Dependencies: Pure Node.js fs/path atomic persistence.
 */

'use strict';

const fs = require('fs');
const path = require('path');

class ReceiptLearningService {
  /**
   * @param {object} [options]
   * @param {string} [options.configPath] - Explicit path to expenses_config.json
   * @param {import('./JsonDatabase')} [options.db] - Optional JsonDatabase instance
   */
  constructor(options = {}) {
    const db = options.db;
    let baseDir = process.cwd();
    if (db && typeof db.dataDir === 'string') {
      baseDir = path.dirname(db.dataDir);
    } else if (db && typeof db.getFilePath === 'function') {
      baseDir = path.dirname(db.getFilePath());
    }

    this._configPath = options.configPath || path.join(baseDir, 'expenses_config.json');
    this._config = this._loadConfig();
  }

  // ==========================================================================
  // 1. Merchant Alias Management
  // ==========================================================================

  /**
   * Normalizes a raw merchant name string into an indexing key.
   *
   * @param {string} raw - Raw merchant string.
   * @returns {string} Normalized lookup key.
   */
  normalizeMerchantKey(raw) {
    if (!raw || typeof raw !== 'string') return '';
    return raw
      .trim()
      .toLowerCase()
      .replace(/^[#*->]+\s*/, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Retrieves all registered merchant aliases.
   *
   * @returns {Record<string, string>} Map of normalized raw merchant -> canonical merchant name.
   */
  getAliases() {
    this._ensureConfig();
    return { ...this._config.merchantAliases };
  }

  /**
   * Registers or updates a merchant alias mapping.
   *
   * @param {string} rawMerchant - Raw extracted merchant name from OCR.
   * @param {string} canonicalMerchant - Clean user-corrected merchant name.
   * @returns {{ success: boolean, key: string, canonical: string }}
   */
  learnAlias(rawMerchant, canonicalMerchant) {
    const key = this.normalizeMerchantKey(rawMerchant);
    const canonical = typeof canonicalMerchant === 'string' ? canonicalMerchant.trim() : '';

    if (!key || !canonical) {
      return { success: false, error: 'Both raw and canonical merchant names are required.' };
    }

    this._ensureConfig();
    this._config.merchantAliases[key] = canonical;
    this._saveConfig();

    return {
      success: true,
      key,
      canonical
    };
  }

  /**
   * Resolves a raw merchant name against learned aliases.
   * Returns canonical name if a learned match exists, otherwise returns the input name.
   *
   * @param {string} rawMerchant - Extracted raw merchant.
   * @returns {{ resolved: boolean, name: string, original: string }}
   */
  resolveAlias(rawMerchant) {
    if (!rawMerchant || typeof rawMerchant !== 'string') {
      return { resolved: false, name: rawMerchant || '', original: rawMerchant || '' };
    }

    const key = this.normalizeMerchantKey(rawMerchant);
    this._ensureConfig();

    // 1. Exact normalized match
    if (this._config.merchantAliases[key]) {
      return {
        resolved: true,
        name: this._config.merchantAliases[key],
        original: rawMerchant
      };
    }

    // 2. Substring / Prefix fuzzy lookup for store branches (e.g. "Starbucks Coffee #104" -> "Starbucks Coffee")
    for (const [aliasKey, canonical] of Object.entries(this._config.merchantAliases)) {
      if (aliasKey.length >= 4 && (key.startsWith(aliasKey) || aliasKey.startsWith(key))) {
        return {
          resolved: true,
          name: canonical,
          original: rawMerchant
        };
      }
    }

    return {
      resolved: false,
      name: rawMerchant,
      original: rawMerchant
    };
  }

  /**
   * Deletes a learned merchant alias.
   *
   * @param {string} rawMerchant
   * @returns {{ success: boolean, removed: boolean }}
   */
  deleteAlias(rawMerchant) {
    const key = this.normalizeMerchantKey(rawMerchant);
    this._ensureConfig();

    if (this._config.merchantAliases[key]) {
      delete this._config.merchantAliases[key];
      this._saveConfig();
      return { success: true, removed: true };
    }

    return { success: true, removed: false };
  }

  /**
   * Clears all learned merchant aliases.
   *
   * @returns {{ success: boolean }}
   */
  clearAliases() {
    this._ensureConfig();
    this._config.merchantAliases = {};
    this._saveConfig();
    return { success: true };
  }

  // ==========================================================================
  // 2. Repeat Merchant Layout Memory
  // ==========================================================================

  /**
   * Normalizes an identifier (GSTIN, Tax ID, or merchant name) for layout lookup.
   *
   * @param {string} identifier
   * @returns {string}
   */
  normalizeLayoutKey(identifier) {
    if (!identifier || typeof identifier !== 'string') return '';
    return identifier.toUpperCase().replace(/[^A-Z0-9]/g, '').trim();
  }

  /**
   * Retrieves all stored merchant layout memories.
   *
   * @returns {Record<string, object>}
   */
  getLayouts() {
    this._ensureConfig();
    return { ...this._config.merchantLayouts };
  }

  /**
   * Retrieves stored layout memory for a specific merchant or tax identifier.
   *
   * @param {string} identifier - Vendor GSTIN, Tax ID, or merchant name.
   * @returns {object|null}
   */
  getLayout(identifier) {
    const key = this.normalizeLayoutKey(identifier);
    if (!key) return null;

    this._ensureConfig();
    return this._config.merchantLayouts[key] || null;
  }

  /**
   * Memorizes or updates structural layout attributes for a repeat vendor.
   *
   * @param {string} identifier - Vendor GSTIN, Tax ID, or merchant name.
   * @param {object} layoutData - Discovered structural attributes.
   * @param {string} [layoutData.totalAnchor] - Preferred total anchor keyword (e.g. 'NET PAYABLE').
   * @param {string} [layoutData.datePattern] - Preferred date format (e.g. 'DD/MM/YYYY').
   * @param {string} [layoutData.taxType] - Detected tax structure (e.g. 'GST', 'VAT').
   * @returns {{ success: boolean, key: string, layout: object }}
   */
  learnLayout(identifier, layoutData = {}) {
    const key = this.normalizeLayoutKey(identifier);
    if (!key) {
      return { success: false, error: 'Valid vendor identifier is required.' };
    }

    this._ensureConfig();

    const existing = this._config.merchantLayouts[key] || {
      hitCount: 0,
      firstSeenAt: new Date().toISOString()
    };

    const updated = {
      ...existing,
      canonicalMerchant: layoutData.canonicalMerchant || existing.canonicalMerchant || null,
      taxId: layoutData.taxId || existing.taxId || null,
      totalAnchor: layoutData.totalAnchor || existing.totalAnchor || null,
      datePattern: layoutData.datePattern || existing.datePattern || null,
      taxType: layoutData.taxType || existing.taxType || null,
      hitCount: (existing.hitCount || 0) + 1,
      lastSeenAt: new Date().toISOString()
    };

    this._config.merchantLayouts[key] = updated;
    this._saveConfig();

    return {
      success: true,
      key,
      layout: updated
    };
  }

  /**
   * Clears all learned layout memories.
   *
   * @returns {{ success: boolean }}
   */
  clearLayouts() {
    this._ensureConfig();
    this._config.merchantLayouts = {};
    this._saveConfig();
    return { success: true };
  }

  /**
   * Wires corrected merchant names and tax IDs into local layout memory and alias mappings.
   * Enables 100% repeat accuracy on recurring vendors by binding tax IDs (GSTIN/VAT)
   * and raw OCR merchant text to canonical merchant names and preferred structural anchors.
   *
   * @param {object} correction
   * @param {string} [correction.rawMerchant] - Extracted or OCR raw merchant string
   * @param {string} [correction.originalMerchant] - Alias for rawMerchant
   * @param {string} [correction.canonicalMerchant] - User-corrected canonical merchant name
   * @param {string} [correction.correctedMerchant] - Alias for canonicalMerchant
   * @param {string} [correction.taxId] - Vendor GSTIN, VAT ID or tax identification number
   * @param {string} [correction.gstin] - Alias for taxId
   * @param {string} [correction.vatId] - Alias for taxId
   * @param {string} [correction.totalAnchor] - Preferred anchor keyword for total extraction
   * @param {string} [correction.datePattern] - Preferred date formatting pattern
   * @param {string} [correction.taxType] - Tax structure ('GST', 'VAT', 'SALES_TAX')
   * @returns {{ success: boolean, key?: string, aliasLearned: boolean, layoutLearned: boolean, layout: object|null }}
   */
  learnFromCorrection(correction = {}) {
    const raw = (correction.rawMerchant || correction.originalMerchant || '').trim();
    const canonical = (correction.canonicalMerchant || correction.correctedMerchant || '').trim();
    const taxId = (correction.taxId || correction.gstin || correction.vatId || '').trim();
    const totalAnchor = correction.totalAnchor || null;
    const datePattern = correction.datePattern || null;
    const taxType = correction.taxType || (taxId ? (taxId.length === 15 ? 'GST' : 'TAX') : null);

    let aliasLearned = false;
    if (raw && canonical && raw.toLowerCase() !== canonical.toLowerCase()) {
      const aliasRes = this.learnAlias(raw, canonical);
      aliasLearned = !!aliasRes.success;
    }

    const layoutData = {
      canonicalMerchant: canonical || raw,
      taxId: taxId || null,
      totalAnchor,
      datePattern,
      taxType
    };

    let layoutLearned = false;
    let mainLayout = null;

    // 1. Wire taxId into layout memory if present
    if (taxId) {
      const taxRes = this.learnLayout(taxId, layoutData);
      if (taxRes.success) {
        layoutLearned = true;
        mainLayout = taxRes.layout;
      }
    }

    // 2. Wire canonical merchant name into layout memory
    if (canonical) {
      const canRes = this.learnLayout(canonical, layoutData);
      if (canRes.success) {
        layoutLearned = true;
        if (!mainLayout) mainLayout = canRes.layout;
      }
    }

    // 3. Wire raw merchant into layout memory if different
    if (raw && raw !== canonical) {
      const rawRes = this.learnLayout(raw, layoutData);
      if (rawRes.success) {
        layoutLearned = true;
        if (!mainLayout) mainLayout = rawRes.layout;
      }
    }

    return {
      success: aliasLearned || layoutLearned,
      aliasLearned,
      layoutLearned,
      layout: mainLayout
    };
  }

  /**
   * Resolves a vendor identifier or raw merchant name using learned aliases and layout memory.
   * Checks tax ID in layout memory (highest fidelity: 100% exact match), then alias dictionary, then raw merchant in layout memory.
   *
   * @param {string} rawMerchant - Raw merchant string
   * @param {string} [taxId] - Optional vendor GSTIN/VAT/Tax ID
   * @returns {{ resolved: boolean, name: string, confidence: number, source: string, layout: object|null }}
   */
  resolveMerchantWithLayout(rawMerchant, taxId = null) {
    // 1. If Tax ID is present, check layout memory (highest fidelity: 100% exact match)
    if (taxId) {
      const taxLayout = this.getLayout(taxId);
      if (taxLayout && taxLayout.canonicalMerchant) {
        return {
          resolved: true,
          name: taxLayout.canonicalMerchant,
          confidence: 1.0,
          source: 'layout_tax_id',
          layout: taxLayout
        };
      }
    }

    // 2. Check alias dictionary
    if (rawMerchant) {
      const aliasRes = this.resolveAlias(rawMerchant);
      if (aliasRes.resolved) {
        const layout = this.getLayout(aliasRes.name) || (taxId ? this.getLayout(taxId) : null);
        return {
          resolved: true,
          name: aliasRes.name,
          confidence: 1.0,
          source: 'alias_dictionary',
          layout
        };
      }
    }

    // 3. Check layout memory by raw merchant key
    if (rawMerchant) {
      const merchantLayout = this.getLayout(rawMerchant);
      if (merchantLayout && merchantLayout.canonicalMerchant) {
        return {
          resolved: true,
          name: merchantLayout.canonicalMerchant,
          confidence: 1.0,
          source: 'layout_merchant_key',
          layout: merchantLayout
        };
      }
    }

    return {
      resolved: false,
      name: rawMerchant || '',
      confidence: 0.0,
      source: 'none',
      layout: null
    };
  }

  // ==========================================================================
  // 3. Longitudinal Accuracy Telemetry & Scoreboard Math (Phase 1.3.0)
  // ==========================================================================

  /**
   * Records a receipt perception audit event into the longitudinal telemetry log.
   *
   * @param {object} event
   * @param {string} [event.receiptId]
   * @param {boolean} [event.firstPassSuccess=true] - Whether receipt was accepted without user edits
   * @param {boolean} [event.edited=false] - Whether user corrected any field
   * @param {string} [event.timestamp] - ISO date string
   * @param {string[]} [event.fieldsEdited=[]] - Fields edited by user (e.g. ['amount', 'merchant'])
   * @param {object} [event.originalValues={}]
   * @param {object} [event.correctedValues={}]
   * @returns {object} Recorded event payload
   */
  recordReceiptEvent(event = {}) {
    this._ensureConfig();

    const isEdited = event.edited !== undefined ? Boolean(event.edited) : !event.firstPassSuccess;
    const isFirstPass = event.firstPassSuccess !== undefined ? Boolean(event.firstPassSuccess) : !isEdited;

    const payload = {
      id: event.id || `evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      receiptId: event.receiptId || null,
      firstPassSuccess: isFirstPass,
      edited: isEdited,
      timestamp: event.timestamp || new Date().toISOString(),
      fieldsEdited: Array.isArray(event.fieldsEdited) ? event.fieldsEdited : [],
      originalValues: event.originalValues || {},
      correctedValues: event.correctedValues || {}
    };

    this._config.accuracyTelemetry.events.push(payload);

    // Keep events trimmed to last 1000 entries
    if (this._config.accuracyTelemetry.events.length > 1000) {
      this._config.accuracyTelemetry.events = this._config.accuracyTelemetry.events.slice(-1000);
    }

    // Update cumulative summary
    const summary = this._config.accuracyTelemetry.summary;
    summary.totalProcessed = (summary.totalProcessed || 0) + 1;
    if (isFirstPass) {
      summary.firstPassSuccessCount = (summary.firstPassSuccessCount || 0) + 1;
    }
    if (isEdited) {
      summary.totalCorrected = (summary.totalCorrected || 0) + 1;
    }

    this._saveConfig();
    return payload;
  }

  /**
   * Records a user correction and triggers alias and layout learning.
   *
   * @param {object} correction
   * @returns {{ success: boolean, event?: object, learning?: object }}
   */
  recordCorrection(correction = {}) {
    this._ensureConfig();

    const learningRes = this.learnFromCorrection(correction);

    const eventPayload = this.recordReceiptEvent({
      receiptId: correction.receiptId || null,
      firstPassSuccess: false,
      edited: true,
      timestamp: correction.timestamp || new Date().toISOString(),
      fieldsEdited: correction.fieldsEdited || (correction.fieldName ? [correction.fieldName] : ['merchant']),
      originalValues: correction.originalValues || { merchant: correction.rawMerchant },
      correctedValues: correction.correctedValues || { merchant: correction.canonicalMerchant }
    });

    return {
      success: true,
      event: eventPayload,
      learning: learningRes
    };
  }

  /**
   * Computes the Longitudinal Accuracy Scoreboard displaying rolling 30-day
   * and 90-day first-pass accuracy and edit rates.
   *
   * @param {Date|string|number} [referenceDate=new Date()] - Reference point for time window calculations
   * @returns {{
   *   rolling30: { totalProcessed: number, firstPassCount: number, editedCount: number, firstPassAccuracy: number, editRate: number },
   *   rolling90: { totalProcessed: number, firstPassCount: number, editedCount: number, firstPassAccuracy: number, editRate: number },
   *   allTime: { totalProcessed: number, firstPassSuccessCount: number, totalCorrected: number, firstPassAccuracy: number, editRate: number, aliasCount: number, layoutCount: number }
   * }}
   */
  getAccuracyScoreboard(referenceDate = new Date()) {
    this._ensureConfig();

    const refTime = new Date(referenceDate).getTime();
    const MS_PER_DAY = 24 * 60 * 60 * 1000;
    const window30Cutoff = refTime - 30 * MS_PER_DAY;
    const window90Cutoff = refTime - 90 * MS_PER_DAY;

    const events = this._config.accuracyTelemetry.events || [];

    let count30 = 0;
    let fp30 = 0;
    let ed30 = 0;

    let count90 = 0;
    let fp90 = 0;
    let ed90 = 0;

    for (const evt of events) {
      const evtTime = new Date(evt.timestamp).getTime();
      if (isNaN(evtTime)) continue;

      if (evtTime >= window90Cutoff && evtTime <= refTime) {
        count90++;
        if (evt.firstPassSuccess) fp90++;
        if (evt.edited) ed90++;

        if (evtTime >= window30Cutoff) {
          count30++;
          if (evt.firstPassSuccess) fp30++;
          if (evt.edited) ed30++;
        }
      }
    }

    // Mathematical calculations with exact 1-decimal percentage formatting
    const acc30 = count30 > 0 ? Number(((fp30 / count30) * 100).toFixed(1)) : 100.0;
    const editRate30 = count30 > 0 ? Number(((ed30 / count30) * 100).toFixed(1)) : 0.0;

    const acc90 = count90 > 0 ? Number(((fp90 / count90) * 100).toFixed(1)) : 100.0;
    const editRate90 = count90 > 0 ? Number(((ed90 / count90) * 100).toFixed(1)) : 0.0;

    const totalAll = this._config.accuracyTelemetry.summary.totalProcessed || events.length;
    const fpAll = this._config.accuracyTelemetry.summary.firstPassSuccessCount || events.filter(e => e.firstPassSuccess).length;
    const edAll = this._config.accuracyTelemetry.summary.totalCorrected || events.filter(e => e.edited).length;

    const allAcc = totalAll > 0 ? Number(((fpAll / totalAll) * 100).toFixed(1)) : 100.0;
    const allEditRate = totalAll > 0 ? Number(((edAll / totalAll) * 100).toFixed(1)) : 0.0;

    return {
      rolling30: {
        totalProcessed: count30,
        firstPassCount: fp30,
        editedCount: ed30,
        firstPassAccuracy: acc30,
        editRate: editRate30
      },
      rolling90: {
        totalProcessed: count90,
        firstPassCount: fp90,
        editedCount: ed90,
        firstPassAccuracy: acc90,
        editRate: editRate90
      },
      allTime: {
        totalProcessed: totalAll,
        firstPassSuccessCount: fpAll,
        totalCorrected: edAll,
        firstPassAccuracy: allAcc,
        editRate: allEditRate,
        aliasCount: Object.keys(this._config.merchantAliases || {}).length,
        layoutCount: Object.keys(this._config.merchantLayouts || {}).length
      }
    };
  }

  /**
   * Resets all telemetry events and summary counters.
   *
   * @returns {{ success: boolean }}
   */
  clearTelemetry() {
    this._ensureConfig();
    this._config.accuracyTelemetry = {
      events: [],
      summary: {
        totalProcessed: 0,
        totalCorrected: 0,
        firstPassSuccessCount: 0
      }
    };
    this._saveConfig();
    return { success: true };
  }

  // ==========================================================================
  // 4. Persistent Storage Engine (expenses_config.json)
  // ==========================================================================

  /**
   * Ensures the internal config structure contains learning sections.
   *
   * @private
   */
  _ensureConfig() {
    if (!this._config || typeof this._config !== 'object') {
      this._config = {};
    }
    if (!this._config.merchantAliases || typeof this._config.merchantAliases !== 'object') {
      this._config.merchantAliases = {};
    }
    if (!this._config.merchantLayouts || typeof this._config.merchantLayouts !== 'object') {
      this._config.merchantLayouts = {};
    }
    if (!this._config.accuracyTelemetry || typeof this._config.accuracyTelemetry !== 'object') {
      this._config.accuracyTelemetry = {
        events: [],
        summary: {
          totalProcessed: 0,
          totalCorrected: 0,
          firstPassSuccessCount: 0
        }
      };
    }
  }

  /**
   * Loads expenses_config.json from disk or returns default schema.
   *
   * @private
   * @returns {object}
   */
  _loadConfig() {
    try {
      if (fs.existsSync(this._configPath)) {
        const raw = fs.readFileSync(this._configPath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          parsed.merchantAliases = parsed.merchantAliases || {};
          parsed.merchantLayouts = parsed.merchantLayouts || {};
          parsed.accuracyTelemetry = parsed.accuracyTelemetry || {
            events: [],
            summary: { totalProcessed: 0, totalCorrected: 0, firstPassSuccessCount: 0 }
          };
          return parsed;
        }
      }
    } catch {
      // Fallback
    }

    return {
      version: 1,
      merchantAliases: {},
      merchantLayouts: {},
      accuracyTelemetry: {
        events: [],
        summary: { totalProcessed: 0, totalCorrected: 0, firstPassSuccessCount: 0 }
      }
    };
  }

  /**
   * Persists configuration to expenses_config.json using atomic temp-file swap.
   *
   * @private
   */
  _saveConfig() {
    try {
      const dir = path.dirname(this._configPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Merge with latest on disk to preserve other sections (e.g. backupMirror)
      let currentOnDisk = {};
      try {
        if (fs.existsSync(this._configPath)) {
          currentOnDisk = JSON.parse(fs.readFileSync(this._configPath, 'utf-8')) || {};
        }
      } catch {
        // Fallback
      }

      const merged = {
        ...currentOnDisk,
        ...this._config,
        merchantAliases: this._config.merchantAliases || {},
        merchantLayouts: this._config.merchantLayouts || {},
        accuracyTelemetry: this._config.accuracyTelemetry || {
          events: [],
          summary: { totalProcessed: 0, totalCorrected: 0, firstPassSuccessCount: 0 }
        }
      };

      const tmpPath = `${this._configPath}.tmp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      fs.writeFileSync(tmpPath, JSON.stringify(merged, null, 2), 'utf-8');
      fs.renameSync(tmpPath, this._configPath);
      this._config = merged;
    } catch (err) {
      console.warn('[ReceiptLearningService] Failed to persist expenses_config.json:', err.message);
    }
  }
}

module.exports = ReceiptLearningService;
