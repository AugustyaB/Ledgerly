/**
 * ============================================================================
 * Ledgerly — ExpenseService (Transaction, Category & Preset Service)
 * ============================================================================
 *
 * @fileoverview
 * Domain service managing the lifecycle of expense transactions, categorization,
 * dynamic search/filtering, bulk imports, and 1-click quick presets.
 *
 * ARCHITECTURAL PRINCIPLES:
 * - Single Responsibility: Manages financial transaction records and categories.
 * - Encapsulation: Ensures expense normalization, ID generation, and defensive checks.
 * - Dependency Injection: Operates through injected JsonDatabase and ProfileService.
 * - Extensibility: Supports optional multi-currency, status, tax, and metadata attributes.
 */

'use strict';

/**
 * @class ExpenseService
 * Manages expense CRUD operations, search filters, bulk batch inserts, categories, and presets.
 */
class ExpenseService {
  /**
   * Initializes the ExpenseService with injected database and profile services.
   *
   * @param {import('./JsonDatabase')} db - The database persistence service.
   * @param {import('./ProfileService')} profileService - The profile management service.
   */
  constructor(db, profileService) {
    if (!db || !profileService) {
      throw new Error('ExpenseService requires valid JsonDatabase and ProfileService instances.');
    }

    /** @private */
    this._db = db;

    /** @private */
    this._profiles = profileService;
  }

  // ==========================================================================
  // 1. Expense Lifecycle Operations (CRUD)
  // ==========================================================================

  /**
   * Appends a new expense entry to the active profile's ledger.
   *
   * @param {Partial<import('../types').Expense>} expense - Raw expense input data.
   * @returns {import('../types').Expense} Fully constructed and persisted expense entity.
   */
  add(expense = {}) {
    const active = this._profiles.getActive();
    const data = this._profiles.getActiveData();

    const newExpense = {
      id: 'exp-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
      title: expense.title || 'Untitled Expense',
      amount: parseFloat(String(expense.amount)) || 0,
      category: expense.category || 'Miscellaneous',
      paymentMethod: expense.paymentMethod || 'Cash',
      date: expense.date || new Date().toISOString().split('T')[0],
      description: expense.description || '',
      tags: Array.isArray(expense.tags)
        ? expense.tags
        : expense.tags
          ? String(expense.tags)
              .split(',')
              .map(t => t.trim())
          : [],
      receiptFilename: expense.receiptFilename || null,
      paidBy: expense.paidBy && expense.paidBy !== 'Self' ? expense.paidBy : active ? active.name : 'Self',
      splitWith: Array.isArray(expense.splitWith) ? expense.splitWith : expense.splitWith ? [expense.splitWith] : [],
      isHouseholdExpense: Boolean(expense.isHouseholdExpense || (expense.splitWith && expense.splitWith.length > 0)),

      // Future extensibility slots
      currency: expense.currency || 'INR',
      exchangeRate: expense.exchangeRate || 1.0,
      isRecurring: Boolean(expense.isRecurring),
      recurringBillId: expense.recurringBillId || null,
      status: expense.status || 'cleared',
      taxAmount: expense.taxAmount || 0,
      location: expense.location || null,
      metadata: expense.metadata || {}
    };

    data.expenses.unshift(newExpense);
    this._profiles.saveActiveData(data);

    return newExpense;
  }

  /**
   * Updates an existing expense record by ID.
   * Searches active profile first, then searches across all other profiles if needed.
   *
   * @param {Partial<import('../types').Expense> & { id: string }} updated - Fields to update.
   * @returns {import('../types').OperationResult & { expense?: import('../types').Expense }}
   */
  update(updated = { id: '' }) {
    if (!updated.id) {
      return { success: false, error: 'Expense ID is required' };
    }

    const root = this._db.read();
    let targetProfile = root.profiles.find(p => p.id === root.activeProfileId);
    let targetIndex = -1;

    // Search active profile first
    if (targetProfile && Array.isArray(targetProfile.data?.expenses)) {
      targetIndex = targetProfile.data.expenses.findIndex(e => e.id === updated.id);
    }

    // Search all profiles if not found in active profile
    if (targetIndex === -1) {
      for (const p of root.profiles || []) {
        if (Array.isArray(p.data?.expenses)) {
          const idx = p.data.expenses.findIndex(e => e.id === updated.id);
          if (idx !== -1) {
            targetProfile = p;
            targetIndex = idx;
            break;
          }
        }
      }
    }

    if (targetProfile && targetIndex !== -1) {
      const expList = targetProfile.data.expenses;
      expList[targetIndex] = {
        ...expList[targetIndex],
        ...updated,
        amount:
          updated.amount !== undefined
            ? parseFloat(String(updated.amount)) || expList[targetIndex].amount
            : expList[targetIndex].amount,
        tags: Array.isArray(updated.tags)
          ? updated.tags
          : typeof updated.tags === 'string'
            ? updated.tags.split(',').map(t => t.trim())
            : expList[targetIndex].tags,
        receiptFilename:
          updated.receiptFilename !== undefined ? updated.receiptFilename : expList[targetIndex].receiptFilename,
        paidBy: updated.paidBy || expList[targetIndex].paidBy || 'Self',
        splitWith: Array.isArray(updated.splitWith) ? updated.splitWith : expList[targetIndex].splitWith || [],
        isHouseholdExpense:
          updated.isHouseholdExpense !== undefined
            ? Boolean(updated.isHouseholdExpense)
            : expList[targetIndex].isHouseholdExpense
      };

      this._db.write(root);
      return { success: true, expense: expList[targetIndex] };
    }

    return { success: false, error: 'Expense not found' };
  }

  /**
   * Deletes an expense by ID across active profile and secondary profiles.
   *
   * @param {string} id - Unique ID of the expense to remove.
   * @returns {import('../types').OperationResult & { id?: string }}
   */
  delete(id) {
    if (!id) {
      return { success: false, error: 'Expense ID is required' };
    }

    const root = this._db.read();

    // 1. Try active profile first
    const active = root.profiles.find(p => p.id === root.activeProfileId);
    if (active && Array.isArray(active.data?.expenses)) {
      const idx = active.data.expenses.findIndex(e => e.id === id);
      if (idx !== -1) {
        active.data.expenses.splice(idx, 1);
        this._db.write(root);
        return { success: true, id };
      }
    }

    // 2. Search secondary profiles
    for (const p of root.profiles || []) {
      if (Array.isArray(p.data?.expenses)) {
        const idx = p.data.expenses.findIndex(e => e.id === id);
        if (idx !== -1) {
          p.data.expenses.splice(idx, 1);
          this._db.write(root);
          return { success: true, id };
        }
      }
    }

    return { success: false, error: 'Expense not found' };
  }

  /**
   * Clears all expense records in the active profile.
   *
   * @returns {import('../types').OperationResult & { clearedCount: number }}
   */
  clearAll() {
    const data = this._profiles.getActiveData();
    const clearedCount = (data.expenses || []).length;
    data.expenses = [];
    this._profiles.saveActiveData(data);

    return { success: true, clearedCount };
  }

  // ==========================================================================
  // 2. Querying, Filtering & Bulk Insertion
  // ==========================================================================

  /**
   * Retrieves all expenses for the active profile.
   *
   * @returns {import('../types').Expense[]}
   */
  getAll() {
    const data = this._profiles.getActiveData();
    return data.expenses || [];
  }

  /**
   * Retrieves a single expense by ID across active profile and secondary profiles.
   *
   * @param {string} id - Unique expense identifier.
   * @returns {import('../types').OperationResult & { expense?: import('../types').Expense }}
   */
  getById(id) {
    if (!id) {
      return { success: false, error: 'Expense ID is required' };
    }

    const root = this._db.read();

    // 1. Try active profile first
    const active = root.profiles.find(p => p.id === root.activeProfileId);
    if (active && Array.isArray(active.data?.expenses)) {
      const exp = active.data.expenses.find(e => e.id === id);
      if (exp) {
        return { success: true, expense: exp };
      }
    }

    // 2. Search across all other profiles
    for (const p of root.profiles || []) {
      if (Array.isArray(p.data?.expenses)) {
        const exp = p.data.expenses.find(e => e.id === id);
        if (exp) {
          return { success: true, expense: exp };
        }
      }
    }

    return { success: false, error: 'Expense not found' };
  }

  /**
   * Filters active profile expenses by query text, category, tag, and date range.
   *
   * @param {import('../types').ExpenseFilters} [filters] - Filter parameters.
   * @returns {import('../types').ExpenseQueryResult} Filtered results with totals.
   */
  getFiltered(filters = {}) {
    const data = this._profiles.getActiveData();
    let result = data.expenses || [];

    if (filters.category && filters.category !== 'All') {
      result = result.filter(e => e.category === filters.category);
    }

    if (filters.startDate) {
      result = result.filter(e => e.date >= filters.startDate);
    }

    if (filters.endDate) {
      result = result.filter(e => e.date <= filters.endDate);
    }

    if (filters.tag) {
      const targetTag = filters.tag.toLowerCase();
      result = result.filter(e => (e.tags || []).some(t => t.toLowerCase() === targetTag));
    }

    if (filters.query) {
      const q = filters.query.toLowerCase();
      result = result.filter(
        e =>
          (e.title && e.title.toLowerCase().includes(q)) ||
          (e.description && e.description.toLowerCase().includes(q)) ||
          (e.category && e.category.toLowerCase().includes(q))
      );
    }

    const totalAmount = result.reduce((sum, e) => sum + (e.amount || 0), 0);

    return {
      expenses: result,
      totalCount: result.length,
      totalAmount
    };
  }

  /**
   * Bulk inserts an array of parsed expenses (e.g. from CSV or bank statement import).
   *
   * @param {Array<Partial<import('../types').Expense>>} expenseArray - Expenses to import.
   * @returns {{ success: boolean, imported: number, errors: string[] }}
   */
  bulkAdd(expenseArray) {
    if (!Array.isArray(expenseArray) || expenseArray.length === 0) {
      return { success: false, imported: 0, errors: ['No expenses provided'] };
    }

    const data = this._profiles.getActiveData();
    const errors = [];
    let imported = 0;

    expenseArray.forEach((exp, idx) => {
      try {
        const amount = parseFloat(String(exp.amount));
        if (isNaN(amount) || amount <= 0) {
          errors.push(`Row ${idx + 1}: Invalid amount "${exp.amount}"`);
          return;
        }

        const newExpense = {
          id: 'exp-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6) + '-' + idx,
          title: exp.title || exp.description || 'Imported Expense',
          amount: amount,
          category: exp.category || 'Imported',
          paymentMethod: exp.paymentMethod || 'Unknown',
          date: exp.date || new Date().toISOString().split('T')[0],
          description: exp.description || '',
          tags: Array.isArray(exp.tags)
            ? exp.tags
            : exp.tags
              ? String(exp.tags)
                  .split(',')
                  .map(t => t.trim())
              : ['imported'],
          receiptFilename: exp.receiptFilename || null,
          paidBy: exp.paidBy || 'Self',
          splitWith: Array.isArray(exp.splitWith) ? exp.splitWith : [],
          isHouseholdExpense: Boolean(exp.isHouseholdExpense),
          metadata: exp.metadata || undefined
        };

        data.expenses.unshift(newExpense);
        imported++;
      } catch (err) {
        errors.push(`Row ${idx + 1}: ${err.message}`);
      }
    });

    this._profiles.saveActiveData(data);
    return { success: imported > 0, imported, errors };
  }

  // ==========================================================================
  // 3. Category Management
  // ==========================================================================

  /**
   * Retrieves categories configured for the active profile.
   *
   * @returns {string[]} List of category names.
   */
  getCategories() {
    const data = this._profiles.getActiveData();
    return data.categories || [];
  }

  /**
   * Adds a new category to the active profile.
   *
   * @param {string} categoryName - Name of category to append.
   * @returns {import('../types').OperationResult & { categories?: string[] }}
   */
  addCategory(categoryName) {
    if (!categoryName || typeof categoryName !== 'string') {
      return { success: false, error: 'Invalid category name' };
    }

    const trimmed = categoryName.trim();
    const data = this._profiles.getActiveData();

    if (!Array.isArray(data.categories)) {
      data.categories = [];
    }

    if (!data.categories.includes(trimmed)) {
      data.categories.push(trimmed);
      this._profiles.saveActiveData(data);
      return { success: true, categories: data.categories };
    }

    return { success: false, error: 'Category already exists' };
  }

  /**
   * Deletes a category from the active profile.
   *
   * @param {string} categoryName - Category to remove.
   * @returns {import('../types').OperationResult & { categories?: string[] }}
   */
  deleteCategory(categoryName) {
    const data = this._profiles.getActiveData();
    if (!Array.isArray(data.categories)) {
      return { success: false, error: 'Category not found' };
    }

    const initialLen = data.categories.length;
    data.categories = data.categories.filter(c => c.toLowerCase() !== categoryName.toLowerCase());

    if (data.categories.length !== initialLen) {
      this._profiles.saveActiveData(data);
      return { success: true, categories: data.categories };
    }

    return { success: false, error: 'Category not found' };
  }

  // ==========================================================================
  // 4. Quick-Log Presets Management
  // ==========================================================================

  /**
   * Retrieves presets configured for the active profile.
   *
   * @returns {import('../types').ExpensePreset[]} List of preset objects.
   */
  getPresets() {
    const data = this._profiles.getActiveData();
    return data.presets || [];
  }

  /**
   * Creates a new preset chip for 1-click frequent expense logging.
   *
   * @param {Partial<import('../types').ExpensePreset>} preset - Preset properties.
   * @returns {import('../types').OperationResult & { preset?: import('../types').ExpensePreset, presets?: import('../types').ExpensePreset[] }}
   */
  addPreset(preset = {}) {
    const data = this._profiles.getActiveData();
    if (!Array.isArray(data.presets)) {
      data.presets = [];
    }

    const newPreset = {
      id: 'pst-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
      icon: preset.icon || 'tag',
      title: preset.title || 'Quick Expense',
      amount: parseFloat(String(preset.amount)) || 0,
      category: preset.category || 'Miscellaneous',
      paymentMethod: preset.paymentMethod || 'Credit Card'
    };

    data.presets.push(newPreset);
    this._profiles.saveActiveData(data);

    return { success: true, preset: newPreset, presets: data.presets };
  }

  /**
   * Updates an existing preset chip.
   *
   * @param {Partial<import('../types').ExpensePreset> & { id: string }} updated - Updated fields.
   * @returns {import('../types').OperationResult & { preset?: import('../types').ExpensePreset, presets?: import('../types').ExpensePreset[] }}
   */
  updatePreset(updated = { id: '' }) {
    const data = this._profiles.getActiveData();
    if (!Array.isArray(data.presets)) {
      data.presets = [];
    }

    const index = data.presets.findIndex(p => p.id === updated.id);
    if (index !== -1) {
      data.presets[index] = {
        ...data.presets[index],
        ...updated,
        amount:
          updated.amount !== undefined
            ? parseFloat(String(updated.amount)) || data.presets[index].amount
            : data.presets[index].amount
      };

      this._profiles.saveActiveData(data);
      return { success: true, preset: data.presets[index], presets: data.presets };
    }

    return { success: false, error: 'Preset not found' };
  }

  /**
   * Deletes a preset chip by ID.
   *
   * @param {string} id - Preset identifier.
   * @returns {import('../types').OperationResult & { presets?: import('../types').ExpensePreset[] }}
   */
  deletePreset(id) {
    const data = this._profiles.getActiveData();
    if (!Array.isArray(data.presets)) {
      data.presets = [];
    }

    const filtered = data.presets.filter(p => p.id !== id);
    if (filtered.length !== data.presets.length) {
      data.presets = filtered;
      this._profiles.saveActiveData(data);
      return { success: true, presets: data.presets };
    }

    return { success: false, error: 'Preset not found' };
  }
}

module.exports = ExpenseService;
