# 🐛 Defect Report: BUG-005

> **Defect ID**: `BUG-005`  
> **Title**: Receipt "Phantom Pipeline": Uploaded Mobile Receipts Never Create Expense Entries on Desktop & Background OCR Results Are Discarded  
> **Component**: `src/services/SyncServer.js`, `mobile/src/services/SyncClient.js`, `mobile/src/views/CaptureView.js`  
> **Severity**: **P0 — Blocker (Data Ingestion Void / False Security)**  
> **Found By**: Antigravity Lead QA & Head of Software Quality  
> **Date Logged**: September 19, 2026  
> **Status**: 🟢 RESOLVED  
> **Milestone / Phase**: Milestone v0.6 / Phase 0.6.3  

---

## 1. Defect Summary

When a user snaps a photo of a receipt in the mobile companion app using `CaptureView.js` and fills out the review bottom sheet (entering a draft amount such as ₹450 and a merchant name such as "Starbucks"), the mobile app stores the image in IndexedDB (`STORE_RECEIPTS`). It does **not** create a matching record in `offline_transactions`.

During synchronization (`syncNow()`):
1. `SyncClient.js` strips all draft amounts and merchant details, sending only `{ imageData, mimeType, hasManualDetails: true, filename }` to `/api/v1/sync/receipt`.
2. `SyncServer.js` writes the image to `receiptStorage`, but **never creates an Expense record** in `expenses_db.json`.
3. Because `hasManualDetails` is `true`, `SyncServer.js` skips background OCR (`if (!hasManualDetails)`).
4. Even if `hasManualDetails` was `false`, `SyncServer.js` invokes `await this.documentIntelligenceService.processDocument(saved.absolutePath)` and **completely discards the return value** without writing to database or dispatching an event to the desktop UI.
5. In parallel, `SyncClient.js` enforces the "Immediate Purge" policy (`await indexedDbQueue.deleteReceipt(rcpt.id)`).

As a result, the receipt photo is erased from the phone and saved to the desktop hard drive, but **zero expenses are ever created in the desktop ledger**. The user's financial expense completely vanishes.

---

## 2. Affected Code Locations

### Location 1: `mobile/src/views/CaptureView.js` (Lines 212–230)
```javascript
const item = {
  id,
  localUri: `indexeddb://receipts/${id}.jpg`,
  capturedAt: this.currentPendingCapture.capturedAt || new Date().toISOString(),
  fileSize: this.currentPendingCapture.fileSize,
  mimeType: this.currentPendingCapture.mimeType || 'image/jpeg',
  draftAmount: draftAmountVal,
  draftMerchant: draftMerchantVal,
  draftDate: new Date().toISOString().slice(0, 10),
  notes: 'Captured via Ledgerly Mobile Camera',
  syncStatus: 'queued',
  retryCount: 0,
  lastError: null,
  imageData: this.currentPendingCapture.dataUrl
};

// Only enqueues to receipt store; never stages an offline transaction
await indexedDbQueue.enqueueReceipt(item);
```

### Location 2: `mobile/src/services/SyncClient.js` (Lines 205–221)
```javascript
const rcptRes = await fetch(`${baseUrl}/api/v1/sync/receipt`, {
  method: 'POST',
  headers: authHeaders,
  body: JSON.stringify({
    imageData: rcpt.imageData,
    mimeType: rcpt.mimeType || 'image/jpeg',
    hasManualDetails: Boolean(rcpt.draftAmount || rcpt.draftMerchant),
    filename: rcpt.id
    // BUG: draftAmount, draftMerchant, draftDate, notes are completely omitted!
  })
});

const rcptData = await rcptRes.json();
if (rcptRes.ok && rcptData.success) {
  // Purges from phone immediately while desktop hasn't created an expense!
  await indexedDbQueue.deleteReceipt(rcpt.id);
  uploadedReceipts++;
}
```

### Location 3: `src/services/SyncServer.js` (Lines 835–866)
```javascript
const saved = this.receiptStorage.saveReceiptBuffer(imageBuffer, extension);
// ...
if (!hasManualDetails && this.documentIntelligenceService) {
  setTimeout(async () => {
    try {
      // BUG: The return value of processDocument is discarded; no expense is added!
      await this.documentIntelligenceService.processDocument(saved.absolutePath);
    } catch (ocrErr) {
      console.warn('[SyncServer] Background OCR warning on mobile receipt:', ocrErr.message);
    }
  }, 0);
}
// BUG: Never creates an entry in activeData.expenses or staging table
```

---

## 3. Reproduction Steps

1. Launch Mobile Companion app and navigate to Capture tab.
2. Capture receipt photo and enter Draft Total: `₹450`, Merchant: `Starbucks`. Click "Save to Queue".
3. Navigate to Sync tab and click "Sync Now to Desktop".
4. Mobile shows success badge: "Synced (0 tx, 1 img)!".
5. Observe desktop Ledgerly Expense Feed / Dashboard.
6. **Actual Result**: No expense for ₹450 (Starbucks) exists in the desktop ledger. The file exists in `receipts/` directory, but the user's spending data is lost.
7. **Expected Result**: An expense of ₹450 with merchant "Starbucks" and receipt attachment link should be created in the active desktop profile.

---

## 4. Remediation Plan

1. In `mobile/src/views/CaptureView.js`: When saving a receipt with draft amount, also enqueue an offline transaction in `STORE_TRANSACTIONS` with `receiptId: item.id`.
2. In `mobile/src/services/SyncClient.js`: Include `draftAmount`, `draftMerchant`, `draftDate` in `POST /api/v1/sync/receipt`.
3. In `src/services/SyncServer.js`: When receiving receipt metadata, create an expense record in `activeData.expenses` linked to the saved receipt image filename. If OCR is executed, populate the parsed fields into an unconfirmed expense record in desktop storage.
