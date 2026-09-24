/**
 * ============================================================================
 * Ledgerly Mobile — Settings & Currency Preferences
 * ============================================================================
 *
 * @fileoverview
 * Lightweight local storage manager for mobile client preferences, including
 * dynamic currency symbol, device node identifier, and paired desktop metadata.
 */

'use strict';

import { DEFAULTS } from '../shared/validator.js';

const SETTINGS_KEY = 'ledgerly_mobile_settings';

/**
 * Default mobile client configuration.
 */
const DEFAULT_SETTINGS = {
  currencySymbol: (DEFAULTS && DEFAULTS.CURRENCY_SYMBOL) || '₹',
  currencyCode: 'INR',
  deviceNodeId: null,
  pairedHost: '',
  theme: 'theme-3-graphite'
};

class MobileSettingsManager {
  constructor() {
    this.settings = this.load();
    if (!this.settings.deviceNodeId) {
      this.settings.deviceNodeId = this.generateNodeId();
      this.save(this.settings);
    }
  }

  /**
   * Loads settings from localStorage with fallback defaults.
   * @returns {Object}
   */
  load() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return { ...DEFAULT_SETTINGS, ...parsed };
      }
    } catch {
      // Fallback on JSON parse error or disabled localStorage
    }
    return { ...DEFAULT_SETTINGS };
  }

  /**
   * Saves settings to localStorage and dispatches change event.
   * @param {Object} updated
   */
  save(updated) {
    this.settings = { ...this.settings, ...updated };
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
      window.dispatchEvent(new CustomEvent('ledgerly:settings-updated', { detail: this.settings }));
    } catch {
      // Ignore write errors in restricted contexts
    }
  }

  /**
   * Generates a unique, URL-safe device node ID.
   * @returns {string}
   */
  generateNodeId() {
    const rand = Math.random().toString(36).slice(2, 10);
    return `mobile-node-${Date.now().toString(36)}-${rand}`;
  }

  /**
   * Returns the active currency symbol (e.g. '₹', '$', '€').
   * @returns {string}
   */
  getCurrencySymbol() {
    return this.settings.currencySymbol || '₹';
  }

  /**
   * Sets a new currency symbol.
   * @param {string} symbol
   */
  setCurrencySymbol(symbol) {
    if (typeof symbol === 'string' && symbol.trim()) {
      this.save({ currencySymbol: symbol.trim() });
    }
  }

  /**
   * Returns the device node ID.
   * @returns {string}
   */
  getNodeId() {
    return this.settings.deviceNodeId;
  }

  /**
   * Formats a numeric amount with the active currency symbol.
   * @param {number|string} amount
   * @param {boolean} [showSymbol=true]
   * @returns {string}
   */
  formatCurrency(amount, showSymbol = true) {
    const num = Number(amount) || 0;
    const formatted = num.toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
    return showSymbol ? `${this.getCurrencySymbol()}${formatted}` : formatted;
  }
}

export const mobileSettings = new MobileSettingsManager();
export default mobileSettings;
