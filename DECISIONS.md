# 🏛️ Ledgerly — Architecture & Design Decisions Log (`DECISIONS.md`)

This document records the major architectural, visual design, and functional decisions made throughout the development of Ledgerly.

---

## 📌 Decision Log Index

- [ADR-001: Design Language System — Theme 3 (Graphite & Spiced Chai Amber)](#adr-001-design-language-system--theme-3-graphite--spiced-chai-amber)
- [ADR-002: Multi-Profile Household Selection & Management Architecture (Phase 2)](#adr-002-multi-profile-household-selection--management-architecture-phase-2)
- [ADR-003: Main Financial Dashboard & Operational Intelligence Architecture (Phase 3)](#adr-003-main-financial-dashboard--operational-intelligence-architecture-phase-3)
- [ADR-004: Multi-Section Workspaces & Visual Navigation Overhaul (Phase 4)](#adr-004-multi-section-workspaces--visual-navigation-overhaul-phase-4)
- [ADR-005: Frictionless UX & Ambient Financial Intelligence Engine (Phase 5)](#adr-005-frictionless-ux--ambient-financial-intelligence-engine-phase-5)
- [ADR-006: Visual Modernization — Inter Typography, Lucide Vector Icons, Monogram Avatars & Bundled Offline Assets](#adr-006-visual-modernization--inter-typography-lucide-vector-icons-monogram-avatars--bundled-offline-assets)
- [ADR-007: Domain Language Standardization — User Profiles vs. Household Members](#adr-007-domain-language-standardization--user-profiles-vs-household-members)

---

## ADR-001: Design Language System — Theme 3 (Graphite & Spiced Chai Amber)

- **Date**: 2026-08-23
- **Status**: **ACCEPTED & IMPLEMENTED**
- **Context**: The app previously used overly bright neon cyan/blue tones. We needed a refined aesthetic reflecting the financial intelligence of a modern Indian household—avoiding both neon tech cliches and sterile monochrome.
- **Decision**:
  - Adopt **Theme 3 ("The Modern Indian Household")**:
    - Canvas: Velvety Warm Graphite (`#121317`)
    - Surfaces: Deep Elevated Graphite (`#1A1C23`)
    - Borders: Warm Slate (`#2D303C`)
    - Primary Accent: **Spiced Chai Amber (`#D9822B` ➔ `#E5943C`)**
    - Semantic Accents: Muted Jade Emerald (`#10B981`) for inflows/safe budget, Crimson Rose (`#E11D48`) for expenses/overspends.
    - Titlebar Brand Icon Exception: Preserved signature cyan/blue credit card badge `💳` beside white `Ledgerly.` wordmark.
- **Consequences**: Established a cohesive, professional palette across all screens.

---

## ADR-002: Multi-Profile Household Selection & Management Architecture (Phase 2)

- **Date**: 2026-08-24
- **Status**: **ACCEPTED & IMPLEMENTED**
- **Context**: Need a Netflix-style multi-user profile switcher allowing household members to enter isolated personal spaces while enabling joint tracking.
- **Decision**:
  1. **Informative Profile Cards**: Each squircle card displays the emoji avatar, person's name, and tabular numerical activity stats (e.g. `1 expense logged`).
  2. **Dedicated "Manage Profiles" Modal**: Clicking `⚙️ Manage Profiles` opens a clean list dialog with edit/delete actions and last-profile safeguards, rather than cluttering the main grid with inline pencil toggles.
  3. **Visual Person Onboarding**: Clean name input + live circular avatar preview + 24-emoji curated grid with amber active selection ring.
- **Consequences**: Clean separation between profile navigation and profile management.

---

## ADR-003: Main Financial Dashboard & Operational Intelligence Architecture (Phase 3)

- **Date**: 2026-08-25
- **Status**: **ACCEPTED & READY FOR EXECUTION**
- **Context**: The main financial dashboard needed to expand beyond basic single-user expense logging into high-density, multi-user operational intelligence for high-resolution desktop viewports.
- **Decision**:
  1. **Brand Logo Privacy Mode Toggle**:
     - The top-left `Ledgerly.` logo acts as the privacy toggle button (hotkey `P`).
     - In Privacy Mode, the logo shifts to stealth monochrome `🔒 Ledgerly` and all currency figures (`.amount-text`, `.metric-value`, `.budget-amount`) are smoothly blurred (`filter: blur(7px)`).
  2. **Universal Command Palette (`Ctrl+K`)**:
     - Inset search header triggers a floating spotlight modal searching across transactions, categories, household members, and instant actions.
  3. **Notification Center (`🔔`)**:
     - Top-right bell icon with unread badge counter and popover for upcoming bills and household activity alerts.
  4. **Multi-User Scope Filtering**:
     - Dashboard header switcher seamlessly toggles between `👥 Combined Household View` and individual personal spaces (`👨 Rahul`, `👩 Priya`).
  5. **Two-Column Analytics Layout**:
     - Left (60% Width): Cash Flow & Spending Trends bar chart overlaid with the **Daily Budget Pace Benchmark Line** in Spiced Chai Amber.
     - Right (40% Width): Concentric Category Breakdown Donut chart with DLS harmonic color spectrum.
  6. **Operational Feed & Settlement Checklist**:
     - Left (65% Width): **Recent Transactions Ledger** with member pills, personal vs shared tags, and tabular monospace amounts.
     - Right (35% Width): **Household Split Balances Widget** listing pending debts with checkboxes and a `[ ✓ Settle Selected ]` workflow.
  7. **Dynamic Salary Pool Widget**:
     - Displays a linear progress bar for individual profiles, and transitions into a **Concentric Circular Ring Gauge** in the Combined Household view.
  8. **Specialized Skills Integration**:
     - `frontend-design` & `theme-factory`: Visual hierarchy, `JetBrains Mono` tabular nums, dark graphite elevation, stealth transitions.
     - Financial Data Analytics: Daily pace modeling (`dailyTarget = discretionary / remainingDays`), dual-axis trends, pairwise debt graph resolution.
     - `empirical-validation` & `webapp-testing`: Automated Playwright E2E UI testing capturing 5 distinct visual verification artifacts.
- **Consequences**: Transforms Ledgerly into a comprehensive, keyboard-first desktop personal finance platform.

---

## ADR-004: Multi-Section Workspaces & Visual Navigation Overhaul (Phase 4)

- **Date**: 2026-08-28
- **Status**: **ACCEPTED & IMPLEMENTED**
- **Context**: While Phase 3 focused on the main dashboard, all other navigation sections (`👥 Household Split`, `💸 Expense Feed`, `📋 Batch Entry`, and `📝 Contextual Notes`) needed a complete visual and functional overhaul adhering to the Theme 3 (Graphite & Spiced Chai Amber) design system with generous vertical spacing and specialized workflows.
- **Decision**:
  1. **👥 Household Split & Settlements Hub**:
     - **3-Metric Financial Strip**: Total Shared Outflow, Active Splitter Count, and Net Position (Emerald `+₹` for receivables, Rose `-₹` for payables, Blue `₹0.00` for balanced).
     - **Directed Pairwise Stream Cards**: Squircle member avatar nodes connected by a directional flow line (`──▶`) with a Spiced Chai Amber amount badge and a direct `[ 💳 Settle Up ]` repayment modal.
     - **Recurring Utilities Deck**: Grid cards for household utilities (Electricity, Internet, Rent, LPG) with countdown status pills (`Due in X days`, `Overdue by Xd`, `Paid for Month`) and a `[ ⚡ Pay & Split ]` action.
     - **Settlement Audit History**: Tabular ledger tracking recorded member repayments with timestamps and reference notes.
  2. **💸 Dedicated Expense Feed Precision Ledger**:
     - **Omni-Filter Command Bar**: Real-time filtering by search query, category dropdown, payment method, personal vs shared member filter, and date ranges (`This Month`, `Last 30 Days`).
     - **Precision Table**: Tabular figures, category badges, member ownership chips, receipt attachments, contextual note indicators (`📝 count`), and column sorting.
     - **Sticky Batch Selection Bar**: Checkbox multi-select triggering a bottom floating bar with bulk delete, CSV export, and clear selection actions.
  3. **📋 Keyboard-First Batch Entry Spreadsheet**:
     - **Inline Tabular Spreadsheet**: Rapid multi-row transaction entry with row numbers (`# 1, 2, 3...`), Excel paste support (`Ctrl+V` / button), and `Tab`/`Enter` auto-row generation.
     - **Active Cell Glowing Ring**: Glowing Spiced Chai Amber border (`2px solid #D9822B; box-shadow: 0 0 12px rgba(217,130,43,0.35)`) on focused cells.
  4. **📝 Contextual Notes Masonry Gallery**:
     - **5-Pill Relation Filter Bar**: Switch between `All Notes`, `Linked to Expenses`, `Daily Reflections`, `Weekly Reviews`, and `Monthly Goals` with live counts.
     - **Masonry Note Cards**: Color-coded top relation ribbons (amber, blue, purple, cyan), italicized body text, and direct edit/delete controls.
  5. **Empirical Validation**:
     - Automated Playwright E2E UI verification suite capturing 5 high-resolution screenshot artifacts across all workspaces.
- **Consequences**: Unifies all sub-pages under a consistent, high-fidelity visual design language with generous vertical breathing room and powerful keyboard-first workflows.

## ADR-005: Frictionless UX & Ambient Financial Intelligence Engine (Phase 5)

- **Date**: 2026-08-29
- **Status**: **ACCEPTED & IMPLEMENTED**
- **Context**: Users required minimal-effort interaction models for logging expenses, direct clipboard image attachments without file pickers, natural language input processing, rapid date shorthands, offline merchant categorization, and interactive foresight simulations to prevent month-end burnout.
- **Decision**:
  1. **Instant Action Toast Notification**:
     - Modern glassmorphic bottom-right toast providing ambient visual confirmation (`✓ Logged "Coffee" ₹20.00 • Food & Dining`) without intrusive modal dialogs or unwanted rollback prompts.
  2. **Direct Clipboard Screenshot & Image Paste (`Ctrl+V`)**:
     - Window-level clipboard paste listener detects image binary streams and saves them directly via `ReceiptStorage.saveReceiptBuffer` to local disk without file picker dialogs.
  3. **Smart Merchant Auto-Categorization & Adaptive Keyword Learning (`categoryMatcher.js`)**:
     - 100% offline merchant dictionary and category classification engine with user-trained dynamic memory overrides saved to profile storage.
  4. **Natural Language Single-Bar Express Entry ("1-Box Magic") (`nlpParser.js`)**:
     - Deterministic 6-pass regex parsing natural phrases (e.g. `"Swiggy 350 lunch with Priya upi yesterday"`) into amount, merchant title, category, split ownership, payment method, and date with real-time reactive token badge pills.
  5. **Solo Workspace vs. Household Mode Toggle**:
     - Seamless mode switch enabling a 100% full-width ledger layout without split cards or extra tabs for single users, while preserving multi-member splitting for shared households.
  6. **Rapid Date Shorthands in Batch Spreadsheet**:
     - Inline shorthand resolver supporting `'t'`, `'today'`, `'y'`, `'yesterday'`, `'-N'` days ago, and single/double digit day numbers (`'15'`).
  7. **Global Desktop Quick-Add Floating Pill Widget (`quickPill.html` / `Ctrl+Alt+L`)**:
     - Frameless, translucent, always-on-top quick entry widget that can be summoned anywhere on the OS to log transactions in 2 seconds.
  8. **Interactive "What-If" Spending Impact Simulator & Burnout Forecast (`foresightEngine.js`)**:
     - Real-time mathematical simulation calculating exact daily pace drops and burnout trajectories before purchases are made.
  9. **Dynamic Color-Coded Budget Threshold Rings & Ambient Feedback**:
     - Micro-feedback thresholds (Emerald `🌿 Safe Pace` ➔ Amber `⚡ Moderate Pace` ➔ Crimson `⚠️ Over Pace`) with dynamic stroke indicators.
- **Consequences**: Provides lightning-fast expense logging, effortless receipt capture, and proactive ambient financial intelligence while maintaining 100% offline security.

---

## ADR-006: Visual Modernization — Inter Typography, Lucide Vector Icons, Monogram Avatars & Bundled Offline Assets

- **Date**: 2026-08-31
- **Status**: **ACCEPTED & IMPLEMENTED**
- **Context**: The application previously used OS emoji characters as icons across buttons, navigation drawers, preset chips, metric cards, and profile pickers, giving the UI an inconsistent, unpolished "fake website" aesthetic. In addition, external CDN imports for Google Fonts and Chart.js broke full offline self-containment.
- **Decision**:
  1. **Typography Overhaul (Inter & JetBrains Mono)**:
     - Adopt **Inter** as the primary interface font for crisp readability across navigation, headers, and UI controls.
     - Bundle **JetBrains Mono** latin subsets for all financial amounts, tabular figures, and timestamps.
     - Store font files locally in `assets/fonts/` with `@font-face` rules in `src/styles.css` for 100% offline capability without CDN dependencies.
  2. **93-Icon Lucide Vector SVG Registry (`src/icons.js`)**:
     - Replace all emoji characters in HTML and dynamic JavaScript templates with an inline SVG icon engine (`icon(name, size, cls)` and `hydrateIcons()`).
     - Default presets and recurring utility bills updated to use vector icon identifiers (`coffee`, `utensils`, `fuel`, `car`, `shopping-cart`, `zap`, `wifi`, `flame`).
  3. **Monogram Initial Avatar System**:
     - Replace the 24-emoji avatar picker with dynamic **Monogram Initial Badges** (`renderMonogram(name, size, colorOverride)`), generating 1–2 letter uppercase initials (e.g. `RS`, `PK`).
     - Introduce an 8-accent color dot selector with real-time live preview as the user types their name.
  4. **Bundled Offline Chart.js**:
     - Bundle `Chart.js` locally at `assets/js/chart.umd.js`, removing external CDN script tags from `src/index.html`.
- **Consequences**: Delivers a modern, cohesive, production-grade visual design standard while ensuring 100% offline security.

---

## ADR-007: Domain Language Standardization — User Profiles vs. Household Members

- **Date**: 2026-08-31
- **Status**: **ACCEPTED & IMPLEMENTED**
- **Context**: The app previously mixed terms like "Person", "Person Profile", "Profile", and "Member" interchangeably on the same screens (e.g. "Add Person" on cards, "Manage Profiles" in headers, "Add Person Profile" in dialogs). This caused user confusion during onboarding.
- **Decision**:
  1. **Standardize on "Profile" for User Workspaces**:
     - All user tracking spaces (e.g., *Rahul*, *Priya*, *Business Expenses*) are consistently termed **Profiles**.
     - Welcome / Switcher Screen: **"Who is tracking today?"**, **"Manage Profiles"**, **"Add Profile"**.
     - Dialog: **"Add Profile"** / **"Edit Profile: [Name]"**, **"Profile Name *"**, **"Delete Profile"**.
     - Quick Navigation Menu: **"Switch Profile"**, **"Add Profile"**.
  2. **Reserve "Member" Strictly for Shared Household Splitting**:
     - Counterparties on split transactions are consistently termed **Household Members** (e.g., *"Split with Members"*, *"Active Household Splitters"*, *"Manage Household Members"*).
- **Consequences**: Completely removes terminology ambiguity, gives each concept a crisp and distinct identity, and creates an intuitive user journey.

---

*Last Updated: 2026-08-31*
