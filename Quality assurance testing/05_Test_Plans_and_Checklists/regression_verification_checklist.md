# ✅ Regression Verification Checklist

> **Module**: Quality Assurance — Release Gate Checklist  
> **Document ID**: `CHK-001`  
> **Milestone**: Pre-Release Gate  
> **Status**: APPROVED  

---

## 1. Automated Verification Gates

Execute each command and ensure a 100% green exit code:

- [x] **1. Syntax Check**:
  ```bash
  npm run check
  ```
  *Expected*: `All 44 JavaScript files in src/ passed syntax check.`

- [x] **2. Static Analysis Lint**:
  ```bash
  npm run lint
  ```
  *Expected*: `0 errors, 0 warnings`.

- [x] **3. Profile Isolation Test**:
  ```bash
  node scratch/test_batch2_profiles.js
  ```
  *Expected*: `ALL MULTI-USER PROFILE TESTS PASSED WITH 100% SUCCESS!`

- [x] **4. Full End-to-End Integration Suite**:
  ```bash
  npm run test:e2e
  ```
  *Expected*: `ALL 8 E2E TEST SUBSYSTEMS PASSED WITH 100% SUCCESS!`

- [x] **5. Phase 6 Resilience Suite**:
  ```bash
  npm run test:resilience
  ```
  *Expected*: `ALL PHASE 6 RESILIENCE TESTS PASSED (11/11)`

- [x] **6. Phase 7 Enterprise Resilience Suite**:
  ```bash
  npm run test:phase7
  ```
  *Expected*: `Phase 7 Test Suite Completed: 12 / 12 tests passed!`

- [x] **7. Runtime Validation Suite**:
  ```bash
  npm run test:validation
  ```
  *Expected*: `ALL 39/39 PHASE 5 VALIDATION TESTS PASSED!`

---

## 2. Manual Visual & Functional Smoke Checklist

- [ ] **Window Controls**: Minimize, Maximize, and Close buttons on the frameless titlebar operate without window frame tearing.
- [ ] **Privacy Mode**: Pressing `P` or clicking the Ledgerly logo blurs all currency figures with `filter: blur(7px)`.
- [ ] **Command Palette**: Pressing `Ctrl+K` opens the floating spotlight; typing "Add Expense" opens the modal.
- [ ] **Quick-Add Floating Pill**: Pressing `Ctrl+Alt+L` summons the frameless mini-pill widget; typing an expense logs it instantly to the main window.
- [ ] **Batch Mode Keyboard Navigation**: Pressing `Tab` moves through cells; pressing `Enter` at the end of a row automatically spawns a new row.
- [ ] **Bank Statement Drag & Drop**: Dragging a CSV or Excel file onto the window opens the staging table; amounts and dates are accurately previewed.
- [ ] **Household Debt Settlement**: Checking off a settlement debt and clicking `[ Settle Selected ]` writes a historical repayment record and clears the active debt badge.
