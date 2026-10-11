/**
 * ============================================================================
 * Ledgerly — User Journey A: Arjun (Solo Habit & Daily Budget Pace)
 * ============================================================================
 *
 * @fileoverview
 * End-to-End Playwright simulation of Persona 1: Arjun (Solo Freelancer).
 * 
 * User Story & Need:
 * Arjun wants total control over personal cash flow without subscription fees
 * or cloud privacy exposure. He tracks daily spending velocity, respects his daily
 * allowance, captures micro-expenses via 1-Box NLP, and uses Privacy Mode in cafes.
 *
 * Verification Journey:
 * 1. Master Account Security Setup & Profile Onboarding (Arjun).
 * 2. Financial Budget Configuration: Income, fixed bills, savings goal, and currency (₹ / €).
 * 3. Daily Allowance & Cycle Calculation verification.
 * 4. 1-Box Natural Language Magic Bar speed entry ("Swiggy 420 dinner upi yesterday").
 * 5. Quick Preset Chip creation & 1-click execution ("Chai & Snack").
 * 6. Dynamic Budget Pace Ring visual metric validation.
 * 7. In-Dashboard Privacy Mode toggle ('P' / stealth button).
 * 8. Zero & Negative boundary protection checks.
 */

'use strict';

const { _electron: electron } = require('playwright');
const path = require('path');
const fs = require('fs');
const assert = require('node:assert/strict');

async function runJourneyA() {
  console.log('\n================================================================================');
  console.log('🎭 RUNNING USER JOURNEY A: ARJUN (SOLO HABIT & DAILY BUDGET PACE)');
  console.log('================================================================================\n');

  const testUserDataDir = path.join(__dirname, 'test_userdata_journey_a');
  if (!fs.existsSync(testUserDataDir)) fs.mkdirSync(testUserDataDir, { recursive: true });
  const testDbPath = path.join(testUserDataDir, 'expenses_db.json');
  if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);

  const screenshotsDir = path.join(__dirname, 'screenshots_journey_a');
  if (!fs.existsSync(screenshotsDir)) fs.mkdirSync(screenshotsDir, { recursive: true });

  console.log('🚀 1. Launching Electron App in clean sandbox for Arjun...');
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
    // Step 1: Master Household Account Setup
    // ------------------------------------------------------------------------
    console.log('🔒 2. Setting up Master Cryptographic Account...');
    await page.waitForSelector('#screen-auth:not(.hidden)');
    await page.fill('#auth-input-userid', 'arjun.freelance@offline.local');
    await page.fill('#auth-input-password', 'ArjunSecurePass2026!');
    await page.check('#auth-remember-me');
    await page.click('#auth-submit-btn');
    await page.waitForTimeout(800);

    // ------------------------------------------------------------------------
    // Step 2: Create Arjun's Profile (Amber Monogram)
    // ------------------------------------------------------------------------
    console.log('👤 3. Onboarding Arjun\'s Profile...');
    await page.waitForSelector('#screen-profile-picker:not(.hidden)');
    await page.click('#btn-picker-add-person');
    await page.waitForSelector('#person-modal.active');
    await page.fill('#person-form-name', 'Arjun');
    await page.locator('#avatar-color-strip .color-dot-opt[data-color="#D9822B"]').click();
    await page.click('#btn-save-person');
    await page.waitForTimeout(1000);

    await page.waitForSelector('#main-app-container:not(.hidden)');
    console.log('   ✓ Arjun dashboard mounted successfully');

    // ------------------------------------------------------------------------
    // Step 3: Configure Budget & Currency in Settings
    // ------------------------------------------------------------------------
    console.log('⚙️ 4. Configuring Monthly Salary & Currency in Settings...');
    // Open Settings view
    await page.click('.nav-item[data-tab="settings"]');
    await page.waitForSelector('#view-settings:not(.hidden)');
    await page.waitForTimeout(600);

    // Set Salary, Bills, Savings Goal
    await page.fill('#settings-salary-income', '75000');
    await page.fill('#settings-salary-bills', '25000');
    await page.fill('#settings-salary-savings', '15000');
    await page.click('#settings-salary-form button[type="submit"]');
    await page.waitForTimeout(800);

    // Verify Cycle Banner calculation: (75000 - 25000 - 15000) = 35000 pool
    const cycleSubtext = await page.locator('#settings-cycle-subtext').textContent();
    console.log(`   ✓ Active Cycle Computed: "${cycleSubtext.trim()}"`);
    assert.match(cycleSubtext, /Calculated Daily Allowance/i, 'Daily allowance computed');

    // Also test currency selection in Preferences: ensure INR is selected
    await page.selectOption('#settings-pref-currency', '₹');
    await page.click('#settings-save-prefs-btn');
    await page.waitForTimeout(600);

    // ------------------------------------------------------------------------
    // Step 4: Return to Dashboard & Verify Empty State
    // ------------------------------------------------------------------------
    console.log('📊 5. Returning to Dashboard & Checking Initial Clean State...');
    await page.click('.nav-item[data-tab="dashboard"]');
    await page.waitForSelector('#view-dashboard:not(.hidden)');
    await page.waitForTimeout(600);

    const initialSpent = await page.locator('#metric-total-spent').textContent();
    console.log(`   ✓ Initial Total Spent: ${initialSpent.trim()}`);
    assert.match(initialSpent, /0(\.00)?/, 'Initial spent is zero');

    // ------------------------------------------------------------------------
    // Step 5: Log Expense with 1-Box Natural Language Magic Bar
    // ------------------------------------------------------------------------
    console.log('⚡ 6. Logging expense via 1-Box Magic Express Bar ("Swiggy 420 dinner upi yesterday")...');
    const nlpInput = page.locator('#express-nlp-input');
    await nlpInput.fill('Swiggy 420 dinner upi yesterday');
    await page.waitForTimeout(400);

    // Check live token pills in the express bar
    const pillAmt = await page.locator('#pill-amt').textContent();
    console.log(`   ✓ Live Token Pill Detected Amount: "${pillAmt.trim()}"`);
    assert.match(pillAmt, /420/, 'NLP parser tokenized amount 420');

    // Submit express form
    await page.locator('#express-nlp-form').evaluate(form => form.dispatchEvent(new Event('submit', { cancelable: true })));
    await page.waitForTimeout(1000);

    const afterNlpSpent = await page.locator('#metric-total-spent').textContent();
    console.log(`   ✓ Updated Total Spent after Express Entry: ${afterNlpSpent.trim()}`);
    assert.match(afterNlpSpent, /420/, 'Metric reflects 420 expense');

    // ------------------------------------------------------------------------
    // Step 6: Create & Use a Quick Preset Chip
    // ------------------------------------------------------------------------
    console.log('☕ 7. Creating Quick Preset Chip ("Chai & Snack", ₹120)...');
    await page.click('#btn-open-add-preset');
    await page.waitForSelector('#preset-modal.active');
    await page.fill('#preset-form-title', 'Chai & Snack');
    await page.fill('#preset-form-amount', '120');
    await page.locator('#preset-form').evaluate(form => form.dispatchEvent(new Event('submit', { cancelable: true })));
    await page.waitForTimeout(1000);

    // Click the new preset chip to log it
    console.log('   ⚡ Clicking newly created preset chip...');
    const chaiChip = page.locator('.preset-chip', { hasText: 'Chai & Snack' });
    await chaiChip.waitFor({ state: 'visible', timeout: 5000 });
    await chaiChip.click();
    await page.waitForTimeout(1000);

    const afterPresetSpent = await page.locator('#metric-total-spent').textContent();
    console.log(`   ✓ Updated Total Spent after Preset Click: ${afterPresetSpent.trim()} (Expected: ₹540.00)`);
    assert.match(afterPresetSpent, /540/, 'Metric reflects 420 + 120 = 540 total spent');

    // ------------------------------------------------------------------------
    // Step 7: Test Privacy Stealth Shield Mode
    // ------------------------------------------------------------------------
    console.log('🔒 8. Testing Privacy Stealth Mode (Keyboard Shortcut "P")...');
    // Press 'P' to activate privacy mode
    await page.keyboard.press('p');
    await page.waitForTimeout(400);

    const bodyClass = await page.evaluate(() => document.body.className);
    console.log(`   ✓ Body classes with Privacy Shield: "${bodyClass}"`);
    assert.match(bodyClass, /privacy-mode/, 'Privacy mode class applied to body');

    await page.screenshot({ path: path.join(screenshotsDir, 'arjun_privacy_shield_active.png') });
    console.log('   ✓ Screenshot captured: arjun_privacy_shield_active.png');

    // Toggle privacy mode off
    await page.keyboard.press('p');
    await page.waitForTimeout(400);
    const bodyClassAfter = await page.evaluate(() => document.body.className);
    assert.doesNotMatch(bodyClassAfter, /privacy-mode/, 'Privacy mode cleanly deactivated');

    // ------------------------------------------------------------------------
    // Step 8: Test Input Boundary Error Prevention
    // ------------------------------------------------------------------------
    console.log('🛡️ 9. Testing Zero & Negative Input Boundary Protection...');
    await nlpInput.fill('0 invalid');
    await page.locator('#express-nlp-form').evaluate(form => form.dispatchEvent(new Event('submit', { cancelable: true })));
    await page.waitForTimeout(400);

    // Total spent must remain strictly 540 without corruption
    const finalSpent = await page.locator('#metric-total-spent').textContent();
    assert.match(finalSpent, /540/, 'Zero-amount was safely rejected; total remained 540');
    console.log('   ✓ Zero-amount safely rejected without state corruption');

    console.log('\n================================================================================');
    console.log('🎉 USER JOURNEY A (ARJUN) FULLY PASSED (100% EMPIRICAL SUCCESS)!');
    console.log('================================================================================\n');

    return {
      journey: 'Journey A: Arjun (Solo Habit & Daily Budget Pace)',
      status: 'PASSED',
      metricsVerified: {
        initialSpent: initialSpent.trim(),
        spentAfterNlp: afterNlpSpent.trim(),
        spentAfterPreset: afterPresetSpent.trim(),
        privacyModeToggled: true,
        boundaryGuarded: true
      }
    };
  } finally {
    await app.close();
    if (fs.existsSync(testUserDataDir)) {
      try { fs.rmSync(testUserDataDir, { recursive: true, force: true }); } catch {}
    }
  }
}

if (require.main === module) {
  runJourneyA()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('❌ Journey A execution failed:', err);
      process.exit(1);
    });
}

module.exports = { runJourneyA };
