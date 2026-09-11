'use strict';

/**
 * @fileoverview Notification Center & Alert View Controller
 *
 * Architecture Position: src/ui/views/NotificationView.js
 * Role: Manages the in-app notification dropdown, bell badge indicators,
 *       alert filtering, 1-click contextual action routing, and dismissals.
 * Dependencies: window.electronAPI, dom helpers, toast
 * Extracted from: src/app.js L3811-4058
 *
 * FUTURE: Native OS notification push sync, snooze reminders, sound alerts
 */

import { escapeHTML, delegateEvent, setInnerHTML } from '../helpers/dom.js';
import { showToast } from '../helpers/toast.js';

// ============================================================================
//  NotificationView Class
// ============================================================================

export class NotificationView {
  /** @type {any} */
  #api;

  /** @type {function(string): void} */
  #tabSwitcher;

  /** @type {string} */
  #activeFilter = 'all';

  /** @type {Array<any>} */
  #cachedNotifications = [];

  /** @type {number|null} */
  #pollIntervalId = null;

  /** @type {function(): void} */
  #cleanupListEvents = () => {};

  /** @type {function(): void} */
  #cleanupDocEvents = () => {};

  // ==========================================================================
  //  Constructor
  // ==========================================================================

  /**
   * @param {any} [api] - IPC bridge (defaults to window.electronAPI)
   * @param {function(string): void} [tabSwitcher] - Callback to transition tabs
   */
  constructor(api = window.electronAPI, tabSwitcher = () => {}) {
    this.#api = api;
    this.#tabSwitcher = tabSwitcher;
  }

  // ==========================================================================
  //  Lifecycle Interface (ViewContract)
  // ==========================================================================

  /**
   * Mounts the notification center, binds dropdown controls and filter chips,
   * and begins background alert polling.
   *
   * @param {HTMLElement|null} [container]
   * @returns {void}
   */
  mount(container) {
    this.#bindDropdownControls();
    this.#bindFilterChips();
    this.#bindHeaderActions();
    this.render();

    // Start 15-minute background evaluation interval
    if (typeof setInterval !== 'undefined') {
      this.#pollIntervalId = setInterval(
        async () => {
          await this.render();
        },
        15 * 60 * 1000
      );
    }
  }

  /**
   * Evaluates fresh alerts from the backend and updates the bell badge
   * and notification list DOM.
   *
   * @returns {Promise<void>}
   */
  async render() {
    if (!this.#api?.getNotifications) return;

    // 1. Fetch latest alerts from backend
    let notifications;
    try {
      if (typeof this.#api.evaluateNotifications === 'function') {
        const res = await this.#api.evaluateNotifications();
        notifications = Array.isArray(res) ? res : res?.notifications || (await this.#api.getNotifications()) || [];
      } else {
        notifications = (await this.#api.getNotifications()) || [];
      }
    } catch {
      try {
        notifications = (await this.#api.getNotifications()) || [];
      } catch {
        notifications = [];
      }
    }

    this.#cachedNotifications = notifications;

    if (typeof document === 'undefined') return;

    // 2. Update Bell Badge Indicator & Pulse
    this.#updateBellBadge(notifications);

    // 3. Render List according to active filter
    this.#renderList(notifications);
  }

  /**
   * Unmounts the notification center, clearing background timers and event listeners.
   *
   * @returns {void}
   */
  unmount() {
    if (this.#pollIntervalId) {
      clearInterval(this.#pollIntervalId);
      this.#pollIntervalId = null;
    }

    this.#cleanupListEvents();
    this.#cleanupDocEvents();
  }

  // ==========================================================================
  //  Dropdown Visibility Toggles
  // ==========================================================================

  /**
   * Toggles the open/closed state of the notification dropdown.
   *
   * @returns {Promise<void>}
   */
  async toggleDropdown() {
    if (typeof document === 'undefined') return;
    const dropdown = document.getElementById('notification-dropdown');
    if (!dropdown) return;

    const isHidden = dropdown.classList.contains('hidden');
    if (isHidden) {
      dropdown.classList.remove('hidden');
      await this.render();
    } else {
      dropdown.classList.add('hidden');
    }
  }

  /**
   * Closes the notification dropdown panel.
   *
   * @returns {void}
   */
  closeDropdown() {
    if (typeof document === 'undefined') return;
    const dropdown = document.getElementById('notification-dropdown');
    if (dropdown) {
      dropdown.classList.add('hidden');
    }
  }

  // ==========================================================================
  //  Action Routing & Handlers
  // ==========================================================================

  /**
   * Handles 1-click action navigation for a notification card.
   *
   * @param {string} notifId - Target notification unique ID
   * @returns {Promise<void>}
   */
  async handleAction(notifId) {
    const notif = this.#cachedNotifications.find(n => n.id === notifId);
    if (!notif) return;

    if (!notif.read && this.#api?.markNotificationRead) {
      await this.#api.markNotificationRead(notif.id);
    }

    this.closeDropdown();

    const tab = notif.actionTab;
    if (tab === 'household') {
      this.#tabSwitcher('household');
    } else if (tab === 'express') {
      this.#tabSwitcher('dashboard');
      const nlpInput = document.getElementById('express-nlp-input');
      if (nlpInput) {
        nlpInput.focus();
        nlpInput.classList.remove('express-success-pulse');
        void nlpInput.offsetWidth;
        nlpInput.classList.add('express-success-pulse');
      }
    } else if (tab === 'dashboard') {
      this.#tabSwitcher('dashboard');
      if (notif.title?.includes('High-Impact') || notif.type === 'budget') {
        const whatIfCard = document.getElementById('what-if-simulator-card');
        if (whatIfCard && whatIfCard.classList.contains('collapsed')) {
          whatIfCard.classList.remove('collapsed');
          document.getElementById('what-if-toggle-bar')?.classList.add('expanded');
        }
      }
    } else if (tab === 'settings') {
      this.#tabSwitcher('settings');
      const salaryPane = document.getElementById('settings-salary-pane');
      salaryPane?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    await this.render();
  }

  /**
   * Marks a single notification as read.
   *
   * @param {string} id - Notification unique ID
   * @returns {Promise<void>}
   */
  async markAsRead(id) {
    if (this.#api?.markNotificationRead) {
      await this.#api.markNotificationRead(id);
      await this.render();
    }
  }

  /**
   * Deletes / dismisses a single notification.
   *
   * @param {string} id - Notification unique ID
   * @returns {Promise<void>}
   */
  async dismiss(id) {
    if (this.#api?.deleteNotification) {
      await this.#api.deleteNotification(id);
      await this.render();
    }
  }

  /**
   * Marks all notifications as read.
   *
   * @returns {Promise<void>}
   */
  async markAllRead() {
    if (this.#api?.markAllNotificationsRead) {
      await this.#api.markAllNotificationsRead();
      await this.render();
      showToast('All notifications marked as read');
    }
  }

  /**
   * Clears all notifications.
   *
   * @returns {Promise<void>}
   */
  async clearAll() {
    if (this.#api?.clearAllNotifications) {
      await this.#api.clearAllNotifications();
      await this.render();
      showToast('All notifications cleared');
    }
  }

  // ==========================================================================
  //  Private Rendering & Event Helpers
  // ==========================================================================

  /**
   * Updates bell badge counter and pulsing effect.
   *
   * @private
   * @param {Array<any>} notifications
   */
  #updateBellBadge(notifications) {
    const unreadCount = notifications.filter(n => !n.read).length;
    const badgeEl = document.getElementById('bell-badge-count');
    if (!badgeEl) return;

    if (unreadCount > 0) {
      badgeEl.textContent = unreadCount > 99 ? '99+' : String(unreadCount);
      badgeEl.classList.remove('hidden');
      badgeEl.classList.add('pulse');
    } else {
      badgeEl.textContent = '0';
      badgeEl.classList.add('hidden');
      badgeEl.classList.remove('pulse');
    }
  }

  /**
   * Renders the notification cards in the dropdown list.
   *
   * @private
   * @param {Array<any>} notifications
   */
  #renderList(notifications) {
    const listEl = document.getElementById('notification-list');
    if (!listEl) return;

    let filtered = notifications;
    if (this.#activeFilter === 'unread') {
      filtered = notifications.filter(n => !n.read);
    } else if (this.#activeFilter === 'budget') {
      filtered = notifications.filter(n => n.type === 'budget');
    } else if (this.#activeFilter === 'bill') {
      filtered = notifications.filter(n => n.type === 'bill');
    } else if (this.#activeFilter === 'payday') {
      filtered = notifications.filter(n => n.type === 'payday');
    } else if (this.#activeFilter === 'reminder') {
      filtered = notifications.filter(n => n.type === 'reminder' || n.type === 'household');
    }

    if (filtered.length === 0) {
      setInnerHTML(
        listEl,
        `
        <div class="notif-empty-state">
          <i data-icon="bell-off" data-icon-size="28"></i>
          <div style="font-weight: 700; font-size: 13px; color: var(--text-main); margin-bottom: 2px;">All Caught Up</div>
          <div style="font-size: 11.5px; color: var(--text-muted);">No notifications in this view.</div>
        </div>
      `
      );
      return;
    }

    const formatTimeAgo = dateStr => {
      if (!dateStr) return 'Just now';
      const diffMs = Date.now() - new Date(dateStr).getTime();
      const diffSec = Math.floor(diffMs / 1000);
      if (diffSec < 60) return 'Just now';
      const diffMin = Math.floor(diffSec / 60);
      if (diffMin < 60) return `${diffMin}m ago`;
      const diffHr = Math.floor(diffMin / 60);
      if (diffHr < 24) return `${diffHr}h ago`;
      const diffDay = Math.floor(diffHr / 24);
      if (diffDay < 7) return `${diffDay}d ago`;
      return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    };

    const getActionBtnText = tab => {
      if (tab === 'household') return 'Settle Bill';
      if (tab === 'express') return 'Quick Log';
      if (tab === 'dashboard') return 'View Budget';
      if (tab === 'settings') return 'View Settings';
      return 'View';
    };

    const html = filtered
      .map(
        n => `
      <div class="notification-item ${n.read ? '' : 'unread'} notif-type-${escapeHTML(n.type || 'system')}" data-notif-id="${escapeHTML(n.id)}">
        <div class="notification-icon">
          <i data-icon="${escapeHTML(n.icon || 'bell')}" data-icon-size="16"></i>
        </div>
        <div class="notification-item-content">
          <div class="notification-title">${escapeHTML(n.title)}</div>
          <div style="font-size: 11.5px; color: var(--text-muted); line-height: 1.4; margin-top: 2px;">
            ${escapeHTML(n.message)}
          </div>
          <div class="notification-meta-row">
            <span class="notif-time-ago">${formatTimeAgo(n.createdAt)}</span>
            ${
              n.actionTab
                ? `
              <button type="button" class="btn-notif-action" data-action="notif-action" data-notif-id="${escapeHTML(n.id)}">
                ${getActionBtnText(n.actionTab)} <i data-icon="arrow-right" data-icon-size="10"></i>
              </button>
            `
                : ''
            }
          </div>
        </div>
        <div class="notification-item-actions">
          ${
            !n.read
              ? `
            <button type="button" class="btn-text-ghost" data-action="mark-read" data-notif-id="${escapeHTML(n.id)}" title="Mark as read">
              <i data-icon="check" data-icon-size="12"></i>
            </button>
          `
              : ''
          }
          <button type="button" class="btn-text-ghost" data-action="dismiss" data-notif-id="${escapeHTML(n.id)}" title="Dismiss">
            <i data-icon="x" data-icon-size="12"></i>
          </button>
        </div>
      </div>
    `
      )
      .join('');

    setInnerHTML(listEl, html);

    // Re-bind delegated actions on the list container
    this.#cleanupListEvents();
    this.#cleanupListEvents = delegateEvent(listEl, {
      'notif-action': target => {
        const id = target.getAttribute('data-notif-id');
        if (id) this.handleAction(id);
      },
      'mark-read': target => {
        const id = target.getAttribute('data-notif-id');
        if (id) this.markAsRead(id);
      },
      dismiss: target => {
        const id = target.getAttribute('data-notif-id');
        if (id) this.dismiss(id);
      }
    });
  }

  #bindDropdownControls() {
    const bellBtn = document.getElementById('btn-open-notifications');
    const dropdown = document.getElementById('notification-dropdown');

    bellBtn?.addEventListener('click', async e => {
      e.stopPropagation();
      await this.toggleDropdown();
    });

    const outsideClickListener = e => {
      if (dropdown && !dropdown.classList.contains('hidden')) {
        if (!dropdown.contains(e.target) && !bellBtn?.contains(e.target)) {
          dropdown.classList.add('hidden');
        }
      }
    };

    const keydownListener = e => {
      if (e.key === 'Escape' && dropdown && !dropdown.classList.contains('hidden')) {
        dropdown.classList.add('hidden');
      }
    };

    document.addEventListener('click', outsideClickListener);
    document.addEventListener('keydown', keydownListener);

    this.#cleanupDocEvents = () => {
      document.removeEventListener('click', outsideClickListener);
      document.removeEventListener('keydown', keydownListener);
    };
  }

  #bindFilterChips() {
    document.querySelectorAll('.notif-filter-chip').forEach(chip => {
      chip.addEventListener('click', async () => {
        document.querySelectorAll('.notif-filter-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        this.#activeFilter = chip.getAttribute('data-notif-filter') || 'all';
        await this.render();
      });
    });
  }

  #bindHeaderActions() {
    document.getElementById('btn-mark-all-notifications-read')?.addEventListener('click', async e => {
      e.stopPropagation();
      await this.markAllRead();
    });

    document.getElementById('btn-clear-all-notifications')?.addEventListener('click', async e => {
      e.stopPropagation();
      await this.clearAll();
    });

    // Native notification click routing from main process
    this.#api?.onNavigateToTab?.(tab => {
      if (tab) {
        this.#tabSwitcher(tab);
      }
    });
  }
}
