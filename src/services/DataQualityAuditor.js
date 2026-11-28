/**
 * ============================================================================
 * Ledgerly — DataQualityAuditor (Backward-Compatible Facade Shim)
 * ============================================================================
 *
 * @fileoverview
 * Backward-compatible facade shim delegating data quality auditing,
 * sanitization, and parsing routines directly to the unified DatabaseAuditor
 * service (Milestone v1.2.0 Phase 2).
 *
 * ARCHITECTURAL PRINCIPLES:
 * - Anti-Overengineering Consolidation: Merged into `DatabaseAuditor.js` to
 *   eliminate redundant domain auditing services.
 * - Non-Breaking Shim: Retains 100% API compatibility for existing test suites
 *   and callers expecting `DataQualityAuditor`.
 */

'use strict';

const DatabaseAuditor = require('./DatabaseAuditor');

class DataQualityAuditor {
  /**
   * Validates whether a calendar date string is a real, valid calendar date (YYYY-MM-DD).
   *
   * @param {any} dateStr
   * @returns {boolean}
   */
  static isValidCalendarDate(dateStr) {
    return DatabaseAuditor.isValidCalendarDate(dateStr);
  }

  /**
   * Sanitizes and parses an amount value into a valid non-negative float.
   *
   * @param {any} raw
   * @returns {{ parsed: number, isClean: boolean, isValid: boolean }}
   */
  static parseAmount(raw) {
    return DatabaseAuditor.parseAmount(raw);
  }

  /**
   * Calculates a 0-100 data quality score based on total scanned and clean items.
   *
   * @param {{ totalScanned?: number, cleanCount?: number }} metrics
   * @returns {number}
   */
  static scoreQuality(metrics) {
    return DatabaseAuditor.scoreQuality(metrics);
  }

  /**
   * Performs an exhaustive, non-mutating data quality audit across an expense array.
   *
   * @param {any[]} [expenses=[]]
   * @param {object} [options={}]
   * @returns {import('../types').DataQualityAuditResult}
   */
  static audit(expenses = [], options = {}) {
    return DatabaseAuditor.auditDataset(expenses, options);
  }

  /**
   * Alias for audit.
   *
   * @param {any[]} [dataset=[]]
   * @param {object} [options={}]
   * @returns {import('../types').DataQualityAuditResult}
   */
  static auditDataset(dataset = [], options = {}) {
    return DatabaseAuditor.auditDataset(dataset, options);
  }

  /**
   * Non-destructively sanitizes and normalizes an expense array, repairing defects.
   *
   * @param {any[]} [expenses=[]]
   * @param {object} [options={}]
   * @returns {import('../types').DataQualitySanitizationResult}
   */
  static sanitize(expenses = [], options = {}) {
    return DatabaseAuditor.sanitizeExpenseList(expenses, options);
  }

  /**
   * Alias for sanitize.
   *
   * @param {any[]} [expenses=[]]
   * @param {object} [options={}]
   * @returns {import('../types').DataQualitySanitizationResult}
   */
  static sanitizeExpenseList(expenses = [], options = {}) {
    return DatabaseAuditor.sanitizeExpenseList(expenses, options);
  }

  /**
   * Sanitizes a single expense record non-destructively.
   *
   * @param {any} record
   * @param {object} [options={}]
   * @param {object} [context={}]
   * @returns {{ sanitized: object, changed: boolean, changes: Array<object> }}
   */
  static sanitizeRecord(record, options = {}, context = {}) {
    return DatabaseAuditor.sanitizeRecord(record, options, context);
  }

  /**
   * Instantiable auditor method delegating to DatabaseAuditor.
   *
   * @param {any[]} expenses
   * @param {object} [options]
   * @returns {import('../types').DataQualityAuditResult}
   */
  audit(expenses, options) {
    return DatabaseAuditor.auditDataset(expenses, options);
  }

  /**
   * Instantiable sanitizer method delegating to DatabaseAuditor.
   *
   * @param {any[]} expenses
   * @param {object} [options]
   * @returns {import('../types').DataQualitySanitizationResult}
   */
  sanitize(expenses, options) {
    return DatabaseAuditor.sanitizeExpenseList(expenses, options);
  }
}

module.exports = DataQualityAuditor;
