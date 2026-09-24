/**
 * ============================================================================
 * Ledgerly — ProfileService (Multi-User Profile Management Service)
 * ============================================================================
 *
 * @fileoverview
 * Domain service managing the multi-user profile workspace layer.
 * Ledgerly isolates transactions, categories, presets, and budget configurations
 * by user profile (e.g. "Personal", "Business", "Family").
 *
 * ARCHITECTURAL PRINCIPLES:
 * - Single Responsibility: Manages profile lifecycles, active profile switching,
 *   and profile-scoped data partition access.
 * - Encapsulation: Provides structured interfaces for querying and updating profile
 *   ledgers without exposing the raw root database schema.
 * - Dependency Injection: Receives JsonDatabase instance via constructor.
 * - Data Isolation: Guarantees that newly created profiles start with a pristine,
 *   empty state (0 expenses) and default baseline configurations.
 */

'use strict';

const { DEFAULT_CATEGORIES, DEFAULTS } = require('../constants');

/**
 * @class ProfileService
 * Manages user profile CRUD, active profile switching, and profile data partition access.
 */
class ProfileService {
  /**
   * Initializes the ProfileService with an injected database instance.
   *
   * @param {import('./JsonDatabase')} db - Database persistence service.
   */
  constructor(db) {
    if (!db) {
      throw new Error('ProfileService requires a valid JsonDatabase instance.');
    }

    /** @private */
    this._db = db;
  }

  // ==========================================================================
  // 1. Active Profile Data Access
  // ==========================================================================

  /**
   * Retrieves the full data partition object for the currently active profile.
   * Auto-repairs missing arrays or fields to prevent runtime exceptions.
   *
   * @returns {import('../types').ProfileData} Active profile's encapsulated data object.
   */
  getActiveData() {
    const root = this._db.read();
    let active = root.profiles.find(p => p.id === root.activeProfileId);

    if (!active) {
      if (root.profiles.length > 0) {
        active = root.profiles[0];
        root.activeProfileId = active.id;
        this._db.write(root);
      } else {
        return this.createEmptyProfileData();
      }
    }

    if (!active.data) {
      active.data = this.createEmptyProfileData();
    }
    if (!Array.isArray(active.data.expenses)) {
      active.data.expenses = [];
    }
    if (!Array.isArray(active.data.categories)) {
      active.data.categories = this.getDefaultCategories();
    }
    if (!Array.isArray(active.data.presets)) {
      active.data.presets = this.getDefaultPresets();
    }
    if (!active.data.salaryConfig) {
      active.data.salaryConfig = this.getDefaultSalaryConfig();
    }
    if (!Array.isArray(active.data.householdMembers)) {
      active.data.householdMembers = ['Self', 'Partner', 'Roommate'];
    }
    if (!Array.isArray(active.data.notes)) {
      active.data.notes = [];
    }
    if (!Array.isArray(active.data.notifications)) {
      active.data.notifications = [];
    }

    return active.data;
  }

  /**
   * Persists updated data partition for the currently active profile.
   *
   * @param {import('../types').ProfileData} data - The modified profile data.
   * @returns {import('../types').OperationResult}
   */
  saveActiveData(data) {
    const root = this._db.read();
    const idx = root.profiles.findIndex(p => p.id === root.activeProfileId);

    if (idx !== -1) {
      root.profiles[idx].data = data;
    } else if (root.profiles.length > 0) {
      root.profiles[0].data = data;
    }

    return this._db.write(root);
  }

  /**
   * Retrieves the data partition for a specific profile ID.
   * If profileId is omitted or not found, falls back to active profile data.
   *
   * @param {string} [profileId] - Target profile ID.
   * @returns {import('../types').ProfileData} The profile data partition.
   */
  getProfileData(profileId) {
    if (!profileId) return this.getActiveData();

    const root = this._db.read();
    const profile = root.profiles.find(p => p.id === profileId);
    if (!profile) return this.getActiveData();

    if (!profile.data) {
      profile.data = this.createEmptyProfileData();
    }
    if (!Array.isArray(profile.data.expenses)) {
      profile.data.expenses = [];
    }
    if (!Array.isArray(profile.data.categories)) {
      profile.data.categories = this.getDefaultCategories();
    }
    if (!Array.isArray(profile.data.presets)) {
      profile.data.presets = this.getDefaultPresets();
    }
    if (!profile.data.salaryConfig) {
      profile.data.salaryConfig = this.getDefaultSalaryConfig();
    }
    if (!Array.isArray(profile.data.householdMembers)) {
      profile.data.householdMembers = ['Self', 'Partner', 'Roommate'];
    }
    if (!Array.isArray(profile.data.notes)) {
      profile.data.notes = [];
    }
    if (!Array.isArray(profile.data.notifications)) {
      profile.data.notifications = [];
    }

    return profile.data;
  }

  /**
   * Persists data partition for a specific profile ID.
   *
   * @param {string} profileId - Target profile ID.
   * @param {import('../types').ProfileData} data - Modified data partition.
   * @returns {import('../types').OperationResult}
   */
  saveProfileData(profileId, data) {
    if (!profileId) return this.saveActiveData(data);

    const root = this._db.read();
    const idx = root.profiles.findIndex(p => p.id === profileId);

    if (idx !== -1) {
      root.profiles[idx].data = data;
      return this._db.write(root);
    }

    return this.saveActiveData(data);
  }

  // ==========================================================================
  // 2. Profile Lifecycle Operations (CRUD)
  // ==========================================================================

  /**
   * Retrieves summary descriptors for all profiles in the system.
   *
   * @returns {import('../types').ProfileSummary[]} List of profiles.
   */
  getAll() {
    const root = this._db.read();
    return root.profiles.map(p => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar || p.color || '#D9822B',
      color: p.color || '#D9822B',
      createdAt: p.createdAt,
      expenseCount: Array.isArray(p.data?.expenses) ? p.data.expenses.length : 0,
      isActive: p.id === root.activeProfileId
    }));
  }

  /**
   * Retrieves the summary descriptor for the currently active profile.
   *
   * @returns {import('../types').ProfileSummary} Active profile summary.
   */
  getActive() {
    const root = this._db.read();
    const active = root.profiles.find(p => p.id === root.activeProfileId) || root.profiles[0];

    return {
      id: active.id,
      name: active.name,
      avatar: active.avatar || active.color || '#D9822B',
      color: active.color || '#D9822B',
      createdAt: active.createdAt,
      expenseCount: Array.isArray(active.data?.expenses) ? active.data.expenses.length : 0,
      isActive: true
    };
  }

  /**
   * Switches the active workspace profile.
   *
   * @param {string} profileId - Target profile ID.
   * @returns {import('../types').OperationResult & { activeProfile?: import('../types').ProfileSummary }}
   */
  switchTo(profileId) {
    const root = this._db.read();
    const target = root.profiles.find(p => p.id === profileId);

    if (!target) {
      return { success: false, error: 'Profile not found' };
    }

    root.activeProfileId = profileId;
    this._db.write(root);

    return {
      success: true,
      activeProfile: {
        id: target.id,
        name: target.name,
        avatar: target.avatar || target.color || '#D9822B',
        color: target.color || '#D9822B',
        createdAt: target.createdAt,
        expenseCount: Array.isArray(target.data?.expenses) ? target.data.expenses.length : 0,
        isActive: true
      }
    };
  }

  /**
   * Creates a new profile with a clean slate (0 expenses) and baseline configurations.
   *
   * @param {{ name: string, avatar?: string, color?: string }} input - New profile properties.
   * @returns {import('../types').OperationResult & { profile?: import('../types').ProfileSummary, activeProfile?: import('../types').ProfileSummary }}
   */
  create(input = {}) {
    const name = (input.name || '').trim();
    if (!name) {
      return { success: false, error: 'Profile name is required' };
    }

    const root = this._db.read();
    const newId = 'prof-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6);
    const chosenColor = input.color || input.avatar || '#D9822B';

    const newProfile = {
      id: newId,
      name: name,
      avatar: input.avatar || chosenColor,
      color: chosenColor,
      createdAt: new Date().toISOString(),
      data: this.createEmptyProfileData() // Pristine 0-expense start
    };

    root.profiles.push(newProfile);
    root.activeProfileId = newId;
    this._db.write(root);

    const summary = {
      id: newProfile.id,
      name: newProfile.name,
      avatar: newProfile.avatar,
      color: newProfile.color,
      createdAt: newProfile.createdAt,
      expenseCount: 0,
      isActive: true
    };

    return {
      success: true,
      profile: summary,
      activeProfile: summary
    };
  }

  /**
   * Updates an existing profile's name, avatar, or accent color.
   *
   * @param {{ id: string, name?: string, avatar?: string, color?: string }} input - Updated fields.
   * @returns {import('../types').OperationResult & { profile?: import('../types').ProfileSummary }}
   */
  update(input = {}) {
    if (!input.id) {
      return { success: false, error: 'Profile ID is required' };
    }

    const root = this._db.read();
    const target = root.profiles.find(p => p.id === input.id);

    if (!target) {
      return { success: false, error: 'Profile not found' };
    }

    if (input.name && input.name.trim()) {
      target.name = input.name.trim();
    }
    if (input.avatar) {
      target.avatar = input.avatar;
    }
    if (input.color) {
      target.color = input.color;
    }

    this._db.write(root);

    return {
      success: true,
      profile: {
        id: target.id,
        name: target.name,
        avatar: target.avatar,
        color: target.color,
        createdAt: target.createdAt,
        expenseCount: Array.isArray(target.data?.expenses) ? target.data.expenses.length : 0,
        isActive: target.id === root.activeProfileId
      }
    };
  }

  /**
   * Deletes a profile by ID. Prevents deletion if only one profile remains.
   *
   * @param {string} profileId - ID of profile to delete.
   * @returns {import('../types').OperationResult & { activeProfile?: import('../types').ProfileSummary }}
   */
  delete(profileId) {
    const root = this._db.read();

    if (root.profiles.length <= 1) {
      return { success: false, error: 'Cannot delete the only profile in Ledgerly' };
    }

    const index = root.profiles.findIndex(p => p.id === profileId);
    if (index === -1) {
      return { success: false, error: 'Profile not found' };
    }

    root.profiles.splice(index, 1);
    if (root.activeProfileId === profileId) {
      root.activeProfileId = root.profiles[0].id;
    }

    this._db.write(root);

    return {
      success: true,
      activeProfile: this.getActive()
    };
  }

  // ==========================================================================
  // 3. Multi-Profile Cross-Aggregation
  // ==========================================================================

  /**
   * Aggregates expenses across all profiles, annotating each record with profile identity.
   *
   * @returns {Array<import('../types').Expense & { profileId: string, profileName: string, profileAvatar: string }>}
   */
  getCombinedExpenses() {
    const root = this._db.read();
    const all = [];

    (root.profiles || []).forEach(p => {
      if (Array.isArray(p.data?.expenses)) {
        p.data.expenses.forEach(e => {
          all.push({
            ...e,
            profileId: p.id,
            profileName: p.name,
            profileAvatar: p.avatar || '👤'
          });
        });
      }
    });

    return all;
  }

  // ==========================================================================
  // 4. Keyword Learning & Heuristics
  // ==========================================================================

  /**
   * Retrieves category keywords trained for the active profile.
   *
   * @returns {Record<string, string>} Keyword -> Category mapping.
   */
  getCategoryKeywords() {
    const data = this.getActiveData();
    return data.categoryKeywords || {};
  }

  /**
   * Associates a keyword with an expense category for natural language parsing.
   *
   * @param {string} keyword - Search term or merchant name.
   * @param {string} category - Target category to predict.
   * @returns {import('../types').OperationResult & { categoryKeywords?: Record<string, string> }}
   */
  learnCategoryKeyword(keyword, category) {
    if (!keyword || !category) {
      return { success: false, error: 'Keyword and category are required' };
    }

    const data = this.getActiveData();
    if (!data.categoryKeywords) {
      data.categoryKeywords = {};
    }

    data.categoryKeywords[keyword.toLowerCase().trim()] = category;
    this.saveActiveData(data);

    return {
      success: true,
      categoryKeywords: data.categoryKeywords
    };
  }

  // ==========================================================================
  // 5. Baseline Profile Factories & Defaults
  // ==========================================================================

  /**
   * Baseline category list.
   *
   * @returns {string[]} Default categories.
   */
  getDefaultCategories() {
    return Array.from(DEFAULT_CATEGORIES);
  }

  /**
   * Baseline quick-log presets.
   *
   * @returns {import('../types').ExpensePreset[]} Default presets.
   */
  getDefaultPresets() {
    return [
      {
        id: 'pst-1',
        icon: 'coffee',
        title: 'Chai / Coffee',
        amount: 20.0,
        category: 'Food & Dining',
        paymentMethod: 'UPI / GPay'
      },
      {
        id: 'pst-2',
        icon: 'utensils',
        title: 'Lunch / Snacks',
        amount: 120.0,
        category: 'Food & Dining',
        paymentMethod: 'UPI / GPay'
      },
      {
        id: 'pst-3',
        icon: 'fuel',
        title: 'Petrol / Fuel',
        amount: 300.0,
        category: 'Transportation',
        paymentMethod: 'UPI / GPay'
      },
      {
        id: 'pst-4',
        icon: 'car',
        title: 'Auto / Cab / Metro',
        amount: 80.0,
        category: 'Transportation',
        paymentMethod: 'UPI / GPay'
      },
      {
        id: 'pst-5',
        icon: 'shopping-cart',
        title: 'Groceries & Kirana',
        amount: 450.0,
        category: 'Food & Dining',
        paymentMethod: 'UPI / GPay'
      }
    ];
  }

  /**
   * Baseline salary configuration.
   *
   * @returns {import('../types').SalaryConfig} Default salary config.
   */
  getDefaultSalaryConfig() {
    return {
      monthlyIncome: DEFAULTS.DEFAULT_MONTHLY_INCOME,
      fixedBills: DEFAULTS.DEFAULT_FIXED_BILLS,
      savingsGoal: DEFAULTS.DEFAULT_SAVINGS_GOAL,
      payday: DEFAULTS.DEFAULT_PAYDAY,
      currentCycleStartDate: null,
      nextPaydayOverride: null,
      currencySymbol: DEFAULTS.CURRENCY_SYMBOL
    };
  }

  /**
   * Constructs a pristine data object for a new profile.
   *
   * @returns {import('../types').ProfileData} Empty profile data container.
   */
  createEmptyProfileData() {
    return {
      expenses: [],
      categories: this.getDefaultCategories(),
      presets: this.getDefaultPresets(),
      salaryConfig: this.getDefaultSalaryConfig(),
      householdMembers: ['Self', 'Partner', 'Roommate'],
      budgetGoal: Math.max(
        0,
        DEFAULTS.DEFAULT_MONTHLY_INCOME - DEFAULTS.DEFAULT_FIXED_BILLS - DEFAULTS.DEFAULT_SAVINGS_GOAL
      ),
      notes: [],
      notifications: []
    };
  }
}

module.exports = ProfileService;
