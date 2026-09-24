'use strict';

import { indexedDbQueue } from './storage/indexedDbQueue.js';

/**
 * @fileoverview Ledgerly Mobile — Tab View Router & Navigation Orchestrator
 */
export class MobileRouter {
  /**
   * @param {Object} options
   * @param {HTMLElement} options.viewportEl
   * @param {HTMLElement} options.dockEl
   * @param {Object.<string, Object>} options.views
   */
  constructor({ viewportEl, dockEl, views }) {
    this.viewportEl = viewportEl;
    this.dockEl = dockEl;
    this.views = views;
    this.activeTab = 'capture';
    this.mountedPanes = {};

    this.init();
  }

  init() {
    this.setupViewPanes();
    this.bindDockEvents();
    this.bindGlobalEvents();
    this.updateQueueBadge();
    this.switchTo('capture');
  }

  setupViewPanes() {
    Object.keys(this.views).forEach(tabId => {
      const pane = document.createElement('div');
      pane.id = `view-${tabId}`;
      pane.className = 'view-pane';
      this.viewportEl.appendChild(pane);
      this.mountedPanes[tabId] = pane;

      // Mount the view instance
      const viewInstance = this.views[tabId];
      if (viewInstance && typeof viewInstance.mount === 'function') {
        viewInstance.mount(pane);
      }
    });
  }

  bindDockEvents() {
    const dockItems = this.dockEl.querySelectorAll('.dock-item');
    dockItems.forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const tab = item.getAttribute('data-tab');
        if (tab && tab !== this.activeTab) {
          if (navigator.vibrate) navigator.vibrate(12);
          this.switchTo(tab);
        }
      });
    });
  }

  bindGlobalEvents() {
    window.addEventListener('ledgerly:switch-tab', (e) => {
      if (e.detail && e.detail.tab) {
        this.switchTo(e.detail.tab);
      }
    });

    window.addEventListener('ledgerly:queue-updated', () => {
      this.updateQueueBadge();
    });
  }

  async updateQueueBadge() {
    const badge = document.getElementById('dock-queue-badge');
    if (!badge) return;

    try {
      const count = await indexedDbQueue.getTotalPendingCount();
      if (count > 0) {
        badge.textContent = count > 99 ? '99+' : String(count);
        badge.style.display = 'flex';
      } else {
        badge.style.display = 'none';
      }
    } catch {
      badge.style.display = 'none';
    }
  }

  switchTo(tabId) {
    if (!this.views[tabId]) return;

    // Update Dock Items
    const dockItems = this.dockEl.querySelectorAll('.dock-item');
    dockItems.forEach(item => {
      const isMatch = item.getAttribute('data-tab') === tabId;
      item.classList.toggle('active', isMatch);
      item.setAttribute('aria-selected', isMatch ? 'true' : 'false');
    });

    // Update View Panes
    Object.keys(this.mountedPanes).forEach(id => {
      const pane = this.mountedPanes[id];
      if (id === tabId) {
        pane.classList.add('active');
      } else {
        pane.classList.remove('active');
      }
    });

    this.activeTab = tabId;

    // Scroll viewport to top on tab switch
    this.viewportEl.scrollTop = 0;
  }
}
