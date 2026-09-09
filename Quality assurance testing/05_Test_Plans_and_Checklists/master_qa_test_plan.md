# 🧪 Master QA Test Plan

> **Module**: Quality Assurance — Comprehensive Testing Strategy  
> **Document ID**: `TEST-PLAN-001`  
> **Target**: Full Application Verification Across All Tiers  
> **Status**: APPROVED & ACTIVE  

---

## 1. Test Strategy & Pyramid

Ledgerly follows a 4-tier testing hierarchy to guarantee reliability across both Electron processes:

```text
               / \
              /   \      Tier 4: Automated E2E Playwright UI Tests
             / E2E \     (Full Electron UI interaction, screenshots)
            /-------\
           /  Int.   \   Tier 3: Multi-Service Integration Tests
          /-----------\  (E2E Data Flow, Cold Restart, Profile Switch)
         /   Domain    \ Tier 2: Domain Service Unit Tests
        /---------------\(Budget, Household, Notes, Auth math)
       /  Static Checks  \Tier 1: Syntax (check-syntax.js) & ESLint
      /-------------------\
```

---

## 2. Test Execution Matrix & Commands

| Suite Name | Target Layer | Command / Script | Coverage Scope |
|---|---|---|---|
| **Syntax Check** | All 37 JS files | `npm run check` | Validates ECMAScript parse cleanliness. |
| **ESLint Analysis** | Code Hygiene | `npm run lint` | Unused variables, undeclared globals, scoping errors. |
| **Profile Isolation** | Multi-Tenancy | `node scratch/test_batch2_profiles.js` | 8 multi-profile isolation & cold restart scenarios. |
| **Full E2E Integration** | Backend Services | `npm run test:e2e` | 8 domain subsystems (CRUD, Budget, Debt, Importer, Notes). |
| **Master Account Auth** | Cryptography | `node scratch/test_account_auth.js` | PBKDF2 hashing, rate-limiting, session clearance. |
| **Empirical Phase 5** | File I/O & Notes | `node scratch/test_phase5.js` | CSV, XLSX, OFX, JSON parsing, contextual notes CRUD. |
| **Playwright E2E UI** | Desktop Visuals | `npm run test:ui` | Electron UI rendering, modal workflows, artifact snapshots. |

---

## 3. High-Risk Test Scenarios (P0 Focus)

1. **Decimal Precision Test**:
   - Verify that importing a statement with `$1,234.56` results in exactly `1234.56`, not `123456` or `1234`.
2. **Cold Restart Persistence**:
   - Write 10 transactions, shut down Electron process cleanly, unmount storage, instantiate new storage instance, and verify 100% record match.
3. **Multi-Profile Leakage**:
   - Add expenses to Profile A. Switch to Profile B. Ensure Profile B's ledger count is `0`. Add expense to Profile B. Switch back to Profile A. Ensure Profile A only sees its own transactions.
4. **Pairwise Debt Cancellation**:
   - Member A pays ₹100 for Member B. Member B pays ₹100 for Member A. Resolve debt. Net balance must be exactly ₹0.00 with 0 pending settlements.
