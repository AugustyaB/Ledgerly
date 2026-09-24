# 🐛 Defect Report: BUG-006

> **Defect ID**: `BUG-006`  
> **Title**: Data Loss Hazard on Partial Push Failure: `SyncClient.js` Unconditionally Deletes All Pending Transactions  
> **Component**: `mobile/src/services/SyncClient.js` (Lines 173–189)  
> **Severity**: **P0 — Blocker (Catastrophic Data Loss)**  
> **Found By**: Antigravity Lead QA & Head of Software Quality  
> **Date Logged**: September 19, 2026  
> **Status**: 🟢 RESOLVED  
> **Milestone / Phase**: Milestone v0.6 / Phase 0.6.3  

---

## 1. Defect Summary

During synchronization in `SyncClient.syncNow()`, offline transactions staged in IndexedDB are sent via `POST /api/v1/sync/push`.

`SyncServer.js` validates each transaction independently using `validateMobileTransaction(tx)`. If one or more transactions in the batch fail schema validation (e.g. invalid date, negative amount, malformed payload), `SyncServer.js` appends the failures to an `errors` array and applies only the valid transactions. It then returns HTTP status 200 with:
```json
{
  "success": true,
  "appliedCount": 4,
  "failedCount": 1,
  "errors": [{ "id": "tx-102", "errors": ["Amount must be positive"] }]
}
```

However, `SyncClient.js` checks only `if (!pushRes.ok || !pushData.success)`. Since the HTTP status is 200 and `success` is `true`, `SyncClient.js` enters its cleanup loop:
```javascript
for (const tx of pendingTx) {
  await indexedDbQueue.deleteTransaction(tx.id);
}
```
It deletes **all** pending transactions from mobile IndexedDB, including the rejected ones.

Consequently, any transaction rejected by desktop validation is wiped from mobile local storage forever without reaching the desktop database.

---

## 2. Affected Code Location

In [`mobile/src/services/SyncClient.js`](file:///e:/AG_saves/App%20Idea%20-%20Expense%20Logger/mobile/src/services/SyncClient.js) (Lines 173–189):

```javascript
const pushRes = await fetch(`${baseUrl}/api/v1/sync/push`, {
  method: 'POST',
  headers: authHeaders,
  body: JSON.stringify({ transactions: pendingTx })
});

const pushData = await pushRes.json();
if (!pushRes.ok || !pushData.success) {
  throw new Error(pushData.error || 'Failed to push transactions to desktop.');
}

// Clean up or mark synced transactions
// BUG: Deletes every tx in pendingTx regardless of pushData.errors!
for (const tx of pendingTx) {
  await indexedDbQueue.deleteTransaction(tx.id);
}
pushedCount = pushData.appliedCount || pendingTx.length;
```

---

## 3. Reproduction Steps

1. Manually insert two offline transactions into mobile IndexedDB:
   - TX-1: Valid transaction (₹120, Food & Dining, 2026-09-19).
   - TX-2: Invalid transaction (₹-50, Food & Dining, invalid date).
2. Trigger `syncClient.syncNow()`.
3. Inspect `SyncServer` log: TX-1 is applied; TX-2 is rejected (`errors: [{ id: 'TX-2', errors: ... }]`).
4. Inspect mobile IndexedDB `offline_transactions` store.
5. **Actual Result**: TX-2 has been deleted from mobile storage and does not exist on desktop. Irrecoverable data loss.
6. **Expected Result**: TX-1 is deleted from mobile storage (or marked `synced`); TX-2 remains in mobile storage with `syncStatus: 'error'`, alerting the user to fix the entry.

---

## 4. Remediation Plan

Update `SyncClient.js` to cross-reference the server's acknowledgment:
```javascript
const failedIds = new Set((pushData.errors || []).map(e => e.id));
for (const tx of pendingTx) {
  if (!failedIds.has(tx.id)) {
    await indexedDbQueue.deleteTransaction(tx.id);
  } else {
    await indexedDbQueue.updateTransaction(tx.id, {
      syncStatus: 'error',
      lastError: 'Desktop schema rejected transaction'
    });
  }
}
```
