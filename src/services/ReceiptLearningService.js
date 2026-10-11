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

  // ==========================================================================
  // 3. Persistent Storage Engine (expenses_config.json)
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
          return parsed;
        }
      }
    } catch {
      // Fallback
    }

    return {
      version: 1,
      merchantAliases: {},
      merchantLayouts: {}
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
        merchantLayouts: this._config.merchantLayouts || {}
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
