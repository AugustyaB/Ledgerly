# 🚀 Ledgerly — Future Roadmap & Upcoming Tasks

This document serves as the persistent registry of long-term ideas, feature prospects, and brand enhancements to be implemented in future milestones.

---

## 📌 Current Milestone Status: Version 0.4 (Major Restructuring Cycle)

### Completed Subsections:
- [x] **v0.4.1 (Phase 1)**: Security Hardening Baseline — CSP baseline, PBKDF2 (210K rounds), formula sanitization, atomic writes.
- [x] **v0.4.2 (Phase 2)**: Tooling, Type Contracts & Constants — ESLint flat config, Prettier, JSDoc `types.js`, frozen constants.
- [x] **v0.4.3 (Phase 3)**: Backend Domain Decomposition — Disassembled monolithic `storage.js` into 8 services in `src/services/` with a facade.
- [x] **v0.4.4 (Phase 4)**: Frontend Modular UI Decomposition — Native ES Modules, `AppState`, `AppRouter`, 8 view modules, 3 components, 0 inline events, CSP `script-src 'self'`, `app.js` reduced from 4,862 to 567 lines (88.3%).
- [x] **v0.4.5 (Phase 5)**: IPC Runtime Schema Validation & Error Contract Standardization — Zero-dependency native validator engine (`schemaValidator.js`), `wrapIPC` boundary guard (`ipcGuard.js`), standardized `{ success, data, error, code, details }` wire envelopes, dual array/envelope compatibility in `preload.js`, 39 automated tests.
- [x] **v0.4.6 (Phase 6)**: Global UI Error Boundaries, Crash Traps & Audit Defect Remediation — `ErrorBoundary.js`, section fallback cards, `crashLogger.js` (5MB rotation), uncaughtException/unhandledRejection traps, importer safeguards, resolved BUG-001..004, 11/11 automated resilience tests.
- [x] **v0.4.7 (Phase 7)**: Enterprise Resilience, Tier 2 Reconciliation UX & Offline Conflict Engines — DatabaseAuditor self-healing integrity, DiagnosticExporter sanitized telemetry, SyncEngine 3-way merge, Ctrl+Z undo stack, fuzzy deduplication, proactive bill due banner, zero-eval calculator (12/12 automated resilience tests). **Concludes Version 0.4 Milestone.**

---

## 🛡️ Subsections of Version 0.4 (Completed Milestone)

### Version 0.4.6 (Phase 6): Global UI Error Boundaries, Main Process Exception Traps & Audit Defect Remediation — [COMPLETED]
- [x] **Global Renderer Error Traps**: Configure `window.onerror` and `window.addEventListener('unhandledrejection')` listeners to intercept unhandled promise rejections and script runtime exceptions.
- [x] **Graceful Section Fallback Cards (UI Error Boundaries)**: When an unexpected error occurs within an individual view, render an isolated fallback card (`"Something went wrong loading this section"`) with a "Reload Section" button, preventing application whiteout or frozen states.
- [x] **Main Process Crash Interceptors**: Set up `process.on('uncaughtException')` and `process.on('unhandledRejection')` in `main.js` that write timestamped diagnostic traces to a local `crash.log` file in user data directory and trigger non-fatal warning dialogs.
- [x] **Streaming & Large File Memory Protections**: Add 50MB file size guard and 25,000-row processing caps in `fileImporter.js` to prevent memory exhaustion and UI thread lockup.
- [x] **Audit Defect Fix — BUG-001 (P0 Blocker)**: Fix `fileImporter.js` regex stripping decimal points from transaction amounts ($78.45 -> $7845).
- [x] **Audit Defect Fix — BUG-002 (P1 High)**: Enable `process.env.LEDGERLY_DB_PATH` in `JsonDatabase.js` for isolated test environments.
- [x] **Audit Defect Fix — BUG-003 (P2 Medium)**: Eliminate ESLint syntax errors and undeclared globals across `nlpParser.js`, `quickPill.js`, `receiptStorage.js`, and `fileImporter.js`.
- [x] **Audit Defect Fix — BUG-004 (P2 Medium)**: Standardize test assertions on strict `node:assert` instead of non-throwing `console.assert()`.

### Version 0.4.7 (Phase 7): Enterprise Resilience, Tier 2 Reconciliation UX & Offline Conflict Engines — [COMPLETED]
- [x] **Smart Statement Reconciliation & Deduplication (Audit Tier 2)**: Detect potential duplicate transactions (within ±2 days and ₹0.01 tolerance) in `ImportView.js` staging preview with interactive skip toggle.
- [x] **Automated Recurring Bill & Salary Scheduler (Audit Tier 2)**: Launch-time due date inspection for recurring bills (`check-pending-bills`) and 1-click execution (`execute-bill-payment`) with proactive Dashboard cockpit banner.
- [x] **Global Undo / Redo Mechanism (Audit Tier 2)**: 10-item in-memory transaction action stack in `AppState.js` with `Ctrl+Z` restoration toast.
- [x] **Advanced Omni-Search & Calculator (Audit Tier 2)**: Instant math evaluation via zero-eval Shunting-Yard parser and contextual note queries in `CommandPalette.js`.
- [x] **Startup Database Integrity Auditor**: Automated integrity verification on app boot (`DatabaseAuditor.js`) that checks JSON schema validity, repairs orphaned notes and corrupted amounts/dates, and manages `.pre-audit.bak` snapshots.
- [x] **Self-Diagnostic Export Bundle**: Hermetic diagnostic exporter (`DiagnosticExporter.js`) bundling system specs, schema stats, and sanitized `crash.log` with path/credential masking.
- [x] **Offline Replication Foundation**: Deterministic sync engine (`SyncEngine.js`) implementing vector clocks, LWW tie-breaking, and deterministic 3-way merge resolution.

---

## 🎯 Subsequent Feature Milestones (Post-v0.4)

### Version 0.5+: Mobile Web Companion & Local LAN Peer Sync (Audit Tier 3)
- [x] **Local LAN Peer Sync (Zero Cloud)**: Embedded HTTP server in Electron (`SyncServer.js`) allowing smartphones on local Wi-Fi to pair via 6-digit PIN / session Bearer token and push/pull transactions directly to desktop database with LWW conflict resolution.
- [x] **Mobile Companion & Ingestion Queue**: Capacitor mobile companion app with offline IndexedDB queueing, Canvas downscaling, and immediate photo purge upon desktop receipt persistence.
- [ ] **Configurable Wi-Fi Pairing Rate Limiting & General Security Controls**: Introduce an attempt-limiting security guard on `POST /api/v1/pair` defaulting to 15 failed attempts before enforcing a 60-second cooldown and session invalidation to mitigate local network brute-force vectors. Expose this as a general security preference in the desktop Settings panel so users can tune pairing attempt tolerances and cooldown policies.
- [ ] **Zero-Config LAN Discovery (UDP Beacon & Camera QR Code Pairing)**: Broadcast lightweight UDP discovery beacons (`_ledgerly._udp`) from the desktop during pairing so the mobile companion can automatically detect desktop instances on local Wi-Fi without typing IP addresses. Render a dynamic QR code in the desktop pairing modal containing network connection parameters and ephemeral pairing PIN for instantaneous optical camera pairing.
- [ ] **Local Machine Learning Receipt OCR Engine**: Bundled WebAssembly Tesseract OCR worker extracting merchant, date, and total locally without cloud vision APIs.
- [ ] **Transparent Database Vault Encryption**: AES-256-GCM master password encryption protecting `expenses_db.json` from physical device theft.
- [ ] **Hardware Camera Access**: Direct camera capture for snapping receipts and physical bills on mobile.

### Version 1.0.0: Official Production Release & Ambient Intelligence
- [ ] **Multi-Purpose Windows Installer & Maintenance Suite**: Interactive wizard providing clean installation, self-healing file repair without user data loss, safe uninstallation with data retention prompts, and embedded GitHub installation guidance.
- [ ] **Production Release Candidate**: Signed binaries, auto-updater integration, desktop & Start Menu shortcuts, and production certification.
- [ ] **Local Machine Learning Bill Scanner**: On-device OCR model to extract merchant, date, total, and line items from receipt photos automatically without cloud dependencies.
- [ ] **Automated Transaction Ingestion**: Automatically populate and stage scanned bill data into the express review queue.
- [ ] **Predictive Burn Rate & Category Forecasting**: Advanced time-series spending projections.

### Version 0.6.4+ / Version 1.0.0: Mobile Build Pipeline & Native Release Enhancements (from Phase 0.6.4 QA Audit)
- [ ] **Idempotent Mobile Build Pipeline (`mobile:build:apk`)**: Chain `npm run mobile:build &&` to the root `mobile:build:apk` script so that Vite production bundle generation is always executed prior to `cap sync android`, preventing accidental packaging of stale web assets into native `.apk` binaries.
- [ ] **Production Android Release Keystore & ProGuard/R8 Optimization (`assembleRelease`)**: Configure Gradle `signingConfigs.release` with a secure keystore, ProGuard/R8 dead-code stripping, and resource shrinking, accompanied by an `npm run mobile:build:apk:release` script for Google Play / signed release distribution.
- [ ] **Physical Android OEM Device Testing Matrix**: Expand automated cross-device testing beyond synthetic Node.js / Playwright desktop viewport mocks to physical Android devices across distinct OEM skins (Samsung OneUI, Xiaomi MIUI/HyperOS, OnePlus OxygenOS) to validate OEM-specific aggressive background Wi-Fi power-saving killers and camera driver variations.

---

## 🎨 Brand, UI & Ambient Intelligence Backlog

### 1. 🎨 Bespoke App Logo & Brand Identity Customization
- [ ] **Custom Vector/SVG Brand Mark**: Design a bespoke Ledgerly vector logo replacing the temporary credit card icon badge.
- [ ] **App Icon & Asset Generation**: Create high-resolution `.ico` / `.png` icons for Windows desktop taskbar, installer, and frameless window titlebar.
- [ ] **Custom Logo Variants & Colorways**: Provide light, dark, and Spiced Chai Amber brand asset variants for marketing and in-app display.

### 2. 🔔 Notifications Engine & Smart Alerts Center
- [ ] **Interactive Notification Center**: Full notification panel in the top header with category filters (Bills, Overspend alerts, Settle requests).
- [ ] **Upcoming Bill Reminders**: Automatic notifications for bills due in 2 to 7 days.
- [ ] **Budget Overrun & Burn Rate Warnings**: Proactive alerts when a member or category exceeds 80% or 100% of budgeted threshold.
- [ ] **Settlement Request Notifications**: In-app notifications when another household member logs a shared expense or requests a settlement.

### 3. 👥 Shared Bill Splitting & Reimbursement Module
- [ ] **Automated Pairwise Debt Settlement**: Smart multi-party split engine (equal split, percentage split, custom share) with simplified net balance resolution ("Who owes who").
- [ ] **Reimbursement & Settlement Log**: Settle-up workflow allowing members to mark debts as cleared with receipt/payment notes.
- [ ] **Recurring Household Utility Tracker**: Automated recurring bill schedule for electricity, Wi-Fi, LPG, maid/cook salaries, and rent with due date countdown badges.

### 4. 🖥️ Desktop-Specific Power Enhancements
- [ ] **Global Command Palette (`Ctrl+K` / `Cmd+K`)**: Universal search modal across transactions, categories, household members, and settings.
- [ ] **One-Click Privacy Mode (`P` / Logo Click)**: Instant blur mode for currency amounts to protect financial privacy in public or during screen-sharing.
- [ ] **Rapid Entry Shortcuts**: Global `N` / `Ctrl+N` hotkey to focus the express transaction bar instantly from anywhere in the app.
- [ ] **High-Resolution & Ultrawide Responsive Grid**: Adaptive layout scaling smoothly from 1080p single displays up to 1440p and 4K ultrawide monitors.

### 5. 📈 Future Prospects & Financial Feature Expansion
- [ ] **Beyond Household Finance**: Expand feature set into broader personal wealth management, investments tracking, SIP/mutual fund monitoring, and multi-bank portfolio insights.
- [ ] **Shared Savings Goals & Milestones**: Joint target visualizers (Emergency fund, vacation savings, home renovation) with automated progress pacing.
- [ ] **Advanced Forecasting & Projections**: Month-end savings forecasts, burn rate projection lines, and annual budget rollups.
- [ ] **Rich Multi-Series Visualizers**: Curated Spiced Chai Amber / Jade / Rose data visualization themes across all financial charts.

---

## 📋 Backlog & Deferred Feature Enhancements

### 6. 👤 Profile & Household Customization
- [ ] **Custom Profile Color Accents**: Allow users to assign a signature color accent to individual profiles for comparative household charts and debt visualizers.
- [ ] **Profile Ordering / Pinning**: Drag-and-drop or rank ordering of profiles in the selection hub.
- [ ] **Household Salary Pool Display Toggle**: Setting allowing individual member profiles to optionally display the combined household salary circle gauge.

### 7. 🔐 Account & Security Features
- [ ] **Forgot Password Workflow**: Implement a secure local recovery mechanism (e.g. security questions or master passphrase recovery) to replace the current placeholder link.
- [ ] **Biometric / PIN Quick Lock**: Optional Windows Hello or 4-digit quick PIN for individual profile switching without re-entering the full account password.

### 8. 🎴 In-App Showcase & Marketing Elements
- [ ] **Feature Highlights Shelf**: Re-introduce dynamic, curated feature cards on the login showcase panel once future major financial modules go live.

### 9. 📥 Import & Data Ingestion Pipeline
- [ ] **Enhanced PDF & Statement Parsing**: Expand the local file importer with automated bank statement recognition (SBI, HDFC, ICICI, etc.).
- [ ] **Receipt OCR Engine**: Add offline local OCR for physical bill and receipt scanning.

### 10. 📦 Multi-Purpose Windows Installer & Maintenance Suite
- [ ] **Interactive Multi-Mode Setup Wizard (Install, Repair, Uninstall)**:
  - Custom NSIS / Electron-Builder setup wizard providing clear mode selection when an existing installation is detected:
    - **Install / Upgrade**: Standard per-user (`AppData\Local\Programs`) or system-wide (`Program Files`) installation, custom directory path selection, Start Menu & Desktop shortcut creation, and protocol/file associations.
    - **Repair Installation**: Automated file integrity verification for corrupted, damaged, or missing binaries/assets.
    - **Uninstall Ledgerly**: Clean removal of application runtime files and system hooks.
- [ ] **Self-Healing Binary & Asset Repair Engine**:
  - Validates checksums/hashes of application runtime files, assets, and dependencies against the release manifest.
  - Re-extracts and restores missing or corrupted files without requiring a manual re-download.
  - **Zero Data Loss Guarantee**: Strictly isolates repair operations to program files (`Program Files` / `AppData\Local\Programs`), ensuring user databases (`%APPDATA%\Ledgerly\expenses_db.json`), receipt archives, and configuration remain 100% untouched.
  - Registers Windows "Modify / Repair" entry in *Installed Apps* (Windows Settings) and *Programs and Features* (Control Panel).
- [ ] **Safe Uninstallation with Data Retention Safeguard**:
  - Interactive uninstaller dialog: `"Would you like to keep your personal financial records, receipts, and backups, or completely remove all data?"`
  - Prevents tragic accidental financial data loss during reinstallation or PC migration while still providing a complete purge option when requested.
- [ ] **Integrated Documentation & GitHub Guidance**:
  - Directions and direct clickable links to the official GitHub repository embedded in the installer welcome, maintenance, and completion pages:
    - 📖 **Installation Guide & Prerequisites**: Windows compatibility, WebView2/Electron prerequisites.
    - 🛠️ **Troubleshooting & Offline Recovery**: Step-by-step guides for manual file recovery, backup restoration, and database repair.
    - 📝 **Release Notes & Documentation**: Version changelog, feature walkthroughs, and user manuals.
    - 🐞 **GitHub Issue Tracker**: Direct link for filing bug reports or requesting features.
  - Post-install options: `[ Launch Ledgerly ]` and `[ Open GitHub Installation & User Guide ]`.

### 11. 🛡️ Specialized Squad Expansion Roles (Future Milestones)
- [ ] **Tech Writer & User Advocate**:
  - Dedicated specialist role for writing comprehensive end-user manuals, visual screenshot walkthroughs, onboarding tutorials, and public release documentation for v1.0.
- [ ] **AppSec & Privacy Auditor**:
  - Dedicated specialist role for deep security assessments, cryptographic handshake verification, local network permission audits, and vulnerability forensics if security hazards or complex sync architectures emerge.

### 12. 📊 Post-Production Defect Triage & Release Gating (Jira Offline Blackboard)
- [ ] **Post-Production Jira Blackboard Integration**:
  - In post-production maintenance (v1.0+) and formal release qualification, re-introduce the centralized **Jira Offline Blackboard Suite** (`E:\AG_saves\Jira-Offline-Blackboard`) for:
    - Formal defect logging, reproduction steps, ground-truth logs, and severity prioritization (`CRITICAL`, `HIGH`, `MEDIUM`, `LOW`).
    - Release certification gates (ensuring zero unresolved P0/P1 blockers before pushing public binary updates).
    - Asynchronous multi-agent defect triage and regression verification.
  - *Current Status*: Kept intentionally detached from active development to maximize engineering velocity and eliminate cognitive context saturation for AI agents.

---

*Last Updated: 2026-09-18*
