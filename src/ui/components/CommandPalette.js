/**
 * LEDGERLY — COMMAND PALETTE (CTRL+K) COMPONENT
 *
 * Universal keyboard-driven spotlight command center:
 * - Instant modal launcher via Ctrl+K / Cmd+K or toolbar search button
 * - Omnipresent unified search across 4 operational domains:
 *   1. Quick Actions (New expense, file import, exports, privacy toggle, profile hub)
 *   2. Workspaces Navigation (Dashboard, Household, Expenses, Batch, Notes)
 *   3. Household Member Profile Filtering & Scoping
 *   4. Stored Transaction Records Search (Title, description, amount, date)
 * - Arrow key navigation (↑/↓) with auto-cycling, Enter execution, Escape to dismiss
 * - Zero inline event handlers (fully delegated with unmount cleanups)
 *
 * @module src/ui/components/CommandPalette
 */

// ============================================================================
// EXTERNAL DEPENDENCIES & HELPERS
// ============================================================================

import { escapeHTML, delegateEvent } from '../helpers/dom.js';
import { formatCurrency } from '../helpers/formatters.js';
import { showToast } from '../helpers/toast.js';

// ============================================================================
// SAFE SHUNTING-YARD ARITHMETIC EVALUATOR (Phase 7 - Zero eval() / Function())
// ============================================================================

/**
 * Safely evaluates basic arithmetic expressions without eval() or new Function().
 * Uses Shunting-yard algorithm to generate RPN and computes results.
 * Supports +, -, *, /, %, unary minus, and parentheses.
 *
 * @param {string} expr - Arithmetic string e.g. "10 + 20 * 3"
 * @returns {number|null} Evaluated number or null if invalid
 */
export function safeEvaluateMath(expr) {
  if (!expr || typeof expr !== 'string') return null;

  let cleaned = expr.trim();
  if (cleaned.startsWith('=')) {
    cleaned = cleaned.slice(1).trim();
  }

  // Expression must only contain digits, spaces, and valid math symbols
  if (!/^[0-9+\-*/%().\s]+$/.test(cleaned)) {
    return null;
  }

  // Must contain at least one digit
  if (!/\d/.test(cleaned)) {
    return null;
  }

  // Must contain at least one operator or start with '=' in the original input
  const hasOperator = /[+\-*/%]/.test(cleaned);
  const hadEquals = expr.trim().startsWith('=');
  if (!hasOperator && !hadEquals) {
    return null;
  }

  // Tokenize
  const tokens = [];
  let i = 0;
  while (i < cleaned.length) {
    const char = cleaned[i];
    if (/\s/.test(char)) {
      i++;
      continue;
    }

    if (/[0-9.]/.test(char)) {
      let numStr = '';
      while (i < cleaned.length && /[0-9.]/.test(cleaned[i])) {
        numStr += cleaned[i];
        i++;
      }
      const num = parseFloat(numStr);
      if (isNaN(num)) return null;
      tokens.push({ type: 'NUMBER', value: num });
      continue;
    }

    if (char === '+' || char === '-' || char === '*' || char === '/' || char === '%') {
      // Check for unary minus
      const prevToken = tokens[tokens.length - 1];
      const isUnary =
        (char === '-' || char === '+') &&
        (!prevToken || prevToken.type === 'OPERATOR' || prevToken.type === 'UNARY_NEG' || prevToken.type === 'LPAREN');

      if (isUnary) {
        if (char === '-') {
          tokens.push({ type: 'UNARY_NEG', value: 'neg', precedence: 3 });
        }
        i++;
        continue;
      }

      const precedence = char === '*' || char === '/' || char === '%' ? 2 : 1;
      tokens.push({ type: 'OPERATOR', value: char, precedence });
      i++;
      continue;
    }

    if (char === '(') {
      tokens.push({ type: 'LPAREN' });
      i++;
      continue;
    }

    if (char === ')') {
      tokens.push({ type: 'RPAREN' });
      i++;
      continue;
    }

    return null;
  }

  // Shunting-Yard to RPN
  const outputQueue = [];
  const operatorStack = [];

  for (const token of tokens) {
    if (token.type === 'NUMBER') {
      outputQueue.push(token);
    } else if (token.type === 'UNARY_NEG') {
      operatorStack.push(token);
    } else if (token.type === 'OPERATOR') {
      while (
        operatorStack.length > 0 &&
        (operatorStack[operatorStack.length - 1].type === 'OPERATOR' ||
          operatorStack[operatorStack.length - 1].type === 'UNARY_NEG') &&
        operatorStack[operatorStack.length - 1].precedence >= token.precedence
      ) {
        outputQueue.push(operatorStack.pop());
      }
      operatorStack.push(token);
    } else if (token.type === 'LPAREN') {
      operatorStack.push(token);
    } else if (token.type === 'RPAREN') {
      let foundLparen = false;
      while (operatorStack.length > 0) {
        const top = operatorStack.pop();
        if (top.type === 'LPAREN') {
          foundLparen = true;
          break;
        }
        outputQueue.push(top);
      }
      if (!foundLparen) return null;
    }
  }

  while (operatorStack.length > 0) {
    const top = operatorStack.pop();
    if (top.type === 'LPAREN' || top.type === 'RPAREN') return null;
    outputQueue.push(top);
  }

  // Evaluate RPN
  const evalStack = [];
  for (const token of outputQueue) {
    if (token.type === 'NUMBER') {
      evalStack.push(token.value);
    } else if (token.type === 'UNARY_NEG') {
      if (evalStack.length < 1) return null;
      const a = evalStack.pop();
      evalStack.push(-a);
    } else if (token.type === 'OPERATOR') {
      if (evalStack.length < 2) return null;
      const b = evalStack.pop();
      const a = evalStack.pop();
      let res;
      switch (token.value) {
        case '+':
          res = a + b;
          break;
        case '-':
          res = a - b;
          break;
        case '*':
          res = a * b;
          break;
        case '/':
          if (b === 0) return null;
          res = a / b;
          break;
        case '%':
          if (b === 0) return null;
          res = a % b;
          break;
        default:
          return null;
      }
      evalStack.push(res);
    }
  }

  if (evalStack.length !== 1) return null;
  const finalVal = evalStack[0];
  return isFinite(finalVal) ? finalVal : null;
}

// ============================================================================
// SAFE ICON HELPER
// ============================================================================

function safeIcon(name, size = 16) {
  if (typeof icon === 'function') {
    return icon(name, size);
  }
  return `<i data-icon="${escapeHTML(name)}" data-icon-size="${size}"></i>`;
}

// ============================================================================
// COMMAND PALETTE COMPONENT CLASS
// ============================================================================

export class CommandPalette {
  /**
   * Reactive state store adapter.
   * @type {any}
   */
  state = null;

  /**
   * Action callbacks dispatch map.
   * @type {Object}
   */
  handlers = {};

  /**
   * Currently displayed flat results.
   * @type {Array<any>}
   * @private
   */
  #flatResults = [];

  /**
   * Currently active highlighted index.
   * @type {number}
   * @private
   */
  #selectedIndex = 0;

  /**
   * Unbind callbacks for cleanup.
   * @type {Array<() => void>}
   * @private
   */
  #cleanups = [];

  /**
   * Construct CommandPalette instance.
   * @param {Object} [options={}]
   * @param {any} [options.state] - State adapter
   * @param {Object} [options.handlers={}] - Action dispatch callbacks
   */
  constructor(options = {}) {
    this.state = options.state || null;
    this.handlers = options.handlers || {};
  }

  // ==========================================================================
  // LIFECYCLE HOOKS
  // ==========================================================================

  /**
   * Mount keyboard shortcut and input listeners.
   */
  mount() {
    if (typeof document === 'undefined') return;

    this.#bindTriggersAndInputs();
    this.#bindGlobalShortcut();
    this.#bindResultsList();
  }

  /**
   * Clean up all event listeners.
   */
  unmount() {
    this.#cleanups.forEach(cleanup => {
      try {
        cleanup();
      } catch (err) {
        console.warn('CommandPalette cleanup error:', err);
      }
    });
    this.#cleanups = [];
    this.#flatResults = [];
    this.#selectedIndex = 0;
  }

  // ==========================================================================
  // MODAL OPEN / CLOSE CONTROLLERS
  // ==========================================================================

  /**
   * Open Universal Command Palette modal and autofocus input.
   */
  open() {
    if (typeof document === 'undefined') return;

    const modal = document.getElementById('command-palette-modal');
    const input = /** @type {HTMLInputElement|null} */ (document.getElementById('command-palette-input'));
    if (!modal || !input) return;

    modal.classList.add('active');
    input.value = '';
    this.#selectedIndex = 0;
    this.filter('');

    setTimeout(() => input.focus(), 40);
  }

  /**
   * Close Universal Command Palette modal.
   */
  close() {
    if (typeof document === 'undefined') return;
    const modal = document.getElementById('command-palette-modal');
    if (modal) modal.classList.remove('active');
  }

  // ==========================================================================
  // SEARCH & FILTER ENGINE
  // ==========================================================================

  /**
   * Filter and render command palette items based on query.
   * @param {string} query
   */
  filter(query) {
    if (typeof document === 'undefined') return;

    const container = document.getElementById('command-palette-results');
    if (!container) return;

    const q = (query || '').trim().toLowerCase();
    this.#flatResults = [];

    const categorized = {
      calculator: /** @type {Array<any>} */ ([]),
      actions: /** @type {Array<any>} */ ([]),
      workspaces: /** @type {Array<any>} */ ([]),
      members: /** @type {Array<any>} */ ([]),
      transactions: /** @type {Array<any>} */ ([]),
      notes: /** @type {Array<any>} */ ([])
    };

    // 0. Quick Arithmetic Calculator (Phase 7 - Zero eval)
    const mathResult = safeEvaluateMath(query);
    if (mathResult !== null && isFinite(mathResult)) {
      categorized.calculator.push({
        title: `= ${formatCurrency(mathResult)} (${mathResult.toLocaleString()})`,
        badge: 'Calculated',
        icon: 'check',
        category: 'Quick Calculator',
        run: async () => {
          if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
            try {
              await navigator.clipboard.writeText(String(mathResult));
              showToast(`Copied ${mathResult} to clipboard`);
            } catch {
              showToast(`Result: ${mathResult}`);
            }
          } else {
            showToast(`Result: ${mathResult}`);
          }
        }
      });
    }

    // 1. Quick App Actions
    const actions = [
      {
        title: 'Log New Expense',
        badge: 'Action',
        icon: 'plus',
        category: 'Quick Actions',
        run: () => this.handlers.onOpenAddExpense?.()
      },
      {
        title: 'Import Data File (CSV, Excel, PDF, JSON)',
        badge: 'Action',
        icon: 'download',
        category: 'Quick Actions',
        run: () => this.handlers.onImportFile?.()
      },
      {
        title: 'Configure Salary & Budget Allocator',
        badge: 'Action',
        icon: 'settings',
        category: 'Quick Actions',
        run: () => this.handlers.onOpenSalaryModal?.()
      },
      {
        title: 'Export Excel Spreadsheet',
        badge: 'Action',
        icon: 'file-text',
        category: 'Quick Actions',
        run: () => this.handlers.onExportExcel?.()
      },
      {
        title: 'Export CSV Data',
        badge: 'Action',
        icon: 'file',
        category: 'Quick Actions',
        run: () => this.handlers.onExportCsv?.()
      },
      {
        title: 'Toggle Privacy Stealth Mode (P)',
        badge: 'Action',
        icon: 'lock',
        category: 'Quick Actions',
        run: () => this.handlers.onTogglePrivacy?.()
      },
      {
        title: 'Switch User Profile (Netflix Hub)',
        badge: 'Action',
        icon: 'refresh-cw',
        category: 'Quick Actions',
        run: () => this.handlers.onOpenProfilePicker?.()
      }
    ];

    actions.forEach(a => {
      if (!q || a.title.toLowerCase().includes(q)) {
        categorized.actions.push(a);
      }
    });

    // 2. Navigation Workspaces
    const workspaces = [
      {
        title: 'Go to Financial Dashboard',
        badge: 'Workspace',
        icon: 'bar-chart-2',
        category: 'Workspaces',
        run: () => this.handlers.onNavigateTab?.('dashboard')
      },
      {
        title: 'Go to Household Shared Hub',
        badge: 'Workspace',
        icon: 'users',
        category: 'Workspaces',
        run: () => this.handlers.onNavigateTab?.('household')
      },
      {
        title: 'Go to Expense Feed & Ledger',
        badge: 'Workspace',
        icon: 'banknote',
        category: 'Workspaces',
        run: () => this.handlers.onNavigateTab?.('expenses')
      },
      {
        title: 'Go to Batch Entry Spreadsheet',
        badge: 'Workspace',
        icon: 'clipboard-list',
        category: 'Workspaces',
        run: () => this.handlers.onNavigateTab?.('batch')
      },
      {
        title: 'Go to Contextual Notes Gallery',
        badge: 'Workspace',
        icon: 'file-text',
        category: 'Workspaces',
        run: () => this.handlers.onNavigateTab?.('notes')
      },
      {
        title: 'Go to Import & Scanned Bill Queue',
        badge: 'Workspace',
        icon: 'file-up',
        category: 'Workspaces',
        run: () => this.handlers.onNavigateTab?.('import')
      }
    ];

    workspaces.forEach(w => {
      if (!q || w.title.toLowerCase().includes(q)) {
        categorized.workspaces.push(w);
      }
    });

    // 3. User Profiles & Household Members
    const profiles = this.state?.get('profiles') || [];
    profiles.forEach(p => {
      if (!q || p.name.toLowerCase().includes(q)) {
        categorized.members.push({
          title: `Filter Scope: ${p.name}`,
          badge: 'Profile Scope',
          icon: 'user',
          category: 'Household Members',
          run: () => this.handlers.onSetScope?.(p.id)
        });
      }
    });

    // 4. Stored Transactions Search
    if (q) {
      const expenses = this.state?.get('expenses') || [];
      const allHousehold = this.state?.get('allHouseholdExpenses') || [];
      const searchPool = allHousehold.length > 0 ? allHousehold : expenses;

      searchPool.forEach(e => {
        const titleMatch = e.title?.toLowerCase().includes(q);
        const descMatch = e.description && e.description.toLowerCase().includes(q);
        if (titleMatch || descMatch) {
          categorized.transactions.push({
            title: `${e.title} (${formatCurrency(parseFloat(e.amount) || 0)})`,
            badge: `${e.paidBy ? `${e.paidBy} • ` : ''}${e.category} • ${e.date}`,
            icon: 'wallet',
            category: 'Stored Transactions',
            run: () => this.handlers.onOpenExpenseModal?.(e.id)
          });
        }
      });
    }

    // 5. Notes & Attachments Search (Phase 7)
    if (q) {
      const notes = this.state?.get('notes') || [];
      notes.forEach(n => {
        const titleMatch = n.title?.toLowerCase().includes(q);
        const contentMatch = n.content && n.content.toLowerCase().includes(q);
        const tagMatch = Array.isArray(n.tags) && n.tags.some(t => t.toLowerCase().includes(q));
        if (titleMatch || contentMatch || tagMatch) {
          categorized.notes.push({
            title: n.title || 'Untitled Note',
            badge: n.tags && n.tags.length > 0 ? n.tags.join(', ') : 'Note',
            icon: 'file-text',
            category: 'Notes & Attachments',
            run: () => {
              this.handlers.onNavigateTab?.('notes');
              if (n.expenseId && this.handlers.onOpenNoteModal) {
                this.handlers.onOpenNoteModal(n.expenseId, n.title);
              }
            }
          });
        }
      });
    }

    // Assemble Flat Array & HTML in category order
    const sections = [
      { name: 'Quick Calculator', items: categorized.calculator },
      { name: 'Quick Actions', items: categorized.actions },
      { name: 'Workspaces', items: categorized.workspaces },
      { name: 'Household Members', items: categorized.members },
      { name: 'Stored Transactions', items: categorized.transactions },
      { name: 'Notes & Attachments', items: categorized.notes }
    ];

    let html = '';
    let globalIdx = 0;

    sections.forEach(sec => {
      if (sec.items.length > 0) {
        html += `<div class="palette-section-header">${sec.name}</div>`;
        sec.items.slice(0, 6).forEach(item => {
          const itemIdx = globalIdx++;
          this.#flatResults.push(item);
          const isSelected = itemIdx === this.#selectedIndex;

          html += `
            <div class="palette-result-item ${isSelected ? 'selected' : ''}" data-action="execute-item" data-index="${itemIdx}">
              <div class="palette-item-left">
                <span style="display: inline-flex; align-items: center;">${safeIcon(item.icon, 16)}</span>
                <span>${escapeHTML(item.title)}</span>
              </div>
              <span class="palette-category-badge">${escapeHTML(item.badge)}</span>
            </div>
          `;
        });
      }
    });

    if (this.#selectedIndex >= this.#flatResults.length) {
      this.#selectedIndex = 0;
    }

    if (this.#flatResults.length === 0) {
      container.innerHTML = `
        <div style="padding: 24px; text-align: center; color: var(--text-muted); font-size: 13.5px;">
          No actions, workspaces, or records matching "<strong>${escapeHTML(query)}</strong>"
        </div>
      `;
      return;
    }

    container.innerHTML = html;
  }

  // ==========================================================================
  // KEYBOARD NAVIGATION CONTROLLER
  // ==========================================================================

  /**
   * Handle arrow keys and enter in search input.
   * @param {KeyboardEvent} e
   */
  handleKeydown(e) {
    const count = Math.min(15, this.#flatResults.length);
    if (count === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.#selectedIndex = (this.#selectedIndex + 1) % count;
      this.#renderSelection();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.#selectedIndex = (this.#selectedIndex - 1 + count) % count;
      this.#renderSelection();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      this.executeItem(this.#selectedIndex);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      this.close();
    }
  }

  /**
   * Update visual selection class on rendered items.
   * @private
   */
  #renderSelection() {
    if (typeof document === 'undefined') return;
    const items = document.querySelectorAll('.palette-result-item');
    items.forEach((el, idx) => {
      el.classList.toggle('selected', idx === this.#selectedIndex);
      if (idx === this.#selectedIndex) {
        el.scrollIntoView({ block: 'nearest' });
      }
    });
  }

  /**
   * Execute action at index and close palette.
   * @param {number} index
   */
  executeItem(index) {
    const item = this.#flatResults[index];
    if (item?.run) {
      this.close();
      item.run();
    }
  }

  // ==========================================================================
  // EVENT BINDINGS (ZERO INLINE ONCLICK)
  // ==========================================================================

  /**
   * Bind open triggers, close button, and search input.
   * @private
   */
  #bindTriggersAndInputs() {
    const bindEl = (id, event, handler) => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener(event, handler);
        this.#cleanups.push(() => el.removeEventListener(event, handler));
      }
    };

    bindEl('btn-open-command-palette', 'click', () => this.open());
    bindEl('btn-close-palette', 'click', () => this.close());

    const input = document.getElementById('command-palette-input');
    if (input) {
      const inputHandler = e => this.filter(e.target.value);
      const keydownHandler = e => this.handleKeydown(e);

      input.addEventListener('input', inputHandler);
      input.addEventListener('keydown', keydownHandler);

      this.#cleanups.push(() => input.removeEventListener('input', inputHandler));
      this.#cleanups.push(() => input.removeEventListener('keydown', keydownHandler));
    }

    // Close on backdrop click
    const modal = document.getElementById('command-palette-modal');
    if (modal) {
      const backdropHandler = e => {
        if (e.target === modal) this.close();
      };
      modal.addEventListener('click', backdropHandler);
      this.#cleanups.push(() => modal.removeEventListener('click', backdropHandler));
    }
  }

  /**
   * Bind global Ctrl+K / Cmd+K shortcut listener.
   * @private
   */
  #bindGlobalShortcut() {
    const keyHandler = e => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        const modal = document.getElementById('command-palette-modal');
        if (modal?.classList.contains('active')) {
          this.close();
        } else {
          this.open();
        }
      }
    };

    window.addEventListener('keydown', keyHandler);
    this.#cleanups.push(() => window.removeEventListener('keydown', keyHandler));
  }

  /**
   * Bind delegated click execution for palette result items.
   * @private
   */
  #bindResultsList() {
    const container = document.getElementById('command-palette-results');
    if (!container) return;

    const unbind = delegateEvent(container, 'click', '[data-action="execute-item"]', (event, target) => {
      const idxStr = target.getAttribute('data-index');
      if (idxStr !== null) {
        const idx = parseInt(idxStr, 10);
        this.executeItem(idx);
      }
    });

    this.#cleanups.push(unbind);
  }
}
