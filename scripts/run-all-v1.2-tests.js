'use strict';

/**
 * ============================================================================
 * Ledgerly — Milestone v1.2.0 Unified Master Verification Runner
 * ============================================================================
 *
 * @fileoverview
 * Orchestrates and executes all 11 sequential empirical verification suites:
 * - Suite 1: Desktop Syntax Check (scripts/check-syntax.js)
 * - Suite 2: Layer Architecture Boundary Check (scripts/check-architecture-layers.js 79/79)
 * - Suite 3: Codebase ESLint Scan (eslint src/ mobile/src/)
 * - Suite 4: Phase 1 Receipt Perception Consolidation Suite (scratch/test_phase1_receipt_consolidation.js)
 * - Suite 5: Phase 2 Database Integrity & Diagnostics Suite (scratch/test_phase2_database_integrity.js)
 * - Suite 6: Phase 3 Facade Streamlining & Direct Routing Suite (scratch/test_phase3_facade_streamlining.js)
 * - Suite 7: Phase 4 Rollup Cache Simplification Suite (scratch/test_phase4_cache_simplification.js)
 * - Suite 8: Exploratory Data Analysis & Rollup Benchmarks (scratch/test_phase8_2_eda_foundation.js)
 * - Suite 9: Statement Reconciliation Fuzzy Deduplication (scratch/test_phase8_3_fuzzy_reconciliation.js)
 * - Suite 10: Smart Insights & Subscriptions Suite (scratch/test_phase8_4_smart_insights.js)
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
    name: 'Layer Architecture Boundary Check (79/79 Files Compliant)',
    command: 'node',
    args: ['scripts/check-architecture-layers.js']
  },
  {
    name: 'Codebase ESLint Scan (src/ & mobile/src/)',
    command: 'npx',
    args: ['eslint', 'src/', 'mobile/src/']
  },
  {
    name: 'Phase 1 Receipt Perception Consolidation Suite',
    command: 'node',
    args: ['scratch/test_phase1_receipt_consolidation.js']
  },
  {
    name: 'Phase 2 Database Integrity & Diagnostics Suite',
    command: 'node',
    args: ['scratch/test_phase2_database_integrity.js']
  },
  {
    name: 'Phase 3 Facade Streamlining & Direct Routing Suite',
    command: 'node',
    args: ['scratch/test_phase3_facade_streamlining.js']
  },
  {
    name: 'Phase 4 Rollup Cache Simplification Suite',
    command: 'node',
    args: ['scratch/test_phase4_cache_simplification.js']
  },
  {
    name: 'Exploratory Data Analysis & Rollup Benchmarks',
    command: 'node',
    args: ['scratch/test_phase8_2_eda_foundation.js']
  },
  {
    name: 'Statement Reconciliation Fuzzy Deduplication',
    command: 'node',
    args: ['scratch/test_phase8_3_fuzzy_reconciliation.js']
  },
  {
    name: 'Smart Insights & Subscriptions Suite',
    command: 'node',
    args: ['scratch/test_phase8_4_smart_insights.js']
  },
  {
    name: 'End-to-End Desktop Integration Suite',
    command: 'node',
    args: ['scratch/test_e2e_ledgerly.js']
  }
];

console.log('='.repeat(80));
console.log('🚀 Ledgerly — Milestone v1.2.0 Unified Master Verification Runner');
console.log('='.repeat(80));
console.log(`Executing ${SUITES.length} sequential verification suites across all consolidation phases...\n`);

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
console.log('📊 MILESTONE v1.2.0 MASTER VERIFICATION SUMMARY DASHBOARD');
console.log('='.repeat(80));

results.forEach((r, idx) => {
  const symbol = r.status === 'PASSED' ? '✅' : '❌';
  console.log(`  ${symbol} Suite ${(idx + 1).toString().padStart(2, ' ')}: ${r.name.padEnd(54)} [${r.status}] (${r.durationMs}ms)`);
});

console.log('='.repeat(80));
if (overallPass) {
  console.log(`🎉 ALL ${SUITES.length}/${SUITES.length} MILESTONE v1.2.0 VERIFICATION SUITES PASSED! (${totalDurationSec}s total)`);
  console.log('   Milestone v1.2.0 (Subsystem Consolidation & Code Cohesion) is 100% verified.');
  console.log('='.repeat(80) + '\n');
  process.exit(0);
} else {
  console.error(`❌ One or more verification suites failed. Review logs above.`);
  console.log('='.repeat(80) + '\n');
  process.exit(1);
}
