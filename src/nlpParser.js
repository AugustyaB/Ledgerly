// Natural Language Single-Bar Express Entry Parser ("1-Box Magic") (Offline Deterministic Engine)

const { CategoryMatcher } = require('./categoryMatcher');

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const DAY_SHORT = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

class NLPParser {
  constructor(categoryOverrides = {}) {
    this.categoryMatcher = new CategoryMatcher(categoryOverrides);
  }

  /**
   * Parses natural language input phrase into structured expense object.
   * e.g., "Swiggy 350 lunch with Priya upi yesterday"
   * @param {string} input - Unstructured natural language input.
   * @param {Array<string>} [knownMembers] - List of active household member names.
   * @returns {Object} Structured expense entry
   */
  parse(input, knownMembers = []) {
    if (!input || typeof input !== 'string' || !input.trim()) {
      return {
        success: false,
        rawInput: input,
        title: '',
        amount: null,
        category: 'Miscellaneous',
        paymentMethod: 'UPI / GPay',
        date: new Date().toISOString().split('T')[0],
        splitWith: [],
        isHouseholdExpense: false,
        tokens: {}
      };
    }

    let workingStr = input.trim();
    let detectedAmount = null;
    let detectedDate = new Date().toISOString().split('T')[0];
    let dateTokenStr = 'Today';
    let detectedPayment = 'UPI / GPay';
    let paymentTokenStr = '';
    let splitWithMembers = [];
    let isHousehold = false;
    let splitTokenStr = '';
    let detectedCategory;
    let detectedCurrency = '₹';

    // -------------------------------------------------------------------------
    // PASS 1: Amount Extraction (e.g. ₹350, 350.50, 1.2k, rs 500, $25, 17,39 €, 1.14 EUR)
    // -------------------------------------------------------------------------
    const amountRegex =
      /(?:(?:[₹$€£]|\b(?:rs\.?|inr|usd|eur|gbp)\b)\s*)?(\b\d+(?:[.,]\d{1,2})?(?:k|K)?)(?:\s*(?:[₹$€£]|\b(?:rs\.?|inr|usd|eur|gbp)\b)|\b)/i;
    const amountMatch = workingStr.match(amountRegex);
    if (amountMatch) {
      if (/€|\beur\b/i.test(amountMatch[0])) detectedCurrency = '€';
      else if (/\$|\busd\b/i.test(amountMatch[0])) detectedCurrency = '$';
      else if (/£|\bgbp\b/i.test(amountMatch[0])) detectedCurrency = '£';

      let numValStr = amountMatch[1].toLowerCase().replace(',', '.');
      if (numValStr.endsWith('k')) {
        detectedAmount = parseFloat(numValStr.replace('k', '')) * 1000;
      } else {
        detectedAmount = parseFloat(numValStr);
      }
      // Remove amount token from working string
      workingStr = workingStr.replace(amountMatch[0], ' ');
    }

    // -------------------------------------------------------------------------
    // PASS 2: Date Extraction (yesterday, today, tomorrow, -2d, weekday names)
    // -------------------------------------------------------------------------
    const today = new Date();
    const dateTokens = [
      {
        regex: /\b(yesterday|yday)\b/i,
        handler: () => {
          const d = new Date(today);
          d.setDate(d.getDate() - 1);
          return { date: d, label: 'Yesterday' };
        }
      },
      {
        regex: /\b(today)\b/i,
        handler: () => {
          return { date: new Date(today), label: 'Today' };
        }
      },
      {
        regex: /\b(tomorrow)\b/i,
        handler: () => {
          const d = new Date(today);
          d.setDate(d.getDate() + 1);
          return { date: d, label: 'Tomorrow' };
        }
      },
      {
        regex: /\b-(\d+)(?:d|days)?\b/i,
        handler: m => {
          const d = new Date(today);
          d.setDate(d.getDate() - parseInt(m[1], 10));
          return { date: d, label: `${m[1]}d ago` };
        }
      }
    ];

    for (const dt of dateTokens) {
      const match = workingStr.match(dt.regex);
      if (match) {
        const res = dt.handler(match);
        detectedDate = res.date.toISOString().split('T')[0];
        dateTokenStr = res.label;
        workingStr = workingStr.replace(match[0], ' ');
        break;
      }
    }

    // Check weekday names (e.g. "friday", "fri")
    for (let i = 0; i < 7; i++) {
      const full = DAY_NAMES[i];
      const short = DAY_SHORT[i];
      const dayRegex = new RegExp(`\\b(on\\s+)?(${full}|${short})\\b`, 'i');
      const match = workingStr.match(dayRegex);
      if (match) {
        const targetDayIndex = i;
        const currentDayIndex = today.getDay();
        let daysAgo = (currentDayIndex - targetDayIndex + 7) % 7;
        if (daysAgo === 0) daysAgo = 7; // Previous week's day if same day name
        const d = new Date(today);
        d.setDate(d.getDate() - daysAgo);
        detectedDate = d.toISOString().split('T')[0];
        dateTokenStr = full.charAt(0).toUpperCase() + full.slice(1);
        workingStr = workingStr.replace(match[0], ' ');
        break;
      }
    }

    // -------------------------------------------------------------------------
    // PASS 3: Household / Split Extraction ("with Priya", "split with Bob", "shared")
    // -------------------------------------------------------------------------
    const withMatch = workingStr.match(/\b(?:split\s+with|with|for)\s+([a-zA-Z0-9_\-&]+)/i);
    if (withMatch) {
      const memberName = withMatch[1].trim();
      splitWithMembers.push(memberName);
      isHousehold = true;
      splitTokenStr = `Shared with ${memberName}`;
      workingStr = workingStr.replace(withMatch[0], ' ');
    } else if (/\b(shared|joint|household|flatmates|roommates)\b/i.test(workingStr)) {
      isHousehold = true;
      splitTokenStr = 'Shared';
      workingStr = workingStr.replace(/\b(shared|joint|household|flatmates|roommates)\b/i, ' ');
    }

    // Check against known member names list
    if (Array.isArray(knownMembers)) {
      for (const m of knownMembers) {
        if (m.toLowerCase() === 'self') continue;
        const memberRegex = new RegExp(`\\b${m}\\b`, 'i');
        if (memberRegex.test(workingStr) && !splitWithMembers.includes(m)) {
          splitWithMembers.push(m);
          isHousehold = true;
          splitTokenStr = `Shared with ${m}`;
          workingStr = workingStr.replace(memberRegex, ' ');
        }
      }
    }

    // -------------------------------------------------------------------------
    // PASS 4: Payment Method Extraction (upi, gpay, cc, credit card, cash, debit)
    // -------------------------------------------------------------------------
    const payTokens = [
      { regex: /\b(upi|gpay|google\s*pay|phonepe|paytm|bhim)\b/i, method: 'UPI / GPay', label: 'UPI' },
      { regex: /\b(credit\s*card|cc|visa|mastercard|amex)\b/i, method: 'Credit Card', label: 'Credit Card' },
      { regex: /\b(debit\s*card|dc)\b/i, method: 'Debit Card', label: 'Debit Card' },
      { regex: /\b(net\s*banking|netbanking|neft|imps|rtgs)\b/i, method: 'Net Banking', label: 'Net Banking' },
      { regex: /\b(cash|notes|wallet)\b/i, method: 'Cash', label: 'Cash' }
    ];

    for (const pt of payTokens) {
      const match = workingStr.match(pt.regex);
      if (match) {
        detectedPayment = pt.method;
        paymentTokenStr = pt.label;
        workingStr = workingStr.replace(match[0], ' ');
        break;
      }
    }

    // -------------------------------------------------------------------------
    // PASS 5: Category Prediction & Title Resolution
    // -------------------------------------------------------------------------
    detectedCategory = this.categoryMatcher.predictCategory(input) || 'Food & Dining';

    // Clean up residual spaces and punctuation from working string to form Title
    let cleanedTitle = workingStr
      .replace(/[,\-_;:]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!cleanedTitle) {
      cleanedTitle = detectedCategory !== 'Miscellaneous' ? detectedCategory : 'Quick Expense';
    }

    // Capitalize first letter of title
    cleanedTitle = cleanedTitle.charAt(0).toUpperCase() + cleanedTitle.slice(1);

    return {
      success: detectedAmount !== null && !isNaN(detectedAmount) && detectedAmount > 0,
      rawInput: input,
      title: cleanedTitle,
      amount: detectedAmount || 0,
      category: detectedCategory,
      paymentMethod: detectedPayment,
      date: detectedDate,
      splitWith: splitWithMembers,
      isHouseholdExpense: isHousehold,
      tokens: {
        amountStr: detectedAmount ? `${detectedCurrency}${detectedAmount.toFixed(2)}` : `${detectedCurrency}0.00`,
        titleStr: cleanedTitle,
        categoryStr: detectedCategory,
        dateStr: dateTokenStr,
        paymentStr: paymentTokenStr || 'UPI / GPay',
        splitStr: splitTokenStr || (isHousehold ? 'Shared' : 'Personal')
      }
    };
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = NLPParser;
}
