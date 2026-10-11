// Interactive "What-If" Spending Impact Simulator & Burnout Forecast Engine (Offline)

class ForesightEngine {
  /**
   * Minimum active logging days required before unlocking statistical burn rate forecasting.
   * @readonly
   */
  static REQUIRED_LOGGED_DAYS = 20;

  /**
   * Simulates the mathematical ripple effect of a potential purchase on subsequent daily budgets,
   * with data-gated statistical burn rate and runway forecasting (Phase 0.8.4).
   *
   * @param {number} extraAmount - The test expenditure amount.
   * @param {Object} salaryConfig - { monthlyIncome, fixedBills, savingsGoal, currencySymbol }
   * @param {number} spentMonthToDate - Total spent in the current month so far.
   * @param {Date|string} [targetDate] - Target date (defaults to today).
   * @param {any[]} [expenses=[]] - Historical transactions for active logging days & statistical burn rate.
   * @returns {import('./types').ForesightBurnRateResult} Simulation analysis and forecast
   */
  static simulatePurchase(extraAmount, salaryConfig, spentMonthToDate, targetDate = new Date(), expenses = []) {
    const d = targetDate instanceof Date ? targetDate : new Date(targetDate);
    const year = d.getFullYear();
    const month = d.getMonth();
    const dayOfMonth = d.getDate();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const cfg = salaryConfig && typeof salaryConfig === 'object' ? salaryConfig : {};
    const monthlyIncome = parseFloat(cfg.monthlyIncome) || 0;
    const fixedBills = parseFloat(cfg.fixedBills) || 0;
    const savingsGoal = parseFloat(cfg.savingsGoal) || 0;
    const discretionaryPool = Math.max(0, monthlyIncome - fixedBills - savingsGoal);

    const baselineDailyAllowance = daysInMonth > 0 ? discretionaryPool / daysInMonth : 0;
    const daysRemaining = Math.max(1, daysInMonth - dayOfMonth + 1);
    const spentMTD = parseFloat(spentMonthToDate) || 0;
    const remainingDiscretionary = Math.max(0, discretionaryPool - spentMTD);

    const currentPace = daysRemaining > 0 ? remainingDiscretionary / daysRemaining : 0;

    // Simulate deduction of extraAmount
    const testAmount = Math.max(0, parseFloat(extraAmount) || 0);
    const simulatedRemaining = Math.max(0, remainingDiscretionary - testAmount);
    const subsequentDays = Math.max(1, daysRemaining - 1);
    const projectedPace = subsequentDays > 0 ? simulatedRemaining / subsequentDays : 0;
    const dailyDrop = Math.max(0, currentPace - projectedPace);
    const dropPercentage = currentPace > 0 ? (dailyDrop / currentPace) * 100 : 0;

    // Forecast Burnout & Risk Trajectory
    const sym = cfg.currencySymbol || '₹';
    let riskLevel = 'SAFE'; // 'SAFE' | 'CAUTION' | 'CRITICAL'
    let statusHeadline = 'Sustainable Purchase';
    let statusMessage = `Your daily budget will adjust smoothly to ${sym}${projectedPace.toFixed(0)}/day for the remaining ${subsequentDays} days.`;

    if (testAmount > remainingDiscretionary) {
      riskLevel = 'CRITICAL';
      statusHeadline = 'Budget Overdraft Warning';
      statusMessage = `Exceeds your remaining discretionary pool by ${sym}${(testAmount - remainingDiscretionary).toFixed(0)}. Subsequent daily allowance drops to ${sym}0.`;
    } else if (projectedPace < baselineDailyAllowance * 0.45 || dropPercentage > 40) {
      riskLevel = 'CRITICAL';
      statusHeadline = 'High Burnout Risk';
      statusMessage = `Reduces daily breathing room by ${dropPercentage.toFixed(0)}% (drops to ${sym}${projectedPace.toFixed(0)}/day). High risk of month-end budget deficit.`;
    } else if (projectedPace < baselineDailyAllowance * 0.75 || dropPercentage > 15) {
      riskLevel = 'CAUTION';
      statusHeadline = 'Moderate Spending Impact';
      statusMessage = `Daily allowance tightens by ${sym}${dailyDrop.toFixed(0)}/day (new safe pace: ${sym}${projectedPace.toFixed(0)}/day).`;
    }

    // ========================================================================
    // Data-Gated Statistical Burn Rate & Runway Forecasting (Phase 0.8.4)
    // ========================================================================
    const rawList = Array.isArray(expenses) ? expenses : [];
    const validDates = new Set();
    for (let i = 0; i < rawList.length; i++) {
      const exp = rawList[i];
      if (exp && exp.date && typeof exp.date === 'string') {
        validDates.add(exp.date);
      }
    }
    const activeDays = validDates.size;
    const requiredDays = ForesightEngine.REQUIRED_LOGGED_DAYS;
    const isDataGated = activeDays < requiredDays;
    const daysRemainingToUnlock = Math.max(0, requiredDays - activeDays);
    const unlockProgressPct = Math.min(100, Math.round((activeDays / requiredDays) * 100));

    const result = {
      testAmount,
      discretionaryPool,
      spentMTD,
      remainingDiscretionary,
      daysRemaining,
      subsequentDays,
      currentPace: parseFloat(currentPace.toFixed(2)),
      projectedPace: parseFloat(projectedPace.toFixed(2)),
      dailyDrop: parseFloat(dailyDrop.toFixed(2)),
      dropPercentage: parseFloat(dropPercentage.toFixed(1)),
      riskLevel,
      statusHeadline,
      statusMessage,
      isDataGated,
      activeDays,
      requiredDays,
      daysRemainingToUnlock,
      unlockProgressPct
    };

    if (isDataGated) {
      result.gateMessage = `Burn rate forecasting unlocks after ${requiredDays} days of expense logging (currently ${activeDays}/${requiredDays} days).`;
      return result;
    }

    // Data-Gate Unlocked: Compute Statistical Rolling Burn Rates
    const targetTime = d.getTime();
    const MS_PER_DAY = 24 * 60 * 60 * 1000;
    let sum7d = 0;
    let sum30d = 0;

    for (let j = 0; j < rawList.length; j++) {
      const exp = rawList[j];
      if (!exp || !exp.date) continue;
      const amt = typeof exp.amount === 'number' ? exp.amount : parseFloat(exp.amount) || 0;
      if (amt <= 0) continue;

      const expTime = new Date(exp.date + 'T00:00:00Z').getTime();
      if (isNaN(expTime)) continue;

      const diffDays = (targetTime - expTime) / MS_PER_DAY;
      if (diffDays >= 0 && diffDays <= 7) {
        sum7d += amt;
      }
      if (diffDays >= 0 && diffDays <= 30) {
        sum30d += amt;
      }
    }

    const burnRate7d = Math.round((sum7d / 7) * 100) / 100;
    const burnRate30d = Math.round((sum30d / 30) * 100) / 100;
    let burnRate = Math.round((0.6 * burnRate7d + 0.4 * burnRate30d) * 100) / 100;
    if (burnRate <= 0) {
      burnRate = parseFloat(currentPace.toFixed(2));
    }

    // Days to Zero (Runway Calculation)
    const currentRunway =
      burnRate > 0 ? Math.round((remainingDiscretionary / burnRate) * 10) / 10 : daysRemaining;
    const projectedRunway =
      burnRate > 0 ? Math.round((simulatedRemaining / burnRate) * 10) / 10 : 0;
    const runwayDrop = Math.round(Math.max(0, currentRunway - projectedRunway) * 10) / 10;

    result.burnRate = burnRate;
    result.burnRate7d = burnRate7d;
    result.burnRate30d = burnRate30d;
    result.currentRunway = currentRunway;
    result.projectedRunway = projectedRunway;
    result.runwayDrop = runwayDrop;

    if (testAmount > 0 && runwayDrop > 0) {
      result.statusMessage += ` Runway impact: Shortens your ${currentRunway}d cash runway by ${runwayDrop}d.`;
    }

    return result;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ForesightEngine;
}

