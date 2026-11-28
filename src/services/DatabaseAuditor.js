/**
 * ============================================================================
 * Ledgerly — DatabaseAuditor (Unified DB Integrity & Quality Engine)
 * ============================================================================
 *
 * @fileoverview
 * Master Layer 2 domain service providing comprehensive database integrity,
 * self-healing schema repair, orphaned reference cleanup, diagnostic data quality
 * audits, and non-destructive pre-processing sanitization for transactions.
 *
 * ARCHITECTURAL PRINCIPLES:
 * - Unified Resilience (ADR-013, Milestone v1.2.0 Phase 2): Consolidates structural
 *   database integrity (inspect, repair, backup snapshots) and dataset data quality
 *   auditing/sanitization into a single cohesive L2 domain engine.
 * - Defensive Persistence: Always snapshots a recovery checkpoint (.pre-audit.bak)
 *   before applying structural repairs to persistent database stores.
 * - Non-Destructive Sanitization: Generates clean, repaired copies of records
 *   without deleting user rows or altering original inputs in-place.
 * - Strict Validation: Traps calendar non-leap/invalid days (Feb 31, Apr 31),
 *   currency symbol noise, European commas, untrimmed whitespace, and ID collisions.
 * - Offline Hermetic: Pure native JavaScript with zero external dependencies.
 */

'use strict';

const fs = require('fs');

class DatabaseAuditor {
  // ==========================================================================
  // 1. Static Validation & Field Parsing Routines
  // ==========================================================================

  /**
   * Validates whether a calendar date string is a real, valid calendar date (YYYY-MM-DD).
   * Strictly traps invalid dates like 2026-02-31, 2026-04-31, and month 13.
   *
   * @param {any} dateStr
   * @returns {boolean}
   */
  static isValidCalendarDate(dateStr) {
    if (typeof dateStr !== 'string' || !dateStr.trim()) {
      return false;
    }
    const datePart = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
      return false;
    }
    const [y, m, d] = datePart.split('-').map(Number);
    if (y < 1990 || y > 2099 || m < 1 || m > 12 || d < 1 || d > 31) {
      return false;
    }

    const testDate = new Date(Date.UTC(y, m - 1, d));
    return (
      testDate.getUTCFullYear() === y &&
      testDate.getUTCMonth() === m - 1 &&
      testDate.getUTCDate() === d
    );
  }

  /**
   * Sanitizes and parses an amount value into a valid non-negative float.
   * Handles string amounts with commas, European separators, and currency symbols.
   *
   * @param {any} raw
   * @returns {{ parsed: number, isClean: boolean, isValid: boolean }}
   */
  static parseAmount(raw) {
    if (typeof raw === 'number') {
      if (isNaN(raw) || !isFinite(raw)) {
        return { parsed: 0, isClean: false, isValid: false };
      }
      if (raw < 0) {
        return { parsed: Math.abs(raw), isClean: false, isValid: false };
      }
      return { parsed: raw, isClean: true, isValid: true };
    }

    if (raw === null || raw === undefined) {
      return { parsed: 0, isClean: false, isValid: false };
    }

    if (typeof raw === 'string') {
      const trimmed = raw.trim();
      if (!trimmed) {
        return { parsed: 0, isClean: false, isValid: false };
      }

      // Check for clean plain float string (e.g. "125.50")
      if (/^\d+(\.\d+)?$/.test(trimmed)) {
        const num = parseFloat(trimmed);
        return { parsed: num, isClean: true, isValid: true };
      }

      // Handle negative signs
      const isNegative = trimmed.startsWith('-') || /-\s*\d/.test(trimmed);

      // Strip currency symbols and whitespace
      let cleaned = trimmed.replace(/[₹$€£¥A-Za-z\s]/g, '');

      // Normalize European decimal comma (e.g. "1.250,50" -> "1250.50" or "12,50" -> "12.50")
      if (cleaned.includes(',') && cleaned.includes('.')) {
        if (cleaned.indexOf('.') < cleaned.indexOf(',')) {
          // European format: 1.250,50
          cleaned = cleaned.replace(/\./g, '').replace(',', '.');
        } else {
          // US/UK format: 1,250.50
          cleaned = cleaned.replace(/,/g, '');
        }
      } else if (cleaned.includes(',')) {
        // e.g. "1250,50" or "1,250"
        const parts = cleaned.split(',');
        if (parts.length === 2 && parts[1].length <= 2) {
          cleaned = `${parts[0]}.${parts[1]}`;
        } else {
          cleaned = cleaned.replace(/,/g, '');
        }
      }

      const parsed = parseFloat(cleaned);
      if (isNaN(parsed) || !isFinite(parsed)) {
        return { parsed: 0, isClean: false, isValid: false };
      }

      const finalVal = Math.abs(parsed);
      return { parsed: finalVal, isClean: false, isValid: !isNegative };
    }

    return { parsed: 0, isClean: false, isValid: false };
  }

  /**
   * Calculates a 0-100 data quality score based on total scanned and clean items.
   *
   * @param {{ totalScanned?: number, cleanCount?: number }} metrics
   * @returns {number}
   */
  static scoreQuality(metrics) {
    if (!metrics || typeof metrics !== 'object') return 100;
    const totalScanned = Number(metrics.totalScanned) || 0;
    const cleanCount = Number(metrics.cleanCount) || 0;
    if (totalScanned <= 0) return 100;
    return Math.round((cleanCount / totalScanned) * 1000) / 10;
  }

  // ==========================================================================
  // 2. Non-Destructive Record & List Sanitization
  // ==========================================================================

  /**
   * Sanitizes a single expense record non-destructively.
   * Returns a clean copy of the record with change tracking.
   *
   * @param {any} item - The expense record to sanitize.
   * @param {object} [options={}] - Sanitization configuration.
   * @param {string} [options.defaultCategory='Uncategorized'] - Category fallback.
   * @param {string} [options.defaultPaymentMethod='Cash'] - Payment method fallback.
   * @param {string} [options.todayIso] - ISO date fallback.
   * @param {object} [context={}] - Processing context.
   * @param {number} [context.index=0] - Array index for error identification.
   * @param {Set<string>} [context.seenIds] - Set of identifiers already seen.
   * @returns {{ sanitized: object, changed: boolean, changes: Array<object> }}
   */
  static sanitizeRecord(item, options = {}, context = {}) {
    const defaultCategory = options.defaultCategory || 'Uncategorized';
    const defaultPaymentMethod = options.defaultPaymentMethod || 'Cash';
    const todayIso = options.todayIso || new Date().toISOString().split('T')[0];
    const index = typeof context.index === 'number' ? context.index : 0;
    const seenIds = context.seenIds || new Set();

    const changes = [];
    let recordChanged = false;

    // Handle null or non-object item
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      const recoveredId = `exp-rec-${Date.now()}-${index}`;
      const recovered = {
        id: recoveredId,
        title: 'Recovered Expense',
        amount: 0,
        category: defaultCategory,
        paymentMethod: defaultPaymentMethod,
        date: todayIso,
        description: 'Auto-recovered from malformed record',
        tags: [],
        receiptFilename: null,
        paidBy: 'Self',
        splitWith: [],
        isHouseholdExpense: false,
        currency: 'INR',
        status: 'cleared'
      };
      seenIds.add(recoveredId);
      changes.push({
        id: recoveredId,
        field: 'root',
        originalValue: item,
        sanitizedValue: recovered,
        reason: 'Reconstructed malformed or null record into standard expense entity.'
      });
      return { sanitized: recovered, changed: true, changes };
    }

    // Clone entry non-destructively
    const clean = { ...item };

    // 1. Sanitize ID
    if (!clean.id || typeof clean.id !== 'string' || !clean.id.trim()) {
      const newId = `exp-san-${Date.now()}-${index}`;
      changes.push({
        id: newId,
        field: 'id',
        originalValue: clean.id,
        sanitizedValue: newId,
        reason: 'Generated missing transaction ID.'
      });
      clean.id = newId;
      recordChanged = true;
    } else {
      clean.id = clean.id.trim();
      if (clean.id !== item.id) {
        changes.push({
          id: clean.id,
          field: 'id',
          originalValue: item.id,
          sanitizedValue: clean.id,
          reason: 'Trimmed whitespace from transaction ID.'
        });
        recordChanged = true;
      }

      // Trap duplicate IDs
      if (seenIds.has(clean.id)) {
        const uniqueId = `${clean.id}-dup-${Date.now().toString(36)}-${index}`;
        changes.push({
          id: uniqueId,
          field: 'id',
          originalValue: clean.id,
          sanitizedValue: uniqueId,
          reason: 'Resolved duplicate identifier collision by generating unique suffix.'
        });
        clean.id = uniqueId;
        recordChanged = true;
      }
    }
    seenIds.add(clean.id);

    // 2. Sanitize Title
    if (typeof clean.title !== 'string' || !clean.title.trim()) {
      clean.title = 'Untitled Expense';
      changes.push({
        id: clean.id,
        field: 'title',
        originalValue: item.title,
        sanitizedValue: clean.title,
        reason: 'Replaced missing or blank title with fallback.'
      });
      recordChanged = true;
    } else if (clean.title !== clean.title.trim()) {
      const trimmedTitle = clean.title.trim();
      changes.push({
        id: clean.id,
        field: 'title',
        originalValue: clean.title,
        sanitizedValue: trimmedTitle,
        reason: 'Trimmed whitespace from title.'
      });
      clean.title = trimmedTitle;
      recordChanged = true;
    }

    // 3. Sanitize Amount
    const amtCheck = DatabaseAuditor.parseAmount(clean.amount);
    if (!amtCheck.isClean || clean.amount !== amtCheck.parsed) {
      changes.push({
        id: clean.id,
        field: 'amount',
        originalValue: clean.amount,
        sanitizedValue: amtCheck.parsed,
        reason: 'Parsed and normalized amount into non-negative numeric float.'
      });
      clean.amount = amtCheck.parsed;
      recordChanged = true;
    }

    // 4. Sanitize Category
    if (typeof clean.category !== 'string' || !clean.category.trim()) {
      clean.category = defaultCategory;
      changes.push({
        id: clean.id,
        field: 'category',
        originalValue: item.category,
        sanitizedValue: defaultCategory,
        reason: `Assigned default category "${defaultCategory}" for missing value.`
      });
      recordChanged = true;
    } else if (clean.category !== clean.category.trim()) {
      const trimmedCat = clean.category.trim();
      changes.push({
        id: clean.id,
        field: 'category',
        originalValue: clean.category,
        sanitizedValue: trimmedCat,
        reason: 'Trimmed whitespace from category.'
      });
      clean.category = trimmedCat;
      recordChanged = true;
    }

    // 5. Sanitize Date
    if (!DatabaseAuditor.isValidCalendarDate(clean.date)) {
      let repairedDate = todayIso;
      if (typeof clean.date === 'string') {
        const parsedTimestamp = Date.parse(clean.date);
        if (!isNaN(parsedTimestamp)) {
          const parsedD = new Date(parsedTimestamp);
          const y = parsedD.getFullYear();
          if (y >= 1990 && y <= 2099) {
            repairedDate = parsedD.toISOString().split('T')[0];
          }
        }
      }

      changes.push({
        id: clean.id,
        field: 'date',
        originalValue: item.date,
        sanitizedValue: repairedDate,
        reason: 'Normalized malformed or invalid date to valid ISO calendar date.'
      });
      clean.date = repairedDate;
      recordChanged = true;
    } else if (clean.date.includes('T')) {
      const pureDate = clean.date.split('T')[0];
      if (pureDate !== clean.date) {
        changes.push({
          id: clean.id,
          field: 'date',
          originalValue: clean.date,
          sanitizedValue: pureDate,
          reason: 'Stripped time component from date string.'
        });
        clean.date = pureDate;
        recordChanged = true;
      }
    }

    // 6. Sanitize Payment Method
    if (typeof clean.paymentMethod !== 'string' || !clean.paymentMethod.trim()) {
      clean.paymentMethod = defaultPaymentMethod;
      changes.push({
        id: clean.id,
        field: 'paymentMethod',
        originalValue: item.paymentMethod,
        sanitizedValue: defaultPaymentMethod,
        reason: 'Assigned default payment method.'
      });
      recordChanged = true;
    } else if (clean.paymentMethod !== clean.paymentMethod.trim()) {
      clean.paymentMethod = clean.paymentMethod.trim();
      recordChanged = true;
    }

    // 7. Sanitize Tags
    if (clean.tags !== undefined && clean.tags !== null) {
      let tagList = [];
      if (Array.isArray(clean.tags)) {
        tagList = clean.tags;
      } else if (typeof clean.tags === 'string') {
        tagList = clean.tags.split(',').map(t => t.trim());
        recordChanged = true;
      }

      const normalizedTags = Array.from(
        new Set(
          tagList
            .filter(t => typeof t === 'string' && t.trim().length > 0)
            .map(t => t.trim())
        )
      );

      if (
        !Array.isArray(item.tags) ||
        normalizedTags.length !== item.tags.length ||
        normalizedTags.some((t, i) => t !== item.tags[i])
      ) {
        changes.push({
          id: clean.id,
          field: 'tags',
          originalValue: item.tags,
          sanitizedValue: normalizedTags,
          reason: 'Sanitized, trimmed, and deduplicated tag list.'
        });
        clean.tags = normalizedTags;
        recordChanged = true;
      }
    } else {
      clean.tags = [];
    }

    // 8. Sanitize Payer & Household slots
    if (typeof clean.paidBy !== 'string' || !clean.paidBy.trim()) {
      clean.paidBy = 'Self';
    } else {
      clean.paidBy = clean.paidBy.trim();
    }

    if (!Array.isArray(clean.splitWith)) {
      clean.splitWith = clean.splitWith ? [String(clean.splitWith).trim()] : [];
    }
    clean.isHouseholdExpense = Boolean(
      clean.isHouseholdExpense || (clean.splitWith && clean.splitWith.length > 0)
    );

    return { sanitized: clean, changed: recordChanged, changes };
  }

  /**
   * Non-destructively sanitizes and normalizes an expense array, repairing defects.
   * Returns clean copies of records along with a structured changelog.
   *
   * @param {any[]} [expenses=[]] - Array of transactions to sanitize.
   * @param {object} [options={}] - Sanitization options.
   * @param {string} [options.defaultCategory='Uncategorized'] - Category fallback.
   * @param {string} [options.defaultPaymentMethod='Cash'] - Payment method fallback.
   * @param {string} [options.todayIso] - Date fallback.
   * @returns {import('../types').DataQualitySanitizationResult}
   */
  static sanitizeExpenseList(expenses = [], options = {}) {
    if (!Array.isArray(expenses)) {
      return {
        totalScanned: 0,
        repairedCount: 0,
        unmodifiedCount: 0,
        sanitizedExpenses: [],
        changes: []
      };
    }

    const defaultCategory = options.defaultCategory || 'Uncategorized';
    const defaultPaymentMethod = options.defaultPaymentMethod || 'Cash';
    const todayIso = options.todayIso || new Date().toISOString().split('T')[0];

    const sanitizedExpenses = [];
    const changes = [];
    const seenIds = new Set();
    let repairedCount = 0;

    expenses.forEach((item, index) => {
      const res = DatabaseAuditor.sanitizeRecord(
        item,
        { defaultCategory, defaultPaymentMethod, todayIso },
        { index, seenIds }
      );
      if (res.changed) {
        repairedCount++;
      }
      sanitizedExpenses.push(res.sanitized);
      if (Array.isArray(res.changes)) {
        changes.push(...res.changes);
      }
    });

    return {
      totalScanned: expenses.length,
      repairedCount,
      unmodifiedCount: expenses.length - repairedCount,
      sanitizedExpenses,
      changes
    };
  }

  /**
   * Canonical alias for sanitizeExpenseList.
   *
   * @param {any[]} expenses
   * @param {object} [options]
   * @returns {import('../types').DataQualitySanitizationResult}
   */
  static sanitize(expenses, options) {
    return DatabaseAuditor.sanitizeExpenseList(expenses, options);
  }

  // ==========================================================================
  // 3. Exhaustive Data Quality Auditing & Scoring
  // ==========================================================================

  /**
   * Performs an exhaustive, non-mutating data quality audit across an expense array.
   *
   * @param {any[]} [dataset=[]] - Array of expense objects to audit.
   * @param {object} [_options={}] - Optional auditing thresholds.
   * @returns {import('../types').DataQualityAuditResult}
   */
  static auditDataset(dataset = [], _options = {}) {
    if (!Array.isArray(dataset)) {
      return {
        totalScanned: 0,
        cleanCount: 0,
        defectCount: 0,
        qualityScore: 0,
        summary: {
          nonObjectEntries: 1,
          malformedDates: 0,
          missingCategories: 0,
          invalidAmounts: 0,
          missingTitles: 0,
          missingIds: 0,
          duplicateIds: 0,
          whitespaceIssues: 0,
          orphanedTags: 0
        },
        issues: [
          {
            index: -1,
            id: 'n/a',
            field: 'dataset',
            severity: 'fatal',
            reason: 'Input is not an array of transactions.',
            originalValue: dataset
          }
        ]
      };
    }

    const issues = [];
    const seenIds = new Set();
    const summary = {
      nonObjectEntries: 0,
      malformedDates: 0,
      missingCategories: 0,
      invalidAmounts: 0,
      missingTitles: 0,
      missingIds: 0,
      duplicateIds: 0,
      whitespaceIssues: 0,
      orphanedTags: 0
    };

    let defectiveItems = 0;

    dataset.forEach((item, index) => {
      let itemHasDefects = false;

      // 1. Non-object or null check
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        summary.nonObjectEntries++;
        issues.push({
          index,
          id: `item-${index}`,
          field: 'root',
          severity: 'fatal',
          reason: 'Entry is null, undefined, or not a plain object.',
          originalValue: item
        });
        defectiveItems++;
        return;
      }

      const id = item.id;

      // 2. ID validation
      if (!id || typeof id !== 'string' || !id.trim()) {
        summary.missingIds++;
        itemHasDefects = true;
        issues.push({
          index,
          id: `missing-${index}`,
          field: 'id',
          severity: 'fatal',
          reason: 'Missing or empty transaction identifier.',
          originalValue: id
        });
      } else {
        const trimmedId = id.trim();
        if (seenIds.has(trimmedId)) {
          summary.duplicateIds++;
          itemHasDefects = true;
          issues.push({
            index,
            id: trimmedId,
            field: 'id',
            severity: 'warning',
            reason: `Duplicate transaction ID "${trimmedId}" detected in dataset.`,
            originalValue: id
          });
        } else {
          seenIds.add(trimmedId);
        }
      }

      // 3. Title validation
      if (typeof item.title !== 'string' || !item.title.trim()) {
        summary.missingTitles++;
        itemHasDefects = true;
        issues.push({
          index,
          id: id || `item-${index}`,
          field: 'title',
          severity: 'warning',
          reason: 'Missing or blank transaction title / payee name.',
          originalValue: item.title
        });
      } else if (item.title !== item.title.trim()) {
        summary.whitespaceIssues++;
        itemHasDefects = true;
        issues.push({
          index,
          id: id || `item-${index}`,
          field: 'title',
          severity: 'info',
          reason: 'Title contains un-trimmed leading or trailing whitespace.',
          originalValue: item.title
        });
      }

      // 4. Amount validation
      const amtCheck = DatabaseAuditor.parseAmount(item.amount);
      if (!amtCheck.isValid || !amtCheck.isClean) {
        summary.invalidAmounts++;
        itemHasDefects = true;
        issues.push({
          index,
          id: id || `item-${index}`,
          field: 'amount',
          severity: amtCheck.parsed === 0 && item.amount !== 0 ? 'fatal' : 'warning',
          reason:
            typeof item.amount === 'number' && item.amount < 0
              ? `Negative expense amount (${item.amount}) detected.`
              : `Invalid or un-normalized amount value: ${JSON.stringify(item.amount)}.`,
          originalValue: item.amount
        });
      }

      // 5. Category validation
      if (typeof item.category !== 'string' || !item.category.trim()) {
        summary.missingCategories++;
        itemHasDefects = true;
        issues.push({
          index,
          id: id || `item-${index}`,
          field: 'category',
          severity: 'warning',
          reason: 'Missing or empty expense category.',
          originalValue: item.category
        });
      } else if (item.category !== item.category.trim()) {
        summary.whitespaceIssues++;
        itemHasDefects = true;
        issues.push({
          index,
          id: id || `item-${index}`,
          field: 'category',
          severity: 'info',
          reason: 'Category contains un-trimmed whitespace.',
          originalValue: item.category
        });
      }

      // 6. Date validation
      if (!DatabaseAuditor.isValidCalendarDate(item.date)) {
        summary.malformedDates++;
        itemHasDefects = true;
        issues.push({
          index,
          id: id || `item-${index}`,
          field: 'date',
          severity: 'fatal',
          reason: `Malformed, unparseable, or out-of-range calendar date: "${item.date}".`,
          originalValue: item.date
        });
      }

      // 7. Payment method & whitespace
      if (typeof item.paymentMethod === 'string' && item.paymentMethod !== item.paymentMethod.trim()) {
        summary.whitespaceIssues++;
        itemHasDefects = true;
        issues.push({
          index,
          id: id || `item-${index}`,
          field: 'paymentMethod',
          severity: 'info',
          reason: 'paymentMethod contains un-trimmed whitespace.',
          originalValue: item.paymentMethod
        });
      }

      // 8. Tags validation
      if (item.tags !== undefined && item.tags !== null) {
        if (!Array.isArray(item.tags)) {
          summary.orphanedTags++;
          itemHasDefects = true;
          issues.push({
            index,
            id: id || `item-${index}`,
            field: 'tags',
            severity: 'warning',
            reason: 'Tags is not an array.',
            originalValue: item.tags
          });
        } else {
          const hasInvalidTag = item.tags.some(t => typeof t !== 'string' || t !== t.trim() || !t);
          const hasDuplicates = new Set(item.tags).size !== item.tags.length;
          if (hasInvalidTag || hasDuplicates) {
            summary.orphanedTags++;
            itemHasDefects = true;
            issues.push({
              index,
              id: id || `item-${index}`,
              field: 'tags',
              severity: 'info',
              reason: 'Tags contain un-trimmed items, empty values, or duplicates.',
              originalValue: item.tags
            });
          }
        }
      }

      if (itemHasDefects) {
        defectiveItems++;
      }
    });

    const totalScanned = dataset.length;
    const cleanCount = Math.max(0, totalScanned - defectiveItems);
    const qualityScore = DatabaseAuditor.scoreQuality({ totalScanned, cleanCount });

    return {
      totalScanned,
      cleanCount,
      defectCount: defectiveItems,
      qualityScore,
      summary,
      issues
    };
  }

  /**
   * Canonical alias for auditDataset.
   *
   * @param {any[]} expenses
   * @param {object} [options]
   * @returns {import('../types').DataQualityAuditResult}
   */
  static audit(expenses, options) {
    return DatabaseAuditor.auditDataset(expenses, options);
  }

  // ==========================================================================
  // 4. Structural Schema Inspection & Orphaned Reference Cleanup
  // ==========================================================================

  /**
   * Evaluates the integrity of a root database object without applying mutations.
   *
   * @param {any} rootData - The in-memory or parsed root data to inspect.
   * @returns {{ healthy: boolean, issues: string[], suggestions: string[], locked?: boolean }}
   */
  static inspect(rootData) {
    const issues = [];
    const suggestions = [];

    if (!rootData || typeof rootData !== 'object' || Array.isArray(rootData)) {
      return {
        healthy: false,
        issues: ['Root data is not a valid JSON object.'],
        suggestions: ['Reinitialize default schema from backup or template.']
      };
    }

    // Encrypted vault currently locked in RAM: defer structural inspection until unlocked
    if (rootData.isLockedVault === true) {
      return {
        healthy: true,
        locked: true,
        issues: [],
        suggestions: []
      };
    }

    // 1. Root structure checks
    if (!rootData.account || typeof rootData.account !== 'object') {
      issues.push('Missing or corrupt account object.');
      suggestions.push('Initialize default unconfigured account envelope.');
    }

    if (!Array.isArray(rootData.profiles) || rootData.profiles.length === 0) {
      issues.push('Profiles array is missing or empty.');
      suggestions.push('Seed default Master Household profile.');
    } else {
      // Check activeProfileId validity
      const validProfileIds = new Set(rootData.profiles.map(p => p.id));
      if (!rootData.activeProfileId || !validProfileIds.has(rootData.activeProfileId)) {
        issues.push(`Invalid activeProfileId "${rootData.activeProfileId}".`);
        suggestions.push(`Reset activeProfileId to "${rootData.profiles[0].id}".`);
      }

      // Check each profile's data structure
      rootData.profiles.forEach((profile, pIdx) => {
        const pLabel = profile.name || `Profile #${pIdx + 1}`;
        if (!profile.data || typeof profile.data !== 'object') {
          issues.push(`${pLabel}: Missing data container.`);
          suggestions.push(`${pLabel}: Seed default profile data structure.`);
          return;
        }

        const data = profile.data;

        // Check expenses array
        if (!Array.isArray(data.expenses)) {
          issues.push(`${pLabel}: Missing expenses array.`);
          suggestions.push(`${pLabel}: Initialize empty expenses array.`);
        } else {
          const expenseIds = new Set();
          data.expenses.forEach((exp, eIdx) => {
            if (!exp || typeof exp !== 'object') {
              issues.push(`${pLabel}: Expense item #${eIdx + 1} is not an object.`);
              suggestions.push(`${pLabel}: Remove malformed expense entry.`);
              return;
            }

            if (!exp.id) {
              issues.push(`${pLabel}: Expense item #${eIdx + 1} missing ID.`);
              suggestions.push(`${pLabel}: Generate UUID for expense.`);
            } else {
              expenseIds.add(exp.id);
            }

            const amt = parseFloat(exp.amount);
            if (isNaN(amt) || !isFinite(amt) || amt < 0) {
              issues.push(`${pLabel}: Expense "${exp.title || eIdx}" has invalid amount: ${exp.amount}.`);
              suggestions.push(`${pLabel}: Sanitize invalid amount to 0 or valid float.`);
            }

            if (!exp.date || isNaN(new Date(exp.date).getTime())) {
              issues.push(`${pLabel}: Expense "${exp.title || eIdx}" has invalid date: ${exp.date}.`);
              suggestions.push(`${pLabel}: Reset date to current ISO date.`);
            }
          });

          // Check notes referencing orphaned expenses
          if (Array.isArray(data.notes)) {
            data.notes.forEach((note, nIdx) => {
              if (note && note.relationType === 'expense' && note.relation && !expenseIds.has(note.relation)) {
                issues.push(`${pLabel}: Note #${nIdx + 1} references orphaned expense ID "${note.relation}".`);
                suggestions.push(`${pLabel}: Detach note from non-existent expense.`);
              }
            });
          }
        }

        // Check categories and presets
        if (!Array.isArray(data.categories)) {
          issues.push(`${pLabel}: Missing categories collection.`);
          suggestions.push(`${pLabel}: Seed default categories.`);
        }
        if (!Array.isArray(data.presets)) {
          issues.push(`${pLabel}: Missing presets collection.`);
          suggestions.push(`${pLabel}: Seed default presets.`);
        }
      });
    }

    if (!Array.isArray(rootData.recurringBills)) {
      issues.push('Missing recurringBills collection.');
      suggestions.push('Seed default recurring bills array.');
    }

    if (!Array.isArray(rootData.settlements)) {
      issues.push('Missing settlements collection.');
      suggestions.push('Initialize empty settlements array.');
    }

    return {
      healthy: issues.length === 0,
      issues,
      suggestions
    };
  }

  /**
   * Cleans orphaned expense relations in profile notes across rootData.
   *
   * @param {any} rootData - Root database object.
   * @returns {{ cleanedCount: number, repairsApplied: string[] }}
   */
  static cleanOrphanedReferences(rootData) {
    if (!rootData || typeof rootData !== 'object' || !Array.isArray(rootData.profiles)) {
      return { cleanedCount: 0, repairsApplied: [] };
    }

    const repairsApplied = [];
    let cleanedCount = 0;

    rootData.profiles.forEach(profile => {
      const pLabel = profile.name || 'Profile';
      if (!profile || !profile.data || typeof profile.data !== 'object') return;
      const data = profile.data;
      if (!Array.isArray(data.notes)) return;

      const validExpenseIds = new Set();
      if (Array.isArray(data.expenses)) {
        data.expenses.forEach(exp => {
          if (exp && exp.id) validExpenseIds.add(exp.id);
        });
      }

      data.notes.forEach(note => {
        if (note && note.relationType === 'expense' && note.relation && !validExpenseIds.has(note.relation)) {
          note.relation = null;
          note.relationType = 'general';
          repairsApplied.push(`${pLabel}: Detached orphaned note "${note.title || note.id}".`);
          cleanedCount++;
        }
      });
    });

    return { cleanedCount, repairsApplied };
  }

  // ==========================================================================
  // 5. Automated Structural Defect Repair & Database Self-Healing
  // ==========================================================================

  /**
   * Repairs structural database anomalies in-memory, restoring valid defaults
   * and sanitizing child profile data and expenses.
   *
   * @param {any} rootData - Root database object to repair.
   * @param {object} [options={}] - Repair configuration.
   * @param {string} [options.timestamp] - Repair timestamp.
   * @param {string} [options.todayStr] - Fallback date.
   * @returns {{ rootData: object, repaired: boolean, issuesFound: string[], repairsApplied: string[], locked?: boolean }}
   */
  static repair(rootData, options = {}) {
    const timestamp = options.timestamp || new Date().toISOString();
    const todayStr = options.todayStr || timestamp.split('T')[0];
    const issuesFound = [];
    const repairsApplied = [];

    let repairedRoot = rootData;
    if (!repairedRoot || typeof repairedRoot !== 'object' || Array.isArray(repairedRoot)) {
      repairedRoot = {};
      repairsApplied.push('Reinitialized root data object.');
    }

    if (repairedRoot.isLockedVault === true) {
      return {
        rootData: repairedRoot,
        repaired: false,
        locked: true,
        issuesFound: [],
        repairsApplied: []
      };
    }

    const inspection = DatabaseAuditor.inspect(repairedRoot);
    issuesFound.push(...inspection.issues);

    if (inspection.healthy) {
      return {
        rootData: repairedRoot,
        repaired: false,
        issuesFound: [],
        repairsApplied: []
      };
    }

    // 1. Account envelope
    if (!repairedRoot.account || typeof repairedRoot.account !== 'object') {
      repairedRoot.account = {
        isConfigured: false,
        userId: '',
        passwordHash: '',
        salt: '',
        rememberMe: false,
        lastLoggedIn: null
      };
      repairsApplied.push('Initialized baseline account envelope.');
    }

    // 2. Profiles array
    if (!Array.isArray(repairedRoot.profiles) || repairedRoot.profiles.length === 0) {
      const defaultId = 'profile-' + Date.now();
      repairedRoot.profiles = [
        {
          id: defaultId,
          name: 'Master Household',
          avatar: '🏠',
          isHouseholdDefault: true,
          createdDate: timestamp,
          data: {
            expenses: [],
            categories: [
              'Food & Dining',
              'Groceries',
              'Utilities',
              'Transportation',
              'Entertainment',
              'Healthcare',
              'Shopping',
              'Miscellaneous'
            ],
            presets: [],
            notes: [],
            salaryConfig: { monthlyIncome: 0, fixedBills: 0, savingsGoal: 0, payday: 1 },
            budgetGoal: 0,
            householdMembers: ['Self', 'Partner']
          }
        }
      ];
      repairedRoot.activeProfileId = defaultId;
      repairsApplied.push('Created default Master Household profile.');
    }

    const validProfiles = repairedRoot.profiles.filter(p => p && typeof p === 'object' && p.id);
    repairedRoot.profiles = validProfiles;

    if (!repairedRoot.activeProfileId || !validProfiles.some(p => p.id === repairedRoot.activeProfileId)) {
      repairedRoot.activeProfileId = validProfiles[0].id;
      repairsApplied.push(`Reset activeProfileId to "${validProfiles[0].id}".`);
    }

    // 3. Profile data repairs
    validProfiles.forEach(profile => {
      const pLabel = profile.name || 'Profile';
      if (!profile.data || typeof profile.data !== 'object') {
        profile.data = {};
        repairsApplied.push(`${pLabel}: Initialized data object.`);
      }

      const data = profile.data;

      // Expenses repair using sanitizeExpenseList
      if (!Array.isArray(data.expenses)) {
        data.expenses = [];
        repairsApplied.push(`${pLabel}: Initialized empty expenses array.`);
      } else {
        const cleanedExpenses = [];
        const expenseIds = new Set();

        data.expenses.forEach((exp, idx) => {
          if (!exp || typeof exp !== 'object') {
            repairsApplied.push(`${pLabel}: Removed non-object expense #${idx + 1}.`);
            return;
          }

          const res = DatabaseAuditor.sanitizeRecord(
            exp,
            { defaultCategory: 'Miscellaneous', defaultPaymentMethod: 'Cash', todayIso: todayStr },
            { index: idx, seenIds: expenseIds }
          );

          const repairedExp = res.sanitized;
          if (res.changed) {
            res.changes.forEach(ch => {
              repairsApplied.push(`${pLabel}: [${ch.field}] ${ch.reason}`);
            });
          }

          if (!repairedExp.updatedAt) {
            repairedExp.updatedAt = timestamp;
          }
          if (repairedExp.version === undefined) {
            repairedExp.version = 1;
          }

          expenseIds.add(repairedExp.id);
          cleanedExpenses.push(repairedExp);
        });

        data.expenses = cleanedExpenses;
      }

      // Collections
      if (!Array.isArray(data.categories) || data.categories.length === 0) {
        data.categories = [
          'Food & Dining',
          'Groceries',
          'Utilities',
          'Transportation',
          'Entertainment',
          'Healthcare',
          'Shopping',
          'Miscellaneous'
        ];
        repairsApplied.push(`${pLabel}: Restored default categories.`);
      }

      if (!Array.isArray(data.presets)) {
        data.presets = [];
        repairsApplied.push(`${pLabel}: Initialized presets array.`);
      }

      if (!Array.isArray(data.householdMembers) || data.householdMembers.length === 0) {
        data.householdMembers = ['Self', 'Partner'];
        repairsApplied.push(`${pLabel}: Restored default household members.`);
      }

      if (!data.salaryConfig || typeof data.salaryConfig !== 'object') {
        data.salaryConfig = { monthlyIncome: 0, fixedBills: 0, savingsGoal: 0, payday: 1 };
        repairsApplied.push(`${pLabel}: Initialized default salary config.`);
      }
    });

    // 4. Clean orphaned references across notes
    const orphanCleanResult = DatabaseAuditor.cleanOrphanedReferences(repairedRoot);
    if (orphanCleanResult.repairsApplied.length > 0) {
      repairsApplied.push(...orphanCleanResult.repairsApplied);
    }

    // 5. Root collections
    if (!Array.isArray(repairedRoot.recurringBills)) {
      repairedRoot.recurringBills = [];
      repairsApplied.push('Initialized recurringBills collection.');
    }

    if (!Array.isArray(repairedRoot.settlements)) {
      repairedRoot.settlements = [];
      repairsApplied.push('Initialized settlements collection.');
    }

    if (!repairedRoot.schemaVersion || repairedRoot.schemaVersion < 2) {
      repairedRoot.schemaVersion = 2;
      repairsApplied.push('Standardized schemaVersion to 2.');
    }

    return {
      rootData: repairedRoot,
      repaired: repairsApplied.length > 0,
      issuesFound,
      repairsApplied
    };
  }

  /**
   * Compatibility method for rolling aged expenses. In the unified ledger architecture,
   * all expenses remain unified in the single ledger without dual-partition fragmentation.
   *
   * @param {import('./JsonDatabase')} _db - The database instance.
   * @param {number} [_cutoffDays=90] - Age in days.
   * @returns {{ movedCount: number, affectedProfilesCount: number }}
   */
  static rollAgedExpenses(_db, _cutoffDays = 90) {
    return { movedCount: 0, affectedProfilesCount: 0 };
  }

  /**
   * Executes a self-healing audit pass against a JsonDatabase instance.
   * If corruption or structural issues are detected, snapshots a recovery backup
   * before applying repairs and persisting the clean state.
   *
   * @param {import('./JsonDatabase')} db - The database service to inspect and repair.
   * @returns {{ healthy: boolean, issuesFound: string[], repairsApplied: string[], backupCreated: string|null, timestamp: string, locked?: boolean }}
   */
  static auditAndRepair(db) {
    if (!db || typeof db.read !== 'function' || typeof db.write !== 'function') {
      throw new Error('DatabaseAuditor requires a valid JsonDatabase instance.');
    }

    const timestamp = new Date().toISOString();
    const rootData = db.read();
    const inspection = DatabaseAuditor.inspect(rootData);

    if (inspection.healthy) {
      if (inspection.locked) {
        return {
          healthy: true,
          locked: true,
          issuesFound: [],
          repairsApplied: [],
          backupCreated: null,
          timestamp
        };
      }
      try {
        const rollResult = DatabaseAuditor.rollAgedExpenses(db, 90);
        if (rollResult.movedCount > 0) {
          return {
            healthy: true,
            issuesFound: [],
            repairsApplied: [
              `Archived ${rollResult.movedCount} aged expense(s) across ${rollResult.affectedProfilesCount} profile(s) to cold storage.`
            ],
            backupCreated: null,
            timestamp
          };
        }
      } catch (rollErr) {
        console.warn('[DatabaseAuditor] Rolling archival notice:', rollErr.message);
      }

      return {
        healthy: true,
        issuesFound: [],
        repairsApplied: [],
        backupCreated: null,
        timestamp
      };
    }

    const issuesFound = [...inspection.issues];
    let backupCreated = null;

    // Snapshot pre-repair state
    try {
      const dbPath = typeof db.getFilePath === 'function' ? db.getFilePath() : db.filePath;
      if (dbPath && fs.existsSync(dbPath)) {
        backupCreated = `${dbPath}.pre-audit.bak`;
        fs.copyFileSync(dbPath, backupCreated);
      }
    } catch (bakErr) {
      console.warn('[DatabaseAuditor] Could not create pre-audit backup snapshot:', bakErr.message);
    }

    const repairResult = DatabaseAuditor.repair(rootData, { timestamp });

    // Persist repaired state
    db.write(repairResult.rootData);

    // Perform rolling archival for expenses older than 90 days
    try {
      const rollResult = DatabaseAuditor.rollAgedExpenses(db, 90);
      if (rollResult.movedCount > 0) {
        repairResult.repairsApplied.push(
          `Archived ${rollResult.movedCount} aged expense(s) across ${rollResult.affectedProfilesCount} profile(s) to cold storage.`
        );
      }
    } catch (rollErr) {
      console.warn('[DatabaseAuditor] Rolling archival notice:', rollErr.message);
    }

    return {
      healthy: false,
      issuesFound,
      repairsApplied: repairResult.repairsApplied,
      backupCreated,
      timestamp
    };
  }

  // ==========================================================================
  // 6. Instance Delegates
  // ==========================================================================

  /**
   * Instantiable auditor method delegating to static auditDataset.
   *
   * @param {any[]} expenses
   * @param {object} [options]
   * @returns {import('../types').DataQualityAuditResult}
   */
  audit(expenses, options) {
    return DatabaseAuditor.auditDataset(expenses, options);
  }

  /**
   * Instantiable auditor dataset method delegating to static auditDataset.
   *
   * @param {any[]} expenses
   * @param {object} [options]
   * @returns {import('../types').DataQualityAuditResult}
   */
  auditDataset(expenses, options) {
    return DatabaseAuditor.auditDataset(expenses, options);
  }

  /**
   * Instantiable sanitizer method delegating to static sanitizeExpenseList.
   *
   * @param {any[]} expenses
   * @param {object} [options]
   * @returns {import('../types').DataQualitySanitizationResult}
   */
  sanitize(expenses, options) {
    return DatabaseAuditor.sanitizeExpenseList(expenses, options);
  }

  /**
   * Instantiable sanitizer list method delegating to static sanitizeExpenseList.
   *
   * @param {any[]} expenses
   * @param {object} [options]
   * @returns {import('../types').DataQualitySanitizationResult}
   */
  sanitizeExpenseList(expenses, options) {
    return DatabaseAuditor.sanitizeExpenseList(expenses, options);
  }
}

module.exports = DatabaseAuditor;
