'use strict';

/**
 * ============================================================================
 * Ledgerly — Milestone v0.6 Unified Multi-Platform Verification Runner
 * ============================================================================
 *
 * @fileoverview
 * Orchestrates and executes all empirical verification suites across Milestone v0.6:
 * - Desktop Electron Core (syntax check, linter)
 * - Mobile Schemas & Desktop Parity
 * - Camera Downscaler & Offline Ingestion Queue
 * - Desktop SyncServer, 15-Attempt Rate Limiter & Multi-Profile Partitioning
 * - Cross-Device Peer-to-Peer LAN Synchronization E2E
 * - Apple iOS Native Container & WebKit CSS Ergonomics
 * - GitHub Actions macOS Headless Xcode Build Pipeline
 */

const { spawnSync } = require('child_process');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');

const SUITES = [
  {
    name: 'Desktop Syntax Check (53 JS Files)',
    command: 'node',
    args: ['scripts/check-syntax.js']
  },
  {
    name: 'Codebase ESLint Scan (src/ & mobile/src/)',
    command: 'npx',
    args: ['eslint', 'src/', 'mobile/src/']
  },
  {
    name: 'Mobile Schemas & Desktop Parity (LEDG-203)',
    command: 'node',
    args: ['scratch/test_phase6_1_mobile_schemas.js']
  },
  {
    name: 'Mobile Camera Subsystem & Offline Ingestion Queue',
    command: 'node',
    args: ['scratch/test_phase6_2_mobile_camera_queue.js']
  },
  {
    name: 'Desktop SyncServer & 15-Attempt Rate Limiter',
    command: 'node',
    args: ['scratch/test_phase6_3_sync_server.js']
  },
  {
    name: 'Cross-Device E2E LAN Sync & Partition Isolation',
    command: 'node',
    args: ['scratch/test_phase6_4_cross_device_sync.js']
  },
  {
    name: 'Apple iOS Info.plist, ATS & WebKit Ergonomics',
    command: 'node',
    args: ['scratch/test_phase6_5_ios_webkit_integrity.js']
  },
  {
    name: 'GitHub Actions iOS CI/CD Workflow Validation',
    command: 'node',
    args: ['scripts/check-ci-workflow.js']
  },
  {
    name: 'LAN Sync Resilience & Error Fallbacks (Phase 0.6.6 Audit)',
    command: 'node',
    args: ['scratch/test_phase6_6_resilience_and_fallbacks.js']
  }
];

console.log('='.repeat(80));
console.log('🚀 Ledgerly — Milestone v0.6 Unified Multi-Platform Verification Suite');
console.log('='.repeat(80));
console.log(`Executing ${SUITES.length} verification suites across Desktop, Android, iOS & LAN Sync...\n`);

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
console.log('📊 MILESTONE v0.6 VERIFICATION SUMMARY DASHBOARD');
console.log('='.repeat(80));

results.forEach((r, idx) => {
  const symbol = r.status === 'PASSED' ? '✅' : '❌';
  console.log(`  ${symbol} Suite ${idx + 1}: ${r.name.padEnd(54)} [${r.status}] (${r.durationMs}ms)`);
});

console.log('='.repeat(80));
if (overallPass) {
  console.log(`🎉 ALL ${SUITES.length}/${SUITES.length} MILESTONE v0.6 VERIFICATION SUITES PASSED! (${totalDurationSec}s total)`);
  console.log('   Milestone v0.6 (Capacitor Mobile Companion & LAN Sync) is 100% certified.');
  console.log('='.repeat(80) + '\n');
  process.exit(0);
} else {
  console.error(`❌ One or more verification suites failed. Review logs above.`);
  console.log('='.repeat(80) + '\n');
  process.exit(1);
}
