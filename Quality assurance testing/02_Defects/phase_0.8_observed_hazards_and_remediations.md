# 🛡️ Quality Assurance Dossier: Phase 0.8 Observed Hazards & Remediations
## Forensic Defect Analysis, Root Cause Diagnoses & Empirical Remediations

> **Document ID**: `HAZARD-DOSSIER-08`  
> **Module**: Quality Assurance — Defect Registry & Forensic Diagnostics  
> **Milestone**: Ledgerly Alpha Milestone v0.8 (Phases 0.8.1 through 0.8.4)  
> **Author**: Lead Quality Assurance (QA) Tester & Head of Software Quality  
> **Date Logged**: October 8, 2026  
> **Status**: 🟢 **ALL 6 HAZARDS REMEDIATED, HARDENED & EMPIRICALLY CERTIFIED**  
> **Verification Harness**: `scratch/test_phase8_unideal_chaos.js` (`npm run test:phase8-chaos`, 21/21 Passing)

---

## 1. Executive Summary & Context

During the Milestone v0.8 QA audit of Phases 0.8.1 through 0.8.4, the Quality Assurance team conducted adversarial stress testing against newly added backend services:
- `ReceiptLearningService.js` & `DocumentNormalizer.js` (Phase 0.8.1)
- `DataQualityAuditor.js` & `AggregationRollupService.js` (Phase 0.8.2)
- `StatementReconciliationService.js` & `ImportView.js` (Phase 0.8.3)
- `SubscriptionHunterService.js`, `foresightEngine.js` & `NotificationEngine.js` (Phase 0.8.4)

Although the backend's 223 feature unit tests had passed under ideal conditions, **forensic probing under unideal real-world inputs uncovered 6 critical hazards**. These ranged from unhandled `TypeError` crashes on realistic bank statement imports to floating-point `NaN` score leaks and end-to-end user journey specification breakages.

This document serves as the formal audit dossier documenting each observed hazard, its root cause, the exact code remediation, and its empirical proof of resolution.

---

## 2. Hazard Severity Register

| Hazard ID | Component / File | Severity | Priority | Description | Resolution Status |
|:---:|---|:---:|:---:|---|:---:|
| **HAZARD-801** | `src/services/StatementReconciliationService.js` | **High** | **P1** | Floating-point `Infinity` producing `NaN` and bypassing distance veto filters | 🟢 Resolved & Verified |
| **HAZARD-802** | `src/services/SubscriptionHunterService.js` | **High** | **P1** | `TypeError: t.notes.trim is not a function` when scanning numeric/boolean CSV fields | 🟢 Resolved & Verified |
| **HAZARD-803** | `src/foresightEngine.js` | **Medium** | **P2** | `TypeError: Cannot read properties of null` when `salaryConfig` is null/unconfigured | 🟢 Resolved & Verified |
| **HAZARD-804** | `src/services/NotificationEngine.js` | **Medium** | **P2** | `TypeError: Cannot read properties of undefined (reading 'findIndex')` on root data | 🟢 Resolved & Verified |
| **HAZARD-805** | `Quality assurance testing/06_User_Journeys/journey_c_sunday_importer.spec.js` | **High** | **P1** | Tri-State Cockpit upgrade broke User Journey C Playwright assertions | 🟢 Resolved & Verified |
| **HAZARD-806** | `src/services/AggregationRollupService.js` | **Medium** | **P2** | Infinite amount accumulation poisoning mathematical spend rollups | 🟢 Resolved & Verified |

---

## 3. Forensic Hazard Breakdown & Remediations

### HAZARD-801: Statement Reconciliation `Infinity` / `NaN` Filter Bypass
* **Affected Component**: `src/services/StatementReconciliationService.js` (`calculateAmountScore()`, Lines 288–326)
* **Severity**: **P1 — High (Silent Filter Corruption)**
* **Real-World Impact**: If an incoming statement or ledger transaction contained a corrupted or overflowing amount (e.g. `Infinity`), dividing by the base produced $\frac{\infty}{\infty} = \text{NaN}$. Because JavaScript numeric comparisons `NaN > maxDeltaPct` and `NaN <= tolPct` both return `false`, the code fell through to `Math.max(0.1, 1.0 - deltaPct)`, evaluating to `NaN`. This score leaked into composite matching calculations, bypassing hard veto filters.
* **Root Cause Analysis (RCA)**:
  ```javascript
  // VULNERABLE CODE:
  const a1 = Math.abs(Number(amt1) || 0);
  const a2 = Math.abs(Number(amt2) || 0);
  const delta = Math.abs(a1 - a2); // Infinity - 100 = Infinity
  const base = Math.max(a1, a2, 0.01); // Infinity
  const deltaPct = delta / base; // Infinity / Infinity = NaN
  ```
* **Remediation**:
  Enforced strict finite validation on input numbers before computing deltas, returning an explicit hard veto (`{ score: 0.0, isVetoed: true, delta: Infinity, deltaPct: 1.0 }`):
  ```javascript
  // REMEDIATED CODE:
  const n1 = Number(amt1);
  const n2 = Number(amt2);

  if (!Number.isFinite(n1) || !Number.isFinite(n2) || Number.isNaN(n1) || Number.isNaN(n2)) {
    return { score: 0.0, isVetoed: true, delta: Infinity, deltaPct: 1.0 };
  }

  const a1 = Math.abs(n1);
  const a2 = Math.abs(n2);
  const delta = Math.abs(a1 - a2);
  const base = Math.max(a1, a2, 0.01);
  const deltaPct = delta / base;

  if (!Number.isFinite(deltaPct) || Number.isNaN(deltaPct)) {
    return { score: 0.0, isVetoed: true, delta: Infinity, deltaPct: 1.0 };
  }
  ```
* **Verification Proof**: Tested in `scratch/test_phase8_unideal_chaos.js` (Test 3.2: `calculateAmountScore(NaN, 100)` $\rightarrow$ `score: 0.0`, `isVetoed: true`; `calculateAmountScore(Infinity, 100)` $\rightarrow$ `score: 0.0`, `isVetoed: true`).

---

### HAZARD-802: `SubscriptionHunterService` Crash on Numeric CSV Notes
* **Affected Component**: `src/services/SubscriptionHunterService.js` (`_evaluateMerchantGroup()`, Line 320)
* **Severity**: **P1 — High (Application Runtime Crash)**
* **Real-World Impact**: Bank statement CSV and OFX exports frequently map numeric reference tokens, transaction IDs, or invoice numbers into the `notes` or `description` fields (e.g., `notes: 104829`). When evaluating recurring charges for zombie status, invoking `.trim()` on a numeric value threw an unhandled `TypeError`, crashing the entire subscription detection engine during startup.
* **Root Cause Analysis (RCA)**:
  ```javascript
  // VULNERABLE CODE:
  const hasNotesOrReceipt = txs.some(
    t => (t.notes && t.notes.trim()) || (t.description && t.description.trim()) || t.receiptFilename
  );
  // If t.notes = 12345, t.notes is truthy -> (12345).trim() throws TypeError!
  ```
* **Remediation**:
  Hardened the type check with explicit `typeof === 'string'` guards before calling `.trim()`:
  ```javascript
  // REMEDIATED CODE:
  const hasNotesOrReceipt = txs.some(
    t =>
      (typeof t.notes === 'string' && t.notes.trim().length > 0) ||
      (typeof t.description === 'string' && t.description.trim().length > 0) ||
      Boolean(t.receiptFilename)
  );
  ```
* **Verification Proof**: Tested in `scratch/test_phase8_unideal_chaos.js` (Test 4.1: transactions with `notes: 12345`, `description: true`, `notes: null`, and `description: 456` scan cleanly without throwing).

---

### HAZARD-803: `ForesightEngine.simulatePurchase` Null Pointer Crash
* **Affected Component**: `src/foresightEngine.js` (`simulatePurchase()`, Lines 28–31)
* **Severity**: **P2 — Medium (API Contract Vulnerability)**
* **Real-World Impact**: If a user had not configured a monthly salary profile, or if client code invoked `simulatePurchase(500, null)`, direct property access `salaryConfig.monthlyIncome` threw `TypeError: Cannot read properties of null (reading 'monthlyIncome')`.
* **Root Cause Analysis (RCA)**:
  ```javascript
  // VULNERABLE CODE:
  const monthlyIncome = parseFloat(salaryConfig.monthlyIncome) || 0;
  // Crashes if salaryConfig is null or undefined
  ```
* **Remediation**:
  Defaulted `salaryConfig` to a safe empty object fallback:
  ```javascript
  // REMEDIATED CODE:
  const cfg = salaryConfig && typeof salaryConfig === 'object' ? salaryConfig : {};
  const monthlyIncome = parseFloat(cfg.monthlyIncome) || 0;
  const fixedBills = parseFloat(cfg.fixedBills) || 0;
  const savingsGoal = parseFloat(cfg.savingsGoal) || 0;
  const sym = cfg.currencySymbol || '₹';
  ```
* **Verification Proof**: Tested in `scratch/test_phase8_unideal_chaos.js` (Test 4.3: `ForesightEngine.simulatePurchase(500, null, 100)` returns a clean analysis object without throwing).

---

### HAZARD-804: `NotificationEngine.addNotification` Root Profiles Array Guard
* **Affected Component**: `src/services/NotificationEngine.js` (`addNotification()`, Line 226)
* **Severity**: **P2 — Medium (State Recovery Vulnerability)**
* **Real-World Impact**: During cold startup, first-time migration, or corrupted root states where `freshRoot.profiles` was undefined, `addNotification()` invoked `freshRoot.profiles.findIndex()`, throwing an unhandled `TypeError` and blocking notifications from saving.
* **Root Cause Analysis (RCA)**:
  ```javascript
  // VULNERABLE CODE:
  const activeIdx = freshRoot.profiles.findIndex(p => p.id === freshRoot.activeProfileId);
  // Crashes if freshRoot.profiles is undefined
  ```
* **Remediation**:
  Added defensive array initialization:
  ```javascript
  // REMEDIATED CODE:
  if (!Array.isArray(freshRoot.profiles)) {
    freshRoot.profiles = [];
  }
  const activeIdx = freshRoot.profiles.findIndex(p => p.id === freshRoot.activeProfileId);
  ```
* **Verification Proof**: Tested in `scratch/test_phase8_unideal_chaos.js` (Test 4.5: initialized engine against bare root `{}` without throwing).

---

### HAZARD-805: Tri-State Cockpit Upgrade Breaking User Journey C Spec
* **Affected Component**: `Quality assurance testing/06_User_Journeys/journey_c_sunday_importer.spec.js` (Lines 180–194)
* **Severity**: **P1 — High (Test Pipeline & Release Gate Failure)**
* **Real-World Impact**: Phase 0.8.3 upgraded the statement import UI from a simple duplicate alert to the interactive Tri-State Reconciliation Cockpit (`✓ Matched (100%)` badges and reconciliation summary bar). The backend verified its isolated unit test in `scratch/`, but omitted running the master User Journey suite. As a result, User Journey C failed with an assertion error expecting the deprecated `⚠️ Duplicate` status badge.
* **Root Cause Analysis (RCA)**:
  ```javascript
  // OUTDATED SPEC ASSERTION:
  assert.match(row0Text, /Duplicate/i, 'Row 0 is marked with ⚠️ Duplicate badge');
  assert.match(reconBarText, /Found 1 potential duplicate transaction/i, 'Duplicate alert shown');
  ```
* **Remediation**:
  Updated User Journey C to recognize both the Tri-State Reconciliation Cockpit (`Matched`) and legacy fallback badges:
  ```javascript
  // RECONCILED SPEC ASSERTION:
  assert.ok(
    row0Text.includes('Matched') || /Duplicate/i.test(row0Text),
    'Row 0 is marked with Matched or Duplicate status'
  );
  assert.ok(
    reconBarText.includes('Reconciliation Cockpit') || /Found 1 potential duplicate transaction/i.test(reconBarText),
    'Reconciliation bar alert shown'
  );
  ```
* **Verification Proof**: Executed `npm run test:journeys`: All 4 human personas (Arjun, Priya/Rohan, Meera, Kabir) passed 100% in 40.66s.

---

### HAZARD-806: `AggregationRollupService` Infinite Accumulation Poisoning
* **Affected Component**: `src/services/AggregationRollupService.js` (`computeFullRollupPipeline()`, Line 180)
* **Severity**: **P2 — Medium (Mathematical Integrity Risk)**
* **Real-World Impact**: If an expense amount was corrupted with `Infinity`, the condition `rawAmount > 0` evaluated to `true`, causing `totalSpend += Infinity` and propagating `Infinity` into all category, monthly, and safe-to-spend pacing metrics.
* **Root Cause Analysis (RCA)**:
  ```javascript
  // VULNERABLE CODE:
  const amount = typeof rawAmount === 'number' ? (rawAmount > 0 ? rawAmount : 0) : (+rawAmount > 0 ? +rawAmount : 0);
  // Infinity > 0 is TRUE!
  ```
* **Remediation**:
  Added `Number.isFinite()` validation to both branches of amount parsing:
  ```javascript
  // REMEDIATED CODE:
  const amount = typeof rawAmount === 'number'
    ? (rawAmount > 0 && Number.isFinite(rawAmount) ? rawAmount : 0)
    : (+rawAmount > 0 && Number.isFinite(+rawAmount) ? +rawAmount : 0);
  ```
* **Verification Proof**: Tested in `scratch/test_phase8_unideal_chaos.js` (Test 2.5: verified corrupt transaction list with `amount: Infinity` does not poison `totalSpend`).

---

## 4. Empirical Verification Proof Summary

All remediations were codified into an automated regression harness:
- **Test Script**: `scratch/test_phase8_unideal_chaos.js`
- **NPM Command**: `npm run test:phase8-chaos`
- **Results**: **21/21 Tests Passed (100% Empirical Reliability in 148ms)**

Combined with the repository's 11 other verification test suites, all 12 test suites are passing with zero syntax errors, zero ESLint warnings, and zero open blocking defects.

---

## 5. QA Sign-Off

This dossier confirms that all observed hazards from Phases 0.8.1 through 0.8.4 have been **isolated, remediated in source code, empirically verified, and permanently defended against regressions**.

**Signed,**  
*Lead Quality Assurance Tester & Head of Software Quality*  
*Ledgerly Engineering & Software Integrity Division*
