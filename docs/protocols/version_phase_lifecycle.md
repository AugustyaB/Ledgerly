# Version & Phase Lifecycle Protocol

> **Universal Development Flow:**
> **Planning ➔ Implementation ➔ Auditing ➔ Documentation ➔ Commit (Phase) ➔ [Packaging & Push to Origin (Version Only)]**

---

## 1. Version Lifecycle & Planning Protocol

Every project version (e.g., `v0.4.0`, `v0.5.0`) governs a major milestone or thematic initiative. The lifecycle of a version follows mandatory stages:

1. **Idea & Scope Formulation**:
   - Define the overarching theme, problem statement, core value proposition, and user experience goals.
   - Classify the release level (e.g., `0.x.x` signifies Alpha Build phase; `1.0.0+` signifies approved production deployment).
   - **Depth vs. Breadth (DFS vs. BFS) Evaluation Gate** (ADR-009): Evaluate proposed capabilities across the 4-axis matrix:
     1. *Depth (DFS)*: Vertical domain mastery, edge-case resilience, and adaptive learning loops.
     2. *Breadth (BFS)*: Horizontal UI presence and touchpoints without sprawling into redundant cards.
     3. *Complexity Budget*: Bounded cognitive load, clean data schema extensions, and maintainability.
     4. *Performance Impact*: Sub-second offline execution, bounded memory, and non-blocking I/O.
2. **Phases Breakdown & Planning**:
   - Decompose the version into structured, sequential phase subsections (`<major>.<minor>.<phase>`, e.g., `v0.4.1`, `v0.4.2`, ..., `v0.4.7`).
   - Define clear boundaries, domain responsibilities, and completion criteria for each constituent phase.
3. **Sequential Phase Execution**:
   - Execute each phase subsection in strict order, adhering unconditionally to the **Phase Lifecycle Protocol** below.
   - Do not begin a subsequent phase until the preceding phase has completed auditing, documentation synchronization, and its atomic Git commit.
4. **Packaging for Distribution (Final Version Milestone)**:
   - Packaging the application for user distribution (electron-builder installer generation, portable executables, bundle verification) occurs **ONLY** as the final step of the entire version once all constituent phases are complete, audited, and verified.
   - **MANDATORY RULE:** **Packaging is strictly reserved for versions.** Individual phase subsections MUST NEVER be packaged for distribution.
5. **Version Push to Remote Origin (`git push origin main`)**:
   - **MANDATORY VERSION PUSH:** Upon conclusion of the full version milestone (after final phase packaging and smoke verification pass cleanly), the entire version's commit lineage MUST be pushed to GitHub (`git push origin main`).
   - Create an annotated Git release tag (e.g., `git tag -a v0.5.9 -m "Release v0.5: On-Device ML Document Intelligence Engine"`) and push tags (`git push origin --tags`).

---

## 2. Phase Lifecycle Protocol (Subsections)

Each phase is an incremental subsection of the active version. Every phase MUST adhere to the following gated lifecycle:

```
[ Blackboard Gate ] ➔ [ Planning Gate ] ➔ [ Implementation ] ➔ [ Auditing ] ➔ [ Documentation Sync ] ➔ [ Git Commit ]
```

### Stage 0: Blackboard Gate (Jira Task Inspection)
- Inspect `e:\AG_saves\Jira-Offline-Blackboard\projects\ledgerly\board.json` and `specs/`.
- Identify assigned ticket for the current role (`Backend`).
- **STRICT PREREQUISITE GUARD**: Check `depends_on`. Ensure all prerequisite tickets are marked `DONE`.
- Claim ticket: update `status` to `IN_PROGRESS` and append an entry to `worklog`.

### Stage 1: Gate Review & Planning
- Formulate a comprehensive implementation plan (`implementation_plan.md` artifact).
- Define architectural changes, file additions/modifications, and an empirical verification strategy.
- **STRICT GATE**: Stop and present the plan to the user. **NO implementation code or modifying commands may be executed until the user explicitly reviews and approves the plan.**

### Stage 2: Implementation
- Implement the approved plan using modular, decoupled architecture.
- Enforce strict coding standards: zero inline event handlers, hardened CSP, robust error guards, and backward compatibility.
- Implement code incrementally with focused, atomic changes.

### Stage 3: Auditing, Automated Code Review & Empirical Verification
- **MANDATORY AUTOMATIC GATE:** As soon as Stage 2 implementation finishes, the agent MUST automatically execute the Code Review Protocol ([`.agent/rules/code_review.md`](./code_review.md)) before proceeding to Stage 4.
- **Tier 1 Static Analysis**: Run `npm run lint` (ESLint) and `npm run check` (Syntax check). Must pass with 0 errors.
- **Tier 2 Semantic AI Review**: Audit changed files for Electron security, CSP, IPC guard validation, financial precision, and offline data persistence.
- **Tier 3 Test Verification**: Execute automated unit, negative, and stress test suites (`npm run test:...`).
- Require hard empirical evidence: test runner logs, assertions, and command outputs. "Trust me, it works" is never acceptable.
- Remediate any discovered Critical or Warning issues immediately before progressing.

### Stage 4: Documentation & Version Synchronization
- Update all project documentation to reflect the phase's completed subsection:
  - `CHANGELOG.md`: Record new capabilities, architecture upgrades, and fixes under the phase subsection.
  - `README.md`: Reflect current architecture and subsection version number.
  - `FLOW.md` / `.gsd/FLOW.md`: Update control flow maps, IPC channels, and lifecycle sequences.
  - `DECISIONS.md` / `.gsd/DECISION.md`: Record architectural decisions (ADRs).
  - `package.json` & `package-lock.json`: Synchronize the version tag.
  - State tracking files (`walkthrough.md`, artifacts).
- Present the final walkthrough to the user.
- **Do NOT package for deployment.** Proceed to Stage 5.

### Stage 5: Atomic Git Commit & Readable Logging
- **MANDATORY PER-PHASE COMMIT:** Every completed phase MUST be committed to Git immediately after Stage 4.
- **Readable Commit Logs**: Use Conventional Commits with a descriptive, human-readable multi-line body:
  ```
  feat(phase-<major>.<minor>.<phase>): <concise high-level summary>

  - <Component / Feature>: Key changes and additions
  - <Architecture / Security>: Refactorings, guards, or data invariants
  - <Verification>: Test suites verified and empirical proof metrics
  - <Documentation>: Synced CHANGELOG, README, FLOW, DECISIONS, package.json
  ```
- **Push to Active Release Branch**: Push the phase commit to `origin/release/v<major>.<minor>` to maintain immediate cloud backup without affecting `main`.

### Stage 6: Halt & Human Handoff (Zero Autonomous Chaining)
- Append the completion pulse to `.gsd/PULSE.md` adhering to ADR-006, ADR-007, and ADR-010.
- Provide the copy-pasteable handoff prompt to the user in the final chat response.
- **MANDATORY HARD STOP:** The agent MUST immediately cease calling tools and **HALT**.
- The agent is **categorically forbidden** from beginning the next phase, executing its own handoff prompt, or self-delegating. Only a direct, explicit user command in a new turn can initiate the next phase.

---

## 3. Release Branch Lifecycle & Zero-Clutter Policy

To maintain enterprise stability, continuous cloud backup, and an uncluttered repository:

1. **Version Inception**:
   - When starting a new major/minor version, create a dedicated release branch off `main`:
     ```bash
     git checkout -b release/v<major>.<minor>
     git push -u origin release/v<major>.<minor>
     ```
2. **Phase Iterations**:
   - Every phase is developed, audited, documented, and committed to this release branch.
   - Pushed to GitHub: `git push origin release/v<major>.<minor>`.
   - `main` remains untouched and 100% stable at the prior release.
3. **Version Milestone Finalization**:
   - Once all phases are finished, audited, and production installer packaging passes smoke tests:
     ```bash
     git checkout main
     git merge release/v<major>.<minor>
     git tag -a v<major>.<minor>.<final_phase> -m "Release v<major>.<minor>.<final_phase>: <Milestone Title>"
     git push origin main --tags
     ```
4. **Zero-Clutter Branch Cleanup**:
   - Immediately delete the temporary release branch locally and on GitHub origin:
     ```bash
     git branch -d release/v<major>.<minor>
     git push origin --delete release/v<major>.<minor>
     ```
   - **Result**: `main` becomes the new active release, Git tags permanently mark milestones, and zero obsolete branches clutter the repository.

---

## 4. General Development Lifecycle Summary

| Lifecycle Stage | Scope | Description |
|---|---|---|
| **1. Planning** | Version & Phase | Ideation, phase decomposition, detailed phase design, and strict user gate approval. |
| **2. Implementation** | Phase | Executing the approved phase plan with modular, safe, and backwards-compatible code. |
| **3. Auditing** | Phase | Empirical verification, automated testing, syntax checking, and regression validation. |
| **4. Documentation** | Phase & Version | Syncing CHANGELOG, README, FLOW, DECISIONS, package manifests, and state tracking. |
| **5. Commit & Push** | **Phase Mandatory** | Atomic commit with rich readable description pushed to `release/v<major>.<minor>`. |
| **6. Packaging, Merge & Cleanup** | **Version ONLY** | Package installer, merge release branch to `main`, push tags, and delete release branch. |
