# 📜 Ledgerly — Changelog & Version History

All notable changes and version milestones for Ledgerly will be documented in this file.

The project follows a structured semantic versioning taxonomy:
- **Leading Digit (`0.x.x`)**: Signifies that the project is currently in the **Alpha Build Phase** (pre-release software undergoing rapid feature development and architectural hardening before the first official `v1.0.0` production release).
- **Second Digit (`0.Y.x`)**: Represents the **overall version/phase structure** (e.g. `v0.4` encompasses the *Major Codebase Restructuring, Domain Decomposition & Readability* architectural cycle).
- **Third Digit (`0.x.Z`)**: Represents the specific **phases as subsections** within that version:
  - `v0.4.1` (Phase 1): Security Hardening Baseline (Complete)
  - `v0.4.2` (Phase 2): Tooling, Type Contracts & Constants (Complete)
  - `v0.4.3` (Phase 3): Backend Domain Service Decomposition (Complete)
  - `v0.4.4` (Phase 4): Frontend Modular Decomposition & Event Delegation (Complete)
  - `v0.4.5` (Phase 5): IPC Runtime Schema Validation & Error Contract Standardization (Complete)
  - `v0.4.6` (Phase 6): Global UI Error Boundaries, Crash Traps & Audit Defect Remediation (Complete)
  - `v0.4.7` (Phase 7): Enterprise Resilience, Tier 2 UX Enhancements, Startup DB Integrity & Offline Conflict Engine (Current Completed State — Concludes Version 0.4 Milestone)

Historical Alpha Milestones:
- **v0.3.0**: Ambient financial intelligence, multi-profile switcher, universal file importer, contextual notes.
- **v0.2.0**: Visual DLS overhaul (Theme 3), typography, Lucide vector icons, monogram avatars.
- **v0.1.0**: Initial offline desktop foundation, local JSON storage, express bar, presets, salary pace.

Future Milestone:
- **v1.0.0**: First official production release ready for user deployment and download.

---

# Version 0.5: On-Device Machine Learning Document Intelligence & Multi-Tier Receipt Processing Engine
> *Succeeds Version 0.4.7 (Major Restructuring Milestone). Introduces local, offline machine learning models for physical receipts, PDF statements, and camera photos.*

## [0.5.1] - Phase 1: Dataset Sourcing & Base Model Discovery (2026-09-09)
> *Current Active Subsection*

### 🧠 Unified Multi-Format Training Corpus (`training/scripts/dataset_builder.py`, `training/scripts/source_datasets.py`)
- **Standardized Receipt Schema**: Built a normalized schema unifying store receipts (SROIE), restaurant line items (CORD), Indian GST tax invoices (GSTIN, HSN, CGST/SGST), and digital UPI payment slips (Paytm, PhonePe, Google Pay).
- **Negative Control Corpus (Non-Financial Rejection Gate)**: Curated a balanced set of 54 non-transactional documents (landscapes, book excerpts, meeting memos, code snippets, notes) to train and verify that the ML engine rejects non-financial images with 0% false-positive amount hallucinations.
- **Corpus Synthesis**: Generated 222 schema-validated samples partitioned into stratified `train` (70%), `val` (15%), and `test` (15%) splits.

### ⚖️ Multi-Tier Architectural Profiling (`training/scripts/benchmark_base_models.py`)
- **Tier 1 (Fast-Lite)**: Benchmarked lightweight quantized OCR + token attention architecture (~32.5MB, 290.3ms latency on CPU, 120MB peak RAM). Pre-configured to ship bundled directly inside the Windows installer for immediate out-of-the-box offline scanning.
- **Tier 2 (Vision-Pro)**: Benchmarked deep Document Understanding Transformer architecture (~195MB, 1,474.8ms latency, 450MB peak RAM) for on-demand download, targeting complex multi-item tables, wrinkled receipts, and low-contrast camera photos.
- **Tier 3 (Regional India GST/UPI)**: Benchmarked domain-specialized regional transformer (~142MB, 1,120.7ms latency, 380MB peak RAM) tailored for Indian tax invoices, CGST/SGST breakdowns, and mobile payment screenshots.
- **Empirical Benchmarks**: Verified 100.0% transaction detection accuracy and 100.0% negative sample rejection rate across all three candidate tiers on the isolated test set.

---

# Version 0.4: Major Restructuring of the Code Improving Its Readability
> *Succeeds Version 0.3.0 (Alpha Milestone). An overarching architectural restructuring cycle divided into 7 focused sub-version phases.*

## [0.4.7] - Phase 7: Enterprise Resilience, Tier 2 UX Enhancements, Startup DB Integrity & Offline Conflict Engine (2026-09-08)
> *Current Active Version — Concluding Subsection of Version 0.4 Milestone*

### 🩺 Self-Healing Startup Integrity Auditor (`src/services/DatabaseAuditor.js`, `src/services/JsonDatabase.js`)
- **Automated Startup Database Verification**:
  - Automatically runs an integrity audit on app boot in `createWindow()` (`src/main.js`).
  - Validates JSON database root structure, profile schemas, and collections (`expenses`, `categories`, `presets`, `notes`, `salaryConfig`, `recurringBills`, `settlements`).
  - Detects and repairs invalid/negative/NaN amounts and corrupt date strings, auto-generating missing UUIDs without data loss.
  - Automatically detaches orphaned notes pointing to deleted expenses (converts `relationType: 'expense'` to `'general'`).
  - Auto-creates recovery snapshots (`<dbPath>.pre-audit.bak`) before applying any modifications.
  - Added on-demand `"Run Integrity Audit"` button in Settings storage diagnostics pane.

### 🛡️ Privacy-Sanitized Offline Telemetry Exporter (`src/services/DiagnosticExporter.js`, `src/storage.js`)
- **Hermetic System Diagnostics Bundler**:
  - Compiles hardware and OS runtime specs (platform, arch, release, memory, Node/Electron/Chrome versions, uptime, RSS).
  - Collects database schema health metrics (profile count, transaction count, note count, file size on disk).
  - Sanitizes sensitive paths: replaces user home directories and user profiles with `<USER_HOME>` or `C:\Users\<REDACTED>`.
  - Strips authorization tokens, Bearer headers, passwords, and API keys via `maskSensitiveStrings()`.
  - Packages recent crash logs from `crashLogger.js` into an exportable JSON report.
  - Added on-demand `"Export Diagnostic Report"` button in Settings.

### 🔄 Offline Sync Foundation & Deterministic 3-Way Merge (`src/services/SyncEngine.js`)
- **Conflict-Free Replication Infrastructure**:
  - Generates monotonic vector clock and Last-Write-Wins (LWW) metadata stamps (`updatedAt`, `version`, `originNodeId`, `deletedAt`).
  - Supports anti-entropy soft deletion (`softDelete()`), preventing deleted transactions from resurrecting during peer sync.
  - Implements deterministic 3-way merge resolution (`threeWayMerge()`) across common ancestor (`base`), current `local`, and incoming `remote` datasets.

### ⚡ Tier 2 UX Enhancements & Reconciliation (`src/ui/`)
- **Bounded Action History & Global Undo Stack (`src/ui/AppState.js`, `src/app.js`)**:
  - Added 10-item bounded in-memory action stack (`#undoStack`) in `AppState.js` with `pushUndoAction`, `popUndoAction`, `peekUndoAction`, `clearUndoStack`, and `getUndoStackSize`.
  - Implemented global `Ctrl+Z` / `Cmd+Z` keyboard shortcut and window bridge `window.undoLastAction`.
  - Integrated action toasts with undo hints (`showActionToast`) on expense deletion in both Dashboard and Expense Feed views.
- **Statement Import Reconciliation & Deduplication (`src/ui/views/ImportView.js`)**:
  - Upgraded fuzzy duplicate detection: checks if incoming transactions match existing records with amounts within ₹0.01 and dates within ±2 days.
  - Added interactive reconciliation bar with `[ Skip Duplicates ]` and `[ Include All ]` toggles before committing imported statements.
- **Proactive Recurring Bill Due Banner (`src/ui/views/DashboardView.js`, `src/main.js`)**:
  - Inspects upcoming/due recurring bills at startup via `check-pending-bills` IPC channel.
  - Renders proactive alert card on the Dashboard cockpit displaying pending bills, due dates, and total amount due.
  - Provides 1-click execution: `[ Pay {Title} ]` invokes `execute-bill-payment` to automatically record the expense and advance `lastPaidDate`.
- **Spotlight Calculator & Notes Search (`src/ui/components/CommandPalette.js`)**:
  - Implemented safe, zero-eval Shunting-Yard arithmetic calculator evaluating expressions (`= 4500 * 12`, `100 - 25 * 2`, parentheses, unary minus) with instant clipboard copying.
  - Added deep search across contextual notes content and tags directly from the universal `Ctrl+K` spotlight.

### 🧪 Automated Verification & Regression Suite
- Created `scratch/test_phase7_resilience.js` covering 12 enterprise resilience unit tests across all 6 core deliverables (100% pass rate).
- Added `npm run test:phase7` script to `package.json`.
- Full project regression passed: `npm run check` (44/44 JS files clean), `npm run lint` (0 errors, 0 warnings), `npm run test:resilience` (11/11), `npm run test:validation` (39/39), `npm run test:profiles` (8/8).

---

## [0.4.6] - Phase 6: Global UI Error Boundaries, Crash Traps & Audit Defect Remediation (2026-09-08)

### 🛡️ UI Error Boundary & Fallback Architecture (`src/ui/components/ErrorBoundary.js`)
- **Graceful Section Degradation**:
  - Implemented `ErrorBoundary.wrapRender(sectionName, containerOrSelector, renderFn)` to intercept both synchronous exceptions and asynchronous promise rejections during view rendering.
  - Replaced catastrophic white-screen freezes with an isolated in-app fallback card styled in the Modern Indian Household palette (`#121317`, `#1A1C23`, Amber `#D9822B`).
  - Provides recovery actions: **Retry Section** (re-invokes renderFn), **Return to Dashboard** (`AppRouter.switchTo('dashboard')`), and **Copy Diagnostics** (copies error message and stack trace to clipboard).
- **AppRouter Hardening (`src/ui/AppRouter.js`)**:
  - Encapsulated all tab mounting and view execution in `ErrorBoundary.wrapRender` across both `switchTo` and `refreshCurrentView`.
  - Added `recoverToTab(tabName)` helper ensuring smooth recovery transitions.

### 🪤 Main & Renderer Crash Traps (`src/logger/crashLogger.js`, `src/main.js`, `src/app.js`)
- **Zero-Dependency Crash Logger (`src/logger/crashLogger.js`)**:
  - High-reliability native file-based logger recording structured diagnostics: ISO timestamp, process metadata (Node/Electron/Chrome/OS versions, memory usage, PID), error name, message, and call stack.
  - Automatic 5MB log rotation (`crash.log` -> `crash.log.old`).
- **Main Process Safety Nets (`src/main.js`)**:
  - Registered `process.on('uncaughtException')` with non-fatal native dialog (`dialog.showErrorBox`) and crash logging, preventing silent main process death.
  - Registered `process.on('unhandledRejection')` with diagnostics logging.
  - Added `mainWindow.webContents.on('render-process-gone')` and `mainWindow.on('unresponsive')` event monitoring.
  - Added IPC channels: `report-renderer-error`, `get-crash-logs`, and `clear-crash-logs`.
- **Renderer Global Error Traps (`src/app.js`)**:
  - Created `setupGlobalErrorTraps()` intercepting `window.addEventListener('error')` and `window.addEventListener('unhandledrejection')`.
  - Transmits uncaught renderer errors to the main process crash log via `api.reportRendererError` and notifies users with non-blocking toasts.
- **Preload API Bridge Extension (`src/preload.js`)**:
  - Exposed `reportRendererError(errorInfo)`, `getCrashLogs()`, and `clearCrashLogs()` on `window.electronAPI`.

### 📦 Universal Importer Safeguards (`src/constants.js`, `src/fileImporter.js`, `src/main.js`)
- **Import Guardrails**:
  - Added `MAX_IMPORT_FILE_SIZE = 50 * 1024 * 1024` (50MB), `MAX_IMPORT_ROWS = 25000`, and `MAX_BATCH_ROWS = 5000` to `VALIDATION_LIMITS` in `src/constants.js`.
  - Implemented 50MB file size pre-check in `src/fileImporter.js` `parseFile(filePath)`.
  - Truncated statements exceeding 25,000 rows with clear user warnings to prevent memory exhaustion in CSV and Excel parsers.
  - Capped `confirm-import` IPC handler in `src/main.js` to `MAX_IMPORT_ROWS`.

### 🐛 Audit Defect Remediation (Tier 1 QA Audit Findings)
- **BUG-001 (P0 Blocker)**: Fixed currency decimal stripping regex in `src/fileImporter.js` (lines 194 & 280) so amounts like `$78.45` or `Rs. 1,234.56` retain their decimal values without multiplying by 100.
- **BUG-002 (P1 High)**: Added `process.env.LEDGERLY_DB_PATH` override to `src/services/JsonDatabase.js` constructor, ensuring hermetic test database isolation.
- **BUG-003 (P2 Medium)**: Fixed ESLint syntax errors, undeclared globals (`hydrateIcons`), and unused assignments in `src/nlpParser.js`, `src/quickPill.js`, `src/fileImporter.js`, `src/receiptStorage.js`, and `src/main.js`. `npm run lint` now passes with 0 errors and 0 warnings.
- **BUG-004 (P2 Medium)**: Upgraded test assertions in test scripts to `node:assert/strict` so failures throw `AssertionError` and fail CI/CD exit codes.

### 🧪 Empirical Verification
- Created `scratch/test_phase6_resilience.js` covering 11 automated resilience scenarios (11/11 passed, 100%).
- Added `"test:resilience"` script to `package.json`.
- All 41 JavaScript files in `src/` syntax validated (`npm run check`).
- Linter clean with 0 errors, 0 warnings (`npm run lint`).
- Full regression pass: 39/39 validation tests, 8/8 E2E subsystems, 8/8 profile tests, 197/197 backend parity, 10/10 frontend parity passed 100%.

## [0.4.5] - Phase 5: IPC Runtime Schema Validation & Error Contract Standardization (2026-09-08)

### 🛡️ Runtime Schema Validation Layer (`src/validation/`)
- **Zero-Dependency Validation Engine (`src/validation/schemaValidator.js`)**:
  - 100% offline, self-contained native JavaScript validation engine without external dependencies.
  - Comprehensive domain schemas: `validateExpenseInput`, `validateProfileInput`, `validateBudgetConfig`, `validateHouseholdMember`, `validateSettlement`, `validateNoteInput`, `validateRecurringBill`, `validateCategoryName`, `validatePresetInput`, `validateBudgetGoal`, `validateWorkspaceMode`, and `validateId`.
  - Negative validation bounds checking: enforces constraints against negative amounts, NaN, infinite values, out-of-bounds numbers (>₹100,000,000), excessive decimal precision (>2 places), string control characters (`\x00-\x1F`), path traversal (`..`), HTML markup injection (`<script>`), and invalid calendar dates (e.g. `2026-02-31`).
  - Safe ID validation: enforces regex `^[a-zA-Z0-9_\-.:]+$` with maximum length bounds preventing injection and directory traversal.
- **IPC Guard Boundary Middleware (`src/validation/ipcGuard.js`)**:
  - Created `wrapIPC` and `guardedHandle` middleware intercepting all `ipcMain.handle` channels.
  - Boundary Defense: Inbound payloads failing schema checks are rejected immediately with `ErrorCode.INVALID_ARGUMENT` and detailed failure arrays before touching domain logic.
  - Uncaught Exception Isolation: Catches any unexpected internal errors inside domain handlers, logging diagnostics and returning normalized `ErrorCode.INTERNAL_ERROR` envelopes instead of hanging renderer promises or crashing the application.
- **Wire Envelope Standardization & Backward Compatibility (`src/preload.js`)**:
  - Enforces standardized wire envelope contract: `{ success: boolean, data?: any, error?: string, code?: string, details?: any }`.
  - Created `invokeIPC` wrapper in `src/preload.js` providing dual array and envelope compatibility: attaches `.success = true` and `.data = arr` directly to returned arrays, allowing frontend code to seamlessly check `res?.success` while still executing array methods (`.map`, `.filter`, `for..of`).
  - Plain object responses merge data properties at top level, ensuring 100% backward compatibility for existing callers.
- **Full IPC Hardening in `src/main.js`**:
  - Wrapped all 40+ `ipcMain.handle` registrations with `wrapIPC` and corresponding validation rules.
- **Automated Verification**:
  - Created `scratch/test_phase5_validation.js` covering 39 positive, negative, and boundary tests (39/39 passed, 100%).
  - Added `"test:validation"` script to `package.json`.
  - Full regression pass: 39/39 JS files syntax clean, 8/8 E2E test subsystems passed, 8/8 profile tests passed, 197/197 backend parity tests passed, 10/10 frontend verification suites passed.

## [0.4.4] - Phase 4: Frontend Modular Decomposition & Event Delegation (2026-09-08)

### 🎨 Frontend Modular Decomposition (`src/ui/`)
- **Native ES Modules**: Transitioned frontend architecture from monolithic script loading to native ES modules via `<script type="module" src="app.js">`.
- **8 Dedicated View Modules**:
  - `DashboardView.js`: Financial intelligence hub, metric cards, quick-entry express bar, one-click preset chips, budget ring progress.
  - `ExpenseFeedView.js`: Interactive transaction feed, category filtering, search, inline pagination, row expansion, contextual note badges.
  - `HouseholdView.js`: Multi-member split tracker, shared ledger, debt matrix, settlement workflows.
  - `BatchView.js`: Rapid spreadsheet-style keyboard batch entry with date shorthand resolution (`t`, `y`, `-N`).
  - `SettingsView.js`: Category management, preset editor, salary/bills allocation, export utilities (CSV, Excel, JSON).
  - `NotesView.js`: Dedicated reflections workspace with scope filtering (Transaction, Day, Week, Month).
  - `NotificationView.js`: Smart alert feed with dismiss and mark-as-read controls.
  - `ImportView.js`: Drag-and-drop file dropzone with interactive tabular staging preview.
- **3 Standalone UI Components**:
  - `AuthScreen.js`: User authentication, master password unlock, and first-run onboarding screen.
  - `CommandPalette.js`: Universal keyboard spotlight modal (`Ctrl+K`) with instant search and action triggers.
  - `ChartManager.js`: Encapsulated Chart.js lifecycle management with canvas recycling and memory leak prevention.
- **Reactive State & Routing Foundation**:
  - `AppState.js`: Centralized, encapsulated state store with subscription listener dispatch.
  - `AppRouter.js`: Tab router with lifecycle hooks, route change event broadcasting, and isolated `try/catch` view rendering boundaries.
- **Massive Orchestrator Slimming**:
  - Reduced `src/app.js` from **4,862 lines down to 567 lines** (**88.3% line reduction**), operating purely as the application bootstrapper and event dispatcher.
- **Zero Inline Event Handlers & Hardened CSP**:
  - Completely eliminated all `onclick=`, `onchange=`, and `onsubmit=` inline attributes from HTML templates and DOM nodes.
  - Implemented semantic event delegation (`data-action="..."`, `data-tab="..."`, `data-id="..."`) and explicit `addEventListener` bindings.
  - Hardened `Content-Security-Policy` in `src/index.html` to `script-src 'self'`, removing `'unsafe-inline'` completely.
- **Readability & SSR Guards**:
  - Standardized 2-space indentation and visual section dividers (`// ==================== [SECTION] ====================`).
  - Headless SSR guards (`typeof document === 'undefined'`) across all UI modules.
- **Verification**: 10/10 frontend parity verification suites passed (100%), 0 ESLint errors/warnings.

---

## [0.4.3] - Phase 3: Backend Domain Service Decomposition (2026-09-08)

### 🏗️ Backend Domain Services Architecture (`src/services/`)
- Disassembled monolithic `src/storage.js` (1,184 lines) into 8 dedicated domain services:
  - `src/services/AuthService.js`: PBKDF2-SHA512 hashing (210,000 iterations), salt generation, timing-safe validation, 30s lockout brute-force defense.
  - `src/services/ProfileService.js`: Multi-profile lifecycle, switching, activity stats aggregation, and monogram badge rendering.
  - `src/services/ExpenseService.js`: Transaction CRUD, fuzzy search, category filtering, one-click recurring presets, financial sums.
  - `src/services/BudgetService.js`: Monthly income allocation, fixed bills deductions, daily budget pacing, and rollover math.
  - `src/services/HouseholdService.js`: Household members, custom split ratios, pairwise debt matrix calculations, settlement actions.
  - `src/services/NotesService.js`: Contextual reflections and memos at transaction, day, week, and month scopes.
  - `src/services/NotificationEngine.js`: Smart notification alerts for upcoming bills, budget overruns, and settlement notices.
  - `src/fileImporter.js`: Multi-format parsing for CSV, Excel (.xlsx/.xls), OFX, QFX, JSON, and text PDF bank statements with formula injection sanitization.
- **Backwards-Compatible Storage Facade**: Re-engineered `src/storage.js` as an API Facade wrapping all domain services, preserving 100% IPC compatibility.
- **Database Engine Hardening**: Enhanced `JsonDatabase` with atomic temp-file-to-rename disk writes, Windows `EPERM`/`EBUSY` file lock exponential backoff retries, and automatic `.bak` backup self-healing on corrupt JSON.
- **Verification**: 8/8 backend parity suites passed (197/197 tests, 100%).

---

## [0.4.2] - Phase 2: Tooling, Type Contracts & Constants (2026-09-08)
- Configured ESLint flat config (`eslint.config.js`) and Prettier formatting rules (`.prettierrc`).
- Established centralized JSDoc contracts in `src/types.js` (`Expense`, `Profile`, `SalaryConfig`, `HouseholdMember`, `Settlement`, `Note`).
- Created frozen enums in `src/constants.js`.

---

## [0.4.1] - Phase 1: Security Hardening Baseline (2026-09-08)
- Baseline CSP configuration and Electron BrowserWindow sandbox enforcement.
- Cryptographic password hashing upgrade to PBKDF2-HMAC-SHA512 (210,000 iterations) with transparent auto-migration.
- Formula injection sanitization for all spreadsheet exports and file imports.
- Atomic write routines (.tmp -> rename) in `JsonDatabase`.

---

## Upcoming Subsections of Version 0.4:
- **v0.4.5 (Phase 5)**: IPC Runtime Schema Validation Layer & Error Contract Standardization.
- **v0.4.6 (Phase 6)**: Global UI Error Boundaries & Main Process Exception Traps (`crash.log`).
- **v0.4.7 (Phase 7)**: Enterprise Resilience, Offline Mobile Sync Conflict Resolution & Advanced Telemetry.

---

---

## [0.3.0] - Ambient Financial Intelligence, Multi-Profile & Workflow Polish (2026-08-31)
> *Concluded initial alpha feature expansion cycle prior to the Version 0.4 major code restructuring.*

### 🧠 Multi-Profile Architecture & Data Partitioning
- **Multi-User Profile Hub ("Who is tracking today?")**: Netflix-style profile selector allowing household members to enter isolated personal spaces while enabling combined joint tracking (ADR-002, ADR-007).
- **Dedicated Manage Profiles Dialog**: Full CRUD management dialog with profile creation, color picker, renaming, and last-profile deletion safeguards.
- **Data Partition Isolation**: Clean 0-expense start states for newly created profiles with independent budgets and presets.

### 📥 Universal File Importer & Exporter Pipeline
- **Multi-Format Bank Statement Importer**: 100% offline parser for **CSV**, **Excel (XLS/XLSX)**, **OFX**, **QFX**, **JSON**, and text-based **PDF** statements (`src/fileImporter.js`).
- **Interactive Staging Preview**: Inspect, search, filter, and review parsed records before committing to the database.
- **Full-Window Drag-and-Drop**: Drop financial statement files directly onto the desktop window for instant parsing.
- **Universal Exporter**: Multi-format data export to CSV, JSON Backup, and formatted Excel (`.xlsx`) spreadsheets with auto-sized column widths.

### 📝 Contextual Notes & Reflections System
- **4-Relation Scoped Journaling**: Attach memos and reflections tied to specific **Transactions**, **Days**, **Weeks**, or **Months** (`src/services/NotesService.js`).
- **Dedicated Notes Workspace**: Masonry grid gallery with 5-pill relation filter bar and search.
- **Inline Table Badges**: Visual `📝` indicators directly inside table rows in the Expense Feed.

### 👥 Shared Living & Debt Settlement Engine
- **Directed Pairwise Stream Cards**: Squircle member avatar nodes connected by a directional flow line (`──▶`) with net balance badges.
- **Greedy Minimal Transfer Resolution**: Pairwise debt netting algorithm computing the exact simplified transfers to clear all debts.
- **Recurring Utilities Deck**: Track recurring household bills (Rent, Electricity, Wi-Fi, LPG) with countdown status pills (`Due in X days`, `Overdue by Xd`, `Paid for Month`) and `[ Pay & Split ]` automated settlement logging.

### ⚡ Ambient Financial Intelligence & Frictionless UX
- **1-Box Magic Natural Language Input (`nlpParser.js`)**: Deterministic multi-pass natural language parser extracting amount, merchant, category, split member, payment method, and date from natural phrases (e.g., `"Swiggy 350 lunch with Priya upi yesterday"`).
- **Offline Merchant Classification (`categoryMatcher.js`)**: Offline merchant dictionary and auto-categorization engine with user-trained keyword memory overrides.
- **"What-If" Spending Impact Simulator (`foresightEngine.js`)**: Real-time spending simulation calculating daily budget pace drops and burnout trajectories before making purchases.
- **Notifications Engine (`NotificationEngine.js`)**: Ambient alert center evaluating upcoming bill due dates, budget overruns (80% / 100% thresholds), and settlement reminders.
- **Brand Logo Privacy Mode**: One-click currency blur toggle (`P` / logo click) smoothly obscuring financial figures (`filter: blur(7px)`) (ADR-003).
- **Global Quick-Add Floating Pill Widget (`quickPill.html` / `Ctrl+Alt+L`)**: Frameless, translucent, always-on-top desktop mini-entry widget.

---

## [0.2.0] - Visual Design Language System (DLS) & Modernization (2026-08-28)

### 🎨 Design Language System (Theme 3: "The Modern Indian Household")
- Adopted and implemented **Theme 3** across all screens (ADR-001):
  - Canvas: Velvety Warm Graphite (`#121317`)
  - Elevated Surfaces: Deep Elevated Slate (`#1A1C23`)
  - Structural Borders: Warm Slate (`#2D303C`)
  - Signature Accent: **Spiced Chai Amber (`#D9822B` ➔ `#E5943C`)**
  - Semantic Status: Muted Jade Emerald (`#10B981`) and Crimson Rose (`#E11D48`).

### 🔤 Typography & Vector Iconography Overhaul
- **Inter & JetBrains Mono**: Bundled Inter for crisp UI readability and JetBrains Mono latin subsets for tabular figures, currency amounts, and timestamps (ADR-006).
- **93-Icon Lucide SVG Vector Registry (`src/icons.js`)**: Replaced all OS emoji characters with an inline SVG vector icon engine (`icon(name, size, cls)` and `hydrateIcons()`) (ADR-006).
- **Monogram Initial Avatar Badges**: Dynamic 1–2 uppercase monogram badges (`renderMonogram`) with 8-accent color dot selector (ADR-006).
- **100% Offline Asset Bundling**: Stored all fonts in `assets/fonts/` and bundled Chart.js at `assets/js/chart.umd.js`, eliminating external CDN dependencies.

### 🏛️ Multi-Section Workspaces Redesign
- Complete visual and layout overhaul for **Dashboard**, **Household Split**, **Expense Feed**, **Batch Entry**, **Contextual Notes**, and **Settings** with generous vertical spacing and consistent elevation (ADR-004).
- **Domain Language Standardization**: Standardized terminology across the application — "Profiles" strictly for user tracking spaces vs. "Household Members" for split counterparties (ADR-007).

---

## [0.1.0] - Desktop Core Foundation & 100% Offline Architecture (2026-08-21)

### 💻 Platform & Core Data Storage
- Standalone Electron desktop application running 100% offline without cloud accounts, trackers, or internet requirements.
- Local atomic JSON database (`expenses_db.json`) for persistence in the user's local application data directory.
- Local receipt photo store (`src/receiptStorage.js`) copying receipt images (JPG, PNG, WebP, GIF) to local disk with native file dialog pickers.

### ⚡ Low-Friction Entry System
- **Auto-Focused Express Entry Bar**: Cursor automatically focuses on launch; rapid tab-based keyboard flow (`Amount → Tab → Title → Enter`).
- **One-Click Frequent Presets**: User-customizable quick buttons for recurring daily expenses (`☕ Coffee`, `🍱 Lunch`, `⛽ Fuel`).
- **Inline Spreadsheet Batch Mode**: Continuous keyboard-driven spreadsheet table (`Tab`/`Enter`) for logging multiple transactions rapidly.

### 💰 Salary Allocator & Daily Budget Pacing
- Monthly income and fixed recurring bills deduction.
- **Daily Budget Pace**: Dynamic safe daily spending allowance calculation (`remaining disposable ÷ days left in cycle`).
- **Daily Rollover**: Unspent daily allowance carries forward automatically to subsequent days.
- **Shared Household Member Tracking**: Member tagging, equal and custom split ratios per expense, and basic debt summary.
- **Frameless Window Shell**: Custom draggable titlebar with minimize, maximize, and close controls.
