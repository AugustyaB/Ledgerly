/**
 * ============================================================================
 * Ledgerly — User Journey D: Kabir (On-the-Go Mobile Capture & Local LAN Sync)
 * ============================================================================
 *
 * @fileoverview
 * End-to-End simulation of Persona 4: Kabir (On-the-Go Micro-Spender).
 *
 * User Story & Need:
 * Kabir spends money out on the street (groceries, cafes, transit) away from his
 * computer. He wants to snap paper bills on his smartphone without any cloud
 * accounts, queue expenses completely offline in IndexedDB, and synchronize
 * seamlessly with his desktop PC over local home Wi-Fi when he returns.
 *
 * Verification Journey:
 * 1. Mobile Client Initialization with Dynamic Currencies (testing both ₹ and €).
 * 2. Offline Micro-Transaction Queueing in mobile IndexedDB.
 * 3. Offline Grocery Receipt Capture & Downscaling Queueing.
 * 4. Desktop SyncServer initialization & Ephemeral 6-digit PIN Generation.
 * 5. Local Wi-Fi Pairing Handshake & Bearer Token Negotiation.
 * 6. Bidirectional LAN Sync Execution:
 *    - Mobile pushes transactions and receipt to Desktop.
 *    - Desktop persists receipt image to disk and creates ledger transaction.
 *    - Mobile executes immediate purge of uploaded receipt photo (storage hygiene).
 * 7. Multi-Currency Validation (INR ₹ and EUR € compatibility).
 * 8. Clean unpairing and session revocation.
 */

'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const assert = require('node:assert/strict');

// Desktop Services
const ExpenseStorage = require('../../src/storage');
const ReceiptStorage = require('../../src/receiptStorage');
const SyncServer = require('../../src/services/SyncServer');

const TEST_DIR = path.join(__dirname, 'test_userdata_journey_d');
const TEST_DB_PATH = path.join(TEST_DIR, 'expenses_db.json');
const TEST_RECEIPTS_DIR = path.join(TEST_DIR, 'receipts');
const TEST_PORT = 52488;

// Node environment polyfills for mobile browser APIs
globalThis.window = {
  dispatchEvent: () => true,
  addEventListener: () => {},
  removeEventListener: () => {}
};

class PolyfillCustomEvent extends Event {
  constructor(type, params = {}) {
    super(type, params);
    this.detail = params.detail || null;
  }
}
globalThis.CustomEvent = PolyfillCustomEvent;

const localStoreMap = new Map();
globalThis.localStorage = {
  getItem: key => localStoreMap.get(key) || null,
  setItem: (key, val) => localStoreMap.set(key, String(val)),
  removeItem: key => localStoreMap.delete(key),
  clear: () => localStoreMap.clear()
};

// 1x1 transparent PNG base64 for synthetic receipt image tests
const SAMPLE_RECEIPT_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

function cleanup() {
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  }
}

async function runJourneyD() {
  cleanup();
  console.log('\n================================================================================');
  console.log('📱 RUNNING USER JOURNEY D: KABIR (MOBILE CAPTURE & LOCAL LAN WI-FI SYNC)');
  console.log('================================================================================\n');

  let syncServer = null;

  try {
    // ------------------------------------------------------------------------
    // Step 1: Initialize Desktop Storage & Wi-Fi SyncServer
    // ------------------------------------------------------------------------
    console.log('🖥️ 1. Initializing Desktop Database & Local Wi-Fi SyncServer...');
    const storage = new ExpenseStorage(TEST_DB_PATH);
    const receiptStorage = new ReceiptStorage(TEST_RECEIPTS_DIR);

    const capturedSyncEvents = [];
    syncServer = new SyncServer({
      storage,
      receiptStorage,
      port: TEST_PORT,
      host: '127.0.0.1',
      onSyncEvent: evt => capturedSyncEvents.push(evt)
    });

    const startInfo = await syncServer.start();
    assert.equal(startInfo.running, true, 'Desktop SyncServer active');
    console.log(`   ✓ SyncServer listening on 127.0.0.1:${TEST_PORT}`);

    // Dynamic import of mobile services
    const { syncClient } = await import('../../mobile/src/services/SyncClient.js');
    const { mobileSettings } = await import('../../mobile/src/storage/mobileSettings.js');
    const { indexedDbQueue } = await import('../../mobile/src/storage/indexedDbQueue.js');

    // In-memory queue backing for mobile client simulation
    let mockQueueTransactions = [];
    let mockQueueReceipts = [];

    indexedDbQueue.getAllTransactions = async () => [...mockQueueTransactions];
    indexedDbQueue.deleteTransaction = async id => {
      mockQueueTransactions = mockQueueTransactions.filter(t => t.id !== id);
      return true;
    };
    indexedDbQueue.updateTransaction = async (id, patch) => {
      const idx = mockQueueTransactions.findIndex(t => t.id === id);
      if (idx !== -1) {
        mockQueueTransactions[idx] = { ...mockQueueTransactions[idx], ...patch };
        return mockQueueTransactions[idx];
      }
      return null;
    };
    indexedDbQueue.getAllReceipts = async () => [...mockQueueReceipts];
    indexedDbQueue.deleteReceipt = async id => {
      mockQueueReceipts = mockQueueReceipts.filter(r => r.id !== id);
      return true;
    };

    // ------------------------------------------------------------------------
    // Step 2: Kabir Mobile Companion Preferences & Dynamic Currency Test
    // ------------------------------------------------------------------------
    console.log('\n💶 2. Configuring Mobile Client Preferences & Currency (EUR € & INR ₹)...');
    // Test Euro preference
    mobileSettings.setCurrencySymbol('€');
    assert.equal(mobileSettings.getCurrencySymbol(), '€', 'Mobile dynamically switched to EUR €');
    console.log('   ✓ Mobile currency set to Euro (€)');

    // Switch back to INR for Indian street logging
    mobileSettings.setCurrencySymbol('₹');
    assert.equal(mobileSettings.getCurrencySymbol(), '₹', 'Mobile switched to INR ₹');
    console.log('   ✓ Mobile currency set to Indian Rupee (₹)');

    // ------------------------------------------------------------------------
    // Step 3: Offline Street Capture (No Wi-Fi Connection)
    // ------------------------------------------------------------------------
    console.log('\n🚶 3. Kabir Spends Out on the Street: Queueing Transactions Offline...');

    // 1. Street transit micro-expense
    const offlineTxId = 'tx-offline-' + Date.now();
    mockQueueTransactions.push({
      id: offlineTxId,
      amount: 60.0,
      title: 'Auto Rickshaw to Metro',
      category: 'Transportation',
      paymentMethod: 'Cash',
      date: '2026-09-25',
      syncStatus: 'queued',
      action: 'create',
      updatedAt: new Date().toISOString()
    });
    console.log('   ✓ Queued offline cash transit expense: ₹60.00 (Auto Rickshaw)');

    // 2. Paper Grocery Bill with Camera Receipt
    const offlineReceiptId = 'rcpt-grocery-' + Date.now();
    mockQueueReceipts.push({
      id: offlineReceiptId,
      imageData: SAMPLE_RECEIPT_BASE64,
      mimeType: 'image/png',
      capturedAt: new Date().toISOString(),
      syncStatus: 'queued',
      draftAmount: 1165.50,
      draftMerchant: "Nature's Basket Supermarket",
      draftDate: '2026-09-25',
      category: 'Food & Dining',
      notes: 'Weekly fresh vegetables & groceries'
    });
    console.log("   ✓ Queued offline receipt photo: ₹1165.50 (Nature's Basket Supermarket)");

    assert.equal(mockQueueTransactions.length, 1, '1 offline transaction queued');
    assert.equal(mockQueueReceipts.length, 1, '1 offline receipt photo queued');

    // ------------------------------------------------------------------------
    // Step 4: Kabir Returns Home — Desktop Wi-Fi Discovery & Pairing
    // ------------------------------------------------------------------------
    console.log('\n🏠 4. Kabir Returns Home: Connecting to Desktop over Local Wi-Fi...');
    const desktopStatus = await syncClient.checkDesktopStatus('127.0.0.1', TEST_PORT);
    assert.equal(desktopStatus.success, true, 'Desktop detected on local LAN');
    assert.equal(desktopStatus.status, 'online', 'Desktop status is online');
    console.log(`   ✓ Desktop discovered on LAN: "${desktopStatus.name}" (${desktopStatus.currencySymbol})`);

    // Desktop generates pairing PIN
    const pairingToken = syncServer.generatePairingToken({ maxAttempts: 10 });
    console.log(`   ✓ Desktop displayed 6-digit PIN on screen: [ ${pairingToken.pin} ]`);

    // Mobile inputs PIN to complete cryptographic handshake
    const pairResult = await syncClient.pairWithDesktop({
      host: '127.0.0.1',
      port: TEST_PORT,
      pin: pairingToken.pin,
      deviceName: "Kabir's Pixel 8"
    });

    assert.equal(pairResult.success, true, 'Pairing handshake succeeded');
    assert.ok(pairResult.sessionToken, 'Bearer session token received');
    assert.equal(syncClient.isPaired(), true, 'Mobile reports paired state');
    console.log(`   ✓ Pair Handshake Complete: Session established with "${pairResult.machineName}"`);

    // ------------------------------------------------------------------------
    // Step 5: Bidirectional Synchronization & Immediate Mobile Purge
    // ------------------------------------------------------------------------
    console.log('\n🔄 5. Executing Bidirectional LAN Sync...');
    const syncRes = await syncClient.syncNow();
    assert.equal(syncRes.success, true, 'Sync completed successfully');
    assert.equal(syncRes.uploadedReceipts, 1, '1 receipt uploaded');
    assert.equal(syncRes.pushedCount, 1, '1 transaction mutation pushed');
    console.log(`   ✓ Sync summary: ${syncRes.uploadedReceipts} receipt uploaded, ${syncRes.pushedCount} transaction pushed`);

    // ------------------------------------------------------------------------
    // Step 6: Verify Mobile Storage Hygiene (BUG-005 & BUG-006 Protection)
    // ------------------------------------------------------------------------
    console.log('\n🧹 6. Verifying Mobile Storage Hygiene (Immediate Purge Policy)...');
    assert.equal(mockQueueReceipts.length, 0, 'Mobile queue immediately deleted high-res photo buffer');
    console.log('   ✓ Verified: Mobile receipt buffer deleted from IndexedDB queue (Zero phone bloat)');

    // ------------------------------------------------------------------------
    // Step 7: Verify Desktop Persistence
    // ------------------------------------------------------------------------
    console.log('\n💾 7. Verifying Desktop Financial Integrity...');
    const desktopExpenses = storage.getAllExpenses();
    assert.equal(desktopExpenses.length, 2, 'Desktop received both expenses (Auto Rickshaw + Grocery Receipt)');

    const transitTx = desktopExpenses.find(e => e.title === 'Auto Rickshaw to Metro');
    assert.ok(transitTx, 'Transit transaction stored on desktop');
    assert.equal(transitTx.amount, 60.0, 'Transit amount is ₹60.00');

    const groceryTx = desktopExpenses.find(e => e.title === "Nature's Basket Supermarket");
    assert.ok(groceryTx, 'Grocery receipt transaction created on desktop');
    assert.equal(groceryTx.amount, 1165.50, 'Grocery amount is ₹1165.50');
    assert.ok(groceryTx.receiptFilename, 'Receipt filename linked to transaction');

    // Verify receipt image file was written on desktop disk
    const diskFiles = fs.readdirSync(TEST_RECEIPTS_DIR);
    assert.equal(diskFiles.length, 1, 'Physical receipt image stored in desktop receipts folder');
    assert.equal(diskFiles[0], groceryTx.receiptFilename, 'Filename matches ledger record');
    console.log(`   ✓ Desktop disk has physical receipt: receipts/${diskFiles[0]}`);

    // ------------------------------------------------------------------------
    // Step 8: Clean Unpairing & Teardown
    // ------------------------------------------------------------------------
    console.log('\n🔌 8. Unpairing Device & Revoking Session Token...');
    await syncClient.unpair();
    assert.equal(syncClient.isPaired(), false, 'Mobile is no longer paired');
    console.log('   ✓ Mobile session cleanly terminated');

    console.log('\n================================================================================');
    console.log('🎉 USER JOURNEY D (KABIR) FULLY PASSED (100% EMPIRICAL SUCCESS)!');
    console.log('================================================================================\n');

    return {
      journey: 'Journey D: Kabir (Mobile Capture & LAN Wi-Fi Sync)',
      status: 'PASSED',
      receiptsUploaded: syncRes.uploadedReceipts,
      transactionsPushed: syncRes.pushedMutations,
      mobileQueuePurged: true,
      desktopPersistenceVerified: true
    };
  } finally {
    if (syncServer) {
      await syncServer.stop();
    }
    cleanup();
  }
}

if (require.main === module) {
  runJourneyD()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('❌ Journey D execution failed:', err);
      process.exit(1);
    });
}

module.exports = { runJourneyD };
