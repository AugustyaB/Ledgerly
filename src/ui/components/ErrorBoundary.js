'use strict';

/**
 * ============================================================================
 * Ledgerly — UI Error Boundary & Graceful Section Fallback Component (Phase 6)
 * ============================================================================
 * 
 * @fileoverview
 * Isolates rendering failures to their local container, rendering a graceful,
 * theme-consistent fallback card with actionable recovery controls (Retry,
 * Reset to Dashboard, Copy Diagnostics). Prevents blank whiteout screens.
 * 
 * Architecture Position: src/ui/components/ErrorBoundary.js
 * Dependencies: src/ui/helpers/dom.js (escapeHTML)
 *               src/ui/helpers/toast.js (showToast)
 */

import { escapeHTML } from '../helpers/dom.js';
import { showToast } from '../helpers/toast.js';

export class ErrorBoundary {
  /**
   * Renders an isolated fallback error card into the target DOM container.
   * 
   * @param {HTMLElement|null} container - Container element to render fallback card inside
   * @param {Object} options
   * @param {Error|string|any} options.error - Caught exception or message
   * @param {string} [options.componentName='Section'] - Friendly name of failing component
   * @param {function(): void} [options.onRetry] - Callback invoked when user clicks "Retry Section"
   * @param {function(): void} [options.onReset] - Callback invoked when user clicks "Return to Dashboard"
   * @returns {void}
   */
  static renderFallbackCard(container, { error, componentName = 'Section', onRetry, onReset } = {}) {
    if (!container) return;

    const errorObj = error instanceof Error ? error : new Error(String(error || 'Unknown runtime error'));
    const timestamp = new Date().toISOString();
    const diagnosticPayload = JSON.stringify({
      component: componentName,
      timestamp,
      version: 'v0.4.6',
      name: errorObj.name || 'Error',
      message: errorObj.message,
      stack: errorObj.stack || '(no stack trace available)'
    }, null, 2);

    const safeTitle = escapeHTML(componentName);
    const safeMsg = escapeHTML(errorObj.message || 'An unexpected rendering error occurred.');
    const safeDetails = escapeHTML(diagnosticPayload);

    container.innerHTML = `
      <div class="error-boundary-card" role="alert" aria-live="assertive">
        <div class="error-boundary-icon">
          <i data-icon="alert-triangle" data-icon-size="28"></i>
        </div>
        <h3 class="error-boundary-title">Something went wrong in this section</h3>
        <p class="error-boundary-subtitle">
          The <strong>${safeTitle}</strong> view encountered an unexpected error while rendering.
          Your financial data remains safe on disk.
        </p>
        <details class="error-boundary-details">
          <summary>View Diagnostic Details</summary>
          <pre>${safeDetails}</pre>
        </details>
        <div class="error-boundary-actions">
          <button type="button" class="btn btn-primary" data-action="retry-section">
            <i data-icon="refresh-cw" data-icon-size="14"></i> Retry Section
          </button>
          <button type="button" class="btn btn-secondary" data-action="goto-dashboard">
            <i data-icon="home" data-icon-size="14"></i> Return to Dashboard
          </button>
          <button type="button" class="btn btn-secondary" data-action="copy-diagnostics">
            <i data-icon="clipboard-list" data-icon-size="14"></i> Copy Diagnostics
          </button>
        </div>
      </div>
    `;

    // Hydrate vector icons if available
    if (typeof window !== 'undefined' && typeof window.hydrateIcons === 'function') {
      window.hydrateIcons();
    }

    // Attach local event listeners directly to avoid inline event handlers
    const retryBtn = typeof container.querySelector === 'function' ? container.querySelector('[data-action="retry-section"]') : null;
    if (retryBtn && typeof onRetry === 'function') {
      retryBtn.addEventListener('click', (e) => {
        e.preventDefault();
        onRetry();
      });
    }

    const resetBtn = typeof container.querySelector === 'function' ? container.querySelector('[data-action="goto-dashboard"]') : null;
    if (resetBtn && typeof onReset === 'function') {
      resetBtn.addEventListener('click', (e) => {
        e.preventDefault();
        onReset();
      });
    }

    const copyBtn = typeof container.querySelector === 'function' ? container.querySelector('[data-action="copy-diagnostics"]') : null;
    if (copyBtn) {
      copyBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        try {
          if (navigator?.clipboard?.writeText) {
            await navigator.clipboard.writeText(diagnosticPayload);
            showToast('Diagnostic information copied to clipboard', 'info');
          } else {
            showToast(safeMsg, 'error');
          }
        } catch {
          showToast('Failed to copy to clipboard', 'error');
        }
      });
    }
  }

  /**
   * Safely wraps a view rendering execution block inside an error boundary.
   * If an exception occurs, catches it, displays the fallback card, and reports telemetry.
   * 
   * @param {HTMLElement|null} container - Target DOM container
   * @param {function(): any} renderFn - Rendering function to execute safely
   * @param {Object} [contextInfo={}] - Supplementary context (componentName, tabName)
   * @param {Object} [fallbackOpts={}] - Action hooks (onRetry, onReset)
   * @returns {boolean|Promise<boolean>} True if rendered successfully, false if caught
   */
  static wrapRender(container, renderFn, contextInfo = {}, fallbackOpts = {}) {
    const componentName = contextInfo.componentName || 'Section';

    try {
      const result = renderFn();

      // Handle async render returns
      if (result && typeof result.then === 'function') {
        return result
          .then(() => true)
          .catch((asyncErr) => {
            console.error(`[ErrorBoundary] Async render error in "${componentName}":`, asyncErr);
            ErrorBoundary._handleRenderFailure(container, asyncErr, componentName, renderFn, contextInfo, fallbackOpts);
            return false;
          });
      }

      return true;
    } catch (syncErr) {
      console.error(`[ErrorBoundary] Sync render error in "${componentName}":`, syncErr);
      ErrorBoundary._handleRenderFailure(container, syncErr, componentName, renderFn, contextInfo, fallbackOpts);
      return false;
    }
  }

  /**
   * Internal handler for rendering failures.
   * @private
   */
  static _handleRenderFailure(container, error, componentName, renderFn, contextInfo, fallbackOpts) {
    // 1. Render Fallback Card
    ErrorBoundary.renderFallbackCard(container, {
      error,
      componentName,
      onRetry: () => {
        if (typeof fallbackOpts.onRetry === 'function') {
          fallbackOpts.onRetry();
        } else {
          ErrorBoundary.wrapRender(container, renderFn, contextInfo, fallbackOpts);
        }
      },
      onReset: fallbackOpts.onReset
    });

    // 2. Dispatch telemetry to main process crash logger if bridge exists
    if (typeof window !== 'undefined' && window.electronAPI?.reportRendererError) {
      try {
        window.electronAPI.reportRendererError({
          type: 'UI_ERROR_BOUNDARY',
          component: componentName,
          tab: contextInfo.tabName || 'unknown',
          message: error?.message || String(error),
          stack: error?.stack || ''
        }).catch(() => {});
      } catch {
        // Prevent telemetry delivery recursion
      }
    }
  }
}
