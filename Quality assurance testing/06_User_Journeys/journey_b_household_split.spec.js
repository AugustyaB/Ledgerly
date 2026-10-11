/**
 * ============================================================================
 * Ledgerly — User Journey B: Priya & Rohan (Household Mode & Debt Netting)
 * ============================================================================
 *
 * @fileoverview
 * End-to-End Playwright simulation of Persona 2: Priya & Rohan (Shared Household).
 *
 * User Story & Need:
 * Priya and Rohan live together and split household living costs (groceries,
 * power, broadband). They want zero cloud subscriptions, zero bank link exposures,
 * and automatic pairwise debt netting so that instead of dozens of micro-repayments,
 * a single net transfer settles all obligations at any time.
 *
 * Verification Journey:
 * 1. Master Account Setup & Profile Onboarding (Rohan as Amber, Priya as Emerald).
 * 2. Shared Household Workspace Configuration & Member Roster.
 * 3. Multi-Member Shared Expense Ingestion (Groceries by Rohan, Utilities by Priya).
 * 4. Algorithmic Pairwise Debt Matrix & Conservation of Value:
 *    - Total Shared Outflow: ₹6,699.00
 *    - Rohan Paid: ₹4,200.00 (Share: ₹3,349.50) -> Net: +₹850.50 (Owed)
 *    - Priya Paid: ₹2,499.00 (Share: ₹3,349.50) -> Net: -₹850.50 (Owes)
 *    - Invariant: Balance(Rohan) + Balance(Priya) == 0.00
 *    - Optimal Transfer: Priya ──▶ Rohan: ₹850.50
 * 5. 1-Click Settle-Up Modal Pre-population & Execution.
 * 6. Zero-Balance State Verification & Repayment Audit Trail Persistence.
 */

'use strict';

const { _electron: electron } = require('playwright');
const path = require('path');
const fs = require('fs');
const assert = require('node:assert/strict');

async function runJourneyB() {
  console.log('\n================================================================================');
  console.log('🎭 RUNNING USER JOURNEY B: PRIYA & ROHAN (HOUSEHOLD SPLIT & DEBT NETTING)');
  console.log('================================================================================\n');

  const testUserDataDir = path.join(__dirname, 'test_userdata_journey_b');
  if (!fs.existsSync(testUserDataDir)) fs.mkdirSync(testUserDataDir, { recursive: true });
  const testDbPath = path.join(testUserDataDir, 'expenses_db.json');
  if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
  const testDbBak = path.join(testUserDataDir, 'expenses_db.json.bak');
  if (fs.existsSync(testDbBak)) fs.unlinkSync(testDbBak);

  const screenshotsDir = path.join(__dirname, 'screenshots_journey_b');
  if (!fs.existsSync(screenshotsDir)) fs.mkdirSync(screenshotsDir, { recursive: true });

  console.log('🚀 1. Launching Electron App in clean sandbox for Priya & Rohan...');
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
    console.log('🔒 2. Setting up Master Household Cryptographic Account...');
    await page.waitForSelector('#screen-auth:not(.hidden)');
    await page.fill('#auth-input-userid', 'rohan.priya.home@offline.local');
    await page.fill('#auth-input-password', 'RohanPriyaHome2026!');
    await page.check('#auth-remember-me');
    await page.click('#auth-submit-btn');
    await page.waitForTimeout(800);

    // ------------------------------------------------------------------------
    // Step 2: Onboard Profile 1 — Rohan (Amber Monogram #D9822B)
    // ------------------------------------------------------------------------
    console.log('👤 3. Onboarding Profile 1 (Rohan)...');
    await page.waitForSelector('#screen-profile-picker:not(.hidden)');
    await page.click('#btn-picker-add-person');
    await page.waitForSelector('#person-modal.active');
    await page.fill('#person-form-name', 'Rohan');
    await page.locator('#avatar-color-strip .color-dot-opt[data-color="#D9822B"]').click();
    await page.click('#btn-save-person');
    await page.waitForTimeout(1000);

    await page.waitForSelector('#main-app-container:not(.hidden)');
    console.log('   ✓ Rohan dashboard mounted');

    // ------------------------------------------------------------------------
    // Step 3: Onboard Profile 2 — Priya (Emerald Monogram #10B981)
    // ------------------------------------------------------------------------
    console.log('👤 4. Onboarding Profile 2 (Priya)...');
    await page.click('#btn-open-profile-switcher');
    await page.waitForSelector('#profile-quick-dropdown:not(.hidden)');
    await page.click('#menu-add-person');
    await page.waitForSelector('#person-modal.active');
    await page.fill('#person-form-name', 'Priya');
    await page.locator('#avatar-color-strip .color-dot-opt[data-color="#10B981"]').click();
    await page.click('#btn-save-person');
    await page.waitForTimeout(1000);

    // Configure INR Currency & Ensure Household Mode is Enabled
    console.log('⚙️ 5. Setting Currency to INR (₹) and verifying Household Workspace...');
    await page.evaluate(async () => {
      if (window.electronAPI) {
        await window.electronAPI.setWorkspaceMode('household');
        await window.electronAPI.addHouseholdMember('Rohan');
        await window.electronAPI.addHouseholdMember('Priya');
        await window.electronAPI.updateAccountPreferences({ currency: '₹' });
      }
    });
    await page.waitForTimeout(500);

    // ------------------------------------------------------------------------
    // Step 4: Multi-Member Shared Expenses Ingestion
    // ------------------------------------------------------------------------
    console.log('🛒 6. Logging Shared Household Living Expenses...');

    // Expense 1: Rohan pays for Supermarket Groceries (₹4,200.00)
    console.log('   - Rohan logs: ₹4,200.00 (Groceries, 50/50 split)');
    await page.evaluate(async () => {
      await window.electronAPI.addExpense({
        title: 'Supermarket Groceries (Organic Harvest)',
        amount: 4200.0,
        category: 'Food & Dining',
        paymentMethod: 'UPI / GPay',
        date: '2026-09-20',
        paidBy: 'Rohan',
        isHouseholdExpense: true,
        splitWith: ['Rohan', 'Priya'],
        description: 'Monthly pantry restock, veggies and dairy'
      });
    });

    // Expense 2: Priya pays for Electricity (₹1,500.00)
    console.log('   - Priya logs: ₹1,500.00 (Bescom Power, 50/50 split)');
    await page.evaluate(async () => {
      await window.electronAPI.addExpense({
        title: 'Bescom Electricity Utility Bill',
        amount: 1500.0,
        category: 'Utilities & Bills',
        paymentMethod: 'Net Banking',
        date: '2026-09-21',
        paidBy: 'Priya',
        isHouseholdExpense: true,
        splitWith: ['Rohan', 'Priya'],
        description: 'Power distribution bill for August'
      });
    });

    // Expense 3: Priya pays for Fiber Broadband (₹999.00)
    console.log('   - Priya logs: ₹999.00 (Airtel Broadband, 50/50 split)');
    await page.evaluate(async () => {
      await window.electronAPI.addExpense({
        title: 'Airtel Xstream Fiber Broadband',
        amount: 999.0,
        category: 'Utilities & Bills',
        paymentMethod: 'UPI / GPay',
        date: '2026-09-22',
        paidBy: 'Priya',
        isHouseholdExpense: true,
        splitWith: ['Rohan', 'Priya'],
        description: 'High-speed home Wi-Fi fiber connection'
      });
    });

    await page.waitForTimeout(600);

    // ------------------------------------------------------------------------
    // Step 5: Navigate to Household View & Verify Netting Matrix
    // ------------------------------------------------------------------------
    console.log('📊 7. Navigating to Household Split & Settlements View...');
    await page.click('.nav-item[data-tab="household"]');
    await page.waitForSelector('#view-household:not(.hidden)');
    await page.waitForTimeout(800);

    await page.screenshot({ path: path.join(screenshotsDir, '01_household_initial_debts.png') });

    // Validate Executive Metric Cards
    const totalSharedText = await page.locator('#household-total-shared').textContent();
    const sharedCountText = await page.locator('#household-shared-count').textContent();
    const memberCountText = await page.locator('#household-member-count').textContent();

    console.log(`   ✓ Total Shared Outflow Displayed: "${totalSharedText.trim()}"`);
    console.log(`   ✓ Records Logged: "${sharedCountText.trim()}"`);
    console.log(`   ✓ Active Household Splitters: "${memberCountText.trim()}"`);

    assert.ok(totalSharedText.includes('6,699') || totalSharedText.includes('6699'), 'Total shared matches ₹6,699.00');
    assert.match(sharedCountText, /3 shared records/i, '3 shared records logged');
    assert.ok(parseInt(memberCountText, 10) >= 2, 'At least 2 active members');

    // Mathematical Invariant Checks
    console.log('🧮 8. Verifying Mathematical Zero-Sum Conservation Invariant...');
    const settlementData = await page.evaluate(async () => {
      return await window.electronAPI.getHouseholdSettlement();
    });

    console.log('   Settlement State from Backend:');
    console.log(`     - Total Shared: ₹${settlementData.totalSharedAmount}`);
    console.log(`     - Rohan Paid: ₹${settlementData.paidMap.Rohan} | Owes: ₹${settlementData.owesMap.Rohan}`);
    console.log(`     - Priya Paid: ₹${settlementData.paidMap.Priya} | Owes: ₹${settlementData.owesMap.Priya}`);
    console.log(`     - Balances: Rohan: ₹${settlementData.balances.Rohan}, Priya: ₹${settlementData.balances.Priya}`);

    assert.equal(settlementData.totalSharedAmount, 6699.0, 'Total shared math is exactly 6699.00');
    assert.equal(settlementData.balances.Rohan, 850.5, 'Rohan is owed exactly ₹850.50');
    assert.equal(settlementData.balances.Priya, -850.5, 'Priya owes exactly ₹850.50');

    const sumBalances = parseFloat((settlementData.balances.Rohan + settlementData.balances.Priya).toFixed(2));
    assert.equal(sumBalances, 0.0, 'Conservation Invariant: Sum of net balances == 0.00');

    assert.equal(settlementData.settlements.length, 1, 'Exactly one pairwise settlement generated');
    assert.equal(settlementData.settlements[0].from, 'Priya', 'Debtor is Priya');
    assert.equal(settlementData.settlements[0].to, 'Rohan', 'Creditor is Rohan');
    assert.equal(settlementData.settlements[0].amount, 850.5, 'Optimal transfer amount is ₹850.50');
    console.log('   ✓ Pairwise Netting: Priya ──▶ Rohan ₹850.50 verified');

    // Verify DOM Stream Card Rendering
    const streamCard = page.locator('.settlement-stream-card').first();
    await streamCard.waitFor({ state: 'visible' });
    const streamCardText = await streamCard.textContent();
    assert.ok(streamCardText.includes('Priya') && streamCardText.includes('Rohan'), 'Stream card names rendered');
    assert.ok(streamCardText.includes('850.50') || streamCardText.includes('850.5'), 'Stream card amount rendered');

    // ------------------------------------------------------------------------
    // Step 6: Execute 1-Click Settle-Up Action
    // ------------------------------------------------------------------------
    console.log('💳 9. Executing 1-Click Settle-Up Flow...');
    const settleUpBtn = streamCard.locator('button[data-action="open-settle"]');
    await settleUpBtn.click();
    await page.waitForSelector('#settle-modal.active');
    await page.waitForTimeout(500);

    await page.screenshot({ path: path.join(screenshotsDir, '02_settle_modal_open.png') });

    // Verify Pre-populated Settle Modal Values
    const modalFrom = await page.locator('#settle-from-select').inputValue();
    const modalTo = await page.locator('#settle-to-select').inputValue();
    const modalAmount = await page.locator('#settle-amount-input').inputValue();

    console.log(`   ✓ Settle Modal Pre-filled: From=${modalFrom}, To=${modalTo}, Amount=₹${modalAmount}`);
    assert.equal(modalFrom, 'Priya', 'From pre-filled as Priya');
    assert.equal(modalTo, 'Rohan', 'To pre-filled as Rohan');
    assert.equal(parseFloat(modalAmount), 850.5, 'Amount pre-filled as 850.50');

    // Select Payment Method & Submit
    await page.selectOption('#settle-method-select', 'UPI / GPay');
    await page.fill('#settle-notes-input', 'Monthly rent and bills settlement via UPI');
    await page.click('#settle-form button[type="submit"]');

    await page.waitForSelector('#settle-modal:not(.active)', { timeout: 3000 });
    await page.waitForTimeout(1000);

    // ------------------------------------------------------------------------
    // Step 7: Post-Settlement Verification & Audit Trail
    // ------------------------------------------------------------------------
    console.log('✅ 10. Verifying Zero-Balance State and Repayment History...');
    await page.screenshot({ path: path.join(screenshotsDir, '03_household_settled_zero_balance.png') });

    // Check DOM settlement streams container: should show "All shared expenses are fully settled!"
    const streamContainerText = await page.locator('#settlement-matrix-container').textContent();
    console.log(`   ✓ Stream Matrix Status: "${streamContainerText.trim().replace(/\s+/g, ' ')}"`);
    assert.match(streamContainerText, /All shared expenses are fully settled/i, 'No pending debts');

    // Check Settlement History Table
    const historyRows = await page.locator('#settlement-history-tbody tr').count();
    console.log(`   ✓ Settlement Audit Trail Records: ${historyRows}`);
    assert.ok(historyRows >= 1, 'At least 1 settlement record logged');

    const historyFirstRowText = await page.locator('#settlement-history-tbody tr').first().textContent();
    console.log(`   ✓ Recorded Settle Entry: "${historyFirstRowText.trim().replace(/\s+/g, ' ')}"`);
    assert.ok(historyFirstRowText.includes('Priya') && historyFirstRowText.includes('Rohan'), 'Audit names match');
    assert.ok(historyFirstRowText.includes('850.50') || historyFirstRowText.includes('850.5'), 'Audit amount matches');

    // Backend Net Balance Re-verification
    const postSettlement = await page.evaluate(async () => {
      return await window.electronAPI.getHouseholdSettlement();
    });

    assert.equal(postSettlement.settlements.length, 0, 'Zero pending settlements remaining');
    assert.equal(postSettlement.balances.Rohan, 0.0, 'Rohan balance cleared to ₹0.00');
    assert.equal(postSettlement.balances.Priya, 0.0, 'Priya balance cleared to ₹0.00');
    assert.equal(postSettlement.totalSettledAmount, 850.5, 'Total settled amount recorded as ₹850.50');

    console.log('\n🎉 USER JOURNEY B PASSED EMPIRICALLY WITH 100% PRECISION!');
    return {
      success: true,
      totalSharedAmount: 6699.0,
      settledAmount: 850.5,
      debtor: 'Priya',
      creditor: 'Rohan',
      conservationInvariantMet: true,
      screenshotsCaptured: 3
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
  runJourneyB()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('❌ Journey B failed:', err);
      process.exit(1);
    });
}

module.exports = { runJourneyB };
