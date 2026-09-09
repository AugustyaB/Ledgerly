# 💳 Ledgerly

> **A friction-free, 100% offline desktop application for daily budget tracking and shared household spending.**  
> **Current Version**: `v0.4.7` (Phase 7 of `v0.4` completed — Concludes Version 0.4 Milestone) — *Major Restructuring of the Code Improving Its Readability & Resilience* (succeeding `v0.3.0`)

Built to eliminate the "data entry chore" of traditional finance apps. No cloud accounts, no complex setup, no internet required. Open the app, log your expense, close it — done in under 5 seconds.

---

## 🧠 Why This Exists

Most expense tracking tools fall into two traps:

1. **Too tedious** — They feel like a chore to add data to. You stop using them after a week.
2. **Too complex** — Tools like Notion require extensive setup, knowledge of their features, and ongoing maintenance just to build a simple budget dashboard.

This app sits in between: **quick to set up, effortless to use daily, and powerful enough to compete with open-source finance trackers** — all while keeping your financial data 100% private on your own machine.

---

## 🏛️ Version 0.4 Architecture & Code Readability Overhaul

In **Version 0.4**, Ledgerly underwent a complete architectural decomposition to eliminate monolith syndrome and establish clean code readability standards:

- **🏗️ Backend Domain Service Decomposition (`src/services/`)**:
  - The monolithic `src/storage.js` file was dismantled into 8 focused domain services (`AuthService`, `ProfileService`, `ExpenseService`, `BudgetService`, `HouseholdService`, `NotesService`, `NotificationEngine`, `fileImporter`).
  - `src/storage.js` remains as a lightweight API Facade, ensuring 100% backward compatibility for all IPC channels in `src/main.js`.
- **🎨 Frontend Modular Architecture (`src/ui/`)**:
  - Replaced the single-file renderer with native ES modules (`<script type="module" src="app.js">`).
  - Separated concerns into `AppState.js` (centralized reactive store), `AppRouter.js` (tab router with isolated error boundaries), 8 dedicated view controllers, and 3 standalone UI components.
  - Reduced `src/app.js` orchestrator from **4,862 lines down to 567 lines** (**88.3% line reduction**).
- **🛡️ IPC Runtime Schema Validation & Error Envelope Standardization (`src/validation/`)**:
  - Created zero-dependency runtime schema engine (`src/validation/schemaValidator.js`) enforcing boundary contracts for expenses, profiles, budgets, members, settlements, notes, recurring bills, and safe IDs.
  - Intercepted all `ipcMain.handle` channels via `src/validation/ipcGuard.js`, standardizing wire responses to uniform `{ success, data, error, code, details }` envelopes and catching unexpected exceptions safely.
  - Updated `src/preload.js` with safe invocation (`invokeIPC`) maintaining 100% backward compatibility for existing callers.
- **🛡️ Global UI Error Boundaries & Crash Resilience (`v0.4.6`)**:
  - UI Error Boundary (`src/ui/components/ErrorBoundary.js`): Replaces blank white-screen freezes with in-app recovery cards offering "Retry Section", "Return to Dashboard", and "Copy Diagnostics".
  - Main & Renderer Crash Logging (`src/logger/crashLogger.js`): Persistent structured JSON/ISO-timestamped crash logger with 5MB file rotation handling main process `uncaughtException`, `unhandledRejection`, `render-process-gone`, and renderer `window.onerror`.
  - Universal Importer Protections: 50MB file size ceiling, 25,000 row capping with truncate warnings, and memory exhaustion safeguards.
  - Remediated Audit Defects: `BUG-001` (currency decimal preservation), `BUG-002` (test environment database isolation), `BUG-003` (ESLint 0 errors, 0 warnings), `BUG-004` (strict throwing assertions).
- **🩺 Enterprise Resilience, Startup DB Integrity & Offline Sync (`v0.4.7`)**:
  - Self-Healing Startup Integrity Auditor (`src/services/DatabaseAuditor.js`): Runs on boot, sanitizes damaged amounts/dates, repairs orphaned notes, and snapshots `.pre-audit.bak` backups.
  - Privacy-Sanitized Offline Telemetry Exporter (`src/services/DiagnosticExporter.js`): Bundles hardware and runtime specs with username masking (`<USER_HOME>`, `<REDACTED>`) and credential scrubbing.
  - Offline Replication Sync Foundation (`src/services/SyncEngine.js`): Monotonic vector clocks, LWW tie-breaking, soft deletion tracking, and deterministic 3-way merge resolution.
  - Tier 2 UX Enhancements: Bounded 10-item action history with `Ctrl+Z` global undo, fuzzy statement deduplication (±2 days, ₹0.01 tolerance), proactive recurring bill due banners with 1-click execution, and safe Shunting-Yard arithmetic calculator in `CommandPalette.js`.
- **🔒 Zero Inline Event Handlers & Hardened CSP**:
  - Stripped all `onclick=`, `onchange=`, and `onsubmit=` inline attributes from HTML templates and DOM nodes.
  - Implemented semantic event delegation (`data-action="..."`, `data-tab="..."`) and explicit event listener bindings.
  - Hardened `Content-Security-Policy` to `script-src 'self'`, completely eliminating `'unsafe-inline'`.
- **📖 Strict Readability & Quality Standards**:
  - Standardized 2-space indentation and explicit visual section dividers (`// ==================== [SECTION] ====================`).
  - Comprehensive JSDoc type contracts referencing centralized types in `src/types.js`.
  - Headless SSR safety guards (`typeof document === 'undefined'`) across all UI modules for isolated automated testing.

For full architectural diagrams and lifecycle sequences, see [`FLOW.md`](FLOW.md) and [`DECISIONS.md`](DECISIONS.md#adr-011-enterprise-resilience-startup-integrity-auditing-privacy-telemetry--offline-conflict-engine-v047).

---

## ✅ Core Feature Set

### ⚡ Low-Friction Desktop Input
- **Auto-Focused Express Entry Bar** — Cursor focuses on launch; type Amount → Tab → Title → Enter.
- **One-Click Frequent Presets** — Customizable quick buttons for daily recurring expenses (`☕ Coffee`, `🍱 Lunch`, `⛽ Fuel`, etc.).
- **Inline Spreadsheet Batch Mode** — Rapid continuous row-by-row entry with date shorthand resolution (`t` for today, `y` for yesterday, `-N` for days ago).
- **Global Quick-Add Pill Widget** (`Ctrl+Alt+L`) — Frameless desktop mini-widget to log transactions in 2 seconds.

### 💰 Salary & Daily Budget Pace Engine
- Monthly salary/income input & fixed recurring bills deduction.
- **Daily Budget Pace** calculation (remaining disposable ÷ days left).
- **Daily Rollover** — Unspent daily budget carries forward to the next day.
- **Dynamic Color-Coded Budget Threshold Rings** — Emerald `Safe Pace` ➔ Amber `Moderate Pace` ➔ Crimson `Over Pace`.

### 👥 Shared Household Splitting & Debt Netting
- Multi-member household tracking with custom split shares per expense.
- **Pairwise Debt Resolution** — Mathematical debt netting showing simplified "who owes who" balances.
- **Settlement Calculator** — Record reimbursements and mark balances cleared with notes.

### 👤 Multi-Profile System
- Multi-user profile switcher allowing individual household members to enter isolated tracking spaces.
- Dynamic **Monogram Initial Avatars** with 8-color palette preview.
- One-click **Privacy Mode** (`P` / Logo Click) to blur financial figures during screen sharing.

### 📥 Universal File Importer & Exporter
- **Universal Importer**: Parse bank statements in **CSV**, **Excel (XLS/XLSX)**, **OFX**, **QFX**, **JSON**, and text **PDF** formats with formula injection sanitization.
- **Interactive Staging Preview**: Inspect, filter, and confirm imported records before committing to the database.
- **Universal Exporter**: Export data to **CSV**, **JSON Backup**, and formatted **Excel (.xlsx)** spreadsheets.

### 📝 Contextual Notes & Reflections
- Attach memos, reflections, and insights at 4 contextual levels: **Transaction**, **Day**, **Week**, or **Month**.
- Dedicated Notes workspace with search, scope filtering, and inline table badges.

### 📷 Receipt Photo Storage & Offline Assets
- Attach local receipt images (JPG, PNG, WebP, GIF) to any expense, stored safely on disk.
- 100% offline self-containment with bundled Inter fonts, JetBrains Mono, and Lucide vector icons.

---

## 🏆 Project Milestones & Roadmap

> [!NOTE]
> **Versioning Taxonomy & Phase Structure**:
> - The leading **`0`** signifies that the application is currently in its **Alpha Build Phase** (`0.x.x`) of active development. The official **`v1.0.0`** release will mark the production-ready build for user download and deployment.
> - The second number defines the **overall version/phase structure** (e.g., **`v0.4`** is the *Major Codebase Restructuring & Readability* cycle).
> - Each implementation phase forms a specific **subsection of that version** (e.g., **`v0.4.1`** through **`v0.4.7`**).

| Version / Phase | Deliverable & Architectural Focus | Status |
|---|---|---|
| **v0.1.0** | **Desktop Core Foundation**: Offline Electron runtime, local JSON db (`expenses_db.json`), express bar, presets, batch mode, salary pace & rollover, local receipts | ✅ Complete |
| **v0.2.0** | **Visual Design Language System**: Theme 3 (Graphite & Spiced Chai Amber), Inter & JetBrains Mono typography, 93 Lucide SVG icons, monogram avatars, offline Chart.js | ✅ Complete |
| **v0.3.0** | **Ambient Intelligence & Polish**: Multi-profile switcher, universal file importer/exporter (CSV/XLSX/OFX/PDF), contextual notes, pairwise debt netting, quick-add pill widget | ✅ Complete |
| **v0.4** | **Major Codebase Restructuring, Domain Decomposition & Readability** | 🔄 **In Progress (v0.4.4 Complete)** |
| ↳ **v0.4.1** (Phase 1) | Security Hardening Baseline (CSP, PBKDF2 210K, Sandbox) | ✅ Complete |
| ↳ **v0.4.2** (Phase 2) | Tooling, Type Contracts & Constants | ✅ Complete |
| ↳ **v0.4.3** (Phase 3) | Backend Domain Service Decomposition (8 Services, Facade) | ✅ Complete |
| ↳ **v0.4.4** (Phase 4) | Frontend Modular UI Decomposition & Event Delegation (Current) | ✅ **Complete** |
| ↳ **v0.4.5** (Phase 5) | IPC Runtime Schema Validation Layer & Error Contracts | ⏳ Next Subsection |
| ↳ **v0.4.6** (Phase 6) | Global UI Error Boundaries, Main Process Crash Traps & Streaming | 📋 Planned |
| ↳ **v0.4.7** (Phase 7) | Enterprise Resilience, Offline Mobile Sync Conflict Resolution | 📋 Planned |
| **v0.5+** | Mobile Responsive Web App (Android/iOS) & Local Network Peer Sync | 🚀 Roadmap |
| **v1.0.0** | **Official Production Release**: Production-ready deployment for user download | 🎯 Target Release |

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop Runtime | [Electron](https://www.electronjs.org/) v33 |
| Architecture | Modular ES Modules (Frontend) + CommonJS Domain Services (Backend) |
| Language | Vanilla JavaScript (ES2022+), JSDoc Typed |
| Styling | Custom CSS Design System (Theme 3: Graphite & Spiced Chai Amber) |
| Vector Icons | Lucide SVG Vector Icon Engine (`src/icons.js`) |
| Charts | Bundled Offline [Chart.js](https://www.chartjs.org/) v4 |
| Data Storage | Local Atomic JSON Database (`expenses_db.json` with `.bak` fallback) |
| Security | Strict CSP (`script-src 'self'`), PBKDF2-SHA512 (210K rounds), Formula Sanitization |

---

## 📂 Project Structure

```text
├── src/
│   ├── main.js                  # Electron main process & IPC routing
│   ├── preload.js               # Context bridge — secure window.electronAPI
│   ├── storage.js               # Backwards-compatible Storage Facade
│   ├── fileImporter.js          # Multi-format statement parser (CSV, XLSX, OFX, PDF)
│   ├── receiptStorage.js        # Local receipt image manager
│   ├── categoryMatcher.js       # Auto-categorization engine
│   ├── nlpParser.js             # Express entry natural language parser
│   ├── foresightEngine.js       # Ambient spending simulation engine
│   ├── icons.js                 # 93-icon Lucide SVG vector registry
│   ├── types.js                 # Central JSDoc type contracts
│   ├── constants.js             # Application constants & defaults
│   ├── index.html               # Frameless desktop layout shell (strict CSP)
│   ├── styles.css               # Design system & responsive layout styles
│   ├── app.js                   # Renderer orchestrator & bootstrapper (567 lines)
│   │
│   ├── database/
│   │   └── JsonDatabase.js      # Atomic temp-rename writer, lock retry & .bak self-healing
│   │
│   ├── services/                # Backend Domain Services (Phase 3 Decomposition)
│   │   ├── AuthService.js       # PBKDF2 hashing (210K rounds) & rate limiting
│   │   ├── ProfileService.js    # Multi-profile lifecycle & monogram generation
│   │   ├── ExpenseService.js    # Transaction CRUD, search, categories & presets
│   │   ├── BudgetService.js     # Salary allocation, daily budget pace & rollover
│   │   ├── HouseholdService.js  # Shared debt splitting & pairwise settlement
│   │   ├── NotesService.js      # Contextual memos (Transaction/Day/Week/Month)
│   │   └── NotificationEngine.js# Bill reminders, budget alerts & settlement notices
│   │
│   └── ui/                      # Frontend Modular UI (Phase 4 Decomposition)
│       ├── AppState.js          # Centralized reactive state store
│       ├── AppRouter.js         # Tab navigation router with error boundaries
│       ├── DashboardView.js     # Financial intelligence dashboard & express bar
│       ├── ExpenseFeedView.js   # Transaction ledger, search, filters & pagination
│       ├── HouseholdView.js     # Split bill workspace & pairwise debt matrix
│       ├── BatchView.js         # Spreadsheet-style rapid keyboard entry
│       ├── SettingsView.js      # Configuration, presets, salary & exports
│       ├── NotesView.js         # Dedicated reflections workspace
│       ├── NotificationView.js  # Smart alerts feed & dismiss controls
│       ├── ImportView.js        # File drag-and-drop & staging preview
│       ├── AuthScreen.js        # Lock overlay & first-run setup component
│       ├── CommandPalette.js    # Universal Ctrl+K search spotlight modal
│       └── ChartManager.js      # Isolated Chart.js lifecycle controller
│
├── assets/                      # Offline bundled fonts & vector graphics
├── docs/
│   └── FLOW.md                  # System architecture & lifecycle flow documentation
├── FLOW.md                      # Root system architecture & lifecycle flow documentation
├── DECISIONS.md                 # Architecture Decision Records (ADR-001 to ADR-008)
├── CHANGELOG.md                 # Version milestone history (v0.1.0 to v0.4.4)
├── FUTURE_PLANS.md              # Long-term feature roadmap & error hardening specs
├── PROJECT_RULES.md             # Canonical development rules
├── package.json                 # Node.js manifest & test scripts
└── README.md                    # This document
```

---

## 🚀 Getting Started & How to Launch

### Prerequisites
Before running Ledgerly, ensure you have [Node.js](https://nodejs.org/) installed (v18 or higher; v24 tested & verified).

---

### 🟢 Method 1: Double-Click Launcher (Easiest — No Terminal Needed)

1. Open your file explorer to this project folder:
   ```text
   E:\AG_saves\App Idea - Expense Logger\
   ```
2. Double-click the file named **`Run-Ledgerly.bat`**.
3. Ledgerly will launch immediately as a native desktop window on your screen.

---

### 💻 Method 2: Launch via Terminal (PowerShell / Command Prompt / VS Code)

1. Open a terminal in the project root directory.
2. Install dependencies (if first time or freshly cloned):
   ```powershell
   npm install
   ```
3. Start the application:
   ```powershell
   npm start
   ```

---

### 🧪 Running Verification & Test Suites

You can run automated verification test suites anytime:

```powershell
# Run Phase 6 resilience, error boundary, and defect remediation tests
npm run test:resilience

# Run Phase 5 runtime schema validation & IPC guard tests
npm run test:validation

# Run the complete end-to-end integration test suite (8 subsystems)
npm run test:e2e

# Run multi-profile scenario integration tests
npm run test:profiles

# Check JavaScript syntax across all 41 source files
npm run check

# Check linting and code quality (0 errors, 0 warnings)
npm run lint
```

---

## 🧭 First-Time Usage Guide

1. **⚡ Express Logging**: Look at the top bar on the Dashboard. Type an expense title (e.g. `Groceries`), amount (`45.00`), pick a category, and hit **Enter** or click **Quick Add**.
2. **⭐ One-Click Presets**: Click any preset button (`☕ Coffee`, `🍱 Lunch`, `⛽ Fuel`) to log recurring items in 1 single click.
3. **⚙️ Salary & Budget Pace**: Open **Settings**, configure your monthly income and fixed recurring bills. The top **Daily Spending Allowance** card will dynamically show your daily safe spending pace and rollover balance!
4. **👥 Household Splitting**: Switch to the **Household** tab to see who paid for what and check the automatic **Pairwise Debt Resolution** (*e.g., "Bob owes Rahul $30"*).
5. **📋 Batch Entry**: Switch to **Batch** to log multiple transactions rapidly using your keyboard (`Tab` / `Enter`).
6. **📝 Contextual Notes**: Switch to **Notes** to write financial reflections tied to specific days, weeks, months, or transactions.
7. **📥 Universal Import**: Drag any CSV, Excel (`.xlsx`), OFX, QFX, JSON, or text PDF statement directly into the app window to preview and import records.
8. **📊 Export Data**: Download clean reports in **CSV**, **Excel (.xlsx)**, or **JSON Backup** formats directly from Settings.

---

## 📄 License

MIT
