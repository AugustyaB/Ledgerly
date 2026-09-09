/**
 * ============================================================================
 * Ledgerly — System Constants, Enums & Configuration Defaults
 * ============================================================================
 * 
 * @fileoverview
 * Single source of truth for immutable enumeration values, default thresholds,
 * file format constraints, and domain mappings used across Ledgerly.
 * 
 * DESIGN PRINCIPLES:
 * - All exported objects are deeply frozen (Object.freeze) to guarantee runtime immutability.
 * - Eliminates duplicate magic strings and scattered literal numbers across files.
 * - Engineered with forward extensibility: easily append new currencies, payment
 *   methods, or bill frequencies without breaking backward compatibility.
 */

'use strict';

// ============================================================================
// 1. Transaction & Payment Enums
// ============================================================================

/**
 * Supported payment methods and financial instruments.
 * @readonly
 * @enum {string}
 */
const PaymentMethod = Object.freeze({
  UPI: 'UPI / GPay',
  CREDIT_CARD: 'Credit Card',
  DEBIT_CARD: 'Debit Card',
  CASH: 'Cash',
  NET_BANKING: 'Net Banking',
  BANK_TRANSFER: 'Bank Transfer',
  WALLET: 'Digital Wallet',
  CRYPTO: 'Cryptocurrency',
  OTHER: 'Other'
});

/**
 * Standard baseline categories provided for fresh profiles.
 * Users can add, edit, or delete custom categories at runtime.
 * @readonly
 * @type {string[]}
 */
const DEFAULT_CATEGORIES = Object.freeze([
  'Food & Dining',
  'Transportation',
  'Office & Tech',
  'Subscriptions & Software',
  'Utilities & Bills',
  'Travel & Lodging',
  'Healthcare & Wellness',
  'Entertainment',
  'Miscellaneous'
]);

// ============================================================================
// 2. Timeline & Contextual Relation Enums
// ============================================================================

/**
 * Supported contextual relation dimensions for notes.
 * @readonly
 * @enum {string}
 */
const NoteRelation = Object.freeze({
  TRANSACTION: 'transaction',
  DAY: 'day',
  WEEK: 'week',
  MONTH: 'month'
});

/**
 * Application interface workspace viewing modes.
 * @readonly
 * @enum {string}
 */
const WorkspaceMode = Object.freeze({
  HOUSEHOLD: 'household',
  SOLO: 'solo'
});

// ============================================================================
// 3. Recurring Utilities & Frequency Enums
// ============================================================================

/**
 * Recurrence intervals supported for scheduled utility bills.
 * @readonly
 * @enum {string}
 */
const BillFrequency = Object.freeze({
  WEEKLY: 'weekly',
  BIWEEKLY: 'biweekly',
  MONTHLY: 'monthly',
  QUARTERLY: 'quarterly',
  YEARLY: 'yearly'
});

// ============================================================================
// 4. Notification & Alert System Enums
// ============================================================================

/**
 * Categories of system notifications and automated proactive alerts.
 * @readonly
 * @enum {string}
 */
const NotificationType = Object.freeze({
  SYSTEM: 'system',
  BUDGET: 'budget',
  BILL: 'bill',
  HOUSEHOLD: 'household',
  REMINDER: 'reminder',
  PAYDAY: 'payday'
});

// ============================================================================
// 5. File System & Media Constraints
// ============================================================================

/**
 * Whitelist of acceptable receipt photo file extensions.
 * @readonly
 * @type {string[]}
 */
const ALLOWED_RECEIPT_EXTENSIONS = Object.freeze([
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.gif'
]);

/**
 * Whitelist of financial file formats accepted by the Universal File Importer.
 * @readonly
 * @type {string[]}
 */
const ALLOWED_IMPORT_EXTENSIONS = Object.freeze([
  '.csv',
  '.xls',
  '.xlsx',
  '.ofx',
  '.qfx',
  '.json',
  '.pdf'
]);

// ============================================================================
// 6. Security, Cryptography & Engine Defaults
// ============================================================================

/**
 * Core security, pacing calculation, and system operational defaults.
 * @readonly
 */
const DEFAULTS = Object.freeze({
  // Cryptography & Authentication
  PBKDF2_ITERATIONS: 210000,
  PBKDF2_KEY_LENGTH: 64,
  PBKDF2_DIGEST: 'sha512',
  SALT_BYTES: 16,
  MIN_PASSWORD_LENGTH: 3,
  MAX_LOGIN_ATTEMPTS: 5,
  LOCKOUT_DURATION_MS: 30000,

  // Budget & Currency
  CURRENCY_SYMBOL: '₹',
  DEFAULT_MONTHLY_INCOME: 60000.0,
  DEFAULT_FIXED_BILLS: 20000.0,
  DEFAULT_SAVINGS_GOAL: 10000.0,
  DEFAULT_PAYDAY: 1,

  // Performance & Capacity Caps
  MAX_STORED_NOTIFICATIONS: 50,
  MAX_PAGE_SIZE: 100,
  DEFAULT_FEED_PAGE_SIZE: 20,
  MAX_PRESETS_COUNT: 20
});

// ============================================================================
// 7. Standardized Error Codes & Validation Limits (Phase 5)
// ============================================================================

/**
 * Standardized system-wide error codes for IPC contracts and domain exceptions.
 * @readonly
 * @enum {string}
 */
const ErrorCode = Object.freeze({
  INVALID_ARGUMENT: 'INVALID_ARGUMENT',
  NOT_FOUND: 'NOT_FOUND',
  AUTH_REQUIRED: 'AUTH_REQUIRED',
  IO_ERROR: 'IO_ERROR',
  CONCURRENCY_ERROR: 'CONCURRENCY_ERROR',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  ERR_IMAGE_BLURRY: 'ERR_IMAGE_BLURRY',
  ERR_PDF_ENCRYPTED: 'ERR_PDF_ENCRYPTED',
  ERR_UNSUPPORTED_FORMAT: 'ERR_UNSUPPORTED_FORMAT',
  ERR_CHECKSUM_MISMATCH: 'ERR_CHECKSUM_MISMATCH',
  ERR_INSUFFICIENT_DISK_SPACE: 'ERR_INSUFFICIENT_DISK_SPACE',
  ERR_MODEL_PROTECTED: 'ERR_MODEL_PROTECTED',
  ERR_DOWNLOAD_FAILED: 'ERR_DOWNLOAD_FAILED'
});

/**
 * Validation boundary constraints and string length limits.
 * @readonly
 */
const VALIDATION_LIMITS = Object.freeze({
  MAX_TITLE_LENGTH: 120,
  MAX_CATEGORY_LENGTH: 50,
  MAX_NAME_LENGTH: 60,
  MAX_DESCRIPTION_LENGTH: 500,
  MAX_NOTE_CONTENT_LENGTH: 5000,
  MAX_AMOUNT: 100000000, // 100,000,000 max transaction size
  MIN_AMOUNT: 0.01,
  MAX_ID_LENGTH: 64,
  MAX_TAG_LENGTH: 40,
  MAX_TAGS_COUNT: 10,
  MAX_SPLIT_MEMBERS: 20,
  MAX_IMPORT_FILE_SIZE: 50 * 1024 * 1024, // 50 Megabytes hard limit
  MAX_IMPORT_ROWS: 25000, // Maximum transactions parsed per statement file
  MAX_BATCH_ROWS: 5000 // Maximum rows allowed in batch grid
});

// ============================================================================
// 8. Export Module Interface
// ============================================================================

module.exports = {
  PaymentMethod,
  DEFAULT_CATEGORIES,
  NoteRelation,
  WorkspaceMode,
  BillFrequency,
  NotificationType,
  ALLOWED_RECEIPT_EXTENSIONS,
  ALLOWED_IMPORT_EXTENSIONS,
  DEFAULTS,
  ErrorCode,
  VALIDATION_LIMITS
};
