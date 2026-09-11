'use strict';

/**
 * @fileoverview Reactive Encapsulated Application State Container
 *
 * Architecture Position: src/ui/AppState.js
 * Role: Replaces the monolithic global mutable appState object with an
 *       encapsulated reactive store featuring private `#state`, fine-grained
 *       key subscriptions, and defensive snapshots.
 * Dependencies: src/types.js
 */

// ============================================================================
//  AppState Class
// ============================================================================

export class AppState {
  /**
   * Private internal state dictionary.
   * @type {Record<string, any>}
   */
  #state = {};

  /**
   * Subscriber registry mapping state keys to sets of listener callbacks.
   * @type {Map<string, Set<function(any, any): void>>}
   */
  #subscribers = new Map();

  /**
   * Bounded in-memory action history stack for global Ctrl+Z restoration.
   * @type {Array<{ type: string, payload: any, description: string, timestamp: number }>}
   */
  #undoStack = [];

  static MAX_UNDO_STACK_SIZE = 10;

  // ==========================================================================
  //  Constructor & Initial State Baseline
  // ==========================================================================

  /**
   * Initializes state with all 35 domain baseline properties matching legacy appState.
   * @param {Record<string, any>} [initialOverrides={}] - Optional initial state overrides
   */
  constructor(initialOverrides = {}) {
    this.#state = {
      // Authentication & Profile Tenant State
      account: null,
      authMode: 'login', // 'login' | 'signup'
      isManageProfiles: false,
      profiles: [],
      activeProfile: null,

      // UI View Configuration & Mode
      currentTab: 'dashboard',
      workspaceMode: 'household', // 'household' | 'solo'
      isPrivacyMode: false,
      dashboardScope: 'ALL', // 'ALL' | profileId

      // Domain Collections
      expenses: [],
      categories: [],
      presets: [],
      notes: [],
      settlements: [],
      recurringBills: [],
      householdMembers: ['Self', 'Partner', 'Roommate'],

      // Budget & Salary Pacing Configuration
      budgetGoal: 30000,
      salaryConfig: {
        monthlyIncome: 60000,
        fixedBills: 20000,
        savingsGoal: 10000
      },

      // Expense Feed Workspace State
      feedFilters: {
        search: '',
        category: 'ALL',
        paymentMethod: 'ALL',
        member: 'ALL',
        dateRange: 'ALL'
      },
      feedSort: {
        column: 'date',
        direction: 'desc'
      },
      feedPage: 1,
      feedPageSize: 20,
      feedSelectedIds: new Set(),

      // Notes Filtering State
      filterNotesRelation: 'ALL',
      filterNotesSearch: '',
      activeNoteRelation: 'ALL',

      // General Filters (Dashboard / Legacy)
      filterSearch: '',
      filterCategory: 'ALL',
      filterSort: 'DATE_DESC',

      // Command Palette & Modals
      paletteSelectedIndex: 0,
      paletteResults: [],
      selectedSplits: new Set(),
      importPendingExpenses: [],
      pendingReceiptPath: null,
      pendingReceiptFilename: null,

      // Forward-Extensibility Slot (For plugins, themes, multi-currency)
      extensions: {},

      ...initialOverrides
    };
  }

  // ==========================================================================
  //  State Access & Mutation (Encapsulated)
  // ==========================================================================

  /**
   * Retrieves the value of a state property.
   *
   * @param {string} key - Property name
   * @returns {any} Property value
   */
  get(key) {
    return this.#state[key];
  }

  /**
   * Sets the value of a state property and notifies registered subscribers.
   *
   * @param {string} key - Property name
   * @param {any} value - New value
   * @returns {void}
   */
  set(key, value) {
    const oldValue = this.#state[key];
    this.#state[key] = value;
    this.#notify(key, value, oldValue);
  }

  /**
   * Applies multiple state updates in a single batch call.
   *
   * @param {Record<string, any>} patch - Key-value map of updates
   * @returns {void}
   */
  update(patch) {
    if (!patch || typeof patch !== 'object') return;

    for (const [key, value] of Object.entries(patch)) {
      const oldValue = this.#state[key];
      this.#state[key] = value;
      this.#notify(key, value, oldValue);
    }
  }

  /**
   * Returns a snapshot object of the current state for rendering or debugging.
   *
   * @returns {Record<string, any>} Shallow clone of current state
   */
  snapshot() {
    return { ...this.#state };
  }

  // ==========================================================================
  //  Reactive Subscriptions (Observer Pattern)
  // ==========================================================================

  /**
   * Subscribes a callback to changes for a specific state key.
   *
   * @param {string} key - State property name to watch
   * @param {function(any, any): void} callback - Handler receiving (newValue, oldValue)
   * @returns {function(): void} Unsubscribe function
   */
  subscribe(key, callback) {
    if (typeof callback !== 'function') {
      return () => {};
    }

    if (!this.#subscribers.has(key)) {
      this.#subscribers.set(key, new Set());
    }

    const listeners = this.#subscribers.get(key);
    listeners.add(callback);

    // Return cleanup teardown function
    return () => {
      listeners.delete(callback);
      if (listeners.size === 0) {
        this.#subscribers.delete(key);
      }
    };
  }

  /**
   * Internal dispatcher that invokes all registered listener callbacks for a key.
   *
   * @private
   * @param {string} key - Modified state key
   * @param {any} newValue - New value
   * @param {any} oldValue - Previous value
   */
  #notify(key, newValue, oldValue) {
    const listeners = this.#subscribers.get(key);
    if (!listeners || listeners.size === 0) return;

    for (const callback of listeners) {
      try {
        callback(newValue, oldValue);
      } catch (err) {
        console.error(`[AppState] Error in subscriber for key "${key}":`, err);
      }
    }
  }

  // ==========================================================================
  //  Action History & Undo Stack (Phase 7)
  // ==========================================================================

  /**
   * Pushes an undoable action onto the history stack, maintaining maximum bounding limit.
   *
   * @param {{ type: string, payload: any, description?: string }} action
   * @returns {void}
   */
  pushUndoAction(action) {
    if (!action || !action.type) return;

    this.#undoStack.push({
      ...action,
      description: action.description || action.type,
      timestamp: Date.now()
    });

    // Enforce bounding ceiling
    if (this.#undoStack.length > AppState.MAX_UNDO_STACK_SIZE) {
      this.#undoStack.shift();
    }
  }

  /**
   * Pops and returns the most recent undoable action.
   *
   * @returns {{ type: string, payload: any, description: string, timestamp: number }|null}
   */
  popUndoAction() {
    return this.#undoStack.pop() || null;
  }

  /**
   * Inspects the top undoable action without removing it from the stack.
   *
   * @returns {{ type: string, payload: any, description: string, timestamp: number }|null}
   */
  peekUndoAction() {
    if (this.#undoStack.length === 0) return null;
    return this.#undoStack[this.#undoStack.length - 1];
  }

  /**
   * Clears the in-memory undo stack.
   *
   * @returns {void}
   */
  clearUndoStack() {
    this.#undoStack = [];
  }

  /**
   * Returns current count of queued undoable actions.
   *
   * @returns {number}
   */
  getUndoStackSize() {
    return this.#undoStack.length;
  }
}
