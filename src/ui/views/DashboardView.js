/**
 * LEDGERLY — DASHBOARD VIEW COMPONENT
 *
 * Primary executive cockpit for financial tracking:
 * - 8-Card Executive KPI Grid (Outflow, Buffer, Daily Pace, Projection, Payday, Driver, Savings, Velocity)
 * - Dynamic Financial Health Mood Controller (safe, caution, overpace)
 * - Sidebar Dynamic Salary Pool Breakdown (Linear & Circular multi-member gauge)
 * - Express Entry Bar ("1-Box Magic") with live NLP token chips
 * - 1-Click Quick Presets Strip & Preset Modal Editor
 * - Recent Activity Ledger with contextual delegated actions
 * - Household Debt Settlement Checklist Widget
 * - Interactive What-If Spending Impact Simulator
 * - High-Performance Chart.js Visualizations via ChartManager
 *
 * @module src/ui/views/DashboardView
 */

// ============================================================================
// EXTERNAL DEPENDENCIES & HELPERS
// ============================================================================

import { escapeHTML, delegateEvent } from '../helpers/dom.js';
import { formatCurrency, formatCurrencyInt, currSym } from '../helpers/formatters.js';
import { showToast, showActionToast } from '../helpers/toast.js';
import { ChartManager } from '../components/ChartManager.js';

// ============================================================================
// SAFE ICON & MONOGRAM HELPERS
// ============================================================================

function safeIcon(name, size = 16) {
  if (typeof icon === 'function') {
    return icon(name, size);
  }
  return `<i data-icon="${escapeHTML(name)}" data-icon-size="${size}"></i>`;
}

function safeMonogram(name, size = 24) {
  if (typeof renderMonogram === 'function') {
    return renderMonogram(name, size);
  }
  const initial = (name || '?').trim().charAt(0).toUpperCase();
  return `<span class="monogram-fallback" style="width:${size}px;height:${size}px;border-radius:50%;background:#38BDF8;color:#0F172A;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">${escapeHTML(initial)}</span>`;
}

// ============================================================================
// MAIN DASHBOARD VIEW CLASS
// ============================================================================

export class DashboardView {
  /**
   * Root container element.
   * @type {HTMLElement|null}
   */
  container = null;

  /**
   * Reactive state store reference.
   * @type {import('../AppState').AppState|null}
   */
  state = null;

  /**
   * Electron IPC API bridge.
   * @type {any}
   */
  api = null;

  /**
   * Data mutation refresh hook.
   * @type {(() => Promise<void>)|null}
   */
  onDataChanged = null;

  /**
   * Tab navigation callback.
   * @type {((tab: string) => void)|null}
   */
  onNavigateTab = null;

  /**
   * Hook to open expense modal.
   * @type {((expenseId?: string) => void)|null}
   */
  onOpenExpenseModal = null;

  /**
   * Hook to open note modal.
   * @type {((expenseId: string, title: string) => void)|null}
   */
  onOpenNoteModal = null;

  /**
   * Hook to view receipt.
   * @type {((filename: string) => void)|null}
   */
  onViewReceipt = null;

  /**
   * Managed chart component instance.
   * @type {ChartManager}
   */
  chartManager = new ChartManager();

  /**
   * Cleanup functions for unmounting.
   * @type {Array<() => void>}
   * @private
   */
  #cleanups = [];

  /**
   * Construct DashboardView instance.
   * @param {Object} options
   * @param {import('../AppState').AppState} options.state - AppState instance
   * @param {any} [options.api] - electronAPI bridge
   * @param {() => Promise<void>} [options.onDataChanged] - Reload callback
   * @param {(tab: string) => void} [options.onNavigateTab] - Tab switcher hook
   * @param {(expenseId?: string) => void} [options.onOpenExpenseModal] - Modal hook
   * @param {(expenseId: string, title: string) => void} [options.onOpenNoteModal] - Note hook
   * @param {(filename: string) => void} [options.onViewReceipt] - Receipt hook
   */
  constructor(options = {}) {
    this.state = options.state || null;
    this.api = options.api || (typeof window !== 'undefined' ? window.electronAPI : null);
    this.onDataChanged = options.onDataChanged || null;
    this.onNavigateTab = options.onNavigateTab || null;
    this.onOpenExpenseModal = options.onOpenExpenseModal || null;
    this.onOpenNoteModal = options.onOpenNoteModal || null;
    this.onViewReceipt = options.onViewReceipt || null;
  }

  // ==========================================================================
  // LIFECYCLE HOOKS
  // ==========================================================================

  /**
   * Mount the dashboard view and wire up event listeners.
   * @param {HTMLElement} containerEl - View container (#view-dashboard)
   */
  mount(containerEl) {
    this.container = containerEl;
    if (!this.container || typeof document === 'undefined') return;

    this.#bindExpressEntry();
    this.#bindDelegatedActions();
    this.#bindPresetModal();
    this.#bindWhatIfSimulator();
    this.#bindDashboardFilters();
    this.#bindSalaryModal();
    this.#bindExportModal();
  }

  /**
   * Unmount the dashboard view and clean up charts and listeners.
   */
  unmount() {
    this.chartManager.destroyAll();
    this.#cleanups.forEach(cleanup => {
      try {
        cleanup();
      } catch (err) {
        console.warn('DashboardView cleanup error:', err);
      }
    });
    this.#cleanups = [];
    this.container = null;
  }

  /**
   * Render all dashboard components and charts.
   * @returns {Promise<void>}
   */
  async render() {
    if (typeof document === 'undefined') return;

    await this.renderDueBillsBanner();
    this.renderPresets();
    await this.renderMetrics();
    this.renderRecentTable();
    this.renderCharts();
    await this.renderHouseholdSplitWidget();
  }

  // ==========================================================================
  // SCOPED EXPENSES COMPUTATION
  // ==========================================================================

  /**
   * Return expenses scoped by workspace mode (solo vs household) and active profile.
   * @returns {Array<any>}
   */
  getScopedExpenses() {
    const workspaceMode = this.state?.get('workspaceMode') || 'household';
    const expenses = this.state?.get('expenses') || [];
    const allHousehold = this.state?.get('allHouseholdExpenses') || [];
    const dashboardScope = this.state?.get('dashboardScope') || 'ALL';
    const activeProfile = this.state?.get('activeProfile');

    if (workspaceMode === 'solo') {
      return expenses;
    }

    const pool = allHousehold.length > 0 ? allHousehold : expenses;

    if (!dashboardScope || dashboardScope === 'ALL') {
      return pool;
    }

    const scoped = pool.filter(e => {
      return (
        e.profileId === dashboardScope ||
        (activeProfile && activeProfile.id === dashboardScope && (e.paidBy === activeProfile.name || !e.profileId))
      );
    });

    return scoped.length > 0 ? scoped : expenses;
  }

  // ==========================================================================
  // 8-CARD EXECUTIVE KPI GRID & SALARY POOL
  // ==========================================================================

  /**
   * Compute and render the 8 executive metrics and mood indicator.
   * @returns {Promise<void>}
   */
  async renderMetrics() {
    if (typeof document === 'undefined') return;

    const scoped = this.getScopedExpenses();
    const budgetGoal = parseFloat(this.state?.get('budgetGoal')) || 30000;
    const salaryConfig = this.state?.get('salaryConfig') || {
      monthlyIncome: 60000,
      fixedBills: 20000,
      savingsGoal: 10000
    };
    const workspaceMode = this.state?.get('workspaceMode') || 'household';
    const dashboardScope = this.state?.get('dashboardScope') || 'ALL';
    const activeProfile = this.state?.get('activeProfile');

    const totalSpent = scoped.reduce((acc, curr) => acc + (parseFloat(curr.amount) || 0), 0);
    const budgetRemaining = budgetGoal - totalSpent;
    const budgetPercent = budgetGoal > 0 ? Math.min(100, Math.max(0, (totalSpent / budgetGoal) * 100)) : 0;

    // 1. Total Outflow Card
    const totalSpentEl = document.getElementById('metric-total-spent');
    if (totalSpentEl) totalSpentEl.textContent = formatCurrency(totalSpent);

    const spentSubEl = document.getElementById('metric-spent-subtitle');
    if (spentSubEl) {
      spentSubEl.textContent =
        workspaceMode === 'solo'
          ? 'Personal outflow'
          : dashboardScope === 'ALL'
            ? 'All household members'
            : 'Selected profile';
    }

    // 2. Discretionary Remaining Card
    const remainingEl = document.getElementById('metric-budget-remaining');
    if (remainingEl) {
      remainingEl.textContent = formatCurrency(budgetRemaining);
      remainingEl.style.color = budgetRemaining >= 0 ? 'var(--accent-emerald)' : 'var(--accent-rose)';
    }
    const budgetSubEl = document.getElementById('metric-budget-subtitle');
    if (budgetSubEl) {
      budgetSubEl.textContent = budgetRemaining >= 0 ? 'Safe buffer' : 'Over budget';
    }

    // 3. Daily Budget Health & Pace Math
    const now = new Date();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const currentDay = now.getDate();
    let remainingDays = Math.max(1, daysInMonth - currentDay + 1);
    let elapsedDays = Math.max(1, currentDay);
    let totalDaysSpan = daysInMonth;

    let salaryCycleMetrics = null;
    try {
      if (this.api?.getDailyBudgetMetrics) {
        salaryCycleMetrics = await this.api.getDailyBudgetMetrics();
        if (salaryCycleMetrics) {
          if (salaryCycleMetrics.remainingDays !== undefined)
            remainingDays = Math.max(1, salaryCycleMetrics.remainingDays);
          if (salaryCycleMetrics.elapsedDays !== undefined) elapsedDays = Math.max(1, salaryCycleMetrics.elapsedDays);
          if (salaryCycleMetrics.totalDaysInCycle) totalDaysSpan = salaryCycleMetrics.totalDaysInCycle;
        }
      }
    } catch {
      // Graceful fallback
    }

    const dailyAllowance = Math.max(0, budgetRemaining / remainingDays);
    const todayStr = now.toISOString().split('T')[0];
    const todaySpent = scoped.filter(e => e.date === todayStr).reduce((acc, c) => acc + (parseFloat(c.amount) || 0), 0);

    const dailyValEl = document.getElementById('daily-pace-metric-val');
    if (dailyValEl) {
      dailyValEl.innerHTML = `${formatCurrency(dailyAllowance)}<span style="font-size: 13px; font-weight: 500; color: var(--text-muted);">/day</span>`;
    }

    // Rollover Calculation Tooltip
    const targetDaily = budgetGoal / totalDaysSpan;
    const allowedToDate = targetDaily * elapsedDays;
    const rollover = allowedToDate - totalSpent;

    const tooltipBody = document.getElementById('rollover-tooltip-body');
    if (tooltipBody) {
      tooltipBody.innerHTML = `Day ${elapsedDays} of ${totalDaysSpan}: Allowed spend to date was <strong>${formatCurrencyInt(allowedToDate)}</strong>. You have spent <strong>${formatCurrencyInt(totalSpent)}</strong>.<br><br>${rollover >= 0 ? `You have <strong style="color: #10B981;">+${formatCurrencyInt(rollover)} rolled over</strong> to spend safely across remaining ${remainingDays} days.` : `You are <strong style="color: #FB7185;">-${formatCurrencyInt(Math.abs(rollover))} over pace</strong>.`}`;
    }

    const paceBadge = document.getElementById('daily-pace-badge');
    const paceSubtitle = document.getElementById('daily-pace-metric-subtitle');
    if (paceBadge) {
      paceBadge.className = 'pace-badge';
      if (todaySpent <= dailyAllowance) {
        paceBadge.textContent = 'On Track';
        paceBadge.classList.add('badge-emerald');
        if (paceSubtitle)
          paceSubtitle.innerHTML = '<span class="pace-badge badge-emerald" id="daily-pace-badge">On Track</span>';
      } else if (todaySpent <= dailyAllowance * 1.3) {
        paceBadge.textContent = 'Caution';
        paceBadge.classList.add('badge-amber');
        if (paceSubtitle)
          paceSubtitle.innerHTML = '<span class="pace-badge badge-amber" id="daily-pace-badge">Caution</span>';
      } else {
        paceBadge.textContent = 'Over Pace';
        paceBadge.classList.add('badge-rose');
        if (paceSubtitle)
          paceSubtitle.innerHTML = '<span class="pace-badge badge-rose" id="daily-pace-badge">Over Pace</span>';
      }
    }

    // 4. Projected Month-End Forecast
    const dailyAvgSpent = totalSpent / elapsedDays;
    const projectedRemainingSpend = dailyAvgSpent * remainingDays;
    const totalProjectedSpend = totalSpent + projectedRemainingSpend;
    const projectedBalance = budgetGoal - totalProjectedSpend;

    const projValEl = document.getElementById('metric-projected-val');
    const projBadgeEl = document.getElementById('metric-projected-badge');

    if (projValEl) {
      if (projectedBalance >= 0) {
        projValEl.textContent = `+${formatCurrency(projectedBalance)}`;
        projValEl.style.color = 'var(--accent-emerald)';
        if (projBadgeEl) {
          projBadgeEl.className = 'pace-badge badge-emerald';
          projBadgeEl.textContent = 'Surplus';
        }
      } else {
        projValEl.textContent = `-${formatCurrency(Math.abs(projectedBalance))}`;
        projValEl.style.color = 'var(--accent-rose)';
        if (projBadgeEl) {
          projBadgeEl.className = 'pace-badge badge-rose';
          projBadgeEl.textContent = 'Deficit';
        }
      }
    }

    // 5. Days Until Payday Countdown
    const paydayCountEl = document.getElementById('metric-payday-countdown-val');
    const paydayProgressEl = document.getElementById('metric-payday-progress-bar');
    const paydayCycleLabel = document.getElementById('metric-payday-cycle-label');

    if (paydayCountEl) {
      paydayCountEl.textContent = `${remainingDays} Day${remainingDays === 1 ? '' : 's'} Left`;
    }
    if (paydayProgressEl) {
      const cycleProgress = Math.min(100, Math.max(0, Math.round((elapsedDays / totalDaysSpan) * 100)));
      paydayProgressEl.style.width = `${cycleProgress}%`;
    }
    if (paydayCycleLabel) {
      const nextPaydayStr = salaryCycleMetrics?.nextPaydayDate
        ? new Date(salaryCycleMetrics.nextPaydayDate).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
        : `${remainingDays}d left`;
      paydayCycleLabel.textContent = `Day ${elapsedDays}/${totalDaysSpan} • Next: ${nextPaydayStr}`;
    }

    // 6. Primary Expense Driver (Top Category)
    const catTotals = {};
    scoped.forEach(e => {
      const c = e.category || 'Miscellaneous';
      catTotals[c] = (catTotals[c] || 0) + (parseFloat(e.amount) || 0);
    });

    let topCat = null;
    let topCatAmt = 0;
    for (const [cat, amt] of Object.entries(catTotals)) {
      if (amt > topCatAmt) {
        topCat = cat;
        topCatAmt = amt;
      }
    }

    const topCatNameEl = document.getElementById('metric-top-category-name');
    const topCatSubEl = document.getElementById('metric-top-category-subtitle');

    if (topCatNameEl) {
      topCatNameEl.textContent = topCat || 'No Outflow';
      topCatNameEl.title = topCat || 'No expenses logged';
    }
    if (topCatSubEl) {
      if (topCat && totalSpent > 0) {
        const pct = Math.round((topCatAmt / totalSpent) * 100);
        topCatSubEl.innerHTML = `<span style="font-weight: 700; color: var(--text-main);">${formatCurrency(topCatAmt)}</span> (${pct}%)`;
      } else {
        topCatSubEl.textContent = '0% of outflow';
      }
    }

    // 7. Savings Protection Meter
    const savingsGoal = parseFloat(salaryConfig.savingsGoal) || 0;
    const savingsValEl = document.getElementById('metric-savings-meter-val');
    const savingsSubEl = document.getElementById('metric-savings-meter-subtitle');

    if (savingsValEl) {
      if (totalSpent <= budgetGoal || savingsGoal <= 0) {
        savingsValEl.textContent = `${formatCurrency(savingsGoal)} Intact`;
        savingsValEl.style.color = 'var(--accent-emerald)';
        if (savingsSubEl) savingsSubEl.innerHTML = '<span class="pace-badge badge-emerald">100% Safe</span>';
      } else {
        const overspend = totalSpent - budgetGoal;
        const remainingSavings = Math.max(0, savingsGoal - overspend);
        const pctRemaining = savingsGoal > 0 ? Math.round((remainingSavings / savingsGoal) * 100) : 0;
        savingsValEl.textContent = `${formatCurrency(remainingSavings)} Left`;
        savingsValEl.style.color = remainingSavings > 0 ? 'var(--accent-amber)' : 'var(--accent-rose)';
        const badgeCls = remainingSavings > 0 ? 'badge-amber' : 'badge-rose';
        if (savingsSubEl) {
          savingsSubEl.innerHTML = `<span class="pace-badge ${badgeCls}">${pctRemaining}% Left</span>`;
        }
      }
    }

    // 8. Card 8: Contextual (Household Balance vs Solo Velocity)
    const contextTitle = document.getElementById('metric-contextual-title');
    const contextVal = document.getElementById('metric-contextual-val');
    const contextSub = document.getElementById('metric-contextual-subtitle');
    const contextIcon = document.getElementById('metric-contextual-icon');
    const contextIconBox = document.getElementById('metric-contextual-icon-box');

    if (workspaceMode === 'solo') {
      if (contextTitle) contextTitle.textContent = 'Solo Velocity';
      if (contextIconBox) contextIconBox.className = 'metric-icon-box icon-purple';
      if (contextIcon) contextIcon.setAttribute('data-icon', 'zap');
      if (contextVal)
        contextVal.innerHTML = `<span style="font-size: 20px; font-weight: 800;">${scoped.length} Logs</span>`;
      if (contextSub) contextSub.textContent = 'Personal mode';
    } else {
      if (contextTitle) contextTitle.textContent = 'Household Balance';
      if (contextIconBox) contextIconBox.className = 'metric-icon-box icon-blue';
      if (contextIcon) contextIcon.setAttribute('data-icon', 'scale');

      try {
        const settlement = await this.api?.getHouseholdSettlement();
        const activeName = activeProfile ? activeProfile.name : 'Self';
        const userNet = settlement?.balances ? settlement.balances[activeName] || 0 : 0;

        if (contextVal) {
          if (userNet > 0.01) {
            contextVal.innerHTML = `<span style="color: #10B981; font-weight: 800; font-size: 19px;">OWED ${formatCurrency(userNet)}</span>`;
            if (contextSub) contextSub.textContent = 'To receive';
          } else if (userNet < -0.01) {
            contextVal.innerHTML = `<span style="color: #FB7185; font-weight: 800; font-size: 19px;">YOU OWE ${formatCurrency(Math.abs(userNet))}</span>`;
            if (contextSub) contextSub.textContent = 'To pay';
          } else {
            contextVal.innerHTML = '<span style="color: #38BDF8; font-weight: 800; font-size: 19px;">BALANCED</span>';
            if (contextSub) contextSub.textContent = 'All settled';
          }
        }
      } catch {
        if (contextVal) contextVal.textContent = 'Balanced';
        if (contextSub) contextSub.textContent = 'All settled';
      }
    }

    // 9. Sidebar Dynamic Budget Breakdown
    this.renderSidebarBudget(totalSpent, budgetPercent);

    // 10. Financial Health Mood State
    document.body.classList.remove('mood-safe', 'mood-caution', 'mood-overpace');
    const brandIconEl = document.getElementById('dashboard-brand-icon');

    if (budgetRemaining < 0 || (rollover < -100 && budgetPercent > 90)) {
      document.body.classList.add('mood-overpace');
      if (brandIconEl) brandIconEl.innerHTML = safeIcon('alert-triangle', 20);
    } else if (budgetPercent > 75 || rollover < 0) {
      document.body.classList.add('mood-caution');
      if (brandIconEl) brandIconEl.innerHTML = safeIcon('flame', 20);
    } else {
      document.body.classList.add('mood-safe');
      if (brandIconEl) brandIconEl.innerHTML = safeIcon('shield-check', 20);
    }
  }

  /**
   * Render sidebar salary pool progress and breakdown bars.
   * @param {number} totalSpent
   * @param {number} budgetPercent
   */
  renderSidebarBudget(totalSpent, budgetPercent) {
    if (typeof document === 'undefined') return;

    const linearWrap = document.getElementById('sidebar-linear-budget-wrap');
    const circularWrap = document.getElementById('sidebar-circular-budget-wrap');
    const amountEl = document.getElementById('sidebar-budget-amount');
    const miniPercentEl = document.getElementById('sidebar-mini-budget-percent');
    const statusCopyEl = document.getElementById('sidebar-budget-status-copy');
    const budgetGoal = parseFloat(this.state?.get('budgetGoal')) || 30000;
    const dashboardScope = this.state?.get('dashboardScope') || 'ALL';
    const profiles = this.state?.get('profiles') || [];

    if (miniPercentEl) miniPercentEl.textContent = `${Math.round(budgetPercent)}%`;
    if (amountEl) amountEl.textContent = formatCurrency(budgetGoal);

    let thresholdColor = '#10B981';
    let thresholdText = 'On Track & Safe';
    if (budgetPercent > 85) {
      thresholdColor = '#E11D48';
      thresholdText = 'Over Pace • Slow Down';
    } else if (budgetPercent > 60) {
      thresholdColor = '#D9822B';
      thresholdText = 'Moderate Pace';
    }

    if (statusCopyEl) {
      statusCopyEl.textContent = thresholdText;
      statusCopyEl.style.color = thresholdColor;
    }

    if (dashboardScope === 'ALL' && profiles.length > 1) {
      linearWrap?.classList.add('hidden');
      circularWrap?.classList.remove('hidden');
      this.chartManager.drawCircularSalaryRing('salaryRingCanvas', {
        expenses: this.state?.get('expenses') || [],
        budgetGoal
      });
    } else {
      circularWrap?.classList.add('hidden');
      linearWrap?.classList.remove('hidden');

      const barEl = document.getElementById('sidebar-budget-bar');
      if (barEl) {
        barEl.style.width = `${budgetPercent}%`;
        barEl.style.background = thresholdColor;
      }
      const statusEl = document.getElementById('sidebar-budget-status');
      if (statusEl) {
        statusEl.textContent = `${formatCurrency(totalSpent)} spent of ${formatCurrency(budgetGoal)}`;
      }
    }

    // 3-Segment Stacked Salary Breakdown in Sidebar
    const s = this.state?.get('salaryConfig') || { monthlyIncome: 60000, fixedBills: 20000, savingsGoal: 10000 };
    const income = parseFloat(s.monthlyIncome) || 1;
    const fixed = parseFloat(s.fixedBills) || 0;
    const savings = parseFloat(s.savingsGoal) || 0;
    const disc = Math.max(0, income - fixed - savings);

    const fixedPct = Math.min(100, Math.max(0, (fixed / income) * 100));
    const savingsPct = Math.min(100, Math.max(0, (savings / income) * 100));
    const discPct = Math.min(100, Math.max(0, (disc / income) * 100));

    const sideFixed = document.getElementById('sidebar-seg-fixed');
    const sideSavings = document.getElementById('sidebar-seg-savings');
    const sideDisc = document.getElementById('sidebar-seg-disc');

    if (sideFixed) {
      sideFixed.style.width = `${fixedPct}%`;
      sideFixed.title = `Fixed Bills: ${currSym()}${fixed.toLocaleString('en-IN')}`;
    }
    if (sideSavings) {
      sideSavings.style.width = `${savingsPct}%`;
      sideSavings.title = `Savings Target: ${currSym()}${savings.toLocaleString('en-IN')}`;
    }
    if (sideDisc) {
      sideDisc.style.width = `${discPct}%`;
      sideDisc.title = `Discretionary Budget: ${currSym()}${disc.toLocaleString('en-IN')}`;
    }

    const sideFixedPctEl = document.getElementById('sidebar-fixed-pct');
    const sideSavingsPctEl = document.getElementById('sidebar-savings-pct');
    const sideDiscPctEl = document.getElementById('sidebar-disc-pct');

    if (sideFixedPctEl) sideFixedPctEl.textContent = `${Math.round(fixedPct)}%`;
    if (sideSavingsPctEl) sideSavingsPctEl.textContent = `${Math.round(savingsPct)}%`;
    if (sideDiscPctEl) sideDiscPctEl.textContent = `${Math.round(discPct)}%`;
  }

  // ==========================================================================
  // QUICK PRESETS BAR
  // ==========================================================================

  /**
   * Render horizontal strip of 1-click Quick Preset chips.
   */
  renderPresets() {
    if (typeof document === 'undefined') return;

    const container = document.getElementById('preset-list');
    if (!container) return;

    const presets = this.state?.get('presets') || [];

    if (presets.length === 0) {
      container.innerHTML = `
        <div style="font-size: 12.5px; color: var(--text-muted); display: inline-flex; align-items: center; gap: 8px;">
          No quick presets created. Click "+ Add Preset" to pin frequent coffee, lunch, or groceries.
        </div>
      `;
      return;
    }

    container.innerHTML = presets
      .map(
        (p, idx) => `
      <div class="preset-chip" data-action="log-preset" data-id="${escapeHTML(p.id)}" title="Click to log ${formatCurrency(p.amount)} for ${escapeHTML(p.title)} (Right-click to edit)">
        <span class="preset-chip-icon">${safeIcon(p.icon || 'tag', 14)}</span>
        <span class="preset-chip-title">${escapeHTML(p.title)}</span>
        <span class="preset-chip-amount">${formatCurrency(p.amount)}</span>
        ${idx < 9 ? `<span class="preset-hotkey-badge">Alt+${idx + 1}</span>` : ''}
        <span class="preset-chip-edit-btn" data-action="edit-preset" data-id="${escapeHTML(p.id)}" title="Edit Preset">
          ${safeIcon('pencil', 12)}
        </span>
      </div>
    `
      )
      .join('');
  }

  /**
   * Log an expense immediately using preset configuration.
   * @param {string} presetId
   */
  async logPresetExpense(presetId) {
    const presets = this.state?.get('presets') || [];
    const preset = presets.find(p => p.id === presetId);
    if (!preset) {
      showToast('⚠️ Preset chip not found');
      return;
    }

    const activeProfile = this.state?.get('activeProfile');
    const payload = {
      title: preset.title,
      amount: preset.amount,
      category: preset.category,
      paymentMethod: preset.paymentMethod || 'UPI / GPay',
      date: new Date().toISOString().split('T')[0],
      description: `Quick preset transaction (${preset.title})`,
      paidBy: activeProfile ? activeProfile.name : 'Self',
      isHouseholdExpense: false
    };

    await this.api.addExpense(payload);
    showActionToast({
      icon: preset.icon || 'tag',
      title: `Logged "${preset.title}"`,
      amount: preset.amount,
      category: preset.category,
      subtext: `${preset.category} • One-Click Preset`
    });

    if (this.onDataChanged) await this.onDataChanged();
    await this.render();
  }

  // ==========================================================================
  // PROACTIVE RECURRING BILLS DUE BANNER (Phase 7)
  // ==========================================================================

  /**
   * Check and render proactive notification banner for pending recurring bills.
   * @returns {Promise<void>}
   */
  async renderDueBillsBanner() {
    if (typeof document === 'undefined') return;
    const banner = document.getElementById('dashboard-due-bills-banner');
    if (!banner) return;

    if (!this.api?.checkPendingBills) {
      banner.classList.add('hidden');
      banner.innerHTML = '';
      return;
    }

    try {
      const dueBills = await this.api.checkPendingBills();
      if (!Array.isArray(dueBills) || dueBills.length === 0) {
        banner.classList.add('hidden');
        banner.innerHTML = '';
        return;
      }

      const totalDue = dueBills.reduce((acc, b) => acc + (parseFloat(b.amount) || 0), 0);
      const billsListStr = dueBills.map(b => `${escapeHTML(b.title)} (${formatCurrency(b.amount || 0)})`).join(', ');

      banner.innerHTML = `
        <div class="due-bills-alert-box" style="display: flex; align-items: center; justify-content: space-between; padding: 14px 18px; margin-bottom: 20px; border-radius: var(--radius-md, 12px); border: 1px solid rgba(245, 158, 11, 0.35); background: linear-gradient(135deg, rgba(245, 158, 11, 0.12) 0%, rgba(245, 158, 11, 0.04) 100%); backdrop-filter: blur(8px); gap: 16px;">
          <div style="display: flex; align-items: center; gap: 12px;">
            <div style="padding: 8px; border-radius: 8px; background: rgba(245, 158, 11, 0.2); color: #F59E0B; display: flex; align-items: center; justify-content: center;">
              ${safeIcon('calendar', 20)}
            </div>
            <div>
              <h4 style="margin: 0; font-size: 13.5px; font-weight: 700; color: #FFFFFF;">
                ${dueBills.length} Recurring Bill${dueBills.length > 1 ? 's' : ''} Due (Total: ${formatCurrency(totalDue)})
              </h4>
              <p style="margin: 2px 0 0 0; font-size: 12px; color: var(--text-muted, #94A3B8);">
                ${billsListStr}
              </p>
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
            ${dueBills
              .map(
                b => `
              <button type="button" class="btn btn-primary btn-sm" data-action="pay-due-bill" data-bill-id="${escapeHTML(b.id)}" style="font-size: 11.5px; padding: 6px 12px; background: #F59E0B; border-color: #F59E0B; color: #0F172A; font-weight: 600; display: inline-flex; align-items: center; gap: 5px;">
                ${safeIcon('check', 13)} Pay ${escapeHTML(b.title)}
              </button>
            `
              )
              .join('')}
            <button type="button" class="btn btn-secondary btn-sm" data-action="dismiss-due-bills" title="Dismiss banner" style="padding: 6px 10px; font-size: 11.5px;">
              ${safeIcon('x', 14)}
            </button>
          </div>
        </div>
      `;
      banner.classList.remove('hidden');
    } catch (err) {
      console.warn('[DashboardView] Failed to check pending bills:', err);
      banner.classList.add('hidden');
      banner.innerHTML = '';
    }
  }

  // ==========================================================================
  // RECENT TRANSACTIONS TABLE
  // ==========================================================================

  /**
   * Render Recent Transactions mini table on dashboard.
   */
  renderRecentTable() {
    if (typeof document === 'undefined') return;

    const tbody = document.getElementById('expense-table-body');
    if (!tbody) return;

    const scoped = this.getScopedExpenses();
    const filterSearch = this.state?.get('filterSearch') || '';
    const filterCategory = this.state?.get('filterCategory') || 'ALL';
    const filterSort = this.state?.get('filterSort') || 'DATE_DESC';
    const notes = this.state?.get('notes') || [];

    let filtered = scoped.filter(item => {
      const matchesSearch =
        !filterSearch ||
        item.title.toLowerCase().includes(filterSearch.toLowerCase()) ||
        (item.description && item.description.toLowerCase().includes(filterSearch.toLowerCase()));

      const matchesCategory = filterCategory === 'ALL' || item.category === filterCategory;
      return matchesSearch && matchesCategory;
    });

    // Sort items
    filtered.sort((a, b) => {
      if (filterSort === 'DATE_DESC') return new Date(b.date).getTime() - new Date(a.date).getTime();
      if (filterSort === 'DATE_ASC') return new Date(a.date).getTime() - new Date(b.date).getTime();
      if (filterSort === 'AMOUNT_DESC') return (parseFloat(b.amount) || 0) - (parseFloat(a.amount) || 0);
      if (filterSort === 'AMOUNT_ASC') return (parseFloat(a.amount) || 0) - (parseFloat(b.amount) || 0);
      return 0;
    });

    if (filtered.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" class="empty-state">
            No transactions found matching your current scope and filters.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = filtered
      .slice(0, 50)
      .map(item => {
        const expenseNotes = notes.filter(n => n.relation === 'transaction' && n.relationId === item.id);
        const hasNotes = expenseNotes.length > 0;
        const isShared = Boolean(item.isHouseholdExpense);

        return `
        <tr>
          <td style="font-family: var(--font-mono); font-size: 12px; color: var(--text-muted);">${escapeHTML(item.date)}</td>
          <td>
            <strong style="color: var(--text-main); font-size: 13.5px;">${escapeHTML(item.title)}</strong>
            ${item.description ? `<div style="font-size: 11.5px; color: var(--text-dim); margin-top: 2px;">${escapeHTML(item.description)}</div>` : ''}
          </td>
          <td><span class="category-pill">${escapeHTML(item.category)}</span></td>
          <td>
            <div style="display: flex; align-items: center; gap: 6px;">
              <span style="font-size: 12px; color: var(--text-main); font-weight: 700;">${escapeHTML(item.paidBy || 'Personal')}</span>
              ${isShared ? `<span style="font-size: 10px; background: rgba(217, 130, 43, 0.15); color: var(--accent-primary); padding: 2px 6px; border-radius: 4px; font-weight: 700; display: inline-flex; align-items: center; gap: 4px;">${safeIcon('users', 11)} Shared</span>` : '<span style="font-size: 10px; background: #1E212A; color: var(--text-muted); padding: 2px 6px; border-radius: 4px;">Personal</span>'}
            </div>
          </td>
          <td class="amount-text">-${formatCurrency(parseFloat(item.amount) || 0)}</td>
          <td>
            ${
              item.receiptFilename
                ? `
              <button type="button" class="action-btn" data-action="view-receipt" data-filename="${escapeHTML(item.receiptFilename)}" title="View Receipt Image">
                ${safeIcon('camera', 13)} Receipt
              </button>
            `
                : '<span style="color:var(--text-dim); font-size:11px;">—</span>'
            }
          </td>
          <td class="actions-cell">
            <button type="button" class="action-btn note-indicator-btn ${hasNotes ? 'has-notes' : ''}"
                    data-action="open-note"
                    data-id="${escapeHTML(item.id)}"
                    data-title="${escapeHTML(item.title)}"
                    title="${hasNotes ? `${expenseNotes.length} Note(s) linked` : 'Attach contextual note'}">
              ${safeIcon('file-text', 13)}
              ${hasNotes ? `<span style="font-size:9px; font-weight:800; margin-left:2px;">${expenseNotes.length}</span>` : ''}
            </button>
            <button type="button" class="action-btn edit-btn" data-action="edit-expense" data-id="${escapeHTML(item.id)}" title="Edit Expense">
              ${safeIcon('pencil', 13)}
            </button>
            <button type="button" class="action-btn delete-btn" data-action="delete-expense" data-id="${escapeHTML(item.id)}" title="Delete Expense">
              ${safeIcon('trash-2', 13)}
            </button>
          </td>
        </tr>
      `;
      })
      .join('');
  }

  // ==========================================================================
  // HOUSEHOLD SPLIT DASHBOARD WIDGET
  // ==========================================================================

  /**
   * Render household split pending balances widget on dashboard.
   * @returns {Promise<void>}
   */
  async renderHouseholdSplitWidget() {
    if (typeof document === 'undefined') return;

    const container = document.getElementById('split-pending-list');
    const settleBtn = /** @type {HTMLButtonElement|null} */ (document.getElementById('btn-settle-selected-splits'));
    if (!container) return;

    let settlement = null;
    try {
      settlement = await this.api?.getHouseholdSettlement();
    } catch {
      // Ignore
    }

    if (!settlement || !settlement.settlements || settlement.settlements.length === 0) {
      container.innerHTML = `
        <div style="background: #14151B; padding: 14px; border-radius: 10px; text-align: center; color: var(--text-muted); font-size: 12.5px; border: 1px dashed #2D303C;">
          <div style="display: inline-flex; align-items: center; gap: 8px;">${safeIcon('check-circle', 16)} All shared household expenses are fully settled!</div>
        </div>
      `;
      if (settleBtn) settleBtn.disabled = true;
      return;
    }

    const selectedSplits = this.state?.get('selectedSplits') || new Set();

    container.innerHTML = settlement.settlements
      .map((s, idx) => {
        const isChecked = selectedSplits.has(idx);
        return `
        <div class="split-pending-item">
          <div class="split-pending-info">
            <span class="split-pending-avatar">${safeMonogram(s.from, 24)}</span>
            <div class="split-pending-desc">
              <span class="split-pending-title">${escapeHTML(s.from)} ➔ ${escapeHTML(s.to)}</span>
              <span class="split-pending-debt">${formatCurrency(s.amount)} pending</span>
            </div>
          </div>
          <input type="checkbox" class="split-pending-checkbox" data-index="${idx}" ${isChecked ? 'checked' : ''}>
        </div>
      `;
      })
      .join('');

    if (settleBtn) {
      settleBtn.disabled = selectedSplits.size === 0;
      settleBtn.innerHTML = `${safeIcon('check', 13)} Settle Selected (${selectedSplits.size})`;
    }
  }

  /**
   * Settle selected splits from the checklist.
   */
  async handleSettleSelectedSplits() {
    const selectedSplits = this.state?.get('selectedSplits') || new Set();
    if (selectedSplits.size === 0) return;

    showToast(`Settled ${selectedSplits.size} shared balance(s)!`);
    selectedSplits.clear();
    if (this.state) this.state.set('selectedSplits', selectedSplits);
    await this.renderHouseholdSplitWidget();
  }

  // ==========================================================================
  // CHARTS RENDERING
  // ==========================================================================

  /**
   * Render Category Donut and Cash Flow Bar charts.
   */
  renderCharts() {
    if (typeof document === 'undefined') return;

    const scoped = this.getScopedExpenses();

    // 1. Concentric Category Breakdown Donut Chart
    const catTotals = {};
    scoped.forEach(e => {
      const c = e.category || 'Miscellaneous';
      catTotals[c] = (catTotals[c] || 0) + (parseFloat(e.amount) || 0);
    });
    this.chartManager.renderCategoryDoughnut('doughnutChart', catTotals);

    // 2. Cash Flow Trends Bar Chart
    const dateTotals = {};
    const sortedExp = [...scoped].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    sortedExp.forEach(e => {
      dateTotals[e.date] = (dateTotals[e.date] || 0) + (parseFloat(e.amount) || 0);
    });

    const dates = Object.keys(dateTotals).slice(-7);
    const displayDates = dates.length ? dates : [new Date().toISOString().split('T')[0]];
    const amounts = displayDates.map(d => dateTotals[d] || 0);

    // Calculate Daily Pace Benchmark Line
    const budgetGoal = parseFloat(this.state?.get('budgetGoal')) || 30000;
    const totalSpent = scoped.reduce((a, c) => a + (parseFloat(c.amount) || 0), 0);
    const budgetRemaining = Math.max(0, budgetGoal - totalSpent);
    const now = new Date();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const remainingDays = Math.max(1, daysInMonth - now.getDate() + 1);
    const dailyTargetVal = budgetRemaining / remainingDays;
    const paceBenchmarkData = displayDates.map(() => dailyTargetVal);

    this.chartManager.renderCashFlowBar('barChart', displayDates, amounts, paceBenchmarkData, {
      currencySymbol: currSym()
    });
  }

  // ==========================================================================
  // PRESET MODAL CONTROLLER
  // ==========================================================================

  /**
   * Open Add Preset Modal.
   */
  openAddPresetModal() {
    if (typeof document === 'undefined') return;

    const heading = document.getElementById('preset-modal-heading');
    if (heading) heading.textContent = 'Create Quick Preset';

    const idInput = /** @type {HTMLInputElement} */ (document.getElementById('form-preset-id'));
    const iconInput = /** @type {HTMLInputElement} */ (document.getElementById('preset-form-icon'));
    const titleInput = /** @type {HTMLInputElement} */ (document.getElementById('preset-form-title'));
    const amountInput = /** @type {HTMLInputElement} */ (document.getElementById('preset-form-amount'));
    const deleteBtn = document.getElementById('preset-delete-btn');

    if (idInput) idInput.value = '';
    if (iconInput) iconInput.value = 'coffee';
    if (titleInput) titleInput.value = '';
    if (amountInput) amountInput.value = '';
    if (deleteBtn) deleteBtn.classList.add('hidden');

    document.getElementById('preset-modal')?.classList.add('active');
  }

  /**
   * Open Edit Preset Modal.
   * @param {string} id
   */
  openEditPresetModal(id) {
    if (typeof document === 'undefined') return;

    const presets = this.state?.get('presets') || [];
    const preset = presets.find(p => p.id === id);
    if (!preset) {
      showToast('⚠️ Preset chip not found');
      return;
    }

    const heading = document.getElementById('preset-modal-heading');
    if (heading) heading.textContent = 'Edit Quick Preset';

    const idInput = /** @type {HTMLInputElement} */ (document.getElementById('form-preset-id'));
    const iconInput = /** @type {HTMLInputElement} */ (document.getElementById('preset-form-icon'));
    const titleInput = /** @type {HTMLInputElement} */ (document.getElementById('preset-form-title'));
    const amountInput = /** @type {HTMLInputElement} */ (document.getElementById('preset-form-amount'));
    const catInput = /** @type {HTMLSelectElement} */ (document.getElementById('preset-form-category'));
    const payInput = /** @type {HTMLSelectElement} */ (document.getElementById('preset-form-payment'));
    const deleteBtn = document.getElementById('preset-delete-btn');

    if (idInput) idInput.value = preset.id;
    if (iconInput) iconInput.value = preset.icon || 'tag';
    if (titleInput) titleInput.value = preset.title;
    if (amountInput) amountInput.value = preset.amount;
    if (catInput) catInput.value = preset.category;
    if (payInput) payInput.value = preset.paymentMethod || 'UPI / GPay';
    if (deleteBtn) deleteBtn.classList.remove('hidden');

    document.getElementById('preset-modal')?.classList.add('active');
  }

  /**
   * Close Preset Modal.
   */
  closePresetModal() {
    if (typeof document === 'undefined') return;
    document.getElementById('preset-modal')?.classList.remove('active');
  }

  // ==========================================================================
  // WHAT-IF SPENDING IMPACT SIMULATOR
  // ==========================================================================

  /**
   * Initialize collapsible What-If simulator card state.
   */
  initWhatIfToggle() {
    const toggleBtn = document.getElementById('btn-toggle-what-if');
    const card = document.getElementById('what-if-simulator-card');
    const bar = document.getElementById('what-if-toggle-bar');
    if (!toggleBtn || !card) return;

    const isCollapsed =
      typeof localStorage !== 'undefined' && localStorage.getItem('ledgerly-what-if-collapsed') !== 'false';
    card.classList.toggle('collapsed', isCollapsed);
    bar?.classList.toggle('expanded', !isCollapsed);

    const toggleHandler = () => {
      const currentlyCollapsed = card.classList.contains('collapsed');
      card.classList.toggle('collapsed', !currentlyCollapsed);
      bar?.classList.toggle('expanded', currentlyCollapsed);
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('ledgerly-what-if-collapsed', currentlyCollapsed ? 'false' : 'true');
      }
      if (currentlyCollapsed) {
        this.updateWhatIfSimulation();
      }
    };

    toggleBtn.addEventListener('click', toggleHandler);
    this.#cleanups.push(() => toggleBtn.removeEventListener('click', toggleHandler));
  }

  /**
   * Execute What-If simulation with specified amount.
   * @param {number} [extraAmount=null]
   */
  async updateWhatIfSimulation(extraAmount = null) {
    if (typeof document === 'undefined') return;

    const slider = /** @type {HTMLInputElement|null} */ (document.getElementById('what-if-range-slider'));
    const displayEl = document.getElementById('what-if-slider-display');
    const currPaceEl = document.getElementById('what-if-curr-pace');
    const projPaceEl = document.getElementById('what-if-proj-pace');
    const dailyDropEl = document.getElementById('what-if-daily-drop');
    const badgeEl = document.getElementById('what-if-risk-badge');
    const msgEl = document.getElementById('what-if-message-bar');

    if (!slider) return;

    const testAmt = extraAmount !== null ? extraAmount : parseFloat(slider.value) || 500;
    if (displayEl) displayEl.textContent = `${currSym()}${testAmt.toLocaleString('en-IN')}`;

    if (this.api?.simulateWhatIf) {
      const sim = await this.api.simulateWhatIf(testAmt);
      if (sim) {
        if (currPaceEl) currPaceEl.textContent = `${formatCurrencyInt(sim.currentPace)}/day`;
        if (projPaceEl) projPaceEl.textContent = `${formatCurrencyInt(sim.projectedPace)}/day`;
        if (dailyDropEl) dailyDropEl.textContent = `-${formatCurrencyInt(sim.dailyDrop)}/day`;

        if (badgeEl) {
          badgeEl.textContent = sim.statusHeadline;
          badgeEl.className = 'what-if-badge';
          if (sim.riskLevel === 'SAFE') badgeEl.classList.add('badge-emerald');
          else if (sim.riskLevel === 'CAUTION') badgeEl.classList.add('badge-amber');
          else badgeEl.classList.add('badge-rose');
        }

        if (msgEl) {
          msgEl.textContent = sim.statusMessage;
        }
      }
    }
  }

  // ==========================================================================
  // EVENT BINDINGS (ZERO INLINE ONCLICK)
  // ==========================================================================

  /**
   * Bind Express Entry Bar input and form submission.
   * @private
   */
  #bindExpressEntry() {
    const nlpInput = /** @type {HTMLInputElement|null} */ (document.getElementById('express-nlp-input'));
    const pillAmt = document.getElementById('pill-amt');
    const pillTitle = document.getElementById('pill-title');
    const pillCat = document.getElementById('pill-cat');
    const pillSplit = document.getElementById('pill-split');
    const pillPay = document.getElementById('pill-pay');
    const pillDate = document.getElementById('pill-date');
    let nlpTimer = null;

    if (nlpInput) {
      const inputHandler = () => {
        clearTimeout(nlpTimer);
        nlpTimer = setTimeout(async () => {
          const text = nlpInput.value.trim();
          if (!text) {
            if (pillAmt) pillAmt.textContent = `${currSym()}0.00`;
            if (pillTitle) pillTitle.textContent = 'Title';
            if (pillCat) pillCat.textContent = 'Food & Dining';
            if (pillSplit) pillSplit.textContent = 'Personal';
            if (pillPay) pillPay.textContent = 'UPI';
            if (pillDate) pillDate.textContent = 'Today';
            return;
          }

          if (this.api?.nlpParse) {
            const members = this.state?.get('householdMembers') || [];
            const parsed = await this.api.nlpParse(text, members);
            if (parsed?.tokens) {
              if (pillAmt) pillAmt.textContent = parsed.tokens.amountStr || `${currSym()}0.00`;
              if (pillTitle) pillTitle.textContent = parsed.tokens.titleStr || 'Title';
              if (pillCat) pillCat.textContent = parsed.tokens.categoryStr || 'Food & Dining';
              if (pillSplit) pillSplit.textContent = parsed.tokens.splitStr || 'Personal';
              if (pillPay) pillPay.textContent = parsed.tokens.paymentStr || 'UPI';
              if (pillDate) pillDate.textContent = parsed.tokens.dateStr || 'Today';
            }
          }
        }, 40);
      };

      nlpInput.addEventListener('input', inputHandler);
      this.#cleanups.push(() => nlpInput.removeEventListener('input', inputHandler));
    }

    const expressForm = document.getElementById('express-nlp-form');
    if (expressForm) {
      const submitHandler = async e => {
        e.preventDefault();
        const text = nlpInput?.value.trim();
        if (!text) return;

        if (this.api?.nlpParse) {
          const members = this.state?.get('householdMembers') || [];
          const parsed = await this.api.nlpParse(text, members);
          if (parsed && parsed.amount > 0) {
            const activeProfile = this.state?.get('activeProfile');
            const expenseData = {
              title: parsed.title || 'Quick Expense',
              amount: parsed.amount,
              category: parsed.category || 'Miscellaneous',
              paymentMethod: parsed.paymentMethod || 'UPI / GPay',
              date: parsed.date || new Date().toISOString().split('T')[0],
              description: `Logged via 1-Box Magic ("${parsed.rawInput}")`,
              paidBy: activeProfile ? activeProfile.name : 'Self',
              splitWith: parsed.splitWith || [],
              isHouseholdExpense: Boolean(parsed.isHouseholdExpense)
            };

            await this.api.addExpense(expenseData);
            if (nlpInput) nlpInput.value = '';
            if (pillAmt) pillAmt.textContent = `${currSym()}0.00`;
            if (pillTitle) pillTitle.textContent = 'Title';

            expressForm.classList.add('express-success-pulse');
            setTimeout(() => expressForm.classList.remove('express-success-pulse'), 350);
            nlpInput?.focus();

            showActionToast({
              icon: 'zap',
              title: `Logged "${expenseData.title}"`,
              amount: expenseData.amount,
              category: expenseData.category,
              subtext: `${expenseData.category} • Express Entry`
            });

            if (this.onDataChanged) await this.onDataChanged();
            await this.render();
          }
        }
      };

      expressForm.addEventListener('submit', submitHandler);
      this.#cleanups.push(() => expressForm.removeEventListener('submit', submitHandler));
    }
  }

  /**
   * Bind delegated click actions for presets, recent table, and split checklist.
   * @private
   */
  #bindDelegatedActions() {
    const unbind = delegateEvent(this.container, 'click', '[data-action]', async (event, target) => {
      const action = target.getAttribute('data-action');
      if (!action) return;

      switch (action) {
        case 'log-preset': {
          const id = target.getAttribute('data-id');
          if (id) await this.logPresetExpense(id);
          break;
        }

        case 'edit-preset': {
          event.stopPropagation();
          const id = target.getAttribute('data-id');
          if (id) this.openEditPresetModal(id);
          break;
        }

        case 'view-receipt': {
          const filename = target.getAttribute('data-filename');
          if (filename && this.onViewReceipt) {
            this.onViewReceipt(filename);
          }
          break;
        }

        case 'open-note': {
          const id = target.getAttribute('data-id');
          const title = target.getAttribute('data-title') || '';
          if (id && this.onOpenNoteModal) {
            this.onOpenNoteModal(id, title);
          }
          break;
        }

        case 'edit-expense': {
          const id = target.getAttribute('data-id');
          if (id && this.onOpenExpenseModal) {
            this.onOpenExpenseModal(id);
          }
          break;
        }

        case 'pay-due-bill': {
          const billId = target.getAttribute('data-bill-id');
          if (billId && this.api?.executeBillPayment) {
            target.setAttribute('disabled', 'true');
            const res = await this.api.executeBillPayment({ billId });
            if (res?.success) {
              showToast('Recurring bill paid and logged!');
              if (this.onDataChanged) await this.onDataChanged();
              await this.render();
            } else {
              showToast(res?.error || 'Failed to process bill payment');
              target.removeAttribute('disabled');
            }
          }
          break;
        }

        case 'dismiss-due-bills': {
          const banner = document.getElementById('dashboard-due-bills-banner');
          if (banner) {
            banner.classList.add('hidden');
            banner.innerHTML = '';
          }
          break;
        }

        case 'delete-expense': {
          const id = target.getAttribute('data-id');
          if (id) {
            if (typeof confirm === 'function' && confirm('Are you sure you want to delete this expense record?')) {
              const allExpenses = this.state?.get('expenses') || [];
              const deletedExpense = allExpenses.find(e => String(e.id) === String(id)) || null;

              const res = await this.api.deleteExpense(id);
              if (res?.success) {
                if (deletedExpense && typeof this.state?.pushUndoAction === 'function') {
                  this.state.pushUndoAction({
                    type: 'DELETE_EXPENSE',
                    description: `Deleted "${deletedExpense.title || 'Expense'}"`,
                    payload: deletedExpense,
                    undo: async () => {
                      await this.api.addExpense(deletedExpense);
                      if (this.onDataChanged) await this.onDataChanged();
                      await this.render();
                    }
                  });
                }
                showActionToast({
                  icon: 'rotate-ccw',
                  title: 'Expense record deleted',
                  subtext: 'Press Ctrl+Z to undo'
                });
                if (this.onDataChanged) await this.onDataChanged();
                await this.render();
              }
            }
          }
          break;
        }

        default:
          break;
      }
    });
    this.#cleanups.push(unbind);

    // Household Split Checklist Checkbox Delegated Change
    const splitPendingList = document.getElementById('split-pending-list');
    if (splitPendingList) {
      const handleSplitCheckbox = e => {
        const target = /** @type {HTMLInputElement} */ (e.target);
        if (!target || !target.classList.contains('split-pending-checkbox')) return;

        const idx = parseInt(target.getAttribute('data-index') || '0', 10);
        const selectedSplits = this.state?.get('selectedSplits') || new Set();

        if (target.checked) {
          selectedSplits.add(idx);
        } else {
          selectedSplits.delete(idx);
        }

        if (this.state) this.state.set('selectedSplits', selectedSplits);

        const settleBtn = /** @type {HTMLButtonElement|null} */ (document.getElementById('btn-settle-selected-splits'));
        if (settleBtn) {
          settleBtn.disabled = selectedSplits.size === 0;
          settleBtn.innerHTML = `${safeIcon('check', 13)} Settle Selected (${selectedSplits.size})`;
        }
      };

      splitPendingList.addEventListener('change', handleSplitCheckbox);
      this.#cleanups.push(() => splitPendingList.removeEventListener('change', handleSplitCheckbox));
    }

    // Jump from Split Widget to Household Tab
    const jumpBtn = document.getElementById('btn-jump-household-tab');
    if (jumpBtn) {
      const jumpHandler = () => {
        if (this.onNavigateTab) this.onNavigateTab('household');
      };
      jumpBtn.addEventListener('click', jumpHandler);
      this.#cleanups.push(() => jumpBtn.removeEventListener('click', jumpHandler));
    }

    // Settle Selected Splits Button
    const settleSelectedBtn = document.getElementById('btn-settle-selected-splits');
    if (settleSelectedBtn) {
      const settleHandler = () => this.handleSettleSelectedSplits();
      settleSelectedBtn.addEventListener('click', settleHandler);
      this.#cleanups.push(() => settleSelectedBtn.removeEventListener('click', settleHandler));
    }
  }

  /**
   * Bind Preset modal submission and controls.
   * @private
   */
  #bindPresetModal() {
    const bindEl = (id, event, handler) => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener(event, handler);
        this.#cleanups.push(() => el.removeEventListener(event, handler));
      }
    };

    bindEl('btn-open-add-preset', 'click', () => this.openAddPresetModal());
    bindEl('preset-modal-close', 'click', () => this.closePresetModal());
    bindEl('preset-cancel-btn', 'click', () => this.closePresetModal());

    bindEl('preset-form', 'submit', async e => {
      e.preventDefault();
      const id = /** @type {HTMLInputElement} */ (document.getElementById('form-preset-id'))?.value;
      const presetData = {
        icon: /** @type {HTMLInputElement} */ (document.getElementById('preset-form-icon'))?.value || 'tag',
        title: /** @type {HTMLInputElement} */ (document.getElementById('preset-form-title'))?.value || '',
        amount: parseFloat(/** @type {HTMLInputElement} */ (document.getElementById('preset-form-amount'))?.value) || 0,
        category:
          /** @type {HTMLSelectElement} */ (document.getElementById('preset-form-category'))?.value || 'Food & Dining',
        paymentMethod:
          /** @type {HTMLSelectElement} */ (document.getElementById('preset-form-payment'))?.value || 'UPI / GPay'
      };

      if (id) {
        presetData.id = id;
        await this.api.updatePreset(presetData);
      } else {
        await this.api.addPreset(presetData);
      }

      this.closePresetModal();
      if (this.onDataChanged) await this.onDataChanged();
      this.renderPresets();
    });

    bindEl('preset-delete-btn', 'click', async () => {
      const id = /** @type {HTMLInputElement} */ (document.getElementById('form-preset-id'))?.value;
      if (id && (typeof confirm !== 'function' || confirm('Delete this preset chip?'))) {
        await this.api.deletePreset(id);
        this.closePresetModal();
        if (this.onDataChanged) await this.onDataChanged();
        this.renderPresets();
      }
    });
  }

  /**
   * Bind What-If Simulator range slider and toggle bar.
   * @private
   */
  #bindWhatIfSimulator() {
    this.initWhatIfToggle();

    const slider = document.getElementById('what-if-range-slider');
    if (slider) {
      const sliderHandler = () => this.updateWhatIfSimulation();
      slider.addEventListener('input', sliderHandler);
      this.#cleanups.push(() => slider.removeEventListener('input', sliderHandler));
    }
  }

  /**
   * Bind Dashboard mini-table search, category, and sort filters.
   * @private
   */
  #bindDashboardFilters() {
    const bindEl = (id, event, handler) => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener(event, handler);
        this.#cleanups.push(() => el.removeEventListener(event, handler));
      }
    };

    const handleSearchInput = e => {
      if (this.state) this.state.set('filterSearch', e.target.value);
      this.renderRecentTable();
    };
    bindEl('search-input', 'input', handleSearchInput);
    bindEl('filter-search', 'input', handleSearchInput);

    bindEl('filter-category', 'change', e => {
      if (this.state) this.state.set('filterCategory', e.target.value);
      this.renderRecentTable();
    });

    bindEl('filter-sort', 'change', e => {
      if (this.state) this.state.set('filterSort', e.target.value);
      this.renderRecentTable();
    });
  }

  // ==========================================================================
  // SALARY ALLOCATOR MODAL (Phase 4.11)
  // ==========================================================================

  /**
   * Update the live preview values and segmented bar in the salary allocator modal.
   */
  updateSalaryModalPreview() {
    if (typeof document === 'undefined') return;

    const income =
      parseFloat(/** @type {HTMLInputElement} */ (document.getElementById('salary-input-income'))?.value) || 0;
    const bills =
      parseFloat(/** @type {HTMLInputElement} */ (document.getElementById('salary-input-bills'))?.value) || 0;
    const savings =
      parseFloat(/** @type {HTMLInputElement} */ (document.getElementById('salary-input-savings'))?.value) || 0;

    const discretionary = Math.max(0, income - bills - savings);
    const now = new Date();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const daily = daysInMonth > 0 ? discretionary / daysInMonth : 0;

    const discEl = document.getElementById('salary-calc-discretionary');
    const dailyEl = document.getElementById('salary-calc-daily');
    if (discEl) discEl.textContent = formatCurrency(discretionary);
    if (dailyEl) dailyEl.textContent = `${formatCurrency(daily)}/day`;

    // 3-Segment Stacked Salary Breakdown Bar in Modal
    const safeIncome = income > 0 ? income : 1;
    const fixedPct = Math.min(100, Math.max(0, (bills / safeIncome) * 100));
    const savingsPct = Math.min(100, Math.max(0, (savings / safeIncome) * 100));
    const discPct = Math.min(100, Math.max(0, (discretionary / safeIncome) * 100));

    const segFixed = document.getElementById('modal-seg-fixed');
    const segSavings = document.getElementById('modal-seg-savings');
    const segDisc = document.getElementById('modal-seg-disc');

    if (segFixed) {
      segFixed.style.width = `${fixedPct}%`;
      segFixed.title = `Fixed Bills: ${currSym()}${bills.toLocaleString('en-IN')}`;
    }
    if (segSavings) {
      segSavings.style.width = `${savingsPct}%`;
      segSavings.title = `Savings Target: ${currSym()}${savings.toLocaleString('en-IN')}`;
    }
    if (segDisc) {
      segDisc.style.width = `${discPct}%`;
      segDisc.title = `Discretionary: ${currSym()}${discretionary.toLocaleString('en-IN')}`;
    }

    const fixedPctEl = document.getElementById('modal-fixed-pct');
    const savingsPctEl = document.getElementById('modal-savings-pct');
    const discPctEl = document.getElementById('modal-disc-pct');
    if (fixedPctEl) fixedPctEl.textContent = `${fixedPct.toFixed(1)}%`;
    if (savingsPctEl) savingsPctEl.textContent = `${savingsPct.toFixed(1)}%`;
    if (discPctEl) discPctEl.textContent = `${discPct.toFixed(1)}%`;
  }

  /**
   * Open the salary configuration modal.
   */
  openSalaryModal() {
    if (typeof document === 'undefined') return;

    const s = this.state?.get('salaryConfig') || {
      monthlyIncome: 60000,
      fixedBills: 20000,
      savingsGoal: 10000,
      payday: 1
    };
    const incInput = /** @type {HTMLInputElement} */ (document.getElementById('salary-input-income'));
    const billsInput = /** @type {HTMLInputElement} */ (document.getElementById('salary-input-bills'));
    const savInput = /** @type {HTMLInputElement} */ (document.getElementById('salary-input-savings'));
    const payInput = /** @type {HTMLSelectElement} */ (document.getElementById('salary-input-payday'));
    const actInput = /** @type {HTMLInputElement} */ (document.getElementById('salary-input-actual-date'));
    const nextInput = /** @type {HTMLInputElement} */ (document.getElementById('salary-input-next-override'));

    if (incInput) incInput.value = s.monthlyIncome ?? 60000;
    if (billsInput) billsInput.value = s.fixedBills ?? 20000;
    if (savInput) savInput.value = s.savingsGoal ?? 10000;
    if (payInput) payInput.value = s.payday ?? 1;
    if (actInput) actInput.value = s.currentCycleStartDate || '';
    if (nextInput) nextInput.value = s.nextPaydayOverride || '';

    this.updateSalaryModalPreview();
    document.getElementById('salary-modal')?.classList.add('active');
  }

  /**
   * Close the salary configuration modal.
   */
  closeSalaryModal() {
    if (typeof document === 'undefined') return;
    document.getElementById('salary-modal')?.classList.remove('active');
  }

  /**
   * Bind salary modal open triggers, input preview updates, payday shift chips, and form submit.
   * @private
   */
  #bindSalaryModal() {
    const bindEl = (id, event, handler) => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener(event, handler);
        this.#cleanups.push(() => el.removeEventListener(event, handler));
      }
    };

    bindEl('btn-open-salary-modal', 'click', () => this.openSalaryModal());
    bindEl('edit-salary-btn', 'click', () => this.openSalaryModal());
    bindEl('salary-modal-close', 'click', () => this.closeSalaryModal());
    bindEl('salary-cancel-btn', 'click', () => this.closeSalaryModal());

    const salaryInputs = [
      'salary-input-income',
      'salary-input-bills',
      'salary-input-savings',
      'salary-input-payday',
      'salary-input-actual-date'
    ];
    salaryInputs.forEach(id => {
      bindEl(id, 'input', () => this.updateSalaryModalPreview());
      bindEl(id, 'change', () => this.updateSalaryModalPreview());
    });

    // Modal payday shift chips
    document.querySelectorAll('#modal-payday-shift-chips .btn-shift-chip').forEach(chip => {
      const chipHandler = () => {
        const shiftDays = parseInt(chip.getAttribute('data-modal-shift') || '0', 10);
        document
          .querySelectorAll('#modal-payday-shift-chips .btn-shift-chip')
          .forEach(c => c.classList.remove('active'));
        chip.classList.add('active');

        const payday = parseInt(
          /** @type {HTMLSelectElement} */ (document.getElementById('salary-input-payday'))?.value || '1',
          10
        );
        const now = new Date();
        const cycleMonth = now.getDate() >= payday ? now.getMonth() : now.getMonth() - 1;
        const cycleYear = now.getFullYear();
        const standardNext = new Date(cycleYear, cycleMonth + 1, payday);

        const overrideEl = /** @type {HTMLInputElement} */ (document.getElementById('salary-input-next-override'));
        if (shiftDays === 0) {
          if (overrideEl) overrideEl.value = '';
        } else {
          const shifted = new Date(standardNext);
          shifted.setDate(shifted.getDate() + shiftDays);
          const y = shifted.getFullYear();
          const m = String(shifted.getMonth() + 1).padStart(2, '0');
          const d = String(shifted.getDate()).padStart(2, '0');
          if (overrideEl) overrideEl.value = `${y}-${m}-${d}`;
        }
        this.updateSalaryModalPreview();
      };
      chip.addEventListener('click', chipHandler);
      this.#cleanups.push(() => chip.removeEventListener('click', chipHandler));
    });

    // Salary Form submission
    bindEl('salary-form', 'submit', async e => {
      e.preventDefault();
      const income =
        parseFloat(/** @type {HTMLInputElement} */ (document.getElementById('salary-input-income'))?.value) || 0;
      const bills =
        parseFloat(/** @type {HTMLInputElement} */ (document.getElementById('salary-input-bills'))?.value) || 0;
      const savings =
        parseFloat(/** @type {HTMLInputElement} */ (document.getElementById('salary-input-savings'))?.value) || 0;
      const payday = parseInt(
        /** @type {HTMLSelectElement} */ (document.getElementById('salary-input-payday'))?.value || '1',
        10
      );
      const actualDate =
        /** @type {HTMLInputElement} */ (document.getElementById('salary-input-actual-date'))?.value || null;
      const nextOverride =
        /** @type {HTMLInputElement} */ (document.getElementById('salary-input-next-override'))?.value || null;

      const currentConfig = this.state?.get('salaryConfig') || {};
      const newConfig = {
        ...currentConfig,
        monthlyIncome: income,
        fixedBills: bills,
        savingsGoal: savings,
        payday,
        currentCycleStartDate: actualDate,
        nextPaydayOverride: nextOverride,
        currencySymbol: currentConfig.currencySymbol || '₹'
      };

      if (this.api?.setSalaryConfig) {
        await this.api.setSalaryConfig(newConfig);
      }
      if (this.state) {
        this.state.set('salaryConfig', newConfig);
      }

      this.closeSalaryModal();
      showToast('Salary & Payday Allocation updated!');
      if (this.onDataChanged) await this.onDataChanged();
      await this.render();
    });
  }

  // ==========================================================================
  // EXPORT SCOPE MODAL & FILE EXPORTS (Phase 4.11)
  // ==========================================================================

  /**
   * Bind Export Scope Modal and CSV/Excel file exporters.
   * @private
   */
  #bindExportModal() {
    let pendingExportType = 'csv';

    const openExportScopeModal = type => {
      pendingExportType = type;
      const now = new Date();
      const monthStr = now.toISOString().substring(0, 7);
      const expenses = this.state?.get('expenses') || [];
      const monthCount = expenses.filter(e => e.date && e.date.startsWith(monthStr)).length;
      const allCount = expenses.length;

      const monthLabel = document.getElementById('export-month-count-label');
      const allLabel = document.getElementById('export-all-count-label');
      if (monthLabel) monthLabel.textContent = `Export current month (${monthCount} transactions)`;
      if (allLabel) allLabel.textContent = `Export full history (${allCount} transactions)`;

      document.getElementById('export-scope-modal')?.classList.add('active');
    };

    const bindEl = (id, event, handler) => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener(event, handler);
        this.#cleanups.push(() => el.removeEventListener(event, handler));
      }
    };

    bindEl('btn-export-csv', 'click', () => openExportScopeModal('csv'));
    bindEl('btn-export-excel', 'click', () => openExportScopeModal('excel'));
    bindEl('export-scope-modal-close', 'click', () => {
      document.getElementById('export-scope-modal')?.classList.remove('active');
    });
    bindEl('export-scope-cancel-btn', 'click', () => {
      document.getElementById('export-scope-modal')?.classList.remove('active');
    });

    bindEl('btn-export-this-month', 'click', async () => {
      document.getElementById('export-scope-modal')?.classList.remove('active');
      const res = pendingExportType === 'excel' ? await this.api?.exportExcel?.() : await this.api?.exportCSV?.();
      if (res?.success) {
        showToast(`Exported ${pendingExportType.toUpperCase()} file successfully!`);
      } else if (res && !res.canceled) {
        showToast(`Export Failed: ${res.error || 'Unknown error'}`);
      }
    });

    bindEl('btn-export-all-time', 'click', async () => {
      document.getElementById('export-scope-modal')?.classList.remove('active');
      const res = pendingExportType === 'excel' ? await this.api?.exportExcel?.() : await this.api?.exportCSV?.();
      if (res?.success) {
        showToast(`Exported all-time ${pendingExportType.toUpperCase()} file!`);
      } else if (res && !res.canceled) {
        showToast(`Export Failed: ${res.error || 'Unknown error'}`);
      }
    });
  }
}
