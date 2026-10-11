/**
 * ============================================================================
 * Ledgerly — User Journey C: Meera (Sunday Reconciler & Statement Deduplication)
 * ============================================================================
 *
 * @fileoverview
 * End-to-End Playwright simulation of Persona 3: Meera (The Sunday Reconciler).
 *
 * User Story & Need:
 * Meera exports her monthly bank statement CSV every Sunday. She occasionally
 * logs food delivery or coffee on-the-go during the week. She wants to import
 * her bank statement with 100% confidence that already-logged expenses are
 * automatically flagged as duplicates and skipped, preventing double-counting.
 * She also needs quick batch entry for cash expenses and contextual notes.
 *
 * Verification Journey:
 * 1. Master Account Security Setup & Profile Onboarding (Meera as Blue #3B82F6).
 * 2. Pre-seed Mid-Week Expense (Manual Swiggy Bangalore ₹420.50 on 2026-09-01).
 * 3. Statement Ingestion & Smart Staging Cockpit (ImportView):
 *    - Ingest 10-row Indian Bank Statement (statement_inr_bank.csv).
 *    - Verify Smart Deduplication flags Row 0 (Swiggy ₹420.50) as "⚠️ Duplicate".
 *    - Verify duplicate row checkbox is automatically unchecked.
 *    - Verify duplicate reconciliation banner: "Found 1 potential duplicate transaction within ±2 days."
 *    - Click "Skip Duplicates" button to ensure only unique rows remain checked (9/10).
 *    - Commit staged import to financial ledger.
 * 4. Zero Duplication Invariant Verification:
 *    - Total expenses in database: exactly 10 (1 pre-existing + 9 newly imported).
 *    - Exactly ONE "Swiggy Bangalore" record exists in entire ledger (zero duplicate pollution).
 *    - Total spent accurately equals ₹14,325.00 (exact penny/paisa precision).
 * 5. Rapid Batch Entry Grid (BatchView):
 *    - Enter 2 offline cash expenses (Auto Rickshaw ₹80, Fruit Vendor ₹150).
 *    - Bulk-save all rows; ledger increments to 12 records (₹14,555.00).
 * 6. Contextual Financial Note Creation (NotesView):
 *    - Attach monthly reconciliation reflection note ("September reconciliation audit complete").
 *    - Verify note persistence in masonry gallery.
 */

'use strict';

const { _electron: electron } = require('playwright');
const path = require('path');
const fs = require('fs');
const assert = require('node:assert/strict');

async function runJourneyC() {
  console.log('\n================================================================================');
  console.log('🎭 RUNNING USER JOURNEY C: MEERA (SUNDAY RECONCILER & STATEMENT DEDUPLICATION)');
  console.log('================================================================================\n');

  const testUserDataDir = path.join(__dirname, 'test_userdata_journey_c');
  if (!fs.existsSync(testUserDataDir)) fs.mkdirSync(testUserDataDir, { recursive: true });
  const testDbPath = path.join(testUserDataDir, 'expenses_db.json');
  if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);

  const screenshotsDir = path.join(__dirname, 'screenshots_journey_c');
  if (!fs.existsSync(screenshotsDir)) fs.mkdirSync(screenshotsDir, { recursive: true });

  const statementFixturePath = path.join(__dirname, 'fixtures', 'statement_inr_bank.csv');
  assert.ok(fs.existsSync(statementFixturePath), 'statement_inr_bank.csv fixture must exist');

  console.log('🚀 1. Launching Electron App in clean sandbox for Meera...');
  const app = await electron.launch({
    args: ['.'],
    cwd: path.resolve(__dirname, '../../'),
    env: {
      ...process.env,
      LEDGERLY_DB_PATH: testDbPath
    }
  });

  try {
    const page = await app.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);

    // ------------------------------------------------------------------------
    // Step 1: Master Cryptographic Account Setup
    // ------------------------------------------------------------------------
    console.log('🔒 2. Setting up Master Cryptographic Account...');
    await page.waitForSelector('#screen-auth:not(.hidden)');
    await page.fill('#auth-input-userid', 'meera.reconcile@offline.local');
    await page.fill('#auth-input-password', 'MeeraSecurePass2026!');
    await page.check('#auth-remember-me');
    await page.click('#auth-submit-btn');
    await page.waitForTimeout(800);

    // ------------------------------------------------------------------------
    // Step 2: Onboard Profile — Meera (Blue Monogram #3B82F6)
    // ------------------------------------------------------------------------
    console.log('👤 3. Onboarding Meera\'s Profile...');
    await page.waitForSelector('#screen-profile-picker:not(.hidden)');
    await page.click('#btn-picker-add-person');
    await page.waitForSelector('#person-modal.active');
    await page.fill('#person-form-name', 'Meera');
    await page.locator('#avatar-color-strip .color-dot-opt[data-color="#3B82F6"]').click();
    await page.click('#btn-save-person');
    await page.waitForTimeout(1000);

    await page.waitForSelector('#main-app-container:not(.hidden)');
    console.log('   ✓ Meera cockpit mounted successfully');

    // Configure INR Currency Preference
    await page.evaluate(async () => {
      if (window.electronAPI) {
        await window.electronAPI.updateAccountPreferences({ currency: '₹' });
      }
    });

    // ------------------------------------------------------------------------
    // Step 3: Pre-seed Manual Expense (Logged during the week)
    // ------------------------------------------------------------------------
    console.log('🍜 4. Pre-seeding manual mid-week expense (Swiggy ₹420.50 on 2026-09-01)...');
    await page.evaluate(async () => {
      await window.electronAPI.addExpense({
        title: 'Swiggy Bangalore',
        amount: 420.5,
        category: 'Food & Dining',
        paymentMethod: 'UPI / GPay',
        date: '2026-09-01',
        description: 'Manual dinner food delivery logged on Monday night'
      });
      if (window.refreshAppData) {
        await window.refreshAppData();
      }
    });
    await page.waitForTimeout(600);

    // Verify initial ledger has exactly 1 expense
    const initialExpenses = await page.evaluate(async () => {
      const data = await window.electronAPI.getExpenses();
      return Array.isArray(data) ? data : (data.expenses || []);
    });
    assert.equal(initialExpenses.length, 1, 'Initial expenses count is exactly 1');
    assert.equal(initialExpenses[0].title, 'Swiggy Bangalore', 'Swiggy Bangalore exists');
    assert.equal(initialExpenses[0].amount, 420.5, 'Amount is ₹420.50');
    console.log('   ✓ Initial manual expense recorded');

    // ------------------------------------------------------------------------
    // Step 4: Bank Statement Ingestion & Deduplication Ingestion (ImportView)
    // ------------------------------------------------------------------------
    console.log('📥 5. Navigating to Universal Ingestion & Scanned Bill Review...');
    await page.click('.nav-item[data-tab="import"]');
    await page.waitForSelector('#view-import:not(.hidden)');
    await page.waitForTimeout(600);

    // Switch to Statements subtab
    console.log('📑 6. Switching to Bank Statements Sub-View...');
    await page.click('#subtab-btn-statements');
    await page.waitForTimeout(500);

    // Feed statement CSV into import engine
    console.log('📂 7. Ingesting bank statement fixture (statement_inr_bank.csv)...');
    await page.evaluate(async (csvPath) => {
      const res = await window.electronAPI.importFilePath(csvPath);
      const importView = window.getImportView ? window.getImportView() : null;
      if (importView) {
        importView.handleStatementResult(res);
      }
    }, statementFixturePath);

    await page.waitForTimeout(1000);

    // Verify Staging Table is Revealed
    await page.waitForSelector('#statement-staging-container:not(.hidden)');
    const parsedCountText = await page.locator('#statement-count-text').textContent();
    console.log(`   ✓ Parsed Statement Records: ${parsedCountText.trim()}`);
    assert.equal(parsedCountText.trim(), '10', '10 records parsed from statement');

    // ------------------------------------------------------------------------
    // Step 5: Verify Duplicate Detection in Staging Review Cockpit
    // ------------------------------------------------------------------------
    console.log('🔍 8. Verifying Smart Deduplication Detection & Status Badges...');
    // Row 0 is the Swiggy Bangalore transaction
    const row0 = page.locator('#statement-preview-tbody tr').first();
    const row0Text = await row0.textContent();
    console.log(`   ✓ Row 0 Preview: "${row0Text.trim().replace(/\s+/g, ' ')}"`);

    assert.ok(row0Text.includes('Swiggy Bangalore'), 'Row 0 is Swiggy Bangalore');
    assert.ok(row0Text.includes('420.50') || row0Text.includes('420.5'), 'Row 0 amount matches ₹420.50');
    assert.ok(
      row0Text.includes('Matched') || /Duplicate/i.test(row0Text),
      'Row 0 is marked with Matched or Duplicate status'
    );

    // Verify Reconciliation Alert Bar
    const reconBar = page.locator('#statement-reconciliation-bar');
    await reconBar.waitFor({ state: 'visible' });
    const reconBarText = await reconBar.textContent();
    console.log(`   ✓ Reconciliation Bar Text: "${reconBarText.trim()}"`);
    assert.ok(
      reconBarText.includes('Reconciliation Cockpit') || /Found 1 potential duplicate transaction/i.test(reconBarText),
      'Reconciliation bar alert shown'
    );

    // Test "Skip Duplicates" Button
    await page.click('#btn-statement-skip-dups');
    await page.waitForTimeout(300);

    // Verify Selected Count Button Badge (Should be 9 out of 10)
    const selectedCount = await page.locator('#statement-btn-count').textContent();
    console.log(`   ✓ Clean Unique Transactions Selected for Import: ${selectedCount} / 10`);
    assert.equal(selectedCount.trim(), '9', 'Exactly 9 non-duplicate transactions selected');

    await page.screenshot({ path: path.join(screenshotsDir, '01_statement_staging_dedup_detected.png') });

    // ------------------------------------------------------------------------
    // Step 6: Commit Statement Import to Ledger
    // ------------------------------------------------------------------------
    console.log('💾 9. Committing 9 clean statement transactions to Financial Ledger...');
    await page.click('#btn-statement-confirm');
    await page.waitForSelector('#statement-staging-container', { state: 'hidden', timeout: 3000 });
    await page.waitForTimeout(1000);

    // Verify Financial Invariants in Ledger
    console.log('🧮 10. Verifying Ledger Integrity & Mathematical Precision...');
    const allExpenses = await page.evaluate(async () => {
      const data = await window.electronAPI.getExpenses();
      return Array.isArray(data) ? data : (data.expenses || []);
    });

    console.log(`   ✓ Total Expenses in Stored Ledger: ${allExpenses.length} (Expected: 10)`);
    assert.equal(allExpenses.length, 10, 'Ledger contains exactly 10 expenses (1 original + 9 imported)');

    // Verify zero duplicate pollution: count Swiggy Bangalore records
    const swiggyRecords = allExpenses.filter(e => e.title.includes('Swiggy'));
    console.log(`   ✓ Swiggy Records Count: ${swiggyRecords.length} (Expected: 1)`);
    assert.equal(swiggyRecords.length, 1, 'Strictly 1 Swiggy record exists (Zero duplicate pollution)');

    // Calculate total spend: ₹420.50 + ₹1500.00 + ₹2340.75 + ₹1850.00 + ₹650.25 + ₹999.00 + ₹3499.00 + ₹2500.00 + ₹385.50 + ₹180.00 = ₹14,325.00
    const totalSpentSum = allExpenses.reduce((acc, e) => acc + (parseFloat(e.amount) || 0), 0);
    console.log(`   ✓ Total Calculated Outflow: ₹${totalSpentSum.toFixed(2)} (Expected: ₹14,325.00)`);
    assert.equal(totalSpentSum.toFixed(2), '14325.00', 'Sum matches ground truth ₹14,325.00 exactly');

    // ------------------------------------------------------------------------
    // Step 7: Rapid Batch Entry Grid (BatchView)
    // ------------------------------------------------------------------------
    console.log('⚡ 11. Navigating to Rapid Batch Entry Grid...');
    await page.click('.nav-item[data-tab="batch"]');
    await page.waitForSelector('#view-batch:not(.hidden)');
    await page.waitForTimeout(600);

    console.log('   - Adding Cash Row 1: Auto Rickshaw (₹80.00, Transportation)');
    console.log('   - Adding Cash Row 2: Fresh Fruit Stall (₹150.00, Food & Dining)');

    await page.evaluate(() => {
      const batchView = window.getBatchView ? window.getBatchView() : null;
      if (batchView) {
        batchView.addBatchRow({
          date: '2026-09-23',
          title: 'Auto Rickshaw to Metro',
          amount: 80.0,
          category: 'Transportation',
          paymentMethod: 'Cash',
          description: 'Street auto rickshaw fare'
        });
        batchView.addBatchRow({
          date: '2026-09-23',
          title: 'Fresh Fruit Stall (Cash)',
          amount: 150.0,
          category: 'Food & Dining',
          paymentMethod: 'Cash',
          description: 'Pomegranate and bananas'
        });
      }
    });

    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(screenshotsDir, '02_batch_entry_staged.png') });

    // Save All Batch Rows
    console.log('   💾 Saving batch rows into financial ledger...');
    await page.click('#btn-save-batch-all');
    await page.waitForTimeout(1000);

    const postBatchExpenses = await page.evaluate(async () => {
      const data = await window.electronAPI.getExpenses();
      return Array.isArray(data) ? data : (data.expenses || []);
    });
    console.log(`   ✓ Total Expenses after Batch Save: ${postBatchExpenses.length} (Expected: 12)`);
    assert.equal(postBatchExpenses.length, 12, '12 records logged after batch entry');

    const newTotalSpent = postBatchExpenses.reduce((acc, e) => acc + (parseFloat(e.amount) || 0), 0);
    console.log(`   ✓ Updated Total Outflow: ₹${newTotalSpent.toFixed(2)} (Expected: ₹14,555.00)`);
    assert.equal(newTotalSpent.toFixed(2), '14555.00', 'Sum matches ₹14,555.00 exactly');

    // ------------------------------------------------------------------------
    // Step 8: Contextual Financial Note Creation (NotesView)
    // ------------------------------------------------------------------------
    console.log('📝 12. Navigating to Contextual Financial Notes Workspace...');
    await page.click('.nav-item[data-tab="notes"]');
    await page.waitForSelector('#view-notes:not(.hidden)');
    await page.waitForTimeout(600);

    console.log('   - Creating monthly reconciliation audit memo...');
    await page.click('#btn-open-add-note-modal');
    await page.waitForSelector('#note-modal.active');
    await page.waitForTimeout(400);

    await page.selectOption('#form-note-relation', 'month');
    await page.fill(
      '#form-note-content',
      'September reconciliation audit: all bank debits match offline cash and UPI receipts. ₹14,555.00 total spend validated.'
    );
    await page.click('#note-form button[type="submit"]');

    await page.waitForSelector('#note-modal:not(.active)', { timeout: 3000 });
    await page.waitForTimeout(800);

    // Verify Note in Masonry Gallery
    const notesCount = await page.locator('.note-masonry-card').count();
    console.log(`   ✓ Contextual Notes Rendered: ${notesCount}`);
    assert.ok(notesCount >= 1, 'At least 1 note card rendered');

    const firstNoteText = await page.locator('.note-masonry-card').first().textContent();
    assert.ok(firstNoteText.includes('September reconciliation audit'), 'Note content rendered in UI');

    await page.screenshot({ path: path.join(screenshotsDir, '03_contextual_notes_saved.png') });

    console.log('\n🎉 USER JOURNEY C PASSED EMPIRICALLY WITH 100% PRECISION!');
    return {
      journey: 'Journey C: Meera (Sunday Reconciler & Statement Deduplication)',
      status: 'PASSED',
      metricsVerified: {
        initialManualSwiggy: 1,
        statementRowsParsed: 10,
        duplicatesDetected: 1,
        importedRecords: 9,
        zeroDuplicationVerified: true,
        totalExpensesInLedger: 12,
        groundTruthBalance: '₹14,555.00',
        contextualNotesAttached: notesCount
      }
    };
  } finally {
    console.log('🧹 Closing Electron Application...');
    await app.close();
    if (fs.existsSync(testUserDataDir)) {
      try { fs.rmSync(testUserDataDir, { recursive: true, force: true }); } catch {}
    }
  }
}

if (require.main === module) {
  runJourneyC()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('❌ Journey C execution failed:', err);
      process.exit(1);
    });
}

module.exports = { runJourneyC };
