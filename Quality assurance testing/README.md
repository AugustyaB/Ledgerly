# 🛡️ Ledgerly — Quality Assurance Testing Hub

> **Department**: Quality Assurance & Software Integrity  
> **QA Lead / Auditor**: Lead Quality Assurance (QA) Tester & Head of Software Quality  
> **Application**: Ledgerly Desktop (`v0.5.9` Active Build)  
> **Status**: Active QA Oversight  
> **Last Updated**: September 24, 2026  

---

## 📌 Executive QA Charter

This directory serves as the centralized repository for all **Quality Assurance audits, defect tracking, product-market evaluations, testing methodologies, and architectural improvement specifications** for Ledgerly.

As the Quality Assurance team, our mandate is twofold:
1. **Ensure Software Integrity**: Zero data loss, robust cryptographic security, deterministic calculations, crash prevention, and zero regressions across all desktop environments.
2. **Protect User Value & Experience**: Ensure the application solves real human problems with minimal friction, retains users past Day 14, and delivers on its promise of a 100% offline, privacy-first financial command center.

---

## 🏆 Featured Milestone Audit: Version 0.5 (Must Read)

👉 **[`MASTER_AUDIT_REPORT_VERSION_5.md`](01_Audit/MASTER_AUDIT_REPORT_VERSION_5.md)**  
*The canonical, empirical audit report evaluating Version 0.5’s document intelligence models (Tier 1 Fast-Lite, Tier 2 Vision-Pro, Tier 3 Regional). Covers the independent 17-sample ground-truth benchmark results, the "Page 1 of 1" PDF header bug, the over-engineering root cause of Tier 2, and the strategic implementation blueprint for upcoming releases.*

---

## 📂 Directory Structure

The QA department is organized into structured subfolders:

```text
Quality assurance testing/
├── README.md                                      # This QA Hub Index & Status Dashboard
│
├── 01_Audit/                                      # Project Purpose, Vision & Milestone Audits
│   ├── phase_0.6.4_apk_and_cross_device_audit_report.md # [LATEST] Phase 0.6.4 APK & Cross-Device E2E Audit
│   ├── phase_0.6.3_wifi_sync_audit_report.md      # Phase 0.6.3 Wi-Fi Sync & Pairing Audit
│   ├── MASTER_AUDIT_REPORT_VERSION_5.md           # [CANONICAL] Master Audit Report: Version 0.5 Models
│   ├── v0.5_model_performance_audit.md            # Benchmark telemetry & detailed sample breakdowns
│   ├── project_purpose_and_vision_audit.md        # Core purpose, 5 pillars, and user definitions
│   ├── acquisition_and_download_feasibility.md    # Download barrier analysis & acquisition viability
│   └── retention_and_daily_utility_audit.md       # "Day 14" retention audit & daily UX friction analysis
│
├── 02_Defects/                                    # Formal Defect Tickets & Severity Matrix
│   ├── defect_backlog_and_severity_matrix.md      # Consolidated defect register (P0 - P3)
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

## 🚦 Quality Scorecard Dashboard (v0.5.9 State)

| Quality Gate | Current Status | Notes / Findings |
|---|:---:|---|
| **Syntax & Compile Check** | 🟢 **PASS** | 52/52 JS files cleanly parsed (`npm run check`) |
| **ESLint Static Analysis** | 🟢 **PASS** | 0 errors, 0 warnings across entire `src/` tree (`npm run lint`) |
| **Tier 1 Fast-Lite Total Acc** | 🟡 **71.4%** | Fails on cash tender traps and European comma decimals; needs backporting |
| **Tier 2 Vision-Pro Total Acc** | 🟡 **78.6%** | Avoids tender traps, but breaks on composite bills due to rigid inpainting |
| **Tier 3 Regional Total Acc** | 🟢 **92.9%** | Dominant engine; handles comma decimals, UPI slips, and statutory IDs |
| **Negative Control Rejection** | 🟢 **100%** | Zero false financial transactions; Laplacian blur gate rejects in 7ms |
| **Average Ingestion Latency** | 🟢 **211ms** | Preserves sub-second desktop speed; vector PDFs process in < 15ms |

---

## 🎯 Next Release Invariants (v0.6.0 Gates)

1. **Promote Tier 1 to 90%+ Universal Baseline**:
   - Backport comma decimals (`parseRegionalMonetary`), Anti-Trap filter, and regional date disambiguation.
2. **Patch the PDF Header Bug**:
   - Filter out `--- Page X of Y ---` from `BOILERPLATE_HEADER_PATTERNS` to elevate digital PDF merchant extraction above 85%.
3. **Eliminate Currency Bleed**:
   - Ensure explicit document currency signs strictly override active profile default fallbacks.
4. **Field-Level Confidence Chips in UI**:
   - Give users visual indicators of mathematical verification on individual fields in the Review Cockpit.
