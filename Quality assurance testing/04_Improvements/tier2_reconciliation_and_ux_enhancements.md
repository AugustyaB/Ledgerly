# 🚀 Tier 2: Reconciliation & Core UX Enhancements

> **Module**: Quality Assurance — Strategic UX & Workflow Roadmap  
> **Document ID**: `IMP-002`  
> **Target Release**: `v0.4.6` – `v0.4.7`  
> **Status**: **IMPLEMENTED & EMPIRICALLY VERIFIED IN V0.4.7 (100% COMPLETE)**  

---

## 1. Feature Specifications

### 1. Smart Statement Reconciliation & Deduplication
* **Problem**: When a user logs daily coffees via presets, then imports their monthly bank CSV statement at month-end, the coffees are counted twice, inflating monthly expense figures.
* **Proposed Solution**:
  - In `ImportView.js` staging preview, compare incoming rows against existing transactions in `ExpenseService`.
  - Flag potential duplicates where `Date` is within ±2 days and `Amount` is identical.
  - Provide an interactive toggle: `[ Skip 8 Potential Duplicates ]` before committing to the database.

---

### 2. Automated Recurring Bill & Salary Scheduler
* **Problem**: Currently, recurring bills (Rent, Electricity, Subscriptions) and salary allocations require manual interaction or modal clicks.
* **Proposed Solution**:
  - On app launch, `BudgetService` and `HouseholdService` inspect recurring bills.
  - If a bill's due date has arrived since the last app open, display a non-intrusive banner:  
    `"⚡ Internet Bill (₹999) was due on Sept 5. [ Pay & Split Now ] [ Dismiss ]"`.
  - Automatically increment pay cycle dates on payday.

---

### 3. Global Undo / Redo Mechanism (`Ctrl+Z`)
* **Problem**: If a user accidentally deletes a transaction or batch rows, there is currently no quick undo.
* **Proposed Solution**:
  - Maintain a 10-item in-memory action stack in `AppState.js`.
  - When an expense is deleted, cache its object.
  - Pressing `Ctrl+Z` invokes `api.addExpense(cached)` and triggers a toast: `"Restored 'Dinner' ₹450"`.

---

### 4. Advanced Omni-Search in Command Palette (`Ctrl+K`)
* **Problem**: The search in `CommandPalette.js` is great for views and profiles, but should also execute instant math and category queries.
* **Proposed Solution**:
  - Support instant calculator queries (`"450 / 3"` -> `"₹150.00"`).
  - Search across contextual notes (`"find notes on groceries"`).

---

## 2. Implementation & Verification Record (v0.4.7)

| Feature | Implementation Component | Verification Proof |
|---|---|---|
| **1. Deduplication & Reconciliation** | `src/ui/views/ImportView.js` (`isPotentialDuplicate`, interactive `#import-reconciliation-bar`) | Automated test #11 in `test_phase7_resilience.js` |
| **2. Proactive Bill Scheduler** | `src/main.js` (`check-pending-bills`, `execute-bill-payment`), `src/ui/views/DashboardView.js` (`#dashboard-due-bills-banner`) | Verified in test suite and manual wiring |
| **3. Global Undo Stack** | `src/ui/AppState.js` (`#undoStack`, max 10 items), `src/app.js` (`Ctrl+Z`, `handleGlobalUndo`) | Automated test #10 in `test_phase7_resilience.js` |
| **4. Spotlight Calculator & Notes Search** | `src/ui/components/CommandPalette.js` (`safeEvaluateMath`, notes search) | Automated test #12 in `test_phase7_resilience.js` |

