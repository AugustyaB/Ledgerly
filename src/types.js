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

// ============================================================================
// 11. Adaptive Receipt Intelligence & Learning Loop Contracts (Phase 0.8.1)
// ============================================================================

/**
 * Field-level confidence ratings computed for core extraction fields (0.0 to 1.0).
 *
 * @typedef {Object} FieldConfidenceMap
 * @property {number} merchant - Confidence rating for merchant name (0.0 - 1.0).
 * @property {number} date - Confidence rating for transaction date (0.0 - 1.0).
 * @property {number} total - Confidence rating for grand total (0.0 - 1.0).
 * @property {number} tax - Confidence rating for tax and statutory breakdown (0.0 - 1.0).
 */

/**
 * Learned repeat merchant layout structural memory.
 *
 * @typedef {Object} MerchantLayoutRecord
 * @property {number} hitCount - Cumulative count of receipts parsed from this vendor.
 * @property {string} firstSeenAt - ISO 8601 timestamp when vendor layout was first observed.
 * @property {string} lastSeenAt - ISO 8601 timestamp of most recent match.
 * @property {string|null} [totalAnchor] - Specific total keyword anchor (e.g. 'NET PAYABLE').
 * @property {string|null} [datePattern] - Preferred date formatting pattern (e.g. 'DD/MM/YYYY').
 * @property {'GST'|'VAT'|'SALES_TAX'|null} [taxType] - Structural tax category identifier.
 */

// ============================================================================
// 12. EDA & Data Foundation Contracts (Phase 0.8.2)
// ============================================================================

/**
 * Diagnostic issue identified during ledger data quality audits.
 *
 * @typedef {Object} DataQualityIssue
 * @property {number} index - Index of the expense in the evaluated array.
 * @property {string} id - Transaction identifier.
 * @property {string} field - Affected record attribute.
 * @property {'fatal'|'warning'|'info'} severity - Defect severity rating.
 * @property {string} reason - Human-readable explanation of defect.
 * @property {any} originalValue - Offending value prior to sanitization.
 */

/**
 * Comprehensive diagnostic report returned by the Data Quality Auditor.
 *
 * @typedef {Object} DataQualityAuditResult
 * @property {number} totalScanned - Total count of inspected transactions.
 * @property {number} cleanCount - Count of fully valid, defect-free transactions.
 * @property {number} defectCount - Count of transactions containing one or more issues.
 * @property {number} qualityScore - Overall data integrity score (0.0 to 100.0%).
 * @property {Record<string, number>} summary - Defect breakdown by category.
 * @property {DataQualityIssue[]} issues - Detailed list of recorded issues.
 */

/**
 * Result returned after non-destructive data quality sanitization.
 *
 * @typedef {Object} DataQualitySanitizationResult
 * @property {number} totalScanned - Total count of processed transactions.
 * @property {number} repairedCount - Count of transactions repaired.
 * @property {number} unmodifiedCount - Count of transactions requiring no repair.
 * @property {Expense[]} sanitizedExpenses - Cleaned copies of expense records.
 * @property {Array<{ id: string, field: string, originalValue: any, sanitizedValue: any, reason: string }>} changes - Detailed changelog.
 */

/**
 * Aggregated metrics for a single calendar day.
 *
 * @typedef {Object} DailyRollupItem
 * @property {string} date - Calendar date (YYYY-MM-DD).
 * @property {number} total - Grand sum of expenditures on this date.
 * @property {number} count - Count of transactions.
 * @property {Record<string, number>} categoryBreakdown - Category spending totals.
 * @property {Record<string, number>} paymentBreakdown - Payment method breakdown.
 */

/**
 * Aggregated metrics for a calendar month.
 *
 * @typedef {Object} MonthlyRollupItem
 * @property {string} month - Year and month key (YYYY-MM).
 * @property {number} total - Grand sum of expenditures in this month.
 * @property {number} count - Transaction count.
 * @property {number} averagePerDay - Mean daily expenditure across calendar days in month.
 * @property {Record<string, number>} categoryBreakdown - Category spending totals.
 */

/**
 * Category-level statistical and aggregation rollup metrics.
 *
 * @typedef {Object} CategoryRollupItem
 * @property {string} category - Category label.
 * @property {number} total - Total amount spent in this category.
 * @property {number} count - Number of transactions.
 * @property {number} percentage - Percentage of total ledger expenditure (0 - 100).
 * @property {number} averageTransaction - Mean amount per transaction.
 * @property {number} minTransaction - Smallest transaction amount.
 * @property {number} maxTransaction - Largest transaction amount.
 */

/**
 * Sliding window spending velocity and pacing metrics.
 *
 * @typedef {Object} VelocityMetrics
 * @property {number} velocity7d - 7-day average daily spend.
 * @property {number} velocity30d - 30-day average daily spend.
 * @property {number} dailyAverage - Overall mean daily expenditure.
 * @property {number} dailyStdDev - Standard deviation of daily spending totals.
 * @property {number} activeDays - Days with at least one transaction.
 * @property {number} totalDays - Total calendar span in days.
 */

/**
 * Proactive safe-to-spend allowance forecast.
 *
 * @typedef {Object} SafeToSpendForecast
 * @property {string} targetDate - Target calculation date (YYYY-MM-DD).
 * @property {number} safeDailyAllowance - Safe expenditure target for today.
 * @property {number} remainingDiscretionary - Available discretionary pool in current cycle.
 * @property {number} daysRemaining - Days remaining in cycle.
 * @property {number} velocityAdjustment - Multiplier applied based on 7-day spending trends.
 * @property {'healthy'|'caution'|'critical'} pacingStatus - Overall pacing health status.
 * @property {string} currencySymbol - Active currency symbol.
 */

/**
 * Statistical spending anomaly detection entry.
 *
 * @typedef {Object} SpendingAnomaly
 * @property {string} expenseId - Anomaly transaction ID.
 * @property {string} title - Transaction title or payee.
 * @property {number} amount - Transaction monetary value.
 * @property {string} date - Transaction date (YYYY-MM-DD).
 * @property {string} category - Assigned category.
 * @property {number} zScore - Statistical Z-score outlier metric.
 * @property {number} categoryMean - Category baseline mean amount.
 * @property {'moderate'|'high'|'extreme'} severity - Anomaly severity classification.
 * @property {string} explanation - Human-readable explanation.
 */

// ============================================================================
// Section 13: Statement Reconciliation & Multi-Signal Deduplication Types
// ============================================================================

/**
 * Breakdown of individual signal confidence scores for a match candidate.
 *
 * @typedef {Object} ReconciliationSignalScores
 * @property {number} amount - Amount proximity score (0.0 to 1.0).
 * @property {number} date - Date proximity score (0.0 to 1.0).
 * @property {number} merchant - Merchant string similarity score (0.0 to 1.0).
 * @property {number} merchantLevenshtein - Normalized Levenshtein ratio (0.0 to 1.0).
 * @property {number} merchantJaccard - Token Jaccard index (0.0 to 1.0).
 * @property {boolean} isExact - Whether amount and date are an exact match.
 */

/**
 * Candidate ledger expense record matched against an imported statement row.
 *
 * @typedef {Object} ReconciliationCandidate
 * @property {Expense} expense - Matched ledger expense record.
 * @property {number} score - Overall composite confidence score (0.0 to 1.0).
 * @property {ReconciliationSignalScores} signals - Component signal score breakdown.
 * @property {string} explanation - Human-readable rationale for matching.
 */

/**
 * Tri-state reconciliation result for an individual imported statement transaction.
 *
 * @typedef {Object} ReconciliationItemResult
 * @property {string} id - Identifier of the incoming statement transaction.
 * @property {Object} incoming - Raw or normalized incoming statement transaction.
 * @property {'matched_merged'|'net_new'|'conflict'} status - Tri-state classification.
 * @property {ReconciliationCandidate|null} match - Best-matched candidate if matched.
 * @property {ReconciliationCandidate[]} candidates - Top ranked matching candidates.
 * @property {string} reason - Human-readable explanation of classification.
 */

/**
 * Batch reconciliation response payload.
 *
 * @typedef {Object} ReconciliationBatchResult
 * @property {ReconciliationItemResult[]} results - Per-item reconciliation results.
 * @property {Object} stats - Aggregate reconciliation statistics.
 * @property {number} stats.total - Total transactions evaluated.
 * @property {number} stats.matched - Count of confident matches.
 * @property {number} stats.netNew - Count of net-new transactions.
 * @property {number} stats.conflicts - Count of ambiguous/conflicting matches.
 * @property {number} executionTimeMs - Milliseconds elapsed during reconciliation.
 * @property {boolean} timedOut - Whether execution exceeded timeout threshold.
 * @property {string} strategy - 'multi_signal_fuzzy' or 'exact_fallback'.
 */

/**
 * Human resolution instruction for an individual reconciliation item.
 *
 * @typedef {Object} ReconciliationResolution
 * @property {string} incomingId - ID of the incoming statement transaction.
 * @property {'merge'|'import'|'skip'} action - User resolution action.
 * @property {string} [matchedExpenseId] - Target ledger expense ID if action is 'merge'.
 * @property {Partial<Expense>} [expenseData] - Transaction data if action is 'import'.
 */

/**
 * Execution outcome summary after applying reconciliation resolutions.
 *
 * @typedef {Object} ReconciliationApplyResult
 * @property {boolean} success - Whether resolutions applied without fatal errors.
 * @property {number} mergedCount - Number of transactions merged into existing ledger.
 * @property {number} importedCount - Number of net-new transactions inserted.
 * @property {number} skippedCount - Number of transactions ignored.
 * @property {string[]} errors - Any non-fatal error messages encountered.
 */

// ============================================================================
// Section 14: Smart Insights, Behavioral Notifications & Subscription Hunter Types
// ============================================================================

/**
 * Recognized recurring subscription frequency cadence.
 *
 * @typedef {'weekly'|'bi-weekly'|'monthly'|'quarterly'|'annual'} SubscriptionCadence
 */

/**
 * Diagnostic details regarding a detected subscription price increase.
 *
 * @typedef {Object} PriceHikeDetails
 * @property {boolean} hasPriceHike - Whether a price hike was detected.
 * @property {number} previousAmount - Historical baseline charge amount.
 * @property {number} currentAmount - Most recent charge amount.
 * @property {number} hikePercent - Percentage increase relative to baseline.
 * @property {number} hikeDifference - Absolute currency increase per billing cycle.
 * @property {number} annualHikeImpact - Projected annualized additional expenditure.
 */

/**
 * Detected recurring subscription or repeating vendor commitment.
 *
 * @typedef {Object} SubscriptionItem
 * @property {string} id - Deterministic unique identifier (e.g., "sub-netflix-monthly").
 * @property {string} merchant - Cleaned and normalized vendor/merchant name.
 * @property {SubscriptionCadence} cadence - Detected recurrence interval.
 * @property {number} occurrencesCount - Total count of detected recurring charges.
 * @property {number} averageAmount - Mean transaction amount across occurrences.
 * @property {number} lastAmount - Most recent transaction amount.
 * @property {string} lastDate - Date of latest charge (YYYY-MM-DD).
 * @property {string} nextExpectedDate - Projected next billing date (YYYY-MM-DD).
 * @property {number} annualCost - Projected total expenditure over 12 months.
 * @property {number} monthlyCost - Normalized monthly expenditure burden.
 * @property {number} confidence - Statistical regular-interval confidence score (0.0 to 1.0).
 * @property {boolean} hasPriceHike - Whether an unannounced price hike was flagged.
 * @property {PriceHikeDetails|null} priceHikeDetails - Price hike breakdown if flagged.
 * @property {boolean} isZombie - Whether flagged as dormant/forgotten recurring charge.
 * @property {string|null} zombieReason - Diagnostic rationale for zombie status.
 * @property {string[]} expenseIds - Array of linked transaction IDs.
 */

/**
 * Aggregate summary across all detected subscriptions.
 *
 * @typedef {Object} SubscriptionSummary
 * @property {number} totalSubscriptions - Total active subscriptions identified.
 * @property {number} totalMonthlyCommitment - Aggregate monthly commitment burden.
 * @property {number} totalAnnualCommitment - Aggregate annual recurring expenditure.
 * @property {number} priceHikesDetected - Count of active subscriptions with recent hikes.
 * @property {number} zombieCount - Count of subscriptions flagged as dormant/zombie.
 */

/**
 * Encapsulated subscription detection result payload.
 *
 * @typedef {Object} SubscriptionDetectionResult
 * @property {SubscriptionItem[]} subscriptions - Array of detected recurring subscriptions.
 * @property {SubscriptionSummary} summary - Aggregated metrics and commitments.
 */

/**
 * Extended "What-If" simulation output with statistical burn rate & runway forecasting.
 *
 * @typedef {Object} ForesightBurnRateResult
 * @property {number} testAmount - Simulated purchase amount.
 * @property {number} discretionaryPool - Monthly discretionary pool.
 * @property {number} spentMTD - Month-to-date expenditure.
 * @property {number} remainingDiscretionary - Remaining discretionary budget.
 * @property {number} daysRemaining - Days remaining in active cycle.
 * @property {number} subsequentDays - Days remaining after simulation date.
 * @property {number} currentPace - Daily discretionary pace without purchase.
 * @property {number} projectedPace - Projected daily pace with purchase.
 * @property {number} dailyDrop - Reduction in daily breathing room.
 * @property {number} dropPercentage - Percentage reduction in daily pace.
 * @property {'SAFE'|'CAUTION'|'CRITICAL'} riskLevel - Qualitative risk tier.
 * @property {string} statusHeadline - Short human-readable headline.
 * @property {string} statusMessage - Detailed explanatory guidance.
 * @property {boolean} isDataGated - Whether burn rate forecasting is locked due to insufficient data.
 * @property {number} activeDays - Distinct calendar days logged in ledger.
 * @property {number} requiredDays - Minimum logged days required to unlock (20).
 * @property {number} daysRemainingToUnlock - Days needed until forecast unlocks.
 * @property {number} unlockProgressPct - Percentage progress towards unlocking (0-100).
 * @property {string} [gateMessage] - Informational message explaining data-lock status.
 * @property {number} [burnRate] - Weighted statistical daily burn rate (₹/day).
 * @property {number} [burnRate7d] - Rolling 7-day average daily burn rate.
 * @property {number} [burnRate30d] - Rolling 30-day average daily burn rate.
 * @property {number} [currentRunway] - Days until zero balance under current burn rate.
 * @property {number} [projectedRunway] - Projected days until zero after simulated purchase.
 * @property {number} [runwayDrop] - Days of cash runway shortened by purchase.
 */

/**
 * Gamified daily pacing and velocity encouragement insight.
 *
 * @typedef {Object} PacingInsightResult
 * @property {string} title - Insight title.
 * @property {string} message - Human-readable encouragement message.
 * @property {number} safeDailyAllowance - Current safe daily allowance.
 * @property {number} daysRemaining - Days remaining in active cycle.
 * @property {'on_track'|'caution'|'behind'} pacingStatus - Categorical pacing status.
 * @property {string} currencySymbol - Active currency symbol.
 */

module.exports = {};
