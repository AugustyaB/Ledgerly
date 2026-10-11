# 🛡️ Ledgerly — Quality Assurance Testing Hub

> **Department**: Quality Assurance & Software Integrity  
> **QA Lead / Auditor**: Lead Quality Assurance (QA) Tester & Head of Software Quality  
> **Application**: Ledgerly Desktop (`v0.7.3` Active Build)  
> **Status**: Milestone v0.7 Certified  
> **Last Updated**: September 27, 2026  

---

## 📌 Executive QA Charter

This directory serves as the centralized repository for all **Quality Assurance audits, defect tracking, product-market evaluations, testing methodologies, and architectural improvement specifications** for Ledgerly.

As the Quality Assurance team, our mandate is twofold:
1. **Ensure Software Integrity**: Zero data loss, robust cryptographic security, deterministic calculations, crash prevention, and zero regressions across all desktop environments.
2. **Protect User Value & Experience**: Ensure the application solves real human problems with minimal friction, retains users past Day 14, and delivers on its promise of a 100% offline, privacy-first financial command center.

---

## 🏆 Featured Milestone Audit: Version 0.8 (Phases 0.8.1 – 0.8.4) (Must Read)

👉 **[`phase_0.8_subsystem_audit_report.md`](01_Audit/phase_0.8_subsystem_audit_report.md)**  
*The canonical, empirical subsystem audit report evaluating Milestone v0.8’s Adaptive Receipt Vision & Learning Loop (0.8.1), Exploratory Data Analysis & Rollup Foundation (0.8.2), Smart Statement Reconciliation & Fuzzy Deduplication (0.8.3), and Smart Insights & Behavioral Notifications (0.8.4). Confirms 100% empirical pass rate across all 12 test suites and 21/21 unideal chaos scenarios.*

---

## 📂 Directory Structure

The QA department is organized into structured subfolders:

```text
Quality assurance testing/
├── README.md                                      # This QA Hub Index & Status Dashboard
│
├── 01_Audit/                                      # Project Purpose, Vision & Milestone Audits
│   ├── phase_0.8_subsystem_audit_report.md        # [LATEST] Phase 0.8 Subsystem Audit & Empirical Sign-Off
│   ├── phase_0.7_master_audit_report.md           # Milestone v0.7 Master Audit (Partitioned Storage & Mirroring)
│   ├── phase_0.6.6_milestone_release_audit.md     # Milestone v0.6 Release Audit (iOS & LAN Sync)
│   ├── phase_0.6.4_apk_and_cross_device_audit_report.md # Phase 0.6.4 APK & Cross-Device E2E Audit
│   ├── phase_0.6.3_wifi_sync_audit_report.md      # Phase 0.6.3 Wi-Fi Sync & Pairing Audit
│   ├── MASTER_AUDIT_REPORT_VERSION_5.md           # [CANONICAL] Master Audit Report: Version 0.5 Models
│   ├── v0.5_model_performance_audit.md            # Benchmark telemetry & detailed sample breakdowns
│   ├── project_purpose_and_vision_audit.md        # Core purpose, 5 pillars, and user definitions
│   ├── acquisition_and_download_feasibility.md    # Download barrier analysis & acquisition viability
│   └── retention_and_daily_utility_audit.md       # "Day 14" retention audit & daily UX friction analysis
│
├── 02_Defects/                                    # Formal Defect Tickets & Severity Matrix
│   ├── defect_backlog_and_severity_matrix.md      # Consolidated defect register (P0 - P3)
│   ├── phase_0.8_observed_hazards_and_remediations.md # [HAZARDS 801-806] Forensic hazard diagnoses & remediations
│   ├── BUG-001_csv_decimal_stripping_regex.md     # [P0 Blocker] Regex destroys statement decimals
│   ├── BUG-002_test_db_isolation_and_env_vars.md  # [P1 High] Test harness collides with real user DB
│   ├── BUG-003_eslint_syntax_and_undeclared_globals.md # [P2 Medium] Lint errors & undefined globals
│   ├── BUG-004_non_throwing_test_assertions.md    # [P2 Medium] Silent assertion failures in test suite
│   ├── BUG-005_receipt_phantom_pipeline.md        # [P0 Blocker] Uploaded receipts never create ledger expenses
│   ├── BUG-006_unconditional_mobile_deletion_partial_push.md # [P0 Blocker] Client data loss on partial push
│   └── BUG-007_missing_desktop_pairing_ui.md      # [P0 Blocker] Desktop app lacks pairing UI controls
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
├── 05_Test_Plans_and_Checklists/                  # Test Strategy, E2E Scenarios & Checklists
│   ├── master_qa_test_plan.md                     # Comprehensive multi-tier test plan
│   └── regression_verification_checklist.md       # Release readiness verification protocol
│
└── benchmarks/                                    # Ground-Truth Benchmarking Harness (v0.5 Models)
    ├── dataset_manifest.json                      # 17 Ground-truth test document contracts
    ├── generate_benchmark_samples.js              # Playwright rasterizer & vector PDF generator
    ├── benchmark_runner.js                        # Multi-tier empirical benchmark evaluator
    ├── benchmark_results.json                     # Complete machine-readable audit telemetry
    └── samples/                                   # Real raster PNGs and vector PDF test files
```

---

## 🚦 Quality Scorecard Dashboard (v0.8.4 State)

| Quality Gate | Current Status | Notes / Findings |
|---|:---:|---|
| **Syntax & Compile Check** | 🟢 **PASS** | 60/60 JS files cleanly parsed (`npm run check`) |
| **ESLint Static Analysis** | 🟢 **PASS** | 0 errors, 0 warnings across entire codebase (`npm run lint`) |
| **Adaptive Vision & Learning (0.8.1)** | 🟢 **100%** | 72/72 tests passing; dynamic alias loop & repeat layout memory verified |
| **EDA & Rollup Pipeline (0.8.2)** | 🟢 **100%** | 112/112 tests passing; sub-5ms rollups, non-destructive sanitization |
| **Fuzzy Reconciliation (0.8.3)** | 🟢 **100%** | 17/17 tests passing; multi-signal composite matching, 1-to-1 Coffee Invariant |
| **Smart Insights & Notifications (0.8.4)**| 🟢 **100%** | 22/22 tests passing; 5 cadences, price hike detection, data-gated What-If |
| **Unideal Chaos & Failure Modes** | 🟢 **100%** | 21/21 tests passing (`npm run test:phase8-chaos`); NaN/Inf traps & type safety locked |
| **Master User Journeys (A, B, C, D)** | 🟢 **100%** | 4 human personas + 100% INR ₹ & EUR € accuracy across banking statements & receipts |
| **Partitioned Storage Invariant** | 🟢 **100%** | Active (<90d) / Cold Archive (>90d) physical separation & continuous mirroring |

---

## 🎯 Next Release Invariants (v0.8.5 Gates)

1. **Ephemeral UDP Pairing Beacon**:
   - Limit pairing beacon broadcast to active 60-second pairing window with clean socket teardown on close/unpair.
2. **Wi-Fi Brute-Force Rate Limiting**:
   - Enforce 15 failed attempt rate limit with 60-second lockout on `/api/v1/pair` using memory-bounded sliding timestamp windows.
3. **Optical QR Code Ephemeral Secrets**:
   - Dynamic QR codes must encode cryptographically random ephemeral session secrets (`crypto.randomBytes(16)`), never long-lived credentials.
