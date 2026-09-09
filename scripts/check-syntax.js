// ============================================================================
// Ledgerly — Syntax Verification Utility
// Checks all JavaScript files in src/ for syntax validity across platforms.
// ============================================================================

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

function getJsFiles(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      results = results.concat(getJsFiles(filePath));
    } else if (file.endsWith('.js')) {
      results.push(filePath);
    }
  }
  return results;
}

const srcDir = path.resolve(__dirname, '..', 'src');
const files = getJsFiles(srcDir);

let failed = 0;
for (const file of files) {
  const rel = path.relative(path.resolve(__dirname, '..'), file);
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
    console.log(`  ✓ ${rel}`);
  } catch (err) {
    console.error(`  ✗ ${rel}: ${err.message}`);
    failed++;
  }
}

if (failed > 0) {
  console.error(`\nSyntax check failed for ${failed} file(s).`);
  process.exit(1);
} else {
  console.log(`\nAll ${files.length} JavaScript files in src/ passed syntax check.`);
}
