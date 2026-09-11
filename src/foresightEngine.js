// Interactive "What-If" Spending Impact Simulator & Burnout Forecast Engine (Offline)

class ForesightEngine {
  /**
   * Simulates the mathematical ripple effect of a potential purchase on subsequent daily budgets.
   * @param {number} extraAmount - The test expenditure amount in Rupees (₹).
   * @param {Object} salaryConfig - { monthlyIncome, fixedBills, savingsGoal }
   * @param {number} spentMonthToDate - Total spent in the current month so far.
   * @param {Date|string} [targetDate] - Target date (defaults to today).
   * @returns {Object} Simulation analysis and forecast
   */
  static simulatePurchase(extraAmount, salaryConfig, spentMonthToDate, targetDate = new Date()) {
    const d = targetDate instanceof Date ? targetDate : new Date(targetDate);
    const year = d.getFullYear();
    const month = d.getMonth();
    const dayOfMonth = d.getDate();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const monthlyIncome = parseFloat(salaryConfig.monthlyIncome) || 0;
    const fixedBills = parseFloat(salaryConfig.fixedBills) || 0;
    const savingsGoal = parseFloat(salaryConfig.savingsGoal) || 0;
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
    const sym = salaryConfig.currencySymbol || '₹';
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

    return {
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
      statusMessage
    };
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ForesightEngine;
}
