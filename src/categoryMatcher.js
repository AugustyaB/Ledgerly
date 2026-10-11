// Smart Merchant Auto-Categorization & Keyword Learning Engine (Offline)

const KEYWORD_CATEGORY_MAP = {
  'Food & Dining': [
    'swiggy',
    'zomato',
    'starbucks',
    'chai',
    'coffee',
    'tea',
    'lunch',
    'dinner',
    'breakfast',
    'burger',
    'pizza',
    'blinkit',
    'zepto',
    'instamart',
    'kirana',
    'groceries',
    'supermarket',
    'restaurant',
    'cafe',
    'dhaba',
    'bakery',
    'subway',
    'mcdonalds',
    'kfc',
    'dominos',
    'biryani',
    'sweets',
    'fruits',
    'vegetables',
    'milk',
    'bread',
    'dairy',
    'snacks'
  ],
  Transportation: [
    'uber',
    'ola',
    'rapido',
    'petrol',
    'fuel',
    'diesel',
    'cng',
    'auto',
    'cab',
    'taxi',
    'metro',
    'toll',
    'fastag',
    'parking',
    'flight',
    'airline',
    'train',
    'irctc',
    'bus',
    'redbus',
    'mechanic',
    'car wash',
    'service station',
    'puncture',
    'fuel pump',
    'shell',
    'hp fuel',
    'iocl'
  ],
  'Utilities & Bills': [
    'bescom',
    'electricity',
    'power bill',
    'wifi',
    'broadband',
    'airtel',
    'jio',
    'vi',
    'vodafone',
    'gas',
    'cylinder',
    'lpg',
    'indane',
    'hp gas',
    'water bill',
    'water tanker',
    'maid',
    'cook',
    'house help',
    'maintenance',
    'society maintenance',
    'rent',
    'garbage',
    'cable'
  ],
  'Subscriptions & Software': [
    'netflix',
    'spotify',
    'prime',
    'amazon prime',
    'hotstar',
    'disney',
    'youtube',
    'youtube premium',
    'github',
    'chatgpt',
    'openai',
    'apple',
    'icloud',
    'google one',
    'dropbox',
    'playstation',
    'xbox',
    'game pass',
    'audible',
    'notion',
    'adobe',
    'cursor',
    'medium',
    'times prime'
  ],
  'Healthcare & Wellness': [
    'pharmacy',
    'medicine',
    'apollo',
    '1mg',
    'pharmeasy',
    'medplus',
    'doctor',
    'clinic',
    'hospital',
    'dentist',
    'gym',
    'cult',
    'cultfit',
    'fitness',
    'yoga',
    'protein',
    'supplements',
    'therapy',
    'counseling',
    'lenskart',
    'spectacles',
    'medical lab',
    'blood test'
  ],
  'Shopping & Personal': [
    'amazon',
    'flipkart',
    'myntra',
    'ajio',
    'nykaa',
    'zara',
    'h&m',
    'uniqlo',
    'clothes',
    'shoes',
    'electronics',
    'croma',
    'reliance digital',
    'ikea',
    'decathlon',
    'salon',
    'barber',
    'haircut',
    'spa',
    'cosmetics',
    'perfume',
    'gift',
    'stationery'
  ],
  Entertainment: [
    'movie',
    'cinema',
    'pvr',
    'inox',
    'bookmyshow',
    'concert',
    'gaming',
    'bowling',
    'amusement park',
    'club',
    'pub',
    'bar',
    'party',
    'drinks',
    'event ticket'
  ],
  'Investment & Savings': [
    'mutual fund',
    'zerodha',
    'groww',
    'sip',
    'stocks',
    'gold',
    'fd',
    'fixed deposit',
    'rd',
    'crypto',
    'coin',
    'etf',
    'nps',
    'insurance',
    'lic',
    'term plan'
  ]
};

/**
 * Helper to match keyword with strict word boundary isolation to avoid false positive substring matches
 * (e.g. "VIELEN DANK" false matching telecom keyword "vi", or "snapple" matching "apple").
 * @param {string} text - Target text.
 * @param {string} keyword - Keyword pattern to match.
 * @returns {boolean}
 */
function matchesKeyword(text, keyword) {
  if (!text || !keyword) return false;
  const kw = keyword.trim().toLowerCase();
  if (!kw) return false;
  const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const startBoundary = /^[\p{L}\p{N}_]/u.test(kw) ? '(?<![\\p{L}\\p{N}_])' : '';
  const endBoundary = /[\p{L}\p{N}_]$/u.test(kw) ? '(?![\\p{L}\\p{N}_])' : '';
  const regex = new RegExp(`${startBoundary}${escaped}${endBoundary}`, 'iu');
  return regex.test(text);
}

class CategoryMatcher {
  constructor(customOverrides = {}) {
    this.customOverrides = customOverrides || {};
  }

  /**
   * Predicts the most likely category based on merchant or description text.
   * Checks custom user-trained keyword overrides first, then the built-in dictionary.
   * @param {string} titleText - Input transaction title or description.
   * @param {Object} [userKeywordsMap] - Optional map of user-defined overrides.
   * @returns {string|null} - Matching category name or null if no confident match.
   */
  predictCategory(titleText, userKeywordsMap = null) {
    if (!titleText || typeof titleText !== 'string') return null;

    const lower = titleText.toLowerCase().trim();
    const overrides = userKeywordsMap || this.customOverrides;

    // 1. Check User-Trained Overrides with Word Boundaries
    for (const [kw, category] of Object.entries(overrides)) {
      if (matchesKeyword(lower, kw)) {
        return category;
      }
    }

    // 2. Check Built-in Keyword Dictionary with Word Boundaries
    for (const [category, keywords] of Object.entries(KEYWORD_CATEGORY_MAP)) {
      for (const kw of keywords) {
        if (matchesKeyword(lower, kw)) {
          return category;
        }
      }
    }

    return null;
  }

  getAllCategories() {
    return Object.keys(KEYWORD_CATEGORY_MAP);
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    CategoryMatcher,
    KEYWORD_CATEGORY_MAP,
    matchesKeyword,
    predictCategory: (title, overrides) => new CategoryMatcher(overrides).predictCategory(title)
  };
}
