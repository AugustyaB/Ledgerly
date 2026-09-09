'use strict';

/**
 * @fileoverview Application Tab Navigation & View Lifecycle Router
 *
 * Architecture Position: src/ui/AppRouter.js
 * Role: Coordinates active workspace tabs, updates page titles/subtitles,
 *       handles view mount/render/unmount lifecycles, and executes data refreshes.
 * Extracted from: src/app.js L2164-2235 (switchTab & updateSidebarNavIcons)
 */


import { ErrorBoundary } from './components/ErrorBoundary.js';

// ============================================================================
//  Tab Configuration Metadata
// ============================================================================

const TAB_METADATA = Object.freeze({
  dashboard: {
    containerId: 'view-dashboard',
    title: 'Financial Dashboard',
    subtitle: 'Track, categorize, and control your desktop expense records'
  },
  household: {
    containerId: 'view-household',
    title: 'Household Shared Balances & Settlements',
    subtitle: 'Track multi-party split expenses, recurring utility bills, and pairwise debts'
  },
  batch: {
    containerId: 'view-batch',
    title: 'Batch Entry Spreadsheet',
    subtitle: 'Rapid multi-row keyboard transaction entry'
  },
  expenses: {
    containerId: 'view-expenses',
    title: 'Expense Feed & Transaction Explorer',
    subtitle: 'Search, filter, sort, and manage all your stored financial records'
  },
  notes: {
    containerId: 'view-notes',
    title: 'Contextual Financial Notes',
    subtitle: 'Memos, reflections, and insights linked to transactions, days, weeks, or months'
  },
  settings: {
    containerId: 'view-settings',
    title: 'General Settings & Preferences',
    subtitle: 'Configure salary cycles, currency, payday buffers, and data management'
  }
});


// ============================================================================
//  AppRouter Class
// ============================================================================

export class AppRouter {

  /** @type {import('./AppState.js').AppState} */
  #state;

  /**
   * Map of tab names to view instances.
   * @type {Map<string, any>}
   */
  #views = new Map();

  /** @type {string} */
  #currentTab = 'dashboard';

  /** @type {any|null} */
  #activeView = null;


  // ==========================================================================
  //  Constructor
  // ==========================================================================

  /**
   * @param {import('./AppState.js').AppState} state - Application state store
   * @param {Record<string, any>} [views={}] - Initial view registrations
   */
  constructor(state, views = {}) {
    this.#state = state;

    for (const [tabName, viewInstance] of Object.entries(views)) {
      this.register(tabName, viewInstance);
    }
  }


  // ==========================================================================
  //  View Registration & Dynamic Extensibility
  // ==========================================================================

  /**
   * Registers a view component for a specific tab identifier.
   *
   * @param {string} tabName - Unique tab identifier
   * @param {any} viewInstance - View instance implementing mount/render/unmount
   * @returns {void}
   */
  register(tabName, viewInstance) {
    this.#views.set(tabName, viewInstance);
  }


  /**
   * Retrieves the view instance registered for a given tab.
   *
   * @param {string} tabName - Tab identifier
   * @returns {any|undefined} View instance
   */
  getView(tabName) {
    return this.#views.get(tabName);
  }


  /**
   * Returns the currently active tab identifier.
   *
   * @returns {string} Active tab name
   */
  getCurrentTab() {
    return this.#currentTab;
  }


  /**
   * Returns the currently active view instance.
   *
   * @returns {any|null}
   */
  getActiveView() {
    return this.#activeView;
  }


  // ==========================================================================
  //  Tab Switching & Lifecycle Management
  // ==========================================================================

  /**
   * Transitions the application to a new workspace tab.
   *
   * @param {string} tabName - Target tab name ('dashboard' | 'household' | 'batch' | etc.)
   * @param {function(): void} [legacyFallback] - Fallback callback if view not yet extracted
   * @returns {void}
   */
  switchTo(tabName, legacyFallback) {
    const targetMeta = TAB_METADATA[tabName] || TAB_METADATA.dashboard;

    this.#currentTab = tabName;
    this.#state.set('currentTab', tabName);

    // Update navigation item active state in sidebar
    if (typeof document !== 'undefined') {
      document.querySelectorAll('.nav-item').forEach(item => {
        const matches = item.getAttribute('data-tab') === tabName;
        item.classList.toggle('active', matches);
      });

      // Hide all tab view containers
      for (const meta of Object.values(TAB_METADATA)) {
        const el = document.getElementById(meta.containerId);
        if (el) el.classList.add('hidden');
      }

      // Reveal the target tab view container
      const targetContainer = document.getElementById(targetMeta.containerId);
      if (targetContainer) {
        targetContainer.classList.remove('hidden');
      }

      // Update header title & subtitle
      const titleEl = document.getElementById('page-title');
      const subtitleEl = document.getElementById('page-subtitle');
      if (titleEl) titleEl.textContent = targetMeta.title;
      if (subtitleEl) subtitleEl.textContent = targetMeta.subtitle;

      // Update sidebar navigation morphing icons
      this.#updateSidebarNavIcons(tabName);
    }

    // Render the target view instance inside Error Boundary
    const targetView = this.#views.get(tabName);
    this.#activeView = targetView || null;
    const targetContainer = typeof document !== 'undefined' ? document.getElementById(targetMeta.containerId) : null;

    const renderAction = () => {
      if (targetView && typeof targetView.render === 'function') {
        targetView.render();
      } else if (targetView && typeof targetView.mount === 'function') {
        targetView.mount(targetContainer);
      } else if (typeof legacyFallback === 'function') {
        legacyFallback();
      }
    };

    ErrorBoundary.wrapRender(targetContainer, renderAction, {
      componentName: targetMeta.title || tabName,
      tabName
    }, {
      onRetry: () => this.switchTo(tabName, legacyFallback),
      onReset: () => this.switchTo('dashboard')
    });

    // Refresh Feather/Lucide SVG icons in DOM
    if (typeof window !== 'undefined' && typeof window.hydrateIcons === 'function') {
      window.hydrateIcons();
    }
  }


  // ==========================================================================
  //  Data Refresh & Error Recovery
  // ==========================================================================

  /**
   * Refreshes the currently active view when backend signals data changes,
   * isolating any unexpected rendering failures with the Error Boundary.
   *
   * @param {function(): void} [legacyFallback] - Fallback if current view is not an extracted component
   * @returns {void}
   */
  refreshCurrentView(legacyFallback) {
    const targetMeta = TAB_METADATA[this.#currentTab] || TAB_METADATA.dashboard;
    const targetContainer = typeof document !== 'undefined' ? document.getElementById(targetMeta.containerId) : null;

    const refreshAction = () => {
      if (this.#activeView && typeof this.#activeView.render === 'function') {
        this.#activeView.render();
      } else if (typeof legacyFallback === 'function') {
        legacyFallback();
      }
    };

    ErrorBoundary.wrapRender(targetContainer, refreshAction, {
      componentName: targetMeta.title || this.#currentTab,
      tabName: this.#currentTab
    }, {
      onRetry: () => this.refreshCurrentView(legacyFallback),
      onReset: () => this.switchTo('dashboard')
    });

    if (typeof window !== 'undefined' && typeof window.hydrateIcons === 'function') {
      window.hydrateIcons();
    }
  }

  /**
   * Recovers application to a safe default tab (dashboard) when recovering from errors.
   * @param {string} [tabName='dashboard'] - Target recovery tab
   * @returns {void}
   */
  recoverToTab(tabName = 'dashboard') {
    this.switchTo(tabName);
  }


  // ==========================================================================
  //  Private Helpers
  // ==========================================================================

  /**
   * Dynamic navigation icon state morphing based on active tab.
   *
   * @private
   * @param {string} activeTab
   */
  #updateSidebarNavIcons(activeTab) {
    if (typeof window === 'undefined' || typeof window.icon !== 'function') return;

    const dashIcon = document.getElementById('nav-icon-dashboard');
    const expenseIcon = document.getElementById('nav-icon-expenses');

    if (dashIcon) {
      dashIcon.innerHTML = activeTab === 'dashboard'
        ? window.icon('bar-chart-declining', 20)
        : window.icon('bar-chart-2', 20);
    }

    if (expenseIcon) {
      expenseIcon.innerHTML = activeTab === 'expenses'
        ? window.icon('receipt', 20)
        : window.icon('banknote', 20);
    }
  }

  /**
   * Teardown method for the router, unmounting all views.
   */
  unmount() {
    for (const view of this.#views.values()) {
      if (view && typeof view.unmount === 'function') {
        try {
          view.unmount();
        } catch (err) {
          console.warn('[AppRouter] Cleanup error during unmount:', err);
        }
      }
    }
    this.#activeView = null;
  }
}
