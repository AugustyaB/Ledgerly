'use strict';

/**
 * @fileoverview Phase 0.6.5 Empirical Integrity Test Suite
 * Validates iOS Info.plist permissions, ATS local networking keys,
 * WebKit CSS safe-area/touch ergonomics, and Capacitor iOS sync integrity.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT_DIR = path.resolve(__dirname, '..');
const PLIST_PATH = path.join(ROOT_DIR, 'mobile/ios/App/App/Info.plist');
const CSS_PATH = path.join(ROOT_DIR, 'mobile/src/styles/mobile.css');
const HTML_PATH = path.join(ROOT_DIR, 'mobile/index.html');
const SYNCED_INDEX_PATH = path.join(ROOT_DIR, 'mobile/ios/App/App/public/index.html');
const SYNCED_CONFIG_PATH = path.join(ROOT_DIR, 'mobile/ios/App/App/capacitor.config.json');

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
console.log('🧪 Starting Phase 0.6.5: iOS Native Container & WebKit Ergonomics Test Suite');
console.log('='.repeat(80));

console.log('\n--- Group 1: iOS Info.plist Permissions & ATS Local LAN Configuration ---');

runTest('Info.plist exists and is readable XML', () => {
  assert.ok(fs.existsSync(PLIST_PATH), 'Info.plist must exist at mobile/ios/App/App/Info.plist');
  const content = fs.readFileSync(PLIST_PATH, 'utf-8');
  assert.ok(content.includes('<!DOCTYPE plist PUBLIC'), 'Must be valid plist XML');
});

runTest('Camera & Photo Library permission descriptions are configured', () => {
  const content = fs.readFileSync(PLIST_PATH, 'utf-8');
  assert.ok(content.includes('<key>NSCameraUsageDescription</key>'), 'Missing NSCameraUsageDescription');
  assert.ok(content.includes('<key>NSPhotoLibraryUsageDescription</key>'), 'Missing NSPhotoLibraryUsageDescription');
  assert.ok(content.includes('<key>NSPhotoLibraryAddUsageDescription</key>'), 'Missing NSPhotoLibraryAddUsageDescription');
  assert.ok(content.includes('Ledgerly requires camera access to photograph and scan physical expense receipts'), 'Camera description text mismatch');
});

runTest('Local Wi-Fi Network LAN usage permission (iOS 14+) is configured', () => {
  const content = fs.readFileSync(PLIST_PATH, 'utf-8');
  assert.ok(content.includes('<key>NSLocalNetworkUsageDescription</key>'), 'Missing NSLocalNetworkUsageDescription');
  assert.ok(content.includes('local Wi-Fi network to synchronize receipts and offline expenses securely'), 'Local network description mismatch');
});

runTest('App Transport Security (ATS) configured with NSAllowsLocalNetworking', () => {
  const content = fs.readFileSync(PLIST_PATH, 'utf-8');
  assert.ok(content.includes('<key>NSAppTransportSecurity</key>'), 'Missing NSAppTransportSecurity dictionary');
  assert.ok(content.includes('<key>NSAllowsLocalNetworking</key>'), 'Missing NSAllowsLocalNetworking key');
  assert.ok(content.includes('<key>NSAllowsArbitraryLoads</key>'), 'Missing NSAllowsArbitraryLoads key');
  
  const atsRegex = /<key>NSAppTransportSecurity<\/key>\s*<dict>\s*<key>NSAllowsLocalNetworking<\/key>\s*<true\/>\s*<key>NSAllowsArbitraryLoads<\/key>\s*<false\/>\s*<\/dict>/;
  assert.ok(atsRegex.test(content), 'NSAppTransportSecurity must allow local networking and reject arbitrary loads');
});

console.log('\n--- Group 2: iOS WebKit CSS Ergonomics & Safe-Area Insets ---');

runTest('Safe-area inset variables are bounded with max(..., 0px)', () => {
  const css = fs.readFileSync(CSS_PATH, 'utf-8');
  assert.ok(css.includes('--sat: max(env(safe-area-inset-top, 0px), 0px);'), 'Missing bounded --sat');
  assert.ok(css.includes('--sab: max(env(safe-area-inset-bottom, 0px), 0px);'), 'Missing bounded --sab');
  assert.ok(css.includes('--sal: max(env(safe-area-inset-left, 0px), 0px);'), 'Missing bounded --sal');
  assert.ok(css.includes('--sar: max(env(safe-area-inset-right, 0px), 0px);'), 'Missing bounded --sar');
});

runTest('Scroll rubber-banding is trapped at root and isolated in viewports', () => {
  const css = fs.readFileSync(CSS_PATH, 'utf-8');
  assert.ok(css.includes('overscroll-behavior: none;'), 'Missing overscroll-behavior: none');
  assert.ok(css.includes('overscroll-behavior-y: none;'), 'Missing overscroll-behavior-y: none');
  assert.ok(css.includes('overscroll-behavior-y: contain;'), 'Missing overscroll-behavior-y: contain for scrollable containers');
  assert.ok(css.includes('-webkit-overflow-scrolling: touch;'), 'Missing -webkit-overflow-scrolling: touch');
});

runTest('Lateral safe-area insets are applied to view panes and headers', () => {
  const css = fs.readFileSync(CSS_PATH, 'utf-8');
  assert.ok(css.includes('padding-left: max(16px, var(--sal));'), 'Missing safe-area left on header');
  assert.ok(css.includes('padding-right: max(16px, var(--sar));'), 'Missing safe-area right on header');
  assert.ok(css.includes('padding: 16px max(16px, var(--sar)) 16px max(16px, var(--sal));'), 'Missing safe-area lateral padding on view-pane');
  assert.ok(css.includes('padding: 16px max(18px, var(--sar)) calc(18px + var(--sab)) max(18px, var(--sal));'), 'Missing safe-area padding on bottom-sheet-dialog');
});

runTest('Input font sizes enforced to 16px to prevent iOS WebKit auto-zoom', () => {
  const css = fs.readFileSync(CSS_PATH, 'utf-8').replace(/\r\n/g, '\n');
  assert.ok(css.includes('.review-input-field {\n  width: 100%;\n  height: 40px;\n  background: var(--bg-surface-elevated);\n  border: 1px solid var(--border-color);\n  border-radius: 10px;\n  padding: 0 12px;\n  color: #ffffff;\n  font-size: 16px;'), 'review-input-field must be 16px');
  assert.ok(css.includes('input, textarea {\n  user-select: text;\n  -webkit-user-select: text;\n  font-size: 16px;\n}'), 'Global inputs must have font-size 16px');
});

runTest('Touch targets have touch-action: manipulation to eliminate click delays', () => {
  const css = fs.readFileSync(CSS_PATH, 'utf-8').replace(/\r\n/g, '\n');
  assert.ok(css.includes('.mobile-dock {\n  position: fixed;\n  bottom: 0;\n  left: 0;\n  right: 0;\n  height: calc(var(--dock-height) + var(--sab));\n  padding-bottom: var(--sab);\n  padding-left: max(12px, var(--sal));\n  padding-right: max(12px, var(--sar));\n  background: var(--bg-surface-glass);\n  backdrop-filter: blur(20px);\n  -webkit-backdrop-filter: blur(20px);\n  border-top: 1px solid var(--border-color);\n  display: flex;\n  align-items: center;\n  justify-content: space-around;\n  z-index: 100;\n  box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.45);\n  touch-action: manipulation;'), 'mobile-dock must have touch-action: manipulation');
  assert.ok(css.includes('.dock-item {\n  position: relative;\n  display: flex;\n  flex-direction: column;\n  align-items: center;\n  justify-content: center;\n  min-width: 60px;\n  min-height: 48px;\n  padding: 4px 8px;\n  background: transparent;\n  border: none;\n  cursor: pointer;\n  color: var(--text-secondary);\n  transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1);\n  touch-action: manipulation;'), 'dock-item must have touch-action: manipulation');
  assert.ok(css.includes('.mobile-btn {\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  gap: 8px;\n  width: 100%;\n  height: 48px;\n  padding: 0 20px;\n  border-radius: 12px;\n  font-size: 15px;\n  font-weight: 600;\n  border: none;\n  cursor: pointer;\n  transition: all 0.18s ease;\n  touch-action: manipulation;'), 'mobile-btn must have touch-action: manipulation');
});

console.log('\n--- Group 3: Capacitor iOS Sync & Assets Verification ---');

runTest('index.html contains viewport-fit=cover and web app meta tags', () => {
  const html = fs.readFileSync(HTML_PATH, 'utf-8');
  assert.ok(html.includes('viewport-fit=cover'), 'Missing viewport-fit=cover in mobile viewport meta');
  assert.ok(html.includes('apple-mobile-web-app-capable'), 'Missing apple-mobile-web-app-capable');
  assert.ok(html.includes('apple-mobile-web-app-status-bar-style'), 'Missing status-bar-style');
});

runTest('Capacitor sync has synced latest dist assets to iOS container', () => {
  assert.ok(fs.existsSync(SYNCED_INDEX_PATH), 'Synced index.html must exist in ios/App/App/public');
  assert.ok(fs.existsSync(SYNCED_CONFIG_PATH), 'Synced capacitor.config.json must exist in ios/App/App');
  const syncedConfig = JSON.parse(fs.readFileSync(SYNCED_CONFIG_PATH, 'utf-8'));
  assert.strictEqual(syncedConfig.appId, 'com.ledgerly.mobile');
  assert.strictEqual(syncedConfig.appName, 'Ledgerly');
  assert.strictEqual(syncedConfig.ios.contentInset, 'always');
  assert.strictEqual(syncedConfig.ios.scrollEnabled, false);
});

console.log('='.repeat(80));
console.log(`🎉 Phase 0.6.5 Test Suite Completed: ${passedTests} / ${totalTests} tests passed!`);
console.log('='.repeat(80));
