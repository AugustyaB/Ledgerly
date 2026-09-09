/**
 * ============================================================================
 * Ledgerly — Main Process & Runtime Crash Logger (Phase 6)
 * ============================================================================
 * 
 * @fileoverview
 * Zero-dependency persistent diagnostics and crash logging engine.
 * Records timestamped unhandled exceptions, unhandled promise rejections,
 * renderer-process failures, and telemetry to `crash.log`.
 * 
 * DESIGN PRINCIPLES:
 * - Robust against filesystem errors: all write and read operations are guarded with try/catch.
 * - 5MB size capping: rotates log file or trims oldest entries when threshold is reached.
 * - Environment resilience: uses Electron `app.getPath('userData')` when available,
 *   falling back safely to local scratch directory in headless test runners.
 */

'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Maximum log file size before rotation (5 Megabytes).
 * @type {number}
 */
const MAX_LOG_SIZE_BYTES = 5 * 1024 * 1024;

class CrashLogger {
  /**
   * @param {string} [customLogPath] - Explicit path override for test isolation.
   */
  constructor(customLogPath) {
    this.customPath = customLogPath || null;
  }

  /**
   * Resolves the canonical path to the crash log file.
   * @returns {string} Absolute path to crash.log
   */
  getLogPath() {
    if (this.customPath) {
      return this.customPath;
    }

    try {
      // Dynamic require to prevent breaking in standalone node test runners
      const { app } = require('electron');
      if (app && typeof app.getPath === 'function') {
        return path.join(app.getPath('userData'), 'crash.log');
      }
    } catch {
      // Electron not available or in test mode
    }

    return path.join(__dirname, '../../scratch/crash.log');
  }

  /**
   * Ensures the parent directory of the crash log exists.
   * @private
   */
  _ensureDirectoryExists(filePath) {
    try {
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    } catch {
      // Ignore directory creation failure in locked environments
    }
  }

  /**
   * Checks file size and rotates to .old if exceeding 5MB limit.
   * @private
   */
  _rotateIfNeeded(logPath) {
    try {
      if (fs.existsSync(logPath)) {
        const stats = fs.statSync(logPath);
        if (stats.size >= MAX_LOG_SIZE_BYTES) {
          const oldPath = logPath + '.old';
          if (fs.existsSync(oldPath)) {
            fs.unlinkSync(oldPath);
          }
          fs.renameSync(logPath, oldPath);
        }
      }
    } catch {
      // Fallback: If rename fails, attempt truncation
      try {
        const content = fs.readFileSync(logPath, 'utf8');
        const lines = content.split('\n');
        if (lines.length > 1000) {
          fs.writeFileSync(logPath, lines.slice(-500).join('\n'), 'utf8');
        }
      } catch {
        // Suppress secondary rotation errors
      }
    }
  }

  /**
   * Logs a structured crash event to crash.log.
   * 
   * @param {string} type - Event identifier (e.g. 'MAIN_UNCAUGHT_EXCEPTION', 'RENDERER_ERROR')
   * @param {Error|string|any} errorOrMessage - Error object or diagnostic message
   * @param {Record<string, any>} [context={}] - Optional metadata (PID, URL, channel, etc.)
   * @returns {string} The formatted log entry string
   */
  logCrash(type, errorOrMessage, context = {}) {
    const timestamp = new Date().toISOString();
    const logPath = this.getLogPath();

    this._ensureDirectoryExists(logPath);
    this._rotateIfNeeded(logPath);

    let message;
    let stack = '';

    if (errorOrMessage instanceof Error) {
      message = errorOrMessage.message || String(errorOrMessage);
      stack = errorOrMessage.stack || '';
    } else if (typeof errorOrMessage === 'object' && errorOrMessage !== null) {
      message = errorOrMessage.message || JSON.stringify(errorOrMessage);
      stack = errorOrMessage.stack || '';
    } else {
      message = String(errorOrMessage || 'Unknown error');
    }

    const processInfo = {
      pid: process.pid,
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      ...context
    };

    const entry = [
      '================================================================================',
      `[${timestamp}] [${type}]`,
      `Message: ${message}`,
      `Process Info: ${JSON.stringify(processInfo)}`,
      stack ? `Stack Trace:\n${stack}` : 'Stack Trace: (none)',
      '================================================================================\n'
    ].join('\n');

    try {
      fs.appendFileSync(logPath, entry, 'utf8');
    } catch (writeErr) {
      console.error('[CrashLogger] Failed to append to crash.log:', writeErr.message);
    }

    return entry;
  }

  /**
   * Retrieves the most recent log entries.
   * 
   * @param {number} [maxLines=100] - Maximum lines to retrieve
   * @returns {string} Raw log content of recent lines
   */
  getRecentCrashLogs(maxLines = 100) {
    const logPath = this.getLogPath();
    try {
      if (!fs.existsSync(logPath)) {
        return 'No crash logs recorded.';
      }
      const content = fs.readFileSync(logPath, 'utf8');
      const lines = content.split('\n');
      if (lines.length <= maxLines) {
        return content;
      }
      return lines.slice(-maxLines).join('\n');
    } catch (err) {
      return `Failed to read crash logs: ${err.message}`;
    }
  }

  /**
   * Clears the crash log file.
   * @returns {boolean} True if cleared successfully
   */
  clearCrashLogs() {
    const logPath = this.getLogPath();
    try {
      if (fs.existsSync(logPath)) {
        fs.writeFileSync(logPath, '', 'utf8');
      }
      const oldPath = logPath + '.old';
      if (fs.existsSync(oldPath)) {
        fs.unlinkSync(oldPath);
      }
      return true;
    } catch (err) {
      console.error('[CrashLogger] Failed to clear crash logs:', err);
      return false;
    }
  }
}

// Export singleton instance and class definition
const defaultLogger = new CrashLogger();

module.exports = {
  CrashLogger,
  crashLogger: defaultLogger,
  MAX_LOG_SIZE_BYTES
};
