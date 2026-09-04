const path = require('path');
const fs = require('fs');

const ExpenseStorage = require('../src/storage');

console.log('--- STARTING PHASE 3 PRESET & BATCH VERIFICATION TESTS ---');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`✅ PASS: ${message}`);
    passed++;
  } else {
    console.error(`❌ FAIL: ${message}`);
    failed++;
  }
}

try {
  const scratchDir = path.join(__dirname, '../scratch/phase3_test_data');
  const testDbFile = path.join(scratchDir, 'expenses_phase3_test.json');

  if (!fs.existsSync(scratchDir)) fs.mkdirSync(scratchDir, { recursive: true });
  if (fs.existsSync(testDbFile)) fs.unlinkSync(testDbFile);

  const storage = new ExpenseStorage(testDbFile);

  // Test 1: Get Initial Presets
  const initialPresets = storage.getPresets();
  assert(Array.isArray(initialPresets) && initialPresets.length > 0, 'storage.getPresets() initializes preset chips');

  // Test 2: Add Custom User Preset
  const customPresetPayload = {
    icon: '🍕',
    title: 'Friday Pizza Night',
    amount: 24.50,
    category: 'Food & Dining',
    paymentMethod: 'Credit Card'
  };
  const addRes = storage.addPreset(customPresetPayload);
  assert(addRes.success === true, 'addPreset successfully adds custom user preset');
  assert(addRes.preset.id && addRes.preset.id.startsWith('pst-'), 'addPreset assigns unique pst- ID');
  assert(addRes.preset.icon === '🍕', 'addPreset preserves custom icon emoji');

  // Test 3: Update Preset
  const updateRes = storage.updatePreset({
    id: addRes.preset.id,
    title: 'Friday Deluxe Pizza',
    amount: 29.99
  });
  assert(updateRes.success === true, 'updatePreset successfully modifies existing preset');
  assert(updateRes.preset.amount === 29.99, 'updatePreset updates amount correctly');

  // Test 4: Delete Preset
  const deleteRes = storage.deletePreset(addRes.preset.id);
  assert(deleteRes.success === true, 'deletePreset removes preset from database');
  assert(!deleteRes.presets.some(p => p.id === addRes.preset.id), 'Deleted preset no longer present in presets list');

  // Test 5: Batch Expense Additions
  const batchEntries = [
    { title: 'Batch Item 1', amount: 10.00, category: 'Food & Dining', date: '2026-08-11' },
    { title: 'Batch Item 2', amount: 20.00, category: 'Office & Tech', date: '2026-08-11' },
    { title: 'Batch Item 3', amount: 30.00, category: 'Transportation', date: '2026-08-11' }
  ];

  batchEntries.forEach(item => storage.addExpense(item));
  const updatedData = storage.getData();
  assert(updatedData.expenses.some(e => e.title === 'Batch Item 1'), 'Batch Item 1 saved');
  assert(updatedData.expenses.some(e => e.title === 'Batch Item 2'), 'Batch Item 2 saved');
  assert(updatedData.expenses.some(e => e.title === 'Batch Item 3'), 'Batch Item 3 saved');

  console.log(`\n--- VERIFICATION TEST SUMMARY: ${passed} PASSED, ${failed} FAILED ---`);
  if (failed > 0) process.exit(1);
} catch (err) {
  console.error('Fatal error during test execution:', err);
  process.exit(1);
}
