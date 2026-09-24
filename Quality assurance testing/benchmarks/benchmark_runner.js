/**
 * ============================================================================
 * Ledgerly — Model Performance Benchmark Runner & Empirical Auditor
 * ============================================================================
 * 
 * Runs all 17 ground-truth benchmark samples across:
 * - Tier 1: Fast-Lite Engine
 * - Tier 2: Vision Specialist Engine (Anti-Trap, Degraded, Inpainting)
 * - Tier 3: Regional Specialist Engine (India, US, EU)
 * 
 * Compares actual predictions against dataset_manifest.json ground truth.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const DocumentNormalizer = require('../../src/services/DocumentNormalizer');
const ReceiptTier1Engine = require('../../src/services/ReceiptTier1Engine');
const ReceiptTier2VisionEngine = require('../../src/services/ReceiptTier2VisionEngine');
const ReceiptTier3RegionalEngine = require('../../src/services/ReceiptTier3RegionalEngine');

const MANIFEST_PATH = path.join(__dirname, 'dataset_manifest.json');
const RESULTS_PATH = path.join(__dirname, 'benchmark_results.json');

// Simple Levenshtein distance for fuzzy string similarity
function stringSimilarity(s1, s2) {
  if (!s1 || !s2) return 0;
  const a = s1.toLowerCase().trim();
  const b = s2.toLowerCase().trim();
  if (a === b) return 1.0;
  if (a.includes(b) || b.includes(a)) return 0.85;

  const track = Array(b.length + 1).fill(null).map(() => Array(a.length + 1).fill(null));
  for (let i = 0; i <= a.length; i += 1) track[0][i] = i;
  for (let j = 0; j <= b.length; j += 1) track[j][0] = j;

  for (let j = 1; j <= b.length; j += 1) {
    for (let i = 1; i <= a.length; i += 1) {
      const indicator = a[i - 1] === b[j - 1] ? 0 : 1;
      track[j][i] = Math.min(
        track[j][i - 1] + 1,
        track[j - 1][i] + 1,
        track[j - 1][i - 1] + indicator
      );
    }
  }
  const distance = track[b.length][a.length];
  const maxLen = Math.max(a.length, b.length);
  return Math.max(0, parseFloat((1 - distance / maxLen).toFixed(2)));
}

async function runBenchmark() {
  console.log('\n' + '='.repeat(80));
  console.log('🚀 LEDGERLY EMPIRICAL GROUND-TRUTH MODEL PERFORMANCE BENCHMARK (v0.5.9)');
  console.log('='.repeat(80) + '\n');

  if (!fs.existsSync(MANIFEST_PATH)) {
    throw new Error(`Manifest not found at ${MANIFEST_PATH}`);
  }

  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  const normalizer = new DocumentNormalizer();
  const tier1 = new ReceiptTier1Engine({ normalizer });
  const tier2 = new ReceiptTier2VisionEngine({ normalizer });
  const tier3 = new ReceiptTier3RegionalEngine({ normalizer });

  const results = {
    timestamp: new Date().toISOString(),
    milestone: manifest.milestone,
    totalSamples: manifest.samples.length,
    tier1Metrics: { totalTests: 0, totalMatches: 0, merchantMatches: 0, dateMatches: 0, negativePassed: 0, avgLatencyMs: 0 },
    tier2Metrics: { totalTests: 0, totalMatches: 0, merchantMatches: 0, dateMatches: 0, negativePassed: 0, avgLatencyMs: 0 },
    tier3Metrics: { totalTests: 0, totalMatches: 0, merchantMatches: 0, dateMatches: 0, negativePassed: 0, avgLatencyMs: 0 },
    sampleBreakdown: []
  };

  let t1TotalLatency = 0;
  let t2TotalLatency = 0;
  let t3TotalLatency = 0;

  for (const sample of manifest.samples) {
    const filePath = path.join(__dirname, sample.filename);
    const expected = sample.expected;

    console.log(`▶ Testing [${sample.id}] (${sample.category})...`);

    if (!fs.existsSync(filePath)) {
      console.error(`  ❌ Sample file missing: ${filePath}`);
      continue;
    }

    // 1. Run Tier 1 Fast-Lite
    const t1Start = Date.now();
    let t1Res = null;
    try {
      t1Res = await tier1.processDocument(filePath);
    } catch (err) {
      t1Res = { success: false, error: err.message };
    }
    const t1Time = Date.now() - t1Start;
    t1TotalLatency += t1Time;

    // 2. Run Tier 2 Vision Specialist
    const t2Start = Date.now();
    let t2Res = null;
    let t2Specialist = 'tier2-visionpro';
    if (sample.category === 'complex_tables_traps') t2Specialist = 'tier2-vision-precision';
    if (sample.category === 'faded_thermal_degraded') t2Specialist = 'tier2-vision-degraded';
    try {
      t2Res = await tier2.processDocument(filePath, { specialistId: t2Specialist });
    } catch (err) {
      t2Res = { success: false, error: err.message };
    }
    const t2Time = Date.now() - t2Start;
    t2TotalLatency += t2Time;

    // 3. Run Tier 3 Regional Specialist
    const t3Start = Date.now();
    let t3Res = null;
    let t3Specialist = 'tier3-regional-us';
    if (expected.currency === 'INR' || sample.id.includes('india')) t3Specialist = 'tier3-regional-in';
    if (expected.currency === 'EUR' || sample.id.includes('europe')) t3Specialist = 'tier3-regional-eu';
    try {
      t3Res = await tier3.processDocument(filePath, { specialistId: t3Specialist });
    } catch (err) {
      t3Res = { success: false, error: err.message };
    }
    const t3Time = Date.now() - t3Start;
    t3TotalLatency += t3Time;

    // Evaluate accuracy against expected ground truth
    const evaluateEngine = (res, engineName) => {
      const isSuccess = Boolean(res?.success);
      const data = res?.data || {};

      if (!expected.isTransaction) {
        // Negative control: should NOT be a transaction, or rejected as blurry/invalid
        const rejected = !isSuccess || data.isTransaction === false || !data.total;
        return {
          isTransactionMatch: rejected,
          totalMatch: rejected,
          merchantMatch: rejected,
          dateMatch: rejected,
          actualTotal: data.total || null,
          actualMerchant: data.merchant || null,
          actualDate: data.date || null,
          rejectionReason: data.reason || res?.error || 'Rejected successfully'
        };
      }

      // Positive financial transaction
      const totalDiff = data.total !== null && expected.total !== undefined
        ? Math.abs(parseFloat(data.total) - expected.total)
        : 999;
      const totalMatch = totalDiff <= 0.05;

      const sim = stringSimilarity(data.merchant, expected.merchant);
      const merchantMatch = sim >= 0.6;

      const dateMatch = expected.date ? (data.date === expected.date) : true;

      return {
        isTransactionMatch: data.isTransaction === true,
        totalMatch,
        merchantMatch,
        dateMatch,
        actualTotal: data.total,
        actualMerchant: data.merchant,
        actualDate: data.date,
        currency: data.currency
      };
    };

    const t1Eval = evaluateEngine(t1Res, 'Tier 1');
    const t2Eval = evaluateEngine(t2Res, 'Tier 2');
    const t3Eval = evaluateEngine(t3Res, 'Tier 3');

    // Update cumulative metrics
    results.tier1Metrics.totalTests++;
    results.tier2Metrics.totalTests++;
    results.tier3Metrics.totalTests++;

    if (expected.isTransaction) {
      if (t1Eval.totalMatch) results.tier1Metrics.totalMatches++;
      if (t1Eval.merchantMatch) results.tier1Metrics.merchantMatches++;
      if (t1Eval.dateMatch) results.tier1Metrics.dateMatches++;

      if (t2Eval.totalMatch) results.tier2Metrics.totalMatches++;
      if (t2Eval.merchantMatch) results.tier2Metrics.merchantMatches++;
      if (t2Eval.dateMatch) results.tier2Metrics.dateMatches++;

      if (t3Eval.totalMatch) results.tier3Metrics.totalMatches++;
      if (t3Eval.merchantMatch) results.tier3Metrics.merchantMatches++;
      if (t3Eval.dateMatch) results.tier3Metrics.dateMatches++;
    } else {
      if (t1Eval.isTransactionMatch) results.tier1Metrics.negativePassed++;
      if (t2Eval.isTransactionMatch) results.tier2Metrics.negativePassed++;
      if (t3Eval.isTransactionMatch) results.tier3Metrics.negativePassed++;
    }

    const logOutcome = (name, ev) => {
      if (!expected.isTransaction) {
        return ev.isTransactionMatch ? `✓ Rejected (${name})` : `✗ False Positive (${name})`;
      }
      return `${ev.totalMatch ? '✓' : '✗'} Amt: ${ev.actualTotal} (exp: ${expected.total}) | ${ev.merchantMatch ? '✓' : '✗'} Merch: "${ev.actualMerchant}" (exp: "${expected.merchant}")`;
    };

    console.log(`   [Tier 1] ${logOutcome('T1', t1Eval)} [${t1Time}ms]`);
    console.log(`   [Tier 2] ${logOutcome('T2', t2Eval)} [${t2Time}ms]`);
    console.log(`   [Tier 3] ${logOutcome('T3', t3Eval)} [${t3Time}ms]`);

    results.sampleBreakdown.push({
      id: sample.id,
      category: sample.category,
      expected,
      tier1: { eval: t1Eval, latencyMs: t1Time },
      tier2: { eval: t2Eval, latencyMs: t2Time, specialist: t2Specialist },
      tier3: { eval: t3Eval, latencyMs: t3Time, specialist: t3Specialist }
    });
  }

  // Terminate any active workers to release heap
  if (typeof tier1.terminateWorker === 'function') await tier1.terminateWorker();
  if (typeof tier2.terminateWorker === 'function') await tier2.terminateWorker();
  if (typeof tier3.terminateWorker === 'function') await tier3.terminateWorker();

  const posCount = manifest.samples.filter(s => s.expected.isTransaction).length;
  const negCount = manifest.samples.filter(s => !s.expected.isTransaction).length;

  results.tier1Metrics.avgLatencyMs = Math.round(t1TotalLatency / manifest.samples.length);
  results.tier2Metrics.avgLatencyMs = Math.round(t2TotalLatency / manifest.samples.length);
  results.tier3Metrics.avgLatencyMs = Math.round(t3TotalLatency / manifest.samples.length);

  results.tier1Metrics.totalAccuracyPct = parseFloat(((results.tier1Metrics.totalMatches / posCount) * 100).toFixed(1));
  results.tier1Metrics.merchantAccuracyPct = parseFloat(((results.tier1Metrics.merchantMatches / posCount) * 100).toFixed(1));
  results.tier1Metrics.dateAccuracyPct = parseFloat(((results.tier1Metrics.dateMatches / posCount) * 100).toFixed(1));
  results.tier1Metrics.negativeRejectionPct = parseFloat(((results.tier1Metrics.negativePassed / negCount) * 100).toFixed(1));

  results.tier2Metrics.totalAccuracyPct = parseFloat(((results.tier2Metrics.totalMatches / posCount) * 100).toFixed(1));
  results.tier2Metrics.merchantAccuracyPct = parseFloat(((results.tier2Metrics.merchantMatches / posCount) * 100).toFixed(1));
  results.tier2Metrics.dateAccuracyPct = parseFloat(((results.tier2Metrics.dateMatches / posCount) * 100).toFixed(1));
  results.tier2Metrics.negativeRejectionPct = parseFloat(((results.tier2Metrics.negativePassed / negCount) * 100).toFixed(1));

  results.tier3Metrics.totalAccuracyPct = parseFloat(((results.tier3Metrics.totalMatches / posCount) * 100).toFixed(1));
  results.tier3Metrics.merchantAccuracyPct = parseFloat(((results.tier3Metrics.merchantMatches / posCount) * 100).toFixed(1));
  results.tier3Metrics.dateAccuracyPct = parseFloat(((results.tier3Metrics.dateMatches / posCount) * 100).toFixed(1));
  results.tier3Metrics.negativeRejectionPct = parseFloat(((results.tier3Metrics.negativePassed / negCount) * 100).toFixed(1));

  fs.writeFileSync(RESULTS_PATH, JSON.stringify(results, null, 2), 'utf8');

  console.log('\n' + '='.repeat(80));
  console.log('📊 EMPIRICAL MODEL PERFORMANCE BENCHMARK RESULTS');
  console.log('='.repeat(80));
  console.log(`\nPositive Financial Samples: ${posCount} | Negative Controls: ${negCount}\n`);

  console.table([
    {
      'Engine Tier': 'Tier 1 Fast-Lite',
      'Total Amount Acc': `${results.tier1Metrics.totalAccuracyPct}% (${results.tier1Metrics.totalMatches}/${posCount})`,
      'Merchant Acc': `${results.tier1Metrics.merchantAccuracyPct}% (${results.tier1Metrics.merchantMatches}/${posCount})`,
      'Date Acc': `${results.tier1Metrics.dateAccuracyPct}% (${results.tier1Metrics.dateMatches}/${posCount})`,
      'Neg Rejection': `${results.tier1Metrics.negativeRejectionPct}% (${results.tier1Metrics.negativePassed}/${negCount})`,
      'Avg Latency': `${results.tier1Metrics.avgLatencyMs} ms`
    },
    {
      'Engine Tier': 'Tier 2 Vision-Pro',
      'Total Amount Acc': `${results.tier2Metrics.totalAccuracyPct}% (${results.tier2Metrics.totalMatches}/${posCount})`,
      'Merchant Acc': `${results.tier2Metrics.merchantAccuracyPct}% (${results.tier2Metrics.merchantMatches}/${posCount})`,
      'Date Acc': `${results.tier2Metrics.dateAccuracyPct}% (${results.tier2Metrics.dateMatches}/${posCount})`,
      'Neg Rejection': `${results.tier2Metrics.negativeRejectionPct}% (${results.tier2Metrics.negativePassed}/${negCount})`,
      'Avg Latency': `${results.tier2Metrics.avgLatencyMs} ms`
    },
    {
      'Engine Tier': 'Tier 3 Regional',
      'Total Amount Acc': `${results.tier3Metrics.totalAccuracyPct}% (${results.tier3Metrics.totalMatches}/${posCount})`,
      'Merchant Acc': `${results.tier3Metrics.merchantAccuracyPct}% (${results.tier3Metrics.merchantMatches}/${posCount})`,
      'Date Acc': `${results.tier3Metrics.dateAccuracyPct}% (${results.tier3Metrics.dateMatches}/${posCount})`,
      'Neg Rejection': `${results.tier3Metrics.negativeRejectionPct}% (${results.tier3Metrics.negativePassed}/${negCount})`,
      'Avg Latency': `${results.tier3Metrics.avgLatencyMs} ms`
    }
  ]);

  console.log(`\nDetailed breakdown saved to: ${RESULTS_PATH}\n`);
}

runBenchmark().catch(err => {
  console.error('Benchmark error:', err);
  process.exit(1);
});
