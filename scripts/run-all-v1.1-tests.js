'use strict';

/**
 * ============================================================================
 * Ledgerly — Milestone v1.1.0 Unified Master Verification Runner
 * ============================================================================
 *
 * @fileoverview
 * Orchestrates and executes all 11 sequential empirical verification suites:
 * - Suite 1: Desktop Syntax Check (scripts/check-syntax.js)
 * - Suite 2: Layer Architecture Boundary Check (scripts/check-architecture-layers.js 77/77)
 * - Suite 3: Codebase ESLint Scan (eslint src/ mobile/src/)
 * - Suite 4: Phase 1 Auth & Tactile Keypad Suite (scratch/test_phase1_auth_screen.js)
 * - Suite 5: Phase 2 Dashboard & Daybook Suite (scratch/test_phase2_dashboard_daybook.js)
 * - Suite 6: Phase 3 Budget & Runway Suite (scratch/test_phase3_budget_runway.js)
 * - Suite 7: Phase 4 Mirage OCR & Voucher Lightbox Suite (scratch/test_phase4_receipts_mirage_ocr.js)
 * - Suite 8: Phase 5 Household Debt Vectors Suite (scratch/test_phase5_household_vectors.js)
 * - Suite 9: Phase 6 LAN Radar Hub & Setup Wizard Suite (scratch/test_phase6_lan_radar_wizard.js)
 * - Suite 10: Phase 7 Vault Diagnostic HUD Suite (scratch/test_phase7_vault_diagnostic_hud.js)
 * - Suite 11: End-to-End Desktop Integration Suite (scratch/test_e2e_ledgerly.js)
 */

const { spawnSync } = require('child_process');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');

const SUITES = [
  {
    name: 'Desktop Syntax Check (All JS Files in src/)',
    command: 'node',
    args: ['scripts/check-syntax.js']
  },
  {
    name: 'Layer Architecture Boundary Check (77/77 Files Compliant)',
    command: 'node',
    args: ['scripts/check-architecture-layers.js']
  },
  {
    name: 'Codebase ESLint Scan (src/ & mobile/src/)',
    command: 'npx',
    args: ['eslint', 'src/', 'mobile/src/']
  },
  {
    name: 'Phase 1 Auth & Tactile Keypad Suite',
    command: 'node',
    args: ['scratch/test_phase1_auth_screen.js']
  },
  {
    name: 'Phase 2 Dashboard & Daybook Suite',
    command: 'node',
    args: ['scratch/test_phase2_dashboard_daybook.js']
  },
  {
    name: 'Phase 3 Budget & Runway Suite',
    command: 'node',
    args: ['scratch/test_phase3_budget_runway.js']
  },
  {
    name: 'Phase 4 Mirage OCR & Voucher Lightbox Suite',
    command: 'node',
    args: ['scratch/test_phase4_receipts_mirage_ocr.js']
  },
  {
    name: 'Phase 5 Household Debt Vectors Suite',
    command: 'node',
    args: ['scratch/test_phase5_household_vectors.js']
  },
  {
    name: 'Phase 6 LAN Radar Hub & Setup Wizard Suite',
    command: 'node',
    args: ['scratch/test_phase6_lan_radar_wizard.js']
  },
  {
    name: 'Phase 7 Vault Diagnostic HUD Suite',
    command: 'node',
    args: ['scratch/test_phase7_vault_diagnostic_hud.js']
  },
  {
    name: 'End-to-End Desktop Integration Suite',
    command: 'node',
    args: ['scratch/test_e2e_ledgerly.js']
  }
];

console.log('='.repeat(80));
console.log('🚀 Ledgerly — Milestone v1.1.0 Unified Master Verification Runner');
console.log('='.repeat(80));
console.log(`Executing ${SUITES.length} sequential verification suites across all 7 Phases...\n`);

const results = [];
let overallPass = true;
const startTime = Date.now();

for (let i = 0; i < SUITES.length; i++) {
  const suite = SUITES[i];
  const stepNum = i + 1;
  process.stdout.write(`[${stepNum}/${SUITES.length}] Running: ${suite.name}... `);

  const suiteStart = Date.now();
  const run = spawnSync(suite.command, suite.args, {
    cwd: ROOT_DIR,
    shell: true,
    encoding: 'utf-8'
  });
  const durationMs = Date.now() - suiteStart;

  if (run.status === 0) {
    console.log(`✅ PASSED (${durationMs}ms)`);
    results.push({ name: suite.name, status: 'PASSED', durationMs });
  } else {
    console.log(`❌ FAILED (${durationMs}ms)`);
    console.error('\n--- Failure Output ---');
    console.error(run.stderr || run.stdout);
    console.error('----------------------\n');
    results.push({ name: suite.name, status: 'FAILED', durationMs, output: run.stderr || run.stdout });
    overallPass = false;
  }
}

const totalDurationSec = ((Date.now() - startTime) / 1000).toFixed(2);

console.log('\n' + '='.repeat(80));
console.log('📊 MILESTONE v1.1.0 MASTER VERIFICATION SUMMARY DASHBOARD');
console.log('='.repeat(80));

results.forEach((r, idx) => {
  const symbol = r.status === 'PASSED' ? '✅' : '❌';
  console.log(`  ${symbol} Suite ${(idx + 1).toString().padStart(2, ' ')}: ${r.name.padEnd(54)} [${r.status}] (${r.durationMs}ms)`);
});

console.log('='.repeat(80));
if (overallPass) {
  console.log(`🎉 ALL ${SUITES.length}/${SUITES.length} MILESTONE v1.1.0 VERIFICATION SUITES PASSED! (${totalDurationSec}s total)`);
  console.log('   Milestone v1.1.0 (Design Craft & Antialgorithm Modernization) is 100% verified.');
  console.log('='.repeat(80) + '\n');
  process.exit(0);
} else {
  console.error(`❌ One or more verification suites failed. Review logs above.`);
  console.log('='.repeat(80) + '\n');
  process.exit(1);
}
