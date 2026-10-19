'use strict';

/**
 * @fileoverview Toast Notification Controller
 *
 * Architecture Position: src/ui/helpers/toast.js
 * Role: Manages non-blocking UI alert cards and action confirmation popups.
 * Dependencies: formatCurrency (formatters.js), window.icon, window.ICON_SVG_MAP
 * Extracted from: src/app.js L3316-3353
 */

import { formatCurrency } from './formatters.js';

let toastActionTimer = null;

// ============================================================================
//  Toast Notification Display
// ============================================================================

/**
 * Displays a detailed action toast card in the bottom corner with optional
 * icon, amount, category, and automatic dismiss timer.
 *
 * @param {Object} [options]
 * @param {string} [options.icon='check'] - Lucide icon name
 * @param {string} [options.title='Action Completed'] - Main title text
 * @param {number|string|null} [options.amount=null] - Optional currency amount to format
 * @param {string|null} [options.category=null] - Category label
 * @param {string|null} [options.subtext=null] - Custom subtitle text
 * @param {number} [options.duration=3500] - Display duration in milliseconds
 * @returns {void}
 */
export function showActionToast({
  icon: iconName = 'check',
  title = 'Action Completed',
  amount = null,
  category = null,
  subtext = null,
  duration = 3500
} = {}) {
  if (typeof document === 'undefined') return;
  const container = document.getElementById('toast-action-container');
  const iconEl = document.getElementById('toast-icon');
  const mainMsgEl = document.getElementById('toast-main-msg');
  const subMsgEl = document.getElementById('toast-sub-msg');

  if (!container) return;

  if (iconEl) {
    const hasIconFn = typeof window !== 'undefined' && typeof window.icon === 'function';
    const hasIconMap = typeof window !== 'undefined' && typeof window.ICON_SVG_MAP !== 'undefined';

    if (hasIconFn && hasIconMap && window.ICON_SVG_MAP[iconName]) {
      iconEl.innerHTML = window.icon(iconName, 18);
    } else if (hasIconFn) {
      iconEl.innerHTML = window.icon('check', 18);
    } else {
      iconEl.textContent = iconName;
    }
  }

  if (mainMsgEl) {
    mainMsgEl.textContent =
      amount !== null && !isNaN(amount) ? `${title} • ${formatCurrency(parseFloat(amount))}` : title;
  }

  if (subMsgEl) {
    subMsgEl.textContent = subtext || `${category || 'Personal'} • Logged successfully`;
  }

  container.classList.remove('hidden');
  clearTimeout(toastActionTimer);

  const toastCard = document.getElementById('toast-card') || container;
  if (toastCard && !toastCard.dataset.dismissBound) {
    toastCard.dataset.dismissBound = 'true';
    toastCard.style.cursor = 'pointer';
    toastCard.addEventListener('click', () => {
      clearTimeout(toastActionTimer);
      container.classList.add('hidden');
    });
  }

  toastActionTimer = setTimeout(() => {
    container.classList.add('hidden');
  }, duration);
}

/**
 * Displays a simple, informative toast notification.
 *
 * @param {string} message - Message to display
 * @returns {void}
 */
export function showToast(message) {
  showActionToast({
    icon: 'check',
    title: message,
    subtext: 'Ledgerly Desktop'
  });
}
