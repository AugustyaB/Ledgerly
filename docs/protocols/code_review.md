---
trigger: always_on
description: "Automatic Two-Tier Code Review Protocol combining ESLint with Antigravity Semantic Review. Automatically executed at the end of every phase implementation before verification and documentation."
---

# Code Review Protocol (ESLint + Antigravity Semantic Review)

This rule defines the standard, automated code review protocol for the **Ledgerly (Expense Logger)** project. It combines deterministic static analysis via ESLint with deep semantic analysis by the Antigravity agent to ensure enterprise-grade code quality, financial data integrity, and Electron application security.

---

## 1. Automatic Execution Triggers (Phase & Version Lifecycle)

**NO MANUAL PROMPT REQUIRED.** The model MUST automatically trigger and execute this protocol upon encountering any of the following lifecycle conditions:

1. **End-of-Phase Implementation Gate (Stage 2 ➔ Stage 3 Transition)**:
   - **Condition**: All planned implementation tasks and code edits for the active phase subsection (e.g., `v0.4.x`, `v0.5.x`) are completed.
   - **Action**: Before creating documentation, updating version tags, or marking the phase complete, the agent MUST immediately invoke this review protocol as the first mandatory step of **Stage 3 (Auditing & Empirical Verification)**.
2. **Verification & Audit Workflows**:
   - **Condition**: Running `/verify <phase>`, `/audit-milestone`, or drafting `.gsd/phases/{phase}/VERIFICATION.md` / `*-SUMMARY.md`.
   - **Action**: Run the static lint checks and semantic audit, embedding findings into the verification proof.
3. **Pre-Commit / Pre-PR Gate**:
   - **Condition**: Staging code or preparing a release commit.
4. **On-Demand User Prompts**:
   - Explicit user requests to "review my code", "audit changes", or "check quality".

```
┌──────────────────────────────┐
│ Stage 1: Planning            │ ➔ Implementation Plan & Gate Approval
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│ Stage 2: Implementation      │ ➔ Code written for all phase tasks
└──────────────┬───────────────┘
               │
               ▼
   [ AUTOMATIC TRIGGER GATE ]  ➔ Agent automatically executes code_review.md
               │
               ▼
┌──────────────────────────────┐
│ Stage 3: Auditing & Review   │ ➔ Tier 1 (ESLint/Syntax) + Tier 2 (Semantic AI Review) + Tests
└──────────────┬───────────────┘
               │ (All checks must pass cleanly)
               ▼
┌──────────────────────────────┐
│ Stage 4: Documentation Sync  │ ➔ CHANGELOG, README, FLOW, DECISIONS, package.json
└──────────────────────────────┘
```

---

## 2. Two-Tier Review Execution Strategy

```
[ Phase Code Changes ]
          │
          ▼
┌─────────────────────────────────────────┐
│ Tier 1: Deterministic Static Analysis   │ ➔ npm run lint (ESLint) & npm run check
└─────────────────────────────────────────┘
          │ (Must pass with 0 errors)
          ▼
┌─────────────────────────────────────────┐
│ Tier 2: Antigravity Semantic AI Review  │ ➔ Security, Data Integrity, Electron Sandbox, Edge Cases
└─────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────┐
│ Automated Test Suite Verification       │ ➔ npm run test:... (Regression & Phase Tests)
└─────────────────────────────────────────┘
          │
          ▼
[ Structured Review Report & Auto-Remediation ]
```

---

### Tier 1: Deterministic Static Analysis (Fast & Automated)

Before performing any semantic or AI-based review, the agent must execute and verify the project's local verification scripts:

1. **Run ESLint**:
   ```bash
   npm run lint
   ```
   *Strict Requirement:* Must have **0 errors**. Fix any syntax issues, undefined identifiers (`no-undef`), or unused variables prior to review.
2. **Run Syntax Check**:
   ```bash
   npm run check
   ```
   Verifies Node.js AST parsing across backend, preload, and script files.
3. **Check Code Formatting**:
   ```bash
   npm run format
   ```
   Ensure Prettier formatting consistency across `src/**/*.{js,html,css}`.

---

### Tier 2: Antigravity Semantic Review (Deep Inspection)

Once Tier 1 passes cleanly, Antigravity acts as the Senior Engineer / Security Auditor, inspecting the Git diff against `main` or the phase's modified files. Focus strictly on these project-critical areas:

#### 1. Electron Security & Isolation
- **Context Isolation & CSP**: Ensure strict Content Security Policy (CSP) compliance. No `eval()`, `new Function()`, or unsafe script evaluation.
- **Zero Inline Handlers**: Verify that no HTML contains inline listeners (e.g., `onclick="..."`, `onload="..."`). All listeners must be attached dynamically in JavaScript.
- **IPC Hardening**: Validate all IPC channels between renderer and main process (`electronAPI`). Ensure input parameters from the renderer are treated as untrusted and strictly validated via `ipcGuard.js` / `schemaValidator.js` before executing file or OS operations.

#### 2. Financial Data Integrity & Offline Storage
- **Decimal & Currency Precision**: Ensure monetary calculations avoid floating-point drift (e.g., proper rounding or integer-cent math).
- **Atomic Persistence**: Ensure modifications to the local database / JSON storage files are safely committed, preventing data corruption during unexpected application shutdowns.
- **Boundary Validation**: Check for negative values, null/undefined categories, zero-division in percentage calculations, and invalid ISO dates.

#### 3. Asynchronous & DOM Resilience
- **Promise Rejection & Error Handling**: Guarantee that all async operations (`async/await`, IPC calls, file reads) have structured `try/catch` error boundaries with helpful user notifications.
- **DOM & Chart Lifecycle**: Confirm that Chart.js instances or custom canvas renders are cleanly destroyed before re-instantiation to prevent memory leaks.
- **Event Listener Leaks**: Ensure event listeners on dynamic UI components (such as modal backdrops or table rows) are cleaned up or delegated.

---

## 3. Review Report Format

When delivering the review report at the end of the phase, format findings into clear severity buckets:

```markdown
### 🛡️ Automated Phase Code Review Report: [Phase Subsection / Feature Name]

#### 1. Static Analysis (ESLint & Checkers)
- **ESLint**: Passed (0 errors, X warnings)
- **Syntax Check**: Passed (52/52 JS files clean)

#### 2. Critical Issues (Must Fix Before Advancing to Stage 4)
- *None* or list of blocking bugs, data loss hazards, or security risks.

#### 3. Warnings (Logic Flaws & Missing Edge Cases)
- Missing error boundary, race condition, or potential edge-case bug.

#### 4. Recommendations & Performance
- Code readability, query optimization, or structural improvements.

#### 5. Proposed Fixes & Auto-Remediation
- Concrete solutions applied or proposed.
```

---

## 4. Autonomous Remediation Gate

When issues are discovered during the automated review:
1. **Critical or Warning items block phase progression.**
2. The agent must automatically propose and apply fixes.
3. Re-run `npm run lint`, `npm run check`, and test suites until all checks pass cleanly.
4. Only when the review report confirms clean status may the agent transition to **Stage 4 (Documentation & Version Synchronization)**.
