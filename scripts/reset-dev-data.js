'use strict';

/**
 * ============================================================================
 * Ledgerly — Dev Data Reset & Day-Zero Onboarding Prep Utility
 * ============================================================================
 *
 * Safely backs up existing dev data and resets application state to Day-Zero
 * so engineers can interactively test the First-Time Onboarding & Master PIN wizard.
 */

const fs = require('fs');
const path = require('path');

const appData = process.env.APPDATA || (process.platform === 'darwin'
  ? path.join(process.env.HOME, 'Library/Application Support')
  : path.join(process.env.HOME, '.config'));

const targets = [
  path.join(appData, 'Electron'),
  path.join(appData, 'Ledgerly'),
  path.join(appData, 'ledgerly')
];

const backupDir = path.join(__dirname, '..', 'sample_data', 'backup_workspace_dev');
if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true });
}

let resetCount = 0;

for (const dir of targets) {
  if (fs.existsSync(dir)) {
    const dbPath = path.join(dir, 'expenses_db.json');
    if (fs.existsSync(dbPath)) {
      const backupFile = path.join(backupDir, `expenses_db_${path.basename(dir)}.json`);
      fs.copyFileSync(dbPath, backupFile);
      console.log(`[Reset Utility] Backed up ${dbPath} -> ${backupFile}`);
    }

    const itemsToRemove = [
      'expenses_db.json',
      'expenses_db.json.bak',
      'data',
      'receipts',
      'Local Storage',
      'Session Storage',
      'Shared Dictionary'
    ];

    for (const item of itemsToRemove) {
      const targetPath = path.join(dir, item);
      if (fs.existsSync(targetPath)) {
        fs.rmSync(targetPath, { recursive: true, force: true });
        console.log(`[Reset Utility] Removed ${targetPath}`);
        resetCount++;
      }
    }
  }
}

console.log('='.repeat(80));
console.log(`✅ Ledgerly application state reset to Day-Zero (${resetCount} artifacts cleaned).`);
console.log('Launch via `npm start` or Run-Ledgerly.bat to test first-time onboarding!');
console.log('='.repeat(80));
