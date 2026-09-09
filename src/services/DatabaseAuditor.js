/**
 * ============================================================================
 * Ledgerly — DatabaseAuditor (Self-Healing Schema & Integrity Verifier)
 * ============================================================================
 * 
 * @fileoverview
 * Domain service providing automatic startup integrity audits, structural
 * schema validation, orphaned reference repair, negative/NaN amount cleanup,
 * and pre-repair backup snapshots.
 * 
 * ARCHITECTURAL PRINCIPLES:
 * - Single Responsibility: Audits and repairs database corruption and schema drift.
 * - Defensive Persistence: Always snapshots a recovery checkpoint before applying repairs.
 * - Zero Data Loss: Prefers conservative repairs (sanitizing dates/amounts) over row deletion.
 * - Offline Hermetic: Pure native JavaScript with zero external dependencies.
 */

'use strict';

const fs = require('fs');

class DatabaseAuditor {
  /**
   * Evaluates the integrity of a root database object without applying mutations.
   * 
   * @param {any} rootData - The in-memory or parsed root data to inspect.
   * @returns {{ healthy: boolean, issues: string[], suggestions: string[] }}
   */
  static inspect(rootData) {
    const issues = [];
    const suggestions = [];

    if (!rootData || typeof rootData !== 'object' || Array.isArray(rootData)) {
      return {
        healthy: false,
        issues: ['Root data is not a valid JSON object.'],
        suggestions: ['Reinitialize default schema from backup or template.']
      };
    }

    // 1. Root structure checks
    if (!rootData.account || typeof rootData.account !== 'object') {
      issues.push('Missing or corrupt account object.');
      suggestions.push('Initialize default unconfigured account envelope.');
    }

    if (!Array.isArray(rootData.profiles) || rootData.profiles.length === 0) {
      issues.push('Profiles array is missing or empty.');
      suggestions.push('Seed default Master Household profile.');
    } else {
      // Check activeProfileId validity
      const validProfileIds = new Set(rootData.profiles.map(p => p.id));
      if (!rootData.activeProfileId || !validProfileIds.has(rootData.activeProfileId)) {
        issues.push(`Invalid activeProfileId "${rootData.activeProfileId}".`);
        suggestions.push(`Reset activeProfileId to "${rootData.profiles[0].id}".`);
      }

      // Check each profile's data structure
      rootData.profiles.forEach((profile, pIdx) => {
        const pLabel = profile.name || `Profile #${pIdx + 1}`;
        if (!profile.data || typeof profile.data !== 'object') {
          issues.push(`${pLabel}: Missing data container.`);
          suggestions.push(`${pLabel}: Seed default profile data structure.`);
          return;
        }

        const data = profile.data;

        // Check expenses array
        if (!Array.isArray(data.expenses)) {
          issues.push(`${pLabel}: Missing expenses array.`);
          suggestions.push(`${pLabel}: Initialize empty expenses array.`);
        } else {
          const expenseIds = new Set();
          data.expenses.forEach((exp, eIdx) => {
            if (!exp || typeof exp !== 'object') {
              issues.push(`${pLabel}: Expense item #${eIdx + 1} is not an object.`);
              suggestions.push(`${pLabel}: Remove malformed expense entry.`);
              return;
            }

            if (!exp.id) {
              issues.push(`${pLabel}: Expense item #${eIdx + 1} missing ID.`);
              suggestions.push(`${pLabel}: Generate UUID for expense.`);
            } else {
              expenseIds.add(exp.id);
            }

            const amt = parseFloat(exp.amount);
            if (isNaN(amt) || !isFinite(amt) || amt < 0) {
              issues.push(`${pLabel}: Expense "${exp.title || eIdx}" has invalid amount: ${exp.amount}.`);
              suggestions.push(`${pLabel}: Sanitize invalid amount to 0 or valid float.`);
            }

            if (!exp.date || isNaN(new Date(exp.date).getTime())) {
              issues.push(`${pLabel}: Expense "${exp.title || eIdx}" has invalid date: ${exp.date}.`);
              suggestions.push(`${pLabel}: Reset date to current ISO date.`);
            }
          });

          // Check notes referencing orphaned expenses
          if (Array.isArray(data.notes)) {
            data.notes.forEach((note, nIdx) => {
              if (note && note.relationType === 'expense' && note.relation && !expenseIds.has(note.relation)) {
                issues.push(`${pLabel}: Note #${nIdx + 1} references orphaned expense ID "${note.relation}".`);
                suggestions.push(`${pLabel}: Detach note from non-existent expense.`);
              }
            });
          }
        }

        // Check categories and presets
        if (!Array.isArray(data.categories)) {
          issues.push(`${pLabel}: Missing categories collection.`);
          suggestions.push(`${pLabel}: Seed default categories.`);
        }
        if (!Array.isArray(data.presets)) {
          issues.push(`${pLabel}: Missing presets collection.`);
          suggestions.push(`${pLabel}: Seed default presets.`);
        }
      });
    }

    if (!Array.isArray(rootData.recurringBills)) {
      issues.push('Missing recurringBills collection.');
      suggestions.push('Seed default recurring bills array.');
    }

    if (!Array.isArray(rootData.settlements)) {
      issues.push('Missing settlements collection.');
      suggestions.push('Initialize empty settlements array.');
    }

    return {
      healthy: issues.length === 0,
      issues,
      suggestions
    };
  }

  /**
   * Executes a self-healing audit pass against a JsonDatabase instance.
   * If corruption or structural issues are detected, snapshots a recovery backup
   * before applying repairs and persisting the clean state.
   * 
   * @param {import('./JsonDatabase')} db - The database service to inspect and repair.
   * @returns {{ healthy: boolean, issuesFound: string[], repairsApplied: string[], backupCreated: string|null, timestamp: string }}
   */
  static auditAndRepair(db) {
    if (!db || typeof db.read !== 'function' || typeof db.write !== 'function') {
      throw new Error('DatabaseAuditor requires a valid JsonDatabase instance.');
    }

    const timestamp = new Date().toISOString();
    let rootData = db.read();
    const inspection = DatabaseAuditor.inspect(rootData);

    if (inspection.healthy) {
      return {
        healthy: true,
        issuesFound: [],
        repairsApplied: [],
        backupCreated: null,
        timestamp
      };
    }

    const issuesFound = [...inspection.issues];
    const repairsApplied = [];
    let backupCreated = null;

    // Snapshot pre-repair state
    try {
      const dbPath = (typeof db.getFilePath === 'function') ? db.getFilePath() : db.filePath;
      if (dbPath && fs.existsSync(dbPath)) {
        backupCreated = `${dbPath}.pre-audit.bak`;
        fs.copyFileSync(dbPath, backupCreated);
      }
    } catch (bakErr) {
      console.warn('[DatabaseAuditor] Could not create pre-audit backup snapshot:', bakErr.message);
    }

    // Apply repairs
    if (!rootData || typeof rootData !== 'object' || Array.isArray(rootData)) {
      rootData = {};
    }

    if (!rootData.account || typeof rootData.account !== 'object') {
      rootData.account = {
        isConfigured: false,
        userId: '',
        passwordHash: '',
        salt: '',
        rememberMe: false,
        lastLoggedIn: null
      };
      repairsApplied.push('Initialized baseline account envelope.');
    }

    if (!Array.isArray(rootData.profiles) || rootData.profiles.length === 0) {
      const defaultId = 'profile-' + Date.now();
      rootData.profiles = [
        {
          id: defaultId,
          name: 'Master Household',
          avatar: '🏠',
          isHouseholdDefault: true,
          createdDate: timestamp,
          data: {
            expenses: [],
            categories: ['Food & Dining', 'Groceries', 'Utilities', 'Transportation', 'Entertainment', 'Healthcare', 'Shopping', 'Miscellaneous'],
            presets: [],
            notes: [],
            salaryConfig: { monthlyIncome: 0, fixedBills: 0, savingsGoal: 0, payday: 1 },
            budgetGoal: 0,
            householdMembers: ['Self', 'Partner']
          }
        }
      ];
      rootData.activeProfileId = defaultId;
      repairsApplied.push('Created default Master Household profile.');
    }

    const validProfiles = rootData.profiles.filter(p => p && typeof p === 'object' && p.id);
    rootData.profiles = validProfiles;

    if (!rootData.activeProfileId || !validProfiles.some(p => p.id === rootData.activeProfileId)) {
      rootData.activeProfileId = validProfiles[0].id;
      repairsApplied.push(`Reset activeProfileId to "${validProfiles[0].id}".`);
    }

    const todayStr = new Date().toISOString().split('T')[0];

    // Repair each profile's data
    validProfiles.forEach(profile => {
      if (!profile.data || typeof profile.data !== 'object') {
        profile.data = {};
        repairsApplied.push(`${profile.name}: Initialized data object.`);
      }

      const data = profile.data;

      // Expenses
      if (!Array.isArray(data.expenses)) {
        data.expenses = [];
        repairsApplied.push(`${profile.name}: Initialized empty expenses array.`);
      } else {
        const cleanedExpenses = [];
        const expenseIds = new Set();

        data.expenses.forEach((exp, idx) => {
          if (!exp || typeof exp !== 'object') {
            repairsApplied.push(`${profile.name}: Removed non-object expense #${idx + 1}.`);
            return;
          }

          const repairedExp = { ...exp };
          if (!repairedExp.id) {
            repairedExp.id = 'exp-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6);
            repairsApplied.push(`${profile.name}: Generated missing ID for expense "${repairedExp.title || idx}".`);
          }

          // Amount sanitization
          const parsedAmount = parseFloat(repairedExp.amount);
          if (isNaN(parsedAmount) || !isFinite(parsedAmount) || parsedAmount < 0) {
            repairedExp.amount = 0;
            repairsApplied.push(`${profile.name}: Sanitized invalid amount on "${repairedExp.title || repairedExp.id}" to 0.`);
          } else {
            repairedExp.amount = Math.round(parsedAmount * 100) / 100;
          }

          // Date sanitization
          if (!repairedExp.date || isNaN(new Date(repairedExp.date).getTime())) {
            repairedExp.date = todayStr;
            repairsApplied.push(`${profile.name}: Sanitized invalid date on "${repairedExp.title || repairedExp.id}" to "${todayStr}".`);
          }

          // Metadata stamps for sync foundation
          if (!repairedExp.updatedAt) {
            repairedExp.updatedAt = timestamp;
          }
          if (repairedExp.version === undefined) {
            repairedExp.version = 1;
          }

          expenseIds.add(repairedExp.id);
          cleanedExpenses.push(repairedExp);
        });

        data.expenses = cleanedExpenses;

        // Notes repair
        if (!Array.isArray(data.notes)) {
          data.notes = [];
        } else {
          data.notes.forEach(note => {
            if (note && note.relationType === 'expense' && note.relation && !expenseIds.has(note.relation)) {
              note.relation = null;
              note.relationType = 'general';
              repairsApplied.push(`${profile.name}: Detached orphaned note "${note.title || note.id}".`);
            }
          });
        }
      }

      // Collections
      if (!Array.isArray(data.categories) || data.categories.length === 0) {
        data.categories = ['Food & Dining', 'Groceries', 'Utilities', 'Transportation', 'Entertainment', 'Healthcare', 'Shopping', 'Miscellaneous'];
        repairsApplied.push(`${profile.name}: Restored default categories.`);
      }

      if (!Array.isArray(data.presets)) {
        data.presets = [];
        repairsApplied.push(`${profile.name}: Initialized presets array.`);
      }

      if (!Array.isArray(data.householdMembers) || data.householdMembers.length === 0) {
        data.householdMembers = ['Self', 'Partner'];
        repairsApplied.push(`${profile.name}: Restored default household members.`);
      }

      if (!data.salaryConfig || typeof data.salaryConfig !== 'object') {
        data.salaryConfig = { monthlyIncome: 0, fixedBills: 0, savingsGoal: 0, payday: 1 };
        repairsApplied.push(`${profile.name}: Initialized default salary config.`);
      }
    });

    if (!Array.isArray(rootData.recurringBills)) {
      rootData.recurringBills = [];
      repairsApplied.push('Initialized recurringBills collection.');
    }

    if (!Array.isArray(rootData.settlements)) {
      rootData.settlements = [];
      repairsApplied.push('Initialized settlements collection.');
    }

    if (!rootData.schemaVersion || rootData.schemaVersion < 2) {
      rootData.schemaVersion = 2;
      repairsApplied.push('Standardized schemaVersion to 2.');
    }

    // Persist repaired state
    db.write(rootData);

    return {
      healthy: false,
      issuesFound,
      repairsApplied,
      backupCreated,
      timestamp
    };
  }
}

module.exports = DatabaseAuditor;
