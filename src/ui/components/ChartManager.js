/**
 * LEDGERLY — CHART MANAGER COMPONENT
 *
 * Encapsulates Chart.js lifecycle management and HTML5 Canvas drawing:
 * - Concentric Category Breakdown Donut Chart
 * - Cash Flow Trends Bar Chart with Daily Pace Benchmark Line
 * - Multi-Member Circular Donut Ring for Household Salary Pools
 * - Headless SSR safe (gracefully no-ops in Node.js / tests)
 *
 * @module src/ui/components/ChartManager
 */

// ============================================================================
// COLOR PALETTES & THEME CONSTANTS
// ============================================================================

export const CHART_PALETTES = {
  themeHarbor: [
    '#D9822B', // Ochre
    '#10B981', // Emerald
    '#C25E3E', // Terracotta
    '#686B77', // Slate
    '#E11D48', // Rose
    '#8B5CF6', // Purple
    '#F59E0B', // Amber
    '#38BDF8' // Sky
  ],
  householdMembers: ['#D9822B', '#10B981', '#38BDF8', '#E11D48', '#C084FC']
};

// ============================================================================
// MAIN CHART MANAGER CLASS
// ============================================================================

export class ChartManager {
  /**
   * Active Chart.js instances.
   * @type {Map<string, any>}
   * @private
   */
  #instances = new Map();

  /**
   * Safely check if Chart.js is loaded in the current runtime.
   * @returns {boolean}
   */
  static isSupported() {
    return typeof Chart !== 'undefined';
  }

  // ==========================================================================
  // CHART RENDERING
  // ==========================================================================

  /**
   * Render or update Category Breakdown Donut Chart.
   * @param {HTMLCanvasElement|string} canvas - Canvas element or ID
   * @param {Record<string, number>} catTotals - Category names to outflow amounts
   * @param {Object} [options={}]
   * @returns {any|null} Chart instance
   */
  renderCategoryDoughnut(canvas, catTotals = {}, options = {}) {
    if (!ChartManager.isSupported() || typeof document === 'undefined') return null;

    const canvasEl = typeof canvas === 'string' ? document.getElementById(canvas) : canvas;
    if (!canvasEl || !('getContext' in canvasEl)) return null;

    const ctx = /** @type {HTMLCanvasElement} */ (canvasEl).getContext('2d');
    if (!ctx) return null;

    const chartKey = 'category-doughnut';
    this.destroyChart(chartKey);

    const labels = Object.keys(catTotals);
    const data = Object.values(catTotals);
    const palette = options.palette || CHART_PALETTES.themeHarbor;

    const instance = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: labels.length ? labels : ['No Outflow Recorded'],
        datasets: [
          {
            data: data.length ? data : [1],
            backgroundColor: labels.length ? palette.slice(0, labels.length) : ['#2D303C'],
            borderWidth: 2,
            borderColor: '#1A1C23'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              color: '#9598A3',
              font: { family: 'Plus Jakarta Sans', size: 11 },
              padding: 12
            }
          }
        },
        cutout: '72%'
      }
    });

    this.#instances.set(chartKey, instance);
    return instance;
  }

  /**
   * Render or update Cash Flow Trends Bar Chart with Pace Benchmark Line.
   * @param {HTMLCanvasElement|string} canvas - Canvas element or ID
   * @param {string[]} displayDates - Chronological dates (labels)
   * @param {number[]} amounts - Outflow amounts per date
   * @param {number[]} paceBenchmarkData - Benchmark line data points
   * @param {Object} [options={}]
   * @returns {any|null} Chart instance
   */
  renderCashFlowBar(canvas, displayDates = [], amounts = [], paceBenchmarkData = [], options = {}) {
    if (!ChartManager.isSupported() || typeof document === 'undefined') return null;

    const canvasEl = typeof canvas === 'string' ? document.getElementById(canvas) : canvas;
    if (!canvasEl || !('getContext' in canvasEl)) return null;

    const ctx = /** @type {HTMLCanvasElement} */ (canvasEl).getContext('2d');
    if (!ctx) return null;

    const chartKey = 'cash-flow-bar';
    this.destroyChart(chartKey);

    const currSym = options.currencySymbol || '₹';
    const cautionData =
      options.cautionBenchmarkData ||
      paceBenchmarkData.map(v => (typeof v === 'number' ? parseFloat((v * 0.8).toFixed(2)) : v));
    const hardLimitData = options.hardLimitBenchmarkData || paceBenchmarkData;

    const instance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: displayDates,
        datasets: [
          {
            label: `Daily Outflow (${currSym})`,
            data: amounts,
            backgroundColor: '#D9822B',
            borderRadius: 6,
            order: 3
          },
          {
            label: `80% Caution Ceiling (${currSym})`,
            data: cautionData,
            type: 'line',
            borderColor: '#F59E0B',
            borderWidth: 1.5,
            borderDash: [4, 4],
            pointRadius: 0,
            pointHoverRadius: 3,
            pointBackgroundColor: '#F59E0B',
            fill: false,
            order: 2
          },
          {
            label: `100% Daily Budget Limit (${currSym})`,
            data: hardLimitData,
            type: 'line',
            borderColor: '#EF4444',
            borderWidth: 2,
            borderDash: [5, 5],
            pointRadius: 3,
            pointBackgroundColor: '#EF4444',
            fill: false,
            order: 1
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true,
            position: 'top',
            labels: {
              color: '#9598A3',
              font: { family: 'Plus Jakarta Sans', size: 11 }
            }
          }
        },
        scales: {
          x: {
            ticks: { color: '#9598A3', font: { family: 'Plus Jakarta Sans', size: 11 } },
            grid: { display: false }
          },
          y: {
            ticks: { color: '#9598A3', font: { family: 'Plus Jakarta Sans', size: 11 } },
            grid: { color: '#2D303C' }
          }
        }
      }
    });

    this.#instances.set(chartKey, instance);
    return instance;
  }

  /**
   * Draw HTML5 Canvas Donut Ring for Household Multi-Member Salary Pool.
   * @param {HTMLCanvasElement|string} canvas - Canvas element or ID
   * @param {Object} params
   * @param {Array<{ amount: number|string, paidBy?: string }>} params.expenses
   * @param {number} params.budgetGoal
   */
  drawCircularSalaryRing(canvas, { expenses = [], budgetGoal = 10000 }) {
    if (typeof document === 'undefined') return;

    const canvasEl = /** @type {HTMLCanvasElement|null} */ (
      typeof canvas === 'string' ? document.getElementById(canvas) : canvas
    );
    if (!canvasEl || !('getContext' in canvasEl)) return;

    const ctx = canvasEl.getContext('2d');
    if (!ctx) return;

    const width = canvasEl.width;
    const height = canvasEl.height;
    ctx.clearRect(0, 0, width, height);

    const centerX = width / 2;
    const centerY = height / 2;
    const radius = 60;
    const lineWidth = 12;

    // Background track ring
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
    ctx.strokeStyle = '#2D303C';
    ctx.lineWidth = lineWidth;
    ctx.stroke();

    // Multi-member segmented arcs
    const colors = CHART_PALETTES.householdMembers;
    const total = expenses.reduce((a, b) => a + (parseFloat(b.amount) || 0), 0) || 1;
    let startAngle = -Math.PI / 2;

    const memberSpendMap = {};
    expenses.forEach(e => {
      const key = e.paidBy || 'Personal';
      memberSpendMap[key] = (memberSpendMap[key] || 0) + (parseFloat(e.amount) || 0);
    });

    Object.entries(memberSpendMap).forEach(([member, amount], i) => {
      const sliceAngle = (amount / Math.max(budgetGoal, total)) * 2 * Math.PI;
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, startAngle, startAngle + sliceAngle);
      ctx.strokeStyle = colors[i % colors.length];
      ctx.lineWidth = lineWidth;
      ctx.lineCap = 'round';
      ctx.stroke();
      startAngle += sliceAngle;
    });

    // Center percentage text
    ctx.font = 'bold 16px "JetBrains Mono", monospace';
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const pct = Math.min(100, Math.round((total / Math.max(1, budgetGoal)) * 100));
    ctx.fillText(`${pct}%`, centerX, centerY - 6);

    ctx.font = '10px "Plus Jakarta Sans", sans-serif';
    ctx.fillStyle = '#9598A3';
    ctx.fillText('Used', centerX, centerY + 12);
  }

  // ==========================================================================
  // CLEANUP & LIFECYCLE
  // ==========================================================================

  /**
   * Destroy a single chart instance by key.
   * @param {string} key
   */
  destroyChart(key) {
    const existing = this.#instances.get(key);
    if (existing && typeof existing.destroy === 'function') {
      try {
        existing.destroy();
      } catch (err) {
        console.warn(`Error destroying chart [${key}]:`, err);
      }
      this.#instances.delete(key);
    }
  }

  /**
   * Destroy all managed Chart.js instances.
   */
  destroyAll() {
    for (const [key, instance] of this.#instances.entries()) {
      if (instance && typeof instance.destroy === 'function') {
        try {
          instance.destroy();
        } catch (err) {
          console.warn(`Error destroying chart [${key}]:`, err);
        }
      }
    }
    this.#instances.clear();
  }
}
