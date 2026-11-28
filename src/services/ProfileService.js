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
    if (!Array.isArray(active.data.householdMembers) || active.data.householdMembers.length === 0) {
      active.data.householdMembers = [active.name || 'Self'];
    }
    if (!Array.isArray(active.data.notes)) {
      active.data.notes = [];
    }
    if (!Array.isArray(active.data.notifications)) {
      active.data.notifications = [];
    }
    if (!Array.isArray(active.data.dismissedSubscriptionAlerts)) {
      active.data.dismissedSubscriptionAlerts = [];
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
    const targetIdx = idx !== -1 ? idx : root.profiles.length > 0 ? 0 : -1;

    if (targetIdx !== -1) {
      const existingData = root.profiles[targetIdx].data || {};

      // Smart Sub-Array Reconciliation: preserve expenses and notes added since snapshot
      if (
        Array.isArray(existingData.expenses) &&
        Array.isArray(data.expenses) &&
        existingData.expenses !== data.expenses
      ) {
        const incomingIds = new Set(data.expenses.map(e => e && e.id).filter(Boolean));
        const newlyAddedExpenses = existingData.expenses.filter(e => e && e.id && !incomingIds.has(e.id));
        if (newlyAddedExpenses.length > 0) {
          data.expenses = [...newlyAddedExpenses, ...data.expenses];
        }
      }

      if (
        Array.isArray(existingData.notes) &&
        Array.isArray(data.notes) &&
        existingData.notes !== data.notes
      ) {
        const incomingIds = new Set(data.notes.map(n => n && n.id).filter(Boolean));
        const newlyAddedNotes = existingData.notes.filter(n => n && n.id && !incomingIds.has(n.id));
        if (newlyAddedNotes.length > 0) {
          data.notes = [...newlyAddedNotes, ...data.notes];
        }
      }

      root.profiles[targetIdx].data = data;
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
    if (!Array.isArray(profile.data.householdMembers) || profile.data.householdMembers.length === 0) {
      profile.data.householdMembers = [profile.name || 'Self'];
    }
    if (!Array.isArray(profile.data.notes)) {
      profile.data.notes = [];
    }
    if (!Array.isArray(profile.data.notifications)) {
      profile.data.notifications = [];
    }
    if (!Array.isArray(profile.data.dismissedSubscriptionAlerts)) {
      profile.data.dismissedSubscriptionAlerts = [];
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
   * Aggregates total spend for the current calendar month across an expense array.
   *
   * @private
   * @param {import('../types').Expense[]} [expenses=[]]
   * @param {string} [monthPrefix] - Optional YYYY-MM prefix.
   * @returns {number}
   */
  _calculateCurrentMonthSpend(expenses, monthPrefix) {
    if (!Array.isArray(expenses) || expenses.length === 0) return 0;
    const prefix =
      monthPrefix ||
      (() => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      })();
    let total = 0;
    for (let i = 0; i < expenses.length; i++) {
      const exp = expenses[i];
      if (exp && typeof exp.date === 'string' && exp.date.startsWith(prefix)) {
        const amt = typeof exp.amount === 'number' ? exp.amount : parseFloat(exp.amount);
        if (!isNaN(amt) && isFinite(amt)) total += Math.max(0, amt);
      }
    }
    return Math.round(total * 100) / 100;
  }

  /**
   * Retrieves summary descriptors for all profiles in the system.
   *
   * @returns {import('../types').ProfileSummary[]} List of profiles.
   */
  getAll() {
    const root = this._db.read();
    const now = new Date();
    const currentMonthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    return root.profiles.map(p => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar || p.color || '#D9822B',
      color: p.color || '#D9822B',
      createdAt: p.createdAt,
      expenseCount: Array.isArray(p.data?.expenses) ? p.data.expenses.length : 0,
      currentMonthSpend: this._calculateCurrentMonthSpend(p.data?.expenses, currentMonthPrefix),
      isActive: p.id === root.activeProfileId
    }));
  }

  /**
   * Alias for getAll() for semantic consistency with IPC/facades.
   *
   * @returns {import('../types').ProfileSummary[]}
   */
  getProfiles() {
    return this.getAll();
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
      currentMonthSpend: this._calculateCurrentMonthSpend(active.data?.expenses),
      isActive: true
    };
  }

  /**
   * Query alias for getActive() for semantic consistency with IPC and storage facade.
   *
   * @returns {import('../types').ProfileSummary}
   */
  getActiveProfile() {
    return this.getActive();
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
    const saveRes = this._db.write(root);
    if (saveRes && saveRes.success === false) {
      return { success: false, error: saveRes.error || 'Failed to persist active profile switch' };
    }

    return {
      success: true,
      activeProfile: {
        id: target.id,
        name: target.name,
        avatar: target.avatar || target.color || '#D9822B',
        color: target.color || '#D9822B',
        createdAt: target.createdAt,
        expenseCount: Array.isArray(target.data?.expenses) ? target.data.expenses.length : 0,
        currentMonthSpend: this._calculateCurrentMonthSpend(target.data?.expenses),
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
    const saveRes = this._db.write(root);
    if (saveRes && saveRes.success === false) {
      return { success: false, error: saveRes.error || 'Failed to persist profile creation' };
    }

    const summary = {
      id: newProfile.id,
      name: newProfile.name,
      avatar: newProfile.avatar,
      color: newProfile.color,
      createdAt: newProfile.createdAt,
      expenseCount: 0,
      currentMonthSpend: 0,
      isActive: true
    };

    return {
      success: true,
      profile: summary,
      activeProfile: summary
    };
  }

  /**
   * Alias for create(input) for semantic consistency with IPC/facades.
   *
   * @param {{ name: string, avatar?: string, color?: string }} input
   * @returns {import('../types').OperationResult & { profile?: import('../types').ProfileSummary, activeProfile?: import('../types').ProfileSummary }}
   */
  createProfile(input = {}) {
    return this.create(input);
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

    const saveRes = this._db.write(root);
    if (saveRes && saveRes.success === false) {
      return { success: false, error: saveRes.error || 'Failed to persist profile update' };
    }

    return {
      success: true,
      profile: {
        id: target.id,
        name: target.name,
        avatar: target.avatar,
        color: target.color,
        createdAt: target.createdAt,
        expenseCount: Array.isArray(target.data?.expenses) ? target.data.expenses.length : 0,
        currentMonthSpend: this._calculateCurrentMonthSpend(target.data?.expenses),
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

    const target = root.profiles[index];
    const targetName = target ? target.name : null;

    root.profiles.splice(index, 1);
    if (root.activeProfileId === profileId) {
      root.activeProfileId = root.profiles[0].id;
    }

    // Cascading integrity cleanup for foreign keys across household entities
    if (Array.isArray(root.settlements) && targetName) {
      root.settlements = root.settlements.filter(
        s => s.from !== targetName && s.to !== targetName && s.from !== profileId && s.to !== profileId
      );
    }

    if (Array.isArray(root.recurringBills) && targetName) {
      const fallbackName = root.profiles[0]?.name || 'Self';
      root.recurringBills.forEach(b => {
        if (b.paidBy === targetName || b.paidBy === profileId) {
          b.paidBy = fallbackName;
        }
        if (Array.isArray(b.splitWith)) {
          b.splitWith = b.splitWith.filter(name => name !== targetName && name !== profileId);
        }
      });
    }

    const saveRes = this._db.write(root);
    if (saveRes && saveRes.success === false) {
      return { success: false, error: saveRes.error || 'Failed to persist profile deletion' };
    }

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
   * @param {string} [name='Self'] - Profile display name.
   * @returns {import('../types').ProfileData} Empty profile data container.
   */
  createEmptyProfileData(name = 'Self') {
    return {
      expenses: [],
      categories: this.getDefaultCategories(),
      presets: this.getDefaultPresets(),
      salaryConfig: this.getDefaultSalaryConfig(),
      householdMembers: [name || 'Self'],
      budgetGoal: Math.max(
        0,
        DEFAULTS.DEFAULT_MONTHLY_INCOME - DEFAULTS.DEFAULT_FIXED_BILLS - DEFAULTS.DEFAULT_SAVINGS_GOAL
      ),
      notes: [],
      notifications: [],
      dismissedSubscriptionAlerts: []
    };
  }

  /**
   * Returns dynamic household member names derived from all existing user profiles.
   * Keeps the household team synchronized with real user profiles.
   *
   * @returns {string[]} List of member names.
   */
  getHouseholdMemberNames() {
    const profiles = this.getProfiles();
    if (Array.isArray(profiles) && profiles.length > 0) {
      const names = profiles.map(p => p.name).filter(Boolean);
      if (names.length > 0) return Array.from(new Set(names));
    }
    const active = this.getActiveProfile();
    return [active?.name || 'Self'];
  }
}

module.exports = ProfileService;
