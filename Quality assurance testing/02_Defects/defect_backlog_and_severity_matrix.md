# 🐛 Defect Backlog & Severity Matrix

> **Module**: Quality Assurance — Defect Registry & Risk Matrix  
> **Document ID**: `DEF-REG-001`  
> **Milestone**: Ledgerly `v0.4.4`  
> **Status**: ACTIVE & CANONICAL  

---

## 1. Defect Severity & Priority Classification Standards

| Level | Severity Definition | Priority | SLA / Release Gate |
|---|---|---|---|
| **P0 — Blocker** | Catastrophic data loss, silent corruption, security vulnerability, or application crash. | Immediate | **Blocks all builds & releases.** Must be fixed before any other work. |
| **P1 — High** | Core workflow broken, automated test suite failure, or major feature regression with no workaround. | Critical | Fix within current sprint / before next minor milestone. |
| **P2 — Medium** | Cosmetic defects, linter warnings, unhandled edge cases with existing workarounds, or silent assertion flaws. | Normal | Schedule for next milestone cleanup wave. |
| **P3 — Low** | Minor visual alignment issues, code style preferences, or non-blocking documentation gaps. | Low | Backlogged for periodic polish cycles. |

---

## 2. Current Active Defect Register

| Bug ID | Title | Component | Severity | Priority | Status | Impact Summary | Resolution Note |
|---|---|---|:---:|:---:|:---:|---|---|
| [`BUG-001`](BUG-001_csv_decimal_stripping_regex.md) | File Importer regex strips decimal points from currency amounts | `src/fileImporter.js` | **Blocker** | **P0** | 🟢 RESOLVED | All imported CSV/XLSX amounts with decimals get multiplied by 100 ($78.45 -> $7845). | Resolved in v0.4.6: updated regex to retain decimal point, accounts parentheses, and currency symbols. |
| [`BUG-002`](BUG-002_test_db_isolation_and_env_vars.md) | Test DB path environment variable ignored by JsonDatabase | `src/services/JsonDatabase.js` | **High** | **P1** | 🟢 RESOLVED | `test_playwright_ui.js` collides with live `%APPDATA%` user database and times out. | Resolved in v0.4.6: constructor checks `process.env.LEDGERLY_DB_PATH`. |
| [`BUG-003`](BUG-003_eslint_syntax_and_undeclared_globals.md) | ESLint static analysis fails with 2 errors & 9 warnings | `src/nlpParser.js`, `src/quickPill.js` | **Medium** | **P2** | 🟢 RESOLVED | `npm run lint` fails; undeclared global `hydrateIcons` in floating quick-add widget. | Resolved in v0.4.6: all syntax and global issues remediated; 0 errors, 0 warnings. |
| [`BUG-004`](BUG-004_non_throwing_test_assertions.md) | Empirical test suite uses non-throwing `console.assert` | `scratch/test_phase5.js` | **Medium** | **P2** | 🟢 RESOLVED | Assertions fail silently during test runs without failing the CI/CD exit code. | Resolved in v0.4.6: migrated test scripts to `node:assert/strict`. |
| [`BUG-005`](BUG-005_receipt_phantom_pipeline.md) | Receipt "Phantom Pipeline": uploaded receipts never create expense entries on desktop and background OCR results are discarded | `src/services/SyncServer.js`, `mobile/src/services/SyncClient.js` | **Blocker** | **P0** | 🟢 RESOLVED | Mobile purges receipt upon sync, but desktop only writes raw image to disk without creating an expense or parsing draft details. | Resolved in Phase 0.6.3: SyncClient sends financial metadata; SyncServer creates expense linked to receipt image and stages OCR results. |
| [`BUG-006`](BUG-006_unconditional_mobile_deletion_partial_push.md) | Data loss hazard on partial push failure: `SyncClient` wipes all pending transactions even when desktop rejects items | `mobile/src/services/SyncClient.js` | **Blocker** | **P0** | 🟢 RESOLVED | Rejection in schema validation at desktop leaves items unapplied, but client blindly deletes all offline transactions from IndexedDB. | Resolved in Phase 0.6.3: SyncClient cross-references pushData.errors; only acknowledged items are purged, while rejected items retain syncStatus='error'. |
| [`BUG-007`](BUG-007_missing_desktop_pairing_ui.md) | Desktop lacks UI controls to generate pairing PIN, view LAN IP, or manage paired mobile devices | `src/ui/views/SettingsView.js`, `src/preload.js` | **Blocker** | **P0** | 🟢 RESOLVED | IPC channels exist but desktop user has no visual UI in Settings to generate a 6-digit PIN or pair their phone. | Resolved in Phase 0.6.3: added Mobile & Wi-Fi Sync tab to Settings with live server status, 6-digit PIN generation with 5-min timer, and paired devices management table. |
| `DEFECT-603-04` | Wi-Fi pairing PIN vulnerable to brute-force attempts without rate limiting | `src/services/SyncServer.js` | **High** | **P1** | 🟢 RESOLVED | Unlimited PIN guessing on LAN; could allow rapid discovery within 5-minute window. | Resolved in Phase 0.6.3: enforced strict 15-attempt rate limiter returning HTTP 401 with remaining attempts countdown and HTTP 429 session invalidation lockout. |
| `DEFECT-603-05` | Multi-profile ingestion collision hazard when desktop user switches profiles | `src/services/SyncServer.js`, `src/storage.js`, `mobile/src/services/SyncClient.js` | **High** | **P1** | 🟢 RESOLVED | Mobile sync indiscriminately writes into whatever profile is active on desktop screen. | Resolved in Phase 0.6.3: tethered paired device to targetProfileId at handshake; partitioned all reads/writes through getProfileData / saveProfileData. |
| `DEFECT-603-06` | ESLint environment blindspot for mobile companion source tree | `eslint.config.js`, `package.json` | **Medium** | **P2** | 🟢 RESOLVED | `npx eslint mobile/src` reported 101 missing browser global errors; lint target omitted mobile. | Resolved in Phase 0.6.3: declared DOM/browser globals in eslint.config.js; root lint script now validates both src/ and mobile/src/ with 0 errors, 0 warnings. |

---

## 3. Defect Risk Assessment Matrix

```text
                  CONSEQUENCE / IMPACT
           Low          Medium         High         Catastrophic
       +------------+------------+------------+--------------------+
Almost |            |            |            |                    |
Certain|            |            |            | [BUG-001 RESOLVED] |
       +------------+------------+------------+--------------------+
Likely |            |            | [BUG-002   |                    |
       |            |            |  RESOLVED] |                    |
       +------------+------------+------------+--------------------+
Possible            | [BUG-003   |            |                    |
       |            |  RESOLVED] |            |                    |
       +------------+------------+------------+--------------------+
Rare   |            | [BUG-004   |            |                    |
       |            |  RESOLVED] |            |                    |
       +------------+------------+------------+--------------------+
```

---

## 4. Release Blocker Criteria Status (v0.4.6 Verified)

All criteria required prior to `v0.5.0` or `v1.0.0` tagging have been satisfied in `v0.4.6`:
1. ✅ `BUG-001` is resolved and verified with automated decimal accuracy unit tests (11/11 resilience suite pass).
2. ✅ `BUG-002` is resolved so `JsonDatabase` adheres to `process.env.LEDGERLY_DB_PATH` for isolated test environments.
3. ✅ `BUG-003` is resolved with `npm run lint` returning `0 errors, 0 warnings`.
4. ✅ `BUG-004` is resolved with strict `node:assert/strict` testing throwing on failure.
