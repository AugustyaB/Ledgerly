// Desktop Application Frontend Renderer Logic — Netflix Multi-Person System

let appState = {
  account: null,
  authMode: 'login', // 'login' | 'signup'
  isManageProfiles: false,
  profiles: [],
  activeProfile: null,
  dashboardScope: 'ALL', // 'ALL' | profileId
  isPrivacyMode: false,
  selectedSplits: new Set(),
  paletteSelectedIndex: 0,
  paletteResults: [],
  expenses: [],
  categories: [],
  presets: [],
  notes: [],
  settlements: [],
  recurringBills: [],
  importPendingExpenses: [],
  filterNotesRelation: 'ALL',
  filterNotesSearch: '',
  activeNoteRelation: 'ALL',
  feedFilters: { search: '', category: 'ALL', paymentMethod: 'ALL', member: 'ALL', dateRange: 'ALL' },
  feedSort: { column: 'date', direction: 'desc' },
  feedPage: 1,
  feedPageSize: 20,
  feedSelectedIds: new Set(),
  salaryConfig: { monthlyIncome: 60000, fixedBills: 20000, savingsGoal: 10000 },
  householdMembers: ['Self', 'Partner', 'Roommate'],
  budgetGoal: 30000,
  filterSearch: '',
  filterCategory: 'ALL',
  filterSort: 'DATE_DESC',
  currentTab: 'dashboard',
  workspaceMode: 'household', // 'household' | 'solo'
  pendingReceiptPath: null,
  pendingReceiptFilename: null
};

let barChartInstance = null;
let doughnutChartInstance = null;

// Centralized Currency Formatting Helper (v1.2 Phase 2)
// Returns the user-configured currency symbol
function currSym() {
  return appState.salaryConfig?.currencySymbol || '₹';
}

// Format an amount with the configured currency symbol and locale grouping
// decimals: number of decimal places (default 2)
function formatCurrency(amount, decimals = 2) {
  const num = Number(amount) || 0;
  return `${currSym()}${num.toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}

// Format currency with no decimals
function formatCurrencyInt(amount) {
  return formatCurrency(amount, 0);
}

// Initialize Desktop App on DOM Load
document.addEventListener('DOMContentLoaded', async () => {
  setupWindowControls();
  setupEventListeners();
  setupKeyboardShortcuts();
  setupDragAndDrop();
  await initAppSession();
});

// Window Titlebar Control Handlers
function setupWindowControls() {
  document.getElementById('btn-minimize')?.addEventListener('click', () => {
    window.electronAPI?.minimizeWindow();
  });
  document.getElementById('btn-maximize')?.addEventListener('click', () => {
    window.electronAPI?.maximizeWindow();
  });
  document.getElementById('btn-close')?.addEventListener('click', () => {
    window.electronAPI?.closeWindow();
  });
}

// Global Keyboard Shortcuts (Phase 3)
function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Ctrl+N / Cmd+N -> Quick focus 1-Box Magic Express Entry Bar
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
      e.preventDefault();
      const nlpInput = document.getElementById('express-nlp-input') || document.getElementById('express-title');
      if (nlpInput) {
        switchTab('dashboard');
        nlpInput.focus();
        nlpInput.select();
      }
      return;
    }

    // Ctrl+K / Cmd+K -> Universal Command Palette
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      openCommandPalette();
      return;
    }

    // P -> Privacy Mode Toggle (when not actively editing text inputs)
    if (e.key.toLowerCase() === 'p' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) {
      e.preventDefault();
      togglePrivacyMode();
      return;
    }

    // Alt+1 .. Alt+9 -> Trigger One-Click Preset Hotkeys (Refinement 1.B)
    if (e.altKey && !isNaN(parseInt(e.key, 10))) {
      const num = parseInt(e.key, 10);
      if (num >= 1 && num <= (appState.presets || []).length) {
        e.preventDefault();
        logPresetExpense(appState.presets[num - 1].id);
        return;
      }
    }

    // ESC -> Close Command Palette or Modals
    if (e.key === 'Escape') {
      const paletteModal = document.getElementById('command-palette-modal');
      if (paletteModal && paletteModal.classList.contains('active')) {
        closeCommandPalette();
      }
    }
  });
}

// Data Fetching & Sync
async function loadAppData() {
  if (!window.electronAPI) {
    console.warn('Desktop Electron IPC bridge unavailable');
    return;
  }
  
  // Load Active Profile & All Profiles
  appState.profiles = (await window.electronAPI.getProfiles()) || [];
  appState.activeProfile = await window.electronAPI.getActiveProfile();
  if (appState.activeProfile) {
    const avatarEl = document.getElementById('current-profile-avatar');
    const nameEl = document.getElementById('current-profile-name');
    const countEl = document.getElementById('profile-stat-count');
    if (avatarEl) {
      const name = appState.activeProfile?.name || 'Personal';
      const color = appState.activeProfile?.color || appState.activeProfile?.avatar || getAvatarColor(name);
      avatarEl.innerHTML = renderMonogram(name, 28, color);
    }
    if (nameEl) nameEl.textContent = appState.activeProfile.name || 'Personal';
    if (countEl) countEl.textContent = `${appState.activeProfile.expenseCount || 0} expenses`;
  }

  const data = await window.electronAPI.getExpenses();
  appState.expenses = data.expenses || [];
  appState.allHouseholdExpenses = (await window.electronAPI.getCombinedExpenses()) || [];
  appState.categories = data.categories || [];
  appState.budgetGoal = data.budgetGoal || 30000;
  appState.presets = (await window.electronAPI.getPresets()) || data.presets || [];
  appState.salaryConfig = (await window.electronAPI.getSalaryConfig()) || data.salaryConfig || { monthlyIncome: 60000, fixedBills: 20000, savingsGoal: 10000 };
  appState.householdMembers = (await window.electronAPI.getHouseholdMembers()) || data.householdMembers || ['Self', 'Partner'];
  appState.notes = (await window.electronAPI.getNotes()) || [];
  appState.settlements = (await window.electronAPI.getSettlements()) || [];
  appState.recurringBills = (await window.electronAPI.getRecurringBills()) || [];
  appState.workspaceMode = (await window.electronAPI.getWorkspaceMode()) || 'household';

  // Apply Solo Mode DOM Class
  document.body.classList.toggle('mode-solo', appState.workspaceMode === 'solo');
  const modeText = document.getElementById('menu-mode-text');
  const modeIcon = document.getElementById('menu-mode-icon');
  if (modeText) modeText.textContent = appState.workspaceMode === 'solo' ? 'Switch to Household Mode' : 'Switch to Solo Mode';
  if (modeIcon) modeIcon.innerHTML = appState.workspaceMode === 'solo' ? icon('users', 14) : icon('user', 14);

  const countEl = document.getElementById('profile-stat-count');
  if (countEl) countEl.textContent = `${appState.expenses.length} expenses`;

  // Populate Multi-User Scope Filter in Dashboard
  const scopeSelect = document.getElementById('dashboard-scope-filter');
  if (scopeSelect) {
    const prevVal = appState.dashboardScope || 'ALL';
    scopeSelect.innerHTML = `
      <option value="ALL">Combined Household</option>
      ${appState.profiles.map(p => `
        <option value="${p.id}">${escapeHTML(p.name)}</option>
      `).join('')}
    `;
    scopeSelect.value = prevVal;
  }

  populateCategorySelects();
  populateHouseholdMemberControls();
  await renderAll();
}

// Populate Category Dropdowns across all forms
function populateCategorySelects() {
  const filterSelect = document.getElementById('filter-category');
  const formSelect = document.getElementById('form-category');
  const expressSelect = document.getElementById('express-category');
  const presetSelect = document.getElementById('preset-form-category');

  if (filterSelect) filterSelect.innerHTML = '<option value="ALL">All Categories</option>';
  if (formSelect) formSelect.innerHTML = '';
  if (expressSelect) expressSelect.innerHTML = '';
  if (presetSelect) presetSelect.innerHTML = '';

  appState.categories.forEach(cat => {
    if (filterSelect) filterSelect.appendChild(new Option(cat, cat));
    if (formSelect) formSelect.appendChild(new Option(cat, cat));
    if (expressSelect) expressSelect.appendChild(new Option(cat, cat));
    if (presetSelect) presetSelect.appendChild(new Option(cat, cat));
  });
}

// Populate Household Member Selects & Checkboxes
function populateHouseholdMemberControls() {
  const paidBySelect = document.getElementById('form-paid-by');
  const splitWithContainer = document.getElementById('form-split-with-container');
  const memberTags = document.getElementById('member-list-tags');

  if (paidBySelect) {
    paidBySelect.innerHTML = '';
    appState.householdMembers.forEach(m => {
      paidBySelect.appendChild(new Option(m, m));
    });
  }

  if (splitWithContainer) {
    splitWithContainer.innerHTML = appState.householdMembers.map(m => `
      <label style="display: inline-flex; align-items: center; gap: 4px; font-size: 12px; cursor: pointer; background: var(--bg-card); padding: 4px 8px; border-radius: var(--radius-sm); border: 1px solid var(--border-color);">
        <input type="checkbox" name="split-member" value="${escapeHTML(m)}" checked style="width: auto;">
        ${escapeHTML(m)}
      </label>
    `).join('');
  }

  if (memberTags) {
    memberTags.innerHTML = appState.householdMembers.map(m => `
      <span class="member-tag-chip">
        <span style="display: inline-flex; align-items: center; gap: 4px;">${icon('user', 12)} ${escapeHTML(m)}</span>
        ${m !== 'Self' ? `<span class="member-tag-remove" onclick="removeHouseholdMember('${escapeHTML(m)}')">✕</span>` : ''}
      </span>
    `).join('');
  }
}

// Render All UI Components (Phase 5)
async function renderAll() {
  renderPresets();
  renderMetrics();
  renderTable();
  renderCharts();
  renderHouseholdSplitWidget();
  await updateWhatIfSimulation();
  if (appState.currentTab === 'household') {
    await renderHouseholdWorkspace();
  } else if (appState.currentTab === 'expenses') {
    renderExpenseFeedWorkspace();
  } else if (appState.currentTab === 'batch') {
    renderBatchTable();
  } else if (appState.currentTab === 'notes') {
    renderNotesWorkspace();
  } else if (appState.currentTab === 'settings') {
    renderSettingsWorkspace();
  }
  if (typeof hydrateIcons === 'function') hydrateIcons();
}

// Render One-Click Preset Chips
function renderPresets() {
  const container = document.getElementById('preset-chips-container');
  if (!container) return;

  if (appState.presets.length === 0) {
    container.innerHTML = `<span style="font-size: 12px; color: var(--text-muted);">No presets configured. Click "+ Add Preset" to create one.</span>`;
    return;
  }

  container.innerHTML = appState.presets.map((p, idx) => `
    <div class="preset-chip" onclick="logPresetExpense('${p.id}')" oncontextmenu="event.preventDefault(); openEditPresetModal('${p.id}')" title="Click to log ${formatCurrency(p.amount)} for ${escapeHTML(p.title)} (Right-click to edit)">
      <span class="preset-chip-icon">${(p.icon && typeof ICON_SVG_MAP !== 'undefined' && ICON_SVG_MAP[p.icon]) ? icon(p.icon, 14) : (p.icon || icon('tag', 14))}</span>
      <span class="preset-chip-title">${escapeHTML(p.title)}</span>
      <span class="preset-chip-amount">${formatCurrency(p.amount)}</span>
      ${idx < 9 ? `<span class="preset-hotkey-badge">Alt+${idx + 1}</span>` : ''}
      <span class="preset-chip-edit-btn" onclick="event.stopPropagation(); openEditPresetModal('${p.id}')" title="Edit Preset">${icon('pencil', 12)}</span>
    </div>
  `).join('');
}

// 1-Click Preset Logging Execution
window.logPresetExpense = async function(presetId) {
  const preset = (appState.presets || []).find(p => p.id === presetId);
  if (!preset) {
    showToast('⚠️ Preset chip not found');
    return;
  }

  const payload = {
    title: preset.title,
    amount: preset.amount,
    category: preset.category,
    paymentMethod: preset.paymentMethod || 'UPI / GPay',
    date: new Date().toISOString().split('T')[0],
    description: `Quick preset transaction (${preset.title})`,
    paidBy: appState.activeProfile ? appState.activeProfile.name : 'Self',
    isHouseholdExpense: false
  };

  await window.electronAPI.addExpense(payload);
  showActionToast({
    icon: preset.icon || 'tag',
    title: `Logged "${preset.title}"`,
    amount: preset.amount,
    category: preset.category,
    subtext: `${preset.category} • One-Click Preset`
  });
  await loadAppData();
};

// Get expenses scoped by currently selected Multi-User Scope filter
function getScopedExpenses() {
  // In Solo Mode, strictly isolate to the current active profile's own expenses
  if (appState.workspaceMode === 'solo') {
    return appState.expenses || [];
  }

  // In Household Mode:
  const pool = (appState.allHouseholdExpenses && appState.allHouseholdExpenses.length > 0)
    ? appState.allHouseholdExpenses
    : (appState.expenses || []);

  if (!appState.dashboardScope || appState.dashboardScope === 'ALL') {
    return pool;
  }
  const scoped = pool.filter(e => {
    return e.profileId === appState.dashboardScope || 
           (appState.activeProfile && appState.activeProfile.id === appState.dashboardScope && (e.paidBy === appState.activeProfile.name || !e.profileId));
  });
  return scoped.length > 0 ? scoped : (appState.expenses || []);
}

// Render Executive KPI Cards & Dynamic Salary Pool (Phase 3)
function renderMetrics() {
  const scoped = getScopedExpenses();
  const totalSpent = scoped.reduce((acc, curr) => acc + (parseFloat(curr.amount) || 0), 0);
  const budgetRemaining = appState.budgetGoal - totalSpent;
  const budgetPercent = appState.budgetGoal > 0 ? Math.min(100, Math.max(0, (totalSpent / appState.budgetGoal) * 100)) : 0;

  // 1. Total Outflow Card
  const totalSpentEl = document.getElementById('metric-total-spent');
  if (totalSpentEl) totalSpentEl.textContent = `${formatCurrency(totalSpent)}`;
  
  const spentSubEl = document.getElementById('metric-spent-subtitle');
  if (spentSubEl) {
    spentSubEl.textContent = appState.dashboardScope === 'ALL' ? 'Across all household members' : 'Across selected profile';
  }

  // 2. Discretionary Remaining Card
  const remainingEl = document.getElementById('metric-budget-remaining');
  if (remainingEl) {
    remainingEl.textContent = `${formatCurrency(budgetRemaining)}`;
    remainingEl.style.color = budgetRemaining >= 0 ? 'var(--accent-emerald)' : 'var(--accent-rose)';
  }

  // 3. Daily Budget Health & Pace Math
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const currentDay = now.getDate();
  const remainingDays = Math.max(1, daysInMonth - currentDay + 1);
  const dailyAllowance = Math.max(0, budgetRemaining / remainingDays);
  
  const todayStr = now.toISOString().split('T')[0];
  const todaySpent = scoped.filter(e => e.date === todayStr).reduce((acc, c) => acc + (parseFloat(c.amount) || 0), 0);

  const dailyValEl = document.getElementById('daily-pace-metric-val');
  if (dailyValEl) {
    dailyValEl.innerHTML = `${formatCurrency(dailyAllowance)}<span style="font-size: 13px; font-weight: 500; color: var(--text-muted);">/day</span>`;
  }

  // Interactive Rollover Calculation Explainer Tooltip (Refinement 2.B)
  const targetDaily = appState.budgetGoal / daysInMonth;
  const allowedToDate = targetDaily * currentDay;
  const rollover = allowedToDate - totalSpent;

  const tooltipBody = document.getElementById('rollover-tooltip-body');
  if (tooltipBody) {
    tooltipBody.innerHTML = `Day ${currentDay} of ${daysInMonth}: Allowed spend to date was <strong>${formatCurrencyInt(allowedToDate)}</strong>. You have spent <strong>${formatCurrencyInt(totalSpent)}</strong>.<br><br>${rollover >= 0 ? `You have <strong style="color: #10B981;">+${formatCurrencyInt(rollover)} rolled over</strong> to spend safely across remaining ${remainingDays} days.` : `You are <strong style="color: #FB7185;">-${formatCurrencyInt(Math.abs(rollover))} over pace</strong>.`}`;
  }

  const paceBadge = document.getElementById('daily-pace-badge');
  const paceSubtitle = document.getElementById('daily-pace-metric-subtitle');
  if (paceBadge) {
    paceBadge.className = 'pace-badge';
    if (todaySpent <= dailyAllowance) {
      paceBadge.textContent = 'On Track';
      paceBadge.classList.add('badge-emerald');
      if (paceSubtitle) paceSubtitle.innerHTML = `<span class="pace-badge badge-emerald" id="daily-pace-badge">On Track</span>`;
    } else if (todaySpent <= dailyAllowance * 1.3) {
      paceBadge.textContent = 'Caution';
      paceBadge.classList.add('badge-amber');
      if (paceSubtitle) paceSubtitle.innerHTML = `<span class="pace-badge badge-amber" id="daily-pace-badge">Caution</span>`;
    } else {
      paceBadge.textContent = 'Over Pace';
      paceBadge.classList.add('badge-rose');

      // Actionable Recovery Projection for Over-Pace State (Refinement 2.C)
      const overAmt = Math.abs(rollover);
      const recoveryDays = Math.min(5, remainingDays);
      const savePerDay = recoveryDays > 0 ? (overAmt / recoveryDays) : 0;
      if (paceSubtitle) {
        paceSubtitle.innerHTML = `<span class="pace-badge badge-rose" id="daily-pace-badge">Over Pace</span> <span style="font-size: 11px; color: var(--text-dim); margin-left: 6px;">Spend ${formatCurrencyInt(savePerDay)} less/day for next ${recoveryDays}d to recover</span>`;
      }
    }
  }

  // 4. Active Contributors / Records Count
  const contributors = new Set(scoped.map(e => e.paidBy || 'Personal'));
  const activeMembersEl = document.getElementById('metric-active-members');
  if (activeMembersEl) {
    activeMembersEl.textContent = appState.dashboardScope === 'ALL' ? `${contributors.size} Contributors` : '1 Active';
  }
  const membersSubEl = document.getElementById('metric-members-subtitle');
  if (membersSubEl) {
    membersSubEl.textContent = `${scoped.length} stored records`;
  }

  // 5. Sidebar Dynamic Salary Pool Widget (Linear vs Circular)
  renderSidebarBudgetWidget(totalSpent, budgetPercent);

  // 6. Financial Health Mood State & Dynamic Emblems (v1.2 Phase 1)
  document.body.classList.remove('mood-safe', 'mood-caution', 'mood-overpace');
  const brandIconEl = document.getElementById('dashboard-brand-icon');
  
  if (budgetRemaining < 0 || (rollover < -100 && budgetPercent > 90)) {
    document.body.classList.add('mood-overpace');
    if (brandIconEl) brandIconEl.innerHTML = icon('alert-triangle', 20);
  } else if (budgetPercent > 75 || rollover < 0) {
    document.body.classList.add('mood-caution');
    if (brandIconEl) brandIconEl.innerHTML = icon('flame', 20);
  } else {
    document.body.classList.add('mood-safe');
    if (brandIconEl) brandIconEl.innerHTML = icon('shield-check', 20);
  }
}

// "What-If" Spending Impact Simulator (Phase 5)
async function updateWhatIfSimulation(extraAmount = null) {
  const slider = document.getElementById('what-if-range-slider');
  const displayEl = document.getElementById('what-if-slider-display');
  const currPaceEl = document.getElementById('what-if-curr-pace');
  const projPaceEl = document.getElementById('what-if-proj-pace');
  const dailyDropEl = document.getElementById('what-if-daily-drop');
  const badgeEl = document.getElementById('what-if-risk-badge');
  const msgEl = document.getElementById('what-if-message-bar');

  if (!slider) return;

  const testAmt = extraAmount !== null ? extraAmount : (parseFloat(slider.value) || 500);
  if (displayEl) displayEl.textContent = `${currSym()}${testAmt.toLocaleString('en-IN')}`;

  if (window.electronAPI && window.electronAPI.simulateWhatIf) {
    const sim = await window.electronAPI.simulateWhatIf(testAmt);
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

// Render Sidebar Budget Widget: Linear Progress or Circular Donut
function renderSidebarBudgetWidget(totalSpent, budgetPercent) {
  const linearWrap = document.getElementById('sidebar-linear-budget-wrap');
  const circularWrap = document.getElementById('sidebar-circular-budget-wrap');
  const amountEl = document.getElementById('sidebar-budget-amount');
  const miniPercentEl = document.getElementById('sidebar-mini-budget-percent');
  const statusCopyEl = document.getElementById('sidebar-budget-status-copy');

  if (miniPercentEl) {
    miniPercentEl.textContent = `${Math.round(budgetPercent)}%`;
  }

  if (amountEl) {
    amountEl.textContent = `${formatCurrency(appState.budgetGoal)}`;
  }

  // Dynamic Color-Coded Budget Threshold Feedback
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

  if (appState.dashboardScope === 'ALL' && appState.profiles.length > 1) {
    // Show Circular Multi-Member Gauge for Combined Household
    linearWrap?.classList.add('hidden');
    circularWrap?.classList.remove('hidden');
    drawCircularSalaryRing();
  } else {
    // Show Linear Progress Bar for Single Profile
    circularWrap?.classList.add('hidden');
    linearWrap?.classList.remove('hidden');

    const barEl = document.getElementById('sidebar-budget-bar');
    if (barEl) {
      barEl.style.width = `${budgetPercent}%`;
      barEl.style.background = thresholdColor;
    }
    const statusEl = document.getElementById('sidebar-budget-status');
    if (statusEl) {
      statusEl.textContent = `${formatCurrency(totalSpent)} spent of ${formatCurrency(appState.budgetGoal)}`;
    }
  }

  // Update Visual 3-Segment Stacked Salary Breakdown Bar in Sidebar (Refinement 2.A)
  const s = appState.salaryConfig || { monthlyIncome: 60000, fixedBills: 20000, savingsGoal: 10000 };
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

// Draw HTML5 Canvas Donut Ring for Household Salary Pool
function drawCircularSalaryRing() {
  const canvas = document.getElementById('salaryRingCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);

  const centerX = width / 2;
  const centerY = height / 2;
  const radius = 60;
  const lineWidth = 12;

  // Background Track
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
  ctx.strokeStyle = '#2D303C';
  ctx.lineWidth = lineWidth;
  ctx.stroke();

  // Multi-Member Arcs
  const colors = ['#D9822B', '#10B981', '#38BDF8', '#E11D48', '#C084FC'];
  const total = appState.expenses.reduce((a, b) => a + (parseFloat(b.amount) || 0), 0) || 1;
  let startAngle = -Math.PI / 2;

  const memberSpendMap = {};
  appState.expenses.forEach(e => {
    const key = e.paidBy || 'Personal';
    memberSpendMap[key] = (memberSpendMap[key] || 0) + (parseFloat(e.amount) || 0);
  });

  Object.entries(memberSpendMap).forEach(([member, amount], i) => {
    const sliceAngle = (amount / Math.max(appState.budgetGoal, total)) * 2 * Math.PI;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, startAngle, startAngle + sliceAngle);
    ctx.strokeStyle = colors[i % colors.length];
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';
    ctx.stroke();
    startAngle += sliceAngle;
  });

  // Center Text
  ctx.font = 'bold 16px "JetBrains Mono", monospace';
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const pct = Math.min(100, Math.round((total / Math.max(1, appState.budgetGoal)) * 100));
  ctx.fillText(`${pct}%`, centerX, centerY - 6);

  ctx.font = '10px "Plus Jakarta Sans", sans-serif';
  ctx.fillStyle = '#9598A3';
  ctx.fillText('Used', centerX, centerY + 12);
}

// Render Recent Transactions Ledger Table
function renderTable() {
  const tbody = document.getElementById('expense-table-body');
  if (!tbody) return;

  const scoped = getScopedExpenses();

  let filtered = scoped.filter(item => {
    const matchesSearch = !appState.filterSearch || 
      item.title.toLowerCase().includes(appState.filterSearch.toLowerCase()) ||
      (item.description && item.description.toLowerCase().includes(appState.filterSearch.toLowerCase()));
    
    const matchesCategory = appState.filterCategory === 'ALL' || item.category === appState.filterCategory;
    return matchesSearch && matchesCategory;
  });

  // Sorting
  filtered.sort((a, b) => {
    if (appState.filterSort === 'DATE_DESC') return new Date(b.date) - new Date(a.date);
    if (appState.filterSort === 'DATE_ASC') return new Date(a.date) - new Date(b.date);
    if (appState.filterSort === 'AMOUNT_DESC') return b.amount - a.amount;
    if (appState.filterSort === 'AMOUNT_ASC') return a.amount - b.amount;
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

  tbody.innerHTML = filtered.slice(0, 50).map(item => {
    const expenseNotes = (appState.notes || []).filter(n => n.relation === 'transaction' && n.relationId === item.id);
    const hasNotes = expenseNotes.length > 0;
    const isShared = Boolean(item.isHouseholdExpense);

    return `
    <tr>
      <td style="font-family: var(--font-mono); font-size: 12px; color: var(--text-muted);">${item.date}</td>
      <td>
        <strong style="color: var(--text-main); font-size: 13.5px;">${escapeHTML(item.title)}</strong>
        ${item.description ? `<div style="font-size: 11.5px; color: var(--text-dim); margin-top: 2px;">${escapeHTML(item.description)}</div>` : ''}
      </td>
      <td><span class="category-pill">${escapeHTML(item.category)}</span></td>
      <td>
        <div style="display: flex; align-items: center; gap: 6px;">
          <span style="font-size: 12px; color: var(--text-main); font-weight: 700;">${escapeHTML(item.paidBy || 'Personal')}</span>
          ${isShared ? `<span style="font-size: 10px; background: rgba(217, 130, 43, 0.15); color: var(--accent-primary); padding: 2px 6px; border-radius: 4px; font-weight: 700; display: inline-flex; align-items: center; gap: 4px;">${icon('users', 11)} Shared</span>` : '<span style="font-size: 10px; background: #1E212A; color: var(--text-muted); padding: 2px 6px; border-radius: 4px;">Personal</span>'}
        </div>
      </td>
      <td class="amount-text">-${formatCurrency(parseFloat(item.amount) || 0)}</td>
      <td>
        ${item.receiptFilename ? `<button class="action-btn" onclick="viewReceiptImage('${item.receiptFilename}')" title="View Receipt Image">${icon('camera', 13)} Receipt</button>` : '<span style="color:var(--text-dim); font-size:11px;">—</span>'}
      </td>
      <td class="actions-cell">
        <button class="action-btn note-indicator-btn ${hasNotes ? 'has-notes' : ''}" onclick="openNoteModalForExpense('${item.id}', '${escapeHTML(item.title).replace(/'/g, "\\'")}')" title="${hasNotes ? `${expenseNotes.length} Note(s) linked` : 'Attach contextual note'}">${icon('file-text', 13)}${hasNotes ? `<span style="font-size:9px; font-weight:800; margin-left:2px;">${expenseNotes.length}</span>` : ''}</button>
        <button class="action-btn edit-btn" onclick="openEditModal('${item.id}')" title="Edit Expense">${icon('pencil', 13)}</button>
        <button class="action-btn delete-btn" onclick="confirmDeleteExpense('${item.id}')" title="Delete Expense">${icon('trash-2', 13)}</button>
      </td>
    </tr>
  `;
  }).join('');
}

// Render Household Split Balances & Settlement Checklist Widget (Phase 3)
async function renderHouseholdSplitWidget() {
  const container = document.getElementById('split-pending-list');
  const settleBtn = document.getElementById('btn-settle-selected-splits');
  if (!container) return;

  const settlement = await window.electronAPI.getHouseholdSettlement();
  if (!settlement || !settlement.settlements || settlement.settlements.length === 0) {
    container.innerHTML = `
      <div style="background: #14151B; padding: 14px; border-radius: 10px; text-align: center; color: var(--text-muted); font-size: 12.5px; border: 1px dashed #2D303C;">
        <div style="display: inline-flex; align-items: center; gap: 8px;">${icon('check-circle', 16)} All shared household expenses are fully settled!</div>
      </div>
    `;
    if (settleBtn) settleBtn.disabled = true;
    return;
  }

  container.innerHTML = settlement.settlements.map((s, idx) => {
    const isChecked = appState.selectedSplits.has(idx);
    return `
      <div class="split-pending-item">
        <div class="split-pending-info">
          <span class="split-pending-avatar">${renderMonogram(s.from, 24)}</span>
          <div class="split-pending-desc">
            <span class="split-pending-title">${escapeHTML(s.from)} ➔ ${escapeHTML(s.to)}</span>
            <span class="split-pending-debt">${formatCurrency(s.amount)} pending</span>
          </div>
        </div>
        <input type="checkbox" class="split-pending-checkbox" data-index="${idx}" ${isChecked ? 'checked' : ''} onchange="toggleSplitCheckbox(${idx})">
      </div>
    `;
  }).join('');

  if (settleBtn) {
    settleBtn.disabled = appState.selectedSplits.size === 0;
    settleBtn.innerHTML = `${icon('check', 13)} Settle Selected (${appState.selectedSplits.size})`;
  }
}

window.toggleSplitCheckbox = function(idx) {
  if (appState.selectedSplits.has(idx)) {
    appState.selectedSplits.delete(idx);
  } else {
    appState.selectedSplits.add(idx);
  }
  const settleBtn = document.getElementById('btn-settle-selected-splits');
  if (settleBtn) {
    settleBtn.disabled = appState.selectedSplits.size === 0;
    settleBtn.innerHTML = `${icon('check', 13)} Settle Selected (${appState.selectedSplits.size})`;
  }
};

window.handleSettleSelectedSplits = async function() {
  if (appState.selectedSplits.size === 0) return;
  showToast(`Settled ${appState.selectedSplits.size} shared balance(s)!`);
  appState.selectedSplits.clear();
  await renderHouseholdSplitWidget();
};

// Render Deep-Dive Financial Analytics Charts (60% / 40%)
function renderCharts() {
  if (typeof Chart === 'undefined') return;
  const scoped = getScopedExpenses();

  // 1. Concentric Category Breakdown Donut Chart
  const catTotals = {};
  scoped.forEach(e => {
    catTotals[e.category] = (catTotals[e.category] || 0) + (parseFloat(e.amount) || 0);
  });

  const doughnutCtx = document.getElementById('doughnutChart')?.getContext('2d');
  if (doughnutCtx) {
    if (doughnutChartInstance && typeof doughnutChartInstance.destroy === 'function') {
      try { doughnutChartInstance.destroy(); } catch (e) {}
      doughnutChartInstance = null;
    }
    
    const labels = Object.keys(catTotals);
    const data = Object.values(catTotals);

    // Theme 3 Harmonic Palette
    const dlsPalette = ['#D9822B', '#10B981', '#C25E3E', '#686B77', '#E11D48', '#8B5CF6', '#F59E0B', '#38BDF8'];

    doughnutChartInstance = new Chart(doughnutCtx, {
      type: 'doughnut',
      data: {
        labels: labels.length ? labels : ['No Outflow Recorded'],
        datasets: [{
          data: data.length ? data : [1],
          backgroundColor: labels.length ? dlsPalette.slice(0, labels.length) : ['#2D303C'],
          borderWidth: 2,
          borderColor: '#1A1C23'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { color: '#9598A3', font: { family: 'Plus Jakarta Sans', size: 11 }, padding: 12 } }
        },
        cutout: '72%'
      }
    });
  }

  // 2. Cash Flow Trends Bar Chart with Daily Pace Benchmark Line
  const barCtx = document.getElementById('barChart')?.getContext('2d');
  if (barCtx) {
    if (barChartInstance && typeof barChartInstance.destroy === 'function') {
      try { barChartInstance.destroy(); } catch (e) {}
      barChartInstance = null;
    }

    const dateTotals = {};
    const sortedExp = [...scoped].sort((a, b) => new Date(a.date) - new Date(b.date));
    sortedExp.forEach(e => {
      dateTotals[e.date] = (dateTotals[e.date] || 0) + (parseFloat(e.amount) || 0);
    });

    const dates = Object.keys(dateTotals).slice(-7);
    const displayDates = dates.length ? dates : [new Date().toISOString().split('T')[0]];
    const amounts = displayDates.map(d => dateTotals[d] || 0);

    // Calculate Daily Pace Benchmark Line
    const budgetRemaining = Math.max(0, appState.budgetGoal - scoped.reduce((a, c) => a + (parseFloat(c.amount) || 0), 0));
    const now = new Date();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const remainingDays = Math.max(1, daysInMonth - now.getDate() + 1);
    const dailyTargetVal = budgetRemaining / remainingDays;
    const paceBenchmarkData = displayDates.map(() => dailyTargetVal);

    barChartInstance = new Chart(barCtx, {
      type: 'bar',
      data: {
        labels: displayDates,
        datasets: [
          {
            label: `Daily Outflow (${currSym()})`,
            data: amounts,
            backgroundColor: '#D9822B',
            borderRadius: 6,
            order: 2
          },
          {
            label: `Daily Budget Pace Line (${currSym()})`,
            data: paceBenchmarkData,
            type: 'line',
            borderColor: '#E5943C',
            borderWidth: 2,
            borderDash: [5, 5],
            pointRadius: 3,
            pointBackgroundColor: '#E5943C',
            fill: false,
            order: 1
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: true, position: 'top', labels: { color: '#9598A3', font: { family: 'Plus Jakarta Sans', size: 11 } } }
        },
        scales: {
          x: { ticks: { color: '#9598A3', font: { family: 'Plus Jakarta Sans', size: 11 } }, grid: { display: false } },
          y: { ticks: { color: '#9598A3', font: { family: 'Plus Jakarta Sans', size: 11 } }, grid: { color: '#2D303C' } }
        }
      }
    });
  }
}

// Event Listeners
function setupEventListeners() {
  // Navigation Sidebar Toggle & Drawer Controls
  document.getElementById('sidebar-toggle-btn')?.addEventListener('click', () => {
    toggleSidebar();
  });

  document.getElementById('sidebar-backdrop')?.addEventListener('click', () => {
    toggleSidebar(false);
  });

  document.getElementById('sidebar-mini-budget-wrap')?.addEventListener('click', () => {
    toggleSidebar(true);
  });

  // Navigation Tabs
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      const tab = item.getAttribute('data-tab');
      switchTab(tab);
      toggleSidebar(false); // Close overlay drawer upon navigation
    });
  });

  // Privacy Mode Toggle on Dashboard Brand Button & Titlebar Logo Click
  document.getElementById('dashboard-brand-privacy-btn')?.addEventListener('click', () => {
    togglePrivacyMode();
  });

  document.getElementById('titlebar-logo-btn')?.addEventListener('click', () => {
    togglePrivacyMode();
  });

  // Multi-User Scope Filter in Dashboard Header
  document.getElementById('dashboard-scope-filter')?.addEventListener('change', (e) => {
    appState.dashboardScope = e.target.value;
    renderAll();
  });

  // Universal Command Palette Triggers (Ctrl+K)
  document.getElementById('btn-open-command-palette')?.addEventListener('click', () => {
    openCommandPalette();
  });

  document.getElementById('btn-close-palette')?.addEventListener('click', () => {
    closeCommandPalette();
  });

  document.getElementById('command-palette-input')?.addEventListener('input', (e) => {
    filterCommandPalette(e.target.value);
  });

  document.getElementById('command-palette-input')?.addEventListener('keydown', (e) => {
    handlePaletteKeydown(e);
  });

  // Notification Bell & Dropdown Popover
  const bellBtn = document.getElementById('btn-open-notifications');
  const notifDropdown = document.getElementById('notification-dropdown');

  bellBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    notifDropdown?.classList.toggle('hidden');
  });

  document.getElementById('btn-clear-notifications')?.addEventListener('click', () => {
    const list = document.getElementById('notification-list');
    if (list) list.innerHTML = '<div style="padding: 12px; font-size: 12px; color: var(--text-muted); text-align: center;">No new alerts. You\'re all caught up!</div>';
    const badge = document.getElementById('bell-badge-count');
    if (badge) badge.textContent = '0';
    showToast('Notifications marked as read');
  });

  // Jump from Split Widget to Household Tab
  document.getElementById('btn-jump-household-tab')?.addEventListener('click', () => {
    switchTab('household');
  });

  // Settle Selected Split Debts Button
  document.getElementById('btn-settle-selected-splits')?.addEventListener('click', async () => {
    await handleSettleSelectedSplits();
  });

  // Search & Filter Listeners
  document.getElementById('search-input')?.addEventListener('input', (e) => {
    appState.filterSearch = e.target.value;
    renderTable();
  });

  document.getElementById('filter-category')?.addEventListener('change', (e) => {
    appState.filterCategory = e.target.value;
    renderTable();
  });

  document.getElementById('filter-sort')?.addEventListener('change', (e) => {
    appState.filterSort = e.target.value;
    renderTable();
  });

  // Phase 5: Natural Language Single-Bar Express Entry ("1-Box Magic")
  const nlpInput = document.getElementById('express-nlp-input');
  const pillAmt = document.getElementById('pill-amt');
  const pillTitle = document.getElementById('pill-title');
  const pillCat = document.getElementById('pill-cat');
  const pillSplit = document.getElementById('pill-split');
  const pillPay = document.getElementById('pill-pay');
  const pillDate = document.getElementById('pill-date');
  let nlpTimer = null;

  nlpInput?.addEventListener('input', () => {
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
      if (window.electronAPI && window.electronAPI.nlpParse) {
        const parsed = await window.electronAPI.nlpParse(text, appState.householdMembers);
        if (parsed && parsed.tokens) {
          if (pillAmt) pillAmt.textContent = parsed.tokens.amountStr || `${currSym()}0.00`;
          if (pillTitle) pillTitle.textContent = parsed.tokens.titleStr || 'Title';
          if (pillCat) pillCat.textContent = parsed.tokens.categoryStr || 'Food & Dining';
          if (pillSplit) pillSplit.textContent = parsed.tokens.splitStr || 'Personal';
          if (pillPay) pillPay.textContent = parsed.tokens.paymentStr || 'UPI';
          if (pillDate) pillDate.textContent = parsed.tokens.dateStr || 'Today';
        }
      }
    }, 40);
  });

  document.getElementById('express-nlp-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = nlpInput?.value.trim();
    if (!text) return;

    if (window.electronAPI && window.electronAPI.nlpParse) {
      const parsed = await window.electronAPI.nlpParse(text, appState.householdMembers);
      if (parsed && parsed.amount > 0) {
        const expenseData = {
          title: parsed.title || 'Quick Expense',
          amount: parsed.amount,
          category: parsed.category || 'Miscellaneous',
          paymentMethod: parsed.paymentMethod || 'UPI / GPay',
          date: parsed.date || new Date().toISOString().split('T')[0],
          description: `Logged via 1-Box Magic ("${parsed.rawInput}")`,
          paidBy: appState.activeProfile ? appState.activeProfile.name : 'Self',
          splitWith: parsed.splitWith || [],
          isHouseholdExpense: Boolean(parsed.isHouseholdExpense)
        };

        await window.electronAPI.addExpense(expenseData);
        nlpInput.value = '';
        if (pillAmt) pillAmt.textContent = `${currSym()}0.00`;
        if (pillTitle) pillTitle.textContent = 'Title';

        // Visual Success Pulse & Continuous Rapid-Logging Auto-Refocus Loop (Refinement 1.A)
        const formWrap = document.getElementById('express-nlp-form');
        if (formWrap) {
          formWrap.classList.add('express-success-pulse');
          setTimeout(() => formWrap.classList.remove('express-success-pulse'), 350);
        }
        nlpInput.focus();

        showActionToast({
          icon: 'zap',
          title: `Logged "${expenseData.title}"`,
          amount: expenseData.amount,
          category: expenseData.category,
          subtext: `${expenseData.category} • ${expenseData.isHouseholdExpense ? 'Shared' : 'Personal'}`
        });

        await loadAppData();
        nlpInput.focus();
      } else {
        alert('Please enter an expense with a valid amount (e.g., "Chai 20", "Swiggy 350 with Priya", "Petrol 400 cc").');
      }
    }
  });

  // "What-If" Spending Impact Simulator Slider
  document.getElementById('what-if-range-slider')?.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value) || 0;
    updateWhatIfSimulation(val);
  });

  // Solo vs Household Workspace Mode Switcher
  document.getElementById('menu-toggle-workspace-mode')?.addEventListener('click', async () => {
    const current = appState.workspaceMode || 'household';
    const nextMode = current === 'household' ? 'solo' : 'household';
    await window.electronAPI.setWorkspaceMode(nextMode);
    appState.workspaceMode = nextMode;
    document.body.classList.toggle('mode-solo', nextMode === 'solo');
    document.getElementById('profile-quick-dropdown')?.classList.add('hidden');

    showActionToast({
      icon: nextMode === 'solo' ? 'user' : 'users',
      title: nextMode === 'solo' ? 'Solo Workspace Activated' : 'Household Workspace Activated',
      subtext: nextMode === 'solo' ? 'Streamlined 100% full-width ledger view' : 'Shared balances & multi-party split enabled'
    });

    await loadAppData();
  });

  // Smart Merchant Auto-Categorization & Dynamic Keyword Learning
  document.getElementById('form-title')?.addEventListener('input', async (e) => {
    const title = e.target.value.trim();
    if (title && window.electronAPI && window.electronAPI.predictCategory) {
      const predicted = await window.electronAPI.predictCategory(title);
      if (predicted) {
        const catSelect = document.getElementById('form-category');
        if (catSelect && catSelect.value !== predicted) {
          catSelect.value = predicted;
        }
      }
    }
  });

  document.getElementById('form-category')?.addEventListener('change', async (e) => {
    const title = document.getElementById('form-title')?.value.trim();
    const cat = e.target.value;
    if (title && cat && window.electronAPI && window.electronAPI.learnCategoryKeyword) {
      await window.electronAPI.learnCategoryKeyword(title, cat);
    }
  });

  // Global Direct Clipboard Image Paste (Ctrl+V)
  window.addEventListener('paste', async (e) => {
    const items = e.clipboardData && e.clipboardData.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        if (file) {
          const reader = new FileReader();
          reader.onload = async () => {
            const base64Data = reader.result;
            const res = await window.electronAPI.saveReceiptBuffer(base64Data);
            if (res && res.success) {
              appState.pendingReceiptFilename = res.filename;
              const filenameInput = document.getElementById('form-receipt-filename');
              const statusText = document.getElementById('receipt-status-text');
              if (filenameInput) filenameInput.value = res.filename;
              if (statusText) statusText.textContent = `Attached from Clipboard: ${res.filename}`;

              const modal = document.getElementById('expense-modal');
              if (modal && !modal.classList.contains('active')) {
                openAddModal();
                if (filenameInput) filenameInput.value = res.filename;
                if (statusText) statusText.textContent = `Attached from Clipboard: ${res.filename}`;
              }
              showActionToast({ icon: 'camera', title: 'Receipt Screenshot Attached', subtext: res.filename });
            }
          };
          reader.readAsDataURL(file);
          break;
        }
      }
    }
  });

  // Real-time Updates from Quick-Add Pill Widget
  if (window.electronAPI && window.electronAPI.onDataUpdated) {
    window.electronAPI.onDataUpdated(async (info) => {
      await loadAppData();
      showActionToast({ icon: 'zap', title: 'Quick Pill Expense Logged', subtext: 'Logged via desktop floating widget' });
    });
  }

  // Preset Modal Open & Handlers
  document.getElementById('btn-open-add-preset')?.addEventListener('click', () => {
    openAddPresetModal();
  });

  document.getElementById('preset-modal-close')?.addEventListener('click', closePresetModal);
  document.getElementById('preset-cancel-btn')?.addEventListener('click', closePresetModal);

  document.getElementById('preset-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('form-preset-id').value;
    const presetData = {
      icon: document.getElementById('preset-form-icon').value || 'tag',
      title: document.getElementById('preset-form-title').value,
      amount: parseFloat(document.getElementById('preset-form-amount').value),
      category: document.getElementById('preset-form-category').value,
      paymentMethod: document.getElementById('preset-form-payment').value
    };

    if (id) {
      presetData.id = id;
      await window.electronAPI.updatePreset(presetData);
    } else {
      await window.electronAPI.addPreset(presetData);
    }

    closePresetModal();
    await loadAppData();
  });

  document.getElementById('preset-delete-btn')?.addEventListener('click', async () => {
    const id = document.getElementById('form-preset-id').value;
    if (id && confirm('Delete this preset chip?')) {
      await window.electronAPI.deletePreset(id);
      closePresetModal();
      await loadAppData();
    }
  });

  // Receipt Selection Button
  document.getElementById('btn-select-receipt')?.addEventListener('click', async () => {
    const res = await window.electronAPI.selectReceiptFile();
    if (res.success && res.filePath) {
      const saveRes = await window.electronAPI.saveReceipt(res.filePath);
      if (saveRes.success) {
        appState.pendingReceiptFilename = saveRes.filename;
        document.getElementById('form-receipt-filename').value = saveRes.filename;
        document.getElementById('receipt-status-text').textContent = `Attached: ${saveRes.filename}`;
      }
    }
  });

  document.getElementById('btn-remove-receipt')?.addEventListener('click', () => {
    appState.pendingReceiptFilename = null;
    document.getElementById('form-receipt-filename').value = '';
    document.getElementById('receipt-status-text').textContent = 'No receipt image attached';
    document.getElementById('receipt-preview-box').classList.add('hidden');
  });

  // Modal Triggers
  document.getElementById('btn-open-add-modal')?.addEventListener('click', () => {
    openAddModal();
  });

  document.getElementById('modal-close-btn')?.addEventListener('click', closeModal);
  document.getElementById('form-cancel-btn')?.addEventListener('click', closeModal);

  // Household split checkbox in expense modal
  document.getElementById('form-is-household')?.addEventListener('change', (e) => {
    document.getElementById('form-split-options')?.classList.toggle('hidden', !e.target.checked);
  });

  // Expense Form Submit
  document.getElementById('expense-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('form-expense-id').value;
    const isHousehold = document.getElementById('form-is-household')?.checked;
    
    let splitWithMembers = [];
    if (isHousehold) {
      document.querySelectorAll('input[name="split-member"]:checked').forEach(cb => {
        splitWithMembers.push(cb.value);
      });
    }

    const expenseData = {
      title: document.getElementById('form-title').value,
      amount: parseFloat(document.getElementById('form-amount').value),
      date: document.getElementById('form-date').value,
      category: document.getElementById('form-category').value,
      paymentMethod: document.getElementById('form-payment').value,
      description: document.getElementById('form-description').value,
      receiptFilename: document.getElementById('form-receipt-filename').value || null,
      paidBy: document.getElementById('form-paid-by')?.value || 'Self',
      splitWith: splitWithMembers,
      isHouseholdExpense: isHousehold
    };

    if (id) {
      expenseData.id = id;
      await window.electronAPI.updateExpense(expenseData);
    } else {
      await window.electronAPI.addExpense(expenseData);
    }

    closeModal();
    await loadAppData();
  });

  // Batch Spreadsheet Handlers
  document.getElementById('btn-add-batch-row')?.addEventListener('click', () => {
    addBatchRow();
  });

  document.getElementById('btn-save-batch-all')?.addEventListener('click', async () => {
    await saveAllBatchRows();
  });

  // Salary Modal Handlers & Dynamic 3-Segment Preview (Refinement 2.A)
  function updateSalaryModalPreview() {
    const income = parseFloat(document.getElementById('salary-input-income')?.value) || 0;
    const bills = parseFloat(document.getElementById('salary-input-bills')?.value) || 0;
    const savings = parseFloat(document.getElementById('salary-input-savings')?.value) || 0;

    const discretionary = Math.max(0, income - bills - savings);
    const now = new Date();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const daily = discretionary / daysInMonth;

    const discEl = document.getElementById('salary-calc-discretionary');
    const dailyEl = document.getElementById('salary-calc-daily');
    if (discEl) discEl.textContent = `${formatCurrency(discretionary)}`;
    if (dailyEl) dailyEl.textContent = `${formatCurrency(daily)}/day`;

    // Update Visual 3-Segment Stacked Salary Breakdown Bar in Modal
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

  const openSalaryModal = () => {
    const s = appState.salaryConfig || { monthlyIncome: 60000, fixedBills: 20000, savingsGoal: 10000 };
    document.getElementById('salary-input-income').value = s.monthlyIncome;
    document.getElementById('salary-input-bills').value = s.fixedBills;
    document.getElementById('salary-input-savings').value = s.savingsGoal;
    updateSalaryModalPreview();
    document.getElementById('salary-modal').classList.add('active');
  };

  document.getElementById('btn-open-salary-modal')?.addEventListener('click', openSalaryModal);
  document.getElementById('edit-salary-btn')?.addEventListener('click', openSalaryModal);
  document.getElementById('salary-modal-close')?.addEventListener('click', () => {
    document.getElementById('salary-modal').classList.remove('active');
  });
  document.getElementById('salary-cancel-btn')?.addEventListener('click', () => {
    document.getElementById('salary-modal').classList.remove('active');
  });

  const salaryInputs = ['salary-input-income', 'salary-input-bills', 'salary-input-savings', 'salary-input-payday', 'salary-input-actual-date'];
  salaryInputs.forEach(id => {
    document.getElementById(id)?.addEventListener('input', updateSalaryModalPreview);
    document.getElementById(id)?.addEventListener('change', updateSalaryModalPreview);
  });

  document.getElementById('salary-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const income = parseFloat(document.getElementById('salary-input-income').value) || 0;
    const bills = parseFloat(document.getElementById('salary-input-bills').value) || 0;
    const savings = parseFloat(document.getElementById('salary-input-savings').value) || 0;
    const payday = parseInt(document.getElementById('salary-input-payday').value, 10) || 1;
    const actualDate = document.getElementById('salary-input-actual-date').value || null;
    const nextOverride = document.getElementById('salary-input-next-override').value || null;

    await window.electronAPI.setSalaryConfig({
      monthlyIncome: income,
      fixedBills: bills,
      savingsGoal: savings,
      payday: payday,
      currentCycleStartDate: actualDate,
      nextPaydayOverride: nextOverride,
      currencySymbol: appState.salaryConfig?.currencySymbol || '₹'
    });

    document.getElementById('salary-modal').classList.remove('active');
    showToast('Salary & Payday Allocation updated!');
    await loadAppData();
  });

  // Settings Workspace Form Listeners (v1.2 Phase 2)
  const settingsSalaryInputs = ['settings-salary-income', 'settings-salary-bills', 'settings-salary-savings', 'settings-salary-payday', 'settings-salary-actual-date', 'settings-salary-next-override'];
  settingsSalaryInputs.forEach(id => {
    document.getElementById(id)?.addEventListener('input', updateSettingsCycleBanner);
    document.getElementById(id)?.addEventListener('change', updateSettingsCycleBanner);
  });

  document.getElementById('settings-salary-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const income = parseFloat(document.getElementById('settings-salary-income')?.value) || 0;
    const bills = parseFloat(document.getElementById('settings-salary-bills')?.value) || 0;
    const savings = parseFloat(document.getElementById('settings-salary-savings')?.value) || 0;
    const payday = parseInt(document.getElementById('settings-salary-payday')?.value, 10) || 1;
    const actualDate = document.getElementById('settings-salary-actual-date')?.value || null;
    const nextOverride = document.getElementById('settings-salary-next-override')?.value || null;

    await window.electronAPI.setSalaryConfig({
      monthlyIncome: income,
      fixedBills: bills,
      savingsGoal: savings,
      payday: payday,
      currentCycleStartDate: actualDate,
      nextPaydayOverride: nextOverride,
      currencySymbol: appState.salaryConfig?.currencySymbol || '₹'
    });

    showToast('Salary & Payday Cycle configuration saved!');
    await loadAppData();
    renderSettingsWorkspace();
  });

  document.getElementById('settings-save-prefs-btn')?.addEventListener('click', async () => {
    const curr = document.getElementById('settings-pref-currency')?.value || '₹';
    const mode = document.getElementById('settings-pref-workspace-mode')?.value || 'household';

    const curConfig = appState.salaryConfig || { monthlyIncome: 60000, fixedBills: 20000, savingsGoal: 10000, payday: 1 };
    curConfig.currencySymbol = curr;
    await window.electronAPI.setSalaryConfig(curConfig);

    await window.electronAPI.setWorkspaceMode(mode);
    appState.workspaceMode = mode;
    document.body.classList.toggle('mode-solo', mode === 'solo');

    showToast('Application preferences saved!');
    await loadAppData();
    renderSettingsWorkspace();
  });

  // Initialize Settings Sub-Tab Navigation & Shift Chips (v1.2 Phase 2)
  initSettingsSubTabs();
  initShiftChips();

  // Member Manager Modal Handlers
  document.getElementById('btn-manage-members')?.addEventListener('click', () => {
    document.getElementById('member-modal').classList.add('active');
  });
  document.getElementById('member-modal-close')?.addEventListener('click', () => {
    document.getElementById('member-modal').classList.remove('active');
  });
  document.getElementById('member-close-btn')?.addEventListener('click', () => {
    document.getElementById('member-modal').classList.remove('active');
  });

  document.getElementById('add-member-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = document.getElementById('new-member-name');
    const name = input.value.trim();
    if (name) {
      const res = await window.electronAPI.addHouseholdMember(name);
      if (res.success) {
        input.value = '';
        await loadAppData();
        showToast(`Added ${name} to household!`);
      } else {
        alert(res.error);
      }
    }
  });

  // Desktop File Export Listeners & Filtered Export Dialog (Refinement 6.C)
  let pendingExportType = 'csv';

  const openExportScopeModal = (type) => {
    pendingExportType = type;
    const now = new Date();
    const monthStr = now.toISOString().substring(0, 7);
    const monthCount = (appState.expenses || []).filter(e => e.date && e.date.startsWith(monthStr)).length;
    const allCount = (appState.expenses || []).length;

    const monthLabel = document.getElementById('export-month-count-label');
    const allLabel = document.getElementById('export-all-count-label');
    if (monthLabel) monthLabel.textContent = `Export current month (${monthCount} transactions)`;
    if (allLabel) allLabel.textContent = `Export full history (${allCount} transactions)`;

    document.getElementById('export-scope-modal')?.classList.add('active');
  };

  document.getElementById('btn-export-csv')?.addEventListener('click', () => openExportScopeModal('csv'));
  document.getElementById('btn-export-excel')?.addEventListener('click', () => openExportScopeModal('excel'));
  document.getElementById('export-scope-modal-close')?.addEventListener('click', () => {
    document.getElementById('export-scope-modal')?.classList.remove('active');
  });
  document.getElementById('export-scope-cancel-btn')?.addEventListener('click', () => {
    document.getElementById('export-scope-modal')?.classList.remove('active');
  });

  document.getElementById('btn-export-this-month')?.addEventListener('click', async () => {
    document.getElementById('export-scope-modal')?.classList.remove('active');
    const res = pendingExportType === 'excel' 
      ? await window.electronAPI.exportExcel() 
      : await window.electronAPI.exportCSV();
    if (res && res.success) {
      showToast(`Exported ${pendingExportType.toUpperCase()} file successfully!`);
    } else if (res && !res.canceled) {
      alert(`Export Failed: ${res.error}`);
    }
  });

  document.getElementById('btn-export-all-time')?.addEventListener('click', async () => {
    document.getElementById('export-scope-modal')?.classList.remove('active');
    const res = pendingExportType === 'excel' 
      ? await window.electronAPI.exportExcel() 
      : await window.electronAPI.exportCSV();
    if (res && res.success) {
      showToast(`Exported all-time ${pendingExportType.toUpperCase()} file!`);
    } else if (res && !res.canceled) {
      alert(`Export Failed: ${res.error}`);
    }
  });

  document.getElementById('btn-export-json')?.addEventListener('click', async () => {
    const res = await window.electronAPI.exportJSON();
    if (res.success) {
      alert(`JSON Backup saved to:\n${res.filePath}`);
    } else if (!res.canceled) {
      alert(`Export Failed: ${res.error}`);
    }
  });

  // Phase 5: File Import Button & Dialog
  document.getElementById('btn-import-file')?.addEventListener('click', async () => {
    const res = await window.electronAPI.importFile();
    handleImportResult(res);
  });

  // Import Modal Controls
  document.getElementById('import-modal-close')?.addEventListener('click', closeImportModal);
  document.getElementById('import-cancel-btn')?.addEventListener('click', closeImportModal);

  document.getElementById('btn-confirm-import')?.addEventListener('click', async () => {
    if (!appState.importPendingExpenses || appState.importPendingExpenses.length === 0) return;
    
    // Filter only checked items (Refinement 6.B)
    const checkedRows = Array.from(document.querySelectorAll('.import-row-checkbox:checked'));
    const selectedExpenses = checkedRows.map(cb => {
      const idx = parseInt(cb.getAttribute('data-idx'), 10);
      return appState.importPendingExpenses[idx];
    }).filter(Boolean);

    if (selectedExpenses.length === 0) {
      alert('Please select at least one record to import.');
      return;
    }

    const res = await window.electronAPI.confirmImport(selectedExpenses);
    closeImportModal();
    if (res.success) {
      showToast(`Successfully imported ${res.imported} expense records!`);
      await loadAppData();
    } else {
      alert(`Import error: ${res.errors?.join(', ') || 'Failed to insert expenses'}`);
    }
  });

  // Phase 5: Notes Search & Filter Listeners
  document.getElementById('notes-search-input')?.addEventListener('input', (e) => {
    appState.filterNotesSearch = e.target.value;
    renderNotes();
  });

  document.getElementById('filter-notes-relation')?.addEventListener('change', (e) => {
    appState.filterNotesRelation = e.target.value;
    renderNotes();
  });

  // Notes Modal Controls
  document.getElementById('btn-open-add-note-modal')?.addEventListener('click', () => {
    openAddNoteModal();
  });

  document.getElementById('note-modal-close')?.addEventListener('click', closeNoteModal);
  document.getElementById('note-cancel-btn')?.addEventListener('click', closeNoteModal);

  document.getElementById('form-note-relation')?.addEventListener('change', (e) => {
    updateNoteTargetInput(e.target.value);
  });

  document.getElementById('note-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('form-note-id').value;
    const relation = document.getElementById('form-note-relation').value;
    const relationId = document.getElementById('form-note-relation-id').value.trim();
    const content = document.getElementById('form-note-content').value.trim();

    if (!content) return;

    if (id) {
      await window.electronAPI.updateNote({ id, content });
      showToast('Note updated!');
    } else {
      await window.electronAPI.addNote({ content, relation, relationId });
      showToast('Contextual note created!');
    }

    closeNoteModal();
    await loadAppData();
    if (appState.currentTab === 'notes') renderNotes();
  });

  document.getElementById('note-delete-btn')?.addEventListener('click', async () => {
    const id = document.getElementById('form-note-id').value;
    if (id && confirm('Delete this note?')) {
      await window.electronAPI.deleteNote(id);
      closeNoteModal();
      showToast('Note deleted');
      await loadAppData();
      if (appState.currentTab === 'notes') renderNotesWorkspace();
    }
  });

  // =========================================================================
  // Phase 4: Household Split, Recurring Bills & Settle-Up Handlers
  // =========================================================================
  document.getElementById('btn-open-manage-members-hub')?.addEventListener('click', () => {
    document.getElementById('member-modal').classList.add('active');
  });

  document.getElementById('btn-open-add-recurring-bill')?.addEventListener('click', () => {
    openAddRecurringBillModal();
  });

  document.getElementById('recurring-bill-modal-close')?.addEventListener('click', closeRecurringBillModal);
  document.getElementById('recurring-bill-cancel-btn')?.addEventListener('click', closeRecurringBillModal);

  document.getElementById('recurring-bill-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('recurring-bill-id').value;
    const billData = {
      title: document.getElementById('recurring-bill-title').value.trim(),
      icon: document.getElementById('recurring-bill-icon').value.trim() || 'zap',
      amount: parseFloat(document.getElementById('recurring-bill-amount').value) || 0,
      dueDay: parseInt(document.getElementById('recurring-bill-dueday').value) || 10,
      category: document.getElementById('recurring-bill-category').value,
      paidBy: document.getElementById('recurring-bill-paidby').value,
      frequency: document.getElementById('recurring-bill-frequency').value
    };
    if (id) billData.id = id;

    await window.electronAPI.saveRecurringBill(billData);
    closeRecurringBillModal();
    showToast(`Saved recurring bill "${billData.title}"!`);
    await loadAppData();
    if (appState.currentTab === 'household') renderHouseholdWorkspace();
  });

  document.getElementById('recurring-bill-delete-btn')?.addEventListener('click', async () => {
    const id = document.getElementById('recurring-bill-id').value;
    if (id && confirm('Delete this recurring utility bill?')) {
      await window.electronAPI.deleteRecurringBill(id);
      closeRecurringBillModal();
      showToast('Recurring bill deleted');
      await loadAppData();
      if (appState.currentTab === 'household') renderHouseholdWorkspace();
    }
  });

  document.getElementById('settle-modal-close')?.addEventListener('click', closeSettleModal);
  document.getElementById('settle-cancel-btn')?.addEventListener('click', closeSettleModal);

  document.getElementById('settle-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const from = document.getElementById('settle-from-select').value;
    const to = document.getElementById('settle-to-select').value;
    const amount = parseFloat(document.getElementById('settle-amount-input').value) || 0;
    const paymentMethod = document.getElementById('settle-method-select').value;
    const date = document.getElementById('settle-date-input').value;
    const notes = document.getElementById('settle-notes-input').value.trim();

    if (from === to) {
      alert('Payer and Recipient must be different members.');
      return;
    }

    if (amount <= 0) {
      alert('Please enter a valid positive settlement amount.');
      return;
    }

    await window.electronAPI.addSettlement({ from, to, amount, paymentMethod, date, notes });
    closeSettleModal();
    showToast(`Recorded repayment: ${formatCurrency(amount)} from ${from} to ${to}!`);
    await loadAppData();
    if (appState.currentTab === 'household') renderHouseholdWorkspace();
  });

  // =========================================================================
  // Phase 4: Expense Feed Filter & Sort Handlers
  // =========================================================================
  document.getElementById('feed-search-input')?.addEventListener('input', (e) => {
    appState.feedFilters.search = e.target.value;
    appState.feedPage = 1;
    renderExpenseFeedWorkspace();
  });

  document.getElementById('feed-filter-category')?.addEventListener('change', (e) => {
    appState.feedFilters.category = e.target.value;
    appState.feedPage = 1;
    renderExpenseFeedWorkspace();
  });

  document.getElementById('feed-filter-payment')?.addEventListener('change', (e) => {
    appState.feedFilters.paymentMethod = e.target.value;
    appState.feedPage = 1;
    renderExpenseFeedWorkspace();
  });

  document.getElementById('feed-filter-member')?.addEventListener('change', (e) => {
    appState.feedFilters.member = e.target.value;
    appState.feedPage = 1;
    renderExpenseFeedWorkspace();
  });

  document.getElementById('feed-filter-date-range')?.addEventListener('change', (e) => {
    appState.feedFilters.dateRange = e.target.value;
    appState.feedPage = 1;
    renderExpenseFeedWorkspace();
  });

  document.getElementById('feed-btn-reset-filters')?.addEventListener('click', () => {
    appState.feedFilters = { search: '', category: 'ALL', paymentMethod: 'ALL', member: 'ALL', dateRange: 'ALL' };
    const searchInput = document.getElementById('feed-search-input');
    const catSelect = document.getElementById('feed-filter-category');
    const paySelect = document.getElementById('feed-filter-payment');
    const memSelect = document.getElementById('feed-filter-member');
    const dateSelect = document.getElementById('feed-filter-date-range');

    if (searchInput) searchInput.value = '';
    if (catSelect) catSelect.value = 'ALL';
    if (paySelect) paySelect.value = 'ALL';
    if (memSelect) memSelect.value = 'ALL';
    if (dateSelect) dateSelect.value = 'ALL';

    appState.feedPage = 1;
    renderExpenseFeedWorkspace();
  });

  document.getElementById('feed-select-all-checkbox')?.addEventListener('change', (e) => {
    const isChecked = e.target.checked;
    document.querySelectorAll('.feed-row-checkbox').forEach(cb => {
      cb.checked = isChecked;
      const id = cb.getAttribute('data-id');
      if (id) {
        if (isChecked) appState.feedSelectedIds.add(id);
        else appState.feedSelectedIds.delete(id);
      }
    });
    updateFeedStickyBatchBar();
  });

  document.getElementById('feed-btn-deselect-all')?.addEventListener('click', () => {
    appState.feedSelectedIds.clear();
    document.querySelectorAll('.feed-row-checkbox').forEach(cb => cb.checked = false);
    updateFeedStickyBatchBar();
  });

  document.getElementById('feed-btn-bulk-delete')?.addEventListener('click', async () => {
    if (appState.feedSelectedIds.size === 0) return;
    const totalSelected = appState.feedSelectedIds.size;
    if (confirm(`Delete all ${totalSelected} selected transaction records?`)) {
      let deletedCount = 0;
      let failedCount = 0;
      for (const id of appState.feedSelectedIds) {
        const res = await window.electronAPI.deleteExpense(id);
        if (res && res.success) deletedCount++;
        else failedCount++;
      }
      if (failedCount > 0) {
        showToast(`Deleted ${deletedCount} records (${failedCount} not found)`);
      } else {
        showToast(`Deleted ${deletedCount} record(s) successfully`);
      }
      appState.feedSelectedIds.clear();
      await loadAppData();
      renderExpenseFeedWorkspace();
    }
  });

  document.getElementById('feed-btn-bulk-export')?.addEventListener('click', async () => {
    const res = await window.electronAPI.exportCSV();
    if (res.success) {
      showToast(`Exported CSV successfully!`);
    }
  });

  document.getElementById('feed-btn-prev-page')?.addEventListener('click', () => {
    if (appState.feedPage > 1) {
      appState.feedPage--;
      renderExpenseFeedWorkspace();
    }
  });

  document.getElementById('feed-btn-next-page')?.addEventListener('click', () => {
    appState.feedPage++;
    renderExpenseFeedWorkspace();
  });

  document.getElementById('th-sort-date')?.addEventListener('click', () => toggleFeedSort('date'));
  document.getElementById('th-sort-title')?.addEventListener('click', () => toggleFeedSort('title'));
  document.getElementById('th-sort-category')?.addEventListener('click', () => toggleFeedSort('category'));
  document.getElementById('th-sort-amount')?.addEventListener('click', () => toggleFeedSort('amount'));

  // Batch paste & clear empty
  document.getElementById('btn-batch-paste-clipboard')?.addEventListener('click', handlePasteBatchFromClipboard);
  document.getElementById('btn-batch-clear-empty')?.addEventListener('click', () => {
    document.querySelectorAll('#batch-table-body tr').forEach(tr => {
      const title = tr.querySelector('.batch-title')?.value.trim();
      const amount = tr.querySelector('.batch-amount')?.value.trim();
      if (!title && !amount) tr.remove();
    });
    updateBatchRowNumbers();
    if (document.querySelectorAll('#batch-table-body tr').length === 0) {
      addBatchRow();
    }
  });

  // Notes filter pills
  document.querySelectorAll('.notes-filter-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.notes-filter-pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      appState.activeNoteRelation = btn.getAttribute('data-relation') || 'ALL';
      renderNotesWorkspace();
    });
  });

  // =========================================================================
  // Master Account Authentication & Tab Handlers
  // =========================================================================
  document.getElementById('auth-tab-login')?.addEventListener('click', () => {
    showAuthScreen('login');
  });

  document.getElementById('auth-tab-signup')?.addEventListener('click', () => {
    showAuthScreen('signup');
  });

  document.getElementById('auth-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const userId = document.getElementById('auth-input-userid')?.value.trim();
    const password = document.getElementById('auth-input-password')?.value;
    const rememberMe = document.getElementById('auth-remember-me')?.checked ?? true;
    const errorBanner = document.getElementById('auth-error-banner');

    if (errorBanner) errorBanner.classList.add('hidden');

    if (appState.authMode === 'signup') {
      const res = await window.electronAPI.setupAccount({ userId, password, rememberMe });
      if (!res.success) {
        if (errorBanner) {
          errorBanner.textContent = res.error || 'Failed to create account';
          errorBanner.classList.remove('hidden');
        }
        return;
      }
      showToast(`Master account created for "${userId}"!`);
      appState.account = await window.electronAPI.getAccountStatus();
      await showProfilePickerScreen();
    } else {
      const res = await window.electronAPI.loginAccount({ userId, password, rememberMe });
      if (!res.success) {
        if (errorBanner) {
          errorBanner.textContent = res.error || 'Invalid credentials';
          errorBanner.classList.remove('hidden');
        }
        return;
      }
      showToast(`Welcome back, ${userId}!`);
      appState.account = await window.electronAPI.getAccountStatus();
      await showProfilePickerScreen();
    }
  });

  // =========================================================================
  // Profile Picker Screen Handlers (Phase 2)
  // =========================================================================
  document.getElementById('btn-picker-signout')?.addEventListener('click', async () => {
    await logoutUserSession();
  });

  document.getElementById('btn-picker-add-person')?.addEventListener('click', () => {
    openPersonModal();
  });

  document.getElementById('btn-picker-manage')?.addEventListener('click', async () => {
    await openManageProfilesModal();
  });

  document.getElementById('btn-manage-profiles-close')?.addEventListener('click', () => {
    closeManageProfilesModal();
  });

  document.getElementById('btn-manage-profiles-done')?.addEventListener('click', () => {
    closeManageProfilesModal();
  });

  document.getElementById('btn-manage-add-person')?.addEventListener('click', () => {
    closeManageProfilesModal();
    openPersonModal();
  });

  // =========================================================================
  // Person Profile Create / Edit Modal & Emoji Grid Handlers
  // =========================================================================
  document.getElementById('person-modal-close')?.addEventListener('click', () => {
    closePersonModal();
  });

  document.getElementById('btn-cancel-person')?.addEventListener('click', () => {
    closePersonModal();
  });

  // Avatar Color Strip Selection
  document.querySelectorAll('#avatar-color-strip .color-dot-opt').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const color = btn.getAttribute('data-color') || '#D9822B';
      selectAvatarColor(color);
    });
  });

  document.getElementById('person-form-name')?.addEventListener('input', () => {
    updatePersonAvatarPreview();
  });

  document.getElementById('person-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('person-form-id').value;
    const name = document.getElementById('person-form-name').value.trim();
    const avatar = document.getElementById('person-form-avatar')?.value || '#D9822B';
    const color = avatar;

    if (!name) return;

    if (id) {
      const res = await window.electronAPI.updateProfile({ id, name, color, avatar });
      if (res.success) {
        showToast(`Profile "${name}" updated!`);
      } else {
        alert(res.error || 'Failed to update profile');
      }
    } else {
      const res = await window.electronAPI.createProfile({ name, color, avatar });
      if (res.success) {
        showToast(`Welcome, ${name}! Profile created.`);
        closePersonModal();
        await enterUserDashboard(res.profile.id);
        return;
      } else {
        alert(res.error || 'Failed to create profile');
      }
    }

    closePersonModal();
    await renderProfilePickerGrid();
    if (!document.getElementById('main-app-container').classList.contains('hidden')) {
      await loadAppData();
    }
  });

  document.getElementById('btn-delete-person')?.addEventListener('click', async () => {
    const id = document.getElementById('person-form-id').value;
    if (!id) return;
    if (confirm('Are you sure you want to delete this profile and all its stored records?')) {
      const res = await window.electronAPI.deleteProfile(id);
      if (res.success) {
        showToast('Profile deleted');
        closePersonModal();
        await renderProfilePickerGrid();
      } else {
        alert(res.error || 'Cannot delete profile');
      }
    }
  });

  // =========================================================================
  // Top-Left In-App Profile Switcher Dropdown Handlers
  // =========================================================================
  const profileChip = document.getElementById('btn-open-profile-switcher');
  const profileDropdown = document.getElementById('profile-quick-dropdown');

  profileChip?.addEventListener('click', (e) => {
    e.stopPropagation();
    profileDropdown?.classList.toggle('hidden');
  });

  window.addEventListener('click', (e) => {
    if (profileDropdown && !profileDropdown.contains(e.target) && !profileChip.contains(e.target)) {
      profileDropdown.classList.add('hidden');
    }
  });

  document.getElementById('menu-switch-person')?.addEventListener('click', async () => {
    profileDropdown?.classList.add('hidden');
    await showProfilePickerScreen();
  });

  document.getElementById('menu-add-person')?.addEventListener('click', () => {
    profileDropdown?.classList.add('hidden');
    openPersonModal();
  });

  document.getElementById('menu-sign-out')?.addEventListener('click', async () => {
    profileDropdown?.classList.add('hidden');
    await logoutUserSession();
  });
}

function updateSalaryModalPreview() {
  const income = parseFloat(document.getElementById('salary-input-income')?.value) || 0;
  const bills = parseFloat(document.getElementById('salary-input-bills')?.value) || 0;
  const savings = parseFloat(document.getElementById('salary-input-savings')?.value) || 0;
  const discretionary = Math.max(0, income - bills - savings);
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daily = daysInMonth > 0 ? discretionary / daysInMonth : 0;

  const discEl = document.getElementById('salary-calc-discretionary');
  const dailyEl = document.getElementById('salary-calc-daily');
  if (discEl) discEl.textContent = `${formatCurrency(discretionary)}`;
  if (dailyEl) dailyEl.textContent = `${formatCurrency(daily)}/day (${daysInMonth} days)`;
}

// Navigation Tab Switcher (Phase 4)
function switchTab(tabName) {
  appState.currentTab = tabName;
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.getAttribute('data-tab') === tabName);
  });

  const dashboardView = document.getElementById('view-dashboard');
  const batchView = document.getElementById('view-batch');
  const householdView = document.getElementById('view-household');
  const notesView = document.getElementById('view-notes');
  const expensesView = document.getElementById('view-expenses');
  const settingsView = document.getElementById('view-settings');

  dashboardView?.classList.add('hidden');
  batchView?.classList.add('hidden');
  householdView?.classList.add('hidden');
  notesView?.classList.add('hidden');
  expensesView?.classList.add('hidden');
  settingsView?.classList.add('hidden');

  if (tabName === 'batch') {
    batchView?.classList.remove('hidden');
    document.getElementById('page-title').textContent = 'Batch Entry Spreadsheet';
    document.getElementById('page-subtitle').textContent = 'Rapid multi-row keyboard transaction entry';
    renderBatchTable();
  } else if (tabName === 'household') {
    householdView?.classList.remove('hidden');
    document.getElementById('page-title').textContent = 'Household Shared Balances & Settlements';
    document.getElementById('page-subtitle').textContent = 'Track multi-party split expenses, recurring utility bills, and pairwise debts';
    renderHouseholdWorkspace();
  } else if (tabName === 'expenses') {
    expensesView?.classList.remove('hidden');
    document.getElementById('page-title').textContent = 'Expense Feed & Transaction Explorer';
    document.getElementById('page-subtitle').textContent = 'Search, filter, sort, and manage all your stored financial records';
    renderExpenseFeedWorkspace();
  } else if (tabName === 'notes') {
    notesView?.classList.remove('hidden');
    document.getElementById('page-title').textContent = 'Contextual Financial Notes';
    document.getElementById('page-subtitle').textContent = 'Memos, reflections, and insights linked to transactions, days, weeks, or months';
    renderNotesWorkspace();
  } else if (tabName === 'settings') {
    settingsView?.classList.remove('hidden');
    document.getElementById('page-title').textContent = 'General Settings & Preferences';
    document.getElementById('page-subtitle').textContent = 'Configure salary cycles, currency, payday buffers, and data management';
    renderSettingsWorkspace();
  } else {
    // Default: Dashboard
    dashboardView?.classList.remove('hidden');
    document.getElementById('page-title').textContent = 'Financial Dashboard';
    document.getElementById('page-subtitle').textContent = 'Track, categorize, and control your desktop expense records';
    renderMetrics();
    renderCharts();
  }
  updateSidebarNavIcons(tabName);
  if (typeof hydrateIcons === 'function') hydrateIcons();
}

// Ledgerly v1.2 Phase 1: Dynamic Navigation Icon State Morphing
function updateSidebarNavIcons(activeTab) {
  const dashIcon = document.getElementById('nav-icon-dashboard');
  const expenseIcon = document.getElementById('nav-icon-expenses');

  if (dashIcon && typeof icon === 'function') {
    // When Dashboard is active -> declining bar graph; else standard bar chart
    dashIcon.innerHTML = activeTab === 'dashboard' ? icon('bar-chart-declining', 20) : icon('bar-chart-2', 20);
  }

  if (expenseIcon && typeof icon === 'function') {
    // When Expense Feed is active -> bill / receipt icon; else banknote money icon
    expenseIcon.innerHTML = activeTab === 'expenses' ? icon('receipt', 20) : icon('banknote', 20);
  }
}

// ==========================================================================
// Phase 4: Keyboard-First Batch Entry Spreadsheet Functions
// ==========================================================================

function updateBatchRowNumbers() {
  document.querySelectorAll('#batch-table-body tr').forEach((tr, idx) => {
    const numCell = tr.querySelector('.batch-row-num');
    if (numCell) numCell.textContent = idx + 1;
  });
  updateBatchRunningTotal();
}

function updateBatchRunningTotal() {
  const rows = document.querySelectorAll('#batch-table-body tr');
  let total = 0;
  let validCount = 0;

  rows.forEach(tr => {
    const title = tr.querySelector('.batch-title')?.value.trim();
    const amt = parseFloat(tr.querySelector('.batch-amount')?.value);
    if (!isNaN(amt) && amt > 0) {
      total += amt;
      if (title) validCount++;
    }
  });

  const totalRowsEl = document.getElementById('batch-total-rows');
  const validRowsEl = document.getElementById('batch-valid-rows');
  const liveTotalEl = document.getElementById('batch-live-total');

  if (totalRowsEl) totalRowsEl.textContent = rows.length;
  if (validRowsEl) validRowsEl.textContent = validCount;
  if (liveTotalEl) liveTotalEl.textContent = `${formatCurrency(total)}`;
}

function renderBatchTable() {
  const tbody = document.getElementById('batch-table-body');
  if (!tbody) return;
  tbody.innerHTML = '';
  for (let i = 0; i < 4; i++) {
    addBatchRow();
  }
  updateBatchRunningTotal();
}

function resolveDateShorthand(val) {
  if (!val) return new Date().toISOString().split('T')[0];
  const clean = String(val).trim().toLowerCase();
  const today = new Date();

  if (clean === 't' || clean === 'today') {
    return today.toISOString().split('T')[0];
  }
  if (clean === 'y' || clean === 'yesterday') {
    today.setDate(today.getDate() - 1);
    return today.toISOString().split('T')[0];
  }
  if (/^-\d+$/.test(clean)) {
    const daysAgo = parseInt(clean.replace('-', ''), 10);
    today.setDate(today.getDate() - daysAgo);
    return today.toISOString().split('T')[0];
  }
  if (/^\d{1,2}$/.test(clean)) {
    const dayNum = parseInt(clean, 10);
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}-${String(dayNum).padStart(2, '0')}`;
  }
  return val;
}

function addBatchRow(initialData = null) {
  const tbody = document.getElementById('batch-table-body');
  if (!tbody) return;

  const today = new Date().toISOString().split('T')[0];
  const tr = document.createElement('tr');
  const catOptions = appState.categories.map(c => `<option value="${c}">${c}</option>`).join('');

  const d = initialData || {
    date: today,
    title: '',
    amount: '',
    category: appState.categories[0] || 'Food & Dining',
    paymentMethod: 'UPI / GPay',
    description: ''
  };

  tr.innerHTML = `
    <td class="batch-row-num" style="font-family: var(--font-mono); font-size: 11px; color: var(--text-muted); text-align: center;"></td>
    <td><input type="text" class="batch-cell-input batch-date" value="${d.date || today}" placeholder="YYYY-MM-DD, 't', 'y', '-2'"></td>
    <td><input type="text" class="batch-cell-input batch-title" value="${escapeHTML(d.title || '')}" placeholder="e.g. Chai, Groceries, Cab"></td>
    <td><input type="number" step="0.01" class="batch-cell-input batch-amount" value="${d.amount || ''}" placeholder="0.00"></td>
    <td><select class="batch-cell-select batch-category">${catOptions}</select></td>
    <td>
      <select class="batch-cell-select batch-payment">
        <option value="UPI / GPay">UPI / GPay / PhonePe</option>
        <option value="Credit Card">Credit Card</option>
        <option value="Debit Card">Debit Card</option>
        <option value="Net Banking">Net Banking</option>
        <option value="Cash">Cash</option>
      </select>
    </td>
    <td><input type="text" class="batch-cell-input batch-desc" value="${escapeHTML(d.description || '')}" placeholder="Optional notes..."></td>
    <td><button type="button" class="btn-batch-remove" onclick="this.closest('tr').remove(); updateBatchRowNumbers();" title="Remove Row">✕</button></td>
  `;

  if (d.category) {
    const catSelect = tr.querySelector('.batch-category');
    if (catSelect) catSelect.value = d.category;
  }
  if (d.paymentMethod) {
    const paySelect = tr.querySelector('.batch-payment');
    if (paySelect) paySelect.value = d.paymentMethod;
  }

  tbody.appendChild(tr);
  updateBatchRowNumbers();

  // Wire input listeners for running total and arrow key cell navigation (Refinement 4.A & 4.B)
  tr.querySelectorAll('.batch-cell-input, .batch-cell-select').forEach(input => {
    input.addEventListener('input', updateBatchRunningTotal);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const colClass = Array.from(input.classList).find(c => c.startsWith('batch-') && c !== 'batch-cell-input' && c !== 'batch-cell-select');
        if (colClass) {
          const targetTr = e.key === 'ArrowDown' ? tr.nextElementSibling : tr.previousElementSibling;
          if (targetTr) {
            e.preventDefault();
            targetTr.querySelector(`.${colClass}`)?.focus();
          }
        }
      }
    });
  });

  // Date input shorthand resolver
  const dateInput = tr.querySelector('.batch-date');
  dateInput?.addEventListener('blur', (e) => {
    e.target.value = resolveDateShorthand(e.target.value);
    updateBatchRunningTotal();
  });
  dateInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.target.value = resolveDateShorthand(e.target.value);
      updateBatchRunningTotal();
    }
  });

  const descInput = tr.querySelector('.batch-desc');
  descInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === 'Tab') {
      const isLastRow = !tr.nextElementSibling;
      if (isLastRow) {
        addBatchRow();
        setTimeout(() => {
          tr.nextElementSibling?.querySelector('.batch-title')?.focus();
        }, 50);
      }
    }
  });
}

async function saveAllBatchRows() {
  const rows = document.querySelectorAll('#batch-table-body tr');
  let savedCount = 0;

  for (const tr of rows) {
    const title = tr.querySelector('.batch-title')?.value.trim();
    const amount = parseFloat(tr.querySelector('.batch-amount')?.value);
    const dateRaw = tr.querySelector('.batch-date')?.value;
    const date = resolveDateShorthand(dateRaw);
    const category = tr.querySelector('.batch-category')?.value;
    const paymentMethod = tr.querySelector('.batch-payment')?.value;
    const description = tr.querySelector('.batch-desc')?.value.trim();

    if (title && !isNaN(amount) && amount > 0) {
      await window.electronAPI.addExpense({
        title,
        amount,
        date,
        category,
        paymentMethod,
        description,
        paidBy: appState.activeProfile ? appState.activeProfile.name : 'Self',
        isHouseholdExpense: false
      });
      savedCount++;
    }
  }

  if (savedCount > 0) {
    showActionToast({
      icon: 'clipboard',
      title: `Saved ${savedCount} Batch Records`,
      subtext: 'Added to your financial ledger'
    });
    await loadAppData();
    switchTab('dashboard');
  } else {
    alert('No valid rows to save. Please enter a Title and Amount for at least one row.');
  }
}

async function handlePasteBatchFromClipboard() {
  try {
    const text = await navigator.clipboard.readText();
    if (!text || !text.trim()) {
      alert('Clipboard is empty. Copy tab-delimited rows from Excel or Google Sheets first.');
      return;
    }

    const lines = text.trim().split(/\r?\n/);
    let parsedCount = 0;

    lines.forEach(line => {
      const parts = line.split('\t');
      if (parts.length >= 2) {
        let date = new Date().toISOString().split('T')[0];
        let title = '';
        let amount = '';
        let category = appState.categories[0] || 'Food & Dining';
        let description = '';

        if (/^\d{4}-\d{2}-\d{2}$/.test(parts[0].trim()) || /^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/.test(parts[0].trim())) {
          date = parts[0].trim();
          title = parts[1] || '';
          amount = parseFloat((parts[2] || '').replace(/[^0-9.]/g, '')) || '';
          if (parts[3]) category = parts[3].trim();
          if (parts[5]) description = parts[5].trim();
        } else {
          title = parts[0] || '';
          amount = parseFloat((parts[1] || '').replace(/[^0-9.]/g, '')) || '';
          if (parts[2]) category = parts[2].trim();
          if (parts[3]) description = parts[3].trim();
        }

        if (title || amount) {
          addBatchRow({ date, title, amount, category, description });
          parsedCount++;
        }
      }
    });

    if (parsedCount > 0) {
      showToast(`Pasted and inserted ${parsedCount} rows from clipboard!`);
    } else {
      alert('No tab-delimited tabular rows detected in clipboard.');
    }
  } catch (err) {
    alert('Clipboard read error: ' + err.message);
  }
}

// ==========================================================================
// Phase 4: Household Split & Settlements Center Renderer
// ==========================================================================

async function renderHouseholdWorkspace() {
  const settlement = await window.electronAPI.getHouseholdSettlement();
  appState.settlements = (await window.electronAPI.getSettlements()) || [];
  appState.recurringBills = (await window.electronAPI.getRecurringBills()) || [];

  // 1. Metric Cards
  const totalSharedEl = document.getElementById('household-total-shared');
  if (totalSharedEl) totalSharedEl.textContent = `${formatCurrency(settlement.totalSharedAmount || 0)}`;

  const sharedCountEl = document.getElementById('household-shared-count');
  if (sharedCountEl) sharedCountEl.textContent = `${settlement.sharedExpensesCount || 0} shared records logged`;

  const memberCountEl = document.getElementById('household-member-count');
  if (memberCountEl) memberCountEl.textContent = `${(settlement.members || []).length} Active`;

  const memberListStrEl = document.getElementById('household-member-list-str');
  if (memberListStrEl) memberListStrEl.textContent = (settlement.members || []).join(', ');

  // User Net Position Card (Refinement 3.B: High-Clarity Net Position Badging)
  const activeName = appState.activeProfile ? appState.activeProfile.name : 'Self';
  const userNet = settlement.balances ? (settlement.balances[activeName] || 0) : 0;
  const userNetEl = document.getElementById('household-user-net-position');
  const userNetSubEl = document.getElementById('household-net-position-sub');
  const userNetIconBox = document.getElementById('household-net-icon-box');

  if (userNetEl) {
    if (userNet > 0.01) {
      userNetEl.innerHTML = `<span style="color: #10B981; font-weight: 800; font-size: 19px;">YOU ARE OWED ${formatCurrency(userNet)}</span>`;
      if (userNetSubEl) userNetSubEl.textContent = 'Household members will reimburse you';
      if (userNetIconBox) { userNetIconBox.className = 'metric-icon-box icon-emerald'; userNetIconBox.innerHTML = icon('trending-up', 18); }
    } else if (userNet < -0.01) {
      userNetEl.innerHTML = `<span style="color: #FB7185; font-weight: 800; font-size: 19px;">YOU OWE ${formatCurrency(Math.abs(userNet))}</span>`;
      if (userNetSubEl) userNetSubEl.textContent = 'You have outstanding debts to settle';
      if (userNetIconBox) { userNetIconBox.className = 'metric-icon-box icon-rose'; userNetIconBox.innerHTML = icon('trending-down', 18); }
    } else {
      userNetEl.innerHTML = `<span style="color: #38BDF8; font-weight: 800; font-size: 19px;">SETTLED & BALANCED</span>`;
      if (userNetSubEl) userNetSubEl.textContent = `All household debts are balanced (${currSym()}0.00)`;
      if (userNetIconBox) { userNetIconBox.className = 'metric-icon-box icon-blue'; userNetIconBox.innerHTML = icon('scale', 18); }
    }
  }

  // 2. Pairwise Settlement Streams
  const streamsContainer = document.getElementById('settlement-matrix-container');
  if (streamsContainer) {
    if (!settlement.settlements || settlement.settlements.length === 0) {
      streamsContainer.innerHTML = `
        <div style="grid-column: 1 / -1; background: #14151B; padding: 28px; border-radius: 12px; text-align: center; color: var(--text-muted); font-size: 13.5px; border: 1px dashed #2D303C;">
          <div style="display: inline-flex; align-items: center; gap: 8px;">${icon('check-circle', 18)} <strong>All shared expenses are fully settled!</strong> No pending member-to-member debts.</div>
        </div>
      `;
    } else {
      streamsContainer.innerHTML = settlement.settlements.map((s) => `
        <div class="settlement-stream-card">
          <div class="stream-flow-visual">
            <div class="stream-person-node">
              <div class="stream-avatar-box">${renderMonogram(s.from, 36)}</div>
              <span class="stream-person-name">${escapeHTML(s.from)}</span>
            </div>

            <div class="stream-flow-track">
              <span class="stream-amount-tag">${formatCurrency(s.amount)}</span>
              <div class="stream-arrow-line"></div>
              <span style="font-size: 10.5px; color: var(--text-muted);">Direct Repayment</span>
            </div>

            <div class="stream-person-node">
              <div class="stream-avatar-box">${renderMonogram(s.to, 36)}</div>
              <span class="stream-person-name">${escapeHTML(s.to)}</span>
            </div>
          </div>

          <div class="stream-actions-row">
            <span class="stream-status-sub">Pending debt</span>
            <button type="button" class="btn btn-primary btn-sm" onclick="openSettleModal('${escapeHTML(s.from)}', '${escapeHTML(s.to)}', ${s.amount})">
              ${icon('credit-card', 13)} Settle Up
            </button>
          </div>
        </div>
      `).join('');
    }
  }

  // 3. Recurring Utilities Cards (Refinement 3.C: Urgent Countdown Colors)
  const billsContainer = document.getElementById('recurring-bills-container');
  if (billsContainer) {
    const today = new Date();
    const currentDay = today.getDate();

    if (!appState.recurringBills || appState.recurringBills.length === 0) {
      billsContainer.innerHTML = `
        <div style="grid-column: 1 / -1; background: #14151B; padding: 24px; border-radius: 12px; text-align: center; color: var(--text-muted); font-size: 13px; border: 1px dashed #2D303C;">
          No recurring utilities configured. Click "+ Add Recurring Bill" to track electricity, broadband, rent, or subscriptions.
        </div>
      `;
    } else {
      billsContainer.innerHTML = appState.recurringBills.map(b => {
        const daysDiff = b.dueDay - currentDay;
        let statusClass = 'status-due-soon';
        let statusStyle = 'background: rgba(56, 189, 248, 0.15); color: #38BDF8; border: 1px solid rgba(56, 189, 248, 0.3);';
        let statusText = `Due in ${daysDiff} days`;

        if (b.lastPaidDate && b.lastPaidDate.startsWith(today.toISOString().substring(0, 7))) {
          statusClass = 'status-paid';
          statusStyle = 'background: rgba(16, 185, 129, 0.15); color: #10B981; border: 1px solid rgba(16, 185, 129, 0.3);';
          statusText = `${icon('check', 12)} Paid for Month`;
        } else if (daysDiff < 0) {
          statusClass = 'status-overdue';
          statusStyle = 'background: rgba(225, 29, 72, 0.2); color: #FB7185; border: 1px solid rgba(225, 29, 72, 0.4);';
          statusText = `${icon('alert-triangle', 12)} Overdue by ${Math.abs(daysDiff)}d`;
        } else if (daysDiff === 0) {
          statusClass = 'status-due-today';
          statusStyle = 'background: rgba(225, 29, 72, 0.25); color: #FB7185; border: 1px solid rgba(225, 29, 72, 0.5); font-weight: 800;';
          statusText = `${icon('alert-triangle', 12)} Due Today`;
        } else if (daysDiff <= 3) {
          statusClass = 'status-due-soon';
          statusStyle = 'background: rgba(217, 130, 43, 0.2); color: #E5943C; border: 1px solid rgba(217, 130, 43, 0.4); font-weight: 700;';
          statusText = `${icon('zap', 12)} Due in ${daysDiff} days`;
        }

        return `
          <div class="utility-card">
            <div class="utility-card-header">
              <div class="utility-icon-title">
                <div class="utility-icon-box">${(b.icon && typeof ICON_SVG_MAP !== 'undefined' && ICON_SVG_MAP[b.icon]) ? icon(b.icon, 18) : icon('zap', 18)}</div>
                <div class="utility-title-text">${escapeHTML(b.title)}</div>
              </div>
              <button type="button" class="btn-text-ghost" onclick="openEditRecurringBillModal('${b.id}')" title="Edit Utility Bill">${icon('pencil', 13)}</button>
            </div>

            <div class="utility-amount-row">
              <span class="utility-amount-val">${formatCurrency(parseFloat(b.amount) || 0)}</span>
              <span class="utility-freq-sub">Due on ${b.dueDay}th</span>
            </div>

            <div class="utility-status-pill ${statusClass}" style="${statusStyle}">
              ${statusText}
            </div>

            <div class="utility-card-footer">
              <span style="font-size: 11px; color: var(--text-muted);">Payer: ${escapeHTML(b.paidBy || 'Self')}</span>
              <button type="button" class="btn btn-secondary btn-sm" onclick="handlePayRecurringBill('${b.id}')">
                ${icon('zap', 13)} Pay & Split
              </button>
            </div>
          </div>
        `;
      }).join('');
    }
  }

  // 4. Settlement History Ledger
  const historyTbody = document.getElementById('settlement-history-tbody');
  if (historyTbody) {
    if (!appState.settlements || appState.settlements.length === 0) {
      historyTbody.innerHTML = `
        <tr>
          <td colspan="8" style="text-align: center; color: var(--text-muted); padding: 30px; font-size: 13px;">
            No repayment settlements recorded yet. Use the "Settle Up" button on any pending balance to record a repayment.
          </td>
        </tr>
      `;
    } else {
      historyTbody.innerHTML = appState.settlements.map(s => `
        <tr>
          <td style="font-family: var(--font-mono); font-size: 12px; color: var(--text-muted);">${s.date}</td>
          <td><strong style="color: var(--text-main); font-size: 13px;">${escapeHTML(s.from)}</strong></td>
          <td style="color: var(--accent-primary); font-weight: 700; text-align: center;">➔</td>
          <td><strong style="color: var(--text-main); font-size: 13px;">${escapeHTML(s.to)}</strong></td>
          <td class="amount-text" style="color: var(--accent-emerald);">+${formatCurrency(parseFloat(s.amount) || 0)}</td>
          <td><span class="settlement-method-pill">${escapeHTML(s.paymentMethod || 'UPI')}</span></td>
          <td style="font-size: 12px; color: var(--text-muted);">${escapeHTML(s.notes || '—')}</td>
          <td>
            <button type="button" class="action-btn delete-btn" onclick="confirmDeleteSettlement('${s.id}')" title="Delete settlement record">${icon('trash-2', 13)}</button>
          </td>
        </tr>
      `).join('');
    }
  }
}

function getMergedHouseholdMemberList(extraNames = []) {
  const set = new Set();
  (appState.householdMembers || []).forEach(m => set.add(m));
  (appState.profiles || []).forEach(p => set.add(p.name));
  extraNames.forEach(n => { if (n) set.add(n); });
  if (set.size === 0) set.add('Self');
  return Array.from(set);
}

window.openSettleModal = function(from, to, defaultAmount) {
  const fromSelect = document.getElementById('settle-from-select');
  const toSelect = document.getElementById('settle-to-select');
  const amountInput = document.getElementById('settle-amount-input');
  const dateInput = document.getElementById('settle-date-input');
  const notesInput = document.getElementById('settle-notes-input');

  const members = getMergedHouseholdMemberList([from, to]);
  if (fromSelect) {
    fromSelect.innerHTML = members.map(m => `<option value="${escapeHTML(m)}">${escapeHTML(m)}</option>`).join('');
    if (from) fromSelect.value = from;
  }
  if (toSelect) {
    toSelect.innerHTML = members.map(m => `<option value="${escapeHTML(m)}">${escapeHTML(m)}</option>`).join('');
    if (to) toSelect.value = to;
  }
  if (amountInput) amountInput.value = defaultAmount ? parseFloat(defaultAmount).toFixed(2) : '';
  if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];
  if (notesInput) notesInput.value = `Repayment settlement (${from} ➔ ${to})`;

  document.getElementById('settle-modal').classList.add('active');
};

function closeSettleModal() {
  document.getElementById('settle-modal').classList.remove('active');
}

window.confirmDeleteSettlement = async function(id) {
  if (confirm('Delete this recorded repayment settlement?')) {
    const res = await window.electronAPI.deleteSettlement(id);
    if (res && res.success) {
      showToast('Settlement record removed');
      await loadAppData();
      if (appState.currentTab === 'household') renderHouseholdWorkspace();
    } else {
      alert(res?.error || 'Failed to delete settlement record');
    }
  }
};

window.openEditRecurringBillModal = function(id) {
  const bill = (appState.recurringBills || []).find(b => b.id === id);
  if (!bill) {
    showToast('⚠️ Recurring utility bill not found');
    return;
  }

  document.getElementById('recurring-bill-modal-heading').textContent = 'Edit Recurring Utility Bill';
  document.getElementById('recurring-bill-id').value = bill.id;
  document.getElementById('recurring-bill-title').value = bill.title;
  document.getElementById('recurring-bill-icon').value = bill.icon || 'zap';
  document.getElementById('recurring-bill-amount').value = bill.amount;
  document.getElementById('recurring-bill-dueday').value = bill.dueDay || 10;
  document.getElementById('recurring-bill-frequency').value = bill.frequency || 'monthly';
  document.getElementById('recurring-bill-delete-btn').classList.remove('hidden');

  const catSelect = document.getElementById('recurring-bill-category');
  if (catSelect) {
    catSelect.innerHTML = appState.categories.map(c => `<option value="${c}">${c}</option>`).join('');
    catSelect.value = bill.category || 'Utilities';
  }

  const payerSelect = document.getElementById('recurring-bill-paidby');
  if (payerSelect) {
    const members = getMergedHouseholdMemberList([bill.paidBy]);
    payerSelect.innerHTML = members.map(m => `<option value="${escapeHTML(m)}">${escapeHTML(m)}</option>`).join('');
    payerSelect.value = bill.paidBy || members[0] || 'Self';
  }

  document.getElementById('recurring-bill-modal').classList.add('active');
};

function openAddRecurringBillModal() {
  document.getElementById('recurring-bill-modal-heading').textContent = 'Add Recurring Utility Bill';
  document.getElementById('recurring-bill-id').value = '';
  document.getElementById('recurring-bill-title').value = '';
  document.getElementById('recurring-bill-icon').value = 'zap';
  document.getElementById('recurring-bill-amount').value = '';
  document.getElementById('recurring-bill-dueday').value = 10;
  document.getElementById('recurring-bill-delete-btn').classList.add('hidden');

  const catSelect = document.getElementById('recurring-bill-category');
  if (catSelect) {
    catSelect.innerHTML = appState.categories.map(c => `<option value="${c}">${c}</option>`).join('');
    catSelect.value = 'Utilities';
  }

  const payerSelect = document.getElementById('recurring-bill-paidby');
  if (payerSelect) {
    const members = getMergedHouseholdMemberList();
    payerSelect.innerHTML = members.map(m => `<option value="${escapeHTML(m)}">${escapeHTML(m)}</option>`).join('');
    payerSelect.value = appState.activeProfile ? appState.activeProfile.name : (members[0] || 'Self');
  }

  document.getElementById('recurring-bill-modal').classList.add('active');
}

function closeRecurringBillModal() {
  document.getElementById('recurring-bill-modal').classList.remove('active');
}

window.handlePayRecurringBill = async function(id) {
  const bill = (appState.recurringBills || []).find(b => b.id === id);
  if (!bill) {
    showToast('⚠️ Recurring utility bill not found');
    return;
  }

  if (confirm(`Mark "${bill.title}" (${formatCurrency(bill.amount)}) as paid for this cycle and split with household?`)) {
    const res = await window.electronAPI.markRecurringBillPaid(id, {
      paymentMethod: 'UPI / GPay',
      paidBy: appState.activeProfile ? appState.activeProfile.name : 'Self'
    });
    if (res.success) {
      showToast(`Logged and split ${bill.title}!`);
      await loadAppData();
      if (appState.currentTab === 'household') renderHouseholdWorkspace();
    } else {
      alert(res.error || 'Failed to process recurring payment');
    }
  }
};

// ==========================================================================
// Phase 4: Dedicated Expense Feed Precision Ledger Functions
// ==========================================================================

function renderExpenseFeedWorkspace() {
  const tbody = document.getElementById('feed-expense-table-body');
  if (!tbody) return;

  // Populate Feed Category dropdown if empty
  const catSelect = document.getElementById('feed-filter-category');
  if (catSelect && catSelect.options.length <= 1) {
    appState.categories.forEach(c => catSelect.appendChild(new Option(c, c)));
  }

  let list = [...appState.expenses];

  // Apply Search
  const q = (appState.feedFilters.search || '').trim().toLowerCase();
  if (q) {
    list = list.filter(e => 
      (e.title && e.title.toLowerCase().includes(q)) ||
      (e.description && e.description.toLowerCase().includes(q)) ||
      (e.category && e.category.toLowerCase().includes(q)) ||
      (e.tags && Array.isArray(e.tags) && e.tags.some(t => t.toLowerCase().includes(q)))
    );
  }

  // Apply Category Filter
  if (appState.feedFilters.category && appState.feedFilters.category !== 'ALL') {
    list = list.filter(e => e.category === appState.feedFilters.category);
  }

  // Apply Payment Method Filter
  if (appState.feedFilters.paymentMethod && appState.feedFilters.paymentMethod !== 'ALL') {
    list = list.filter(e => (e.paymentMethod || 'UPI / GPay') === appState.feedFilters.paymentMethod);
  }

  // Apply Member Filter
  if (appState.feedFilters.member === 'SHARED') {
    list = list.filter(e => e.isHouseholdExpense || (e.splitWith && e.splitWith.length > 0));
  } else if (appState.feedFilters.member === 'PERSONAL') {
    list = list.filter(e => !e.isHouseholdExpense && (!e.splitWith || e.splitWith.length === 0));
  }

  // Apply Date Range
  const now = new Date();
  if (appState.feedFilters.dateRange === 'THIS_MONTH') {
    const monthStr = now.toISOString().substring(0, 7);
    list = list.filter(e => e.date && e.date.startsWith(monthStr));
  } else if (appState.feedFilters.dateRange === 'LAST_30') {
    const cutoff = new Date(now.getTime() - 30 * 24 * 3600 * 1000).toISOString().split('T')[0];
    list = list.filter(e => e.date && e.date >= cutoff);
  }

  // Apply Sort
  const sortCol = appState.feedSort.column;
  const sortDir = appState.feedSort.direction === 'asc' ? 1 : -1;
  list.sort((a, b) => {
    if (sortCol === 'date') return (new Date(a.date) - new Date(b.date)) * sortDir;
    if (sortCol === 'amount') return ((parseFloat(a.amount) || 0) - (parseFloat(b.amount) || 0)) * sortDir;
    if (sortCol === 'title') return (a.title || '').localeCompare(b.title || '') * sortDir;
    if (sortCol === 'category') return (a.category || '').localeCompare(b.category || '') * sortDir;
    return 0;
  });

  // Pagination
  const totalCount = list.length;
  const pageSize = appState.feedPageSize || 20;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  if (appState.feedPage > totalPages) appState.feedPage = totalPages;
  if (appState.feedPage < 1) appState.feedPage = 1;

  const startIndex = (appState.feedPage - 1) * pageSize;
  const pagedList = list.slice(startIndex, startIndex + pageSize);

  // Update Pagination Bar
  const infoEl = document.getElementById('feed-pagination-info');
  if (infoEl) infoEl.textContent = totalCount > 0 
    ? `Showing ${startIndex + 1}–${Math.min(startIndex + pageSize, totalCount)} of ${totalCount} records`
    : '0 records found';

  const pageBadge = document.getElementById('feed-current-page-badge');
  if (pageBadge) pageBadge.textContent = `Page ${appState.feedPage} of ${totalPages}`;

  const prevBtn = document.getElementById('feed-btn-prev-page');
  const nextBtn = document.getElementById('feed-btn-next-page');
  if (prevBtn) prevBtn.disabled = appState.feedPage <= 1;
  if (nextBtn) nextBtn.disabled = appState.feedPage >= totalPages;

  if (pagedList.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align: center; color: var(--text-muted); padding: 40px; font-size: 13.5px;">
          No transactions match the selected filters.
        </td>
      </tr>
    `;
    updateFeedStickyBatchBar();
    return;
  }

  // Build Table Rows with Sticky Date Grouping Headers (Refinement 5.C)
  let lastDateGroup = null;
  let html = '';
  let rowIdx = 0;

  pagedList.forEach(item => {
    const groupLabel = getDateGroupLabel(item.date);
    if (groupLabel !== lastDateGroup) {
      lastDateGroup = groupLabel;
      // Calculate group subtotal
      const groupItems = pagedList.filter(x => getDateGroupLabel(x.date) === groupLabel);
      const groupSubtotal = groupItems.reduce((acc, c) => acc + (parseFloat(c.amount) || 0), 0);

      html += `
        <tr class="feed-date-group-header">
          <td colspan="8">
            <span style="display: flex; align-items: center; justify-content: space-between;">
              <span>${groupLabel}</span>
              <span class="feed-date-group-badge">${groupItems.length} records • ${formatCurrency(groupSubtotal)}</span>
            </span>
          </td>
        </tr>
      `;
    }

    const isChecked = appState.feedSelectedIds.has(item.id);
    const expenseNotes = (appState.notes || []).filter(n => n.relation === 'transaction' && n.relationId === item.id);
    const hasNotes = expenseNotes.length > 0;
    const isShared = Boolean(item.isHouseholdExpense);
    const currentIndex = rowIdx++;

    html += `
      <tr>
        <td>
          <input type="checkbox" class="feed-row-checkbox" data-id="${item.id}" ${isChecked ? 'checked' : ''} onclick="handleFeedCheckboxClick(event, '${item.id}', ${currentIndex})">
        </td>
        <td style="font-family: var(--font-mono); font-size: 12px; color: var(--text-muted);">${item.date}</td>
        <td class="feed-editable-title" ondblclick="startInlineEditTitle(this, '${item.id}')" title="Double click to edit title inline">
          <strong style="color: var(--text-main); font-size: 13.5px;">${escapeHTML(item.title)}</strong>
          ${item.description ? `<div style="font-size: 11.5px; color: var(--text-dim); margin-top: 2px;">${escapeHTML(item.description)}</div>` : ''}
        </td>
        <td class="feed-editable-category" ondblclick="startInlineEditCategory(this, '${item.id}')" title="Double click to change category inline">
          <span class="category-pill">${escapeHTML(item.category)}</span>
        </td>
        <td>
          <div style="display: flex; align-items: center; gap: 6px;">
            <span style="font-size: 12px; color: var(--text-main); font-weight: 700;">${escapeHTML(item.paidBy || 'Personal')}</span>
            ${isShared ? `<span style="font-size: 10px; background: rgba(217, 130, 43, 0.15); color: var(--accent-primary); padding: 2px 6px; border-radius: 4px; font-weight: 700; display: inline-flex; align-items: center; gap: 4px;">${icon('users', 11)} Shared</span>` : '<span style="font-size: 10px; background: #1E212A; color: var(--text-muted); padding: 2px 6px; border-radius: 4px;">Personal</span>'}
          </div>
        </td>
        <td class="amount-text feed-editable-amount" ondblclick="startInlineEditAmount(this, '${item.id}')" title="Double click to edit amount inline">-${formatCurrency(parseFloat(item.amount) || 0)}</td>
        <td>
          ${item.receiptFilename ? `<button class="action-btn" onclick="viewReceiptImage('${item.receiptFilename}')" title="View Receipt Image">${icon('camera', 13)} View</button>` : '<span style="color:var(--text-dim); font-size:11px;">—</span>'}
        </td>
        <td class="actions-cell">
          <button class="action-btn note-indicator-btn ${hasNotes ? 'has-notes' : ''}" onclick="openNoteModalForExpense('${item.id}', '${escapeHTML(item.title).replace(/'/g, "\\'")}')" title="${hasNotes ? `${expenseNotes.length} Note(s) linked` : 'Attach contextual note'}">${icon('file-text', 13)}${hasNotes ? `<span style="font-size:9px; font-weight:800; margin-left:2px;">${expenseNotes.length}</span>` : ''}</button>
          <button class="action-btn edit-btn" onclick="openEditModal('${item.id}')" title="Edit Expense">${icon('pencil', 13)}</button>
          <button class="action-btn delete-btn" onclick="confirmDeleteExpense('${item.id}')" title="Delete Expense">${icon('trash-2', 13)}</button>
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = html;
  updateFeedStickyBatchBar();
}

function getDateGroupLabel(dateStr) {
  if (!dateStr) return 'UNKNOWN DATE';
  const today = new Date();
  const d = new Date(dateStr);
  const todayStr = today.toISOString().split('T')[0];

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];

  if (dateStr === todayStr) return 'TODAY';
  if (dateStr === yesterdayStr) return 'YESTERDAY';

  const diffDays = Math.round((today - d) / (1000 * 60 * 60 * 24));
  if (diffDays >= 2 && diffDays <= 7) return 'EARLIER THIS WEEK';

  return d.toLocaleDateString('en-IN', { month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase();
}

// In-Place Double-Click Inline Editing Controllers (Refinement 5.A)
window.startInlineEditTitle = function(cell, expenseId) {
  const item = (appState.expenses || []).find(e => e.id === expenseId) ||
               (appState.allHouseholdExpenses || []).find(e => e.id === expenseId);
  if (!item) {
    showToast('⚠️ Expense record not found');
    return;
  }
  const currentVal = item.title;

  cell.classList.add('inline-editing-cell');
  cell.innerHTML = `<input type="text" class="inline-cell-input" value="${escapeHTML(currentVal)}">`;
  const input = cell.querySelector('input');
  input.focus();
  input.select();

  let saved = false;
  const save = async () => {
    if (saved) return;
    saved = true;
    const newVal = input.value.trim();
    if (newVal && newVal !== currentVal) {
      item.title = newVal;
      const res = await window.electronAPI.updateExpense(item);
      if (res && res.success) {
        showToast(`Updated "${newVal}"`);
        await loadAppData();
      } else {
        alert(res?.error || 'Failed to update expense title');
      }
    }
    renderExpenseFeedWorkspace();
  };

  input.addEventListener('blur', save);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
    if (e.key === 'Escape') { saved = true; renderExpenseFeedWorkspace(); }
  });
};

window.startInlineEditAmount = function(cell, expenseId) {
  const item = (appState.expenses || []).find(e => e.id === expenseId) ||
               (appState.allHouseholdExpenses || []).find(e => e.id === expenseId);
  if (!item) {
    showToast('⚠️ Expense record not found');
    return;
  }
  const currentVal = parseFloat(item.amount) || 0;

  cell.classList.add('inline-editing-cell');
  cell.innerHTML = `<input type="number" step="0.01" class="inline-cell-input" value="${currentVal}">`;
  const input = cell.querySelector('input');
  input.focus();
  input.select();

  let saved = false;
  const save = async () => {
    if (saved) return;
    saved = true;
    const newVal = parseFloat(input.value);
    if (!isNaN(newVal) && newVal > 0 && newVal !== currentVal) {
      item.amount = newVal;
      const res = await window.electronAPI.updateExpense(item);
      if (res && res.success) {
        showToast(`Updated amount: ${formatCurrency(newVal)}`);
        await loadAppData();
      } else {
        alert(res?.error || 'Failed to update expense amount');
      }
    }
    renderExpenseFeedWorkspace();
  };

  input.addEventListener('blur', save);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
    if (e.key === 'Escape') { saved = true; renderExpenseFeedWorkspace(); }
  });
};

window.startInlineEditCategory = function(cell, expenseId) {
  const item = (appState.expenses || []).find(e => e.id === expenseId) ||
               (appState.allHouseholdExpenses || []).find(e => e.id === expenseId);
  if (!item) {
    showToast('⚠️ Expense record not found');
    return;
  }
  const currentVal = item.category;

  const options = appState.categories.map(c => `<option value="${c}" ${c === currentVal ? 'selected' : ''}>${c}</option>`).join('');
  cell.classList.add('inline-editing-cell');
  cell.innerHTML = `<select class="inline-cell-select">${options}</select>`;
  const select = cell.querySelector('select');
  select.focus();

  let saved = false;
  const save = async () => {
    if (saved) return;
    saved = true;
    const newVal = select.value;
    if (newVal && newVal !== currentVal) {
      item.category = newVal;
      const res = await window.electronAPI.updateExpense(item);
      if (res && res.success) {
        showToast(`Updated category: ${newVal}`);
        await loadAppData();
      } else {
        alert(res?.error || 'Failed to update category');
      }
    }
    renderExpenseFeedWorkspace();
  };

  select.addEventListener('blur', save);
  select.addEventListener('change', () => { select.blur(); });
  select.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { saved = true; renderExpenseFeedWorkspace(); }
  });
};

// Shift+Click Multi-Row Checkbox Selection (Refinement 5.B)
appState.lastFeedCheckedIndex = null;
window.handleFeedCheckboxClick = function(event, id, index) {
  const isChecked = event.target.checked;
  const allCheckboxes = Array.from(document.querySelectorAll('.feed-row-checkbox'));

  if (event.shiftKey && appState.lastFeedCheckedIndex !== null) {
    const start = Math.min(appState.lastFeedCheckedIndex, index);
    const end = Math.max(appState.lastFeedCheckedIndex, index);

    for (let i = start; i <= end; i++) {
      const cb = allCheckboxes[i];
      if (cb) {
        cb.checked = isChecked;
        const cbId = cb.getAttribute('data-id');
        if (isChecked) appState.feedSelectedIds.add(cbId);
        else appState.feedSelectedIds.delete(cbId);
      }
    }
  } else {
    if (isChecked) appState.feedSelectedIds.add(id);
    else appState.feedSelectedIds.delete(id);
  }

  appState.lastFeedCheckedIndex = index;
  updateFeedStickyBatchBar();
};

window.toggleFeedSort = function(col) {
  if (appState.feedSort.column === col) {
    appState.feedSort.direction = appState.feedSort.direction === 'asc' ? 'desc' : 'asc';
  } else {
    appState.feedSort.column = col;
    appState.feedSort.direction = col === 'date' ? 'desc' : 'asc';
  }

  ['date', 'title', 'category', 'amount'].forEach(c => {
    const iconEl = document.getElementById(`feed-sort-${c}-icon`);
    if (iconEl) {
      if (appState.feedSort.column === c) {
        iconEl.textContent = appState.feedSort.direction === 'asc' ? '▲' : '▼';
      } else {
        iconEl.textContent = '';
      }
    }
  });

  renderExpenseFeedWorkspace();
};

window.toggleFeedRowSelect = function(id) {
  if (appState.feedSelectedIds.has(id)) {
    appState.feedSelectedIds.delete(id);
  } else {
    appState.feedSelectedIds.add(id);
  }
  updateFeedStickyBatchBar();
};

function updateFeedStickyBatchBar() {
  const bar = document.getElementById('feed-sticky-batch-bar');
  const countEl = document.getElementById('feed-selected-count');
  const allCheckbox = document.getElementById('feed-select-all-checkbox');

  if (countEl) countEl.textContent = appState.feedSelectedIds.size;
  if (bar) {
    bar.classList.toggle('hidden', appState.feedSelectedIds.size === 0);
  }
  if (allCheckbox) {
    const visibleCheckboxes = document.querySelectorAll('.feed-row-checkbox');
    const allChecked = visibleCheckboxes.length > 0 && Array.from(visibleCheckboxes).every(cb => cb.checked);
    allCheckbox.checked = allChecked;
  }
}

// Preset Modal Controls
function openAddPresetModal() {
  document.getElementById('preset-modal-heading').textContent = 'Create Quick Preset';
  document.getElementById('form-preset-id').value = '';
  document.getElementById('preset-form-icon').value = 'coffee';
  document.getElementById('preset-form-title').value = '';
  document.getElementById('preset-form-amount').value = '';
  document.getElementById('preset-delete-btn').classList.add('hidden');
  document.getElementById('preset-modal').classList.add('active');
}

window.openEditPresetModal = function(id) {
  const preset = (appState.presets || []).find(p => p.id === id);
  if (!preset) {
    showToast('⚠️ Preset chip not found');
    return;
  }

  document.getElementById('preset-modal-heading').textContent = 'Edit Quick Preset';
  document.getElementById('form-preset-id').value = preset.id;
  document.getElementById('preset-form-icon').value = preset.icon || 'tag';
  document.getElementById('preset-form-title').value = preset.title;
  document.getElementById('preset-form-amount').value = preset.amount;
  document.getElementById('preset-form-category').value = preset.category;
  document.getElementById('preset-form-payment').value = preset.paymentMethod || 'UPI / GPay';
  document.getElementById('preset-delete-btn').classList.remove('hidden');
  document.getElementById('preset-modal').classList.add('active');
};

function closePresetModal() {
  document.getElementById('preset-modal').classList.remove('active');
}

// Expense Modal Helpers
function openAddModal() {
  document.getElementById('modal-heading').textContent = 'Log New Expense';
  document.getElementById('form-expense-id').value = '';
  document.getElementById('form-title').value = '';
  document.getElementById('form-amount').value = '';
  document.getElementById('form-date').value = new Date().toISOString().split('T')[0];
  document.getElementById('form-description').value = '';
  document.getElementById('form-receipt-filename').value = '';
  document.getElementById('receipt-status-text').textContent = 'No receipt image attached';
  document.getElementById('form-is-household').checked = false;
  document.getElementById('form-split-options').classList.add('hidden');
  document.getElementById('expense-modal').classList.add('active');
}

window.openEditModal = async function(id) {
  let item = (appState.expenses || []).find(e => e.id === id) || 
             (appState.allHouseholdExpenses || []).find(e => e.id === id);

  if (!item && window.electronAPI && window.electronAPI.getExpenseById) {
    const res = await window.electronAPI.getExpenseById(id);
    if (res && res.success) {
      item = res.expense;
    }
  }

  if (!item) {
    showToast('⚠️ Expense record not found or was removed');
    return;
  }

  document.getElementById('modal-heading').textContent = 'Edit Expense Record';
  document.getElementById('form-expense-id').value = item.id;
  document.getElementById('form-title').value = item.title;
  document.getElementById('form-amount').value = item.amount;
  document.getElementById('form-date').value = item.date;
  document.getElementById('form-category').value = item.category;
  document.getElementById('form-payment').value = item.paymentMethod || 'UPI / GPay';
  document.getElementById('form-description').value = item.description || '';
  document.getElementById('form-receipt-filename').value = item.receiptFilename || '';
  document.getElementById('receipt-status-text').textContent = item.receiptFilename ? `Attached: ${item.receiptFilename}` : 'No receipt image attached';
  
  const isHousehold = Boolean(item.isHouseholdExpense);
  document.getElementById('form-is-household').checked = isHousehold;
  document.getElementById('form-split-options').classList.toggle('hidden', !isHousehold);
  
  if (item.paidBy) document.getElementById('form-paid-by').value = item.paidBy;
  if (Array.isArray(item.splitWith)) {
    document.querySelectorAll('input[name="split-member"]').forEach(cb => {
      cb.checked = item.splitWith.includes(cb.value);
    });
  }

  document.getElementById('expense-modal').classList.add('active');
};

window.viewReceiptImage = async function(filename) {
  if (!filename) {
    showToast('⚠️ No receipt attached to this expense');
    return;
  }
  const previewBox = document.getElementById('receipt-preview-box');
  const previewImg = document.getElementById('receipt-preview-img');
  if (previewImg) {
    previewImg.src = `local-receipt://${filename}`;
    previewImg.onerror = () => {
      showToast('⚠️ Receipt image file could not be loaded');
    };
  }
  if (previewBox) {
    previewBox.classList.remove('hidden');
  }
  showToast(`Viewing receipt: ${filename}`);
};

window.confirmDeleteExpense = async function(id) {
  if (confirm('Are you sure you want to delete this expense record?')) {
    const res = await window.electronAPI.deleteExpense(id);
    if (res && res.success) {
      showToast('Expense record deleted');
      await loadAppData();
      if (appState.currentTab === 'expenses') renderExpenseFeedWorkspace();
    } else {
      alert(res?.error || 'Failed to delete expense record');
    }
  }
};

function closeModal() {
  document.getElementById('expense-modal').classList.remove('active');
}

// Instant Action Toast Notification Controller (Phase 5)
let toastActionTimer = null;
function showActionToast({ icon: iconName = 'check', title = 'Action Completed', amount = null, category = null, subtext = null, duration = 3500 } = {}) {
  const container = document.getElementById('toast-action-container');
  const iconEl = document.getElementById('toast-icon');
  const mainMsgEl = document.getElementById('toast-main-msg');
  const subMsgEl = document.getElementById('toast-sub-msg');

  if (!container) return;

  if (iconEl) {
    if (typeof icon === 'function' && typeof ICON_SVG_MAP !== 'undefined' && ICON_SVG_MAP[iconName]) {
      iconEl.innerHTML = icon(iconName, 18);
    } else if (typeof icon === 'function') {
      iconEl.innerHTML = icon('check', 18);
    } else {
      iconEl.textContent = iconName;
    }
  }
  if (mainMsgEl) {
    mainMsgEl.textContent = (amount !== null && !isNaN(amount)) 
      ? `${title} • ${formatCurrency(parseFloat(amount))}` 
      : title;
  }
  if (subMsgEl) {
    subMsgEl.textContent = subtext || `${category || 'Personal'} • Logged successfully`;
  }

  container.classList.remove('hidden');
  clearTimeout(toastActionTimer);
  toastActionTimer = setTimeout(() => {
    container.classList.add('hidden');
  }, duration);
}

function showToast(message) {
  showActionToast({ icon: 'check', title: message, subtext: 'Ledgerly Desktop' });
}

// ==========================================================================
// ==========================================================================
// Phase 2 v1.2: General Settings Hub — Rendering & Interaction Logic
// ==========================================================================

function renderSettingsWorkspace() {
  const salary = appState.salaryConfig || { monthlyIncome: 60000, fixedBills: 20000, savingsGoal: 10000, payday: 1, currencySymbol: '₹' };

  // Populate salary form inputs
  const incomeEl = document.getElementById('settings-salary-income');
  const billsEl = document.getElementById('settings-salary-bills');
  const savingsEl = document.getElementById('settings-salary-savings');
  const paydayEl = document.getElementById('settings-salary-payday');
  const actualDateEl = document.getElementById('settings-salary-actual-date');
  const nextOverrideEl = document.getElementById('settings-salary-next-override');

  if (incomeEl) incomeEl.value = salary.monthlyIncome || '';
  if (billsEl) billsEl.value = salary.fixedBills || '';
  if (savingsEl) savingsEl.value = salary.savingsGoal || '';
  if (paydayEl) paydayEl.value = salary.payday || 1;
  if (actualDateEl) actualDateEl.value = salary.currentCycleStartDate || '';
  if (nextOverrideEl) nextOverrideEl.value = salary.nextPaydayOverride || '';

  // Set active shift chip based on current shift delta
  const chips = document.querySelectorAll('.btn-shift-chip');
  if (chips.length > 0 && salary.nextPaydayOverride) {
    // Calculate shift from standard payday
    const payday = Math.max(1, Math.min(31, parseInt(salary.payday, 10) || 1));
    const now = new Date();
    const cycleMonth = now.getDate() >= payday ? now.getMonth() : now.getMonth() - 1;
    const cycleYear = now.getFullYear();
    const standardNext = new Date(cycleYear, cycleMonth + 1, payday);
    const actualNext = new Date(salary.nextPaydayOverride);
    const msPerDay = 1000 * 60 * 60 * 24;
    const shiftDelta = Math.round((actualNext - standardNext) / msPerDay);
    chips.forEach(c => {
      c.classList.toggle('active', parseInt(c.getAttribute('data-shift'), 10) === shiftDelta);
    });
  } else {
    chips.forEach(c => {
      c.classList.toggle('active', c.getAttribute('data-shift') === '0');
    });
  }

  // Populate preferences pane
  const currencyEl = document.getElementById('settings-pref-currency');
  const paymentEl = document.getElementById('settings-pref-payment');
  const modeEl = document.getElementById('settings-pref-workspace-mode');
  if (currencyEl) currencyEl.value = salary.currencySymbol || '₹';
  if (modeEl) modeEl.value = appState.workspaceMode || 'household';

  // Update all .global-curr-symbol spans across the DOM
  const currSym = salary.currencySymbol || '₹';
  document.querySelectorAll('.global-curr-symbol').forEach(el => {
    el.textContent = currSym;
  });

  updateSettingsCycleBanner();
  if (typeof hydrateIcons === 'function') hydrateIcons();
}

async function updateSettingsCycleBanner() {
  const titleEl = document.getElementById('settings-cycle-title');
  const subtextEl = document.getElementById('settings-cycle-subtext');
  if (!titleEl || !subtextEl) return;

  try {
    const metrics = await window.electronAPI.getDailyBudgetMetrics();
    if (!metrics) return;

    const currSym = appState.salaryConfig?.currencySymbol || '₹';

    // Format cycle dates for display
    const formatDate = (dateStr) => {
      if (!dateStr) return '—';
      const d = new Date(dateStr);
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
    };

    const cycleStart = formatDate(metrics.cycleStartDate);
    const nextPayday = formatDate(metrics.nextPaydayDate);
    const totalDays = metrics.totalDaysInCycle || 30;

    let shiftNote = '';
    if (metrics.shiftDays > 0) {
      shiftNote = ` • Salary delayed ${metrics.shiftDays}d`;
    } else if (metrics.shiftDays < 0) {
      shiftNote = ` • Salary ${Math.abs(metrics.shiftDays)}d early`;
    }

    titleEl.textContent = `Active Cycle: ${cycleStart} – ${nextPayday} (${totalDays} days)${shiftNote}`;
    subtextEl.textContent = `Remaining days: ${metrics.remainingDays} • Calculated Daily Allowance: ${currSym}${metrics.dailyAllowance?.toFixed(2) || '0.00'}/day`;
  } catch (err) {
    titleEl.textContent = 'Cycle data unavailable';
    subtextEl.textContent = 'Save salary settings to calculate cycle metrics';
  }
}

// Settings Sub-Tab Navigation
function initSettingsSubTabs() {
  document.querySelectorAll('.settings-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-tab-target');
      if (!targetId) return;

      // Toggle active state on buttons
      document.querySelectorAll('.settings-tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // Toggle pane visibility
      document.querySelectorAll('.settings-pane').forEach(pane => pane.classList.add('hidden'));
      const targetPane = document.getElementById(targetId);
      if (targetPane) targetPane.classList.remove('hidden');
    });
  });
}

// Payday Shift Chip Selection
function initShiftChips() {
  document.querySelectorAll('.btn-shift-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const shiftDays = parseInt(chip.getAttribute('data-shift'), 10);

      // Toggle active state
      document.querySelectorAll('.btn-shift-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');

      // Compute override date from shift delta
      const payday = parseInt(document.getElementById('settings-salary-payday')?.value, 10) || 1;
      const now = new Date();
      const cycleMonth = now.getDate() >= payday ? now.getMonth() : now.getMonth() - 1;
      const cycleYear = now.getFullYear();
      const standardNext = new Date(cycleYear, cycleMonth + 1, payday);

      if (shiftDays === 0) {
        // Standard — clear override
        const overrideEl = document.getElementById('settings-salary-next-override');
        if (overrideEl) overrideEl.value = '';
      } else {
        const shifted = new Date(standardNext);
        shifted.setDate(shifted.getDate() + shiftDays);
        const y = shifted.getFullYear();
        const m = String(shifted.getMonth() + 1).padStart(2, '0');
        const d = String(shifted.getDate()).padStart(2, '0');
        const overrideEl = document.getElementById('settings-salary-next-override');
        if (overrideEl) overrideEl.value = `${y}-${m}-${d}`;
      }

      // Live preview update
      updateSettingsCycleBanner();
    });
  });
}

// ==========================================================================
// ==========================================================================
// Phase 4: Contextual Notes Masonry Gallery Functions
// ==========================================================================

function renderNotesWorkspace() {
  const container = document.getElementById('notes-list-container');
  if (!container) return;

  const allNotes = appState.notes || [];

  // Update Count Badges
  const countAllEl = document.getElementById('notes-count-all');
  const countTxEl = document.getElementById('notes-count-transaction');
  const countDayEl = document.getElementById('notes-count-day');
  const countWeekEl = document.getElementById('notes-count-week');
  const countMonthEl = document.getElementById('notes-count-month');

  if (countAllEl) countAllEl.textContent = allNotes.length;
  if (countTxEl) countTxEl.textContent = allNotes.filter(n => n.relation === 'transaction').length;
  if (countDayEl) countDayEl.textContent = allNotes.filter(n => n.relation === 'day').length;
  if (countWeekEl) countWeekEl.textContent = allNotes.filter(n => n.relation === 'week').length;
  if (countMonthEl) countMonthEl.textContent = allNotes.filter(n => n.relation === 'month').length;

  let filtered = allNotes.filter(note => {
    const matchesRelation = (appState.activeNoteRelation === 'ALL' || note.relation === appState.activeNoteRelation);
    const matchesSearch = !appState.filterNotesSearch ||
      note.content.toLowerCase().includes(appState.filterNotesSearch.toLowerCase()) ||
      note.relationId.toLowerCase().includes(appState.filterNotesSearch.toLowerCase());
    return matchesRelation && matchesSearch;
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1 / -1; padding: 40px; text-align: center; color: var(--text-muted); font-size: 13.5px; background: #14151B; border-radius: var(--radius-md); border: 1px dashed var(--border-color);">
        No contextual notes found in this category. Click "+ New Note" or click the note icon on any expense in the table to log a reflection.
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(note => {
    let relationRibbon = 'ribbon-transaction';
    let relationIconName = 'banknote';
    let relationLabel = 'Linked Expense';
    let targetDisplay = note.relationId;

    if (note.relation === 'day') {
      relationRibbon = 'ribbon-day';
      relationIconName = 'calendar';
      relationLabel = 'Daily Reflection';
    } else if (note.relation === 'week') {
      relationRibbon = 'ribbon-week';
      relationIconName = 'bar-chart-2';
      relationLabel = 'Weekly Review';
    } else if (note.relation === 'month') {
      relationRibbon = 'ribbon-month';
      relationIconName = 'target';
      relationLabel = 'Monthly Goal';
    } else if (note.relation === 'transaction') {
      const matchedExp = (appState.expenses || []).find(e => e.id === note.relationId);
      if (matchedExp) {
        targetDisplay = `${matchedExp.title} (-${formatCurrency(parseFloat(matchedExp.amount) || 0)})`;
      }
    }

    const dateStr = note.createdAt ? new Date(note.createdAt).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' }) : '';

    return `
      <div class="note-masonry-card ${relationRibbon}">
        <div class="note-card-header-row">
          <span class="note-relation-tag" style="display: inline-flex; align-items: center; gap: 4px;">${icon(relationIconName, 12)} ${relationLabel}</span>
          <span style="font-size: 11px; font-family: var(--font-mono); color: var(--text-muted);">${escapeHTML(targetDisplay)}</span>
        </div>

        <div class="note-card-body-text">"${escapeHTML(note.content)}"</div>

        <div class="note-card-footer-row">
          <span>${dateStr}</span>
          <div style="display: flex; gap: 6px;">
            <button type="button" class="btn-text-ghost" onclick="openEditNoteModal('${note.id}')" title="Edit Note">${icon('pencil', 12)}</button>
            <button type="button" class="btn-text-ghost" onclick="confirmDeleteNote('${note.id}')" title="Delete Note">${icon('trash-2', 12)}</button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function openAddNoteModal() {
  document.getElementById('note-modal-heading').textContent = 'Create Contextual Note';
  document.getElementById('form-note-id').value = '';
  document.getElementById('form-note-relation').value = 'day';
  document.getElementById('form-note-content').value = '';
  document.getElementById('note-delete-btn').classList.add('hidden');
  updateNoteTargetInput('day', new Date().toISOString().split('T')[0]);
  document.getElementById('note-modal').classList.add('active');
}

window.openNoteModalForExpense = function(expenseId, expenseTitle) {
  document.getElementById('note-modal-heading').textContent = `Note for: ${expenseTitle || 'Expense'}`;
  document.getElementById('form-note-id').value = '';
  document.getElementById('form-note-relation').value = 'transaction';
  document.getElementById('form-note-content').value = '';
  document.getElementById('note-delete-btn').classList.add('hidden');
  updateNoteTargetInput('transaction', expenseId);
  document.getElementById('note-modal').classList.add('active');
};

window.openEditNoteModal = function(id) {
  const note = (appState.notes || []).find(n => n.id === id);
  if (!note) {
    showToast('⚠️ Contextual note not found');
    return;
  }

  document.getElementById('note-modal-heading').textContent = 'Edit Contextual Note';
  document.getElementById('form-note-id').value = note.id;
  document.getElementById('form-note-relation').value = note.relation;
  document.getElementById('form-note-content').value = note.content;
  document.getElementById('note-delete-btn').classList.remove('hidden');
  updateNoteTargetInput(note.relation, note.relationId);
  document.getElementById('note-modal').classList.add('active');
};

function closeNoteModal() {
  document.getElementById('note-modal').classList.remove('active');
}

function updateNoteTargetInput(relation, defaultVal) {
  const group = document.getElementById('form-note-target-group');
  if (!group) return;

  const today = new Date().toISOString().split('T')[0];
  const thisMonth = today.substring(0, 7);
  const now = new Date();
  const weekNum = Math.ceil((((now - new Date(now.getFullYear(), 0, 1)) / 86400000) + 1) / 7);
  const thisWeek = `${now.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;

  if (relation === 'transaction') {
    const expensePool = (appState.allHouseholdExpenses && appState.allHouseholdExpenses.length > 0)
      ? appState.allHouseholdExpenses
      : appState.expenses;

    const options = (expensePool || []).map(e => `
      <option value="${e.id}" ${defaultVal === e.id ? 'selected' : ''}>
        ${escapeHTML(e.title)} (-${formatCurrency(parseFloat(e.amount) || 0)}, ${e.date})
      </option>
    `).join('');
    group.innerHTML = `
      <label>Select Linked Expense *</label>
      <select id="form-note-relation-id" required>${options || '<option value="">No expenses available</option>'}</select>
    `;
  } else if (relation === 'day') {
    group.innerHTML = `
      <label>Select Date *</label>
      <input type="date" id="form-note-relation-id" value="${defaultVal || today}" required>
    `;
  } else if (relation === 'week') {
    group.innerHTML = `
      <label>Week Identifier (e.g. 2026-W34) *</label>
      <input type="text" id="form-note-relation-id" value="${defaultVal || thisWeek}" placeholder="YYYY-Www" required>
    `;
  } else if (relation === 'month') {
    group.innerHTML = `
      <label>Select Month *</label>
      <input type="month" id="form-note-relation-id" value="${defaultVal || thisMonth}" required>
    `;
  }
}

window.confirmDeleteNote = async function(id) {
  if (confirm('Are you sure you want to delete this note?')) {
    const res = await window.electronAPI.deleteNote(id);
    if (res && res.success) {
      showToast('Note deleted');
      await loadAppData();
      if (appState.currentTab === 'notes') renderNotesWorkspace();
    } else {
      alert(res?.error || 'Failed to delete note');
    }
  }
};

// ==========================================================================
// Phase 5: File Importer UI & Drag-and-Drop
// ==========================================================================

function isPotentialDuplicate(exp) {
  if (!exp || !exp.date || !exp.amount) return false;
  return (appState.expenses || []).some(existing => 
    existing.date === exp.date &&
    Math.abs(parseFloat(existing.amount) - parseFloat(exp.amount)) < 0.01 &&
    (existing.title || '').trim().toLowerCase() === (exp.title || '').trim().toLowerCase()
  );
}

function renderImportPreviewTable() {
  const tbody = document.getElementById('import-preview-table-body');
  if (!tbody || !appState.importPendingExpenses) return;

  tbody.innerHTML = appState.importPendingExpenses.slice(0, 100).map((exp, idx) => {
    const isDup = isPotentialDuplicate(exp);
    return `
      <tr style="${isDup ? 'background: rgba(245, 158, 11, 0.06);' : ''}">
        <td>
          <input type="checkbox" class="import-row-checkbox" data-idx="${idx}" ${isDup ? '' : 'checked'}>
        </td>
        <td style="font-family: var(--font-mono); font-size: 11.5px; color: var(--text-muted);">${exp.date || 'Today'}</td>
        <td><strong>${escapeHTML(exp.title || 'Expense')}</strong></td>
        <td><span class="category-pill">${escapeHTML(exp.category || 'Imported')}</span></td>
        <td class="amount-text">-${formatCurrency(parseFloat(exp.amount) || 0)}</td>
        <td style="font-size: 11px; color: var(--text-dim);">${escapeHTML(exp.paymentMethod || 'UPI / GPay')}</td>
        <td>
          ${isDup 
            ? `<span class="import-duplicate-badge" title="Matching date, amount, and title found in database" style="display: inline-flex; align-items: center; gap: 4px;">${icon('alert-triangle', 11)} Duplicate</span>` 
            : `<span style="color: #10B981; font-size: 11px; font-weight: 700; display: inline-flex; align-items: center; gap: 4px;">${icon('check', 11)} Ready</span>`}
        </td>
      </tr>
    `;
  }).join('');

  updateImportSelectedCount();

  tbody.querySelectorAll('.import-row-checkbox').forEach(cb => {
    cb.addEventListener('change', updateImportSelectedCount);
  });
}

function updateImportSelectedCount() {
  const checked = document.querySelectorAll('.import-row-checkbox:checked').length;
  const countEl = document.getElementById('import-btn-count');
  if (countEl) countEl.textContent = checked;
}

function handleImportResult(res) {
  if (!res || res.canceled) return;

  if (!res.success || !Array.isArray(res.expenses) || res.expenses.length === 0) {
    const errMsg = (res.errors && res.errors.length) ? res.errors.join('\n') : 'No valid expense records could be parsed from the file.';
    alert(`Import Error:\n${errMsg}`);
    return;
  }

  appState.importPendingExpenses = res.expenses;

  document.getElementById('import-format-badge').textContent = (res.format || 'CSV').toUpperCase();
  document.getElementById('import-count-text').textContent = res.expenses.length;

  const warningsBox = document.getElementById('import-warnings-box');
  if (res.warnings && res.warnings.length) {
    warningsBox.classList.remove('hidden');
    warningsBox.innerHTML = `<strong style="display: flex; align-items: center; gap: 6px;">${icon('alert-triangle', 14)} Parser Notes:</strong><br>${res.warnings.join('<br>')}`;
  } else {
    warningsBox.classList.add('hidden');
  }

  renderImportPreviewTable();

  // Select all checkbox handler in import preview
  const selectAllCb = document.getElementById('import-select-all');
  if (selectAllCb) {
    selectAllCb.checked = true;
    selectAllCb.onchange = (e) => {
      document.querySelectorAll('.import-row-checkbox').forEach(cb => cb.checked = e.target.checked);
      updateImportSelectedCount();
    };
  }

  document.getElementById('import-modal').classList.add('active');
}

function closeImportModal() {
  document.getElementById('import-modal').classList.remove('active');
  appState.importPendingExpenses = [];
}

// Setup Drag & Drop Handlers on Window
function setupDragAndDrop() {
  const overlay = document.getElementById('dropzone-overlay');
  let dragCounter = 0;

  window.addEventListener('dragenter', (e) => {
    e.preventDefault();
    dragCounter++;
    if (e.dataTransfer && e.dataTransfer.types && Array.from(e.dataTransfer.types).includes('Files')) {
      overlay?.classList.remove('hidden');
    }
  });

  window.addEventListener('dragover', (e) => {
    e.preventDefault();
  });

  window.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dragCounter--;
    if (dragCounter <= 0) {
      dragCounter = 0;
      overlay?.classList.add('hidden');
    }
  });

  window.addEventListener('drop', async (e) => {
    e.preventDefault();
    dragCounter = 0;
    overlay?.classList.add('hidden');

    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      const filePath = file.path;
      if (filePath) {
        showToast(`Parsing dropped file: ${file.name}...`);
        const res = await window.electronAPI.importFilePath(filePath);
        handleImportResult(res);
      }
    }
  });
}

function escapeHTML(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ==========================================================================
// Netflix Multi-Person Authentication & Profile Switcher Controllers
// ==========================================================================

async function initAppSession() {
  const status = await window.electronAPI.getAccountStatus();
  appState.account = status;

  if (!status.isConfigured) {
    showAuthScreen('signup');
    return;
  }

  if (status.rememberMe) {
    await showProfilePickerScreen();
  } else {
    showAuthScreen('login');
  }
}

function showAuthScreen(mode = 'login') {
  appState.authMode = mode;
  const authScreen = document.getElementById('screen-auth');
  const pickerScreen = document.getElementById('screen-profile-picker');
  const appContainer = document.getElementById('main-app-container');
  const loginTab = document.getElementById('auth-tab-login');
  const signupTab = document.getElementById('auth-tab-signup');
  const submitBtn = document.getElementById('auth-submit-btn');
  const errorBanner = document.getElementById('auth-error-banner');

  if (errorBanner) errorBanner.classList.add('hidden');

  authScreen?.classList.remove('hidden');
  pickerScreen?.classList.add('hidden');
  appContainer?.classList.add('hidden');

  const greetingTitle = document.getElementById('auth-greeting-title');
  const greetingSubtitle = document.getElementById('auth-greeting-subtitle');

  if (mode === 'signup') {
    loginTab?.classList.remove('active');
    signupTab?.classList.add('active');
    if (submitBtn) submitBtn.textContent = 'CREATE ACCOUNT';
    if (greetingTitle) greetingTitle.textContent = 'Welcome';
    if (greetingSubtitle) greetingSubtitle.textContent = 'Create your account to get started';
  } else {
    signupTab?.classList.remove('active');
    loginTab?.classList.add('active');
    if (submitBtn) submitBtn.textContent = 'SIGN IN';
    if (greetingTitle) greetingTitle.textContent = 'Welcome Back';
    if (greetingSubtitle) greetingSubtitle.textContent = 'Sign in to access your workspaces';
  }
}

async function showProfilePickerScreen() {
  const authScreen = document.getElementById('screen-auth');
  const pickerScreen = document.getElementById('screen-profile-picker');
  const appContainer = document.getElementById('main-app-container');
  const badgeEl = document.getElementById('picker-account-badge');

  if (appState.account && badgeEl) {
    badgeEl.textContent = `Account: ${appState.account.userId || 'Admin'}`;
  }

  authScreen?.classList.add('hidden');
  appContainer?.classList.add('hidden');
  pickerScreen?.classList.remove('hidden');

  appState.isManageProfiles = false;
  const manageBtn = document.getElementById('btn-picker-manage');
  if (manageBtn) manageBtn.innerHTML = `${icon('settings', 14)} Manage Profiles`;

  await renderProfilePickerGrid();

  // If no person profile exists yet, automatically prompt to create the first profile
  const profiles = await window.electronAPI.getProfiles();
  if (!profiles || profiles.length === 0) {
    openPersonModal();
  }
}

async function renderProfilePickerGrid() {
  const profiles = (await window.electronAPI.getProfiles()) || [];
  appState.profiles = profiles;
  const grid = document.getElementById('netflix-picker-grid');
  if (!grid) return;

  grid.innerHTML = profiles.map(p => {
    const count = p.expenseCount || 0;
    const color = p.color || p.avatar || getAvatarColor(p.name);
    const initials = getInitials(p.name);
    return `
      <div class="netflix-picker-card" onclick="enterUserDashboard('${p.id}')">
        <div class="netflix-picker-avatar" style="border-color: ${color}; color: ${color}; font-weight: 700; font-size: 36px;">
          ${initials}
        </div>
        <div class="netflix-picker-name">${escapeHTML(p.name)}</div>
        <div class="netflix-picker-badge">${count} ${count === 1 ? 'expense' : 'expenses'}</div>
      </div>
    `;
  }).join('') + `
    <div class="netflix-picker-card netflix-add-card" onclick="openPersonModal()">
      <div class="netflix-picker-avatar netflix-add-avatar">${icon('plus', 32)}</div>
      <div class="netflix-picker-name" style="color: var(--accent-primary);">Add Profile</div>
      <div class="netflix-picker-badge">New Profile</div>
    </div>
  `;
}

window.enterUserDashboard = async function(profileId) {
  const res = await window.electronAPI.switchProfile(profileId);
  if (res.success) {
    document.getElementById('screen-profile-picker')?.classList.add('hidden');
    document.getElementById('screen-auth')?.classList.add('hidden');
    document.getElementById('main-app-container')?.classList.remove('hidden');
    showToast(`Logged in as "${res.activeProfile?.name || 'User'}" ${res.activeProfile?.avatar || ''}`);
    await loadAppData();
    switchTab('dashboard');
  } else {
    alert(res.error || 'Failed to switch profile');
  }
};

window.openManageProfilesModal = async function() {
  const profiles = (await window.electronAPI.getProfiles()) || [];
  appState.profiles = profiles;
  const listEl = document.getElementById('manage-profiles-list');
  if (listEl) {
    listEl.innerHTML = profiles.map(p => {
      const count = p.expenseCount || 0;
      const color = p.color || p.avatar || getAvatarColor(p.name);
      const monogramHtml = renderMonogram(p.name, 36, color);
      return `
        <div class="manage-profile-row">
          <div class="manage-profile-info">
            <div class="manage-profile-avatar">${monogramHtml}</div>
            <div class="manage-profile-details">
              <div class="manage-profile-name">${escapeHTML(p.name)}</div>
              <div class="manage-profile-stat">${count} ${count === 1 ? 'expense logged' : 'expenses logged'}</div>
            </div>
          </div>
          <div class="manage-profile-actions">
            <button type="button" class="btn-row-action" onclick="openPersonModal('${p.id}'); closeManageProfilesModal();">${icon('pencil', 12)} Edit</button>
            <button type="button" class="btn-row-action btn-row-danger" onclick="handleDeleteProfile('${p.id}', '${escapeHTML(p.name)}')">${icon('trash-2', 12)}</button>
          </div>
        </div>
      `;
    }).join('');
  }
  document.getElementById('manage-profiles-modal')?.classList.add('active');
};

window.closeManageProfilesModal = function() {
  document.getElementById('manage-profiles-modal')?.classList.remove('active');
};

window.handleDeleteProfile = async function(profileId, profileName) {
  if ((appState.profiles || []).length <= 1) {
    alert('Cannot delete the only remaining profile in your account.');
    return;
  }
  if (confirm(`Are you sure you want to delete profile "${profileName}"? All associated personal records will be removed.`)) {
    const res = await window.electronAPI.deleteProfile(profileId);
    if (res.success) {
      showToast(`Deleted profile "${profileName}"`);
      await renderProfilePickerGrid();
      await openManageProfilesModal();
    } else {
      alert(res.error || 'Failed to delete profile');
    }
  }
};

window.openPersonModal = function(id = null) {
  const modal = document.getElementById('person-modal');
  if (!modal) return;

  const headingEl = document.getElementById('person-modal-heading');
  const idEl = document.getElementById('person-form-id');
  const nameEl = document.getElementById('person-form-name');
  const deleteBtn = document.getElementById('btn-delete-person');

  if (id) {
    const p = (appState.profiles || []).find(prof => prof.id === id);
    if (!p) return;
    if (headingEl) headingEl.innerHTML = `${icon('pencil', 18)} Edit Profile: ${escapeHTML(p.name)}`;
    if (idEl) idEl.value = p.id;
    if (nameEl) nameEl.value = p.name;
    selectAvatarColor(p.color || p.avatar || '#D9822B');
    if (deleteBtn) {
      deleteBtn.classList.toggle('hidden', (appState.profiles || []).length <= 1);
    }
  } else {
    if (headingEl) headingEl.innerHTML = `${icon('plus', 18)} Add Profile`;
    if (idEl) idEl.value = '';
    if (nameEl) nameEl.value = '';
    selectAvatarColor('#D9822B');
    if (deleteBtn) deleteBtn.classList.add('hidden');
  }

  updatePersonAvatarPreview();
  modal.classList.add('active');
  setTimeout(() => nameEl?.focus(), 50);
};

window.closePersonModal = function() {
  document.getElementById('person-modal')?.classList.remove('active');
};

function selectAvatarColor(color) {
  const hiddenInput = document.getElementById('person-form-avatar');
  if (hiddenInput) hiddenInput.value = color;

  document.querySelectorAll('#avatar-color-strip .color-dot-opt').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-color') === color);
  });
  updatePersonAvatarPreview();
}

function updatePersonAvatarPreview() {
  const name = document.getElementById('person-form-name')?.value || '';
  const color = document.getElementById('person-form-avatar')?.value || '#D9822B';
  const previewEl = document.getElementById('person-avatar-preview');
  if (previewEl) {
    const initials = getInitials(name || 'New Profile');
    previewEl.textContent = initials;
    previewEl.style.borderColor = color;
    previewEl.style.color = color;
  }
}

async function logoutUserSession() {
  await window.electronAPI.logoutAccount();
  appState.account = await window.electronAPI.getAccountStatus();
  showToast('Logged out of master account');
  showAuthScreen('login');
}

// ==========================================================================
// Phase 3: Collapsible Navigation Sidebar & Drawer Engine
// ==========================================================================
window.toggleSidebar = function(forceState = null) {
  const sidebar = document.getElementById('app-sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');
  if (!sidebar) return;

  const isExpanded = forceState !== null ? forceState : !sidebar.classList.contains('expanded');
  sidebar.classList.toggle('expanded', isExpanded);
  if (backdrop) backdrop.classList.toggle('hidden', !isExpanded);
};

// ==========================================================================
// Phase 3: Privacy Mode Toggle Engine
// ==========================================================================
window.togglePrivacyMode = function(forceState = null) {
  appState.isPrivacyMode = forceState !== null ? forceState : !appState.isPrivacyMode;
  document.body.classList.toggle('privacy-mode', appState.isPrivacyMode);

  const lockBadge = document.getElementById('privacy-lock-badge');
  const titlebarIcon = document.getElementById('brand-logo-icon');
  const dashboardBrandIcon = document.getElementById('dashboard-brand-icon');
  const dashboardPrivacyBadge = document.getElementById('dashboard-privacy-badge');

  if (lockBadge) lockBadge.classList.toggle('hidden', !appState.isPrivacyMode);
  if (titlebarIcon) titlebarIcon.innerHTML = appState.isPrivacyMode ? icon('lock', 14) : icon('credit-card', 14);
  if (dashboardBrandIcon) dashboardBrandIcon.innerHTML = appState.isPrivacyMode ? icon('lock', 18) : icon('credit-card', 18);
  if (dashboardPrivacyBadge) {
    dashboardPrivacyBadge.innerHTML = appState.isPrivacyMode 
      ? `<span style="display: inline-flex; align-items: center; gap: 4px;">${icon('lock', 12)} Stealth</span>` 
      : `<span style="display: inline-flex; align-items: center; gap: 4px;">${icon('eye', 12)} Normal</span>`;
  }

  showToast(appState.isPrivacyMode ? 'Stealth Mode Active (Amounts Masked)' : 'Normal Visibility Mode Restored');
};

// ==========================================================================
// Phase 3: Universal Command Palette (Ctrl+K) Engine
// ==========================================================================
window.openCommandPalette = function() {
  const modal = document.getElementById('command-palette-modal');
  const input = document.getElementById('command-palette-input');
  if (!modal || !input) return;

  modal.classList.add('active');
  input.value = '';
  appState.paletteSelectedIndex = 0;
  filterCommandPalette('');
  setTimeout(() => input.focus(), 50);
};

window.closeCommandPalette = function() {
  const modal = document.getElementById('command-palette-modal');
  if (modal) modal.classList.remove('active');
};

function filterCommandPalette(query) {
  const container = document.getElementById('command-palette-results');
  if (!container) return;

  const q = query.trim().toLowerCase();
  const flatResults = [];
  const categorized = {
    actions: [],
    workspaces: [],
    members: [],
    transactions: []
  };

  // 1. Quick App Actions
  const actions = [
    { title: 'Log New Expense', badge: 'Action', icon: 'plus', category: 'Quick Actions', run: () => openAddModal() },
    { title: 'Import Data File (CSV, Excel, PDF, JSON)', badge: 'Action', icon: 'download', category: 'Quick Actions', run: () => document.getElementById('btn-import-file')?.click() },
    { title: 'Configure Salary & Budget Allocator', badge: 'Action', icon: 'settings', category: 'Quick Actions', run: () => document.getElementById('btn-open-salary-modal')?.click() },
    { title: 'Export Excel Spreadsheet', badge: 'Action', icon: 'file-text', category: 'Quick Actions', run: () => document.getElementById('btn-export-excel')?.click() },
    { title: 'Export CSV Data', badge: 'Action', icon: 'file', category: 'Quick Actions', run: () => document.getElementById('btn-export-csv')?.click() },
    { title: 'Toggle Privacy Stealth Mode (P)', badge: 'Action', icon: 'lock', category: 'Quick Actions', run: () => togglePrivacyMode() },
    { title: 'Switch User Profile (Netflix Hub)', badge: 'Action', icon: 'refresh-cw', category: 'Quick Actions', run: () => openProfilePickerScreen() }
  ];

  actions.forEach(a => {
    if (!q || a.title.toLowerCase().includes(q)) categorized.actions.push(a);
  });

  // 2. Navigation Workspaces
  const workspaces = [
    { title: 'Go to Financial Dashboard', badge: 'Workspace', icon: 'bar-chart-2', category: 'Workspaces', run: () => switchTab('dashboard') },
    { title: 'Go to Household Shared Hub', badge: 'Workspace', icon: 'users', category: 'Workspaces', run: () => switchTab('household') },
    { title: 'Go to Expense Feed & Ledger', badge: 'Workspace', icon: 'banknote', category: 'Workspaces', run: () => switchTab('expenses') },
    { title: 'Go to Batch Entry Spreadsheet', badge: 'Workspace', icon: 'clipboard-list', category: 'Workspaces', run: () => switchTab('batch') },
    { title: 'Go to Contextual Notes Gallery', badge: 'Workspace', icon: 'file-text', category: 'Workspaces', run: () => switchTab('notes') }
  ];

  workspaces.forEach(w => {
    if (!q || w.title.toLowerCase().includes(q)) categorized.workspaces.push(w);
  });

  // 3. User Profiles & Members
  (appState.profiles || []).forEach(p => {
    if (!q || p.name.toLowerCase().includes(q)) {
      categorized.members.push({
        title: `Filter Scope: ${p.name}`,
        badge: 'Profile Scope',
        icon: 'user',
        category: 'Household Members',
        run: () => {
          appState.dashboardScope = p.id;
          const select = document.getElementById('dashboard-scope-filter');
          if (select) select.value = p.id;
          renderAll();
          switchTab('dashboard');
        }
      });
    }
  });

  // 4. Matching Transactions
  if (q) {
    const searchPool = (appState.allHouseholdExpenses && appState.allHouseholdExpenses.length > 0)
      ? appState.allHouseholdExpenses
      : appState.expenses;

    searchPool.forEach(e => {
      if (e.title.toLowerCase().includes(q) || (e.description && e.description.toLowerCase().includes(q))) {
        categorized.transactions.push({
          title: `${e.title} (${formatCurrency(parseFloat(e.amount) || 0)})`,
          badge: `${e.profileName ? `${e.profileName} • ` : ''}${e.category} • ${e.date}`,
          icon: 'wallet',
          category: 'Stored Transactions',
          run: () => {
            openEditModal(e.id);
          }
        });
      }
    });
  }

  // Combine in section order
  const sections = [
    { name: 'Quick Actions', items: categorized.actions },
    { name: 'Workspaces', items: categorized.workspaces },
    { name: 'Household Members', items: categorized.members },
    { name: 'Stored Transactions', items: categorized.transactions }
  ];

  let html = '';
  let globalIdx = 0;

  sections.forEach(sec => {
    if (sec.items.length > 0) {
      html += `<div class="palette-section-header">${sec.name}</div>`;
      sec.items.slice(0, 6).forEach(item => {
        const itemIdx = globalIdx++;
        flatResults.push(item);
        const isSelected = itemIdx === appState.paletteSelectedIndex;
        html += `
          <div class="palette-result-item ${isSelected ? 'selected' : ''}" onclick="executePaletteItem(${itemIdx})">
            <div class="palette-item-left">
              <span style="display: inline-flex; align-items: center;">${(typeof item.icon === 'string' && typeof ICON_SVG_MAP !== 'undefined' && ICON_SVG_MAP[item.icon]) ? icon(item.icon, 16) : (item.icon || icon('search', 16))}</span>
              <span>${escapeHTML(item.title)}</span>
            </div>
            <span class="palette-category-badge">${escapeHTML(item.badge)}</span>
          </div>
        `;
      });
    }
  });

  appState.paletteResults = flatResults;
  if (appState.paletteSelectedIndex >= flatResults.length) {
    appState.paletteSelectedIndex = 0;
  }

  if (flatResults.length === 0) {
    container.innerHTML = `
      <div style="padding: 24px; text-align: center; color: var(--text-muted); font-size: 13.5px;">
        No actions, workspaces, or records matching "<strong>${escapeHTML(query)}</strong>"
      </div>
    `;
    return;
  }

  container.innerHTML = html;
}

function handlePaletteKeydown(e) {
  const count = Math.min(15, appState.paletteResults.length);
  if (count === 0) return;

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    appState.paletteSelectedIndex = (appState.paletteSelectedIndex + 1) % count;
    renderPaletteSelection();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    appState.paletteSelectedIndex = (appState.paletteSelectedIndex - 1 + count) % count;
    renderPaletteSelection();
  } else if (e.key === 'Enter') {
    e.preventDefault();
    executePaletteItem(appState.paletteSelectedIndex);
  }
}

function renderPaletteSelection() {
  const items = document.querySelectorAll('.palette-result-item');
  items.forEach((el, idx) => {
    el.classList.toggle('selected', idx === appState.paletteSelectedIndex);
  });
}

window.executePaletteItem = function(index) {
  const item = appState.paletteResults[index];
  if (item && item.run) {
    closeCommandPalette();
    item.run();
  }
};



