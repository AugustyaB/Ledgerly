const path = require('path');
const fs = require('fs');

const ExpenseStorage = require('../src/storage');

console.log('--- STARTING PHASE 4 SALARY, DAILY BUDGET & HOUSEHOLD SPLIT TESTS ---');

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
  const scratchDir = path.join(__dirname, '../scratch/phase4_test_data');
  const testDbFile = path.join(scratchDir, 'expenses_phase4_test.json');

  if (!fs.existsSync(scratchDir)) fs.mkdirSync(scratchDir, { recursive: true });
  if (fs.existsSync(testDbFile)) fs.unlinkSync(testDbFile);

  const storage = new ExpenseStorage(testDbFile);

  // Test 1: Salary Config Retrieval & Setting
  const defaultSalary = storage.getSalaryConfig();
  assert(defaultSalary.monthlyIncome === 4500, 'Initial salary configuration has monthlyIncome 4500');

  const updatedSalaryRes = storage.setSalaryConfig({
    monthlyIncome: 6000,
    fixedBills: 2000,
    savingsGoal: 1000
  });
  assert(updatedSalaryRes.success === true, 'setSalaryConfig updates configuration successfully');
  assert(updatedSalaryRes.budgetGoal === 3000, 'setSalaryConfig calculates discretionary budgetGoal (6000 - 2000 - 1000 = 3000)');

  // Test 2: Daily Budget & Rollover Calculation
  // Add expenses on target date
  storage.addExpense({
    title: 'Groceries',
    amount: 60.00,
    category: 'Food & Dining',
    date: '2026-08-15'
  });
  storage.addExpense({
    title: 'Transit',
    amount: 15.00,
    category: 'Transportation',
    date: '2026-08-15'
  });

  const dailyMetrics = storage.calculateDailyBudgetMetrics('2026-08-15');
  assert(dailyMetrics.discretionaryBudget === 3000, 'Discretionary budget is 3000');
  assert(dailyMetrics.daysInMonth === 31, 'August has 31 days');
  assert(dailyMetrics.dailyAllowance === parseFloat((3000 / 31).toFixed(2)), `Daily allowance is ~${(3000/31).toFixed(2)}`);
  assert(dailyMetrics.todaySpent >= 75.00, 'Today spent on 2026-08-15 includes at least 75.00 (60 + 15)');
  assert(dailyMetrics.spentMonthToDate >= 75.00, 'Month to date spent includes at least 75.00');
  assert(typeof dailyMetrics.rolloverBalance === 'number', 'Rollover balance is computed as numeric value');
  assert(typeof dailyMetrics.pacingStatus === 'string', 'Pacing status is assigned');

  // Test 3: Household Member Management
  const initialMembers = storage.getHouseholdMembers();
  assert(initialMembers.includes('Self'), 'Household members includes primary user Self');

  const addMemberRes = storage.addHouseholdMember('Jordan');
  assert(addMemberRes.success === true, 'addHouseholdMember successfully adds Jordan');
  assert(addMemberRes.householdMembers.includes('Jordan'), 'Jordan exists in household members array');

  const deleteMemberRes = storage.deleteHouseholdMember('Jordan');
  assert(deleteMemberRes.success === true, 'deleteHouseholdMember successfully removes Jordan');
  assert(!deleteMemberRes.householdMembers.includes('Jordan'), 'Jordan removed from household members');

  const preventSelfDelete = storage.deleteHouseholdMember('Self');
  assert(preventSelfDelete.success === false, 'Cannot delete primary user Self');

  // Test 4: Household Split & Settlement Calculation
  // Ensure members are Self, Alex, Taylor
  storage.addHouseholdMember('Alex');
  storage.addHouseholdMember('Taylor');

  // Self pays $90 for Groceries split 3 ways (Self, Alex, Taylor) -> Each owes $30
  storage.addExpense({
    title: 'Shared Supermarket',
    amount: 90.00,
    category: 'Food & Dining',
    paidBy: 'Self',
    splitWith: ['Self', 'Alex', 'Taylor'],
    isHouseholdExpense: true,
    date: '2026-08-15'
  });

  // Alex pays $60 for Household Utilities split 3 ways (Self, Alex, Taylor) -> Each owes $20
  storage.addExpense({
    title: 'Shared Internet & Power',
    amount: 60.00,
    category: 'Utilities & Bills',
    paidBy: 'Alex',
    splitWith: ['Self', 'Alex', 'Taylor'],
    isHouseholdExpense: true,
    date: '2026-08-15'
  });

  const settlement = storage.calculateHouseholdSettlement();
  assert(settlement.totalSharedAmount === 150.00, 'Total shared amount is 150.00 (90 + 60)');
  assert(settlement.paidMap['Self'] === 90.00, 'Self paid 90.00');
  assert(settlement.paidMap['Alex'] === 60.00, 'Alex paid 60.00');
  assert(settlement.owesMap['Taylor'] === 50.00, 'Taylor owes 50.00 total (30 + 20)');
  assert(settlement.balances['Self'] === 40.00, 'Self net balance is +40.00 (paid 90, share 50)');
  assert(settlement.balances['Alex'] === 10.00, 'Alex net balance is +10.00 (paid 60, share 50)');
  assert(settlement.balances['Taylor'] === -50.00, 'Taylor net balance is -50.00 (paid 0, share 50)');

  // Pairwise settlement assertions
  assert(settlement.settlements.length > 0, 'Pairwise settlements generated');
  const taylorPaysSelf = settlement.settlements.find(s => s.from === 'Taylor' && s.to === 'Self');
  const taylorPaysAlex = settlement.settlements.find(s => s.from === 'Taylor' && s.to === 'Alex');
  assert(taylorPaysSelf && taylorPaysSelf.amount === 40.00, 'Taylor settles $40.00 to Self');
  assert(taylorPaysAlex && taylorPaysAlex.amount === 10.00, 'Taylor settles $10.00 to Alex');

  console.log(`\n--- VERIFICATION TEST SUMMARY: ${passed} PASSED, ${failed} FAILED ---`);
  if (failed > 0) process.exit(1);
} catch (err) {
  console.error('Fatal error during test execution:', err);
  process.exit(1);
}
