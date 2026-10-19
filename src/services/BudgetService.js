/**
 * ============================================================================
 * Ledgerly — BudgetService (Salary Allocator & Payday Cycle Pacing Engine)
 * ============================================================================
 *
 * @fileoverview
 * Domain service managing personal budget allocations, salary cycle schedules,
 * payday shift projections, and real-time daily spending pace metrics.
 *
 * ARCHITECTURAL PRINCIPLES:
 * - Single Responsibility: Manages income allocation, pay cycles, and pacing health.
 * - Encapsulation: Insulates cycle date math, pacing statuses, and discretionary calculations.
 * - Dependency Injection: Operates through injected JsonDatabase and ProfileService.
 * - Extensibility: Supports future bi-weekly/weekly cycles, savings buckets, and multi-currency.
 */

'use strict';

/**
 * @class BudgetService
 * Provides salary configuration, payday cycle date calculation, and daily budget pacing metrics.
 */
class BudgetService {
  /**
   * Initializes the BudgetService with injected database and profile services.
   *
   * @param {import('./JsonDatabase')} db - The database persistence service.
   * @param {import('./ProfileService')} profileService - The profile management service.
   */
  constructor(db, profileService) {
    if (!db || !profileService) {
      throw new Error('BudgetService requires valid JsonDatabase and ProfileService instances.');
    }

    /** @private */
    this._db = db;

    /** @private */
    this._profiles = profileService;
  }

  // ==========================================================================
  // 1. Budget Goal & Salary Allocation Configuration
  // ==========================================================================

  /**
   * Retrieves the active profile's salary configuration.
   * Falls back to default salary configuration if not explicitly set.
   *
   * @returns {import('../types').SalaryConfig} Active salary configuration.
   */
  getSalaryConfig() {
    const data = this._profiles.getActiveData();
    return data.salaryConfig || this._profiles.getDefaultSalaryConfig();
  }

  /**
   * Updates salary allocation parameters and synchronizes the discretionary budget goal.
   *
   * @param {Partial<import('../types').SalaryConfig>} config - New salary parameters.
   * @returns {import('../types').OperationResult & { salaryConfig: import('../types').SalaryConfig, budgetGoal: number }}
   */
  setSalaryConfig(config = {}) {
    const data = this._profiles.getActiveData();

    const monthlyIncome = Math.max(0, parseFloat(String(config.monthlyIncome)) || 0);
    const fixedBills = Math.max(0, parseFloat(String(config.fixedBills)) || 0);
    const savingsGoal = Math.max(0, parseFloat(String(config.savingsGoal)) || 0);
    const payday = Math.max(1, Math.min(31, parseInt(String(config.payday), 10) || 1));

    data.salaryConfig = {
      monthlyIncome,
      fixedBills,
      savingsGoal,
      payday,
      currentCycleStartDate: config.currentCycleStartDate || null,
      nextPaydayOverride: config.nextPaydayOverride || null,
      currencySymbol: config.currencySymbol || '₹',

      // Extensibility slots for future feature extensions
      payFrequency: config.payFrequency || 'monthly',
      savingsBuckets: Array.isArray(config.savingsBuckets) ? config.savingsBuckets : [],
      metadata: config.metadata || {}
    };

    // Synchronize discretionary budget to budgetGoal
    data.budgetGoal = Math.max(0, monthlyIncome - fixedBills - savingsGoal);

    this._profiles.saveActiveData(data);

    return {
      success: true,
      salaryConfig: data.salaryConfig,
      budgetGoal: data.budgetGoal
    };
  }

  /**
   * Sets a manual discretionary budget goal for the active profile.
   *
   * @param {number|string} amount - Target budget amount.
   * @returns {import('../types').OperationResult & { budgetGoal: number }}
   */
  setBudgetGoal(amount) {
    const data = this._profiles.getActiveData();
    data.budgetGoal = parseFloat(String(amount)) || 0;
    this._profiles.saveActiveData(data);

    return {
      success: true,
      budgetGoal: data.budgetGoal
    };
  }

  // ==========================================================================
  // 2. Payday Cycle & Date Computation Engine
  // ==========================================================================

  /**
   * Computes the boundaries and duration metrics for the active salary cycle.
   * Handles custom start overrides, payday delays, and early pay advances.
   *
   * @param {import('../types').SalaryConfig} [salaryConfig] - Optional salary config (defaults to active).
   * @param {string|null} [targetDateStr=null] - Reference date for calculation (YYYY-MM-DD).
   * @returns {{
   *   payday: number,
   *   cycleStartDate: string,
   *   nextPaydayDate: string,
   *   totalDaysInCycle: number,
   *   daysElapsed: number,
   *   remainingDays: number,
   *   shiftDays: number,
   *   isDelayed: boolean,
   *   isEarly: boolean
   * }} Computed pay cycle boundaries.
   */
  getSalaryCycleDates(salaryConfig = null, targetDateStr = null) {
    const s = salaryConfig || this.getSalaryConfig();
    const payday = Math.max(1, Math.min(31, parseInt(String(s.payday), 10) || 1));
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

    const formatLocal = d => {
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

  // ==========================================================================
  // 3. Real-Time Daily Budget Pacing Engine
  // ==========================================================================

  /**
   * Calculates real-time daily spending pace, rollover balances, and safe spending limits.
   *
   * @param {string} [targetDateStr=null] - Date to compute metrics for (YYYY-MM-DD). Defaults to today.
   * @returns {import('../types').DailyBudgetMetrics} Full pacing analysis metrics.
   */
  calculateDailyBudgetMetrics(targetDateStr = null) {
    const data = this._profiles.getActiveData();
    const salary = data.salaryConfig || this._profiles.getDefaultSalaryConfig();
    const discretionaryBudget = Math.max(0, salary.monthlyIncome - salary.fixedBills - salary.savingsGoal);

    const cycle = this.getSalaryCycleDates(salary, targetDateStr);
    const dailyAllowance = cycle.totalDaysInCycle > 0 ? discretionaryBudget / cycle.totalDaysInCycle : 0;

    const now = targetDateStr ? new Date(targetDateStr) : new Date();
    const todayStr = targetDateStr || now.toISOString().split('T')[0];

    // Filter non-fixed variable expenses within the active pay cycle
    const cycleExpenses = (data.expenses || []).filter(
      e => e.date && e.date >= cycle.cycleStartDate && e.date < cycle.nextPaydayDate
    );
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

    const budgetExhaustionPercentage =
      discretionaryBudget > 0 ? Math.round((spentCycleToDate / discretionaryBudget) * 100) : 0;

    let pacingWarningLevel = 'safe';
    if (discretionaryBudget > 0) {
      if (spentCycleToDate >= discretionaryBudget) {
        pacingWarningLevel = 'overrun';
      } else if (spentCycleToDate >= discretionaryBudget * 0.8) {
        pacingWarningLevel = 'warning';
      } else {
        pacingWarningLevel = 'safe';
      }
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
      baselineDailyAllowance: parseFloat(dailyAllowance.toFixed(2)),
      todaySpent: parseFloat(todaySpent.toFixed(2)),
      todayRemaining: Math.max(0, parseFloat((dailyAllowance - todaySpent).toFixed(2))),
      spentMonthToDate: parseFloat(spentCycleToDate.toFixed(2)),
      allowedMonthToDate: parseFloat(allowedCycleToDate.toFixed(2)),
      rolloverBalance: parseFloat(rolloverBalance.toFixed(2)),
      safeDailyLimit: parseFloat(safeDailyLimit.toFixed(2)),
      dynamicDailyAllowance: parseFloat(safeDailyLimit.toFixed(2)),
      pacingStatus,
      budgetExhaustionPercentage,
      pacingWarningLevel
    };
  }

  /**
   * Query alias for calculateDailyBudgetMetrics for semantic query ergonomics.
   *
   * @param {string} [targetDateStr=null]
   * @returns {import('../types').DailyBudgetMetrics}
   */
  getDailyBudgetMetrics(targetDateStr = null) {
    return this.calculateDailyBudgetMetrics(targetDateStr);
  }

  /**
   * Calculates instantaneous daily allowance impact of a prospective expense.
   * Compares current safe daily spending limit with projected limit if additionalAmount is spent.
   *
   * @param {number|string} additionalAmount - Prospective expense amount.
   * @param {string} [targetDateStr=null] - Date to compute metrics for.
   * @returns {{ currentSafeDaily: number, projectedSafeDaily: number, impactDelta: number, remainingDays: number, currencySymbol: string, formatted: string }}
   */
  calculateDailyImpact(additionalAmount, targetDateStr = null) {
    const amount = Math.max(0, parseFloat(String(additionalAmount)) || 0);
    const data = this._profiles.getActiveData();
    const salary = data.salaryConfig || this._profiles.getDefaultSalaryConfig();
    const discretionaryBudget = Math.max(0, salary.monthlyIncome - salary.fixedBills - salary.savingsGoal);

    const cycle = this.getSalaryCycleDates(salary, targetDateStr);
    const cycleExpenses = (data.expenses || []).filter(
      e => e.date && e.date >= cycle.cycleStartDate && e.date < cycle.nextPaydayDate
    );
    const spentCycleToDate = cycleExpenses.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
    const remainingDiscretionary = Math.max(0, discretionaryBudget - spentCycleToDate);
    const remainingDays = cycle.remainingDays > 0 ? cycle.remainingDays : 1;

    const currentSafeDaily = parseFloat((remainingDiscretionary / remainingDays).toFixed(2));
    const projectedRemaining = Math.max(0, remainingDiscretionary - amount);
    const projectedSafeDaily = parseFloat((projectedRemaining / remainingDays).toFixed(2));
    const impactDelta = parseFloat((currentSafeDaily - projectedSafeDaily).toFixed(2));
    const sym = salary.currencySymbol || '₹';

    return {
      currentSafeDaily,
      projectedSafeDaily,
      impactDelta,
      remainingDays: cycle.remainingDays,
      currencySymbol: sym,
      formatted: `${sym}${currentSafeDaily.toFixed(0)} → ${sym}${projectedSafeDaily.toFixed(0)}/day`
    };
  }
}

module.exports = BudgetService;
