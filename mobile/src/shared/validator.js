/**
 * ============================================================================
 * Ledgerly Mobile — Shared Core Schema & Validation Bridge
 * ============================================================================
 *
 * @fileoverview
 * ESM adapter bridging core domain validation rules from src/validation/schemaValidator.js
 * and system constants from src/constants.js into the mobile application without
 * code duplication.
 */

'use strict';

import * as coreValidator from '@ledgerly/core/validation/schemaValidator.js';
import * as coreConstants from '@ledgerly/core/constants.js';

export const {
  validateMobileTransaction,
  validateMobileReceiptQueueItem,
  validateSyncQueueItem,
  validateExpenseInput,
  validateCategoryName,
  isValidCalendarDate,
  formatSuccess,
  formatError
} = coreValidator;

export const {
  SyncStatus,
  SyncAction,
  SyncEntityType,
  VALIDATION_LIMITS,
  DEFAULT_CATEGORIES,
  DEFAULTS,
  ErrorCode
} = coreConstants;

export default {
  validateMobileTransaction,
  validateMobileReceiptQueueItem,
  validateSyncQueueItem,
  validateExpenseInput,
  validateCategoryName,
  isValidCalendarDate,
  formatSuccess,
  formatError,
  SyncStatus,
  SyncAction,
  SyncEntityType,
  VALIDATION_LIMITS,
  DEFAULT_CATEGORIES,
  DEFAULTS,
  ErrorCode
};
