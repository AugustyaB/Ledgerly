/**
 * ============================================================================
 * Ledgerly — NotificationEngine (Proactive Alerts & Trigger Rules Engine)
 * ============================================================================
 *
 * @fileoverview
 * Domain service managing user notification preferences, in-app notification CRUD,
 * 24-hour smart deduplication, and automated background evaluation rules
 * (budget exhaustion, bill due dates, overdue debts, evening nudges, and payday countdowns).
 *
 * ARCHITECTURAL PRINCIPLES:
 * - Single Responsibility: Evaluates proactive financial health alerts and user notices.
 * - Encapsulation: Insulates trigger evaluation math, deduplication windows, and alert tiers.
 * - Dependency Injection: Operates through injected Database, Profile, Budget, and Household services.
 * - Extensibility: Supports future desktop push, audio chimes, email digests, and custom rule plugins.
 */

'use strict';

/**
 * Default notification configuration parameters.
 * @readonly
 */
const DEFAULT_NOTIFICATION_CONFIG = Object.freeze({
  enableNative: true, // Native Windows popups for critical alerts (Bill due today, 100% budget)
  dailyNudge: true, // Evening reminder if 0 expenses logged
  nudgeTime: '18:00', // Configurable nudge time (default 18:00 / 6 PM)
  overdueDebtAlerts: true // Flag shared debts & bills overdue past 7 days (in-app)
});

/**
 * @class NotificationEngine
 * Manages notification preferences, notification lifecycle, deduplication, and automatic evaluation rules.
 */
class NotificationEngine {
  /**
   * Initializes the NotificationEngine with injected domain service dependencies.
   *
   * @param {import('./JsonDatabase')} db - The database persistence service.
   * @param {import('./ProfileService')} profileService - The profile management service.
   * @param {import('./BudgetService')} budgetService - The budget and salary calculation service.
   * @param {import('./HouseholdService')} householdService - The household and settlement service.
   */
  constructor(db, profileService, budgetService, householdService) {
    if (!db || !profileService || !budgetService || !householdService) {
      throw new Error(
        'NotificationEngine requires valid JsonDatabase, ProfileService, BudgetService, and HouseholdService instances.'
      );
    }

    /** @private */
    this._db = db;

    /** @private */
    this._profiles = profileService;

    /** @private */
    this._budget = budgetService;

    /** @private */
    this._household = householdService;
  }

  // ==========================================================================
  // 1. Notification Preferences Configuration
  // ==========================================================================

  /**
   * Returns default notification preferences.
   *
   * @returns {import('../types').NotificationConfig}
   */
  getDefaultConfig() {
    return { ...DEFAULT_NOTIFICATION_CONFIG };
  }

  /**
   * Retrieves notification preferences for the active profile, merged with defaults.
   *
   * @returns {import('../types').NotificationConfig}
   */
  getConfig() {
    const data = this._profiles.getActiveData();
    return {
      ...this.getDefaultConfig(),
      ...(data.notificationConfig || {})
    };
  }

  /**
   * Updates notification preferences for the active profile.
   *
   * @param {Partial<import('../types').NotificationConfig>} cfg - Preference updates.
   * @returns {import('../types').OperationResult & { config: import('../types').NotificationConfig }}
   */
  saveConfig(cfg = {}) {
    const data = this._profiles.getActiveData();
    data.notificationConfig = {
      ...this.getDefaultConfig(),
      ...(data.notificationConfig || {}),
      ...(cfg || {})
    };

    this._profiles.saveActiveData(data);
    return { success: true, config: data.notificationConfig };
  }

  // ==========================================================================
  // 2. Notification Lifecycle & Deduplication (CRUD)
  // ==========================================================================

  /**
   * Retrieves all notifications for the active profile, sorted newest first.
   *
   * @returns {import('../types').Notification[]} List of notifications.
   */
  getNotifications() {
    const data = this._profiles.getActiveData();
    const list = Array.isArray(data.notifications) ? [...data.notifications] : [];

    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  /**
   * Appends a new notification, preventing duplicates within a 24-hour window.
   * Retains up to 50 most recent notifications.
   *
   * @param {Partial<import('../types').Notification>} notif - Notification payload.
   * @returns {import('../types').OperationResult & { notification?: import('../types').Notification, duplicate?: boolean }}
   */
  addNotification(notif = {}) {
    if (!notif || !notif.title) {
      return { success: false, error: 'Title is required' };
    }

    const data = this._profiles.getActiveData();
    if (!Array.isArray(data.notifications)) {
      data.notifications = [];
    }

    // Avoid duplicate unread notifications with the same title within 24 hours
    const nowMs = Date.now();
    const existing = data.notifications.find(
      n => n.title === notif.title && !n.read && nowMs - new Date(n.createdAt).getTime() < 24 * 60 * 60 * 1000
    );

    if (existing) {
      return { success: true, notification: existing, duplicate: true };
    }

    const newNotif = {
      id: 'notif-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
      type: notif.type || 'system',
      title: notif.title.trim(),
      message: (notif.message || '').trim(),
      icon: notif.icon || 'bell',
      isCritical: Boolean(notif.isCritical),
      read: false,
      createdAt: notif.createdAt || new Date().toISOString(),
      actionTab: notif.actionTab || null,

      // Extensibility slots
      channel: notif.channel || 'in-app',
      snoozedUntil: null,
      metadata: notif.metadata || {}
    };

    data.notifications.unshift(newNotif);

    // Keep max 50 recent notifications
    if (data.notifications.length > 50) {
      data.notifications = data.notifications.slice(0, 50);
    }

    this._profiles.saveActiveData(data);
    return { success: true, notification: newNotif, duplicate: false };
  }

  /**
   * Marks a single notification as read by ID.
   *
   * @param {string} id - Notification identifier.
   * @returns {import('../types').OperationResult & { notification?: import('../types').Notification }}
   */
  markNotificationRead(id) {
    const data = this._profiles.getActiveData();
    if (!Array.isArray(data.notifications)) {
      return { success: false, error: 'No notifications' };
    }

    const target = data.notifications.find(n => n.id === id);
    if (target) {
      target.read = true;
      this._profiles.saveActiveData(data);
      return { success: true, notification: target };
    }

    return { success: false, error: 'Notification not found' };
  }

  /**
   * Marks all notifications as read for the active profile.
   *
   * @returns {import('../types').OperationResult & { count: number }}
   */
  markAllNotificationsRead() {
    const data = this._profiles.getActiveData();
    if (Array.isArray(data.notifications)) {
      data.notifications.forEach(n => {
        n.read = true;
      });
      this._profiles.saveActiveData(data);
    }

    return { success: true, count: (data.notifications || []).length };
  }

  /**
   * Deletes a notification by ID.
   *
   * @param {string} id - Notification identifier.
   * @returns {import('../types').OperationResult & { notification?: import('../types').Notification }}
   */
  deleteNotification(id) {
    const data = this._profiles.getActiveData();
    if (!Array.isArray(data.notifications)) {
      return { success: false, error: 'No notifications' };
    }

    const idx = data.notifications.findIndex(n => n.id === id);
    if (idx !== -1) {
      const removed = data.notifications.splice(idx, 1)[0];
      this._profiles.saveActiveData(data);
      return { success: true, notification: removed };
    }

    return { success: false, error: 'Notification not found' };
  }

  /**
   * Clears all notifications for the active profile.
   *
   * @returns {import('../types').OperationResult}
   */
  clearAllNotifications() {
    const data = this._profiles.getActiveData();
    data.notifications = [];
    this._profiles.saveActiveData(data);

    return { success: true };
  }

  // ==========================================================================
  // 3. Automated Notifications Evaluation Rules Engine
  // ==========================================================================

  /**
   * Evaluates all proactive alert triggers based on real-time spending,
   * scheduled bills, shared balances, and time of day.
   *
   * @returns {import('../types').Notification[] & { criticalAlerts?: import('../types').Notification[] }}
   */
  evaluateAutoNotifications() {
    const data = this._profiles.getActiveData();
    const cfg = this.getConfig();
    const salary = data.salaryConfig || this._profiles.getDefaultSalaryConfig();
    const metrics = this._budget.calculateDailyBudgetMetrics();
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const sym = salary.currencySymbol || '₹';
    const newlyCreatedCritical = [];

    // ------------------------------------------------------------------------
    // Trigger 3 (Critical & In-App): 100% Monthly Discretionary Budget Reached
    // ------------------------------------------------------------------------
    const discBudget = metrics.discretionaryBudget;
    const spent = metrics.spentMonthToDate;

    if (discBudget > 0 && spent >= discBudget) {
      const res = this.addNotification({
        type: 'budget',
        title: 'Monthly Discretionary Budget Reached',
        message: `You have spent ${sym}${spent.toFixed(2)} of ${sym}${discBudget.toFixed(2)}. Switch to essential spending only.`,
        icon: 'alert-triangle',
        isCritical: true,
        actionTab: 'dashboard'
      });

      if (res.success && !res.duplicate && res.notification?.isCritical) {
        newlyCreatedCritical.push(res.notification);
      }
    }

    // ------------------------------------------------------------------------
    // Trigger 1 (Critical & In-App): Bill Due Today & Upcoming / Overdue Bills
    // ------------------------------------------------------------------------
    const bills = this._household.getRecurringBills();
    const currentDay = now.getDate();

    bills.forEach(bill => {
      if (bill.dueDay && !bill.isPaidForCurrentCycle) {
        const daysUntilDue = bill.dueDay - currentDay;

        // Critical: Bill Due Today
        if (daysUntilDue === 0) {
          const res = this.addNotification({
            type: 'bill',
            title: `Bill Due Today: ${bill.title}`,
            message: `${sym}${parseFloat(String(bill.amount || 0)).toFixed(2)} due today. Split or record in household ledger.`,
            icon: 'zap',
            isCritical: true,
            actionTab: 'household'
          });

          if (res.success && !res.duplicate && res.notification?.isCritical) {
            newlyCreatedCritical.push(res.notification);
          }
        } else if (daysUntilDue > 0 && daysUntilDue <= 3) {
          // In-App: Upcoming in 1-3 days
          const dueStr = daysUntilDue === 1 ? 'Tomorrow' : `in ${daysUntilDue} days`;
          this.addNotification({
            type: 'bill',
            title: `Bill Due ${dueStr}: ${bill.title}`,
            message: `${sym}${parseFloat(String(bill.amount || 0)).toFixed(2)} due on Day ${bill.dueDay}. Split with household to keep accounts updated.`,
            icon: 'calendar',
            isCritical: false,
            actionTab: 'household'
          });
        } else if (cfg.overdueDebtAlerts && daysUntilDue < 0 && Math.abs(daysUntilDue) >= 7) {
          // Trigger 2 (In-App Only): Overdue Bill Past 7 Days
          this.addNotification({
            type: 'bill',
            title: `Overdue Bill: ${bill.title}`,
            message: `${sym}${parseFloat(String(bill.amount || 0)).toFixed(2)} was due ${Math.abs(daysUntilDue)} days ago. Please mark paid or settle.`,
            icon: 'alert-circle',
            isCritical: false,
            actionTab: 'household'
          });
        }
      }
    });

    // ------------------------------------------------------------------------
    // Trigger 2 (In-App Only): Overdue Household Shared Debts past 7 days
    // ------------------------------------------------------------------------
    if (cfg.overdueDebtAlerts && data.workspaceMode !== 'solo') {
      try {
        const settlement = this._household.getHouseholdSettlement();
        const balances = settlement?.balances || {};

        for (const [member, net] of Object.entries(balances)) {
          if (member !== 'Self' && member !== 'You') {
            if (net < -500) {
              this.addNotification({
                type: 'household',
                title: `Pending Split: ${member}`,
                message: `${member} has an unsettled balance of ${sym}${Math.abs(net).toFixed(2)}. Tap to review or settle.`,
                icon: 'users',
                isCritical: false,
                actionTab: 'household'
              });
            } else if (net > 500) {
              this.addNotification({
                type: 'household',
                title: `Outstanding Balance to ${member}`,
                message: `You owe ${member} ${sym}${net.toFixed(2)} in shared expenses. Tap to settle up.`,
                icon: 'scale',
                isCritical: false,
                actionTab: 'household'
              });
            }
          }
        }
      } catch {
        // Suppress settlement calculation errors during notification pass
      }
    }

    // ------------------------------------------------------------------------
    // Trigger 5 (In-App Only): Daily Evening Logging Nudge
    // ------------------------------------------------------------------------
    if (cfg.dailyNudge) {
      const [nudgeH, nudgeM] = (cfg.nudgeTime || '18:00').split(':').map(n => parseInt(n, 10) || 0);
      const currentH = now.getHours();
      const currentM = now.getMinutes();
      const isPastNudgeTime = currentH > nudgeH || (currentH === nudgeH && currentM >= nudgeM);

      if (isPastNudgeTime) {
        const todayExpenses = (data.expenses || []).filter(e => e.date === todayStr);
        if (todayExpenses.length === 0) {
          this.addNotification({
            type: 'reminder',
            title: 'Evening Expense Check-in',
            message: 'No expenses logged today. Had meals, transit, or coffee? Tap to quick-log via Express Entry.',
            icon: 'sparkles',
            isCritical: false,
            actionTab: 'express'
          });
        }
      }
    }

    // ------------------------------------------------------------------------
    // Trigger 6 (In-App Only): Payday Eve Countdown
    // ------------------------------------------------------------------------
    if (metrics.remainingDays === 1) {
      const savingsProtected = Math.max(0, (salary.savingsGoal || 0) - Math.max(0, spent - discBudget));
      this.addNotification({
        type: 'payday',
        title: 'Payday Tomorrow!',
        message: `Final day of cycle! You protected ${sym}${savingsProtected.toFixed(2)} of your savings goal this month.`,
        icon: 'calendar',
        isCritical: false,
        actionTab: 'dashboard'
      });
    }

    // ------------------------------------------------------------------------
    // Trigger 7 (In-App Only): Large Outflow Anomaly / Spike Alert
    // ------------------------------------------------------------------------
    if (discBudget > 0) {
      const cycleExpenses = (data.expenses || []).filter(
        e => e.date && e.date >= metrics.cycleStartDate && e.date < metrics.nextPaydayDate
      );
      const largeExpense = cycleExpenses.find(e => (parseFloat(String(e.amount)) || 0) >= discBudget * 0.35);

      if (largeExpense) {
        const pct = Math.round(((parseFloat(String(largeExpense.amount)) || 0) / discBudget) * 100);
        this.addNotification({
          type: 'budget',
          title: `High-Impact Expense: ${largeExpense.title}`,
          message: `${sym}${parseFloat(String(largeExpense.amount)).toFixed(2)} consumed ${pct}% of your monthly discretionary budget. Review What-If impact.`,
          icon: 'pie-chart',
          isCritical: false,
          actionTab: 'dashboard'
        });
      }
    }

    // ------------------------------------------------------------------------
    // Trigger 8 (In-App Only): Delayed Salary Cycle Guidance (delayed only)
    // ------------------------------------------------------------------------
    if (metrics.isDelayed && metrics.shiftDays > 0) {
      this.addNotification({
        type: 'payday',
        title: `Salary Delayed (${metrics.shiftDays}d buffer)`,
        message: metrics.stretchGuidance || '',
        icon: 'clock',
        isCritical: false,
        actionTab: 'settings'
      });
    }

    const list = this.getNotifications();
    list.criticalAlerts = newlyCreatedCritical;
    return list;
  }
}

module.exports = NotificationEngine;
