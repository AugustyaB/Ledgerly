/**
 * ============================================================================
 * Ledgerly — RegionalIntelligenceRegistry (Tier 3 Regional Knowledge Packs)
 * ============================================================================
 *
 * @fileoverview
 * Declarative regional packs and deterministic validation heads for Tier 3
 * specialist models in Ledgerly (Version 0.5.7).
 *
 * DESIGN PRINCIPLES:
 * - 100% Local Inference & Zero Native Dependencies: Pure JavaScript regex,
 *   Trie/Levenshtein matching, and statutory checksum algorithms.
 * - 4 Core Regions: India (in), North America (us), Europe/UK (eu), Australia & Japan (apac).
 * - Multi-Factor Anchors: Merchant directories, local payment rails, utility discom
 *   schemas, statutory business IDs, and localized date/number formats.
 */

'use strict';

// ============================================================================
// 1. Regional Merchant Knowledge Graph (Top Chains & Categories)
// ============================================================================

/**
 * Top regional retailers, chains, and category mappings.
 * @readonly
 */
const REGIONAL_MERCHANTS = Object.freeze({
  in: [
    { canonical: 'D-Mart', aliases: ['dmart', 'd mart', 'avenue supermarts'], category: 'Groceries & Supermarket' },
    {
      canonical: 'Reliance Smart',
      aliases: ['reliance smart', 'reliance fresh', 'reliance retail'],
      category: 'Groceries & Supermarket'
    },
    { canonical: 'Blinkit', aliases: ['blinkit', 'grofers'], category: 'Groceries & Supermarket' },
    { canonical: 'Zepto', aliases: ['zepto', 'kirana kart'], category: 'Groceries & Supermarket' },
    { canonical: 'Swiggy Instamart', aliases: ['swiggy instamart', 'swiggy'], category: 'Groceries & Supermarket' },
    { canonical: 'Zomato', aliases: ['zomato'], category: 'Food & Dining' },
    {
      canonical: 'Apollo Pharmacy',
      aliases: ['apollo pharmacy', 'apollo hospitals'],
      category: 'Healthcare & Medical'
    },
    { canonical: 'MedPlus', aliases: ['medplus', 'medplus pharmacy'], category: 'Healthcare & Medical' },
    { canonical: 'IndianOil', aliases: ['indianoil', 'iocl', 'indian oil'], category: 'Fuel & Transportation' },
    { canonical: 'HPCL', aliases: ['hpcl', 'hindustan petroleum'], category: 'Fuel & Transportation' },
    { canonical: 'BPCL', aliases: ['bpcl', 'bharat petroleum'], category: 'Fuel & Transportation' },
    { canonical: 'Croma', aliases: ['croma', 'infiniti retail'], category: 'Electronics & Gadgets' },
    { canonical: 'Vijay Sales', aliases: ['vijay sales'], category: 'Electronics & Gadgets' }
  ],
  us: [
    {
      canonical: 'Costco Wholesale',
      aliases: ['costco', 'costco wholesale', 'costco whse'],
      category: 'Groceries & Supermarket'
    },
    { canonical: 'Target', aliases: ['target', 'super target', 'target store'], category: 'Groceries & Supermarket' },
    {
      canonical: 'Walmart',
      aliases: ['walmart', 'wal-mart', 'walmart supercenter', 'sams club'],
      category: 'Groceries & Supermarket'
    },
    { canonical: "Trader Joe's", aliases: ['trader joe', 'trader joes'], category: 'Groceries & Supermarket' },
    {
      canonical: 'Kroger',
      aliases: ['kroger', 'ralphs', "fry's", 'fred meyer', 'safeway', 'whole foods'],
      category: 'Groceries & Supermarket'
    },
    { canonical: 'CVS Pharmacy', aliases: ['cvs', 'cvs pharmacy', 'cvs/pharmacy'], category: 'Healthcare & Medical' },
    { canonical: 'Walgreens', aliases: ['walgreens', 'duane reade'], category: 'Healthcare & Medical' },
    { canonical: 'Home Depot', aliases: ['home depot', 'the home depot'], category: 'Home & Utilities' },
    { canonical: "Lowe's", aliases: ["lowe's", 'lowes'], category: 'Home & Utilities' },
    { canonical: 'Chevron', aliases: ['chevron', 'chevron with techron'], category: 'Fuel & Transportation' },
    { canonical: 'Shell', aliases: ['shell oil', 'shell service'], category: 'Fuel & Transportation' },
    { canonical: 'ExxonMobil', aliases: ['exxon', 'mobil', 'exxonmobil'], category: 'Fuel & Transportation' },
    { canonical: 'Starbucks', aliases: ['starbucks', 'starbucks coffee'], category: 'Food & Dining' }
  ],
  eu: [
    {
      canonical: 'Tesco',
      aliases: ['tesco', 'tesco extra', 'tesco metro', 'tesco express'],
      category: 'Groceries & Supermarket'
    },
    {
      canonical: "Sainsbury's",
      aliases: ['sainsbury', 'sainsburys', "sainsbury's"],
      category: 'Groceries & Supermarket'
    },
    { canonical: 'Aldi', aliases: ['aldi', 'aldi sued', 'aldi nord'], category: 'Groceries & Supermarket' },
    { canonical: 'Lidl', aliases: ['lidl', 'lidl stiftung'], category: 'Groceries & Supermarket' },
    {
      canonical: 'Carrefour',
      aliases: ['carrefour', 'carrefour express', 'carrefour market'],
      category: 'Groceries & Supermarket'
    },
    { canonical: 'Edeka', aliases: ['edeka'], category: 'Groceries & Supermarket' },
    { canonical: 'Rewe', aliases: ['rewe'], category: 'Groceries & Supermarket' },
    { canonical: 'Boots', aliases: ['boots', 'boots uk', 'boots pharmacy'], category: 'Healthcare & Medical' },
    { canonical: 'Marks & Spencer', aliases: ['marks & spencer', 'm&s', 'm & s'], category: 'Groceries & Supermarket' },
    { canonical: 'TotalEnergies', aliases: ['total', 'totalenergies'], category: 'Fuel & Transportation' },
    { canonical: 'BP', aliases: ['bp connect', 'bp oil uk'], category: 'Fuel & Transportation' },
    { canonical: 'IKEA', aliases: ['ikea'], category: 'Home & Utilities' }
  ],
  apac: [
    {
      canonical: 'Woolworths',
      aliases: ['woolworths', 'woolworths metro', 'woolies'],
      category: 'Groceries & Supermarket'
    },
    {
      canonical: 'Coles',
      aliases: ['coles', 'coles express', 'coles supermarket'],
      category: 'Groceries & Supermarket'
    },
    { canonical: 'Bunnings Warehouse', aliases: ['bunnings', 'bunnings warehouse'], category: 'Home & Utilities' },
    { canonical: 'Chemist Warehouse', aliases: ['chemist warehouse'], category: 'Healthcare & Medical' },
    { canonical: 'Kmart Australia', aliases: ['kmart', 'kmart australia'], category: 'Shopping' },
    { canonical: 'Ampol', aliases: ['ampol', 'caltex'], category: 'Fuel & Transportation' },
    {
      canonical: '7-Eleven Japan',
      aliases: ['7-eleven', '7 eleven', 'seven eleven', 'セブン-イレブン', 'セブンイレブン'],
      category: 'Groceries & Supermarket'
    },
    { canonical: 'Lawson', aliases: ['lawson', 'ローソン', 'natural lawson'], category: 'Groceries & Supermarket' },
    {
      canonical: 'FamilyMart',
      aliases: ['familymart', 'family mart', 'ファミリーマート'],
      category: 'Groceries & Supermarket'
    },
    {
      canonical: 'Don Quijote',
      aliases: ['don quijote', 'donki', 'ドン・キホーテ', 'ドンキホーテ'],
      category: 'Shopping'
    },
    { canonical: 'Aeon', aliases: ['aeon', 'aeon style', 'イオン'], category: 'Groceries & Supermarket' },
    {
      canonical: 'Matsumoto Kiyoshi',
      aliases: ['matsumoto kiyoshi', 'matsukiyo', 'マツモトキヨシ'],
      category: 'Healthcare & Medical'
    }
  ]
});

// ============================================================================
// 2. Local Payment Rails & Transaction Identifiers
// ============================================================================

/**
 * Local popular payment rails, regex patterns, and identifiers.
 * @readonly
 */
const REGIONAL_PAYMENT_RAILS = Object.freeze({
  in: [
    { name: 'UPI / PhonePe', pattern: /\b(?:phonepe|ybl|ibl)\b/i, isUpi: true },
    { name: 'UPI / Google Pay', pattern: /\b(?:google\s*pay|gpay|okhdfcbank|okaxis|okicici|oksbi)\b/i, isUpi: true },
    { name: 'UPI / Paytm', pattern: /\b(?:paytm(?:\s*payments)?|paytmqr)\b/i, isUpi: true },
    { name: 'UPI / CRED', pattern: /\b(?:cred(?:\s*pay)?)\b/i, isUpi: true },
    { name: 'UPI / BHIM', pattern: /\b(?:bhim(?:\s*upi)?)\b/i, isUpi: true },
    { name: 'UPI', pattern: /\b(?:upi(?:\s*id)?|vpa|utr(?:\s*no)?)\b/i, isUpi: true },
    { name: 'Sodexo / Pluxee', pattern: /\b(?:sodexo|pluxee)\b/i, isUpi: false },
    { name: 'RuPay Card', pattern: /\brupay\b/i, isUpi: false }
  ],
  us: [
    { name: 'Apple Pay', pattern: /\b(?:apple\s*pay|device\s*account\s*number|dan[:\s]*\d{4})\b/i },
    { name: 'Venmo', pattern: /\b(?:venmo|@(?:[a-zA-Z0-9_-]{3,30}))\b/i },
    { name: 'Cash App', pattern: /\b(?:cash\s*app|\$(?:[a-zA-Z0-9_-]{1,30}))\b/i },
    { name: 'Zelle', pattern: /\b(?:zelle|zelle\s*confirmation)\b/i },
    { name: 'PayPal', pattern: /\bpaypal\b/i },
    { name: 'Interac e-Transfer', pattern: /\b(?:interac(?:\s*e-transfer|\s*debit)?)\b/i },
    { name: 'Credit Card (Visa)', pattern: /\b(?:visa|visa\s*credit|visa\s*debit)\b/i },
    { name: 'Credit Card (Mastercard)', pattern: /\b(?:mastercard|master\s*card)\b/i },
    { name: 'Credit Card (Amex)', pattern: /\b(?:amex|american\s*express)\b/i },
    { name: 'Credit Card (Discover)', pattern: /\bdiscover\b/i }
  ],
  eu: [
    { name: 'SEPA Direct Debit', pattern: /\b(?:sepa(?:\s*direct\s*debit|\s*lastschrift|\s*prelevement)?)\b/i },
    { name: 'Faster Payments', pattern: /\b(?:faster\s*payments?|fpo)\b/i },
    { name: 'BACS Transfer', pattern: /\bbacs\b/i },
    { name: 'Contactless Card', pattern: /\b(?:contactless|contactless\s*visa|contactless\s*mc)\b/i },
    { name: 'iDEAL', pattern: /\bideal\b/i },
    { name: 'Bizum', pattern: /\bbizum\b/i },
    { name: 'Swish', pattern: /\bswish\b/i },
    { name: 'Klarna / Sofort', pattern: /\b(?:klarna|sofort(?:\s*ueberweisung)?)\b/i },
    { name: 'Bancontact', pattern: /\bbancontact\b/i }
  ],
  apac: [
    { name: 'BPAY', pattern: /\b(?:bpay|biller\s*code|customer\s*ref(?:erence)?)\b/i },
    { name: 'PayID', pattern: /\bpayid\b/i },
    { name: 'Afterpay', pattern: /\bafterpay\b/i },
    { name: 'EFTPOS', pattern: /\beftpos\b/i },
    { name: 'PayPay', pattern: /\b(?:paypay|ペイペイ)\b/i },
    { name: 'Line Pay', pattern: /\b(?:line\s*pay|ラインペイ)\b/i },
    { name: 'Suica / Pasmo (IC Card)', pattern: /\b(?:suica|pasmo|スイカ|パスモ|交通系ic)\b/i },
    { name: 'QUICPay / iD', pattern: /\b(?:quicpay|id\s*決済)\b/i },
    { name: 'Konbini Payment', pattern: /\b(?:コンビニ決済|払込票|領収証書)\b/i }
  ]
});

// ============================================================================
// 3. Regional Utility Discom & Bill Layout Schemas
// ============================================================================

/**
 * Recognizes regional electricity, gas, water, and telecom bills.
 * @readonly
 */
const REGIONAL_UTILITIES = Object.freeze({
  in: {
    discomKeywords: [
      'bescom',
      'tata power',
      'msedcl',
      'adani electricity',
      'bses',
      'cesc',
      'torrent power',
      'igl',
      'mahanagar gas',
      'bwssb'
    ],
    accountRegex:
      /\b(?:consumer\s*(?:no|number|id)|ca\s*no|k\s*no|rr\s*no|account\s*(?:no|number))[:\s]*([0-9A-Z]{6,16})\b/i,
    billingPeriodRegex:
      /\b(?:bill(?:ing)?\s*period|period)[:\s]*([0-9]{1,2}[/-][0-9]{1,2}[/-][0-9]{2,4})\s*(?:to|-)\s*([0-9]{1,2}[/-][0-9]{1,2}[/-][0-9]{2,4})/i,
    dueDateRegex: /\b(?:due\s*date|pay\s*by)[:\s]*([0-9]{1,2}[/-][0-9]{1,2}[/-][0-9]{2,4})\b/i,
    unitsRegex: /\b(?:units(?:\s*consumed)?|consumption)[:\s]*([0-9]+(?:\.[0-9]+)?)\s*(?:kwh|units)?\b/i,
    defaultUnit: 'kWh'
  },
  us: {
    discomKeywords: [
      'con edison',
      'coned',
      'consolidated edison',
      'pacific gas',
      'pg&e',
      'pge',
      'duke energy',
      'national grid',
      'southern california edison',
      'sce',
      'florida power',
      'fpl',
      'eversource',
      'at&t',
      'verizon',
      'xfinity'
    ],
    accountRegex: /\b(?:account\s*(?:number|no|#)|customer\s*id)[:\s]*([0-9A-Z\-_/]{6,24})\b/i,
    billingPeriodRegex:
      /\b(?:bill(?:ing)?\s*period|service\s*period|period)[:\s]*([A-Za-z]{3}\s*[0-9]{1,2},?\s*[0-9]{0,4})\s*(?:to|-)\s*([A-Za-z]{3}\s*[0-9]{1,2},?\s*[0-9]{4})/i,
    dueDateRegex:
      /\b(?:due\s*(?:date|by|upon\s*receipt)|total\s*due\s*by)[:\s]*([A-Za-z]{3}\s*[0-9]{1,2},?\s*[0-9]{4}|[0-9]{1,2}[/-][0-9]{1,2}[/-][0-9]{2,4})\b/i,
    unitsRegex: /\b([0-9]+(?:\.[0-9]+)?)\s*(kwh|therms?|gallons?|ccf)\b/i,
    defaultUnit: 'kWh'
  },
  eu: {
    discomKeywords: [
      'british gas',
      'edf energy',
      'edf',
      'e.on',
      'eon',
      'scottish power',
      'sse',
      'octopus energy',
      'enel',
      'iberdrola',
      'engie',
      'thames water'
    ],
    accountRegex:
      /\b(?:account\s*(?:number|no|ref)|customer\s*(?:number|ref)|kundennummer|reference\s*client)[:\s]*([0-9A-Z]{7,18})\b/i,
    mpanRegex:
      /\b(?:mpan|supply\s*number)[:\s]*([0-9]{2}\s*[0-9]{3}\s*[0-9]{3}\s*[0-9]{2}\s*[0-9]{4}\s*[0-9]{4}\s*[0-9]{3})\b/i,
    mprnRegex: /\b(?:mprn|gas\s*meter\s*point)[:\s]*([0-9]{6,10})\b/i,
    billingPeriodRegex:
      /\b(?:bill(?:ing)?\s*period|period)[:\s]*([0-9]{1,2}[/-][0-9]{1,2}[/-][0-9]{2,4})\s*(?:to|-)\s*([0-9]{1,2}[/-][0-9]{1,2}[/-][0-9]{2,4})/i,
    dueDateRegex: /\b(?:payment\s*due|due\s*date|faellig\s*am)[:\s]*([0-9]{1,2}[/-][0-9]{1,2}[/-][0-9]{2,4})\b/i,
    unitsRegex: /\b([0-9]+(?:[.,][0-9]+)?)\s*(kwh|m³|m3)\b/i,
    defaultUnit: 'kWh'
  },
  apac: {
    discomKeywords: [
      'energyaustralia',
      'origin energy',
      'agl',
      'energy australia',
      'telstra',
      'optus',
      'synergy',
      'actewagl',
      'tepco',
      'tokyo gas',
      'kansai electric',
      'osaka gas',
      '東京電力',
      '東京ガス'
    ],
    accountRegex: /\b(?:account\s*(?:number|no)|customer\s*ref(?:erence)?|お客様番号)[:\s]*([0-9]{5,15})\b/i,
    nmiRegex: /\b(?:nmi|national\s*meter\s*(?:identifier|id))(?:\s*\([a-z0-9]+\))?[:\s]*([0-9A-Z]{10,11})\b/i,
    bpayBillerRegex: /\b(?:biller\s*code)[:\s]*([0-9]{4,6})\b/i,
    bpayRefRegex: /\b(?:reference|ref|customer\s*ref)[:\s]*([0-9]{6,18})\b/i,
    billingPeriodRegex:
      /\b(?:bill(?:ing)?\s*period|period|ご使用期間)[:\s]*([0-9]{1,2}\s*[A-Za-z]{3}\s*[0-9]{0,4}|[0-9]{1,2}[/-][0-9]{1,2}[/-][0-9]{2,4})\s*(?:to|-|～)\s*([0-9]{1,2}\s*[A-Za-z]{3}\s*[0-9]{4}|[0-9]{1,2}[/-][0-9]{1,2}[/-][0-9]{2,4})/i,
    dueDateRegex:
      /\b(?:due\s*date|pay\s*by|お支払い期限)[:\s]*([0-9]{1,2}\s*[A-Za-z]{3}\s*[0-9]{4}|[0-9]{1,2}[/-][0-9]{1,2}[/-][0-9]{2,4})\b/i,
    unitsRegex: /\b([0-9]+(?:\.[0-9]+)?)\s*(kwh|mj|ご使用量)\b/i,
    defaultUnit: 'kWh'
  }
});

// ============================================================================
// 4. Statutory Tax & Business ID Mathematical Validators
// ============================================================================

/**
 * Validates an Australian Business Number (ABN) using the statutory ATO Modulus 89 algorithm.
 *
 * Algorithm:
 * 1. Subtract 1 from the first digit.
 * 2. Multiply each of the 11 digits by its designated weight: [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19].
 * 3. Sum the products.
 * 4. Verify that sum % 89 === 0.
 *
 * @param {string} abnStr - Raw ABN string (with or without spaces).
 * @returns {boolean} True if mathematically valid ABN.
 */
function validateAustralianAbn(abnStr) {
  if (!abnStr) return false;
  const cleaned = abnStr.replace(/[^0-9]/g, '');
  if (cleaned.length !== 11) return false;

  const weights = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];
  const digits = cleaned.split('').map(d => parseInt(d, 10));
  digits[0] -= 1; // Step 1

  let sum = 0;
  for (let i = 0; i < 11; i++) {
    sum += digits[i] * weights[i];
  }

  return sum % 89 === 0;
}

/**
 * Validates an Indian GSTIN format and state code.
 *
 * @param {string} gstinStr - 15-character GSTIN.
 * @returns {{ valid: boolean, stateCode: string|null, pan: string|null }}
 */
function validateIndianGstin(gstinStr) {
  if (!gstinStr) return { valid: false, stateCode: null, pan: null };
  const cleaned = gstinStr.trim().toUpperCase();
  const GSTIN_REGEX = /\b([0-3][0-9])([A-Z]{5}[0-9]{4}[A-Z])([1-9A-Z])(Z)([0-9A-Z])\b/;
  const match = cleaned.match(GSTIN_REGEX);
  if (!match) return { valid: false, stateCode: null, pan: null };

  return {
    valid: true,
    stateCode: match[1],
    pan: match[2]
  };
}

/**
 * Validates US Employer Identification Number (EIN) format.
 * Format: XX-XXXXXXX with valid IRS prefix.
 *
 * @param {string} einStr
 * @returns {boolean}
 */
function validateUsEin(einStr) {
  if (!einStr) return false;
  const trimmed = String(einStr).trim();
  // Valid format: XX-XXXXXXX or XXXXXXXXX
  if (!/^\d{2}-?\d{7}$/.test(trimmed)) return false;

  const cleaned = trimmed.replace('-', '');
  if (cleaned.length !== 9) return false;

  const prefix = parseInt(cleaned.substring(0, 2), 10);
  // Known valid IRS campus prefixes
  const validPrefixes = [
    1, 2, 3, 4, 5, 6, 10, 11, 12, 13, 14, 15, 16, 20, 21, 22, 23, 24, 25, 26, 27, 30, 31, 32, 33, 34, 35, 36, 37, 38,
    39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68,
    71, 72, 73, 74, 75, 76, 77, 80, 81, 82, 83, 84, 85, 86, 87, 88, 90, 91, 92, 93, 94, 95, 98, 99
  ];
  return validPrefixes.includes(prefix);
}

/**
 * Validates Japan Qualified Invoice System Registration Number (T-Number).
 * Format: 'T' followed by 13 digits.
 *
 * @param {string} tNumStr
 * @returns {boolean}
 */
function validateJapanTNumber(tNumStr) {
  if (!tNumStr) return false;
  const match = tNumStr.match(/\bT([0-9]{13})\b/i);
  return Boolean(match);
}

/**
 * Validates European VIES VAT Number format.
 * Format: 2-letter ISO country code + 8-12 alphanumeric characters.
 *
 * @param {string} vatStr
 * @returns {boolean}
 */
function validateEuropeVat(vatStr) {
  if (!vatStr) return false;
  const cleaned = vatStr.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  const VIES_REGEX =
    /^(ATU[0-9]{8}|BE[0-9]{10}|BG[0-9]{9,10}|CY[0-9]{8}[A-Z]|CZ[0-9]{8,10}|DE[0-9]{9}|DK[0-9]{8}|EE[0-9]{9}|EL[0-9]{9}|ES[0-9A-Z][0-9]{7}[0-9A-Z]|FI[0-9]{8}|FR[0-9A-Z]{2}[0-9]{9}|GB[0-9]{9}|HR[0-9]{11}|HU[0-9]{8}|IE[0-9]{7}[A-W][A-I]?|IT[0-9]{11}|LT[0-9]{9,12}|LU[0-9]{8}|LV[0-9]{11}|MT[0-9]{8}|NL[0-9]{9}B[0-9]{2}|PL[0-9]{10}|PT[0-9]{9}|RO[0-9]{2,10}|SE[0-9]{12}|SI[0-9]{8}|SK[0-9]{10})$/;
  return VIES_REGEX.test(cleaned);
}

// ============================================================================
// 5. Regional Resolution Helper Functions
// ============================================================================

/**
 * Resolves merchant from text against regional directory.
 *
 * @param {string} rawText
 * @param {'in'|'us'|'eu'|'apac'} region
 * @returns {{ matched: boolean, canonical: string|null, category: string|null }}
 */
function resolveRegionalMerchant(rawText, region = 'us') {
  if (!rawText) return { matched: false, canonical: null, category: null };
  const lower = rawText.toLowerCase();
  const merchants = REGIONAL_MERCHANTS[region] || [];

  for (const m of merchants) {
    for (const alias of m.aliases) {
      if (lower.includes(alias)) {
        return {
          matched: true,
          canonical: m.canonical,
          category: m.category
        };
      }
    }
  }

  return { matched: false, canonical: null, category: null };
}

/**
 * Extracts payment method using regional payment rail patterns.
 *
 * @param {string} rawText
 * @param {'in'|'us'|'eu'|'apac'} region
 * @returns {{ paymentMethod: string, isRegionalRail: boolean, details: Object }}
 */
function extractRegionalPayment(rawText, region = 'us') {
  const rails = REGIONAL_PAYMENT_RAILS[region] || [];
  for (const rail of rails) {
    if (rail.pattern.test(rawText)) {
      const details = {};

      // Extract specific identifiers
      if (rail.name.includes('Apple Pay')) {
        const danMatch = rawText.match(/\b(?:account|dan|card|#)[:\s]*([0-9]{4})\b/i);
        if (danMatch) details.deviceAccount = danMatch[1];
      } else if (rail.name.includes('Venmo')) {
        const handleMatch = rawText.match(/@([a-zA-Z0-9_-]{3,30})/);
        if (handleMatch) details.venmoHandle = handleMatch[1];
      } else if (rail.name.includes('Cash App')) {
        const tagMatch = rawText.match(/\$([a-zA-Z0-9_-]{1,30})/);
        if (tagMatch) details.cashtag = tagMatch[1];
      } else if (rail.name === 'BPAY') {
        const biller = rawText.match(/\b(?:biller\s*code)[:\s]*([0-9]{4,6})\b/i);
        const ref = rawText.match(/\b(?:reference|ref)[:\s]*([0-9]{6,18})\b/i);
        if (biller) details.billerCode = biller[1];
        if (ref) details.referenceNumber = ref[1];
      }

      return {
        paymentMethod: rail.name,
        isRegionalRail: true,
        details
      };
    }
  }

  return { paymentMethod: 'Other', isRegionalRail: false, details: {} };
}

/**
 * Extracts regional utility bill parameters if bill is a utility invoice.
 *
 * @param {string} rawText
 * @param {string[]} lines
 * @param {'in'|'us'|'eu'|'apac'} region
 * @returns {Object|null}
 */
function extractRegionalUtility(rawText, lines, region = 'us') {
  const schema = REGIONAL_UTILITIES[region];
  if (!schema) return null;

  const lower = rawText.toLowerCase();
  const isUtilityDiscom = schema.discomKeywords.some(kw => lower.includes(kw));
  const hasUtilityTokens =
    /\b(?:electricity|electric|water|natural\s*gas|power|broadband|energy|bill(?:ing)?\s*period)\b/i.test(rawText);

  if (!isUtilityDiscom && !hasUtilityTokens) {
    return null;
  }

  const result = {
    isUtility: true,
    region,
    accountNumber: null,
    billingPeriod: null,
    dueDate: null,
    unitsConsumed: null,
    consumption: null,
    unitType: schema.defaultUnit,
    meterUnit: schema.defaultUnit,
    discom: null
  };

  // 1. Detect provider
  const CANONICAL_DISCOMS = {
    'con edison': 'Con Edison',
    coned: 'Con Edison',
    'consolidated edison': 'Con Edison',
    bescom: 'BESCOM',
    energyaustralia: 'EnergyAustralia',
    'energy australia': 'EnergyAustralia',
    'british gas': 'British Gas'
  };

  for (const kw of schema.discomKeywords) {
    if (lower.includes(kw)) {
      result.discom = CANONICAL_DISCOMS[kw] || kw.charAt(0).toUpperCase() + kw.slice(1);
      break;
    }
  }

  // 2. Account / Consumer Number
  if (schema.accountRegex) {
    const accMatch = rawText.match(schema.accountRegex);
    if (accMatch) result.accountNumber = accMatch[1].trim();
  }

  // 3. Billing Period
  if (schema.billingPeriodRegex) {
    const periodMatch = rawText.match(schema.billingPeriodRegex);
    if (periodMatch) {
      result.billingPeriod = {
        start: periodMatch[1].trim(),
        end: periodMatch[2].trim()
      };
    }
  }

  // 4. Due Date
  if (schema.dueDateRegex) {
    const dueMatch = rawText.match(schema.dueDateRegex);
    if (dueMatch) result.dueDate = dueMatch[1].trim();
  }

  // 5. Units consumed
  if (schema.unitsRegex) {
    const unitMatch = rawText.match(schema.unitsRegex);
    if (unitMatch) {
      const val = parseFloat(unitMatch[1].replace(',', '.'));
      let unit = schema.defaultUnit;
      if (unitMatch[2]) {
        unit = unitMatch[2];
        if (unit.toUpperCase() === 'KWH') unit = 'kWh';
      }
      result.unitsConsumed = val;
      result.consumption = val;
      result.unitType = unit;
      result.meterUnit = unit;
    }
  }

  // 6. Australia / UK specific meter supply points
  if (region === 'apac' && schema.nmiRegex) {
    const nmiMatch = rawText.match(schema.nmiRegex);
    if (nmiMatch) result.nmi = nmiMatch[1].trim();
    if (schema.bpayBillerRegex) {
      const bpayMatch = rawText.match(schema.bpayBillerRegex);
      if (bpayMatch) result.bpayBillerCode = bpayMatch[1].trim();
    }
  } else if (region === 'eu') {
    if (schema.mpanRegex) {
      const mpanMatch = rawText.match(schema.mpanRegex);
      if (mpanMatch) result.mpan = mpanMatch[1].replace(/\s+/g, '');
    }
    if (schema.mprnRegex) {
      const mprnMatch = rawText.match(schema.mprnRegex);
      if (mprnMatch) result.mprn = mprnMatch[1].trim();
    }
  }

  return result;
}

/**
 * Parses monetary value with regional decimal comma / period conventions.
 * In Europe: comma is decimal ('1.250,50' -> 1250.50).
 * In US/India/APAC: period is decimal ('1,250.50' -> 1250.50).
 *
 * @param {string} str
 * @param {'in'|'us'|'eu'|'apac'} region
 * @returns {number}
 */
function parseRegionalMonetary(str, region = 'us') {
  if (!str) return 0;
  let cleaned = String(str)
    .replace(/[₹$€£¥A$\s]/g, '')
    .trim();

  if (region === 'eu') {
    // If has both '.' and ',', like '1.250,50', remove '.' and replace ',' with '.'
    if (cleaned.includes('.') && cleaned.includes(',')) {
      cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    } else if (cleaned.includes(',') && !cleaned.includes('.')) {
      // Like '12,50' -> 12.50
      cleaned = cleaned.replace(',', '.');
    }
  } else {
    // US / India / APAC standard
    if (cleaned.includes(',') && cleaned.includes('.')) {
      cleaned = cleaned.replace(/,/g, '');
    } else if (cleaned.includes(',') && !cleaned.includes('.')) {
      // Potential comma as decimal or thousands separator
      if (/\b\d{1,3},\d{2}\b/.test(cleaned)) {
        // likely decimal comma if only 2 decimal places
        cleaned = cleaned.replace(',', '.');
      } else {
        cleaned = cleaned.replace(/,/g, '');
      }
    }
  }

  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : Math.round(num * 100) / 100;
}

/**
 * Disambiguates date string into YYYY-MM-DD format based on regional convention.
 * - 'us': MM/DD/YYYY
 * - 'in', 'eu', 'apac' (except Japan YYYY/MM/DD): DD/MM/YYYY
 * - 'apac' (Japan): YYYY/MM/DD or YYYY年MM月DD日
 *
 * @param {string} dateStr
 * @param {'in'|'us'|'eu'|'apac'} [region='us']
 * @returns {string|null} ISO date string (YYYY-MM-DD)
 */
function disambiguateRegionalDate(dateStr, region = 'us') {
  if (!dateStr) return null;
  const str = String(dateStr).trim();

  // Japanese kanji format: 2024年06月18日
  const jpKanji = str.match(/(?:^|[^\d])(20\d{2})年(\d{1,2})月(\d{1,2})日/);
  if (jpKanji) {
    return `${jpKanji[1]}-${jpKanji[2].padStart(2, '0')}-${jpKanji[3].padStart(2, '0')}`;
  }

  // Japanese / ISO format: YYYY/MM/DD or YYYY-MM-DD
  const ymd = str.match(/\b(20\d{2})[/-](\d{1,2})[/-](\d{1,2})\b/);
  if (ymd) {
    return `${ymd[1]}-${ymd[2].padStart(2, '0')}-${ymd[3].padStart(2, '0')}`;
  }

  // 2-part / 3-part slashed or hyphenated: Part1 / Part2 / Year
  const partsMatch = str.match(/\b(\d{1,2})[/-](\d{1,2})[/-]((?:20)?\d{2})\b/);
  if (partsMatch) {
    const p1 = parseInt(partsMatch[1], 10);
    const p2 = parseInt(partsMatch[2], 10);
    let year = partsMatch[3];
    if (year.length === 2) year = `20${year}`;

    if (region === 'us') {
      // MM/DD/YYYY
      const month = String(Math.min(12, Math.max(1, p1))).padStart(2, '0');
      const day = String(Math.min(31, Math.max(1, p2))).padStart(2, '0');
      return `${year}-${month}-${day}`;
    } else {
      // DD/MM/YYYY (India, EU, Australia)
      const day = String(Math.min(31, Math.max(1, p1))).padStart(2, '0');
      const month = String(Math.min(12, Math.max(1, p2))).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
  }

  return null;
}

module.exports = {
  REGIONAL_MERCHANTS,
  REGIONAL_PAYMENT_RAILS,
  REGIONAL_UTILITIES,
  validateAustralianAbn,
  validateIndianGstin,
  validateUsEin,
  validateJapanTNumber,
  validateEuropeVat,
  resolveRegionalMerchant,
  extractRegionalPayment,
  extractRegionalUtility,
  parseRegionalMonetary,
  disambiguateRegionalDate
};
