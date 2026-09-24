'use strict';

/**
 * ============================================================================
 * Ledgerly — CI/CD Workflow Automated Validator
 * ============================================================================
 *
 * @fileoverview
 * Standalone Node script verifying the structure, actions, parameters,
 * and security rules of the GitHub Actions iOS build workflow.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT_DIR = path.resolve(__dirname, '..');
const WORKFLOW_PATH = path.join(ROOT_DIR, '.github/workflows/ios-build.yml');

let passedTests = 0;
let totalTests = 0;

function runTest(description, testFn) {
  totalTests++;
  try {
    testFn();
    console.log(`  ✅ [${totalTests}] ${description}: PASSED`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ [${totalTests}] ${description}: FAILED`);
    console.error(`     Error: ${err.message}`);
    process.exitCode = 1;
  }
}

console.log('='.repeat(80));
console.log('🧪 Starting CI/CD Workflow Validation: iOS Build Pipeline');
console.log('='.repeat(80));

runTest('Workflow file exists and is readable', () => {
  assert.ok(fs.existsSync(WORKFLOW_PATH), 'Missing .github/workflows/ios-build.yml');
  const stats = fs.statSync(WORKFLOW_PATH);
  assert.ok(stats.size > 200, 'Workflow file appears too small or empty');
});

const content = fs.readFileSync(WORKFLOW_PATH, 'utf-8');

runTest('Workflow triggers on push, pull_request, and workflow_dispatch', () => {
  assert.ok(content.includes('workflow_dispatch:'), 'Missing workflow_dispatch manual trigger');
  assert.ok(content.includes('branches: [ main ]'), 'Missing main branch trigger');
  assert.ok(content.includes("- 'mobile/**'"), 'Missing mobile path trigger filter');
});

runTest('Workflow selects Apple Silicon macos-14 runner', () => {
  assert.ok(content.includes('runs-on: macos-14'), 'Runner must be macos-14 for Apple Silicon M-series performance');
});

runTest('Workflow sets up Node.js 20 with npm caching', () => {
  assert.ok(content.includes('uses: actions/setup-node@v4'), 'Must use actions/setup-node@v4');
  assert.ok(content.includes('node-version: 20'), 'Must specify Node.js 20');
  assert.ok(content.includes("cache: 'npm'"), 'Must enable npm package caching');
});

runTest('Pre-build quality & integrity gates are enforced', () => {
  assert.ok(content.includes('npm run check'), 'Must execute syntax check in CI');
  assert.ok(content.includes('npm run lint'), 'Must execute linter in CI');
  assert.ok(content.includes('npm run test:ios-integrity'), 'Must execute iOS container integrity test in CI');
});

runTest('Mobile web assets and Capacitor sync are executed', () => {
  assert.ok(content.includes('npm run mobile:build'), 'Must compile web bundle with Vite');
  assert.ok(content.includes('npx cap sync ios'), 'Must sync Capacitor iOS native assets');
});

runTest('CocoaPods dependencies installation step is present', () => {
  assert.ok(content.includes('cd mobile/ios/App'), 'Must navigate to mobile/ios/App for pod install');
  assert.ok(content.includes('pod install'), 'Must run pod install');
});

runTest('Headless Xcode build and archiving is configured without code signing', () => {
  assert.ok(content.includes('xcodebuild -workspace App.xcworkspace'), 'Must target App.xcworkspace');
  assert.ok(content.includes('-scheme App'), 'Must specify App scheme');
  assert.ok(content.includes("-destination 'generic/platform=iOS'"), 'Must build for generic iOS platform');
  assert.ok(content.includes('-archivePath build/App.xcarchive'), 'Must specify archivePath');
  assert.ok(content.includes('CODE_SIGNING_ALLOWED=NO'), 'Must disable code signing for unsigned CI archive');
  assert.ok(content.includes('CODE_SIGNING_REQUIRED=NO'), 'Must disable code signing requirement');
});

runTest('Build archive compression and artifact upload step configured', () => {
  assert.ok(content.includes('tar -czf Ledgerly-iOS-App.xcarchive.tar.gz App.xcarchive'), 'Must compress archive');
  assert.ok(content.includes('uses: actions/upload-artifact@v4'), 'Must use actions/upload-artifact@v4');
  assert.ok(content.includes('retention-days: 14'), 'Must configure artifact retention');
});

console.log('='.repeat(80));
console.log(`🎉 CI Workflow Validation Completed: ${passedTests} / ${totalTests} checks passed!`);
console.log('='.repeat(80));
