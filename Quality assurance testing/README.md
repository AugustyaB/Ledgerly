# 🛡️ Ledgerly — Quality Assurance Testing Hub

> **Department**: Quality Assurance & Software Integrity  
> **QA Lead / Auditor**: Antigravity Lead QA  
> **Application**: Ledgerly Desktop (`v0.4.4` Alpha Milestone)  
> **Status**: Active QA Oversight  
> **Last Updated**: September 2026  

---

## 📌 Executive QA Charter

This directory serves as the centralized repository for all **Quality Assurance audits, defect tracking, product-market evaluations, testing methodologies, and architectural improvement specifications** for Ledgerly.

As the Quality Assurance team, our mandate is twofold:
1. **Ensure Software Integrity**: Zero data loss, robust cryptographic security, deterministic calculations, crash prevention, and zero regressions across all desktop environments.
2. **Protect User Value & Experience**: Ensure the application solves real human problems with minimal friction, retains users past Day 14, and delivers on its promise of a 100% offline, privacy-first financial command center.

---

## 📂 Directory Structure

The QA department is organized into five structured subfolders:

```text
Quality assurance testing/
├── README.md                                      # This QA Hub Index & Status Dashboard
│
├── 01_Audit/                                      # Project Purpose, Vision & Feasibility Audits
│   ├── project_purpose_and_vision_audit.md        # Core purpose, 5 pillars, and user definitions
│   ├── acquisition_and_download_feasibility.md    # Download barrier analysis & acquisition viability
│   └── retention_and_daily_utility_audit.md       # "Day 14" retention audit & daily UX friction analysis
│
├── 02_Defects/                                    # Formal Defect Tickets & Severity Matrix
│   ├── defect_backlog_and_severity_matrix.md      # Consolidated defect register (P0 - P3)
│   ├── BUG-001_csv_decimal_stripping_regex.md     # [P0 Blocker] Regex destroys statement decimals
│   ├── BUG-002_test_db_isolation_and_env_vars.md  # [P1 High] Test harness collides with real user DB
│   ├── BUG-003_eslint_syntax_and_undeclared_globals.md # [P2 Medium] Lint errors & undefined globals
│   └── BUG-004_non_throwing_test_assertions.md    # [P2 Medium] Silent assertion failures in test suite
│
├── 03_Evaluations/                                # Competitive & Heuristic Evaluations
│   ├── competitive_landscape_evaluation.md        # Ledgerly vs. YNAB, Splitwise, Notion, Spreadsheets
│   ├── usability_and_ux_scorecard.md              # Nielsen Norman heuristic evaluation & scoring
│   └── household_vs_solo_mode_evaluation.md       # Multi-user household workflow on desktop
│
├── 04_Improvements/                               # Tiered Improvement Specs & Implementation Guides
│   ├── tier1_immediate_critical_hotfixes.md       # Step-by-step code patches for P0/P1 defects
│   ├── tier2_reconciliation_and_ux_enhancements.md# Statement duplicate detection & recurring bills
│   └── tier3_strategic_roadmap_local_lan_sync.md  # Local-First Wi-Fi PWA companion & offline OCR
│
└── 05_Test_Plans_and_Checklists/                  # Test Strategy, E2E Scenarios & Checklists
    ├── master_qa_test_plan.md                     # Comprehensive multi-tier test plan
    └── regression_verification_checklist.md       # Release readiness verification protocol
```

---

## 🚦 Current Quality Dashboard (Milestone v0.4.4)

| Quality Gate | Current Status | Notes / Findings |
|---|:---:|---|
| **Syntax & Compile Check** | 🟢 **PASS** | 37/37 JS files cleanly parsed (`npm run check`) |
| **Backend Domain Services** | 🟢 **PASS** | 8 domain services decomposed; storage facade fully backward-compatible |
| **Profile Data Isolation** | 🟢 **PASS** | Multi-profile isolation verified 100% clean across cold restarts |
| **ESLint Static Analysis** | 🔴 **FAIL** | 2 errors, 9 warnings (`npm run lint` fails) |
| **Data Ingestion Integrity** | 🔴 **CRITICAL** | Regex bug in `fileImporter.js` strips decimal points from amounts |
| **Automated UI Test Suite** | 🟡 **BLOCKED** | Playwright test times out due to missing DB path environment override |
| **Product Purpose & Market Fit**| 🟢 **STRONG** | High appeal for privacy-conscious power users, needs mobile companion bridge |

---

## 🎯 Next Priority QA Milestones

1. **Hotfix Release (`v0.4.4-patch1`)**:
   - Patch `BUG-001` (Currency regex in `fileImporter.js`).
   - Patch `BUG-002` (Support `process.env.LEDGERLY_DB_PATH` in `JsonDatabase.js`).
   - Patch `BUG-003` (ESLint errors in `nlpParser.js` and `quickPill.js`).
   - Patch `BUG-004` (Enforce strict throwing assertions in test suites).
2. **Phase 5 Schema Validation Layer (`v0.4.5`)**:
   - Validate all IPC boundaries with runtime schemas.
3. **Phase 6 UI Crash Boundaries (`v0.4.6`)**:
   - Implement graceful error boundaries and crash log file dumpers.
