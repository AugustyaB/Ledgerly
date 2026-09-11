/**
 * ============================================================================
 * Ledgerly — Zero-Dependency Runtime Schema Validator (Phase 5)
 * ============================================================================
 *
 * @fileoverview
 * High-performance, zero-dependency schema validation engine for all IPC boundaries
 * and domain entities. Enforces boundary contracts matching JSDoc types in
 * `src/types.js` and constants in `src/constants.js`.
 *
 * DESIGN PRINCIPLES:
 * - 100% offline & self-contained: No bulky external validation libraries (zod, joi).
 * - Comprehensive negative validation: guards against injection, type confusion,
 *   out-of-bounds numbers, invalid dates, and oversized payload DOS.
 * - Uniform result format: `{ valid: boolean, errors: string[] }`.
 * - Standardized IPC wire envelope formatters: `formatSuccess` and `formatError`.
 */

'use strict';

const { ErrorCode, VALIDATION_LIMITS, NoteRelation, BillFrequency } = require('../constants');

// ============================================================================
// 1. Primitive & Sanitization Helpers
// ============================================================================

/**
 * Checks if value is a non-null plain object.
 * @param {any} val
 * @returns {boolean}
 */
function isPlainObject(val) {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

/**
 * Checks if a string contains illegal control characters.
 * @param {string} str
 * @returns {boolean}
 */
function hasControlChars(str) {
  return /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(str);
}

/**
 * Checks whether an ID string conforms to safe identifier syntax.
 * @param {any} id
 * @param {string} [fieldName='ID']
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateId(id, fieldName = 'ID') {
  const errors = [];
  const strId = id !== null && id !== undefined ? String(id).trim() : '';
  if (!strId) {
    errors.push(`${fieldName} is required and must be a non-empty string.`);
  } else if (strId.length > VALIDATION_LIMITS.MAX_ID_LENGTH) {
    errors.push(`${fieldName} exceeds maximum length of ${VALIDATION_LIMITS.MAX_ID_LENGTH} characters.`);
  } else if (!/^[a-zA-Z0-9_\-.:]+$/.test(strId)) {
    errors.push(
      `${fieldName} contains invalid characters. Only alphanumeric, dashes, dots, colons, and underscores are permitted.`
    );
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Validates an ISO 8601 calendar date string (YYYY-MM-DD or full ISO).
 * @param {string} dateStr
 * @returns {boolean}
 */
function isValidCalendarDate(dateStr) {
  if (typeof dateStr !== 'string') {
    return false;
  }
  const datePart = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
    return false;
  }
  const [y, m, d] = datePart.split('-').map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;

  const testDate = new Date(y, m - 1, d);
  return testDate.getFullYear() === y && testDate.getMonth() === m - 1 && testDate.getDate() === d;
}

// ============================================================================
// 2. Domain Schema Validators
// ============================================================================

/**
 * Validates an expense entry payload.
 *
 * @param {any} expense - Raw expense input.
 * @param {boolean} [isUpdate=false] - Whether this is an update mutation.
 * @returns {import('../types').ValidationResult}
 */
function validateExpenseInput(expense, isUpdate = false) {
  const errors = [];

  if (!isPlainObject(expense)) {
    return { valid: false, errors: ['Expense payload must be a non-null object.'] };
  }

  // ID validation on update
  if (isUpdate) {
    const idCheck = validateId(expense.id, 'Expense ID');
    if (!idCheck.valid) errors.push(...idCheck.errors);
  }

  // Title validation
  if (!isUpdate || expense.title !== undefined) {
    if (typeof expense.title !== 'string' || !expense.title.trim()) {
      errors.push('Expense title is required and cannot be empty.');
    } else if (expense.title.trim().length > VALIDATION_LIMITS.MAX_TITLE_LENGTH) {
      errors.push(`Expense title exceeds maximum length of ${VALIDATION_LIMITS.MAX_TITLE_LENGTH} characters.`);
    } else if (hasControlChars(expense.title)) {
      errors.push('Expense title contains illegal control characters.');
    }
  }

  // Amount validation
  if (!isUpdate || expense.amount !== undefined) {
    const num = Number(expense.amount);
    if (expense.amount === undefined || expense.amount === null || isNaN(num) || !isFinite(num)) {
      errors.push('Expense amount must be a valid finite number.');
    } else if (num <= 0) {
      errors.push('Expense amount must be greater than zero.');
    } else if (num > VALIDATION_LIMITS.MAX_AMOUNT) {
      errors.push(`Expense amount cannot exceed ₹${VALIDATION_LIMITS.MAX_AMOUNT.toLocaleString()}.`);
    } else {
      const parts = String(expense.amount).split('.');
      if (parts[1] && parts[1].length > 2) {
        errors.push('Expense amount cannot have more than 2 decimal places.');
      }
    }
  }

  // Category validation
  if (!isUpdate || expense.category !== undefined) {
    if (typeof expense.category !== 'string' || !expense.category.trim()) {
      errors.push('Expense category is required.');
    } else if (expense.category.trim().length > VALIDATION_LIMITS.MAX_CATEGORY_LENGTH) {
      errors.push(`Expense category exceeds maximum length of ${VALIDATION_LIMITS.MAX_CATEGORY_LENGTH} characters.`);
    }
  }

  // Date validation
  if (!isUpdate || expense.date !== undefined) {
    if (expense.date !== undefined && expense.date !== null) {
      if (!isValidCalendarDate(expense.date)) {
        errors.push('Expense date must be a valid calendar date in YYYY-MM-DD format.');
      }
    }
  }

  // Payment Method validation (optional)
  if (expense.paymentMethod !== undefined && expense.paymentMethod !== null) {
    if (typeof expense.paymentMethod !== 'string') {
      errors.push('Payment method must be a string.');
    } else if (expense.paymentMethod.length > 50) {
      errors.push('Payment method cannot exceed 50 characters.');
    }
  }

  // PaidBy validation (optional)
  if (expense.paidBy !== undefined && expense.paidBy !== null) {
    if (typeof expense.paidBy !== 'string' || !expense.paidBy.trim()) {
      errors.push('Paid-by member name must be a non-empty string.');
    } else if (expense.paidBy.trim().length > VALIDATION_LIMITS.MAX_NAME_LENGTH) {
      errors.push(`Paid-by member name exceeds maximum length of ${VALIDATION_LIMITS.MAX_NAME_LENGTH} characters.`);
    }
  }

  // SplitWith validation (optional)
  if (expense.splitWith !== undefined && expense.splitWith !== null) {
    if (!Array.isArray(expense.splitWith) && typeof expense.splitWith !== 'string') {
      errors.push('Split-with must be an array of member names or a single member name string.');
    } else if (Array.isArray(expense.splitWith)) {
      if (expense.splitWith.length > VALIDATION_LIMITS.MAX_SPLIT_MEMBERS) {
        errors.push(`Split-with member count cannot exceed ${VALIDATION_LIMITS.MAX_SPLIT_MEMBERS}.`);
      }
      for (const m of expense.splitWith) {
        if (typeof m !== 'string' || !m.trim()) {
          errors.push('Split-with member names must be non-empty strings.');
          break;
        }
      }
    }
  }

  // Tags validation (optional)
  if (expense.tags !== undefined && expense.tags !== null) {
    const tagsArr = Array.isArray(expense.tags)
      ? expense.tags
      : typeof expense.tags === 'string'
        ? expense.tags.split(',')
        : null;

    if (!tagsArr) {
      errors.push('Tags must be an array of strings or comma-separated string.');
    } else {
      if (tagsArr.length > VALIDATION_LIMITS.MAX_TAGS_COUNT) {
        errors.push(`Expense cannot have more than ${VALIDATION_LIMITS.MAX_TAGS_COUNT} tags.`);
      }
      for (const t of tagsArr) {
        const trimmed = String(t).trim();
        if (trimmed.length > VALIDATION_LIMITS.MAX_TAG_LENGTH) {
          errors.push(`Tag exceeds maximum length of ${VALIDATION_LIMITS.MAX_TAG_LENGTH} characters: "${trimmed}".`);
          break;
        }
      }
    }
  }

  // Description validation (optional)
  if (expense.description !== undefined && expense.description !== null) {
    if (typeof expense.description !== 'string') {
      errors.push('Expense description must be a string.');
    } else if (expense.description.length > VALIDATION_LIMITS.MAX_DESCRIPTION_LENGTH) {
      errors.push(
        `Expense description exceeds maximum length of ${VALIDATION_LIMITS.MAX_DESCRIPTION_LENGTH} characters.`
      );
    }
  }

  // Receipt filename validation (optional)
  if (expense.receiptFilename !== undefined && expense.receiptFilename !== null) {
    if (typeof expense.receiptFilename !== 'string') {
      errors.push('Receipt filename must be a string.');
    } else if (expense.receiptFilename.includes('..') || /[/\\]/.test(expense.receiptFilename)) {
      errors.push('Receipt filename cannot contain path traversal characters.');
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validates a user profile payload.
 *
 * @param {any} profile - Profile input data.
 * @param {boolean} [isUpdate=false] - Whether this is an update mutation.
 * @returns {import('../types').ValidationResult}
 */
function validateProfileInput(profile, isUpdate = false) {
  const errors = [];

  if (!isPlainObject(profile)) {
    return { valid: false, errors: ['Profile payload must be a non-null object.'] };
  }

  if (isUpdate) {
    const idCheck = validateId(profile.id, 'Profile ID');
    if (!idCheck.valid) errors.push(...idCheck.errors);
  }

  if (!isUpdate || profile.name !== undefined) {
    if (typeof profile.name !== 'string' || !profile.name.trim()) {
      errors.push('Profile name is required and cannot be empty.');
    } else if (profile.name.trim().length > VALIDATION_LIMITS.MAX_NAME_LENGTH) {
      errors.push(`Profile name exceeds maximum length of ${VALIDATION_LIMITS.MAX_NAME_LENGTH} characters.`);
    } else if (hasControlChars(profile.name)) {
      errors.push('Profile name contains illegal control characters.');
    }
  }

  if (profile.color !== undefined && profile.color !== null) {
    if (typeof profile.color !== 'string' || profile.color.length > 30) {
      errors.push('Profile color must be a valid color string up to 30 characters.');
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validates salary and budget allocator configuration.
 *
 * @param {any} config - Budget configuration object.
 * @returns {import('../types').ValidationResult}
 */
function validateBudgetConfig(config) {
  const errors = [];

  if (!isPlainObject(config)) {
    return { valid: false, errors: ['Budget configuration must be a non-null object.'] };
  }

  if (config.monthlyIncome !== undefined && config.monthlyIncome !== null) {
    const inc = Number(config.monthlyIncome);
    if (isNaN(inc) || !isFinite(inc) || inc < 0) {
      errors.push('Monthly income must be a non-negative finite number.');
    } else if (inc > 1000000000) {
      errors.push('Monthly income cannot exceed ₹1,000,000,000.');
    }
  }

  if (config.savingsGoal !== undefined && config.savingsGoal !== null) {
    const sav = Number(config.savingsGoal);
    if (isNaN(sav) || !isFinite(sav) || sav < 0) {
      errors.push('Savings goal must be a non-negative finite number.');
    }
  }

  if (config.payday !== undefined && config.payday !== null) {
    const day = Number(config.payday);
    if (!Number.isInteger(day) || day < 1 || day > 31) {
      errors.push('Payday must be an integer between 1 and 31.');
    }
  }

  if (config.fixedBills !== undefined && config.fixedBills !== null) {
    if (typeof config.fixedBills !== 'number' && !Array.isArray(config.fixedBills)) {
      errors.push('Fixed bills must be a numeric total or an array of bill items.');
    } else if (typeof config.fixedBills === 'number') {
      if (isNaN(config.fixedBills) || !isFinite(config.fixedBills) || config.fixedBills < 0) {
        errors.push('Fixed bills amount must be a non-negative finite number.');
      }
    } else if (Array.isArray(config.fixedBills)) {
      for (const b of config.fixedBills) {
        if (!isPlainObject(b)) {
          errors.push('Each fixed bill item must be an object.');
          break;
        }
        if (typeof b.name !== 'string' || !b.name.trim()) {
          errors.push('Fixed bill item name is required.');
          break;
        }
        const bAmt = Number(b.amount);
        if (isNaN(bAmt) || !isFinite(bAmt) || bAmt < 0) {
          errors.push(`Fixed bill "${b.name}" amount must be non-negative.`);
          break;
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validates a household member name.
 *
 * @param {any} name - Household member name.
 * @returns {import('../types').ValidationResult}
 */
function validateHouseholdMember(name) {
  const errors = [];
  if (typeof name !== 'string' || !name.trim()) {
    errors.push('Household member name is required and cannot be empty.');
  } else if (name.trim().length > VALIDATION_LIMITS.MAX_NAME_LENGTH) {
    errors.push(`Household member name cannot exceed ${VALIDATION_LIMITS.MAX_NAME_LENGTH} characters.`);
  } else if (hasControlChars(name)) {
    errors.push('Household member name contains illegal control characters.');
  } else if (/[<>{}]/.test(name)) {
    errors.push('Household member name cannot contain markup or brackets.');
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Validates a debt settlement reimbursement entry.
 *
 * @param {any} data - Settlement data payload.
 * @returns {import('../types').ValidationResult}
 */
function validateSettlement(data) {
  const errors = [];

  if (!isPlainObject(data)) {
    return { valid: false, errors: ['Settlement payload must be a non-null object.'] };
  }

  const payer = typeof data.from === 'string' && data.from.trim() ? data.from : data.payer;
  const payee = typeof data.to === 'string' && data.to.trim() ? data.to : data.payee;

  if (typeof payer !== 'string' || !payer.trim()) {
    errors.push('Settlement payer name is required.');
  } else if (payer.trim().length > VALIDATION_LIMITS.MAX_NAME_LENGTH) {
    errors.push(`Payer name cannot exceed ${VALIDATION_LIMITS.MAX_NAME_LENGTH} characters.`);
  }

  if (typeof payee !== 'string' || !payee.trim()) {
    errors.push('Settlement payee name is required.');
  } else if (payee.trim().length > VALIDATION_LIMITS.MAX_NAME_LENGTH) {
    errors.push(`Payee name cannot exceed ${VALIDATION_LIMITS.MAX_NAME_LENGTH} characters.`);
  }

  if (payer && payee && payer.trim().toLowerCase() === payee.trim().toLowerCase()) {
    errors.push('Payer and Payee cannot be the same member.');
  }

  const num = Number(data.amount);
  if (data.amount === undefined || data.amount === null || isNaN(num) || !isFinite(num)) {
    errors.push('Settlement amount must be a valid finite number.');
  } else if (num <= 0) {
    errors.push('Settlement amount must be greater than zero.');
  } else if (num > VALIDATION_LIMITS.MAX_AMOUNT) {
    errors.push(`Settlement amount cannot exceed ₹${VALIDATION_LIMITS.MAX_AMOUNT.toLocaleString()}.`);
  }

  if (data.date !== undefined && data.date !== null) {
    if (!isValidCalendarDate(data.date)) {
      errors.push('Settlement date must be a valid calendar date in YYYY-MM-DD format.');
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validates a contextual note entry.
 *
 * @param {any} note - Note payload.
 * @param {boolean} [isUpdate=false] - Whether this is an update mutation.
 * @returns {import('../types').ValidationResult}
 */
function validateNoteInput(note, isUpdate = false) {
  const errors = [];

  if (!isPlainObject(note)) {
    return { valid: false, errors: ['Note payload must be a non-null object.'] };
  }

  if (isUpdate) {
    const idCheck = validateId(note.id, 'Note ID');
    if (!idCheck.valid) errors.push(...idCheck.errors);
  }

  if (!isUpdate || note.relation !== undefined || note.relationType !== undefined) {
    let rel = note.relation !== undefined ? note.relation : note.relationType;
    if (rel === 'expense') rel = NoteRelation.TRANSACTION;
    const allowedRelations = Object.values(NoteRelation);
    if (!rel || !allowedRelations.includes(rel)) {
      errors.push(`Note relation must be one of: ${allowedRelations.join(', ')}.`);
    }
  }

  if (!isUpdate || note.relationId !== undefined) {
    const rId = note.relationId !== null && note.relationId !== undefined ? String(note.relationId).trim() : '';
    if (!rId) {
      errors.push('Note relationId is required and cannot be empty.');
    } else if (rId.length > VALIDATION_LIMITS.MAX_ID_LENGTH) {
      errors.push(`Note relationId cannot exceed ${VALIDATION_LIMITS.MAX_ID_LENGTH} characters.`);
    }
  }

  if (!isUpdate || note.content !== undefined) {
    if (typeof note.content !== 'string' || !note.content.trim()) {
      errors.push('Note content is required and cannot be empty.');
    } else if (note.content.length > VALIDATION_LIMITS.MAX_NOTE_CONTENT_LENGTH) {
      errors.push(`Note content cannot exceed ${VALIDATION_LIMITS.MAX_NOTE_CONTENT_LENGTH} characters.`);
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validates a recurring utility bill payload.
 *
 * @param {any} bill - Recurring bill payload.
 * @param {boolean} [isUpdate=false] - Whether this is an update mutation.
 * @returns {import('../types').ValidationResult}
 */
function validateRecurringBill(bill, isUpdate = false) {
  const errors = [];

  if (!isPlainObject(bill)) {
    return { valid: false, errors: ['Recurring bill payload must be a non-null object.'] };
  }

  if (isUpdate) {
    const idCheck = validateId(bill.id, 'Recurring Bill ID');
    if (!idCheck.valid) errors.push(...idCheck.errors);
  }

  if (!isUpdate || bill.name !== undefined || bill.title !== undefined) {
    const billTitle = bill.title !== undefined ? bill.title : bill.name;
    if (typeof billTitle !== 'string' || !billTitle.trim()) {
      errors.push('Recurring bill title is required.');
    } else if (billTitle.trim().length > 100) {
      errors.push('Recurring bill title cannot exceed 100 characters.');
    }
  }

  if (!isUpdate || bill.amount !== undefined) {
    const num = Number(bill.amount);
    if (bill.amount === undefined || isNaN(num) || !isFinite(num) || num <= 0) {
      errors.push('Recurring bill amount must be a positive finite number.');
    } else if (num > VALIDATION_LIMITS.MAX_AMOUNT) {
      errors.push(`Recurring bill amount cannot exceed ₹${VALIDATION_LIMITS.MAX_AMOUNT.toLocaleString()}.`);
    }
  }

  if (!isUpdate || bill.dueDay !== undefined) {
    const day = Number(bill.dueDay);
    if (!Number.isInteger(day) || day < 1 || day > 31) {
      errors.push('Recurring bill dueDay must be an integer between 1 and 31.');
    }
  }

  if (bill.frequency !== undefined && bill.frequency !== null) {
    const allowed = Object.values(BillFrequency);
    if (!allowed.includes(bill.frequency)) {
      errors.push(`Recurring bill frequency must be one of: ${allowed.join(', ')}.`);
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validates a category name.
 *
 * @param {any} categoryName
 * @returns {import('../types').ValidationResult}
 */
function validateCategoryName(categoryName) {
  const errors = [];
  if (typeof categoryName !== 'string' || !categoryName.trim()) {
    errors.push('Category name is required and cannot be empty.');
  } else if (categoryName.trim().length > VALIDATION_LIMITS.MAX_CATEGORY_LENGTH) {
    errors.push(`Category name cannot exceed ${VALIDATION_LIMITS.MAX_CATEGORY_LENGTH} characters.`);
  } else if (hasControlChars(categoryName)) {
    errors.push('Category name contains illegal control characters.');
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Validates a quick-entry preset payload.
 *
 * @param {any} preset - Preset payload.
 * @param {boolean} [isUpdate=false] - Whether this is an update mutation.
 * @returns {import('../types').ValidationResult}
 */
function validatePresetInput(preset, isUpdate = false) {
  const errors = [];

  if (!isPlainObject(preset)) {
    return { valid: false, errors: ['Preset payload must be a non-null object.'] };
  }

  if (isUpdate) {
    const idCheck = validateId(preset.id, 'Preset ID');
    if (!idCheck.valid) errors.push(...idCheck.errors);
  }

  if (!isUpdate || preset.title !== undefined) {
    if (typeof preset.title !== 'string' || !preset.title.trim()) {
      errors.push('Preset title is required.');
    } else if (preset.title.trim().length > VALIDATION_LIMITS.MAX_TITLE_LENGTH) {
      errors.push(`Preset title cannot exceed ${VALIDATION_LIMITS.MAX_TITLE_LENGTH} characters.`);
    }
  }

  if (!isUpdate || preset.amount !== undefined) {
    const num = Number(preset.amount);
    if (preset.amount === undefined || isNaN(num) || !isFinite(num) || num <= 0) {
      errors.push('Preset amount must be a positive finite number.');
    } else if (num > VALIDATION_LIMITS.MAX_AMOUNT) {
      errors.push(`Preset amount cannot exceed ₹${VALIDATION_LIMITS.MAX_AMOUNT.toLocaleString()}.`);
    }
  }

  if (!isUpdate || preset.category !== undefined) {
    if (typeof preset.category !== 'string' || !preset.category.trim()) {
      errors.push('Preset category is required.');
    } else if (preset.category.trim().length > VALIDATION_LIMITS.MAX_CATEGORY_LENGTH) {
      errors.push(`Preset category cannot exceed ${VALIDATION_LIMITS.MAX_CATEGORY_LENGTH} characters.`);
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validates a monthly budget goal amount.
 *
 * @param {any} amount - Target budget amount.
 * @returns {import('../types').ValidationResult}
 */
function validateBudgetGoal(amount) {
  const errors = [];
  const num = Number(amount);
  if (amount === undefined || amount === null || isNaN(num) || !isFinite(num) || num <= 0) {
    errors.push('Budget goal must be a positive finite number.');
  } else if (num > VALIDATION_LIMITS.MAX_AMOUNT) {
    errors.push(`Budget goal cannot exceed ₹${VALIDATION_LIMITS.MAX_AMOUNT.toLocaleString()}.`);
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Validates workspace mode selection.
 *
 * @param {any} mode - Workspace mode ('solo' or 'household').
 * @returns {import('../types').ValidationResult}
 */
function validateWorkspaceMode(mode) {
  const errors = [];
  if (mode !== 'solo' && mode !== 'household') {
    errors.push('Workspace mode must be either "solo" or "household".');
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Validates document normalizer input parameters (Phase 0.5.2).
 *
 * @param {any} input - Target file path string or Buffer.
 * @param {any} [options] - Normalization options.
 * @returns {import('../types').ValidationResult}
 */
function validateDocumentNormalizeInput(input, options) {
  const errors = [];
  if (typeof input !== 'string' && !Buffer.isBuffer(input) && !(input instanceof Uint8Array)) {
    errors.push('Document input must be a valid file path string or Buffer.');
  } else if (typeof input === 'string' && !input.trim()) {
    errors.push('Document file path cannot be an empty string.');
  }

  if (options !== undefined && options !== null) {
    if (!isPlainObject(options)) {
      errors.push('Options must be a plain object.');
    } else {
      if (options.page !== undefined && options.page !== 'all') {
        const pageNum = Number(options.page);
        if (!Number.isInteger(pageNum) || pageNum < 1) {
          errors.push('Option "page" must be "all" or a positive integer.');
        }
      }
      if (options.rejectBlur !== undefined && typeof options.rejectBlur !== 'boolean') {
        errors.push('Option "rejectBlur" must be a boolean.');
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validates receipt document scan input parameters (Phase 0.5.3).
 *
 * @param {any} input - Target file path string, Buffer, or normalized document.
 * @param {any} [options] - Scan options.
 * @returns {import('../types').ValidationResult}
 */
function validateReceiptScanInput(input, options) {
  const errors = [];
  if (
    typeof input !== 'string' &&
    !Buffer.isBuffer(input) &&
    !(input instanceof Uint8Array) &&
    (typeof input !== 'object' || input === null)
  ) {
    errors.push('Receipt scan input must be a valid file path string, Buffer, or normalized document object.');
  } else if (typeof input === 'string' && !input.trim()) {
    errors.push('Receipt scan file path cannot be an empty string.');
  }

  if (options !== undefined && options !== null) {
    if (!isPlainObject(options)) {
      errors.push('Options must be a plain object.');
    } else {
      const targetEngine = options.engine || options.preferredEngine;
      const ALLOWED_ENGINES = [
        'tier1-fastlite',
        'tier2-visionpro',
        'tier2-vision-precision',
        'tier2-vision-degraded',
        'tier2-vision-handwritten',
        'tier2-vision-multilingual',
        'tier2',
        'tier3-regional-in',
        'tier3-regional-us',
        'tier3-regional-eu',
        'tier3-regional-apac',
        'tier3',
        'auto'
      ];
      if (targetEngine !== undefined && targetEngine !== null && !ALLOWED_ENGINES.includes(targetEngine)) {
        errors.push(`Invalid engine "${targetEngine}". Must be one of: ${ALLOWED_ENGINES.join(', ')}.`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validates model management actions (download, cancel, delete, setActive, verify).
 *
 * @param {any} input - Model ID string or action payload object.
 * @param {any} [options] - Additional action options.
 * @returns {import('../types').ValidationResult}
 */
function validateModelActionInput(input, options) {
  const errors = [];
  const ALLOWED_MODEL_IDS = [
    'tier1-fastlite',
    'tier2-visionpro',
    'tier2-vision-precision',
    'tier2-vision-degraded',
    'tier2-vision-handwritten',
    'tier2-vision-multilingual',
    'tier3-regional-in',
    'tier3-regional-us',
    'tier3-regional-eu',
    'tier3-regional-apac'
  ];
  const ALLOWED_ACTIONS = ['download', 'cancel', 'delete', 'setActive', 'verify'];

  let modelId;
  let action = null;

  if (typeof input === 'string') {
    modelId = input.trim();
  } else if (isPlainObject(input)) {
    modelId = typeof input.modelId === 'string' ? input.modelId.trim() : null;
    action = typeof input.action === 'string' ? input.action.trim() : null;
  } else {
    return { valid: false, errors: ['Model action input must be a valid model ID string or payload object.'] };
  }

  if (!modelId) {
    errors.push('Model ID is required and cannot be empty.');
  } else if (!ALLOWED_MODEL_IDS.includes(modelId)) {
    errors.push(`Invalid model ID "${modelId}". Must be one of: ${ALLOWED_MODEL_IDS.join(', ')}.`);
  }

  if (action && !ALLOWED_ACTIONS.includes(action)) {
    errors.push(`Invalid action "${action}". Must be one of: ${ALLOWED_ACTIONS.join(', ')}.`);
  }

  if (options !== undefined && options !== null && !isPlainObject(options)) {
    errors.push('Action options must be a plain object.');
  }

  return { valid: errors.length === 0, errors };
}

// ============================================================================
// 3. Envelope Formatters
// ============================================================================

/**
 * Creates a standardized success response envelope.
 *
 * @template T
 * @param {T} data - The payload to wrap.
 * @param {Record<string, any>} [extras={}] - Additional metadata fields to merge for backward compat.
 * @returns {import('../types').IPCResponse<T>}
 */
function formatSuccess(data, extras = {}) {
  const envelope = {
    success: true,
    data: data !== undefined ? data : null
  };

  // If data is an object (not array, not null), merge its properties at top level for backward compatibility
  if (isPlainObject(data)) {
    Object.assign(envelope, data);
  }

  if (isPlainObject(extras)) {
    Object.assign(envelope, extras);
  }

  return envelope;
}

/**
 * Creates a standardized failure response envelope.
 *
 * @param {string} code - Machine-readable error code (e.g. INVALID_ARGUMENT).
 * @param {string} message - Human-readable error message.
 * @param {any} [details=null] - Detailed error violation list or diagnostic info.
 * @returns {import('../types').IPCResponse<never>}
 */
function formatError(code, message, details = null) {
  return {
    success: false,
    error: message || 'An error occurred during IPC processing.',
    code: code || ErrorCode.INTERNAL_ERROR,
    details: details || null
  };
}

// ============================================================================
// 4. Module Exports
// ============================================================================

module.exports = {
  isPlainObject,
  hasControlChars,
  isValidCalendarDate,
  validateId,
  validateExpenseInput,
  validateProfileInput,
  validateBudgetConfig,
  validateHouseholdMember,
  validateSettlement,
  validateNoteInput,
  validateRecurringBill,
  validateCategoryName,
  validatePresetInput,
  validateBudgetGoal,
  validateWorkspaceMode,
  validateDocumentNormalizeInput,
  validateReceiptScanInput,
  validateModelActionInput,
  formatSuccess,
  formatError
};
