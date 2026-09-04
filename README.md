# 💳 Ledgerly

> **A friction-free, 100% offline desktop application for daily budget tracking and shared household spending.**

Built to eliminate the "data entry chore" of traditional finance apps. No cloud accounts, no complex setup, no internet required. Open the app, log your expense, close it — done in under 5 seconds.

---

## 🧠 Why This Exists

Most expense tracking tools fall into two traps:

1. **Too tedious** — They feel like a chore to add data to. You stop using them after a week.
2. **Too complex** — Tools like Notion require extensive setup, knowledge of their features, and ongoing maintenance just to build a simple budget dashboard.

This app sits in between: **quick to set up, effortless to use daily, and powerful enough to compete with open-source finance trackers** — all while keeping your financial data 100% private on your own machine.

---

## ✅ Current Feature Set (Phases 1–4 Complete)

### Expense Management
- Add, edit, delete, and search expenses
- Custom expense categories (user-created and managed)
- Filter by category, date range, and sort order
- Tags and descriptions on each transaction

### Low-Friction Desktop Input
- **Auto-Focused Express Entry Bar** — Cursor focuses on launch; type Amount → Tab → Title → Enter
- **One-Click Frequent Presets** — Customizable quick buttons for daily recurring expenses (Coffee, Lunch, Gas, etc.)
- **Inline Spreadsheet Batch Mode** — Rapid continuous row-by-row entry for logging multiple items at once

### Salary & Daily Budget Engine
- Monthly salary/income input
- Fixed recurring bills deduction
- Automatic **Daily Budget Pace** calculation (remaining disposable ÷ days left)
- **Daily Rollover** — Unspent daily budget carries forward to the next day

### Shared Household Tracking
- Add and manage household members
- Tag expenses to specific members or mark as shared/joint
- Custom split ratios per expense
- **Settlement Calculator** — Shows who owes whom at the end of the period

### Receipt Photo Storage
- Attach local receipt images (JPG, PNG, WebP, GIF) to any expense
- Photos stored locally on disk in a dedicated receipts directory
- Native file picker dialog for selecting images

### Universal File Importer & Exporter (Phase 5)
- **Universal Importer**: Parse bank statements and files in **CSV**, **Excel (XLS/XLSX)**, **OFX**, **QFX**, **JSON**, and text-based **PDF** formats
- **Interactive Import Preview**: Inspect, preview, and confirm imported records before committing to database
- **Drag-and-Drop Dropzone**: Drop any supported financial file directly into the desktop window
- **Universal Exporter**: Export data to **CSV**, **JSON Backup**, and formatted **Excel (.xlsx)** spreadsheets

### Contextual Notes & Reflections (Phase 5)
- Attach memos, reflections, and insights at 4 contextual levels: **Transaction**, **Day**, **Week**, or **Month**
- **Dedicated Notes Tab**: Browse, search, filter, edit, and delete all notes in a unified workspace
- **Inline Note Badges**: View and add notes directly from table rows in the Expense Feed

### Desktop Native UI
- Custom frameless window with glassmorphic dark-mode design
- Draggable titlebar with minimize / maximize / close controls
- Responsive sidebar navigation with Dashboard, Household, Batch, Expenses, and Notes tabs
- Interactive Chart.js analytics (Category Donut Chart, Monthly Trend Bar Chart)
- Budget progress bar with overspend warnings

---

## 🏆 Project Status & Implementation Roadmap

| Phase | Deliverable | Status |
|---|---|---|
| **Phase 1** | Specification & 5 Foundational Pillars Discovery | ✅ Complete |
| **Phase 2** | Desktop Core Architecture & 100% Offline Storage Setup | ✅ Complete |
| **Phase 3** | Desktop UI Shell & Low-Friction Entry (Express Bar, Presets, Batch Mode) | ✅ Complete |
| **Phase 4** | Salary Allocator, Daily Budget Pacing & Shared Household Debt Splitter | ✅ Complete |
| **Phase 5** | Universal File Importer (CSV, XLS/XLSX, OFX, QFX, JSON, PDF) & Contextual Notes | ✅ Complete |
| **Phase 6** | End-to-End Verification, Empirical Validation & Desktop Packaging Config | ✅ Complete |

---

## 🏛️ The 5 Foundational Pillars

These pillars were defined during the discovery phase and drive every design decision:

1. **Problem & Purpose** — Solve the "data entry chore"; quick setup (Anti-Notion); daily budget tracking & shared household spending.
2. **User Workflows** — 100% offline; universal imports (CSV, XLS, OFX, QFX, PDF); universal exports (JSON, CSV, Excel); custom categories, notes, local receipt photos.
3. **Data & Privacy** — 100% offline local disk storage; full user data ownership via non-proprietary export formats.
4. **Platform** — Standalone Desktop Application (Windows).
5. **MVP Scope** — Salary allocator, daily budget pace & rollover, quick expense entry, receipt photos, contextual notes, file imports/exports.

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop Runtime | [Electron](https://www.electronjs.org/) v33 |
| Language | Vanilla JavaScript (ES6+) |
| Styling | Custom CSS Design System (glassmorphism, dark mode, design tokens) |
| Charts | [Chart.js](https://www.chartjs.org/) |
| Data Storage | Local JSON file (`expenses_db.json` in user app data directory) |
| Receipt Storage | Local filesystem directory (images copied to app data path) |

---

## 📂 Project Structure

```
├── src/
│   ├── main.js              # Electron main process — window, IPC handlers, file dialogs
│   ├── preload.js           # Context bridge — secure IPC API exposed to renderer
│   ├── storage.js           # Data engine — expenses, categories, presets, salary, household, budget
│   ├── receiptStorage.js    # Receipt image file manager — save, delete, path resolution
│   ├── index.html           # Desktop UI markup — layout, modals, forms, charts
│   ├── app.js               # Renderer logic — state management, DOM rendering, event handlers
│   └── styles.css           # Design system — glassmorphism theme, components, animations
│
├── .gsd/
│   ├── SPEC.md              # Finalized project specification & 5 Foundational Pillars
│   ├── ROADMAP.md           # Phase-by-phase implementation progress
│   └── STATE.md             # Session state checkpoint & decision log
│
├── PROJECT_RULES.md         # GSD canonical rules (SPEC → PLAN → EXECUTE → VERIFY → COMMIT)
├── GSD-STYLE.md             # Code style & contribution conventions
├── package.json             # Node.js / Electron project manifest
└── README.md                # This file
```

---

---

## 🚀 Getting Started & How to Launch

### Prerequisites
Before running Ledgerly, ensure you have [Node.js](https://nodejs.org/) installed (v18 or higher; v24.18.0 tested & verified).

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

1. Open a terminal (PowerShell or CMD) in the project root directory.
2. If this is your first time or dependencies were recently updated, install the packages:
   ```powershell
   npm install
   ```
3. Start the application:
   ```powershell
   npm start
   ```

---

### 🧪 Running Verification & Test Suites

You can run automated test suites anytime from your terminal:

```powershell
# Run the complete end-to-end integration test suite (8 subsystems)
npm run test:e2e

# Run Phase 5 import & contextual notes unit tests
npm run test:phase5

# Check JavaScript syntax across all source files
npm run check
```

---

### 🧭 First-Time Usage Guide (What to Click First)

1. **⚡ Fast Logging (Express Bar)**: Look at the top bar on the Dashboard. Type an expense title (e.g. `Lunch`), amount (`15.00`), pick a category, and hit **Enter** or click **Quick Add**.
2. **⭐ One-Click Presets**: Click any preset button (`☕ Morning Coffee`, `🍱 Work Lunch`, `⛽ Gasoline`) to log standard recurring items in 1 single click.
3. **⚙️ Salary & Budget Pace**: Click **"Salary Budget"** at the top right, enter your monthly income and fixed bills, and click **Save**. The top **Daily Spending Allowance** card will dynamically show your daily safe spending pace and rollover balance!
4. **👥 Household Splitting**: Switch to the **Household Split** tab on the left to see who paid for what and check the automatic **Pairwise Debt Resolution** (*e.g., "Bob owes Self $30"*).
5. **📋 Batch Entry**: Switch to the **Batch Entry** tab to log multiple transactions continuously using your keyboard (`Tab` / `Enter`).
6. **📝 Contextual Notes**: Switch to the **Contextual Notes** tab to write financial reflections tied to specific days, weeks, months, or transactions. You can also click the `📝` icon on any row in the expense feed.
7. **📥 Universal Import**: Drag any CSV, Excel (`.xlsx`), OFX, QFX, JSON, or text PDF statement and drop it directly onto the app window to preview and import records.
8. **📊 Export Data**: Click **"Export Excel"**, **"CSV"**, or **"Backup JSON"** in the top right to download clean reports anytime.

---

### ❓ Troubleshooting

| Issue | Solution |
|---|---|
| `'npm' or 'node' is not recognized` | Install [Node.js](https://nodejs.org/) and ensure "Add to PATH" is checked during installation. |
| Window doesn't appear | Check if the app is minimized in your Windows taskbar, or run `npm install` in terminal. |
| Need to reset test data | Delete the `scratch/test_userdata/expenses_db.json` file to restore default sample records. |

---

## 📋 Development Methodology

This project follows the **[Get Shit Done (GSD)](get-shit-done-for-antigravity/README.md)** spec-driven methodology:

- **SPEC → PLAN → EXECUTE → VERIFY → COMMIT**
- All requirements locked in [`.gsd/SPEC.md`](.gsd/SPEC.md) before any code is written
- Session state and decisions tracked in [`.gsd/STATE.md`](.gsd/STATE.md)
- Phase progress recorded in [`.gsd/ROADMAP.md`](.gsd/ROADMAP.md)

---

## 📄 License

MIT
