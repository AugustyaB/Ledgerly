# 🔄 Ledgerly — System Architecture & Wireframe Matrix (`FLOW.md`)

> **Version Cycle**: `v0.8.5-certified` | **Status**: **ACTIVE & CANONICAL (ADR-013)**
> **Header-First Rule (Tier 2):** Read **Lines 1–42 only** (~450 tokens) for the complete 5-Layer × 6-Section codebase and wireframe map. Read Line 43+ only when deep section wireframe blueprints or IPC flow diagrams are needed.

---

## 🗺️ 1. The 5 Horizontal Layers (Bottom-to-Top Stack)

1. **🗄️ Layer 1 — Data & Persistence (`L1`):**
   - Partitioned JSON DB: `data/active_ledger.json` (<90d) & `data/legacy_archive.json` (>90d) via `src/services/JsonDatabase.js` & `src/storage.js`
   - Config, Schemas & Constants: `expenses_config.json` (`behavioralProfiles_v1`, `deduplicationSignatures_v1`, `securityConfig_v1`, `merchantAliases`), `src/constants.js`, `src/types.js`
   - Binary & Vault Store: `src/receiptStorage.js` (photos), `src/services/BackupMirrorService.js` (SHA-256 mirror), `mobile/src/storage/indexedDbQueue.js` & `mobileSettings.js`
2. **⚙️ Layer 2 — Core Domain Services (`L2` — CRUD & Integrity):**
   - Core CRUD: `ExpenseService.js`, `BudgetService.js`, `ProfileService.js`, `HouseholdService.js`, `NotesService.js`, `AuthService.js`
   - Self-Healing & Diagnostics: `DatabaseAuditor.js`, `DataQualityAuditor.js`, `DiagnosticExporter.js`, `src/logger/crashLogger.js`
3. **🧠 Layer 3 — Intelligence & Automation (`L3` — Math, Heuristics & Offline ML):**
   - Receipt Vision: `DocumentIntelligenceService.js`, `DocumentNormalizer.js`, `ReceiptTier1Engine.js`, `ReceiptTier2VisionEngine.js`, `ReceiptTier3RegionalEngine.js`, `ReceiptLearningService.js`, `ModelManager.js`, `RegionalIntelligenceRegistry.js`, `SmartDocumentAnalyzer.js`, `mobile/src/camera/cameraService.js`, `mobile/src/camera/imageCompressor.js`
   - Financial & Statement Math: `FinancialIntelligenceFacade.js`, `AggregationRollupService.js`, `StatementReconciliationService.js`, `SubscriptionHunterService.js`, `src/foresightEngine.js`, `NotificationEngine.js`, `src/nlpParser.js`, `src/categoryMatcher.js`, `src/fileImporter.js`
4. **🔌 Layer 4 — IPC Bridge, Validation & LAN Transport (`L4`):**
   - Desktop IPC: `src/main.js`, `src/preload.js`, `src/validation/ipcGuard.js`, `src/validation/schemaValidator.js`
   - LAN Sync & Discovery: `src/services/SyncServer.js` (HTTP), `src/services/LanBeaconService.js` (UDP 52411), `src/services/SyncEngine.js`, `mobile/src/services/SyncClient.js`, `mobile/src/shared/validator.js`
5. **🎨 Layer 5 — Presentation & Visuals (`L5A` Stateful Views vs. `L5B` Pure Visuals):**
   - **`L5A` Stateful Feature Views (IPC-Connected):** `src/app.js`, `AppRouter.js`, `AppState.js`, `DashboardView.js`, `ExpenseFeedView.js`, `BatchView.js`, `ImportView.js`, `HouseholdView.js`, `NotesView.js`, `NotificationView.js`, `SettingsView.js`, `AuthScreen.js`, `ErrorBoundary.js`, `quickPill.js`; Mobile: `mobile/src/main.js`, `router.js`, `CaptureView.js`, `QueueView.js`, `QuickAddView.js`, `SyncView.js`
   - **`L5B` Pure Visuals (Zero Backend / Stateless UI):** `src/styles.css`, `mobile/src/styles/mobile.css` (Theme 3 tokens), `src/icons.js` & `mobile/src/icons.js`, `src/utils/qrCodeGenerator.js`, `ChartManager.js`, `CommandPalette.js`, `dom.js`, `formatters.js`, `toast.js`

---

## 🧩 2. The 6 Product Wireframe Sections (2D Layer × Section Matrix)

| Wireframe Section | `L5B` Pure Visuals (Zero Backend) | `L5A` Stateful UI Views | `L3` Intelligence & Math | `L1–L2` Core Services & Data |
|---|---|---|---|---|
| **Sec 1: Fast Entry & Ledger** | Preset chip pills, spreadsheet focus grid, `formatters.js`, `constants.js` | `DashboardView` (Express Bar), `BatchView`, `ExpenseFeedView`, `quickPill` | `nlpParser.js`, `categoryMatcher.js` | `ExpenseService`, `active_ledger.json`, `legacy_archive.json` |
| **Sec 2: Budget, Pace & Foresight** | Chart.js canvases (`ChartManager.js`), pace gauges | `DashboardView` (What-If simulator), `NotificationView` | `foresightEngine`, `SubscriptionHunterService`, `AggregationRollupService`, `NotificationEngine` | `BudgetService`, `behavioralProfiles_v1` |
| **Sec 3: Receipts & Statements** | Confidence badges, Tri-State tabs | `ImportView` (Staging & Reconciliation Cockpit) | `DocumentIntelligenceService`, `ReceiptTier1-3`, `ReceiptLearningService`, `StatementReconciliationService` | `fileImporter`, `receiptStorage`, `deduplicationSignatures_v1` |
| **Sec 4: Household & Profiles** | Monogram avatars, debt flow arrows (`──▶`), bill countdown pills | `HouseholdView`, `NotesView`, Profile Switcher | Pairwise greedy debt settlement math | `HouseholdService`, `ProfileService`, `NotesService` |
| **Sec 5: Mobile & LAN Sync** | `qrCodeGenerator.js` (SVG matrix), OpenGym 4-tab dock | `SettingsView` (Sync pane), Mobile `CaptureView`, `QueueView`, `QuickAddView`, `SyncView` | `imageCompressor.js` (1600px Canvas), `BarcodeDetector` QR scan | `SyncServer`, `LanBeaconService`, `SyncClient`, `indexedDbQueue` |
| **Sec 6: Security & Vault** | Privacy Mode blur (`P`), `CommandPalette`, `toast`, `dom` | `AuthScreen`, `ErrorBoundary`, `SettingsView` (Security & Mirror panes) | SHA-256 manifest verifier, IP rate-limit bucket | `AuthService`, `BackupMirrorService`, `DatabaseAuditor`, `crashLogger` |

---

## 🏛️ 3. Master 5-Layer System Stack Diagram (Deep Reference — Line 43+)

> **Layer Dependency Contract (Enforced by `scripts/check-architecture-layers.js`):**
> - **`L5B` (Pure Visuals):** Strictly zero IPC (`window.api`, `ipcRenderer`) and zero backend imports (`L1–L4`).
> - **Unidirectional Downward Flow:** `L5A` $\rightarrow$ `L4` $\rightarrow$ `L3` $\rightarrow$ `L2` $\rightarrow$ `L1`. Lower layers (`L1–L3`) never import `L4` (`main.js`/`preload.js`) or `L5` UI.

```text
+=========================================================================================+
| 🎨 LAYER 5: PRESENTATION & VISUALS (Renderer / Mobile WebView)                          |
|-----------------------------------------------------------------------------------------|
| [L5B: Pure Visuals — Zero Backend / Zero IPC]                                           |
| • Theme 3 CSS (Graphite #121316 & Spiced Chai Amber #F59E0B) • 93 Lucide SVG Icons      |
| • qrCodeGenerator.js (<2.2ms SVG) • ChartManager.js • CommandPalette.js                 |
| • Helpers: dom.js, formatters.js, toast.js, constants.js, types.js                      |
|-----------------------------------------------------------------------------------------|
| [L5A: Stateful Feature Views — IPC / SyncClient Connected]                              |
| • Desktop: app.js, AppRouter, AppState, DashboardView, ExpenseFeedView, BatchView,      |
|   ImportView, HouseholdView, NotesView, NotificationView, SettingsView, AuthScreen,     |
|   ErrorBoundary, quickPill.js                                                           |
| • Mobile: main.js, router.js, CaptureView, QuickAddView, QueueView, SyncView            |
+=========================================================================================+
                                           │  ▲
                            window.api.*   │  │   HTTP /api/v1/* + UDP 52411
                                           ▼  │
+=========================================================================================+
| 🔌 LAYER 4: IPC BRIDGE, VALIDATION & LAN TRANSPORT                                      |
| • Desktop IPC: src/main.js, src/preload.js, ipcGuard.js, schemaValidator.js             |
| • LAN Transport: SyncServer.js (HTTP + Per-IP Rate Limiter), LanBeaconService.js (UDP), |
|   SyncEngine.js, mobile/src/services/SyncClient.js, mobile/src/shared/validator.js      |
+=========================================================================================+
                                           │  ▲
                                           ▼  │
+=========================================================================================+
| 🧠 LAYER 3: INTELLIGENCE & AUTOMATION (Offline ML, Heuristics & Financial Math)         |
| • Vision Pipeline: DocumentIntelligenceService, DocumentNormalizer, ReceiptTier1Engine, |
|   ReceiptTier2VisionEngine, ReceiptTier3RegionalEngine, ReceiptLearningService,         |
|   ModelManager, RegionalIntelligenceRegistry, SmartDocumentAnalyzer                     |
| • Financial Math: FinancialIntelligenceFacade, AggregationRollupService (<2.2ms),       |
|   StatementReconciliationService (Fuzzy + Coffee Invariant), SubscriptionHunterService, |
|   foresightEngine.js (>20d Burn Rate), NotificationEngine, nlpParser, categoryMatcher   |
+=========================================================================================+
                                           │  ▲
                                           ▼  │
+=========================================================================================+
| ⚙️ LAYER 2: CORE DOMAIN SERVICES (Deterministic CRUD & Self-Healing Integrity)          |
| • Domain CRUD: ExpenseService, BudgetService, ProfileService, HouseholdService,         |
|   NotesService, AuthService                                                             |
| • Self-Healing & Diagnostics: DatabaseAuditor, DataQualityAuditor, DiagnosticExporter,  |
|   src/logger/crashLogger.js                                                             |
+=========================================================================================+
                                           │  ▲
                                           ▼  │
+=========================================================================================+
| 🗄️ LAYER 1: DATA & PERSISTENCE (Partitioned Local Disk & Encrypted Vaults)              |
| • Partitioned JSON DB (JsonDatabase.js / storage.js):                                   |
|   ├── data/active_ledger.json (<90 days hot window)                                     |
|   ├── data/legacy_archive.json (>90 days historical partitions)                         |
|   └── expenses_config.json (Aliases, Layouts, Behavioral, Dedup, SecurityConfig_v1)     |
| • Binary & Mirror: receiptStorage.js, BackupMirrorService.js (SHA-256 Vault),           |
|   mobile/src/storage/indexedDbQueue.js & mobileSettings.js                              |
+=========================================================================================+
```

---

## 📐 4. Section-by-Section Wireframe & Layer Blueprints (`Sec 1` – `Sec 6`)

### Section 1 (`Sec 1`): Fast Entry & Ledger
- **Wireframe Surfaces (`L5A` + `L5B`):**
  1. **Express Bar (`DashboardView.js`):** Single-line natural language input (`"450 lunch at Udupi today #food"`) + live parsed preview pills (`L5B`).
  2. **1-Click Preset Chips (`DashboardView.js`):** Customizable quick-fire expense chips with instant toast Undo (`toast.js`).
  3. **Global Quick Pill (`quickPill.js`):** `Ctrl+Shift+L` floating desktop overlay for zero-context-switch logging.
  4. **Batch Entry Grid (`BatchView.js`):** Keyboard-driven spreadsheet (`Enter`/`Tab` navigation) for bulk logging.
  5. **Master Expense Feed (`ExpenseFeedView.js`):** Virtualized/filtered transaction table with inline search, category tags, and receipt lightbox.
- **Layer Execution Path:**
  `L5A (DashboardView / BatchView / ExpenseFeedView)` $\rightarrow$ `L4 (ipcGuard + schemaValidator)` $\rightarrow$ `L3 (nlpParser + categoryMatcher)` $\rightarrow$ `L2 (ExpenseService)` $\rightarrow$ `L1 (JsonDatabase: active_ledger.json / legacy_archive.json)`.

---

### Section 2 (`Sec 2`): Budget, Pace & Foresight
- **Wireframe Surfaces (`L5A` + `L5B`):**
  1. **Salary Pace & Safe-to-Spend Hero (`DashboardView.js`):** Displays daily safe-to-spend allowance, rollover balance, and payday shift chips.
  2. **Chart.js Visual Analytics (`ChartManager.js` — `L5B`):** Category doughnut chart, 30-day spending velocity bar chart, and cumulative pace curve.
  3. **Data-Gated "What-If" Burn-Rate Simulator (`DashboardView.js`):** Interactive purchase simulator calculating days-to-zero impact (unlocked after $\ge 20$ days of ledger history).
  4. **"Zombie" Subscription Hunter (`DashboardView.js` / `NotificationView.js`):** Flags recurring weekly/monthly/annual charges and silent price hikes.
- **Layer Execution Path:**
  `L5B (ChartManager)` $\leftarrow$ `L5A (DashboardView / NotificationView)` $\rightarrow$ `L4 (IPC)` $\rightarrow$ `L3 (FinancialIntelligenceFacade, AggregationRollupService, foresightEngine, SubscriptionHunterService, NotificationEngine)` $\rightarrow$ `L2 (BudgetService)` $\rightarrow$ `L1 (behavioralProfiles_v1)`.

---

### Section 3 (`Sec 3`): Receipts & Statements
- **Wireframe Surfaces (`L5A` + `L5B`):**
  1. **Multi-Format Dropzone (`ImportView.js`):** Accepts `.csv`, `.xlsx`, `.pdf`, `.jpg`, `.png`, `.webp`.
  2. **Adaptive Receipt Review Modal (`ImportView.js`):** Displays extracted `merchant`, `date`, `total`, `tax` with field-level confidence badges (`L5B`), highlighting `lowConfidenceFields` (`<0.75`). User edits trigger `ReceiptLearningService` (`1.0` alias auto-resolution on future scans).
  3. **Tri-State Reconciliation Cockpit (`ImportView.js`):** Separates statement rows into 🟢 *Matched & Merged* ($\pm 5\%$ amount, $\pm 48\text{h}$ date, Coffee Invariant protected), 🔵 *Net-New*, and 🟠 *Conflict*.
- **Layer Execution Path:**
  `L5A (ImportView)` $\rightarrow$ `L4 (IPC)` $\rightarrow$ `L3 (DocumentIntelligenceService, DocumentNormalizer, ReceiptTier1-3, ReceiptLearningService, StatementReconciliationService, fileImporter)` $\rightarrow$ `L1 (receiptStorage.js, deduplicationSignatures_v1)`.

---

### Section 4 (`Sec 4`): Household & Profiles
- **Wireframe Surfaces (`L5A` + `L5B`):**
  1. **Multi-Profile Workspace Switcher (`AppRouter.js` / Sidebar):** Isolates personal, business, and family ledgers with monogram avatars (`L5B`).
  2. **Household Split & Pairwise Debt Settlement (`HouseholdView.js`):** Visualizes minimum-transfer settlement flows (`Member A ──$42.50──▶ Member B`) and shared recurring bills with countdown badges.
  3. **Contextual Financial Notes (`NotesView.js`):** Pinned and archived financial notes per profile.
- **Layer Execution Path:**
  `L5A (HouseholdView / NotesView)` $\rightarrow$ `L4 (IPC)` $\rightarrow$ `L2 (HouseholdService, ProfileService, NotesService)` $\rightarrow$ `L1 (JsonDatabase)`.

---

### Section 5 (`Sec 5`): Mobile & LAN Sync
- **Wireframe Surfaces (`L5A` + `L5B`):**
  1. **Desktop LAN Pairing Card (`SettingsView.js` + `qrCodeGenerator.js` `L5B`):** Displays zero-dependency SVG QR matrix (`<2.2ms`), 6-digit PIN, 5-minute live countdown badge, and security lockout status.
  2. **Mobile 4-Tab Dock (`mobile/src/views/*`):**
     - `CaptureView.js`: Camera shutter $\rightarrow$ `imageCompressor.js` (`1600px` Canvas JPEG).
     - `QuickAddView.js`: Tactile calculator numpad for cash logging.
     - `QueueView.js`: Offline IndexedDB staging queue (`indexedDbQueue.js`).
     - `SyncView.js`: 1-tap `[ Scan QR Code ]` optical viewfinder (`BarcodeDetector` / fallback) + UDP auto-discovery (`DISCOVER_LEDGERLY` on port `52411`).
- **Layer Execution Path:**
  `Mobile L5A (SyncView)` $\rightarrow$ `L4 (SyncClient <-> LanBeaconService UDP 52411 & SyncServer HTTP /api/v1/*)` $\rightarrow$ `L4 (SyncEngine)` $\rightarrow$ `L1–L3 (Desktop Storage & Receipt Vision)`.

---

### Section 6 (`Sec 6`): Security, Vault & Self-Healing
- **Wireframe Surfaces (`L5A` + `L5B`):**
  1. **Local Account Lock & Recovery (`AuthScreen.js`):** PBKDF2-SHA512 authentication and 12-word recovery phrase verification.
  2. **Global Privacy Blur & Command Palette (`L5B`):** Single-key `P` privacy blur across all monetary values; `Ctrl+K` `CommandPalette.js`.
  3. **Global Error Boundary (`ErrorBoundary.js`):** Traps renderer exceptions into recovery banners and forwards sanitized stacks to `crashLogger.js`.
  4. **Continuous Mirror Vault & Diagnostics (`SettingsView.js`):** SHA-256 verified backup folder mirroring (`BackupMirrorService.js`), 1-click self-healing database audit (`DatabaseAuditor.js`), and path-masked telemetry bundle export (`DiagnosticExporter.js`).
- **Layer Execution Path:**
  `L5A (AuthScreen / ErrorBoundary / SettingsView)` $\rightarrow$ `L4 (IPC + SyncServer IP Rate Limiter)` $\rightarrow$ `L2 (AuthService, DatabaseAuditor, DataQualityAuditor, DiagnosticExporter, crashLogger)` $\rightarrow$ `L1 (BackupMirrorService, securityConfig_v1)`.
