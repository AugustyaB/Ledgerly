const path = require('path');
const fs = require('fs');

const ExpenseStorage = require('../src/storage');
const ReceiptStorage = require('../src/receiptStorage');

console.log('--- STARTING PHASE 2 STORAGE & RECEIPT VERIFICATION TESTS ---');

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
  const scratchDir = path.join(__dirname, '../scratch/phase2_test_data');
  const testDbFile = path.join(scratchDir, 'expenses_test.json');
  const testReceiptsDir = path.join(scratchDir, 'receipts');

  if (!fs.existsSync(scratchDir)) fs.mkdirSync(scratchDir, { recursive: true });
  if (fs.existsSync(testDbFile)) fs.unlinkSync(testDbFile);

  // Test 1: Expense Storage Initialization
  const storage = new ExpenseStorage(testDbFile);
  const initialData = storage.getData();
  assert(Array.isArray(initialData.expenses), 'ExpenseStorage initializes expenses array');
  assert(Array.isArray(initialData.categories), 'ExpenseStorage initializes categories array');

  // Test 2: Add Expense with receiptFilename
  const sampleExpense = {
    title: 'Test Ergonomic Mouse',
    amount: 55.00,
    category: 'Office & Tech',
    paymentMethod: 'Credit Card',
    date: '2026-08-11',
    description: 'Wireless ergonomic mouse for workstation',
    tags: ['work', 'peripheral'],
    receiptFilename: 'rcpt_test_sample.png'
  };
  const added = storage.addExpense(sampleExpense);
  assert(added.id && added.id.startsWith('exp-'), 'addExpense generates unique expense ID');
  assert(added.receiptFilename === 'rcpt_test_sample.png', 'addExpense preserves receiptFilename');

  // Test 3: Category Management
  const testCatName = `Home & Garden_${Date.now()}`;
  const newCatRes = storage.addCategory(testCatName);
  assert(newCatRes.success === true, 'addCategory adds a new category');
  assert(newCatRes.categories.includes(testCatName), 'New category exists in categories array');

  // Test 4: Query & Filtering
  const filtered = storage.getFilteredExpenses({ category: 'Office & Tech', query: 'Mouse' });
  assert(filtered.totalCount >= 1, 'getFilteredExpenses correctly filters by category and query');
  assert(filtered.expenses.some(e => e.title === 'Test Ergonomic Mouse'), 'Target expense is present in query result');

  // Test 5: Receipt Storage Persistence & Deletion
  const receiptStorage = new ReceiptStorage(testReceiptsDir);
  const dummySourceImg = path.join(scratchDir, 'sample_receipt_input.png');
  fs.writeFileSync(dummySourceImg, 'Fake receipt image binary data buffer');

  const saveRes = receiptStorage.saveReceipt(dummySourceImg);
  assert(saveRes.success === true, 'ReceiptStorage saves receipt file to local receipts directory');
  assert(fs.existsSync(saveRes.absolutePath), 'Receipt image file exists at target absolute path');

  const absolutePathResolved = receiptStorage.getReceiptAbsolutePath(saveRes.filename);
  assert(absolutePathResolved === saveRes.absolutePath, 'getReceiptAbsolutePath resolves exact path');

  const deleteRes = receiptStorage.deleteReceipt(saveRes.filename);
  assert(deleteRes.success === true, 'ReceiptStorage deletes receipt image file from disk');
  assert(!fs.existsSync(saveRes.absolutePath), 'Receipt image file is removed from disk after deletion');

  // Cleanup test expense
  storage.deleteExpense(added.id);

  console.log(`\n--- VERIFICATION TEST SUMMARY: ${passed} PASSED, ${failed} FAILED ---`);
  if (failed > 0) process.exit(1);
} catch (err) {
  console.error('Fatal error during test execution:', err);
  process.exit(1);
}
