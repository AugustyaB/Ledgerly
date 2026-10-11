# 🛡️ QA Defect Log: DEFECT-ALERT-01 — Proactive Notification Spam & Test-Runner OS Toast Bleed

**Log Date:** September 25, 2026  
**Auditor / Engineer:** Lead Frontend & Domain Engineering  
**Subsystems Involved:** `src/services/NotificationEngine.js`, `src/main.js`, `src/ui/views/NotificationView.js`, `src/services/HouseholdService.js`  
**Milestone:** Post-Milestone v0.6 Hardening & v1.0.0 Quality Assurance  
**Status:** 🟢 **RESOLVED & EMPIRICALLY CERTIFIED (10/10 Tests Passing, 0 Errors, 0 Warnings)**

---

## 1. Problem Description & User Symptoms

On September 25, 2026, the user reported receiving ~4 consecutive desktop notifications for the recurring gas bill (*"Indane LPG Cylinder"*, ₹850, `dueDay: 25`):
> *"Just now, i had recieved around 4 desktop notifications for the same recurring gas bill, why did it appear multiple time and also what are the rules setup behind them ?"*

Later, even after an initial patch, another notification appeared at 18:51:15 while tests were executing:
> *"I am still getting notifications about the gas bill. Why is it so?"*

---

## 2. Root Cause Analysis (Cascade of 5 Compounding Factors)

Thorough inspection of the runtime process tree, Playwright runners, Electron main process, and domain services identified a chain of compounding root causes:

### 1. The Core Logic Inversion (`!n.read` in Deduplication)
In `src/services/NotificationEngine.js`:
```javascript
// BEFORE (Buggy):
const existing = data.notifications.find(
  n => n.title === notif.title && !n.read && nowMs - new Date(n.createdAt).getTime() < 24 * 60 * 60 * 1000
);
```
- The deduplication check required `!n.read`.
- As soon as the user opened the notification panel, clicked the item, or marked it read, `n.read` became `true`.
- Consequently, `!n.read` evaluated to `false`. The engine concluded that no existing alert existed, created a brand-new notification record, and fired another native Windows OS desktop toast.

### 2. UI Event Re-evaluation Cascade (`NotificationView.js`)
- Every user interaction in `NotificationView.js` (`markAsRead`, `dismiss`, `clearAll`, `toggleDropdown`, `handleAction`) executed `await this.render()`.
- `render()` unconditionally invoked `await this.#api.evaluateNotifications()`.
- Every click on the notification bell or card triggered a fresh backend rule check. Since `!n.read` was now false, each click generated an additional OS toast.

### 3. Payment Cycle Property Mismatch (`HouseholdService.js`)
- `NotificationEngine.js` checked: `if (bill.dueDay && !bill.isPaidForCurrentCycle)`.
- However, `HouseholdService.js` and `main.js` only set `bill.lastPaidDate = 'YYYY-MM-DD'`.
- `bill.isPaidForCurrentCycle` was always `undefined` (`!undefined === true`). As a result, marking the bill paid never silenced the alert.

### 4. Background Playwright Test Runner OS Toast Bleed (`main.js`)
- At 18:51:16, automated Playwright tests (`journey_b_household_split.spec.js`) launched `electron.exe` with a sandboxed temporary database (`LEDGERLY_DB_PATH: test_userdata_journey_b/expenses_db.json`).
- Because every test initializes a pristine database, the test DB had `lastPaidDate: null` and an empty notification log.
- On startup, the test's Electron window ran `evaluateNotifications()`, detected `daysUntilDue === 0`, and called `showNativeDesktopNotification()`.
- In `src/main.js`, `showNativeDesktopNotification()` had **no test environment guard**. Electron invoked the native Windows Action Center API (`new Notification(...).show()`), popping up an actual physical toast on the user's desktop monitor while the test executed.

### 5. Profile Partition Isolation
- Previously, `notificationLog` was stored exclusively in the active profile's data partition (`profile.data.notificationLog`).
- In multi-profile workspaces, switching profiles caused the new profile to find an empty notification log, re-triggering the household utility bill alert.

---

## 3. Remediations Implemented (4-Layer Defense)

### Layer 1: Test & Headless Environment Guard (`src/main.js`)
```javascript
function showNativeDesktopNotification(title, body, actionTab = null) {
  // Never fire physical OS desktop toasts in test environments, headless runs, or custom test DB paths
  if (
    process.env.LEDGERLY_DB_PATH ||
    process.env.NODE_ENV === 'test' ||
    process.env.PLAYWRIGHT_TEST === 'true' ||
    process.env.CI
  ) {
    return;
  }
  if (!Notification || !Notification.isSupported()) return;
  ...
```

### Layer 2: Main Process 24-Hour In-Memory Throttle (`src/main.js`)
```javascript
const shownDesktopNotifications = new Map();

function showNativeDesktopNotification(title, body, actionTab = null) {
  ...
  const cleanTitle = (title || 'Ledgerly Alert').trim();
  const now = Date.now();
  const lastShown = shownDesktopNotifications.get(cleanTitle);
  if (lastShown && now - lastShown < 24 * 60 * 60 * 1000) {
    return;
  }
  shownDesktopNotifications.set(cleanTitle, now);
  ...
```

### Layer 3: Unconditional 24-Hour Deduplication & Root-Level Household Log (`src/services/NotificationEngine.js`)
- Removed `!n.read`. Any notification created within 24 hours matches as a duplicate.
- Added `root.notificationLog` (alongside `profile.data.notificationLog`) updated in a single atomic disk write. Switching profiles preserves the suppression state across the entire household.
- Stale log entries (>48h) are automatically pruned.

### Layer 4: Deletion & Clear-All Preservation (`src/services/NotificationEngine.js`)
- `deleteNotification()` and `clearAllNotifications()` write the title and timestamp to `notificationLog` before splicing the card from active view.
- Dismissing an alert retains its 24-hour suppression.

### Layer 5: UI Decoupling (`src/ui/views/NotificationView.js`)
- `render(shouldEvaluate = false)`: UI user actions pass `false` (read-only query of existing notifications).
- Background rule evaluation is restricted to initial component mount and the 15-minute background interval.

### Layer 6: Synchronized Payment Verification (`src/services/NotificationEngine.js`)
- Trigger 1 checks:
  ```javascript
  const currentMonthYear = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const isPaidThisCycle = Boolean(
    bill.isPaidForCurrentCycle || (bill.lastPaidDate && bill.lastPaidDate.startsWith(currentMonthYear))
  );
  ```
- Paying a bill silences all due-today alerts for the remainder of that calendar month.

---

## 4. Empirical Test Verification

A dedicated test suite was created at [`scratch/test_notification_engine_rules.js`](file:///e:/AG_saves/App%20Idea%20-%20Expense%20Logger/scratch/test_notification_engine_rules.js) and wired into `package.json` (`npm run test:notifications`):

```bash
> ledgerly@0.6.6 test:notifications
> node scratch/test_notification_engine_rules.js

================================================================================
🧪 Starting NotificationEngine & Proactive Alert Rules Test Suite
================================================================================

--- Group 1: 24-Hour Deduplication & Suppression Resilience ---
  ✅ [1] Basic notification creation works and returns unread notification: PASSED
  ✅ [2] Adding identical notification within 24h is flagged as duplicate: PASSED
  ✅ [3] Marking notification as READ does NOT cause re-creation on subsequent add: PASSED
  ✅ [4] DISMISSING / deleting notification does NOT cause re-creation on subsequent add (persistent log): PASSED

--- Group 2: Recurring Bill Alert Rules & Paid Cycle Silencing ---
  ✅ [5] Recurring bill due today triggers exactly 1 critical alert: PASSED
  ✅ [6] Evaluating notifications a second time immediately yields ZERO duplicate critical alerts: PASSED
  ✅ [7] Marking the bill notification as read does NOT re-issue critical alert on re-evaluation: PASSED
  ✅ [8] Marking recurring bill as PAID silences alert for current month cycle: PASSED
  ✅ [9] Switching profiles suppresses duplicate critical alert across entire household: PASSED

--- Group 3: Other Financial Alert Rules (Budget & Nudges) ---
  ✅ [10] Budget exhaustion triggers critical alert only once: PASSED
================================================================================
🎉 NotificationEngine Test Suite Completed: 10 / 10 tests passed!
================================================================================
```

### Full Repository Quality Sign-Off:
- `npm run test:notifications` -> **10/10 passed (100%)**
- `npm run check` -> **53/53 JavaScript files passed syntax checks**
- `npm run lint` -> **0 errors, 0 warnings across all 65 files**
- `npm run test:e2e` -> **8/8 subsystems passed with 100% success**
- Tracked in `.gsd/DECISION.md` under **ADR-008**.
