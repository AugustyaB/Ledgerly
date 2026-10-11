# 🛡️ QA Subsystem Audit Report: Milestone v0.8 (Phases 0.8.1 – 0.8.4)
## On-Device Receipt Intelligence, Data Foundation, Fuzzy Deduplication & Smart Insights

**Audit Date:** October 8, 2026  
**Auditor:** Lead Quality Assurance (QA) Tester & Head of Software Quality  
**Scope:** Milestone v0.8 Subsystem Lifecycle across Phases 0.8.1 through 0.8.4  
- Phase 0.8.1: Adaptive Receipt Vision Pipeline & Learning Loop  
- Phase 0.8.2: Exploratory Data Analysis (EDA) & Data Foundation Scaffolding  
- Phase 0.8.3: Smart Statement Reconciliation (Fuzzy Deduplication Engine)  
- Phase 0.8.4: Smart Insights & Behavioral Notifications  
**Milestone Target:** Alpha Milestone v0.8 (`v0.8.1` – `v0.8.4`)  
**Verdict:** 🟢 **OFFICIALLY PASSED & CERTIFIED WITH EMPIRICAL SIGN-OFF (Zero Open Blocking Defects)**

---

## 1. Executive Summary & QA Mandate

Following the completion of backend and frontend deliverables across Phases 0.8.1 through 0.8.4, the Quality Assurance team conducted an exhaustive, adversarial, and empirical audit. 

In strict adherence to our mandate against "laboratory happy-path bias", this audit did not merely re-run developer test fixtures under ideal inputs. It actively subjected newly introduced services to **unideal real-world conditions, dirty inputs, extreme boundaries, hardware timeout limits, and failure modes**.

### Key Findings & Remediations:
During adversarial probing, our forensic analysis uncovered **6 concrete non-ideal hazards**:
1. **`calculateAmountScore` Floating-Point / `Infinity` NaN Hazard** in `StatementReconciliationService`: Passing `Infinity` or non-numeric values resulted in `NaN` score propagation and bypassed distance thresholds rather than triggering a clean veto.
2. **`SubscriptionHunterService` Non-String Crash Hazard (`t.notes.trim`)**: Evaluating zombie recurring charges against un-sanitized CSV imports containing numeric notes (e.g. invoice or reference IDs `104829`) threw an unhandled `TypeError: t.notes.trim is not a function`.
3. **`ForesightEngine.simulatePurchase` Parameter Vulnerability**: Invoking What-If simulation with a null or missing `salaryConfig` crashed with `TypeError: Cannot read properties of null (reading 'monthlyIncome')`.
4. **`NotificationEngine.addNotification` Root Profile Array Hazard**: In corrupted root configurations or during schema migrations, `freshRoot.profiles.findIndex` threw an uncaught error if `profiles` was not an array.
5. **Phase 0.8.3 Tri-State Reconciliation Cockpit Breaking User Journey C**: The transition to the Tri-State Reconciliation Cockpit rendered `✓ Matched (100%)` badges and updated the reconciliation summary bar, breaking legacy test assertions expecting the old `⚠️ Duplicate` status badge.
6. **`AggregationRollupService` Infinite Accumulation Poisoning**: Passing `Infinity` amount bypassed `> 0` sanity checks and poisoned mathematical spend rollups.

**All 6 hazards were systematically patched, verified, and locked with regression tests in `scratch/test_phase8_unideal_chaos.js` (`npm run test:phase8-chaos`).**

---

## 2. Empirical Verification Test Evidence

All 12 automated verification test suites across Milestone v0.8 and preceding regression baselines were executed sequentially and verified with 100% empirical pass rates:

| Suite # | Verification Suite | Command | Exec Time | Assertions / Coverage | Status |
|:---:|---|---|:---:|---|:---:|
| **1** | Phase 0.8.1 Receipt Vision & Learning | `npm run test:receipt-vision` | 135ms | 72/72 tests (Confidence, Aliases, Layout Memory, Normalizer) | ✅ **PASSED** |
| **2** | Phase 0.8.2 EDA & Data Foundation | `npm run test:eda-foundation` | 185ms | 112/112 tests (DataQualityAuditor, Rollups, Versioned Schemas) | ✅ **PASSED** |
| **3** | Phase 0.8.3 Smart Statement Reconciliation | `npm run test:fuzzy-reconciliation` | 67ms | 17/17 tests (Fuzzy multi-signal, 1-to-1 Bipartite, Timeout guard) | ✅ **PASSED** |
| **4** | Phase 0.8.4 Smart Insights & Notifications | `npm run test:smart-insights` | 75ms | 22/22 tests (Cadences, Drift, Price Hikes, What-If Data-Gate) | ✅ **PASSED** |
| **5** | **Phase 0.8 Unideal Conditions & Chaos Suite** | `npm run test:phase8-chaos` | 148ms | 21/21 tests (Adversarial inputs, NaN/Inf traps, Immutability) | ✅ **PASSED** |
| **6** | Master User Journeys & Accuracy (A, B, C, D) | `npm run test:journeys` | 40.66s | 4 Personas + 100% accuracy on INR/EUR statement & receipt ML | ✅ **PASSED** |
| **7** | Phase 0.7 Unideal Conditions & Chaos | `npm run test:unideal` | 145ms | 8/8 tests (Self-mirror, Aborted restore rollback, Date promotion) | ✅ **PASSED** |
| **8** | Partitioned Storage Engine (Phase 0.7.1) | `npm run test:partitioned-storage` | 118ms | 15/15 tests (Active/Archive partitions, Row count invariants) | ✅ **PASSED** |
| **9** | European Parsing & Currency (Phase 0.7.2) | `npm run test:phase7-2` | 134ms | 57/57 tests (Word boundaries, Comma decimals, DACH tax) | ✅ **PASSED** |
| **10** | Continuous Mirroring & Backup Vault (Phase 0.7.3) | `npm run test:mirroring` | 152ms | 11/11 tests (SHA-256 manifest, Disconnected drive, 1-Click restore) | ✅ **PASSED** |
| **11** | Monorepo Syntax Validation | `npm run check` | 3.82s | 60/60 JavaScript files in `src/` clean | ✅ **PASSED** |
| **12** | Monorepo Code Quality & Linting | `npm run lint` | 3.51s | 0 errors, 0 warnings across all files (`src/` & `mobile/src/`) | ✅ **PASSED** |

**Empirical Result: 12/12 Test Suites Passing (100% Reliability Across 380+ Test Scenarios).**

---

## 3. Forensic Subsystem Deep-Dive

### 3.1 Phase 0.8.1: Adaptive Receipt Vision Pipeline & Learning Loop
- **Merchant Alias Learning Loop (`ReceiptLearningService.js`)**:
  - Automatically captures user edits to extracted merchant names and registers them in `expenses_config.json`.
  - Normalizes vendor names stripping banking prefixes, store identifiers, and noise.
  - Substring prefix matching correctly maps store branches (e.g., `"Starbucks Coffee #104"` $\rightarrow$ `"Starbucks"`).
  - Verified that special regex characters in vendor titles (`"Walmart [Supercenter] (Store #104) *+?^${}|\\"`) do not trigger ReDoS or throw errors.
- **Field-Level Confidence Scoring (`ReceiptTier1Engine.js`)**:
  - Computes granular confidence ratings ($0.0$ to $1.0$) for `merchant`, `date`, `total`, and `tax`.
  - Flags any field scoring below $0.75$ in `lowConfidenceFields` to alert users in the UI Review Cockpit.
  - Mathematical balance verification: If $\text{subtotal} + \text{tax} = \text{total}$ (within $0.05$), both confidence ratings receive an automated positive boost.
- **Repeat Merchant Layout Memory**:
  - Vendor GSTIN or normalized merchant name is mapped to discovered structural anchors (e.g., total anchor keyword like `'NET PAYABLE'`, date pattern).
  - Subsequent receipts from the same vendor resolve with high confidence and bypass fallback heuristics.

### 3.2 Phase 0.8.2: Exploratory Data Analysis & Data Foundation Scaffolding
- **Pre-Processing Diagnostics & Non-Destructive Repair (`DataQualityAuditor.js`)**:
  - `DataQualityAuditor.isValidCalendarDate` strictly traps impossible calendar dates (e.g. `2026-02-29` non-leap year, `2026-04-31`, and month 13).
  - `DataQualityAuditor.parseAmount` deterministically parses European comma decimals (`1.250,50 €`), currency signs, negative amounts, and rejects non-finite primitives (`Infinity`, `NaN`).
  - `DataQualityAuditor.sanitize` strictly preserves the non-destructive immutability invariant: original user inputs are never mutated in-place; clean repaired copies are generated with complete changelogs.
- **High-Scale Mathematical Aggregation Rollup (`AggregationRollupService.js`)**:
  - Single-pass accumulator aggregates daily, weekly (ISO 8601), monthly, and category rollups in a single $O(N)$ traversal.
  - Processes $10,000$ transactions in **$3.48\text{ms}$** (category rollup) and **$9.74\text{ms}$** (comprehensive 4-way rollup), comfortably beating the $<30\text{ms}$ requirement.
  - In-memory memoization cache delivers hits in **$0.025\text{ms}$** ($<0.1\text{ms}$ requirement) with reactive cache invalidation hooked into `JsonDatabase.setOnDidWrite()`.
  - Hardened against infinite amount values (`Number.isFinite`), preventing accumulation poisoning.
- **Forward-Compatible Versioned Schemas (`FinancialIntelligenceFacade.js`)**:
  - Scaffolds versioned schemas `behavioralProfiles_v1` and `deduplicationSignatures_v1` in `expenses_config.json`.
  - Auto-migration preserves foreign keys (`merchantAliases`, `backupMirror`, etc.) without schema collision.

### 3.3 Phase 0.8.3: Smart Statement Reconciliation (Fuzzy Deduplication Engine)
- **Multi-Signal Composite Matching (`StatementReconciliationService.js`)**:
  - Amount tolerance window: Default $\pm 5\%$ linear penalty, small amount grace ($\le ₹50$ / $€1.00$), and hard veto for deltas $> 15\%$.
  - Date proximity scoring: Same-day ($1.0$), 24h delay ($0.90$), 48h clearing ($0.75$), 72h window ($0.50$), $> 72\text{h}$ veto ($0.0$).
  - String similarity: Blends normalized Levenshtein edit distance ($60\%$) and Token Jaccard index ($40\%$). String length capping at 64 characters prevents quadratic $O(L^2)$ computation on low-end hardware.
- **Quick-Add Protection Heuristics ("The Coffee Invariant")**:
  - Greedy maximum-weight 1-to-1 bipartite matching guarantees that intentional same-day duplicate entries (e.g., two coffees logged via quick-add widget) are never erroneously double-merged into a single bank statement row.
  - Verified under adversarial multi-candidate collision: 2 statement items matched against 3 identical same-day ledger items claimed 2 distinct ledger records with zero duplicate merging.
- **Hardware Timeout Guard**:
  - Protects low-spec CPU devices via configurable timeout guard (default $30,000\text{ms}$, testable at $0\text{ms}$).
  - When timed out, the engine gracefully transitions strategy to `'exact_fallback'` without dropping rows or throwing uncaught exceptions.
- **Resolution Application (`applyReconciliation`)**:
  - Enforces atomic application of `merge`, `import`, and `skip` actions.
  - Gracefully records missing target expense IDs into error arrays rather than corrupting the ledger.

### 3.4 Phase 0.8.4: Smart Insights & Behavioral Notifications
- **Offline Subscription Hunter (`SubscriptionHunterService.js`)**:
  - Detects repeating expenses across 5 distinct cadences: weekly (7d), bi-weekly (14d), monthly (30d), quarterly (91d), and annual (365d) with allowable jitter ($\pm 2$ to $\pm 7$ days).
  - Handles currency FX and tax drift ($\pm 8\%$) without dropping subscriptions.
  - Price hike detection: Identifies unannounced price spikes ($\ge 5\%$ over historical baseline) and computes annualized impact math ($+\text{amount} \times \text{annualMultiplier}$).
  - Zombie charge heuristics: Flags subscriptions active $\ge 60$ days with $\ge 3$ automated charges and zero manual notes or receipt attachments.
- **Data-Gated "What-If" Burnout Simulator (`ForesightEngine.js`)**:
  - Computes statistical rolling burn rates ($0.6 \times \text{7d} + 0.4 \times \text{30d}$) and "Days to Zero" runway calculations.
  - Strictly data-gated behind a $>20$ active logging day threshold. When $< 20$ days exist, statistical burn rate forecasting remains cleanly locked with progress feedback (`currently X/20 days`).
  - Hardened against null/undefined `salaryConfig` objects and deficit budget pools.
- **Proactive Notification Triggers 9 & 10 (`NotificationEngine.js`)**:
  - Trigger 9: Evaluates gamified daily pacing velocity facts ("You have $X safe to spend today") wired to `FinancialIntelligenceFacade.getSafeToSpend()`.
  - Trigger 10: Surfaces subscription price hike alerts.
  - Enforces 24-hour suppression and deduplication across both active in-app notifications and persistent notification logs.

---

## 4. Cross-Subsystem Interplay Analysis

| Subsystem A | Subsystem B | Interplay Mechanism | Empirical Verification |
|---|---|---|---|
| **StatementReconciliationService** | **Partitioned Storage (`active_ledger.json`)** | Reconciled statement transactions update existing records or insert net-new records into the $<90\text{d}$ active partition. | Verified in User Journey C: 1 duplicate merged, 9 net-new imported; total count invariant: exactly 10 expenses. |
| **DataQualityAuditor** | **AggregationRollupService** | Unsanitized input amounts (NaN, strings, negatives) are repaired prior to rollup calculation. Rollup accumulator additionally guards against non-finite values. | Verified: 10,000 corrupted synthetic items roll up in $<10\text{ms}$ with zero `NaN` or `Infinity` leakage. |
| **SubscriptionHunterService** | **NotificationEngine** | Subscription hunter outputs are polled during `evaluateAutoNotifications()` to trigger Trigger 10 price hike notifications. | Verified: Trigger 10 generates 1 notification and suppresses duplicate alerts within 24 hours. |
| **ForesightEngine** | **DashboardView & ImportView** | What-If simulation metrics update dynamically when potential purchases are entered. | Verified in User Journey A & C: Dynamic allowance correctly updates based on current discretionary pool. |

---

## 5. Prior Defect Status Register

| Defect ID | Description | Severity | Status | Verification Proof |
|---|---|:---:|:---:|---|
| **BUG-001** | Statement Importer CSV Decimal Stripping Regex | P0 | ✅ Resolved | Verified in User Journey C & Phase 0.7.2 tests (`420.50` preserved). |
| **BUG-002** | Test DB Isolation & State Collision | P1 | ✅ Resolved | Verified in all test suites using isolated sandbox JSON paths. |
| **BUG-003** | ESLint Undeclared Globals | P2 | ✅ Resolved | Verified: `npm run lint` yields 0 errors, 0 warnings across all files. |
| **BUG-004** | Non-Throwing Test Assertions | P2 | ✅ Resolved | Verified: All suites use strict Node `assert` with non-zero exit codes. |
| **BUG-005** | Receipt Phantom Pipeline | P0 | ✅ Resolved | Verified in Phase 0.8.1 suite and User Journey D (receipt stored to disk). |
| **BUG-006** | Unconditional Mobile Deletion on Partial Push | P0 | ✅ Resolved | Verified in Phase 0.6.4 cross-device suite (batch atomic push). |
| **BUG-007** | Missing Desktop Pairing UI | P0 | ✅ Resolved | Verified in User Journey D (desktop PIN modal displayed & paired). |
| **HAZARD-801** | Statement Recon `Infinity` NaN Score | P1 | ✅ Resolved | Verified in `test_phase8_unideal_chaos.js` (strict finite validation). |
| **HAZARD-802** | Subscription Hunter `t.notes.trim` Crash | P1 | ✅ Resolved | Verified in `test_phase8_unideal_chaos.js` (typeof string checked). |
| **HAZARD-803** | ForesightEngine `null` salaryConfig Crash | P2 | ✅ Resolved | Verified in `test_phase8_unideal_chaos.js` (safe fallback `{}`). |
| **HAZARD-804** | NotificationEngine `profiles` Array Guard | P2 | ✅ Resolved | Verified in `test_phase8_unideal_chaos.js` (`Array.isArray` guard). |
| **HAZARD-805** | User Journey C Tri-State Assertion Breakage | P1 | ✅ Resolved | Verified: `npm run test:journeys` passes 100% in 40.66s. |
| **HAZARD-806** | Aggregation Rollup `Infinity` Accumulation Poisoning | P2 | ✅ Resolved | Verified in `test_phase8_unideal_chaos.js` (`Number.isFinite` guard). |

---

## 6. Recommendations for Upcoming Phase 0.8.5

As Mission Control prepares to plan Phase 0.8.5 (**Zero-Config LAN Discovery & Optical QR Pairing**), the QA department mandates the following architectural safeguards:
1. **UDP Broadcast Cooldown & Socket Teardown**:
   - The ephemeral UDP pairing beacon (`_ledgerly._udp`) must strictly operate on a bounded timer (e.g., active pairing window of 60 seconds) and unconditionally call `socket.close()` upon window expiry, window close, or pairing completion to prevent background socket leaks.
2. **Wi-Fi Brute-Force Rate Limiting**:
   - Ensure the brute-force cooldown guard on `/api/v1/pair` (15 failed PIN attempts $\rightarrow$ 60-second lock) maintains an in-memory sliding IP timestamp bucket that self-cleans to avoid memory bloat.
3. **Optical QR Code Payload Security**:
   - Dynamic QR codes generated for camera scanning should encode ephemeral session secrets with cryptographic randomness (`crypto.randomBytes(16)`), never exposing permanent account keys or filesystem paths.

---

## 7. QA Empirical Sign-Off

**Milestone v0.8 (Phases 0.8.1 – 0.8.4) is officially AUDITED, VERIFIED, AND APPROVED.**  
All 12 automated verification suites pass with 100% empirical precision, all non-ideal failure modes have been mitigated, and zero syntax or linter warnings exist across the codebase.

**Signed,**  
*Lead Quality Assurance Tester & Head of Software Quality*  
*Ledgerly Engineering & Software Integrity Division*
