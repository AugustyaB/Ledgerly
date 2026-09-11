'use strict';

/**
 * @fileoverview DOM Manipulation & Event Delegation Utilities
 *
 * Architecture Position: src/ui/helpers/dom.js
 * Role: Provides safe HTML escaping, centralized event delegation,
 *       and innerHTML replacement with automatic icon re-hydration.
 * Dependencies: window.hydrateIcons (from icons.js)
 */

// ============================================================================
//  HTML Sanitization
// ============================================================================

/**
 * Escapes characters with HTML entities to protect against Cross-Site Scripting (XSS).
 * Escapes &, <, >, ", and ' (single quote defense from Phase 1 security audit).
 *
 * @param {string|number|null|undefined} str - Raw input string or value
 * @returns {string} Sanitized string safe for HTML interpolation
 */
export function escapeHTML(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ============================================================================
//  Event Delegation
// ============================================================================

/**
 * Attaches a single delegated click listener to a container element.
 * Elements declare their actions via data-action="actionName" and pass parameters
 * via data-* attributes.
 *
 * @param {HTMLElement|null} container - Parent element to attach listener to
 * @param {Record<string, function(HTMLElement, Event): void>} handlers - Map of action names to handlers
 * @param {string} [actionAttribute='data-action'] - The attribute name specifying the action
 * @returns {function(): void} Cleanup function that unregisters the listener
 */
export function delegateEvent(container, handlers, actionAttribute = 'data-action') {
  if (!container) {
    return () => {};
  }

  const listener = event => {
    // Find closest element with the action attribute up to container
    const target = event.target.closest(`[${actionAttribute}]`);
    if (!target || !container.contains(target)) {
      return;
    }

    const action = target.getAttribute(actionAttribute);
    if (action && typeof handlers[action] === 'function') {
      handlers[action](target, event);
    }
  };

  container.addEventListener('click', listener);

  // Return teardown function for unmount cleanup
  return () => {
    container.removeEventListener('click', listener);
  };
}

// ============================================================================
//  DOM Insertion with Icon Hydration
// ============================================================================

/**
 * Safely replaces the innerHTML of a container and re-hydrates any
 * data-icon placeholders using the global icon helper.
 *
 * @param {HTMLElement|null} element - The target container element
 * @param {string} html - HTML string to insert
 * @returns {void}
 */
export function setInnerHTML(element, html) {
  if (!element) return;
  element.innerHTML = html;

  if (typeof window.hydrateIcons === 'function') {
    window.hydrateIcons(element);
  } else if (typeof hydrateIcons === 'function') {
    hydrateIcons(element);
  }
}
