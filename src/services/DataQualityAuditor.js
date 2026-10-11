/**
 * ============================================================================
 * Ledgerly — DataQualityAuditor (Pre-Processing Sanitizer & Integrity Engine)
 * ============================================================================
 *
 * @fileoverview
 * Domain service providing pre-processing sanitization, data quality auditing,
 * and defect remediation for user ledger data prior to ingestion into ML models,
 * aggregation rollups, and statistical intelligence pipelines (Phase 0.8.2).
 *
 * ARCHITECTURAL PRINCIPLES:
 * - Deterministic Diagnostics: Classifies and scores ledger integrity metrics.
 * - Non-Destructive Sanitization: Generates clean, repaired copies of records
 *   without ever deleting user rows or altering original inputs in-place.
 * - Robust Defect Trapping: Identifies nulls, malformed ISO dates, missing categories,
 *   untrimmed whitespace, negative/NaN amounts, and duplicate identifier collisions.
 * - Offline Hermetic: Pure native JavaScript with zero external dependencies.
 */

'use strict';

class DataQualityAuditor {
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
   * Performs an exhaustive, non-mutating data quality audit across an expense array.
   *
   * @param {any[]} [expenses=[]] - Array of expense objects to audit.
   * @param {object} [options={}] - Optional auditing thresholds.
   * @returns {import('../types').DataQualityAuditResult}
   */
  static audit(expenses = [], options = {}) {
    if (!Array.isArray(expenses)) {
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
            originalValue: expenses
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

    expenses.forEach((item, index) => {
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
      const amtCheck = DataQualityAuditor.parseAmount(item.amount);
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
      if (!DataQualityAuditor.isValidCalendarDate(item.date)) {
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

    const totalScanned = expenses.length;
    const cleanCount = Math.max(0, totalScanned - defectiveItems);
    const qualityScore =
      totalScanned > 0 ? Math.round((cleanCount / totalScanned) * 1000) / 10 : 100;

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
   * Non-destructively sanitizes and normalizes an expense array, repairing defects.
   * Returns clean copies of the records along with a structured changelog.
   *
   * @param {any[]} [expenses=[]] - Array of transactions to sanitize.
   * @param {object} [options={}] - Sanitization options.
   * @param {string} [options.defaultCategory='Uncategorized'] - Category fallback.
   * @param {string} [options.defaultPaymentMethod='Cash'] - Payment method fallback.
   * @returns {import('../types').DataQualitySanitizationResult}
   */
  static sanitize(expenses = [], options = {}) {
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
    const todayIso = new Date().toISOString().split('T')[0];

    const sanitizedExpenses = [];
    const changes = [];
    const seenIds = new Set();
    let repairedCount = 0;

    expenses.forEach((item, index) => {
      let recordChanged = false;

      // Handle null/non-object item
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
        sanitizedExpenses.push(recovered);
        seenIds.add(recoveredId);
        changes.push({
          id: recoveredId,
          field: 'root',
          originalValue: item,
          sanitizedValue: recovered,
          reason: 'Reconstructed malformed or null record into standard expense entity.'
        });
        repairedCount++;
        return;
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
      const amtCheck = DataQualityAuditor.parseAmount(clean.amount);
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
      if (!DataQualityAuditor.isValidCalendarDate(clean.date)) {
        let repairedDate = todayIso;
        if (typeof clean.date === 'string') {
          // Attempt standard Date parsing
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
        // Normalize ISO timestamp with time component to simple YYYY-MM-DD
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

      if (recordChanged) {
        repairedCount++;
      }

      sanitizedExpenses.push(clean);
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
   * Instantiable auditor method delegating to static audit.
   *
   * @param {any[]} expenses
   * @param {object} [options]
   * @returns {import('../types').DataQualityAuditResult}
   */
  audit(expenses, options) {
    return DataQualityAuditor.audit(expenses, options);
  }

  /**
   * Instantiable sanitizer method delegating to static sanitize.
   *
   * @param {any[]} expenses
   * @param {object} [options]
   * @returns {import('../types').DataQualitySanitizationResult}
   */
  sanitize(expenses, options) {
    return DataQualityAuditor.sanitize(expenses, options);
  }
}

module.exports = DataQualityAuditor;
