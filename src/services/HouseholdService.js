/**
 * ============================================================================
 * Ledgerly — HouseholdService (Shared Splitting, Settlements & Utility Bills)
 * ============================================================================
 * 
 * @fileoverview
 * Domain service managing shared living finances, member rosters, pairwise debt
 * resolution matrix algorithms, historical repayments, and recurring utility bills.
 * 
 * ARCHITECTURAL PRINCIPLES:
 * - Single Responsibility: Manages multi-member expenses, split math, and utility bills.
 * - Encapsulation: Insulates pairwise settlement optimization and split-cost allocation.
 * - Dependency Injection: Operates through injected JsonDatabase, ProfileService, and ExpenseService.
 * - Extensibility: Supports custom split ratios, account tracking, and recurring billing cycles.
 */

'use strict';

/**
 * @class HouseholdService
 * Manages household members, shared expense splitting, pairwise debt resolution,
 * manual settlement logs, and recurring utility bills.
 */
class HouseholdService {
  /**
   * Initializes HouseholdService with injected dependencies.
   * 
   * @param {import('./JsonDatabase')} db - The database persistence service.
   * @param {import('./ProfileService')} profileService - The profile management service.
   * @param {import('./ExpenseService')} expenseService - The expense management service.
   */
  constructor(db, profileService, expenseService) {
    if (!db || !profileService || !expenseService) {
      throw new Error('HouseholdService requires valid JsonDatabase, ProfileService, and ExpenseService instances.');
    }

    /** @private */
    this._db = db;

    /** @private */
    this._profiles = profileService;

    /** @private */
    this._expenses = expenseService;
  }

  // ==========================================================================
  // 1. Household Members Management
  // ==========================================================================

  /**
   * Retrieves the list of household members configured for the active profile.
   * 
   * @returns {string[]} List of member names.
   */
  getMembers() {
    const data = this._profiles.getActiveData();
    const members = new Set(data.householdMembers || ['Self', 'Partner']);
    return Array.from(members);
  }

  /**
   * Adds a new member to the active profile's household roster.
   * 
   * @param {string} name - Display name of the member.
   * @returns {import('../types').OperationResult & { householdMembers?: string[] }}
   */
  addMember(name) {
    if (!name || typeof name !== 'string') {
      return { success: false, error: 'Invalid name' };
    }

    const trimmed = name.trim();
    if (!trimmed) {
      return { success: false, error: 'Member name cannot be empty' };
    }

    const data = this._profiles.getActiveData();
    if (!Array.isArray(data.householdMembers)) {
      data.householdMembers = ['Self'];
    }

    if (!data.householdMembers.includes(trimmed)) {
      data.householdMembers.push(trimmed);
      this._profiles.saveActiveData(data);
      return { success: true, householdMembers: data.householdMembers };
    }

    return { success: false, error: 'Member already exists' };
  }

  /**
   * Removes a member from the active profile's household roster.
   * Prevents removing the primary user ('Self').
   * 
   * @param {string} name - Name of the member to remove.
   * @returns {import('../types').OperationResult & { householdMembers?: string[] }}
   */
  deleteMember(name) {
    const data = this._profiles.getActiveData();
    if (!Array.isArray(data.householdMembers)) {
      return { success: false, error: 'No members' };
    }

    if (name === 'Self') {
      return { success: false, error: 'Cannot remove primary user (Self)' };
    }

    const initialLen = data.householdMembers.length;
    data.householdMembers = data.householdMembers.filter(m => m !== name);

    if (data.householdMembers.length !== initialLen) {
      this._profiles.saveActiveData(data);
      return { success: true, householdMembers: data.householdMembers };
    }

    return { success: false, error: 'Member not found' };
  }

  // ==========================================================================
  // 2. Pairwise Debt & Settlement Matrix Engine
  // ==========================================================================

  /**
   * Computes the complete household financial breakdown, net balance matrix,
   * and minimal pairwise transfer settlements.
   * 
   * @returns {import('../types').SettlementAnalysis} Full pairwise settlement analysis.
   */
  calculateHouseholdSettlement() {
    const root = this._db.read();
    const profileNames = (root.profiles || []).map(p => p.name);
    const householdMembers = this.getMembers();
    const members = Array.from(new Set([...profileNames, ...householdMembers]));

    const paidMap = {};
    const owesMap = {};
    members.forEach(m => {
      paidMap[m] = 0;
      owesMap[m] = 0;
    });

    const combined = this._profiles.getCombinedExpenses();
    const sharedExpenses = combined.filter(e => e.isHouseholdExpense || (e.splitWith && e.splitWith.length > 0));
    let totalSharedAmount = 0;

    sharedExpenses.forEach(e => {
      const amount = parseFloat(String(e.amount)) || 0;
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
      const amount = parseFloat(String(s.amount)) || 0;
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

    // Pairwise settlement resolution algorithm (Greedy matching)
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

  /**
   * Alias for calculateHouseholdSettlement() for backward compatibility.
   * 
   * @returns {import('../types').SettlementAnalysis}
   */
  getHouseholdSettlement() {
    return this.calculateHouseholdSettlement();
  }

  // ==========================================================================
  // 3. Recorded Settlements & Repayments History (CRUD)
  // ==========================================================================

  /**
   * Ensures the settlements array exists in root data.
   * 
   * @private
   * @param {object} root - Root schema.
   * @returns {object} Root schema.
   */
  _ensureSettlements(root) {
    if (!Array.isArray(root.settlements)) {
      root.settlements = [];
    }
    return root;
  }

  /**
   * Retrieves all recorded settlement transactions.
   * 
   * @returns {import('../types').SettlementRecord[]} List of settlement records.
   */
  getSettlements() {
    const root = this._db.read();
    this._ensureSettlements(root);
    return root.settlements;
  }

  /**
   * Records a completed settlement payment between two household members.
   * 
   * @param {Partial<import('../types').SettlementRecord>} settlementData - Settlement details.
   * @returns {import('../types').OperationResult & { settlement?: import('../types').SettlementRecord }}
   */
  addSettlement(settlementData = {}) {
    const root = this._db.read();
    this._ensureSettlements(root);

    const newSettlement = {
      id: 'stl-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
      from: settlementData.from || 'Self',
      to: settlementData.to || 'Partner',
      amount: parseFloat(String(settlementData.amount)) || 0,
      paymentMethod: settlementData.paymentMethod || 'UPI / GPay',
      date: settlementData.date || new Date().toISOString().split('T')[0],
      notes: settlementData.notes || '',
      receiptFilename: settlementData.receiptFilename || null,
      createdAt: new Date().toISOString(),

      // Extensibility slots
      referenceTransactionId: settlementData.referenceTransactionId || null,
      metadata: settlementData.metadata || {}
    };

    root.settlements.unshift(newSettlement);
    this._db.write(root);

    return { success: true, settlement: newSettlement };
  }

  /**
   * Deletes a recorded settlement record by ID.
   * 
   * @param {string} id - Settlement identifier.
   * @returns {import('../types').OperationResult}
   */
  deleteSettlement(id) {
    const root = this._db.read();
    this._ensureSettlements(root);

    const initialLen = root.settlements.length;
    root.settlements = root.settlements.filter(s => s.id !== id);

    if (root.settlements.length !== initialLen) {
      this._db.write(root);
      return { success: true };
    }

    return { success: false, error: 'Settlement not found' };
  }

  // ==========================================================================
  // 4. Recurring Utility Bills Management
  // ==========================================================================

  /**
   * Returns standard default recurring utility bills baseline.
   * 
   * @returns {import('../types').RecurringBill[]}
   */
  static getDefaultRecurringBills() {
    return [
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

  /**
   * Ensures the recurring bills collection exists and is seeded if needed.
   * 
   * @private
   * @param {object} root - Root schema.
   * @returns {object} Root schema.
   */
  _ensureRecurringBills(root) {
    if (!Array.isArray(root.recurringBills)) {
      root.recurringBills = HouseholdService.getDefaultRecurringBills();
    }
    return root;
  }

  /**
   * Retrieves configured recurring utility bills.
   * 
   * @returns {import('../types').RecurringBill[]}
   */
  getRecurringBills() {
    const root = this._db.read();
    this._ensureRecurringBills(root);
    return root.recurringBills;
  }

  /**
   * Creates or updates a recurring utility bill.
   * 
   * @param {Partial<import('../types').RecurringBill>} billData - Bill details.
   * @returns {import('../types').OperationResult & { bills: import('../types').RecurringBill[] }}
   */
  saveRecurringBill(billData = {}) {
    const root = this._db.read();
    this._ensureRecurringBills(root);

    if (billData.id) {
      const idx = root.recurringBills.findIndex(b => b.id === billData.id);
      if (idx !== -1) {
        root.recurringBills[idx] = {
          ...root.recurringBills[idx],
          ...billData,
          amount: billData.amount !== undefined ? (parseFloat(String(billData.amount)) || 0) : root.recurringBills[idx].amount,
          dueDay: billData.dueDay !== undefined ? (parseInt(String(billData.dueDay), 10) || 1) : root.recurringBills[idx].dueDay
        };
      }
    } else {
      const newBill = {
        id: 'rec-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
        title: billData.title || 'Utility Bill',
        icon: billData.icon || 'zap',
        amount: parseFloat(String(billData.amount)) || 0,
        category: billData.category || 'Utilities',
        dueDay: parseInt(String(billData.dueDay), 10) || 1,
        frequency: billData.frequency || 'monthly',
        paidBy: billData.paidBy || 'Self',
        splitWith: Array.isArray(billData.splitWith) ? billData.splitWith : ['Self', 'Partner'],
        autoSplit: billData.autoSplit !== false,
        lastPaidDate: null,

        // Extensibility slots
        accountNumber: billData.accountNumber || null,
        autoPay: Boolean(billData.autoPay),
        gracePeriodDays: billData.gracePeriodDays || 0,
        metadata: billData.metadata || {}
      };

      root.recurringBills.push(newBill);
    }

    this._db.write(root);
    return { success: true, bills: root.recurringBills };
  }

  /**
   * Deletes a recurring utility bill by ID.
   * 
   * @param {string} id - Bill identifier.
   * @returns {import('../types').OperationResult & { bills: import('../types').RecurringBill[] }}
   */
  deleteRecurringBill(id) {
    const root = this._db.read();
    this._ensureRecurringBills(root);

    root.recurringBills = root.recurringBills.filter(b => b.id !== id);
    this._db.write(root);

    return { success: true, bills: root.recurringBills };
  }

  /**
   * Marks a recurring bill as paid for the current cycle and automatically
   * records a shared expense in the ledger if configured.
   * 
   * @param {string} id - Bill ID to mark as cleared.
   * @param {{ paymentMethod?: string, paidBy?: string }} [paymentDetails={}] - Payment metadata.
   * @returns {import('../types').OperationResult & { bill?: import('../types').RecurringBill }}
   */
  markRecurringBillPaid(id, paymentDetails = {}) {
    const root = this._db.read();
    this._ensureRecurringBills(root);

    const bill = root.recurringBills.find(b => b.id === id);
    if (!bill) {
      return { success: false, error: 'Bill not found' };
    }

    const todayStr = new Date().toISOString().split('T')[0];
    bill.lastPaidDate = todayStr;
    this._db.write(root);

    // Automatically record as shared expense in the active profile's ledger
    if (bill.autoSplit !== false) {
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

      this._expenses.add(expensePayload);
    }

    return { success: true, bill };
  }
}

module.exports = HouseholdService;
