# 👥 Household Mode vs. Solo Mode Evaluation

> **Module**: Quality Assurance — Multi-Tenant Architecture & Workflow Evaluation  
> **Document ID**: `EVAL-003`  
> **Target**: Household Splitting vs. Single-User Solitary Workspaces  
> **Status**: Completed & Verified  

---

## 1. Context & Architectural Problem

Expense management applications often struggle to balance two opposing user needs:
1. **The Solo Budgeter**: Wants 100% of the screen focused on personal cash flow, savings rate, and discretionary allowance. Shared split cards and roommate balance widgets are visual noise.
2. **The Shared Household**: Needs multi-person attribution, split percentages, utility bill tracking, and pairwise debt netting.

In Ledgerly Version `v0.4`, this was addressed through the **Workspace Mode Switcher** (`solo` vs. `household`) and the **Multi-Profile Isolation System** (`ProfileService.js`).

---

## 2. Evaluation of Solo Workspace Mode

When `workspaceMode === 'solo'`:
* The sidebar collapses or hides the `👥 Household Split` navigation link.
* The dashboard hides the right-hand settlement checklist and expands the Recent Transactions ledger to full width.
* The express entry bar and modal default to `isHousehold: false` without prompting for member splits.
* **QA Rating**: **9 / 10**. Clean, clutter-free, and respects single users.

---

## 3. Evaluation of Household Mode & The "Single-Device" Trade-Off

When `workspaceMode === 'household'`:
* The user can toggle between `Combined Household View` and individual personal spaces (`👨 Rahul`, `👩 Priya`).
* Pairwise debt netting calculates simplified repayment streams:
  ```text
  Rahul spent ₹1,200 (Shared: Rahul 50%, Priya 50%)
  Priya spent ₹300 (Shared: Rahul 50%, Priya 50%)
  --> Net: Priya owes Rahul ₹450
  ```
* Clicking `[ Settle Up ]` creates an immutable settlement record and zeroes the balance.

### The Real-World Living Room Friction Test
* **The Problem**: In 95% of households, each adult has their own laptop and their own phone. Having a household finance app installed on only *one* laptop creates a bottleneck:
  - *"Did you log that grocery bill from yesterday?"*
  - *"No, your laptop was closed, can you log it?"*
* **Current Solution**: Multiple profiles under one master password account. Members log in when using the computer.
* **The Long-Term Solution (Roadmap v0.5+)**:
  - **Local LAN P2P Sync**: Both laptops on the same home Wi-Fi connect directly to sync shared transactions without any cloud intermediaries.
  - **Mobile PWA Companion**: Roommates scan a QR code from the host desktop to log expenses from their smartphones over the local network.

---

## 4. Evaluation Summary

The multi-profile architecture in `ProfileService.js` is robust and verified clean across cold restarts. Solo mode is an exceptional single-user tool. Household mode provides superior debt math, but will reach its full real-world potential once local network synchronization is released.
