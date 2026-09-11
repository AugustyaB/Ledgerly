/**
 * ============================================================================
 * Ledgerly — IPC Boundary Guard & Contract Middleware (Phase 5)
 * ============================================================================
 *
 * @fileoverview
 * Middleware for Electron `ipcMain.handle` channels. Enforces runtime schema
 * validation on inbound payloads before they reach business logic, intercepts
 * unexpected exceptions, and standardizes all wire responses into uniform
 * `{ success, data, error, code, details }` envelopes.
 *
 * DESIGN PRINCIPLES:
 * - Boundary Defense: Raw, malicious, or malformed data is stopped at the IPC border.
 * - Fault Tolerance: Uncaught exceptions inside domain logic are caught cleanly,
 *   preventing renderer promise hangs or main process crashes.
 * - Backward Compatibility: Standardized envelopes preserve existing properties
 *   at top level while providing strongly-typed metadata.
 */

'use strict';

const { ErrorCode } = require('../constants');
const { formatSuccess, formatError } = require('./schemaValidator');

/**
 * Wraps an IPC handler function with schema validation and standardized error catching.
 *
 * @param {string} channel - The IPC channel identifier (e.g. 'add-expense').
 * @param {((...args: any[]) => import('../types').ValidationResult) | null} validatorFn - Optional validator.
 * @param {(event: Electron.IpcMainInvokeEvent, ...args: any[]) => Promise<any> | any} handlerFn - Actual domain handler.
 * @returns {(event: Electron.IpcMainInvokeEvent, ...args: any[]) => Promise<any>}
 */
function wrapIPC(channel, validatorFn, handlerFn) {
  return async (event, ...args) => {
    try {
      // 1. Run boundary schema validator if registered
      if (typeof validatorFn === 'function') {
        const validation = validatorFn(...args);
        if (validation && validation.valid === false) {
          const errMsg =
            validation.errors && validation.errors.length > 0
              ? validation.errors.join('; ')
              : 'Payload failed schema validation.';

          console.warn(`[IPC Guard: ${channel}] Validation Rejected:`, errMsg);
          return formatError(ErrorCode.INVALID_ARGUMENT, errMsg, validation.errors);
        }
      }

      // 2. Invoke the domain handler
      const result = await handlerFn(event, ...args);

      // 3. Normalize return envelope
      if (result && typeof result === 'object') {
        // If domain handler explicitly returned an error result { success: false, error: '...' }
        if (result.success === false) {
          return {
            success: false,
            error: result.error || 'Operation failed',
            code: result.code || ErrorCode.INTERNAL_ERROR,
            details: result.details || null,
            ...result
          };
        }

        // If domain handler already returned { success: true, ... }
        if (result.success === true) {
          return {
            success: true,
            data: result.data !== undefined ? result.data : result,
            ...result
          };
        }
      }

      // 4. Wrap naked return value (arrays, numbers, plain objects) into standard success envelope
      return formatSuccess(result);
    } catch (err) {
      console.error(`[IPC Error: ${channel}] Uncaught handler exception:`, err);

      return formatError(
        err.code || ErrorCode.INTERNAL_ERROR,
        err.message || 'An unexpected internal error occurred.',
        process.env.NODE_ENV === 'development' ? err.stack : null
      );
    }
  };
}

/**
 * Convenience helper to register a guarded handler directly with ipcMain.
 *
 * @param {Electron.IpcMain} ipcMain - Electron ipcMain instance.
 * @param {string} channel - IPC channel name.
 * @param {((...args: any[]) => import('../types').ValidationResult) | null} validatorFn - Optional validator.
 * @param {(event: Electron.IpcMainInvokeEvent, ...args: any[]) => Promise<any> | any} handlerFn - Domain handler.
 */
function guardedHandle(ipcMain, channel, validatorFn, handlerFn) {
  ipcMain.handle(channel, wrapIPC(channel, validatorFn, handlerFn));
}

module.exports = {
  wrapIPC,
  guardedHandle
};
