# 🐛 Defect Report: BUG-004

> **Defect ID**: `BUG-004`  
> **Title**: Test Scripts Use Non-Throwing `console.assert()`, Masking Regressions  
> **Component**: `scratch/test_phase5.js`, test scripts  
> **Severity**: **P2 — Medium (Test Rigor & CI Masking)**  
> **Found By**: Antigravity Lead QA  
> **Date Logged**: September 8, 2026  
> **Status**: 🟢 RESOLVED in `v0.4.6`  
> **Resolution Date**: September 8, 2026  

---

## 1. Defect Summary

In Node.js, `console.assert(condition, message)` writes an error string to `stderr` if the condition is falsy, but **does not throw an AssertionError** and **does not set `process.exitCode = 1`**.

As observed during our empirical test run of `scratch/test_phase5.js`:
```text
2. Testing CSV File Parser...
Assertion failed: Amount should match
✅ CSV Parser: PASSED
...
🎉 ALL PHASE 5 EMPIRICAL TESTS PASSED (6/6)
```

Even though the assertion failed because `7845 !== 78.45`, the test runner happily printed `✅ CSV Parser: PASSED` and exited with return code `0`!

---

## 2. Impact & Risk Analysis

* **False Sense of Security**: Automated CI/CD pipelines will report green passes even when core functional calculations are broken.
* **Regression Masking**: Developers can introduce breaking changes without any test runner halting execution.

---

## 3. Recommended Code Fix

1. Standardize on Node's native `assert` module:
   ```javascript
   const assert = require('node:assert/strict');

   // Instead of:
   // console.assert(csvResult.expenses[0].amount === 78.45, 'Amount should match');

   // Use:
   assert.strictEqual(csvResult.expenses[0].amount, 78.45, 'CSV amount must match decimal figure');
   ```
2. Any assertion mismatch will throw immediately and exit with non-zero status.

---

## 4. Resolution & Verification (v0.4.6)

- **Implementation**: Replaced non-throwing `console.assert` calls with strict `assert.strictEqual` / `assert.ok` from `node:assert/strict` across test scripts. All assertion failures throw `AssertionError` with exit code `1`.
- **Verification**: Verified in `scratch/test_phase5.js` and `scratch/test_phase6_resilience.js` where all assertions are enforced with throwing strict equality checks.

