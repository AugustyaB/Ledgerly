/**
 * ============================================================================
 * Ledgerly — Core Domain Interface Contracts & Type Definitions
 * ============================================================================
 *
 * @fileoverview
 * Centralized JSDoc type contracts for the Ledgerly desktop personal finance system.
 * This file contains purely declarative type definitions (no runtime overhead).
 *
 * ARCHITECTURAL DESIGN:
 * - Serves as the single source of truth for all data shapes across processes.
 * - Engineered with forward-compatibility: core entities include extensibility
 *   slots (e.g. metadata maps, multi-currency fields, recurrence identifiers)
 *   to accommodate future feature evolution without breaking data migrations.
 * - Enables strict IDE autocompletion, type hinting, and compile-time checking
 *   via jsconfig.json ("checkJs": true).
 */

'use strict';

// ============================================================================
// 1. Generic & Utility Result Envelopes
// ============================================================================

/**
 * Standardized mutation response envelope across all services.
 * Allows predictable error propagation and status checking without exceptions.
 *
 * @template T
 * @typedef {Object} ServiceResult
 * @property {boolean} success - Whether the operation succeeded.
 * @property {T} [data] - The returned payload on success.
 * @property {string} [error] - Human-readable error message if failed.
 * @property {string} [code] - Machine-readable error code for UI internationalization.
 * @property {any} [details] - Detailed error violation list or metadata.
 * @property {string[]} [warnings] - Non-fatal warnings or diagnostic notices.
 */

/**
 * Standardized validation result from runtime schema validators.
 * @typedef {Object} ValidationResult
 * @property {boolean} valid - Whether the input payload passed all constraints.
 * @property {string[]} errors - Array of human-readable field violation descriptions.
 */

/**
 * Standardized IPC wire envelope contract.
 * @template T
 * @typedef {Object} IPCResponse
 * @property {boolean} success - True if the IPC invocation completed successfully.
 * @property {T} [data] - Result payload on success.
 * @property {string} [error] - Error message on failure.
 * @property {string} [code] - Machine-readable error code (e.g. INVALID_ARGUMENT, NOT_FOUND).
 * @property {any} [details] - Structured error details or validation violations.
 */

/**
 * Basic operation result without payload.
 * @typedef {ServiceResult<void>} OperationResult
 */

/**
 * Geographic or merchant location metadata.
 * @typedef {Object} LocationInfo
 * @property {string} [name] - Merchant or place name (e.g., "Indiranagar Branch").
 * @property {string} [city] - City or municipality.
 * @property {number} [latitude] - GPS latitude coordinate.
 * @property {number} [longitude] - GPS longitude coordinate.
 */

// ============================================================================
// 2. Expense & Transaction Entities
// ============================================================================

/**
 * Represents a single transaction or financial entry.
 * Designed to support one-off expenses, recurring charges, split household debits,
 * and future multi-currency or multi-tax expansions.
 *
 * @typedef {Object} Expense
 * @property {string} id - Unique identifier (e.g., "exp-1724000000-abcd").
 * @property {string} title - Primary display title / payee / merchant name.
 * @property {number} amount - Transaction monetary value (must be >= 0).
 * @property {string} category - Assigned expense category.
 * @property {string} paymentMethod - Method used (UPI, Credit Card, Cash, etc.).
 * @property {string} date - Local ISO date string (YYYY-MM-DD).
 * @property {string} [description] - Optional notes, narrative, or memo.
 * @property {string[]} [tags] - Searchable labels or taxonomy tags.
 * @property {string|null} [receiptFilename] - Linked receipt photo image filename on disk.
 * @property {string} [paidBy] - Payer name or member identifier (default: "Self").
 * @property {string[]} [splitWith] - Household members sharing this expense.
 * @property {boolean} [isHouseholdExpense] - Whether this entry participates in split balances.
 *
 * // --- Future Extensibility Slots ---
 * @property {string} [currency] - ISO 4217 currency code (e.g., "INR", "USD", "EUR").
 * @property {number} [exchangeRate] - Conversion multiplier relative to base currency.
 * @property {boolean} [isRecurring] - Flag indicating automatic generation from recurring rule.
 * @property {string} [recurringBillId] - Parent bill ID if generated from a recurring bill.
 * @property {'cleared'|'pending'|'reconciled'} [status] - Transaction reconciliation state.
 * @property {number} [taxAmount] - Included or assessed sales tax / GST amount.
 * @property {LocationInfo} [location] - Optional location details.
 * @property {Record<string, *>} [metadata] - Arbitrary future plugin/extension key-value data.
 */

/**
 * Filter criteria for querying the expenses collection.
 *
 * @typedef {Object} ExpenseFilters
 * @property {string} [query] - Full-text search term matching title, memo, or category.
 * @property {string} [category] - Filter by specific category or "ALL".
 * @property {string} [paymentMethod] - Filter by specific payment method or "ALL".
 * @property {string} [paidBy] - Filter by specific payer or "ALL".
 * @property {string} [tag] - Filter by specific tag label.
 * @property {string} [startDate] - Minimum transaction date (YYYY-MM-DD, inclusive).
 * @property {string} [endDate] - Maximum transaction date (YYYY-MM-DD, inclusive).
 * @property {boolean} [isHouseholdOnly] - Only retrieve shared household expenses.
 * @property {number} [minAmount] - Lower monetary bound.
 * @property {number} [maxAmount] - Upper monetary bound.
 */

/**
 * Paginated and sorted expense collection query response.
 *
 * @typedef {Object} ExpenseQueryResult
 * @property {Expense[]} expenses - Array of matching expense records.
 * @property {number} totalCount - Total matching records count before pagination.
 * @property {number} totalAmount - Sum of amounts across all matching records.
 * @property {number} [page] - Active 1-indexed page number.
 * @property {number} [pageSize] - Records per page.
 */

/**
 * Preset button configuration for 1-click frequent logging.
 *
 * @typedef {Object} ExpensePreset
 * @property {string} id - Unique preset identifier (e.g., "pst-1").
 * @property {string} icon - Lucide icon name (e.g., "coffee", "utensils", "fuel").
 * @property {string} title - Preset display title (e.g., "Chai / Coffee").
 * @property {number} amount - Predefined transaction amount.
 * @property {string} category - Predefined category.
 * @property {string} paymentMethod - Predefined payment method.
 * @property {string[]} [defaultSplitWith] - Optional auto-split members.
 */

// ============================================================================
// 3. User Accounts & Multi-Profile Architecture
// ============================================================================

/**
 * Root account authentication credentials and security settings.
 *
 * @typedef {Object} AccountCredentials
 * @property {boolean} isConfigured - Whether the master account setup has been completed.
 * @property {string} userId - Master user identifier or email.
 * @property {string} passwordHash - Derived key hash string.
 * @property {string} salt - Cryptographically random hex salt.
 * @property {number} [hashVersion] - Iteration tier (1 = legacy 1K, 2 = OWASP 210K).
 * @property {boolean} rememberMe - Whether auto-login is active for profile selection.
 * @property {string|null} lastLoggedIn - ISO timestamp of last authenticated session.
 * @property {'household'|'solo'} [workspaceMode] - Default application workspace view mode.
 */

/**
 * Lightweight public profile descriptor for profile pickers and headers.
 *
 * @typedef {Object} ProfileSummary
 * @property {string} id - Unique profile ID (e.g., "prof-default").
 * @property {string} name - Profile display name (e.g., "Personal", "Business").
 * @property {string} avatar - Display avatar emoji or color hex.
 * @property {string} color - Accent theme color hex code.
 * @property {string} createdAt - Profile creation ISO timestamp.
 * @property {number} expenseCount - Count of logged expenses in this profile.
 * @property {boolean} [isActive] - Whether this is the currently active profile.
 */

/**
 * Isolated profile data store encapsulating all financial entries for a profile.
 *
 * @typedef {Object} ProfileData
 * @property {Expense[]} expenses - Private expense ledger.
 * @property {string[]} categories - Configured expense categories.
 * @property {ExpensePreset[]} presets - Configured 1-click quick presets.
 * @property {SalaryConfig} salaryConfig - Income and pacing budget configurations.
 * @property {string[]} householdMembers - Household members linked to this profile.
 * @property {number} budgetGoal - Calculated monthly discretionary limit.
 * @property {Note[]} notes - Contextual notes attached to dates/expenses.
 * @property {Notification[]} notifications - In-app alerts and notifications.
 * @property {Record<string, string>} [categoryKeywords] - User-trained keyword matching rules.
 * @property {Record<string, *>} [customPreferences] - Profile-specific UI preferences.
 */

/**
 * Full profile container entity stored within the root JSON database.
 *
 * @typedef {Object} Profile
 * @property {string} id - Unique profile ID.
 * @property {string} name - Display name.
 * @property {string} avatar - Display avatar string.
 * @property {string} color - Theme color hex.
 * @property {string} createdAt - Creation timestamp.
 * @property {ProfileData} data - Encapsulated profile state.
 */

// ============================================================================
// 4. Budgeting, Salary Allocation & Pacing Engine
// ============================================================================

/**
 * Configuration parameters for the monthly salary allocator.
 *
 * @typedef {Object} SalaryConfig
 * @property {number} monthlyIncome - Total anticipated net monthly income.
 * @property {number} fixedBills - Non-negotiable recurring commitments (rent, EMI, loans).
 * @property {number} savingsGoal - Target savings reserve to protect each cycle.
 * @property {number} payday - Day of the month income is credited (1–31).
 * @property {string|null} currentCycleStartDate - Explicit start date override (YYYY-MM-DD).
 * @property {string|null} nextPaydayOverride - Explicit next payday override (YYYY-MM-DD).
 * @property {string} currencySymbol - Base display currency symbol (e.g., "₹", "$", "€").
 *
 * // --- Future Extensibility Slots ---
 * @property {'monthly'|'biweekly'|'weekly'} [payFrequency] - Frequency of earnings.
 * @property {Array<{ name: string, target: number, current: number }>} [savingsBuckets] - Goal pots.
 */

/**
 * Computed daily budget pacing and trajectory metrics for a given date.
 *
 * @typedef {Object} DailyBudgetMetrics
 * @property {number} monthlyIncome - Configured base income.
 * @property {number} fixedBills - Configured fixed overheads.
 * @property {number} savingsGoal - Target savings to protect.
 * @property {number} discretionaryBudget - Remaining pool for variable daily spending.
 * @property {string} currencySymbol - Active currency symbol.
 * @property {number} payday - Standard payday date.
 * @property {string} cycleStartDate - Active cycle start date (YYYY-MM-DD).
 * @property {string} nextPaydayDate - Next payday cycle boundary (YYYY-MM-DD).
 * @property {number} totalDaysInCycle - Total days span of active pay cycle.
 * @property {number} daysElapsed - Days completed in active cycle.
 * @property {number} remainingDays - Days remaining until next payday.
 * @property {number} shiftDays - Payday shift delta (+delayed, -early).
 * @property {boolean} isDelayed - True if salary is delayed past standard payday.
 * @property {boolean} isEarly - True if salary arrives early.
 * @property {string|null} stretchGuidance - Actionable safe pacing adjustment message.
 * @property {number} dailyAllowance - Baseline daily spending room (discretionary / cycleDays).
 * @property {number} todaySpent - Sum of expenses logged on the target date.
 * @property {number} todayRemaining - Safe remaining allowance for today.
 * @property {number} spentMonthToDate - Total variable spend in active cycle to date.
 * @property {number} allowedMonthToDate - Pro-rated allowable spend to date.
 * @property {number} rolloverBalance - Cumulative pacing buffer (+safe buffer, -deficit).
 * @property {number} safeDailyLimit - Dynamic safe daily spend for remaining days.
 * @property {'On Track'|'Under Budget (Pacing Ahead)'|'Over Pace (Exceeding Budget)'} pacingStatus - Health state.
 */

// ============================================================================
// 5. Shared Household Hub & Debt Settlement Engine
// ============================================================================

/**
 * Individual debt resolution stream from debtor to creditor.
 *
 * @typedef {Object} PairwiseSettlement
 * @property {string} from - Name of the person who owes money.
 * @property {string} to - Name of the person who should receive money.
 * @property {number} amount - Cleared transfer amount.
 */

/**
 * Complete household financial balance and pairwise settlement breakdown.
 *
 * @typedef {Object} SettlementAnalysis
 * @property {string[]} members - All participating members.
 * @property {number} sharedExpensesCount - Count of shared transactions analyzed.
 * @property {number} totalSharedAmount - Sum of all shared expenditures.
 * @property {number} totalSettledAmount - Cumulative historical reimbursements settled.
 * @property {number} settlementHistoryCount - Count of past settled transfers.
 * @property {Record<string, number>} paidMap - Map of member -> total money paid out.
 * @property {Record<string, number>} owesMap - Map of member -> total fair share consumed.
 * @property {Record<string, number>} balances - Net position (+owed to member, -member owes).
 * @property {PairwiseSettlement[]} settlements - Optimized minimal transfer transactions.
 */

/**
 * Permanent record of a completed debt repayment or reimbursement between members.
 *
 * @typedef {Object} SettlementRecord
 * @property {string} id - Unique settlement ID (e.g., "stl-1724000000-abcd").
 * @property {string} from - Payer member name.
 * @property {string} to - Recipient member name.
 * @property {number} amount - Monetary amount transferred.
 * @property {string} paymentMethod - Transfer channel used (UPI, Bank, Cash).
 * @property {string} date - Date payment occurred (YYYY-MM-DD).
 * @property {string} [notes] - Optional reference memo or transaction ID.
 * @property {string|null} [receiptFilename] - Optional screenshot of payment receipt.
 * @property {string} createdAt - ISO recording timestamp.
 */

/**
 * Scheduled recurring household utility bill definition.
 *
 * @typedef {Object} RecurringBill
 * @property {string} id - Unique bill ID (e.g., "rec-1").
 * @property {string} title - Bill title (e.g., "Airtel Fiber Broadband").
 * @property {string} icon - Lucide icon name (e.g., "wifi", "zap", "flame").
 * @property {number} amount - Expected bill amount.
 * @property {string} category - Assigned expense category.
 * @property {number} dueDay - Day of month bill falls due (1–31).
 * @property {'monthly'|'quarterly'|'yearly'} frequency - Recurrence interval.
 * @property {string} paidBy - Default designated payer member.
 * @property {string[]} splitWith - Members who share this utility cost.
 * @property {boolean} autoSplit - Whether marking paid automatically creates a shared expense.
 * @property {string|null} lastPaidDate - ISO date of last recorded payment cycle.
 *
 * // --- Future Extensibility Slots ---
 * @property {string} [accountNumber] - Provider account or consumer identification number.
 * @property {boolean} [autoPay] - Flag indicating automatic bank debit.
 * @property {number} [gracePeriodDays] - Extra days allowed before late fees accrue.
 */

// ============================================================================
// 6. Contextual Notes System
// ============================================================================

/**
 * Contextual note attached to a specific dimension of the financial timeline.
 *
 * @typedef {Object} Note
 * @property {string} id - Unique note ID (e.g., "note-1724000000-abcd").
 * @property {string} content - Markdown or plain-text note body.
 * @property {'transaction'|'day'|'week'|'month'} relation - Associated domain entity type.
 * @property {string} relationId - Foreign key (Expense ID, YYYY-MM-DD, YYYY-Www, or YYYY-MM).
 * @property {string} createdAt - Note creation ISO timestamp.
 * @property {string} updatedAt - Note last updated ISO timestamp.
 *
 * // --- Future Extensibility Slots ---
 * @property {string[]} [tags] - Categorical note labels.
 * @property {boolean} [isPinned] - Highlighted priority note.
 * @property {string[]} [mentions] - Household members referenced in note.
 */

// ============================================================================
// 7. Active Notifications & System Alerts
// ============================================================================

/**
 * User-configurable preferences for proactive desktop alerts.
 *
 * @typedef {Object} NotificationConfig
 * @property {boolean} enableNative - Trigger OS desktop push notifications for critical items.
 * @property {boolean} dailyNudge - Show evening reminder if zero expenses were logged today.
 * @property {string} nudgeTime - 24-hour time string for daily reminder (default "18:00").
 * @property {boolean} overdueDebtAlerts - Flag household shared debts unpaid > 7 days.
 */

/**
 * In-app notification or system alert record.
 *
 * @typedef {Object} Notification
 * @property {string} id - Unique notification ID (e.g., "notif-1724000000-abcd").
 * @property {'system'|'budget'|'bill'|'household'|'reminder'|'payday'} type - Notification domain.
 * @property {string} title - Short notification heading.
 * @property {string} message - Explanatory narrative text.
 * @property {string} icon - Lucide icon name.
 * @property {boolean} isCritical - High-priority alert requiring immediate notice.
 * @property {boolean} read - Acknowledged / read status.
 * @property {string} createdAt - Notification creation ISO timestamp.
 * @property {string|null} [actionTab] - UI tab to open when notification is clicked.
 */

// ============================================================================
// 8. Universal File Import & Ingestion Pipeline
// ============================================================================

/**
 * Standardized parsing report generated by the Universal File Importer.
 *
 * @typedef {Object} FileImportResult
 * @property {boolean} success - Whether at least one valid record was extracted.
 * @property {Partial<Expense>[]} expenses - Parsed raw transaction candidate entries.
 * @property {string[]} errors - Fatal parse failures or parse abort reasons.
 * @property {string[]} warnings - Skipped rows, ambiguous dates, or fallback conversions.
 * @property {'csv'|'xls'|'xlsx'|'ofx'|'qfx'|'json'|'pdf'|'unknown'} format - Detected source format.
 * @property {number} [totalRowsScanned] - Total lines/records inspected in source file.
 */

// ============================================================================
// 9. Root Storage Database Schema Contract
// ============================================================================

/**
 * Full disk JSON database schema contract (expenses_db.json).
 *
 * @typedef {Object} RootData
 * @property {AccountCredentials} account - Master account credentials and settings.
 * @property {string} activeProfileId - Currently selected active profile ID.
 * @property {Profile[]} profiles - List of all user profiles with encapsulated ledgers.
 * @property {SettlementRecord[]} [settlements] - Global shared household debt settlement log.
 * @property {RecurringBill[]} [recurringBills] - Scheduled recurring utility bills.
 * @property {number} [schemaVersion] - Database migration version tag (e.g., 2).
 */

// ============================================================================
// 10. Mobile Synchronization & Queue Schema Contracts (Phase 0.6.1)
// ============================================================================

/**
 * Mobile-originated transaction record maintaining 100% field parity with desktop Expense
 * while embedding vector clock and synchronization metadata.
 *
 * @typedef {Object} MobileTransaction
 * @property {string} id - Unique identifier (e.g., "exp-mob-1724000000-abcd").
 * @property {string} title - Primary display title / payee / merchant name.
 * @property {number} amount - Transaction monetary value (must be >= 0.01).
 * @property {string} category - Assigned expense category.
 * @property {string} paymentMethod - Method used (UPI, Credit Card, Cash, etc.).
 * @property {string} date - Local ISO date string (YYYY-MM-DD).
 * @property {string} [description] - Optional notes, narrative, or memo.
 * @property {string[]} [tags] - Searchable labels or taxonomy tags.
 * @property {string|null} [receiptFilename] - Linked receipt photo image filename.
 * @property {string} [paidBy] - Payer name or member identifier (default: "Self").
 * @property {string[]} [splitWith] - Household members sharing this expense.
 * @property {boolean} [isHouseholdExpense] - Whether this entry participates in split balances.
 * @property {string} [currency] - ISO 4217 currency code (e.g., "INR", "USD", "EUR").
 * @property {number} [exchangeRate] - Conversion multiplier relative to base currency.
 *
 * // --- Vector Clock & Offline Sync Metadata ---
 * @property {string} originNodeId - Identifier of originating client (e.g. "mobile-uuid").
 * @property {number} version - Monotonic vector version clock (starts at 1).
 * @property {string} updatedAt - ISO 8601 mutation timestamp.
 * @property {string|null} deletedAt - ISO 8601 soft-deletion timestamp or null for active.
 * @property {'queued'|'pending'|'in-flight'|'synced'|'failed'|'conflict'} syncStatus - Mobile synchronization lifecycle state.
 * @property {string} localCreatedAt - ISO 8601 creation timestamp on the mobile device.
 */

/**
 * Local staging container for camera-captured receipts awaiting OCR or desktop sync.
 *
 * @typedef {Object} MobileReceiptQueueItem
 * @property {string} id - Unique receipt queue entry identifier (e.g. "rcq-uuid").
 * @property {string} localUri - Local file URI or device path (Capacitor Filesystem / converted URI).
 * @property {string} capturedAt - ISO 8601 capture timestamp.
 * @property {number} fileSize - File size in bytes (must be > 0 and <= 50MB).
 * @property {string} mimeType - Image MIME type ('image/jpeg', 'image/png', 'application/pdf').
 * @property {number|null} [draftAmount] - Preliminary extracted or user-keyed amount.
 * @property {string|null} [draftMerchant] - Preliminary extracted or user-keyed merchant name.
 * @property {string|null} [draftDate] - Preliminary extracted date (YYYY-MM-DD).
 * @property {string|null} [notes] - User notes or memos attached during capture.
 * @property {'queued'|'processing'|'synced'|'failed'} syncStatus - Processing/sync state.
 * @property {number} [retryCount] - Consecutive failed sync/OCR attempts (integer >= 0).
 * @property {string|null} [lastError] - Error diagnostics if sync or OCR failed.
 */

/**
 * Atomic offline mutation journal entry queued for local network synchronization.
 *
 * @typedef {Object} SyncQueueItem
 * @property {string} id - Unique queue entry identifier (e.g. "sync-uuid").
 * @property {'expense'|'receipt'|'profile'|'category'} entityType - Domain entity type.
 * @property {string} entityId - Target entity identifier.
 * @property {'create'|'update'|'delete'} action - Mutation operation.
 * @property {Record<string, *>} payload - Serialized entity payload or delta changes.
 * @property {string} timestamp - ISO 8601 mutation timestamp.
 * @property {string} clientMutationId - Idempotency key preventing duplicate application.
 * @property {'pending'|'in-flight'|'failed'|'resolved'} status - Queue processing status.
 * @property {number} [retryCount] - Sync delivery attempt counter.
 * @property {Record<string, *>} [conflictResolution] - Audit details if resolved via LWW merge.
 */

/**
 * Encapsulated synchronization payload batch for peer-to-peer Wi-Fi exchange.
 *
 * @typedef {Object} MobileSyncBatch
 * @property {string} batchId - Unique batch transmission ID.
 * @property {string} clientNodeId - Mobile device identifier.
 * @property {string} timestamp - Batch transmission ISO timestamp.
 * @property {SyncQueueItem[]} mutations - Ordered array of pending mutations.
 * @property {MobileReceiptQueueItem[]} [pendingReceipts] - Accompanying receipt metadata.
 */

module.exports = {};

