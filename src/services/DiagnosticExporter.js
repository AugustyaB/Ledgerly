/**
 * ============================================================================
 * Ledgerly — DiagnosticExporter (Sanitized Offline Telemetry & Bug Bundler)
 * ============================================================================
 *
 * @fileoverview
 * Generates privacy-safe diagnostic reports packaging system specs, runtime
 * health, database integrity metrics, and sanitized crash logs for offline
 * debugging and user support.
 *
 * ARCHITECTURAL PRINCIPLES:
 * - Privacy First: Never exports plaintext passwords, hashes, account credentials,
 *   personal notes content, or individual transaction logs.
 * - Path Masking: Replaces user home directories with sanitized placeholders.
 * - Zero Dependencies: Native Node.js standard modules only.
 */

'use strict';

const os = require('os');
const fs = require('fs');
const DatabaseAuditor = require('./DatabaseAuditor');
const crashLogger = require('../logger/crashLogger');

class DiagnosticExporter {
  /**
   * Masks sensitive paths (e.g. C:\Users\Username or /home/username) in strings.
   *
   * @param {string} text - Raw string containing potential file paths.
   * @returns {string} Sanitized string with masked user identifiers.
   */
  static maskSensitivePaths(text) {
    if (!text || typeof text !== 'string') return text;
    try {
      const home = os.homedir();
      if (home && text.includes(home)) {
        return text.split(home).join('<USER_HOME>');
      }
      return text
        .replace(/[A-Za-z]:\\Users\\[^\\]+/g, 'C:\\Users\\<REDACTED>')
        .replace(/\/home\/[^/]+/g, '/home/<REDACTED>');
    } catch {
      return text;
    }
  }

  /**
   * Masks sensitive credentials, auth tokens, passwords, and API keys.
   *
   * @param {string} text
   * @returns {string} Sanitized string
   */
  static maskSensitiveStrings(text) {
    if (!text || typeof text !== 'string') return text;
    let sanitized = DiagnosticExporter.maskSensitivePaths(text);
    // Mask Bearer tokens
    sanitized = sanitized.replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [REDACTED]');
    // Mask API keys and secrets
    sanitized = sanitized.replace(
      /(?:api_key|apiKey|secret|token|password|auth)\s*[=:]\s*["']?[^"'\s,;]+["']?/gi,
      match => {
        const key = match.split(/[=:]/)[0];
        return `${key}=[REDACTED]`;
      }
    );
    return sanitized;
  }

  /**
   * Compiles a comprehensive, privacy-sanitized diagnostic bundle.
   *
   * @param {import('./JsonDatabase')} db - The database service.
   * @param {string} [appVersion='0.4.7'] - Active Ledgerly application version.
   * @returns {object} Sanitized diagnostic bundle.
   */
  static generateReport(db, appVersion = '0.4.7') {
    const timestamp = new Date().toISOString();

    // 1. System Environment
    const system = {
      appVersion,
      platform: process.platform,
      arch: process.arch,
      osRelease: os.release(),
      totalMemoryMB: Math.round(os.totalmem() / (1024 * 1024)),
      freeMemoryMB: Math.round(os.freemem() / (1024 * 1024)),
      nodeVersion: process.versions.node,
      electronVersion: process.versions.electron || 'N/A',
      chromeVersion: process.versions.chrome || 'N/A',
      processUptimeSeconds: Math.round(process.uptime()),
      processMemoryMB: Math.round(process.memoryUsage().rss / (1024 * 1024))
    };

    // 2. Database Telemetry & Health
    let dbMetrics = {
      status: 'unavailable',
      fileSizeBytes: 0,
      profilesCount: 0,
      totalExpensesCount: 0,
      totalNotesCount: 0,
      recurringBillsCount: 0,
      schemaVersion: 0,
      integrityAudit: null
    };

    if (db && typeof db.read === 'function') {
      try {
        dbMetrics.fileSizeBytes = typeof db.getFileSize === 'function' ? db.getFileSize() : 0;
        const root = db.read();
        dbMetrics.status = 'loaded';
        dbMetrics.schemaVersion = root.schemaVersion || 1;
        dbMetrics.recurringBillsCount = Array.isArray(root.recurringBills) ? root.recurringBills.length : 0;

        if (Array.isArray(root.profiles)) {
          dbMetrics.profilesCount = root.profiles.length;
          let expensesCount = 0;
          let notesCount = 0;

          root.profiles.forEach(p => {
            if (p && p.data) {
              if (Array.isArray(p.data.expenses)) expensesCount += p.data.expenses.length;
              if (Array.isArray(p.data.notes)) notesCount += p.data.notes.length;
            }
          });

          dbMetrics.totalExpensesCount = expensesCount;
          dbMetrics.totalNotesCount = notesCount;
        }

        const inspection = DatabaseAuditor.inspect(root);
        dbMetrics.integrityAudit = {
          healthy: inspection.healthy,
          issuesCount: inspection.issues.length,
          issuesSummary: inspection.issues.map(i => DiagnosticExporter.maskSensitivePaths(i))
        };
      } catch (err) {
        dbMetrics.status = 'error';
        dbMetrics.error = err.message;
      }
    }

    // 3. Sanitized Recent Crash Logs
    let recentCrashLogs;
    try {
      const rawLogs = crashLogger.getRecentCrashLogs(50);
      recentCrashLogs = rawLogs.map(line => DiagnosticExporter.maskSensitiveStrings(line));
    } catch {
      recentCrashLogs = ['[Diagnostics] Could not access crash log file.'];
    }

    return {
      reportType: 'Ledgerly System & Database Diagnostic Bundle',
      generatedAt: timestamp,
      system,
      database: dbMetrics,
      recentCrashLogs
    };
  }

  /**
   * Generates and writes the diagnostic report to disk.
   *
   * @param {string} destinationPath - Absolute path where the report JSON will be written.
   * @param {import('./JsonDatabase')} db - The database service.
   * @param {string} [appVersion='0.4.7'] - Active version.
   * @returns {{ success: boolean, destinationPath: string, error?: string }}
   */
  static exportToFile(destinationPath, db, appVersion = '0.4.7') {
    try {
      const report = DiagnosticExporter.generateReport(db, appVersion);
      fs.writeFileSync(destinationPath, JSON.stringify(report, null, 2), 'utf-8');
      return { success: true, destinationPath };
    } catch (err) {
      return { success: false, destinationPath, error: err.message };
    }
  }
}

module.exports = DiagnosticExporter;
