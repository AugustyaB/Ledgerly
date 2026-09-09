# 🐛 Defect Report: BUG-002

> **Defect ID**: `BUG-002`  
> **Title**: Test Runner Environment Variable `LEDGERLY_DB_PATH` Ignored by JsonDatabase  
> **Component**: `src/services/JsonDatabase.js`  
> **Severity**: **P1 — High (Test Suite Failure / Environment Collision)**  
> **Found By**: Antigravity Lead QA  
> **Date Logged**: September 8, 2026  
> **Status**: 🟢 RESOLVED in `v0.4.6`  
> **Resolution Date**: September 8, 2026  

---

## 1. Defect Summary

The Playwright automated end-to-end test suite (`scratch/test_playwright_ui.js`) launches the Electron application with an environment variable override:
```javascript
const app = await electron.launch({
  args: ['.'],
  env: {
    ...process.env,
    LEDGERLY_DB_PATH: testDbPath
  }
});
```

However, [`src/services/JsonDatabase.js`](file:///e:/AG_saves/App%20Idea%20-%20Expense%20Logger/src/services/JsonDatabase.js#L35-L41) does **not** check `process.env.LEDGERLY_DB_PATH`. Instead, it resolves directly to the production user data directory:
```javascript
constructor(customPath) {
  if (customPath) {
    this.filePath = customPath;
  } else {
    const userDataPath = app ? app.getPath('userData') : path.join(__dirname, '../../scratch');
    this.filePath = path.join(userDataPath, 'expenses_db.json');
  }
}
```

---

## 2. Reproduction Steps

1. Set up a master household account in Ledgerly in normal usage (which populates `%APPDATA%/Ledgerly/expenses_db.json`).
2. Run `npm run test:ui`.
3. The test runner spawns Electron expecting a fresh, clean database where `#screen-auth:not(.hidden)` is displayed for onboarding.
4. Because the app loads the existing user database from `%APPDATA%`, it bypasses the signup screen.
5. **Actual Result**: `TimeoutError: page.waitForSelector: Timeout 30000ms exceeded. waiting for locator('#screen-auth:not(.hidden)') to be visible`.
6. **Expected Result**: The test suite should run against the temporary isolated `test_playwright_phase3_db.json` specified by `LEDGERLY_DB_PATH`.

---

## 3. Impact & Risk Analysis

* **CI/CD Block**: Automated UI testing cannot run in headless CI environments or on developer machines without wiping the developer's personal expense database!
* **Accidental Data Overwrite**: A test suite could accidentally modify or delete real user data if run locally.

---

## 4. Recommended Code Fix

Update [`src/services/JsonDatabase.js:L35-L41`](file:///e:/AG_saves/App%20Idea%20-%20Expense%20Logger/src/services/JsonDatabase.js#L35-L41):

```javascript
constructor(customPath) {
  const envPath = process.env.LEDGERLY_DB_PATH;
  if (customPath) {
    this.filePath = customPath;
  } else if (envPath) {
    this.filePath = envPath;
  } else {
    const userDataPath = app ? app.getPath('userData') : path.join(__dirname, '../../scratch');
    this.filePath = path.join(userDataPath, 'expenses_db.json');
  }

  this.ensureStorageExists();
}
```

---

## 5. Resolution & Verification (v0.4.6)

- **Implementation**: Updated `src/services/JsonDatabase.js` constructor to check `const envPath = process.env.LEDGERLY_DB_PATH;` before falling back to `app.getPath('userData')`.
- **Verification**: Verified via test `[2] BUG-002: JsonDatabase respects process.env.LEDGERLY_DB_PATH` in `scratch/test_phase6_resilience.js`. Temporary test databases are initialized hermetically without touching production `%APPDATA%` files.

