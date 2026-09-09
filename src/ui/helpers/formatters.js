'use strict';

/**
 * @fileoverview Formatting & Localization Utilities
 *
 * Architecture Position: src/ui/helpers/formatters.js
 * Role: Provides numeric, currency, and date formatting with support
 *       for configurable currency symbols and locale grouping.
 * Extracted from: src/app.js L44-60
 */


// ============================================================================
//  Currency Formatting
// ============================================================================

/**
 * Returns the currently active currency symbol.
 * Falls back to Indian Rupee (₹) if not explicitly configured.
 *
 * @param {import('../../types.js').SalaryConfig} [salaryConfig] - Optional salary configuration
 * @returns {string} Currency symbol (e.g. '₹', '$', '€')
 */
export function currSym(salaryConfig) {
  if (salaryConfig && salaryConfig.currencySymbol) {
    return salaryConfig.currencySymbol;
  }
  if (typeof window !== 'undefined' && window.appState?.salaryConfig?.currencySymbol) {
    return window.appState.salaryConfig.currencySymbol;
  }
  // FUTURE: Multi-currency wallet profile support
  return '₹';
}


/**
 * Formats a numeric value into a localized currency string.
 *
 * @param {number|string|null|undefined} amount - Numerical amount to format
 * @param {number} [decimals=2] - Number of fraction digits
 * @param {import('../../types.js').SalaryConfig} [salaryConfig] - Optional salary configuration
 * @returns {string} Formatted currency string (e.g. "₹1,250.00")
 */
export function formatCurrency(amount, decimals = 2, salaryConfig) {
  const num = Number(amount) || 0;
  const symbol = currSym(salaryConfig);
  const formattedNumber = num.toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });

  return `${symbol}${formattedNumber}`;
}


/**
 * Formats a numeric value into an integer currency string with no decimals.
 *
 * @param {number|string|null|undefined} amount - Numerical amount to format
 * @param {import('../../types.js').SalaryConfig} [salaryConfig] - Optional salary configuration
 * @returns {string} Formatted currency string (e.g. "₹1,250")
 */
export function formatCurrencyInt(amount, salaryConfig) {
  return formatCurrency(amount, 0, salaryConfig);
}


// ============================================================================
//  Date Formatting
// ============================================================================

/**
 * Formats an ISO date string into a user-friendly readable date.
 *
 * @param {string|Date|null|undefined} dateValue - Date input
 * @param {Intl.DateTimeFormatOptions} [options] - Intl formatting options
 * @returns {string} Formatted date string
 */
export function formatDate(dateValue, options = { month: 'short', day: 'numeric', year: 'numeric' }) {
  if (!dateValue) return '';
  const dateObj = typeof dateValue === 'string' ? new Date(dateValue) : dateValue;
  if (isNaN(dateObj.getTime())) return '';
  return dateObj.toLocaleDateString('en-IN', options);
}
