const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { app } = require('electron');

class ExpenseStorage {
  constructor(customPath) {
    // Save in user application data folder or custom test path
    let userDataPath;
    try {
      const { app } = require('electron');
      userDataPath = (app && typeof app.getPath === 'function') ? app.getPath('userData') : null;
    } catch (e) {
      userDataPath = null;
    }

    if (customPath) {
      this.filePath = customPath;
    } else if (process.env.LEDGERLY_DB_PATH) {
      this.filePath = process.env.LEDGERLY_DB_PATH;
    } else if (userDataPath) {
      this.filePath = path.join(userDataPath, 'expenses_db.json');
    } else {
      const fallbackDir = path.join(__dirname, '../scratch/test_userdata');
      if (!fs.existsSync(fallbackDir)) fs.mkdirSync(fallbackDir, { recursive: true });
      this.filePath = path.join(fallbackDir, 'expenses_db.json');
    }

    this.ensureStorageExists();
  }

  _hashPassword(password, salt) {
    return crypto.pbkdf2Sync(String(password), String(salt), 1000, 64, 'sha512').toString('hex');
  }

  _getDefaultCategories() {
    return [
      'Food & Dining',
      'Transportation',
      'Office & Tech',
      'Subscriptions & Software',
      'Utilities & Bills',
      'Travel & Lodging',
      'Healthcare & Wellness',
      'Entertainment',
      'Miscellaneous'
    ];
  }

  _getDefaultPresets() {
    return [
      { id: 'pst-1', icon: 'coffee', title: 'Chai / Coffee', amount: 20.00, category: 'Food & Dining', paymentMethod: 'UPI / GPay' },
      { id: 'pst-2', icon: 'utensils', title: 'Lunch / Snacks', amount: 120.00, category: 'Food & Dining', paymentMethod: 'UPI / GPay' },
      { id: 'pst-3', icon: 'fuel', title: 'Petrol / Fuel', amount: 300.00, category: 'Transportation', paymentMethod: 'UPI / GPay' },
      { id: 'pst-4', icon: 'car', title: 'Auto / Cab / Metro', amount: 80.00, category: 'Transportation', paymentMethod: 'UPI / GPay' },
      { id: 'pst-5', icon: 'shopping-cart', title: 'Groceries & Kirana', amount: 450.00, category: 'Food & Dining', paymentMethod: 'UPI / GPay' }
    ];
  }

  _getDefaultSalaryConfig() {
    return {
      monthlyIncome: 60000.00,
      fixedBills: 20000.00,
      savingsGoal: 10000.00,
      payday: 1,
      currentCycleStartDate: null,
      nextPaydayOverride: null,
      currencySymbol: '₹'
    };
  }

  _createEmptyProfileData() {
    return {
      expenses: [], // Clean empty state for new user / new profile
      categories: this._getDefaultCategories(),
      presets: this._getDefaultPresets(),
      salaryConfig: this._getDefaultSalaryConfig(),
      householdMembers: ['Self', 'Partner', 'Roommate'],
      budgetGoal: 30000.00,
      notes: [],
      notifications: []
    };
  }

  ensureStorageExists() {
    try {
      if (!fs.existsSync(this.filePath)) {
        const initialRoot = {
          account: {
            isConfigured: false,
            userId: '',
            passwordHash: '',
            salt: '',
            rememberMe: false,
            lastLoggedIn: null
          },
          activeProfileId: 'prof-default',
          profiles: [
            {
              id: 'prof-default',
              name: 'Personal',
              avatar: '#D9822B',
              color: '#D9822B',
              createdAt: new Date().toISOString(),
              data: this._createEmptyProfileData()
            }
          ]
        };
        fs.writeFileSync(this.filePath, JSON.stringify(initialRoot, null, 2), 'utf-8');
      }
    } catch (err) {
      console.error('Failed to initialize storage:', err);
    }
  }

  _getRootData() {
    try {
      this.ensureStorageExists();
      const raw = fs.readFileSync(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw);

      // Ensure account object exists
      if (!parsed.account || typeof parsed.account !== 'object') {
        parsed.account = {
          isConfigured: false,
          userId: '',
          passwordHash: '',
          salt: '',
          rememberMe: false,
          lastLoggedIn: null
        };
      }

      if (!Array.isArray(parsed.profiles) || parsed.profiles.length === 0) {
        parsed.profiles = [
          {
            id: 'prof-default',
            name: 'Personal',
            avatar: '#D9822B',
            color: '#D9822B',
            createdAt: new Date().toISOString(),
            data: this._createEmptyProfileData()
          }
        ];
        parsed.activeProfileId = 'prof-default';
        this._saveRootData(parsed);
      }

      if (!parsed.activeProfileId || !parsed.profiles.some(p => p.id === parsed.activeProfileId)) {
        parsed.activeProfileId = parsed.profiles[0].id;
        this._saveRootData(parsed);
      }

      return parsed;
    } catch (err) {
      console.error('Failed to read root storage:', err);
      return {
        account: { isConfigured: false, userId: '', passwordHash: '', salt: '', rememberMe: false, lastLoggedIn: null },
        activeProfileId: 'prof-default',
        profiles: [
          {
            id: 'prof-default',
            name: 'Personal',
            avatar: '#D9822B',
            color: '#D9822B',
            createdAt: new Date().toISOString(),
            data: this._createEmptyProfileData()
          }
        ]
      };
    }
  }

  _saveRootData(rootData) {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(rootData, null, 2), 'utf-8');
      return { success: true };
    } catch (err) {
      console.error('Failed to save root data:', err);
      return { success: false, error: err.message };
    }
  }

  // ==========================================================================
  // Account Authentication & Remember-Me APIs
  // ==========================================================================

  getAccountStatus() {
    const root = this._getRootData();
    return {
      isConfigured: Boolean(root.account?.isConfigured),
      userId: root.account?.userId || '',
      rememberMe: Boolean(root.account?.rememberMe),
      hasProfiles: Array.isArray(root.profiles) && root.profiles.length > 0,
      activeProfileId: root.activeProfileId || null
    };
  }

  setupAccount(payload = {}) {
    const userId = (payload.userId || '').trim();
    const password = payload.password || '';
    const rememberMe = Boolean(payload.rememberMe);

    if (!userId) return { success: false, error: 'User ID or Email is required' };
    if (!password || password.length < 3) return { success: false, error: 'Password must be at least 3 characters' };

    const salt = crypto.randomBytes(16).toString('hex');
    const passwordHash = this._hashPassword(password, salt);

    const root = this._getRootData();
    root.account = {
      isConfigured: true,
      userId,
      passwordHash,
      salt,
      rememberMe,
      lastLoggedIn: new Date().toISOString()
    };

    this._saveRootData(root);
    return {
      success: true,
      account: {
        userId,
        rememberMe,
        isConfigured: true
      }
    };
  }

  loginAccount(payload = {}) {
    const userId = (payload.userId || '').trim();
    const password = payload.password || '';
    const rememberMe = Boolean(payload.rememberMe);

    const root = this._getRootData();
    if (!root.account?.isConfigured) {
      return { success: false, error: 'No account configured yet. Please sign up.' };
    }

    if (userId.toLowerCase() !== root.account.userId.toLowerCase()) {
      return { success: false, error: 'Invalid User ID or Email' };
    }

    const testHash = this._hashPassword(password, root.account.salt);
    if (testHash !== root.account.passwordHash) {
      return { success: false, error: 'Incorrect Password' };
    }

    root.account.rememberMe = rememberMe;
    root.account.lastLoggedIn = new Date().toISOString();
    this._saveRootData(root);

    return {
      success: true,
      account: {
        userId: root.account.userId,
        rememberMe: root.account.rememberMe,
        isConfigured: true
      }
    };
  }

  logoutAccount() {
    const root = this._getRootData();
    if (root.account) {
      root.account.rememberMe = false;
      this._saveRootData(root);
    }
    return { success: true };
  }

  updateAccountPreferences(prefs = {}) {
    const root = this._getRootData();
    if (root.account) {
      if (prefs.rememberMe !== undefined) root.account.rememberMe = Boolean(prefs.rememberMe);
      if (prefs.workspaceMode !== undefined) root.account.workspaceMode = prefs.workspaceMode; // 'household' | 'solo'
      this._saveRootData(root);
    }
    return {
      success: true,
      rememberMe: root.account?.rememberMe,
      workspaceMode: root.account?.workspaceMode || 'household'
    };
  }

  getWorkspaceMode() {
    const root = this._getRootData();
    return root.account?.workspaceMode || 'household';
  }

  setWorkspaceMode(mode) {
    return this.updateAccountPreferences({ workspaceMode: mode });
  }

  getCategoryKeywords() {
    const data = this.getData();
    return data.categoryKeywords || {};
  }

  learnCategoryKeyword(keyword, category) {
    if (!keyword || !category) return { success: false };
    const data = this.getData();
    if (!data.categoryKeywords) data.categoryKeywords = {};
    data.categoryKeywords[keyword.toLowerCase().trim()] = category;
    this.saveData(data);
    return { success: true, categoryKeywords: data.categoryKeywords };
  }

  getData() {
    const root = this._getRootData();
    let active = root.profiles.find(p => p.id === root.activeProfileId);
    if (!active) {
      if (root.profiles.length > 0) {
        active = root.profiles[0];
        root.activeProfileId = active.id;
        this._saveRootData(root);
      } else {
        return this._createEmptyProfileData();
      }
    }
    if (!active.data) active.data = this._createEmptyProfileData();
    if (!Array.isArray(active.data.expenses)) active.data.expenses = [];
    if (!Array.isArray(active.data.presets)) active.data.presets = this._getDefaultPresets();
    if (!active.data.salaryConfig) active.data.salaryConfig = this._getDefaultSalaryConfig();
    if (!Array.isArray(active.data.householdMembers)) active.data.householdMembers = ['Self', 'Partner', 'Roommate'];
    if (!Array.isArray(active.data.notes)) active.data.notes = [];
    return active.data;
  }

  saveData(data) {
    const root = this._getRootData();
    const idx = root.profiles.findIndex(p => p.id === root.activeProfileId);
    if (idx !== -1) {
      root.profiles[idx].data = data;
    } else if (root.profiles.length > 0) {
      root.profiles[0].data = data;
    }
    return this._saveRootData(root);
  }

  // ==========================================================================
  // Multi-User Profile Management APIs
  // ==========================================================================

  getProfiles() {
    const root = this._getRootData();
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

  getActiveProfile() {
    const root = this._getRootData();
    const active = root.profiles.find(p => p.id === root.activeProfileId) || root.profiles[0];
    return {
      id: active.id,
      name: active.name,
      avatar: active.avatar || active.color || '#D9822B',
      color: active.color || '#D9822B',
      createdAt: active.createdAt,
      expenseCount: Array.isArray(active.data?.expenses) ? active.data.expenses.length : 0
    };
  }

  switchProfile(profileId) {
    const root = this._getRootData();
    const target = root.profiles.find(p => p.id === profileId);
    if (!target) {
      return { success: false, error: 'Profile not found' };
    }
    root.activeProfileId = profileId;
    this._saveRootData(root);
    return {
      success: true,
      activeProfile: {
        id: target.id,
        name: target.name,
        avatar: target.avatar || target.color || '#D9822B',
        color: target.color || '#D9822B',
        expenseCount: Array.isArray(target.data?.expenses) ? target.data.expenses.length : 0
      }
    };
  }

  createProfile(profileInput = {}) {
    const name = (profileInput.name || '').trim();
    if (!name) {
      return { success: false, error: 'Profile name is required' };
    }

    const root = this._getRootData();
    const newId = 'prof-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6);
    const chosenColor = profileInput.color || profileInput.avatar || '#D9822B';
    const newProfile = {
      id: newId,
      name: name,
      avatar: profileInput.avatar || chosenColor,
      color: chosenColor,
      createdAt: new Date().toISOString(),
      data: this._createEmptyProfileData() // Clean slate with 0 expenses
    };

    root.profiles.push(newProfile);
    root.activeProfileId = newId;
    this._saveRootData(root);

    return {
      success: true,
      profile: {
        id: newProfile.id,
        name: newProfile.name,
        avatar: newProfile.avatar,
        color: newProfile.color,
        expenseCount: 0
      },
      activeProfile: {
        id: newProfile.id,
        name: newProfile.name,
        avatar: newProfile.avatar,
        color: newProfile.color,
        expenseCount: 0
      }
    };
  }

  updateProfile(profileInput = {}) {
    if (!profileInput.id) {
      return { success: false, error: 'Profile ID is required' };
    }
    const root = this._getRootData();
    const target = root.profiles.find(p => p.id === profileInput.id);
    if (!target) {
      return { success: false, error: 'Profile not found' };
    }

    if (profileInput.name && profileInput.name.trim()) {
      target.name = profileInput.name.trim();
    }
    if (profileInput.avatar) {
      target.avatar = profileInput.avatar;
    }
    if (profileInput.color) {
      target.color = profileInput.color;
    }

    this._saveRootData(root);
    return {
      success: true,
      profile: {
        id: target.id,
        name: target.name,
        avatar: target.avatar,
        color: target.color,
        expenseCount: Array.isArray(target.data?.expenses) ? target.data.expenses.length : 0
      }
    };
  }

  deleteProfile(profileId) {
    const root = this._getRootData();
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

    this._saveRootData(root);
    return {
      success: true,
      activeProfile: this.getActiveProfile()
    };
  }

  getCombinedExpenses() {
    const root = this._getRootData();
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

  addExpense(expense) {
    const root = this._getRootData();
    const active = root.profiles.find(p => p.id === root.activeProfileId) || root.profiles[0];
    const data = this.getData();
    const newExpense = {
      id: 'exp-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
      title: expense.title || 'Untitled Expense',
      amount: parseFloat(expense.amount) || 0,
      category: expense.category || 'Miscellaneous',
      paymentMethod: expense.paymentMethod || 'Cash',
      date: expense.date || new Date().toISOString().split('T')[0],
      description: expense.description || '',
      tags: Array.isArray(expense.tags) ? expense.tags : (expense.tags ? expense.tags.split(',').map(t => t.trim()) : []),
      receiptFilename: expense.receiptFilename || null,
      paidBy: (expense.paidBy && expense.paidBy !== 'Self') ? expense.paidBy : (active ? active.name : 'Self'),
      splitWith: Array.isArray(expense.splitWith) ? expense.splitWith : (expense.splitWith ? [expense.splitWith] : []),
      isHouseholdExpense: Boolean(expense.isHouseholdExpense || (expense.splitWith && expense.splitWith.length > 0))
    };
    data.expenses.unshift(newExpense);
    this.saveData(data);
    return newExpense;
  }

  updateExpense(updated) {
    const root = this._getRootData();
    // 1. Try active profile first
    let targetProfile = root.profiles.find(p => p.id === root.activeProfileId);
    let targetIndex = -1;

    if (targetProfile && Array.isArray(targetProfile.data?.expenses)) {
      targetIndex = targetProfile.data.expenses.findIndex(e => e.id === updated.id);
    }

    // 2. Search across all other profiles if not found in active profile
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
        amount: parseFloat(updated.amount) || expList[targetIndex].amount,
        tags: Array.isArray(updated.tags) ? updated.tags : (typeof updated.tags === 'string' ? updated.tags.split(',').map(t => t.trim()) : expList[targetIndex].tags),
        receiptFilename: updated.receiptFilename !== undefined ? updated.receiptFilename : expList[targetIndex].receiptFilename,
        paidBy: updated.paidBy || expList[targetIndex].paidBy || 'Self',
        splitWith: Array.isArray(updated.splitWith) ? updated.splitWith : expList[targetIndex].splitWith || [],
        isHouseholdExpense: updated.isHouseholdExpense !== undefined ? Boolean(updated.isHouseholdExpense) : expList[targetIndex].isHouseholdExpense
      };
      this._saveRootData(root);
      return { success: true, expense: expList[targetIndex] };
    }
    return { success: false, error: 'Expense not found' };
  }

  deleteExpense(id) {
    const root = this._getRootData();
    // 1. Try active profile first
    const active = root.profiles.find(p => p.id === root.activeProfileId);
    if (active && Array.isArray(active.data?.expenses)) {
      const idx = active.data.expenses.findIndex(e => e.id === id);
      if (idx !== -1) {
        active.data.expenses.splice(idx, 1);
        this._saveRootData(root);
        return { success: true, id };
      }
    }

    // 2. Search across all other profiles in root.profiles
    for (const p of root.profiles || []) {
      if (Array.isArray(p.data?.expenses)) {
        const idx = p.data.expenses.findIndex(e => e.id === id);
        if (idx !== -1) {
          p.data.expenses.splice(idx, 1);
          this._saveRootData(root);
          return { success: true, id };
        }
      }
    }
    return { success: false, error: 'Expense not found' };
  }

  setBudgetGoal(amount) {
    const data = this.getData();
    data.budgetGoal = parseFloat(amount) || 0;
    this.saveData(data);
    return { success: true, budgetGoal: data.budgetGoal };
  }

  addCategory(categoryName) {
    if (!categoryName || typeof categoryName !== 'string') {
      return { success: false, error: 'Invalid category name' };
    }
    const trimmed = categoryName.trim();
    const data = this.getData();
    if (!data.categories.includes(trimmed)) {
      data.categories.push(trimmed);
      this.saveData(data);
      return { success: true, categories: data.categories };
    }
    return { success: false, error: 'Category already exists' };
  }

  deleteCategory(categoryName) {
    const data = this.getData();
    const initialLen = data.categories.length;
    data.categories = data.categories.filter(c => c.toLowerCase() !== categoryName.toLowerCase());
    if (data.categories.length !== initialLen) {
      this.saveData(data);
      return { success: true, categories: data.categories };
    }
    return { success: false, error: 'Category not found' };
  }

  getFilteredExpenses(filters = {}) {
    const data = this.getData();
    let result = data.expenses;

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
      result = result.filter(e =>
        e.title.toLowerCase().includes(q) ||
        (e.description && e.description.toLowerCase().includes(q)) ||
        e.category.toLowerCase().includes(q)
      );
    }

    return {
      expenses: result,
      totalCount: result.length,
      totalAmount: result.reduce((sum, e) => sum + e.amount, 0)
    };
  }

  getPresets() {
    const data = this.getData();
    return data.presets || [];
  }

  addPreset(preset) {
    const data = this.getData();
    if (!Array.isArray(data.presets)) data.presets = [];
    const newPreset = {
      id: 'pst-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
      icon: preset.icon || 'tag',
      title: preset.title || 'Quick Expense',
      amount: parseFloat(preset.amount) || 0,
      category: preset.category || 'Miscellaneous',
      paymentMethod: preset.paymentMethod || 'Credit Card'
    };
    data.presets.push(newPreset);
    this.saveData(data);
    return { success: true, preset: newPreset, presets: data.presets };
  }

  updatePreset(updated) {
    const data = this.getData();
    if (!Array.isArray(data.presets)) data.presets = [];
    const index = data.presets.findIndex(p => p.id === updated.id);
    if (index !== -1) {
      data.presets[index] = {
        ...data.presets[index],
        ...updated,
        amount: parseFloat(updated.amount) || data.presets[index].amount
      };
      this.saveData(data);
      return { success: true, preset: data.presets[index], presets: data.presets };
    }
    return { success: false, error: 'Preset not found' };
  }

  deletePreset(id) {
    const data = this.getData();
    if (!Array.isArray(data.presets)) data.presets = [];
    const filtered = data.presets.filter(p => p.id !== id);
    if (filtered.length !== data.presets.length) {
      data.presets = filtered;
      this.saveData(data);
      return { success: true, presets: data.presets };
    }
    return { success: false, error: 'Preset not found' };
  }

  // --- Phase 4 & v1.2: Flexible Salary Allocator & Payday Cycle Engine ---

  getSalaryConfig() {
    const data = this.getData();
    return data.salaryConfig || this._getDefaultSalaryConfig();
  }

  setSalaryConfig(config) {
    const data = this.getData();
    data.salaryConfig = {
      monthlyIncome: Math.max(0, parseFloat(config.monthlyIncome) || 0),
      fixedBills: Math.max(0, parseFloat(config.fixedBills) || 0),
      savingsGoal: Math.max(0, parseFloat(config.savingsGoal) || 0),
      payday: Math.max(1, Math.min(31, parseInt(config.payday, 10) || 1)),
      currentCycleStartDate: config.currentCycleStartDate || null,
      nextPaydayOverride: config.nextPaydayOverride || null,
      currencySymbol: config.currencySymbol || '₹'
    };
    // Sync discretionary budget to budgetGoal
    data.budgetGoal = Math.max(0, data.salaryConfig.monthlyIncome - data.salaryConfig.fixedBills - data.salaryConfig.savingsGoal);
    this.saveData(data);
    return { success: true, salaryConfig: data.salaryConfig, budgetGoal: data.budgetGoal };
  }

  _getSalaryCycleDates(salaryConfig, targetDateStr = null) {
    const s = salaryConfig || this._getDefaultSalaryConfig();
    const payday = Math.max(1, Math.min(31, parseInt(s.payday, 10) || 1));
    const now = targetDateStr ? new Date(targetDateStr) : new Date();

    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    const currentDate = now.getDate();

    let cycleStart;
    let nextPayday;

    if (s.currentCycleStartDate) {
      cycleStart = new Date(s.currentCycleStartDate);
    } else {
      if (currentDate >= payday) {
        cycleStart = new Date(currentYear, currentMonth, payday);
      } else {
        cycleStart = new Date(currentYear, currentMonth - 1, payday);
      }
    }

    if (s.nextPaydayOverride) {
      nextPayday = new Date(s.nextPaydayOverride);
    } else {
      nextPayday = new Date(cycleStart.getFullYear(), cycleStart.getMonth() + 1, payday);
    }

    if (nextPayday <= cycleStart) {
      nextPayday = new Date(cycleStart.getFullYear(), cycleStart.getMonth() + 1, payday);
    }

    const msPerDay = 1000 * 60 * 60 * 24;
    const totalDaysInCycle = Math.max(1, Math.round((nextPayday - cycleStart) / msPerDay));
    const daysElapsed = Math.max(1, Math.min(totalDaysInCycle, Math.round((now - cycleStart) / msPerDay) + 1));
    const remainingDays = Math.max(1, totalDaysInCycle - daysElapsed + 1);

    const formatLocal = (d) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };

    const cycleStartStr = formatLocal(cycleStart);
    const nextPaydayStr = formatLocal(nextPayday);

    const standardNext = new Date(cycleStart.getFullYear(), cycleStart.getMonth() + 1, payday);
    const shiftDays = Math.round((nextPayday - standardNext) / msPerDay);

    return {
      payday,
      cycleStartDate: cycleStartStr,
      nextPaydayDate: nextPaydayStr,
      totalDaysInCycle,
      daysElapsed,
      remainingDays,
      shiftDays,
      isDelayed: shiftDays > 0,
      isEarly: shiftDays < 0
    };
  }

  calculateDailyBudgetMetrics(targetDateStr) {
    const data = this.getData();
    const salary = data.salaryConfig || this._getDefaultSalaryConfig();
    const discretionaryBudget = Math.max(0, salary.monthlyIncome - salary.fixedBills - salary.savingsGoal);

    const cycle = this._getSalaryCycleDates(salary, targetDateStr);
    const dailyAllowance = cycle.totalDaysInCycle > 0 ? (discretionaryBudget / cycle.totalDaysInCycle) : 0;

    const now = targetDateStr ? new Date(targetDateStr) : new Date();
    const todayStr = targetDateStr || now.toISOString().split('T')[0];

    // Filter non-fixed variable expenses within the active pay cycle
    const cycleExpenses = (data.expenses || []).filter(e => e.date && e.date >= cycle.cycleStartDate && e.date < cycle.nextPaydayDate);
    const spentCycleToDate = cycleExpenses.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
    const todayExpenses = cycleExpenses.filter(e => e.date === todayStr);
    const todaySpent = todayExpenses.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);

    const allowedCycleToDate = dailyAllowance * cycle.daysElapsed;
    const rolloverBalance = allowedCycleToDate - spentCycleToDate;
    const remainingDiscretionary = Math.max(0, discretionaryBudget - spentCycleToDate);
    const safeDailyLimit = cycle.remainingDays > 0 ? Math.max(0, remainingDiscretionary / cycle.remainingDays) : 0;

    let pacingStatus = 'On Track';
    if (rolloverBalance > 50) {
      pacingStatus = 'Under Budget (Pacing Ahead)';
    } else if (rolloverBalance < 0) {
      pacingStatus = 'Over Pace (Exceeding Budget)';
    }

    let stretchGuidance = null;
    const sym = salary.currencySymbol || '₹';
    if (cycle.isDelayed) {
      stretchGuidance = `Salary delayed by ${cycle.shiftDays} ${cycle.shiftDays === 1 ? 'day' : 'days'}: Daily allowance safely stretched to ${sym}${safeDailyLimit.toFixed(2)}/day across ${cycle.remainingDays} days until ${cycle.nextPaydayDate}.`;
    } else if (cycle.isEarly) {
      stretchGuidance = `Salary arriving ${Math.abs(cycle.shiftDays)} days early: You have ${sym}${safeDailyLimit.toFixed(2)}/day safe spending room!`;
    }

    return {
      monthlyIncome: salary.monthlyIncome,
      fixedBills: salary.fixedBills,
      savingsGoal: salary.savingsGoal,
      discretionaryBudget,
      currencySymbol: salary.currencySymbol || '₹',
      payday: cycle.payday,
      cycleStartDate: cycle.cycleStartDate,
      nextPaydayDate: cycle.nextPaydayDate,
      totalDaysInCycle: cycle.totalDaysInCycle,
      daysElapsed: cycle.daysElapsed,
      remainingDays: cycle.remainingDays,
      shiftDays: cycle.shiftDays,
      isDelayed: cycle.isDelayed,
      isEarly: cycle.isEarly,
      stretchGuidance,
      daysInMonth: cycle.totalDaysInCycle,
      dayOfMonth: cycle.daysElapsed,
      dailyAllowance: parseFloat(dailyAllowance.toFixed(2)),
      todaySpent: parseFloat(todaySpent.toFixed(2)),
      todayRemaining: Math.max(0, parseFloat((dailyAllowance - todaySpent).toFixed(2))),
      spentMonthToDate: parseFloat(spentCycleToDate.toFixed(2)),
      allowedMonthToDate: parseFloat(allowedCycleToDate.toFixed(2)),
      rolloverBalance: parseFloat(rolloverBalance.toFixed(2)),
      safeDailyLimit: parseFloat(safeDailyLimit.toFixed(2)),
      pacingStatus
    };
  }

  // --- Phase 4: Shared Household Member & Split Calculation Engine ---

  getHouseholdMembers() {
    const data = this.getData();
    const members = new Set(data.householdMembers || ['Self', 'Partner']);
    if (Array.isArray(data.profiles)) {
      data.profiles.forEach(p => { if (p.name) members.add(p.name); });
    }
    return Array.from(members);
  }

  addHouseholdMember(name) {
    if (!name || typeof name !== 'string') return { success: false, error: 'Invalid name' };
    const trimmed = name.trim();
    const data = this.getData();
    if (!Array.isArray(data.householdMembers)) data.householdMembers = ['Self'];
    if (!data.householdMembers.includes(trimmed)) {
      data.householdMembers.push(trimmed);
      this.saveData(data);
      return { success: true, householdMembers: data.householdMembers };
    }
    return { success: false, error: 'Member already exists' };
  }

  deleteHouseholdMember(name) {
    const data = this.getData();
    if (!Array.isArray(data.householdMembers)) return { success: false, error: 'No members' };
    if (name === 'Self') return { success: false, error: 'Cannot remove primary user (Self)' };
    const initialLen = data.householdMembers.length;
    data.householdMembers = data.householdMembers.filter(m => m !== name);
    if (data.householdMembers.length !== initialLen) {
      this.saveData(data);
      return { success: true, householdMembers: data.householdMembers };
    }
    return { success: false, error: 'Member not found' };
  }

  _ensureSettlements(root) {
    if (!Array.isArray(root.settlements)) {
      root.settlements = [];
    }
    return root;
  }

  _ensureRecurringBills(root) {
    if (!Array.isArray(root.recurringBills)) {
      root.recurringBills = [
        {
          id: 'rec-1',
          title: 'BESCOM Electricity Bill',
          icon: 'zap',
          amount: 1450,
          category: 'Utilities',
          dueDay: 10,
          frequency: 'monthly',
          paidBy: 'Self',
          splitWith: ['Self', 'Partner', 'Roommate'],
          autoSplit: true,
          lastPaidDate: null
        },
        {
          id: 'rec-2',
          title: 'Airtel Broadband Wi-Fi',
          icon: 'wifi',
          amount: 999,
          category: 'Utilities',
          dueDay: 15,
          frequency: 'monthly',
          paidBy: 'Self',
          splitWith: ['Self', 'Partner', 'Roommate'],
          autoSplit: true,
          lastPaidDate: null
        },
        {
          id: 'rec-3',
          title: 'Indane LPG Cylinder',
          icon: 'flame',
          amount: 850,
          category: 'Utilities',
          dueDay: 25,
          frequency: 'monthly',
          paidBy: 'Self',
          splitWith: ['Self', 'Partner', 'Roommate'],
          autoSplit: true,
          lastPaidDate: null
        }
      ];
    }
    return root;
  }

  getSettlements() {
    const root = this._getRootData();
    this._ensureSettlements(root);
    return root.settlements;
  }

  addSettlement(settlementData) {
    const root = this._getRootData();
    this._ensureSettlements(root);
    const newSettlement = {
      id: 'stl-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
      from: settlementData.from,
      to: settlementData.to,
      amount: parseFloat(settlementData.amount) || 0,
      paymentMethod: settlementData.paymentMethod || 'UPI / GPay',
      date: settlementData.date || new Date().toISOString().split('T')[0],
      notes: settlementData.notes || '',
      receiptFilename: settlementData.receiptFilename || null,
      createdAt: new Date().toISOString()
    };
    root.settlements.unshift(newSettlement);
    this._saveRootData(root);
    return { success: true, settlement: newSettlement };
  }

  deleteSettlement(id) {
    const root = this._getRootData();
    this._ensureSettlements(root);
    const initialLen = root.settlements.length;
    root.settlements = root.settlements.filter(s => s.id !== id);
    if (root.settlements.length !== initialLen) {
      this._saveRootData(root);
      return { success: true };
    }
    return { success: false, error: 'Settlement not found' };
  }

  getRecurringBills() {
    const root = this._getRootData();
    this._ensureRecurringBills(root);
    return root.recurringBills;
  }

  saveRecurringBill(billData) {
    const root = this._getRootData();
    this._ensureRecurringBills(root);
    if (billData.id) {
      const idx = root.recurringBills.findIndex(b => b.id === billData.id);
      if (idx !== -1) {
        root.recurringBills[idx] = { ...root.recurringBills[idx], ...billData };
      }
    } else {
      const newBill = {
        id: 'rec-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
        title: billData.title || 'Utility Bill',
        icon: billData.icon || '⚡',
        amount: parseFloat(billData.amount) || 0,
        category: billData.category || 'Utilities',
        dueDay: parseInt(billData.dueDay) || 1,
        frequency: billData.frequency || 'monthly',
        paidBy: billData.paidBy || 'Self',
        splitWith: Array.isArray(billData.splitWith) ? billData.splitWith : ['Self', 'Partner'],
        autoSplit: billData.autoSplit !== false,
        lastPaidDate: null
      };
      root.recurringBills.push(newBill);
    }
    this._saveRootData(root);
    return { success: true, bills: root.recurringBills };
  }

  deleteRecurringBill(id) {
    const root = this._getRootData();
    this._ensureRecurringBills(root);
    root.recurringBills = root.recurringBills.filter(b => b.id !== id);
    this._saveRootData(root);
    return { success: true, bills: root.recurringBills };
  }

  markRecurringBillPaid(id, paymentDetails = {}) {
    const root = this._getRootData();
    this._ensureRecurringBills(root);
    const bill = root.recurringBills.find(b => b.id === id);
    if (!bill) return { success: false, error: 'Bill not found' };

    const todayStr = new Date().toISOString().split('T')[0];
    bill.lastPaidDate = todayStr;
    this._saveRootData(root);

    // Auto-record as shared expense
    const expensePayload = {
      title: bill.title,
      amount: bill.amount,
      category: bill.category || 'Utilities',
      paymentMethod: paymentDetails.paymentMethod || 'UPI / GPay',
      date: todayStr,
      description: `Recurring utility cycle (${bill.title})`,
      paidBy: paymentDetails.paidBy || bill.paidBy || 'Self',
      isHouseholdExpense: true,
      splitWith: bill.splitWith || []
    };
    this.addExpense(expensePayload);

    return { success: true, bill };
  }

  calculateHouseholdSettlement() {
    const root = this._getRootData();
    const profileNames = (root.profiles || []).map(p => p.name);
    const householdMembers = this.getHouseholdMembers();
    const members = Array.from(new Set([...profileNames, ...householdMembers]));

    const paidMap = {};
    const owesMap = {};
    members.forEach(m => {
      paidMap[m] = 0;
      owesMap[m] = 0;
    });

    const combined = this.getCombinedExpenses();
    const sharedExpenses = combined.filter(e => e.isHouseholdExpense || (e.splitWith && e.splitWith.length > 0));
    let totalSharedAmount = 0;

    sharedExpenses.forEach(e => {
      const amount = parseFloat(e.amount) || 0;
      totalSharedAmount += amount;
      const payer = e.paidBy || 'Self';
      if (paidMap[payer] !== undefined) {
        paidMap[payer] += amount;
      } else {
        paidMap[payer] = amount;
      }

      const splitList = (Array.isArray(e.splitWith) && e.splitWith.length > 0) ? e.splitWith : members;
      const sharePerPerson = amount / splitList.length;

      splitList.forEach(m => {
        if (owesMap[m] !== undefined) {
          owesMap[m] += sharePerPerson;
        } else {
          owesMap[m] = sharePerPerson;
        }
      });
    });

    // Account for recorded settlements: debtor paid creditor directly
    this._ensureSettlements(root);
    let totalSettledAmount = 0;
    root.settlements.forEach(s => {
      const amount = parseFloat(s.amount) || 0;
      totalSettledAmount += amount;
      if (paidMap[s.from] !== undefined) paidMap[s.from] += amount;
      else paidMap[s.from] = amount;

      if (paidMap[s.to] !== undefined) paidMap[s.to] -= amount;
      else paidMap[s.to] = -amount;
    });

    // Net balance per member (positive = should receive money, negative = owes money)
    const balances = {};
    members.forEach(m => {
      balances[m] = parseFloat(((paidMap[m] || 0) - (owesMap[m] || 0)).toFixed(2));
    });

    // Pairwise settlement resolution algorithm
    const debtors = [];
    const creditors = [];

    Object.entries(balances).forEach(([member, balance]) => {
      if (balance < -0.01) {
        debtors.push({ member, amount: -balance });
      } else if (balance > 0.01) {
        creditors.push({ member, amount: balance });
      }
    });

    const settlements = [];
    let dIdx = 0;
    let cIdx = 0;

    while (dIdx < debtors.length && cIdx < creditors.length) {
      const debtor = debtors[dIdx];
      const creditor = creditors[cIdx];
      const settlementAmount = Math.min(debtor.amount, creditor.amount);

      if (settlementAmount > 0.01) {
        settlements.push({
          from: debtor.member,
          to: creditor.member,
          amount: parseFloat(settlementAmount.toFixed(2))
        });
      }

      debtor.amount -= settlementAmount;
      creditor.amount -= settlementAmount;

      if (debtor.amount <= 0.01) dIdx++;
      if (creditor.amount <= 0.01) cIdx++;
    }

    return {
      members,
      sharedExpensesCount: sharedExpenses.length,
      totalSharedAmount: parseFloat(totalSharedAmount.toFixed(2)),
      totalSettledAmount: parseFloat(totalSettledAmount.toFixed(2)),
      settlementHistoryCount: root.settlements.length,
      paidMap,
      owesMap,
      balances,
      settlements
    };
  }

  // --- Phase 5: Bulk Import ---

  /**
   * Bulk inserts an array of parsed expenses from file import.
   * @param {Array} expenseArray - Array of expense objects with at least { title, amount, date }
   * @returns {{ success: boolean, imported: number, errors: string[] }}
   */
  bulkAddExpenses(expenseArray) {
    if (!Array.isArray(expenseArray) || expenseArray.length === 0) {
      return { success: false, imported: 0, errors: ['No expenses provided'] };
    }
    const data = this.getData();
    const errors = [];
    let imported = 0;

    expenseArray.forEach((exp, idx) => {
      try {
        const amount = parseFloat(exp.amount);
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
          tags: Array.isArray(exp.tags) ? exp.tags : (exp.tags ? String(exp.tags).split(',').map(t => t.trim()) : ['imported']),
          receiptFilename: null,
          paidBy: 'Self',
          splitWith: [],
          isHouseholdExpense: false
        };
        data.expenses.unshift(newExpense);
        imported++;
      } catch (err) {
        errors.push(`Row ${idx + 1}: ${err.message}`);
      }
    });

    this.saveData(data);
    return { success: imported > 0, imported, errors };
  }

  // --- Phase 5: Contextual Notes System ---

  /**
   * Ensures the notes array exists in the data store.
   * @private
   */
  _ensureNotes(data) {
    if (!Array.isArray(data.notes)) {
      data.notes = [];
    }
    return data;
  }

  /**
   * Get all notes, optionally filtered by relation type or relationId.
   * @param {{ relation?: string, relationId?: string }} [filters]
   * @returns {Array} notes matching filters
   */
  getNotes(filters = {}) {
    const data = this._ensureNotes(this.getData());
    let result = data.notes;

    if (filters.relation) {
      result = result.filter(n => n.relation === filters.relation);
    }
    if (filters.relationId) {
      result = result.filter(n => n.relationId === filters.relationId);
    }
    return result;
  }

  /**
   * Get all notes linked to a specific expense ID.
   * @param {string} expenseId
   * @returns {Array}
   */
  getNotesForExpense(expenseId) {
    return this.getNotes({ relation: 'transaction', relationId: expenseId });
  }

  /**
   * Get all notes linked to a specific date (YYYY-MM-DD).
   * @param {string} dateStr
   * @returns {Array}
   */
  getNotesForDate(dateStr) {
    return this.getNotes({ relation: 'day', relationId: dateStr });
  }

  /**
   * Get all notes linked to a specific ISO week (e.g. "2026-W34").
   * @param {string} weekStr
   * @returns {Array}
   */
  getNotesForWeek(weekStr) {
    return this.getNotes({ relation: 'week', relationId: weekStr });
  }

  /**
   * Get all notes linked to a specific month (e.g. "2026-08").
   * @param {string} monthStr
   * @returns {Array}
   */
  getNotesForMonth(monthStr) {
    return this.getNotes({ relation: 'month', relationId: monthStr });
  }

  /**
   * Add a new contextual note.
   * @param {{ content: string, relation: string, relationId: string }} note
   * @returns {{ success: boolean, note?: object, error?: string }}
   */
  addNote(note) {
    if (!note.content || typeof note.content !== 'string' || !note.content.trim()) {
      return { success: false, error: 'Note content is required' };
    }
    const validRelations = ['transaction', 'day', 'week', 'month'];
    if (!validRelations.includes(note.relation)) {
      return { success: false, error: `Invalid relation type. Must be one of: ${validRelations.join(', ')}` };
    }
    if (!note.relationId) {
      return { success: false, error: 'Relation ID is required (expense ID, date, week, or month string)' };
    }

    const data = this._ensureNotes(this.getData());
    const now = new Date().toISOString();
    const newNote = {
      id: 'note-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
      content: note.content.trim(),
      relation: note.relation,
      relationId: note.relationId,
      createdAt: now,
      updatedAt: now
    };
    data.notes.unshift(newNote);
    this.saveData(data);
    return { success: true, note: newNote };
  }

  getExpenseById(id) {
    if (!id) return { success: false, error: 'Expense ID is required' };
    const root = this._getRootData();
    // 1. Try active profile first
    const active = root.profiles.find(p => p.id === root.activeProfileId);
    if (active && Array.isArray(active.data?.expenses)) {
      const exp = active.data.expenses.find(e => e.id === id);
      if (exp) return { success: true, expense: exp };
    }

    // 2. Search across all other profiles
    for (const p of root.profiles || []) {
      if (Array.isArray(p.data?.expenses)) {
        const exp = p.data.expenses.find(e => e.id === id);
        if (exp) return { success: true, expense: exp };
      }
    }
    return { success: false, error: 'Expense not found' };
  }

  /**
   * Update an existing note's content.
   * @param {{ id: string, content: string }} updated
   * @returns {{ success: boolean, note?: object, error?: string }}
   */
  updateNote(updated) {
    if (!updated.id) return { success: false, error: 'Note ID is required' };
    if (!updated.content || !updated.content.trim()) return { success: false, error: 'Note content is required' };

    const root = this._getRootData();
    // 1. Check active profile
    let targetProfile = root.profiles.find(p => p.id === root.activeProfileId);
    let targetIndex = -1;

    if (targetProfile && Array.isArray(targetProfile.data?.notes)) {
      targetIndex = targetProfile.data.notes.findIndex(n => n.id === updated.id);
    }

    // 2. Check other profiles
    if (targetIndex === -1) {
      for (const p of root.profiles || []) {
        if (Array.isArray(p.data?.notes)) {
          const idx = p.data.notes.findIndex(n => n.id === updated.id);
          if (idx !== -1) {
            targetProfile = p;
            targetIndex = idx;
            break;
          }
        }
      }
    }

    if (targetProfile && targetIndex !== -1) {
      targetProfile.data.notes[targetIndex].content = updated.content.trim();
      targetProfile.data.notes[targetIndex].updatedAt = new Date().toISOString();
      this._saveRootData(root);
      return { success: true, note: targetProfile.data.notes[targetIndex] };
    }
    return { success: false, error: 'Note not found' };
  }

  /**
   * Delete a note by ID.
   * @param {string} id
   * @returns {{ success: boolean, error?: string }}
   */
  deleteNote(id) {
    if (!id) return { success: false, error: 'Note ID is required' };
    const root = this._getRootData();
    // 1. Try active profile
    const active = root.profiles.find(p => p.id === root.activeProfileId);
    if (active && Array.isArray(active.data?.notes)) {
      const idx = active.data.notes.findIndex(n => n.id === id);
      if (idx !== -1) {
        active.data.notes.splice(idx, 1);
        this._saveRootData(root);
        return { success: true, id };
      }
    }

    // 2. Search other profiles
    for (const p of root.profiles || []) {
      if (Array.isArray(p.data?.notes)) {
        const idx = p.data.notes.findIndex(n => n.id === id);
        if (idx !== -1) {
          p.data.notes.splice(idx, 1);
          this._saveRootData(root);
          return { success: true, id };
        }
      }
    }
    return { success: false, error: 'Note not found' };
  }

  // ==========================================================================
  // Ledgerly v1.2 Phase 3: Persistent Active Notifications Engine
  // ==========================================================================

  getNotifications() {
    const data = this.getData();
    const list = Array.isArray(data.notifications) ? data.notifications : [];
    // Return sorted newest first
    return list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  addNotification(notif) {
    if (!notif || !notif.title) return { success: false, error: 'Title is required' };
    const data = this.getData();
    if (!Array.isArray(data.notifications)) data.notifications = [];

    // Avoid duplicate unread notifications with same title within 24 hours
    const existing = data.notifications.find(n => n.title === notif.title && !n.read);
    if (existing) {
      return { success: true, notification: existing, duplicate: true };
    }

    const newNotif = {
      id: 'notif-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
      type: notif.type || 'system',
      title: notif.title.trim(),
      message: (notif.message || '').trim(),
      icon: notif.icon || 'bell',
      read: false,
      createdAt: notif.createdAt || new Date().toISOString(),
      actionTab: notif.actionTab || null
    };

    data.notifications.unshift(newNotif);
    // Keep max 50 recent notifications
    if (data.notifications.length > 50) {
      data.notifications = data.notifications.slice(0, 50);
    }

    this.saveData(data);
    return { success: true, notification: newNotif };
  }

  markNotificationRead(id) {
    const data = this.getData();
    if (!Array.isArray(data.notifications)) return { success: false, error: 'No notifications' };
    const target = data.notifications.find(n => n.id === id);
    if (target) {
      target.read = true;
      this.saveData(data);
      return { success: true, notification: target };
    }
    return { success: false, error: 'Notification not found' };
  }

  markAllNotificationsRead() {
    const data = this.getData();
    if (Array.isArray(data.notifications)) {
      data.notifications.forEach(n => n.read = true);
      this.saveData(data);
    }
    return { success: true, count: (data.notifications || []).length };
  }

  deleteNotification(id) {
    const data = this.getData();
    if (!Array.isArray(data.notifications)) return { success: false, error: 'No notifications' };
    const idx = data.notifications.findIndex(n => n.id === id);
    if (idx !== -1) {
      const removed = data.notifications.splice(idx, 1)[0];
      this.saveData(data);
      return { success: true, notification: removed };
    }
    return { success: false, error: 'Notification not found' };
  }

  clearAllNotifications() {
    const data = this.getData();
    data.notifications = [];
    this.saveData(data);
    return { success: true };
  }

  evaluateAutoNotifications() {
    const data = this.getData();
    const salary = data.salaryConfig || this._getDefaultSalaryConfig();
    const metrics = this.calculateDailyBudgetMetrics();
    const today = new Date().toISOString().split('T')[0];
    const sym = salary.currencySymbol || '₹';

    // 1. Budget Pace Alert
    const discBudget = metrics.discretionaryBudget;
    const spent = metrics.spentMonthToDate;
    if (discBudget > 0 && spent >= discBudget) {
      this.addNotification({
        type: 'budget',
        title: 'Monthly Discretionary Budget Reached',
        message: `You have spent ${sym}${spent.toFixed(2)} of ${sym}${discBudget.toFixed(2)}. Switch to essential spending only.`,
        icon: 'alert-triangle',
        actionTab: 'dashboard'
      });
    } else if (discBudget > 0 && spent >= discBudget * 0.85) {
      this.addNotification({
        type: 'budget',
        title: '85% Discretionary Budget Consumed',
        message: `${sym}${(discBudget - spent).toFixed(2)} remaining for ${metrics.remainingDays} days in this cycle.`,
        icon: 'alert-circle',
        actionTab: 'dashboard'
      });
    }

    // 2. Upcoming Recurring Bills Alert (due in next 3 days)
    const bills = Array.isArray(data.recurringBills) ? data.recurringBills : [];
    const now = new Date();
    const currentDay = now.getDate();
    bills.forEach(bill => {
      if (bill.dueDay && !bill.isPaidForCurrentCycle) {
        const daysUntilDue = bill.dueDay - currentDay;
        if (daysUntilDue >= 0 && daysUntilDue <= 3) {
          const dueStr = daysUntilDue === 0 ? 'Today' : (daysUntilDue === 1 ? 'Tomorrow' : `in ${daysUntilDue} days`);
          this.addNotification({
            type: 'bill',
            title: `Bill Due ${dueStr}: ${bill.title}`,
            message: `${sym}${parseFloat(bill.amount || 0).toFixed(2)} due on Day ${bill.dueDay}. Split with household to keep accounts updated.`,
            icon: 'zap',
            actionTab: 'household'
          });
        }
      }
    });

    // 3. Payday Shift Guidance Notice
    if (metrics.isDelayed) {
      this.addNotification({
        type: 'payday',
        title: `Salary Delayed (${metrics.shiftDays}d buffer)`,
        message: metrics.stretchGuidance,
        icon: 'calendar',
        actionTab: 'settings'
      });
    }

    return this.getNotifications();
  }
}

module.exports = ExpenseStorage;
