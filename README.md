# 💳 Ledgerly

> **A lightning-fast, 100% offline desktop application & mobile companion for effortless personal budgeting and shared household spending.**

[![Platform: Windows | macOS | Linux](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-blue?style=flat-square)](https://github.com/AugustyaB/Ledgerly/releases)
[![Mobile: Android | iOS](https://img.shields.io/badge/Mobile-Android%20%7C%20iOS-green?style=flat-square)](https://github.com/AugustyaB/Ledgerly/releases)
[![Privacy: 100% Offline / Zero-Cloud](https://img.shields.io/badge/Privacy-100%25%20Offline%20%2F%20Zero--Cloud-amber?style=flat-square&color=D9822B)](FLOW.md)
[![License: MIT](https://img.shields.io/badge/License-MIT-gray?style=flat-square)](LICENSE)

---

## ⚡ Quick Download & Installation

Get the latest pre-compiled binaries directly from this repository:

| Platform | Recommended Package | Download Link | Installation & Capabilities |
|---|---|---|---|
| **🪟 Windows (10/11)** | **`Ledgerly Setup 1.0.0.exe`** | [**📥 Download `.exe`**](https://github.com/AugustyaB/Ledgerly/releases/latest) | NSIS setup wizard with in-place repair and safe uninstall data retention. |
| **🤖 Android (8.0+)** | **`app-debug.apk`** *(8.61 MB)* | [**📥 Download `.apk`**](https://github.com/AugustyaB/Ledgerly/releases/latest) | Direct sideload APK with camera receipt intake & 1-tap Optical QR LAN pairing. |
| **🍎 macOS (Silicon/Intel)** | **`Ledgerly-1.0.0.dmg`** | [**📥 Download `.dmg`**](https://github.com/AugustyaB/Ledgerly/releases/latest) | Native drag-to-Applications `.dmg` image *(see macOS instructions below)*. |
| **🐧 Linux (Universal)** | **`Ledgerly-1.0.0.AppImage`** | [**📥 Download `.AppImage`**](https://github.com/AugustyaB/Ledgerly/releases/latest) | Standalone portable executable (`chmod +x Ledgerly-1.0.0.AppImage`). |
| **🍏 Apple iOS** | **`Ledgerly-iOS-App.xcarchive`** | [**📥 Download `.xcarchive`**](https://github.com/AugustyaB/Ledgerly/releases/latest) | Unsigned Xcode archive for iOS devices (sign via Xcode / Sideloadly / AltStore). |

> [!TIP]
> **🍎 Note for macOS Users:**
> 1. Download `Ledgerly-1.0.0.dmg` from [Releases](https://github.com/AugustyaB/Ledgerly/releases/latest), open it, and drag **Ledgerly** into your `Applications` folder.
> 2. On first launch, if macOS Gatekeeper prompts that the app is from an unidentified developer, right-click (or Control-click) `Ledgerly.app` in Applications ➔ select **Open** ➔ click **Open**.
> 3. *Alternative (Zero-Install Dev Mode):* Run directly in terminal via `git clone https://github.com/AugustyaB/Ledgerly.git && cd Ledgerly && npm install && npm start`.

---

## 💔 The Problem: Why Most Expense Trackers Fail

Most people abandon expense trackers within two weeks. The reasons are always the same:

1. **The "Data Entry Chore"**: Logging a \$3 coffee requires unlocking a phone, opening a slow cloud app, clicking through 5 dropdown menus (Account, Category, Sub-category, Date, Notes), and waiting for a cloud sync spinner.
2. **Cloud Vulnerability & Subscription Fatigue**: Your most sensitive financial data gets stored on someone else's server, locked behind a \$10/month subscription, or monetized with targeted ads.
3. **Fragile Sync**: Cloud apps fail when you are in a basement grocery store, on a flight, or on patchy mobile data.
4. **Too Complex or Too Simple**: Spreadsheets are tedious to maintain on the go, while basic budget apps lack household split math, receipt OCR, and multi-profile support.

---

## 💡 The Answer: Friction-Free & 100% Offline

**Ledgerly is built on a single premise: If logging an expense takes more than 5 seconds, the app has failed.**

- **🔒 100% Offline-First & Private**: No cloud accounts, no third-party tracking, no telemetry servers. Your data stays entirely on your local machine in plain-text partitioned JSON files you own and control.
- **⚡ 5-Second Express Logging**: Open the app, type `450 lunch at Udupi today #food`, hit **Enter**, and close the window. Done.
- **🌐 Private Local LAN Sync**: Sync between your desktop and mobile phone directly over your home Wi-Fi network using zero-config optical QR pairing—no cloud relays or accounts needed.
- **🧠 On-Device Intelligence**: Automated receipt OCR, merchant learning loops, and duplicate detection run 100% locally on your hardware.

---

## ✨ Core Feature Set

- **⚡ Express Natural Language Bar & 1-Click Presets**:
  Type freehand sentences like `"18.50 coffee with alex"` with instant inline category parsing. Pin your most frequent daily expenses as 1-click preset chips with instant undo.
- **📊 Salary Pacing & Daily "Safe-to-Spend" Hero**:
  Enter your monthly income and recurring bills. Ledgerly calculates an exact, real-time daily spending allowance that automatically rolls over unspent balances to subsequent days.
- **🧾 Adaptive On-Device Receipt OCR & Learning Loop**:
  Drop any receipt photo or invoice. The local OCR engine extracts merchant, date, total, and tax, flagging uncertain fields. When you correct a merchant name once, Ledgerly remembers the alias permanently.
- **🔄 Smart Statement Reconciliation ("The Coffee Invariant")**:
  Drag bank CSV or PDF statements into the app. Multi-signal fuzzy matching detects duplicates against your cash logs without collapsing multiple legitimate same-day purchases (e.g., two \$4 coffees).
- **👥 Multi-Profile Workspaces & Household Split Settlement**:
  Isolate Personal, Freelance, and Household ledgers. Shared expenses automatically compute minimal pairwise transfers (`"Bob owes Priya $35"`) with 1-click settlement.
- **🕵️ "Zombie" Subscription Hunter & Burn-Rate Foresight**:
  Automatically discovers recurring weekly, monthly, and annual charges, alerts you to silent price hikes, and simulates days-to-zero runway before major purchases.
- **📱 Mobile Companion & Zero-Config Optical QR Pairing**:
  Point your mobile camera at the desktop screen to pair in under 2 seconds. Capture receipts on the go; they queue locally in IndexedDB and push to desktop automatically when you reconnect to Wi-Fi.
- **🛡️ Continuous Mirror Vault & Self-Healing Database**:
  Automatically mirrors cryptographic SHA-256 backup snapshots to an external USB or backup folder, paired with 1-click startup database self-repair.

---

## 🛠️ Tech Stack

| Layer | Technology | Key Capabilities |
|---|---|---|
| **Desktop Runtime** | [Electron](https://www.electronjs.org/) v33 (Node.js v22/24) | 100% offline desktop runtime, native OS dialogs, zero cloud telemetry |
| **Mobile Runtime** | [Capacitor](https://capacitorjs.com/) v7 + [Vite](https://vitejs.dev/) | Cross-platform container for Android 8.0+ and Apple iOS 14.0+ |
| **Architecture** | 5-Layer (`L1–L5B`) × 6-Section (`Sec 1–6`) | Rigorous unidirectional architecture verified via AST scripts (`ADR-013`) |
| **Language** | Vanilla JavaScript (ES2022+) | JSDoc typed (`src/types.js`), CommonJS backend services, modular ES module UI |
| **Visual Design** | Theme 3 ("Graphite & Spiced Chai") | Velvety Graphite (`#121317`), Spiced Chai Amber (`#E5943C`), Inter & JetBrains Mono |
| **Local Persistence** | Partitioned JSON DB + IndexedDB | Hot/cold partitioned JSON (`active_ledger.json` <90d / `legacy_archive.json` >90d) |
| **On-Device Vision** | Tesseract WASM + Canvas Normalizer | 100% local receipt OCR, contrast deskew, and adaptive merchant alias memory |
| **Security & Privacy** | PBKDF2-SHA512 + Strict CSP | 210,000 PBKDF2 hash rounds, single-key `P` Privacy Blur, 15-attempt LAN rate limiter |

---

## 🚀 How to Launch

### Option 1: Official Windows Installer (Recommended for Users)
1. Download and run **`Ledgerly Setup 0.9.0.exe`** from [Releases](https://github.com/AugustyaB/Ledgerly/releases).
2. Follow the setup wizard to choose your install path and create a desktop shortcut.
3. Launch Ledgerly from your Desktop or Start Menu.

### Option 2: Run from Source (Developers)
```powershell
# 1. Clone the repository and enter the folder
git clone https://github.com/AugustyaB/Ledgerly.git
cd Ledgerly

# 2. Install desktop dependencies
npm install

# 3. Launch the desktop application
npm start
```

### Running the Mobile Companion:
```powershell
# Run mobile in local browser preview
npm run mobile:dev

# Compile Android debug APK (requires Android SDK & Java 17)
npm run mobile:build:apk
```

---

## 🧭 First-Time Usage Guide (60-Second Onboarding)

1. **🔒 Create Your Local Master Password**:
   On first launch, set a local password. Ledgerly displays a 12-word recovery phrase—save it safely. All data remains encrypted and stored strictly on your local disk.
2. **👤 Choose or Create a Profile**:
   Pick the default Master Profile or create dedicated workspaces (*Personal*, *Work*, *Shared Household*) with custom avatar colors.
3. **⚡ Log Your First Expense in 3 Seconds**:
   In the top **Express Bar** on the Dashboard, type:
   `12.50 burritos for lunch #food`
   Press **Enter**. The transaction is parsed, categorized, and added to your ledger instantly.
4. **⚙️ Set Your Salary & Fixed Bills**:
   Click **Settings**, enter your monthly salary and recurring monthly expenses. The **Daily Spending Allowance** card will immediately calculate your safe-to-spend pace and daily rollover balance.
5. **📱 Pair Your Phone (Optional)**:
   Open **Settings ➔ Mobile Sync**, click **Generate Pairing PIN** to view the live SVG QR code. On your phone, open the Ledgerly companion app, tap **Scan QR Code**, and point your camera at the screen for 1-tap private sync.

---

## 📂 Repository Project Structure

```text
├── src/
│   ├── main.js                          # Electron main process, IPC routing & window lifecycle
│   ├── preload.js                       # Secure context bridge exposing window.electronAPI
│   ├── storage.js                       # High-level persistence facade
│   ├── receiptStorage.js                # Local receipt photo disk manager
│   ├── constants.js                     # Shared defaults, schemas & category definitions
│   ├── types.js                         # JSDoc type contracts
│   ├── fileImporter.js                  # Statement parser (CSV, XLSX, OFX, PDF)
│   ├── categoryMatcher.js               # Keyword & merchant auto-categorization engine
│   ├── nlpParser.js                     # Express entry natural language sentence parser
│   ├── foresightEngine.js               # Data-gated What-If burn-rate simulation engine
│   ├── icons.js                         # 93-icon Lucide SVG vector registry
│   ├── quickPill.js                     # Ctrl+Shift+L floating desktop quick-add widget
│   ├── app.js                           # Desktop renderer bootstrapper
│   ├── index.html                       # Frameless desktop layout shell (strict CSP)
│   ├── styles.css                       # Theme 3 design tokens & responsive layout styles
│   │
│   ├── services/                        # Backend Domain & Intelligence Engines
│   │   ├── JsonDatabase.js              # Partitioned active/archive JSON database
│   │   ├── BackupMirrorService.js       # Continuous SHA-256 backup vault mirroring
│   │   ├── ExpenseService.js            # Core transaction CRUD & preset operations
│   │   ├── BudgetService.js             # Salary allocation, daily budget pace & rollover
│   │   ├── ProfileService.js            # Multi-profile workspace management
│   │   ├── HouseholdService.js          # Shared expense splitting & pairwise debt netting
│   │   ├── NotesService.js              # Contextual memos (Transaction/Day/Month)
│   │   ├── AuthService.js               # PBKDF2 authentication & account recovery
│   │   ├── DatabaseAuditor.js           # Startup self-healing & rolling archival
│   │   ├── DataQualityAuditor.js        # Pre-processing ledger diagnostics & sanitization
│   │   ├── DiagnosticExporter.js        # Privacy-sanitized path-masked telemetry export
│   │   ├── AggregationRollupService.js  # Sub-5ms O(1) cached category & pacing rollups
│   │   ├── FinancialIntelligenceFacade.js # Decoupled intelligence API contracts
│   │   ├── StatementReconciliationService.js # Fuzzy statement deduplication engine
│   │   ├── SubscriptionHunterService.js # Cadence, jitter, drift & price-hike detector
│   │   ├── NotificationEngine.js        # Behavioral alerts & safe-to-spend facts
│   │   ├── DocumentIntelligenceService.js # Multi-tier receipt OCR orchestrator
│   │   ├── DocumentNormalizer.js        # Canvas contrast, deskew & orientation engine
│   │   ├── ReceiptTier1Engine.js        # Bundled fast-lite OCR heuristic parser
│   │   ├── ReceiptTier2VisionEngine.js  # Vision-Pro visual table & degraded receipt parser
│   │   ├── ReceiptTier3RegionalEngine.js # Regional statutory tax & invoice specialist
│   │   ├── ReceiptLearningService.js    # Merchant alias & repeat layout memory loop
│   │   ├── ModelManager.js              # Offline OCR model downloader & checksum verifier
│   │   ├── RegionalIntelligenceRegistry.js # Regional tax rules & invoice schemas
│   │   ├── SmartDocumentAnalyzer.js     # In-memory document classifier (<1ms)
│   │   ├── SyncServer.js                # HTTP LAN sync server & per-IP rate limiter
│   │   ├── LanBeaconService.js          # Ephemeral UDP discovery beacon (port 52411)
│   │   └── SyncEngine.js                # 3-way conflict resolution engine
│   │
│   ├── ui/                              # Modular Presentation Views & Components
│   │   ├── AppState.js                  # Centralized reactive state store
│   │   ├── AppRouter.js                 # View navigation router & mount lifecycle
│   │   ├── views/                       # Dashboard, Feed, Batch, Import, Household, Notes, etc.
│   │   ├── components/                  # AuthScreen, ErrorBoundary, ChartManager, CommandPalette
│   │   └── helpers/                     # dom.js, formatters.js, toast.js
│   │
│   ├── utils/                           # qrCodeGenerator.js (Pure-JS SVG QR matrix generator)
│   ├── validation/                      # ipcGuard.js & schemaValidator.js runtime guards
│   └── logger/                          # crashLogger.js (rotating local error log)
│
├── mobile/                              # Capacitor Mobile Companion Application
│   ├── src/                             # Mobile views (Capture, QuickAdd, Queue, Sync), camera, sync client
│   ├── android/                         # Native Android Studio Gradle project
│   └── ios/                             # Native Apple iOS Xcode project
│
├── build/                               # installer.nsh (Custom NSIS in-place repair & safe uninstall)
├── scripts/                             # check-syntax.js, check-architecture-layers.js
├── .gsd/                                # Spec-driven development framework (ACTIVE_PLAN, STATE, ROADMAP, DECISION)
├── FLOW.md                              # System architecture & 5-Layer x 6-Section blueprints
└── package.json                         # Build configurations, dependencies & npm scripts
```

---

## 🧪 Testing & Architectural Verification

Every commit and build is validated against syntax and strict architectural layer boundaries:

```powershell
# 1. Architecture Layer & Syntax Verification (75/75 files compliant across L1-L5B)
npm run check

# 2. ESLint Code Quality Verification (0 errors, 0 warnings)
npm run lint

# 3. LAN UDP Discovery, Pure-JS SVG QR & Wi-Fi Rate-Limiter Suite
npm run test:lan-discovery

# 4. Phase 0.8 Adversarial Chaos Suite (21 test scenarios)
npm run test:phase8-chaos

# 5. Smart Insights & Zombie Subscription Hunter Suite
npm run test:smart-insights

# 6. Fuzzy Statement Reconciliation & Deduplication Suite
npm run test:fuzzy-reconciliation

# 7. Sub-5ms EDA Aggregation Rollup Suite
npm run test:eda-foundation

# 8. Adaptive Receipt Vision & Merchant Learning Suite
npm run test:receipt-vision

# 9. Partitioned Storage & Continuous Mirror Vault Suites
npm run test:partitioned-storage && npm run test:mirroring

# 10. Master User Journeys Suite (Journeys A, B, C, D across 4 Personas)
npm run test:journeys
```

---

## 🏆 Project Milestones & Roadmap (Summary)

| Version | Milestone Scope | Status |
|---|---|:---:|
| **v0.1 – v0.3** | Desktop Core, Theme 3 Design System, Multi-Profile & Statement Import | ✅ Complete |
| **v0.4** | Dual-Monolith Decomposition (8 Domain Services, 8 Modular Views, IPC Guard) | ✅ Complete |
| **v0.5** | On-Device ML Document Intelligence (3-Tier Receipt OCR & Model Manager) | ✅ Complete |
| **v0.6** | Capacitor Mobile Companion & Zero-Cloud Local LAN Wi-Fi Sync | ✅ Complete |
| **v0.7** | Partitioned Storage Engine (`<90d` / `>90d`), European Polish & Mirror Vault | ✅ Complete |
| **v0.8** | Smart Insights, Subscriptions, Fuzzy Reconciliation & Optical QR LAN Pairing | ✅ Certified Complete |
| **v0.9** | **Multi-Platform Installer Suite & Section-by-Section UX Refinement (`Sec 1–6`)** | 🔄 **Active** |
| **v1.0.0** | **Official Production Release** (Signed Binaries, Auto-Updater & Public Distribution) | 🎯 Staged Target |

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
