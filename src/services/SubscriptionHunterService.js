/**
 * ============================================================================
 * Ledgerly — SubscriptionHunterService (Offline Recurring Anomaly & Subscriptions Engine)
 * ============================================================================
 *
 * @fileoverview
 * Domain service providing offline subscription cadence detection, unnoticed vendor
 * price hike identification, zombie/dormant recurring expense alerts, and annualized
 * commitment projections.
 *
 * ARCHITECTURAL PRINCIPLES:
 * - 100% Offline: Operates with deterministic interval mathematics, zero external APIs.
 * - Multi-Cadence Support: Accurately identifies weekly, bi-weekly, monthly, quarterly,
 *   and annual billing cycles with configurable jitter tolerance.
 * - Price Hike Alerting: Flags asymmetric price jumps compared to historical baselines.
 * - Zero Native Dependencies: Pure JavaScript running smoothly on any CPU.
 */

'use strict';

/**
 * Cadence interval configuration with target days, allowable jitter, and annual multiplier.
 * @readonly
 */
const CADENCE_CONFIG = Object.freeze({
  weekly: {
    targetDays: 7,
    jitterDays: 2,
    minDays: 5,
    maxDays: 9,
    annualMultiplier: 52,
    defaultMinOccurrences: 3
  },
  'bi-weekly': {
    targetDays: 14,
    jitterDays: 3,
    minDays: 11,
    maxDays: 17,
    annualMultiplier: 26,
    defaultMinOccurrences: 3
  },
  monthly: {
    targetDays: 30,
    jitterDays: 4,
    minDays: 26,
    maxDays: 35,
    annualMultiplier: 12,
    defaultMinOccurrences: 2
  },
  quarterly: {
    targetDays: 91,
    jitterDays: 5,
    minDays: 85,
    maxDays: 97,
    annualMultiplier: 4,
    defaultMinOccurrences: 2
  },
  annual: {
    targetDays: 365,
    jitterDays: 7,
    minDays: 355,
    maxDays: 375,
    annualMultiplier: 1,
    defaultMinOccurrences: 2
  }
});

/**
 * Common banking noise patterns stripped during vendor normalization.
 * @readonly
 */
const BANKING_NOISE_REGEX =
  /^(UPI|POS|NEFT|IMPS|RTGS|ACH|NACH|AUTOPAY|BILLDESK|RAZORPAY|SUBSCRIPTION|SUB)[-/\s:]+/i;
const TRAILING_NOISE_REGEX =
  /[-/\s:]+(BANGALORE|MUMBAI|DELHI|PUNE|HYDERABAD|CHENNAI|STORE\s*\d*|\d{4,})$/i;

class SubscriptionHunterService {
  /**
   * @param {object} [options={}]
   * @param {import('./JsonDatabase')} [options.db] - Persistence engine
   * @param {import('./ExpenseService')} [options.expenses] - Expense service
   */
  constructor(options = {}) {
    this._db = options.db || null;
    this._expenses = options.expenses || null;
  }

  // ==========================================================================
  // 1. String Normalization & Helper Utilities
  // ==========================================================================

  /**
   * Normalizes vendor names to group repeating charges accurately despite banking narration variations.
   *
   * @param {string} rawTitle - Raw expense title or payee.
   * @returns {string} Cleaned vendor name.
   */
  normalizeMerchant(rawTitle) {
    if (!rawTitle || typeof rawTitle !== 'string') return 'UNKNOWN';

    let cleaned = rawTitle.trim();
    cleaned = cleaned.replace(BANKING_NOISE_REGEX, '');
    cleaned = cleaned.replace(TRAILING_NOISE_REGEX, '');
    cleaned = cleaned.replace(/\s+/g, ' ').trim();

    return cleaned.toUpperCase() || rawTitle.trim().toUpperCase() || 'UNKNOWN';
  }

  /**
   * Calculates difference in integer calendar days between two ISO date strings (YYYY-MM-DD).
   *
   * @param {string} d1Str - Earlier date.
   * @param {string} d2Str - Later date.
   * @returns {number} Days difference (positive if d2Str > d1Str).
   */
  _daysDifference(d1Str, d2Str) {
    const t1 = new Date(d1Str + 'T00:00:00Z').getTime();
    const t2 = new Date(d2Str + 'T00:00:00Z').getTime();
    if (isNaN(t1) || isNaN(t2)) return 0;
    return Math.round((t2 - t1) / (1000 * 60 * 60 * 24));
  }

  /**
   * Formats a Date object to YYYY-MM-DD.
   *
   * @private
   * @param {Date} date
   * @returns {string}
   */
  _formatIsoDate(date) {
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    const d = String(date.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  /**
   * Calculates the projected next billing date based on cadence and latest date.
   *
   * @param {string} lastDateStr - Last transaction date.
   * @param {import('../types').SubscriptionCadence} cadence - Detected cadence.
   * @returns {string} Projected next billing date (YYYY-MM-DD).
   */
  calculateNextExpectedDate(lastDateStr, cadence) {
    const dt = new Date(lastDateStr + 'T00:00:00Z');
    if (isNaN(dt.getTime())) return lastDateStr;

    switch (cadence) {
      case 'weekly':
        dt.setUTCDate(dt.getUTCDate() + 7);
        break;
      case 'bi-weekly':
        dt.setUTCDate(dt.getUTCDate() + 14);
        break;
      case 'monthly': {
        const curDay = dt.getUTCDate();
        dt.setUTCMonth(dt.getUTCMonth() + 1);
        // Handle month-end clamping (e.g. Jan 31 -> Feb 28)
        if (dt.getUTCDate() !== curDay) {
          dt.setUTCDate(0); // Last day of previous month
        }
        break;
      }
      case 'quarterly':
        dt.setUTCMonth(dt.getUTCMonth() + 3);
        break;
      case 'annual':
        dt.setUTCFullYear(dt.getUTCFullYear() + 1);
        break;
      default:
        dt.setUTCDate(dt.getUTCDate() + 30);
    }

    return this._formatIsoDate(dt);
  }

  /**
   * Calculates median value of an array of positive numbers.
   *
   * @param {number[]} numbers
   * @returns {number}
   */
  _calculateMedian(numbers) {
    if (!numbers || numbers.length === 0) return 0;
    const sorted = [...numbers].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2 !== 0) {
      return sorted[mid];
    }
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }

  // ==========================================================================
  // 2. Cadence & Price Hike Detection Engine
  // ==========================================================================

  /**
   * Evaluates a chronologically sorted sequence of transactions for recurring subscription patterns.
   *
   * @param {string} merchant - Normalized merchant name.
   * @param {any[]} txs - Chronological transactions for this merchant.
   * @param {object} options - Evaluation options.
   * @returns {import('../types').SubscriptionItem|null}
   */
  _evaluateMerchantGroup(merchant, txs, options) {
    if (txs.length < 2) return null;

    const amountDriftTol = options.amountDriftTolerance !== undefined ? options.amountDriftTolerance : 0.08;
    const priceHikeThreshold = options.priceHikeThreshold !== undefined ? options.priceHikeThreshold : 0.05;

    // Calculate inter-transaction day deltas
    const intervals = [];
    for (let i = 0; i < txs.length - 1; i++) {
      const delta = this._daysDifference(txs[i].date, txs[i + 1].date);
      if (delta > 0) {
        intervals.push(delta);
      }
    }

    if (intervals.length === 0) return null;

    // Find the best matching cadence among supported patterns
    let bestCadence = null;
    let bestCadenceMatches = 0;
    let bestIntervalConfig = null;

    for (const [cadenceKey, cfg] of Object.entries(CADENCE_CONFIG)) {
      let matches = 0;
      for (const intv of intervals) {
        if (intv >= cfg.minDays && intv <= cfg.maxDays) {
          matches++;
        }
      }

      // Check if at least majority of intervals match this cadence
      if (matches > bestCadenceMatches && matches >= Math.ceil(intervals.length * 0.5)) {
        bestCadence = cadenceKey;
        bestCadenceMatches = matches;
        bestIntervalConfig = cfg;
      }
    }

    if (!bestCadence || !bestIntervalConfig) return null;

    // Verify minimum occurrences constraint
    const minOcc = options.minOccurrences || bestIntervalConfig.defaultMinOccurrences;
    if (txs.length < minOcc) return null;

    // Amount Analysis & Baseline Determination
    const amounts = txs.map(t => (typeof t.amount === 'number' ? t.amount : parseFloat(t.amount) || 0));
    const validAmounts = amounts.filter(a => a > 0);
    if (validAmounts.length < 2) return null;

    // The baseline amount is computed from all earlier occurrences (excluding latest if evaluating hike)
    const earlierAmounts = validAmounts.slice(0, validAmounts.length - 1);
    const baselineAmount = this._calculateMedian(earlierAmounts.length > 0 ? earlierAmounts : validAmounts);
    const latestAmount = validAmounts[validAmounts.length - 1];

    // Check amount consistency across historical charges within tolerance (excluding potential hike)
    let amountConsistentCount = 0;
    for (const amt of earlierAmounts) {
      const diffPct = Math.abs(amt - baselineAmount) / (baselineAmount || 1);
      if (diffPct <= amountDriftTol) {
        amountConsistentCount++;
      }
    }

    // Historical consistency ratio must be at least 70%
    const consistencyRatio = earlierAmounts.length > 0 ? amountConsistentCount / earlierAmounts.length : 1.0;
    if (consistencyRatio < 0.70) return null;

    // Price Hike Detection: If latest amount exceeds historical baseline by >= 5%
    let hasPriceHike = false;
    let priceHikeDetails = null;

    if (latestAmount > baselineAmount * (1 + priceHikeThreshold)) {
      hasPriceHike = true;
      const hikeDifference = Math.round((latestAmount - baselineAmount) * 100) / 100;
      const hikePercent = Math.round(((latestAmount - baselineAmount) / baselineAmount) * 100 * 10) / 10;
      const annualHikeImpact = Math.round(hikeDifference * bestIntervalConfig.annualMultiplier * 100) / 100;

      priceHikeDetails = {
        hasPriceHike: true,
        previousAmount: baselineAmount,
        currentAmount: latestAmount,
        hikePercent,
        hikeDifference,
        annualHikeImpact
      };
    }

    // Interval Consistency & Regularity Score
    const meanInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const intervalVariance =
      intervals.reduce((sum, v) => sum + (v - meanInterval) * (v - meanInterval), 0) / intervals.length;
    const intervalStdDev = Math.sqrt(intervalVariance);
    const intervalScore = Math.max(0, 1 - intervalStdDev / bestIntervalConfig.targetDays);

    // Composite Confidence Metric
    const occurrenceBonus = Math.min(0.20, (txs.length - minOcc) * 0.05);
    const confidence = Math.min(1.0, Math.round((intervalScore * 0.5 + consistencyRatio * 0.3 + 0.2 + occurrenceBonus) * 100) / 100);

    const minConfidence = options.minConfidence !== undefined ? options.minConfidence : 0.60;
    if (confidence < minConfidence) return null;

    // Annual Cost Projections
    const annualCost = Math.round(latestAmount * bestIntervalConfig.annualMultiplier * 100) / 100;
    const monthlyCost = Math.round((annualCost / 12) * 100) / 100;
    const lastDate = txs[txs.length - 1].date;
    const nextExpectedDate = this.calculateNextExpectedDate(lastDate, bestCadence);

    // Zombie / Dormant Subscription Heuristic:
    // Active for >= 60 days, >= 3 occurrences, zero manual notes or receipt attachments
    const firstDate = txs[0].date;
    const spanDays = this._daysDifference(firstDate, lastDate);
    let isZombie = false;
    let zombieReason = null;

    const hasNotesOrReceipt = txs.some(
      t =>
        (typeof t.notes === 'string' && t.notes.trim().length > 0) ||
        (typeof t.description === 'string' && t.description.trim().length > 0) ||
        Boolean(t.receiptFilename)
    );

    if (spanDays >= 60 && txs.length >= 3 && !hasNotesOrReceipt) {
      isZombie = true;
      zombieReason = `Active for ${spanDays} days with ${txs.length} recurring automated charges and zero manual notes or attachments.`;
    }

    const deterministicId = `sub-${merchant.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${bestCadence}`;

    return {
      id: deterministicId,
      merchant,
      cadence: bestCadence,
      occurrencesCount: txs.length,
      averageAmount: Math.round((validAmounts.reduce((a, b) => a + b, 0) / validAmounts.length) * 100) / 100,
      lastAmount: latestAmount,
      lastDate,
      nextExpectedDate,
      annualCost,
      monthlyCost,
      confidence,
      hasPriceHike,
      priceHikeDetails,
      isZombie,
      zombieReason,
      expenseIds: txs.map(t => t.id).filter(Boolean)
    };
  }

  // ==========================================================================
  // 3. Public Master Scan Method
  // ==========================================================================

  /**
   * Scans an array of ledger expenses, detecting recurring subscriptions, price hikes,
   * annual recurring commitments, and zombie charges.
   *
   * @param {any[]} rawExpenses - Array of transaction objects.
   * @param {object} [options={}] - Scan configuration options.
   * @returns {import('../types').SubscriptionDetectionResult}
   */
  detectSubscriptions(rawExpenses, options = {}) {
    if (!Array.isArray(rawExpenses) || rawExpenses.length === 0) {
      return {
        subscriptions: [],
        summary: {
          totalSubscriptions: 0,
          totalMonthlyCommitment: 0,
          totalAnnualCommitment: 0,
          priceHikesDetected: 0,
          zombieCount: 0
        }
      };
    }

    // 1. Group valid expenses by normalized merchant name
    const merchantGroups = Object.create(null);

    for (let i = 0; i < rawExpenses.length; i++) {
      const exp = rawExpenses[i];
      if (!exp || typeof exp !== 'object') continue;

      const amt = typeof exp.amount === 'number' ? exp.amount : parseFloat(exp.amount);
      if (isNaN(amt) || !isFinite(amt) || amt <= 0) continue;
      if (!exp.date || typeof exp.date !== 'string') continue;

      const title = exp.title || exp.payee || exp.merchant || 'Unknown';
      const normMerchant = this.normalizeMerchant(title);

      if (!merchantGroups[normMerchant]) {
        merchantGroups[normMerchant] = [];
      }
      merchantGroups[normMerchant].push(exp);
    }

    // 2. Evaluate each merchant group chronologically
    const subscriptions = [];

    for (const [merchant, txs] of Object.entries(merchantGroups)) {
      if (txs.length < 2) continue;

      // Sort ascending by date
      txs.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

      const detected = this._evaluateMerchantGroup(merchant, txs, options);
      if (detected) {
        subscriptions.push(detected);
      }
    }

    // Sort subscriptions descending by annual cost (highest commitment first)
    subscriptions.sort((a, b) => b.annualCost - a.annualCost);

    // 3. Compile aggregate summary
    let totalMonthlyCommitment = 0;
    let totalAnnualCommitment = 0;
    let priceHikesDetected = 0;
    let zombieCount = 0;

    for (const sub of subscriptions) {
      totalMonthlyCommitment += sub.monthlyCost;
      totalAnnualCommitment += sub.annualCost;
      if (sub.hasPriceHike) priceHikesDetected++;
      if (sub.isZombie) zombieCount++;
    }

    return {
      subscriptions,
      summary: {
        totalSubscriptions: subscriptions.length,
        totalMonthlyCommitment: Math.round(totalMonthlyCommitment * 100) / 100,
        totalAnnualCommitment: Math.round(totalAnnualCommitment * 100) / 100,
        priceHikesDetected,
        zombieCount
      }
    };
  }
}

module.exports = SubscriptionHunterService;
