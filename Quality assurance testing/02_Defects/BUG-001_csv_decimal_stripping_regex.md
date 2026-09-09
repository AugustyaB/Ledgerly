# 🐛 Defect Report: BUG-001

> **Defect ID**: `BUG-001`  
> **Title**: Statement File Importer Regex Strips Decimal Points from Transaction Amounts  
> **Component**: `src/fileImporter.js`  
> **Severity**: **P0 — Blocker (Data Corruption)**  
> **Found By**: Antigravity Lead QA  
> **Date Logged**: September 8, 2026  
> **Status**: 🟢 RESOLVED in `v0.4.6`  
> **Resolution Date**: September 8, 2026  

---

## 1. Defect Summary

When parsing bank statements in CSV or Excel format, the file importer uses a regular expression character set that includes a literal period (`.`). In JavaScript regex, a period inside square brackets `[...]` matches the dot character literally.

Consequently, any amount with decimal fractions (e.g. `78.45`, `42.50`) has its decimal point stripped completely before `parseFloat` is invoked, transforming `$78.45` into `$7845.00` and `$42.50` into `$4250.00`.

---

## 2. Affected Code Locations

In [`src/fileImporter.js`](file:///e:/AG_saves/App%20Idea%20-%20Expense%20Logger/src/fileImporter.js):

### Location 1 (CSV Parser, Line 177):
```javascript
// Line 177:
let amountStr = getVal(bestMapping.amountCol).replace(/[₹$Rs.INR,\s]/gi, '');
let amount = parseFloat(amountStr);
```

### Location 2 (Excel Parser, Line 251):
```javascript
// Line 251:
let amountStr = getVal(bestMapping.amountCol).replace(/[₹$Rs.INR,\s]/gi, '');
let amount = parseFloat(amountStr);
```

---

## 3. Reproduction Steps

1. Create a test CSV file `test_bank.csv` with content:
   ```csv
   Date,Description,Amount,Category
   2026-08-10,"Whole Foods Market",78.45,"Food & Dining"
   ```
2. Execute file parse via `fileImporter.parseFile('test_bank.csv')`.
3. Inspect `result.expenses[0].amount`.
4. **Actual Result**: `7845`
5. **Expected Result**: `78.45`

---

## 4. Impact & Risk Analysis

* **Data Integrity**: Massive financial corruption. An imported monthly spending total of \$1,200.50 will be logged into the database as \$120,050.00.
* **User Trust**: Total collapse of user confidence upon first bank import.
* **Why it was missed previously**: In `scratch/test_phase5.js:L73`, the test asserted `console.assert(csvResult.expenses[0].amount === 78.45)`. In Node.js, `console.assert()` prints an assertion message to stderr but does not throw or fail the test script.

---

## 5. Recommended Code Fix

Replace the flawed character class with an explicit, safe currency stripper that preserves numeric digits, minus signs, and the decimal point:

```javascript
// Safe sanitization preserving decimal point and negative signs
let rawVal = getVal(bestMapping.amountCol);
// 1. Remove currency symbols and country codes
let cleaned = rawVal.replace(/[₹$€£,]/g, '').replace(/\b(INR|USD|EUR|Rs\.?)\b/gi, '').trim();
// 2. Parse float safely
let amount = Math.abs(parseFloat(cleaned));
```

---

## 6. Resolution & Verification (v0.4.6)

- **Implementation**: Updated `src/fileImporter.js` lines 194 and 280 with `replace(/(?:INR|USD|EUR|Rs\.?|[₹$€£,()])/gi, '').trim()`, correctly preserving decimal points while cleanly stripping currency symbols, labels, and accounting parentheses.
- **Verification**: Covered by automated test `[1] BUG-001: CSV with decimals preserves exact numeric amounts` in `scratch/test_phase6_resilience.js`. Verified amounts `$78.45`, `₹1,234.56`, `(45.20)`, and `Rs. 99.99` parse with exact decimal float precision.

