'use strict';

/**
 * @fileoverview Universal Ingestion & Scanned Bill Review Cockpit View
 *
 * Architecture Position: src/ui/views/ImportView.js
 * Role: Manages multi-document intake queue, on-device ML scanning orchestration,
 *       Smart Document Analyzer (3-way classification: Invoice, Multiple Bills, Statement),
 *       side-by-side review cockpit with an interactive zoom/pan/rotate document viewer,
 *       auto-approval threshold evaluation, dense bill line-item editing with live
 *       arithmetic table reconciliation, and 1-click batch database commitment.
 * Dependencies: AppState, window.electronAPI, dom helpers, formatters, toast
 * Extracted & Overhauled from: src/app.js & v0.4 ImportView
 */

import { escapeHTML, setInnerHTML } from '../helpers/dom.js';
import { formatCurrency } from '../helpers/formatters.js';
import { showToast } from '../helpers/toast.js';

export class ImportView {
  /** @type {import('../AppState.js').AppState} */
  #state;

  /** @type {any} */
  #api;

  /** @type {function(): Promise<void>} */
  #refreshAppData;

  /** @type {function(string): void} */
  #switchTab;

  /** @type {Array<any>} */
  #pendingExpenses = [];

  /** @type {any|null} */
  #reconciliationBatchResult = null;

  /** @type {Map<number, { action: string, matchedExpenseId?: string, incomingId?: string }>} */
  #itemResolutions = new Map();

  /** @type {Array<function(): void>} */
  #cleanupListeners = [];

  /** @type {'ml-queue'|'statements'} */
  #activeSubTab = 'ml-queue';

  /**
   * Queue of uploaded/intake documents.
   * @type {Array<{
   *   id: string,
   *   filePath: string,
   *   filename: string,
   *   status: 'scanning'|'auto-approved'|'needs-review'|'rejected',
   *   confidence: number,
   *   reason: string,
   *   extractedData: any,
   *   editedData: any,
   *   lineItems: Array<any>,
   *   smartAnalysis: any,
   *   currentPage: number,
   *   totalPages: number,
   *   zoomLevel: number,
   *   rotation: number,
   *   isDuplicate: boolean
   * }>}
   */
  #queue = [];

  /** @type {string|null} */
  #activeQueueItemId = null;

  // ==========================================================================
  //  Constructor
  // ==========================================================================

  /**
   * @param {import('../AppState.js').AppState} state - Application state store
   * @param {any} [api] - IPC bridge (defaults to window.electronAPI)
   * @param {function(): Promise<void>} [refreshAppData] - Global data loader callback
   * @param {function(string): void} [switchTab] - Global tab router callback
   */
  constructor(state, api = window.electronAPI, refreshAppData = async () => {}, switchTab = () => {}) {
    this.#state = state;
    this.#api = api;
    this.#refreshAppData = refreshAppData;
    this.#switchTab = switchTab;
  }

  // ==========================================================================
  //  Lifecycle Interface (ViewContract)
  // ==========================================================================

  /**
   * Mounts the view, binds all event listeners, and configures dropzones.
   *
   * @param {HTMLElement|null} [_container]
   * @returns {void}
   */
  mount(_container) {
    this.#bindSubNavTabs();
    this.#bindMlQueueControls();
    this.#bindViewerControls();
    this.#bindCockpitFormControls();
    this.#bindStatementControls();
    this.#bindModalControls();
    this.setupDragAndDrop();
    this.render();
  }

  /**
   * Renders the active sub-tab and current queue state.
   *
   * @returns {void}
   */
  render() {
    if (typeof document === 'undefined') return;

    // 1. Update sub-nav badges
    const queueBadge = document.getElementById('ml-queue-pill-count');
    if (queueBadge) {
      const qLen = this.#queue.length;
      queueBadge.textContent = String(qLen);
      if (qLen > 0) {
        queueBadge.classList.remove('hidden');
      } else {
        queueBadge.classList.add('hidden');
      }
    }

    // 2. Render active sub-view
    if (this.#activeSubTab === 'ml-queue') {
      this.#renderMlQueue();
    } else {
      this.#renderStatements();
    }
  }

  /**
   * Unmounts listeners and clears queue state.
   *
   * @returns {void}
   */
  unmount() {
    for (const cleanup of this.#cleanupListeners) {
      cleanup();
    }
    this.#cleanupListeners = [];
  }

  // ==========================================================================
  //  Sub-Navigation Switching
  // ==========================================================================

  #bindSubNavTabs() {
    if (typeof document === 'undefined') return;

    const btnQueue = document.getElementById('subtab-btn-ml-queue');
    const btnStatements = document.getElementById('subtab-btn-statements');
    const subviewQueue = document.getElementById('import-subview-ml-queue');
    const subviewStatements = document.getElementById('import-subview-statements');

    const switchSubTab = targetTab => {
      this.#activeSubTab = targetTab;
      if (targetTab === 'ml-queue') {
        btnQueue?.classList.add('active');
        btnStatements?.classList.remove('active');
        subviewQueue?.classList.remove('hidden');
        subviewQueue?.classList.add('active');
        subviewStatements?.classList.add('hidden');
        subviewStatements?.classList.remove('active');
      } else {
        btnStatements?.classList.add('active');
        btnQueue?.classList.remove('active');
        subviewStatements?.classList.remove('hidden');
        subviewStatements?.classList.add('active');
        subviewQueue?.classList.add('hidden');
        subviewQueue?.classList.remove('active');
      }
      this.render();
    };

    btnQueue?.addEventListener('click', () => switchSubTab('ml-queue'));
    btnStatements?.addEventListener('click', () => switchSubTab('statements'));

    this.#cleanupListeners.push(() => {
      btnQueue?.removeEventListener('click', () => switchSubTab('ml-queue'));
      btnStatements?.removeEventListener('click', () => switchSubTab('statements'));
    });
  }

  // ==========================================================================
  //  ML Queue Intake & Processing Engine
  // ==========================================================================

  #bindMlQueueControls() {
    if (typeof document === 'undefined') return;

    const browseBtn = document.getElementById('btn-ml-select-files');
    const dropzone = document.getElementById('ml-queue-dropzone');
    const clearBtn = document.getElementById('btn-ml-clear-queue');
    const commitApprovedBtn = document.getElementById('btn-ml-commit-approved');
    const docTypeToggles = document.querySelectorAll('#ml-doc-type-toggle .ml-analyzer-btn');

    // 1. Browse files button
    const handleBrowse = async () => {
      if (!this.#api?.selectReceiptDocuments) return;
      try {
        const res = await this.#api.selectReceiptDocuments();
        if (res && res.success && Array.isArray(res.filePaths) && res.filePaths.length > 0) {
          await this.enqueueFiles(res.filePaths);
        }
      } catch (err) {
        console.error('[ImportView] Multi-file selection error:', err);
      }
    };
    browseBtn?.addEventListener('click', handleBrowse);

    // 2. Dropzone drag-and-drop
    if (dropzone) {
      const onDragOver = e => {
        e.preventDefault();
        dropzone.classList.add('drag-over');
      };
      const onDragLeave = () => {
        dropzone.classList.remove('drag-over');
      };
      const onDrop = async e => {
        e.preventDefault();
        dropzone.classList.remove('drag-over');
        if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
          const filePaths = Array.from(e.dataTransfer.files)
            .map(f => f.path)
            .filter(Boolean);
          if (filePaths.length > 0) {
            await this.enqueueFiles(filePaths);
          }
        }
      };

      dropzone.addEventListener('dragover', onDragOver);
      dropzone.addEventListener('dragleave', onDragLeave);
      dropzone.addEventListener('drop', onDrop);

      this.#cleanupListeners.push(() => {
        dropzone.removeEventListener('dragover', onDragOver);
        dropzone.removeEventListener('dragleave', onDragLeave);
        dropzone.removeEventListener('drop', onDrop);
      });
    }

    // 3. Clear Queue
    clearBtn?.addEventListener('click', () => {
      this.#queue = [];
      this.#activeQueueItemId = null;
      this.render();
      showToast('Cleared scanned bills queue.');
    });

    // 4. Commit All Approved
    commitApprovedBtn?.addEventListener('click', async () => {
      await this.commitAllApproved();
    });

    // 5. Smart Document Analyzer 3-Way Mode Toggles
    docTypeToggles.forEach(btn => {
      btn.addEventListener('click', () => {
        const targetType = btn.getAttribute('data-type');
        if (targetType) {
          this.reclassifyActiveDocument(targetType);
        }
      });
    });

    this.#cleanupListeners.push(() => {
      browseBtn?.removeEventListener('click', handleBrowse);
    });
  }

  /**
   * Enqueues and begins background document intelligence on multiple files.
   *
   * @param {string[]} filePaths
   * @returns {Promise<void>}
   */
  async enqueueFiles(filePaths) {
    if (!Array.isArray(filePaths) || filePaths.length === 0) return;

    const engineSelect = /** @type {HTMLSelectElement|null} */ (document.getElementById('ml-queue-engine-select'));
    const preferredEngine = engineSelect ? engineSelect.value : 'auto';

    showToast(`Queued ${filePaths.length} document${filePaths.length > 1 ? 's' : ''} for on-device scanning...`);

    for (const filePath of filePaths) {
      const filename = filePath.split(/[\\/]/).pop() || 'document';
      const id = 'doc_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);

      const queueItem = {
        id,
        filePath,
        filename,
        status: 'scanning',
        confidence: 0,
        reason: 'Scanning with on-device ML model...',
        extractedData: null,
        editedData: null,
        lineItems: [],
        smartAnalysis: null,
        currentPage: 1,
        totalPages: 1,
        zoomLevel: 1.0,
        rotation: 0,
        isDuplicate: false
      };

      this.#queue.push(queueItem);
      if (!this.#activeQueueItemId) {
        this.#activeQueueItemId = id;
      }
    }

    this.render();

    // Process queued documents sequentially in background
    for (const item of this.#queue) {
      if (item.status === 'scanning') {
        await this.#processQueueItem(item, preferredEngine);
        this.render();
      }
    }
  }

  /**
   * Runs document intelligence on a single queue item.
   *
   * @param {any} item
   * @param {string} engine
   * @returns {Promise<void>}
   */
  async #processQueueItem(item, engine) {
    try {
      const res = await this.#api.scanReceiptDocument(item.filePath, {
        engine,
        filename: item.filename
      });

      if (!res || !res.success || !res.data) {
        item.status = 'rejected';
        item.confidence = 0;
        item.reason = res?.error || 'Document rejected: No financial data found.';
        return;
      }

      const data = res.data;
      item.extractedData = data;
      item.confidence = data.confidence || 0.8;
      item.lineItems = Array.isArray(data.lineItems) ? JSON.parse(JSON.stringify(data.lineItems)) : [];
      item.totalPages = data.pageCount || (data.pages ? data.pages.length : 1) || 1;
      item.smartAnalysis = data.smartAnalysis || {
        type: item.totalPages > 1 ? 'invoice' : 'invoice',
        confidence: 0.9,
        rationale: 'Single receipt processed.',
        pageCount: item.totalPages
      };

      // Check duplicate against existing expenses
      const isDup = this.isPotentialDuplicate({
        date: data.date,
        amount: data.total,
        title: data.merchant
      });
      item.isDuplicate = isDup;

      // Initialize edited form fields
      item.editedData = {
        merchant: data.merchant || 'Unknown Merchant',
        date: data.date || new Date().toISOString().split('T')[0],
        total: parseFloat(data.total) || 0,
        tax: parseFloat(data.taxAmount !== undefined ? data.taxAmount : data.tax || 0) || 0,
        category: data.category || 'Dining Out',
        paymentMethod: data.paymentMethod || 'UPI',
        description: data.itemizedSummary || '',
        gstin: data.gstin || (data.regionalData && data.regionalData.gstin) || '',
        state: (data.regional && data.regional.stateName) || (data.gstDetails && data.gstDetails.stateName) || '',
        utr:
          (data.regional && data.regional.upiUtr) ||
          (data.regionalData && data.regionalData.upi && data.regionalData.upi.utr) ||
          '',
        regionalData: data.regionalData || null,
        utilityData: data.utilityData || null
      };

      // Evaluate Auto-Approval Threshold (User Directive 2)
      // Confident: >=95% confidence (or >=94%), <=3 line items, reconciled, valid total, no pending UPI prompt, not duplicate
      const UPI_APP_NAMES = ['google pay', 'gpay', 'phonepe', 'paytm', 'bhim', 'cred', 'amazon pay', 'upi', 'unknown'];
      const merchantLower = (data.merchant || '').toLowerCase();
      const isGenericMerchant = !data.merchant || UPI_APP_NAMES.some(app => merchantLower.includes(app));
      const isUpiPayment =
        (data.paymentMethod && data.paymentMethod.toLowerCase().includes('upi')) ||
        UPI_APP_NAMES.some(app => (data.paymentMethod || '').toLowerCase().includes(app));
      const hasPendingUpiPurpose = isUpiPayment && isGenericMerchant;

      const isReconciled = !data.tableLayout || data.tableLayout.reconciled !== false;
      const isHighConfidence = item.confidence >= 0.94 && item.editedData.total > 0;
      const isSimpleBill = item.lineItems.length <= 3;

      if (!data.isTransaction) {
        item.status = 'rejected';
        item.reason = 'Non-financial document (0% financial marker detection).';
      } else if (isHighConfidence && isSimpleBill && isReconciled && !hasPendingUpiPurpose && !isDup) {
        item.status = 'auto-approved';
        item.reason = 'Clean extraction: high confidence, <=3 items, reconciled total.';
      } else {
        item.status = 'needs-review';
        const reasons = [];
        if (item.lineItems.length > 3) reasons.push(`Dense bill with ${item.lineItems.length} items`);
        if (!isReconciled) reasons.push('Item sum mismatch against total');
        if (item.confidence < 0.94) reasons.push('Confidence below 95% threshold');
        if (hasPendingUpiPurpose) reasons.push('UPI purpose requires clarification');
        if (isDup) reasons.push('Potential duplicate record within ±2 days');
        item.reason = reasons.join('; ') || 'Manual review recommended.';
      }

      // Trigger Smart Document Analyzer Toast for multi-page documents
      if (item.totalPages > 1 && item.smartAnalysis) {
        const typeLabels = {
          invoice: 'Multi-Page Invoice',
          'multiple-bills': 'Multiple Separate Bills',
          statement: 'Bank Account Statement'
        };
        const label = typeLabels[item.smartAnalysis.type] || 'Document';
        showToast(`💡 Smart Analyzer: Identified as "${label}" (${item.smartAnalysis.rationale})`);
      }
    } catch (err) {
      item.status = 'rejected';
      item.confidence = 0;
      item.reason = `Inference failure: ${err.message}`;
    }
  }

  /**
   * Reclassifies active document type via the 3-Way Mode Switcher.
   *
   * @param {'invoice'|'multiple-bills'|'statement'} targetType
   * @returns {void}
   */
  reclassifyActiveDocument(targetType) {
    const activeItem = this.#getActiveQueueItem();
    if (!activeItem) return;

    if (targetType === 'statement') {
      // Switch to statements tab and attempt statement extraction
      this.#activeSubTab = 'statements';
      showToast('Routed document to Bank Statements workspace.');
      this.render();
      return;
    }

    if (activeItem.smartAnalysis) {
      activeItem.smartAnalysis.type = targetType;
    }

    if (targetType === 'multiple-bills') {
      showToast(`Reclassified as Multiple Bills (1 receipt per page).`);
    } else {
      showToast(`Reclassified as Single Consolidated Invoice.`);
    }

    this.render();
  }

  // ==========================================================================
  //  Review Cockpit: Document Viewer Controls
  // ==========================================================================

  #bindViewerControls() {
    if (typeof document === 'undefined') return;

    const zoomInBtn = document.getElementById('btn-viewer-zoom-in');
    const zoomOutBtn = document.getElementById('btn-viewer-zoom-out');
    const resetZoomBtn = document.getElementById('btn-viewer-reset-zoom');
    const fitBtn = document.getElementById('btn-viewer-fit');
    const rotCcwBtn = document.getElementById('btn-viewer-rot-ccw');
    const rotCwBtn = document.getElementById('btn-viewer-rot-cw');
    const prevPageBtn = document.getElementById('btn-viewer-prev-page');
    const nextPageBtn = document.getElementById('btn-viewer-next-page');

    zoomInBtn?.addEventListener('click', () => {
      const item = this.#getActiveQueueItem();
      if (!item) return;
      item.zoomLevel = Math.min(3.0, parseFloat((item.zoomLevel + 0.25).toFixed(2)));
      this.#updateViewerTransform();
    });

    zoomOutBtn?.addEventListener('click', () => {
      const item = this.#getActiveQueueItem();
      if (!item) return;
      item.zoomLevel = Math.max(0.5, parseFloat((item.zoomLevel - 0.25).toFixed(2)));
      this.#updateViewerTransform();
    });

    resetZoomBtn?.addEventListener('click', () => {
      const item = this.#getActiveQueueItem();
      if (!item) return;
      item.zoomLevel = 1.0;
      item.rotation = 0;
      this.#updateViewerTransform();
    });

    fitBtn?.addEventListener('click', () => {
      const item = this.#getActiveQueueItem();
      if (!item) return;
      item.zoomLevel = 1.0;
      this.#updateViewerTransform();
    });

    rotCcwBtn?.addEventListener('click', () => {
      const item = this.#getActiveQueueItem();
      if (!item) return;
      item.rotation = (item.rotation - 90 + 360) % 360;
      this.#updateViewerTransform();
    });

    rotCwBtn?.addEventListener('click', () => {
      const item = this.#getActiveQueueItem();
      if (!item) return;
      item.rotation = (item.rotation + 90) % 360;
      this.#updateViewerTransform();
    });

    prevPageBtn?.addEventListener('click', () => {
      const item = this.#getActiveQueueItem();
      if (!item || item.currentPage <= 1) return;
      item.currentPage--;
      this.#renderViewerDocument();
    });

    nextPageBtn?.addEventListener('click', () => {
      const item = this.#getActiveQueueItem();
      if (!item || item.currentPage >= item.totalPages) return;
      item.currentPage++;
      this.#renderViewerDocument();
    });
  }

  #updateViewerTransform() {
    const item = this.#getActiveQueueItem();
    if (!item) return;

    const stage = document.getElementById('ml-viewer-stage');
    const zoomText = document.getElementById('ml-zoom-percentage-text');
    if (stage) {
      stage.style.transform = `scale(${item.zoomLevel}) rotate(${item.rotation}deg)`;
    }
    if (zoomText) {
      zoomText.textContent = `${Math.round(item.zoomLevel * 100)}%`;
    }
  }

  // ==========================================================================
  //  Review Cockpit: Form & Dense Line-Items Controls
  // ==========================================================================

  #bindCockpitFormControls() {
    if (typeof document === 'undefined') return;

    const merchantInput = /** @type {HTMLInputElement|null} */ (document.getElementById('ml-form-merchant'));
    const dateInput = /** @type {HTMLInputElement|null} */ (document.getElementById('ml-form-date'));
    const totalInput = /** @type {HTMLInputElement|null} */ (document.getElementById('ml-form-total'));
    const taxInput = /** @type {HTMLInputElement|null} */ (document.getElementById('ml-form-tax'));
    const catSelect = /** @type {HTMLSelectElement|null} */ (document.getElementById('ml-form-category'));
    const paySelect = /** @type {HTMLSelectElement|null} */ (document.getElementById('ml-form-payment'));
    const descInput = /** @type {HTMLInputElement|null} */ (document.getElementById('ml-form-description'));

    const addLineBtn = document.getElementById('btn-ml-add-line-row');
    const syncTotalBtn = document.getElementById('btn-ml-sync-total-to-items');
    const discardBtn = document.getElementById('btn-ml-discard-item');
    const skipBtn = document.getElementById('btn-ml-skip-item');
    const form = document.getElementById('ml-active-edit-form');

    // 1. Live synchronization from form fields to active queue item
    const syncFormToItem = () => {
      const item = this.#getActiveQueueItem();
      if (!item || !item.editedData) return;

      if (merchantInput) item.editedData.merchant = merchantInput.value;
      if (dateInput) item.editedData.date = dateInput.value;
      if (totalInput) item.editedData.total = parseFloat(totalInput.value) || 0;
      if (taxInput) item.editedData.tax = parseFloat(taxInput.value) || 0;
      if (catSelect) item.editedData.category = catSelect.value;
      if (paySelect) item.editedData.paymentMethod = paySelect.value;
      if (descInput) item.editedData.description = descInput.value;

      this.#recalculateLineItemsReconciliation();
    };

    merchantInput?.addEventListener('input', syncFormToItem);
    dateInput?.addEventListener('change', syncFormToItem);
    totalInput?.addEventListener('input', syncFormToItem);
    taxInput?.addEventListener('input', syncFormToItem);
    catSelect?.addEventListener('change', syncFormToItem);
    paySelect?.addEventListener('change', syncFormToItem);
    descInput?.addEventListener('input', syncFormToItem);

    // 2. Add Line Item Row
    addLineBtn?.addEventListener('click', () => {
      const item = this.#getActiveQueueItem();
      if (!item) return;
      item.lineItems.push({
        description: 'Item ' + (item.lineItems.length + 1),
        quantity: 1,
        unitPrice: 0,
        amount: 0
      });
      this.#renderLineItemsTable();
      this.#recalculateLineItemsReconciliation();
    });

    // 3. Sync Total to Items Sum
    syncTotalBtn?.addEventListener('click', () => {
      const item = this.#getActiveQueueItem();
      if (!item) return;
      const itemsSum = item.lineItems.reduce((acc, it) => acc + (parseFloat(it.amount) || 0), 0);
      item.editedData.total = parseFloat(itemsSum.toFixed(2));
      if (totalInput) totalInput.value = item.editedData.total.toFixed(2);
      this.#recalculateLineItemsReconciliation();
      showToast(
        `Synchronized bill total to items sum (${formatCurrency(itemsSum, 2, this.#state.get('salaryConfig'))})`
      );
    });

    // 4. Discard Active Item
    discardBtn?.addEventListener('click', () => {
      const item = this.#getActiveQueueItem();
      if (!item) return;
      this.#queue = this.#queue.filter(q => q.id !== item.id);
      this.#activeQueueItemId = this.#queue.length > 0 ? this.#queue[0].id : null;
      this.render();
      showToast('Discarded document from queue.');
    });

    // 5. Skip Active Item
    skipBtn?.addEventListener('click', () => {
      const currentIdx = this.#queue.findIndex(q => q.id === this.#activeQueueItemId);
      if (currentIdx !== -1 && currentIdx < this.#queue.length - 1) {
        this.#activeQueueItemId = this.#queue[currentIdx + 1].id;
      } else if (this.#queue.length > 0) {
        this.#activeQueueItemId = this.#queue[0].id;
      }
      this.render();
    });

    // 6. Approve & Commit Single
    form?.addEventListener('submit', async e => {
      e.preventDefault();
      await this.commitActiveItem();
    });
  }

  /**
   * Recalculates sum(lineItems) and verifies table reconciliation vs bill total.
   */
  #recalculateLineItemsReconciliation() {
    const item = this.#getActiveQueueItem();
    if (!item) return;

    const itemsSumEl = document.getElementById('ml-recon-items-sum');
    const billTotalEl = document.getElementById('ml-recon-bill-total');
    const statusBadge = document.getElementById('ml-recon-status-badge');
    const syncBtn = document.getElementById('btn-ml-sync-total-to-items');
    const salaryConfig = this.#state.get('salaryConfig');

    const itemsSum = item.lineItems.reduce((acc, it) => acc + (parseFloat(it.amount) || 0), 0);
    const billTotal = parseFloat(item.editedData.total) || 0;
    const diff = Math.abs(itemsSum - billTotal);

    if (itemsSumEl) itemsSumEl.textContent = formatCurrency(itemsSum, 2, salaryConfig);
    if (billTotalEl) billTotalEl.textContent = formatCurrency(billTotal, 2, salaryConfig);

    if (item.lineItems.length === 0) {
      if (statusBadge)
        statusBadge.innerHTML = '<span style="color: var(--text-dim); font-size: 11px;">No line items</span>';
      syncBtn?.classList.add('hidden');
      return;
    }

    if (diff < 0.05) {
      if (statusBadge) statusBadge.innerHTML = '<span class="badge-reconciled">✓ Exact Match</span>';
      syncBtn?.classList.add('hidden');
    } else {
      if (statusBadge)
        statusBadge.innerHTML = `<span class="badge-mismatch">⚠️ Mismatch (Diff: ${formatCurrency(diff, 2, salaryConfig)})</span>`;
      syncBtn?.classList.remove('hidden');
    }
  }

  // ==========================================================================
  //  Single & Batch Database Commit
  // ==========================================================================

  /**
   * Commits the currently active document as an expense into persistent storage.
   *
   * @returns {Promise<void>}
   */
  async commitActiveItem() {
    const item = this.#getActiveQueueItem();
    if (!item || !item.editedData) return;

    const exp = this.#buildExpenseRecord(item);
    const res = await this.#api.confirmImport([exp]);

    if (res?.success) {
      showToast(
        `Successfully committed "${exp.title}" (${formatCurrency(exp.amount, 2, this.#state.get('salaryConfig'))})!`
      );
      // Remove committed item from queue
      this.#queue = this.#queue.filter(q => q.id !== item.id);
      this.#activeQueueItemId = this.#queue.length > 0 ? this.#queue[0].id : null;
      await this.#refreshAppData();
      this.render();
    } else {
      const err = res?.errors?.join(', ') || 'Failed to save expense.';
      if (typeof alert !== 'undefined') alert(`Save Error: ${err}`);
    }
  }

  /**
   * Atomically commits all auto-approved items in the queue to the database.
   *
   * @returns {Promise<void>}
   */
  async commitAllApproved() {
    const approvedItems = this.#queue.filter(q => q.status === 'auto-approved');
    if (approvedItems.length === 0) {
      showToast('No auto-approved documents in queue.');
      return;
    }

    const expenses = approvedItems.map(item => this.#buildExpenseRecord(item));
    const res = await this.#api.confirmImport(expenses);

    if (res?.success) {
      showToast(`⚡ Successfully committed ${res.imported} approved receipts to database!`);
      // Remove approved items from queue
      const approvedIds = new Set(approvedItems.map(q => q.id));
      this.#queue = this.#queue.filter(q => !approvedIds.has(q.id));
      this.#activeQueueItemId = this.#queue.length > 0 ? this.#queue[0].id : null;
      await this.#refreshAppData();
      this.render();
    } else {
      const err = res?.errors?.join(', ') || 'Failed to batch import approved receipts.';
      if (typeof alert !== 'undefined') alert(`Batch Commit Error: ${err}`);
    }
  }

  /**
   * Formats a queue item into a standardized persistent Expense object.
   *
   * @param {any} item
   * @returns {any}
   */
  #buildExpenseRecord(item) {
    const d = item.editedData;
    const salaryConfig = this.#state.get('salaryConfig');

    // Build Option A human description with itemized line items
    let formattedDesc = d.description || '';
    if (item.lineItems.length > 0) {
      const itemsList = item.lineItems
        .map(
          i => `${i.description} x${i.quantity || 1} (${formatCurrency(parseFloat(i.amount) || 0, 2, salaryConfig)})`
        )
        .join(', ');
      formattedDesc = `Items (${item.lineItems.length}): ${itemsList}`;
    }

    return {
      title: d.merchant || 'Scanned Expense',
      amount: d.total || 0,
      date: d.date || new Date().toISOString().split('T')[0],
      category: d.category || 'Imported',
      paymentMethod: d.paymentMethod || 'UPI',
      description: formattedDesc,
      tags: ['scanned-receipt'],
      receiptFilename: item.filename || null,
      metadata: {
        lineItems: item.lineItems,
        gstin: d.gstin,
        state: d.state,
        utr: d.utr,
        tax: d.tax,
        regionalData: d.regionalData || item.parsedResult?.regionalData || null,
        utilityData: d.utilityData || item.parsedResult?.utilityData || null,
        tip: d.regionalData?.tipAmount || item.parsedResult?.regionalData?.tipAmount || null,
        confidence: item.confidence,
        smartAnalysis: item.smartAnalysis
      }
    };
  }

  // ==========================================================================
  //  Render Helpers: ML Queue, Cockpit, Viewer & Table
  // ==========================================================================

  #renderMlQueue() {
    const controls = document.getElementById('ml-queue-controls');
    const cockpit = document.getElementById('ml-cockpit-container');
    const emptyState = document.getElementById('ml-queue-empty-placeholder');

    if (this.#queue.length === 0) {
      controls?.classList.add('hidden');
      cockpit?.classList.add('hidden');
      emptyState?.classList.remove('hidden');
      return;
    }

    controls?.classList.remove('hidden');
    cockpit?.classList.remove('hidden');
    emptyState?.classList.add('hidden');

    // Update live counters
    const totalCount = this.#queue.length;
    const approvedCount = this.#queue.filter(q => q.status === 'auto-approved').length;
    const reviewCount = this.#queue.filter(q => q.status === 'needs-review').length;
    const rejectedCount = this.#queue.filter(q => q.status === 'rejected').length;

    const totalEl = document.getElementById('ml-stat-total');
    const approvedEl = document.getElementById('ml-stat-approved');
    const reviewEl = document.getElementById('ml-stat-review');
    const rejectedEl = document.getElementById('ml-stat-rejected');
    const approvedCountLabel = document.getElementById('ml-approved-count-label');
    const sidebarCount = document.getElementById('ml-sidebar-queue-count');

    if (totalEl) totalEl.innerHTML = `Total: <strong>${totalCount}</strong>`;
    if (approvedEl) approvedEl.innerHTML = `Ready: <strong>${approvedCount}</strong>`;
    if (reviewEl) reviewEl.innerHTML = `Needs Review: <strong>${reviewCount}</strong>`;
    if (rejectedEl) rejectedEl.innerHTML = `Rejected: <strong>${rejectedCount}</strong>`;
    if (approvedCountLabel) approvedCountLabel.textContent = String(approvedCount);
    if (sidebarCount) sidebarCount.textContent = String(totalCount);

    this.#renderQueueList();
    this.#renderViewerDocument();
    this.#renderCockpitForm();
  }

  #renderQueueList() {
    const listEl = document.getElementById('ml-queue-items-list');
    if (!listEl) return;

    const salaryConfig = this.#state.get('salaryConfig');

    const html = this.#queue
      .map(item => {
        const isActive = item.id === this.#activeQueueItemId;
        const statusPillClass =
          item.status === 'auto-approved'
            ? 'pill-approved'
            : item.status === 'needs-review'
              ? 'pill-review'
              : item.status === 'scanning'
                ? 'pill-scanning'
                : 'pill-rejected';

        const statusLabel =
          item.status === 'auto-approved'
            ? 'Ready'
            : item.status === 'needs-review'
              ? 'Review'
              : item.status === 'scanning'
                ? 'Scanning...'
                : 'Rejected';

        const amountDisplay = item.editedData ? formatCurrency(item.editedData.total, 2, salaryConfig) : '--';

        return `
        <div class="ml-queue-card ${isActive ? 'active' : ''}" data-item-id="${item.id}">
          <div class="ml-card-header">
            <span class="ml-card-filename" title="${escapeHTML(item.filename)}">${escapeHTML(item.filename)}</span>
            <span class="ml-card-amount">${amountDisplay}</span>
          </div>
          <div class="ml-card-subinfo">
            <span>${escapeHTML(item.editedData?.date || 'Processing...')}</span>
            <span class="ml-card-pill ${statusPillClass}">${statusLabel}</span>
          </div>
        </div>
      `;
      })
      .join('');

    setInnerHTML(listEl, html);

    listEl.querySelectorAll('.ml-queue-card').forEach(card => {
      card.addEventListener('click', () => {
        const id = card.getAttribute('data-item-id');
        if (id) {
          this.#activeQueueItemId = id;
          this.render();
        }
      });
    });
  }

  #renderViewerDocument() {
    const item = this.#getActiveQueueItem();
    const placeholder = document.getElementById('ml-viewer-placeholder');
    const img = /** @type {HTMLImageElement|null} */ (document.getElementById('ml-viewer-image'));
    const textPreview = document.getElementById('ml-viewer-text-preview');
    const pagination = document.getElementById('ml-viewer-pagination');
    const pageIndicator = document.getElementById('ml-viewer-page-indicator');

    if (!item) {
      placeholder?.classList.remove('hidden');
      img?.classList.add('hidden');
      textPreview?.classList.add('hidden');
      pagination?.classList.add('hidden');
      return;
    }

    placeholder?.classList.add('hidden');

    // Handle multi-page pagination controls
    if (item.totalPages > 1) {
      pagination?.classList.remove('hidden');
      if (pageIndicator) pageIndicator.textContent = `Page ${item.currentPage} of ${item.totalPages}`;
    } else {
      pagination?.classList.add('hidden');
    }

    // Render image preview or digital text representation
    const isImageFile = /\.(?:jpe?g|png|webp|bmp)$/i.test(item.filename);
    if (isImageFile && img) {
      img.src = 'file:///' + item.filePath.replace(/\\/g, '/');
      img.classList.remove('hidden');
      textPreview?.classList.add('hidden');
    } else if (textPreview) {
      img?.classList.add('hidden');
      textPreview.classList.remove('hidden');
      const pageText =
        item.extractedData?.pages && item.extractedData.pages[item.currentPage - 1]
          ? item.extractedData.pages[item.currentPage - 1].text
          : item.extractedData?.rawText || 'Text stream not available.';
      textPreview.textContent = pageText;
    }

    this.#updateViewerTransform();
  }

  #renderCockpitForm() {
    const item = this.#getActiveQueueItem();
    if (!item || !item.editedData) return;

    const d = item.editedData;
    const salaryConfig = this.#state.get('salaryConfig');

    // Update Status Banner
    const statusBanner = document.getElementById('ml-cockpit-status-banner');
    const statusBadge = document.getElementById('ml-active-status-badge');
    const confText = document.getElementById('ml-active-confidence-text');
    const reasonText = document.getElementById('ml-active-reason-text');

    if (statusBanner) {
      statusBanner.style.borderColor =
        item.status === 'auto-approved'
          ? 'rgba(16, 185, 129, 0.35)'
          : item.status === 'needs-review'
            ? 'rgba(245, 158, 11, 0.35)'
            : 'rgba(239, 68, 68, 0.35)';
    }

    if (statusBadge) {
      statusBadge.textContent =
        item.status === 'auto-approved'
          ? 'Auto-Approved'
          : item.status === 'needs-review'
            ? 'Needs Review'
            : 'Rejected';
      statusBadge.style.color =
        item.status === 'auto-approved' ? '#10B981' : item.status === 'needs-review' ? '#F59E0B' : '#EF4444';
    }
    if (confText) confText.textContent = `Confidence: ${Math.round(item.confidence * 100)}%`;
    if (reasonText) reasonText.textContent = item.reason;

    // Update Smart Document Analyzer mode toggle active state
    if (item.smartAnalysis) {
      const type = item.smartAnalysis.type || 'invoice';
      document.querySelectorAll('#ml-doc-type-toggle .ml-analyzer-btn').forEach(b => {
        if (b.getAttribute('data-type') === type) {
          b.classList.add('active');
        } else {
          b.classList.remove('active');
        }
      });
      const hint = document.getElementById('ml-analyzer-hint');
      if (hint) hint.textContent = item.smartAnalysis.rationale || '';
    }

    // Populate Category & Payment dropdowns
    this.#populateSelectOptions();

    // Populate Form Inputs
    const merchantInput = /** @type {HTMLInputElement|null} */ (document.getElementById('ml-form-merchant'));
    const dateInput = /** @type {HTMLInputElement|null} */ (document.getElementById('ml-form-date'));
    const totalInput = /** @type {HTMLInputElement|null} */ (document.getElementById('ml-form-total'));
    const taxInput = /** @type {HTMLInputElement|null} */ (document.getElementById('ml-form-tax'));
    const catSelect = /** @type {HTMLSelectElement|null} */ (document.getElementById('ml-form-category'));
    const paySelect = /** @type {HTMLSelectElement|null} */ (document.getElementById('ml-form-payment'));
    const descInput = /** @type {HTMLInputElement|null} */ (document.getElementById('ml-form-description'));
    const curSym = document.getElementById('ml-form-currency-sym');
    const taxSym = document.getElementById('ml-form-tax-sym');

    const symbol = salaryConfig?.currencySymbol || '₹';
    if (curSym) curSym.textContent = symbol;
    if (taxSym) taxSym.textContent = symbol;

    if (merchantInput) merchantInput.value = d.merchant;
    if (dateInput) dateInput.value = d.date;
    if (totalInput) totalInput.value = d.total ? d.total.toFixed(2) : '';
    if (taxInput) taxInput.value = d.tax ? d.tax.toFixed(2) : '';
    if (catSelect) catSelect.value = d.category;
    if (paySelect) paySelect.value = d.paymentMethod;
    if (descInput) descInput.value = d.description;

    // Regional & Utility badges bar (India GSTIN, US EIN/Tip, EU VAT/IBAN, APAC ABN/BPAY/T-Number, Utilities)
    const regionalBar = document.getElementById('ml-form-regional-bar');
    if (regionalBar) {
      const reg = d.regionalData || {};
      const util = d.utilityData || {};
      const chips = [];

      // India
      if (d.gstin) chips.push(`<div class="ml-regional-chip">GSTIN: <strong>${escapeHTML(d.gstin)}</strong></div>`);
      if (d.state) chips.push(`<div class="ml-regional-chip">State: <strong>${escapeHTML(d.state)}</strong></div>`);
      if (d.utr) chips.push(`<div class="ml-regional-chip">Ref/UTR: <strong>${escapeHTML(d.utr)}</strong></div>`);

      // North America
      if (reg.ein) chips.push(`<div class="ml-regional-chip">EIN: <strong>${escapeHTML(reg.ein)}</strong></div>`);
      if (reg.tipAmount > 0)
        chips.push(`<div class="ml-regional-chip">Tip: <strong>$${reg.tipAmount.toFixed(2)}</strong></div>`);

      // Europe & UK
      if (reg.vatNumber)
        chips.push(`<div class="ml-regional-chip">VAT ID: <strong>${escapeHTML(reg.vatNumber)}</strong></div>`);
      if (reg.iban)
        chips.push(
          `<div class="ml-regional-chip">IBAN: <strong>${escapeHTML(reg.iban.slice(0, 4) + '...' + reg.iban.slice(-4))}</strong></div>`
        );

      // APAC (Australia & Japan)
      if (reg.abn) chips.push(`<div class="ml-regional-chip">ABN: <strong>${escapeHTML(reg.abn)}</strong></div>`);
      if (reg.bpay?.billerCode)
        chips.push(`<div class="ml-regional-chip">BPAY: <strong>${escapeHTML(reg.bpay.billerCode)}</strong></div>`);
      if (reg.tNumber)
        chips.push(`<div class="ml-regional-chip">T-Number: <strong>${escapeHTML(reg.tNumber)}</strong></div>`);

      // Utility metadata
      if (util.accountNumber)
        chips.push(`<div class="ml-regional-chip">Acct: <strong>${escapeHTML(util.accountNumber)}</strong></div>`);
      if (util.consumption)
        chips.push(
          `<div class="ml-regional-chip">Usage: <strong>${util.consumption} ${escapeHTML(util.meterUnit || '')}</strong></div>`
        );

      // Tier 2 Precision Chips
      if (d.metadata?.inferredMath || d.inferredMath) {
        chips.push(
          '<div class="ml-regional-chip" style="background: rgba(245,158,11,0.15); border-color: rgba(245,158,11,0.3); color: #f59e0b;">📐 Inferred: <strong>Math Check</strong></div>'
        );
      }
      if (d.metadata?.isHandwritten || d.isHandwritten) {
        chips.push(
          '<div class="ml-regional-chip" style="background: rgba(59,130,246,0.15); border-color: rgba(59,130,246,0.3); color: #3b82f6;">✍️ <strong>Handwritten Decoded</strong></div>'
        );
      }
      if (d.metadata?.isRefund || d.isRefund) {
        chips.push(
          '<div class="ml-regional-chip" style="background: rgba(239,68,68,0.15); border-color: rgba(239,68,68,0.3); color: #ef4444;">↩️ <strong>Refund / Return</strong></div>'
        );
      }
      if (d.metadata?.isDcc || d.isDcc || d.dualCurrency) {
        chips.push(
          '<div class="ml-regional-chip" style="background: rgba(16,185,129,0.15); border-color: rgba(16,185,129,0.3); color: #10b981;">✈️ Travel: <strong>Dual Currency</strong></div>'
        );
      }
      if (d.metadata?.stampDetected || d.stampDetected) {
        chips.push(
          `<div class="ml-regional-chip" style="background: rgba(168,85,247,0.15); border-color: rgba(168,85,247,0.3); color: #a855f7;">🏷️ Stamp: <strong>${escapeHTML(d.metadata?.stampDetected || d.stampDetected)}</strong></div>`
        );
      }

      if (chips.length > 0) {
        regionalBar.classList.remove('hidden');
        setInnerHTML(regionalBar, chips.join(''));
      } else {
        regionalBar.classList.add('hidden');
      }
    }

    // UPI Prompt
    const upiPrompt = document.getElementById('ml-form-upi-prompt');
    if (
      d.paymentMethod &&
      d.paymentMethod.toLowerCase().includes('upi') &&
      (!d.merchant || d.merchant.toLowerCase().includes('unknown'))
    ) {
      upiPrompt?.classList.remove('hidden');
    } else {
      upiPrompt?.classList.add('hidden');
    }

    this.#renderLineItemsTable();
    this.#recalculateLineItemsReconciliation();
  }

  #renderLineItemsTable() {
    const item = this.#getActiveQueueItem();
    const tbody = document.getElementById('ml-line-items-tbody');
    const countEl = document.getElementById('ml-line-items-count');
    if (!item || !tbody) return;

    if (countEl) countEl.textContent = String(item.lineItems.length);

    if (item.lineItems.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="6" style="text-align: center; color: var(--text-dim); padding: 12px;">No itemized lines detected. Click "Add Item" to add.</td></tr>';
      return;
    }

    const html = item.lineItems
      .map(
        (li, idx) => `
      <tr>
        <td style="color: var(--text-dim); font-size: 11px;">${idx + 1}</td>
        <td>
          <input type="text" class="ml-line-input" data-field="description" data-idx="${idx}" value="${escapeHTML(li.description || '')}">
        </td>
        <td>
          <input type="number" step="1" min="1" class="ml-line-input num" data-field="quantity" data-idx="${idx}" value="${li.quantity || 1}">
        </td>
        <td>
          <input type="number" step="0.01" min="0" class="ml-line-input num" data-field="unitPrice" data-idx="${idx}" value="${(parseFloat(li.unitPrice) || 0).toFixed(2)}">
        </td>
        <td>
          <input type="number" step="0.01" min="0" class="ml-line-input num" data-field="amount" data-idx="${idx}" value="${(parseFloat(li.amount) || 0).toFixed(2)}">
        </td>
        <td style="text-align: center;">
          <button type="button" class="btn-delete-row" data-idx="${idx}" title="Remove item">✕</button>
        </td>
      </tr>
    `
      )
      .join('');

    setInnerHTML(tbody, html);

    // Bind inputs change events
    tbody.querySelectorAll('.ml-line-input').forEach(input => {
      input.addEventListener('input', e => {
        const target = /** @type {HTMLInputElement} */ (e.target);
        const idx = parseInt(target.getAttribute('data-idx') || '-1', 10);
        const field = target.getAttribute('data-field');
        if (idx >= 0 && idx < item.lineItems.length && field) {
          if (field === 'description') {
            item.lineItems[idx].description = target.value;
          } else if (field === 'quantity') {
            item.lineItems[idx].quantity = parseFloat(target.value) || 1;
            // Auto recalculate amount if unitPrice exists
            if (item.lineItems[idx].unitPrice) {
              item.lineItems[idx].amount = parseFloat(
                (item.lineItems[idx].quantity * item.lineItems[idx].unitPrice).toFixed(2)
              );
              const amountInput = /** @type {HTMLInputElement|null} */ (
                tbody.querySelector(`.ml-line-input[data-field="amount"][data-idx="${idx}"]`)
              );
              if (amountInput) amountInput.value = item.lineItems[idx].amount.toFixed(2);
            }
          } else if (field === 'unitPrice') {
            item.lineItems[idx].unitPrice = parseFloat(target.value) || 0;
            item.lineItems[idx].amount = parseFloat(
              (item.lineItems[idx].quantity * item.lineItems[idx].unitPrice).toFixed(2)
            );
            const amountInput = /** @type {HTMLInputElement|null} */ (
              tbody.querySelector(`.ml-line-input[data-field="amount"][data-idx="${idx}"]`)
            );
            if (amountInput) amountInput.value = item.lineItems[idx].amount.toFixed(2);
          } else if (field === 'amount') {
            item.lineItems[idx].amount = parseFloat(target.value) || 0;
          }
          this.#recalculateLineItemsReconciliation();
        }
      });
    });

    // Bind delete row buttons
    tbody.querySelectorAll('.btn-delete-row').forEach(btn => {
      btn.addEventListener('click', e => {
        const target = /** @type {HTMLElement} */ (e.target);
        const idx = parseInt(target.getAttribute('data-idx') || '-1', 10);
        if (idx >= 0 && idx < item.lineItems.length) {
          item.lineItems.splice(idx, 1);
          this.#renderLineItemsTable();
          this.#recalculateLineItemsReconciliation();
        }
      });
    });
  }

  #populateSelectOptions() {
    const catSelect = /** @type {HTMLSelectElement|null} */ (document.getElementById('ml-form-category'));
    const paySelect = /** @type {HTMLSelectElement|null} */ (document.getElementById('ml-form-payment'));

    if (catSelect && catSelect.options.length === 0) {
      const categories = this.#state.get('categories') || [
        'Dining Out',
        'Groceries',
        'Utilities',
        'Shopping',
        'Travel',
        'Entertainment',
        'Healthcare',
        'Education',
        'Imported'
      ];
      categories.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat;
        opt.textContent = cat;
        catSelect.appendChild(opt);
      });
    }

    if (paySelect && paySelect.options.length === 0) {
      const methods = [
        'UPI',
        'PhonePe',
        'Google Pay',
        'Paytm',
        'BHIM',
        'CRED',
        'Amazon Pay',
        'Credit Card',
        'Debit Card',
        'Net Banking',
        'Cash',
        'Other'
      ];
      methods.forEach(pm => {
        const opt = document.createElement('option');
        opt.value = pm;
        opt.textContent = pm;
        paySelect.appendChild(opt);
      });
    }
  }

  #getActiveQueueItem() {
    return this.#queue.find(q => q.id === this.#activeQueueItemId) || null;
  }

  // ==========================================================================
  //  Bank Statements Importer Implementation
  // ==========================================================================

  #bindStatementControls() {
    if (typeof document === 'undefined') return;

    const browseBtn = document.getElementById('btn-statement-browse-file');
    const confirmBtn = document.getElementById('btn-statement-confirm');
    const cancelBtn = document.getElementById('btn-statement-cancel');
    const skipDupsBtn = document.getElementById('btn-statement-skip-dups');
    const selectAllBtn = document.getElementById('btn-statement-select-all');
    const selectAllCb = /** @type {HTMLInputElement|null} */ (document.getElementById('statement-select-all-cb'));

    browseBtn?.addEventListener('click', async () => {
      if (!this.#api?.importFile) return;
      try {
        const res = await this.#api.importFile();
        this.handleStatementResult(res);
      } catch (err) {
        console.error('[ImportView] Statement file selection failed:', err);
      }
    });

    confirmBtn?.addEventListener('click', async () => {
      await this.#confirmStatementImport();
    });

    cancelBtn?.addEventListener('click', () => {
      this.#pendingExpenses = [];
      const staging = document.getElementById('statement-staging-container');
      staging?.classList.add('hidden');
    });

    selectAllCb?.addEventListener('change', e => {
      const checked = /** @type {HTMLInputElement} */ (e.target).checked;
      document.querySelectorAll('.statement-row-cb').forEach(cb => {
        /** @type {HTMLInputElement} */ (cb).checked = checked;
      });
      this.#updateStatementSelectedCount();
    });

    selectAllBtn?.addEventListener('click', () => {
      document.querySelectorAll('.statement-row-cb').forEach(cb => {
        /** @type {HTMLInputElement} */ (cb).checked = true;
      });
      if (selectAllCb) selectAllCb.checked = true;
      this.#updateStatementSelectedCount();
    });

    skipDupsBtn?.addEventListener('click', () => {
      document.querySelectorAll('.statement-row-cb').forEach(cb => {
        const idx = parseInt(cb.getAttribute('data-idx') || '-1', 10);
        if (idx >= 0 && idx < this.#pendingExpenses.length && this.isPotentialDuplicate(this.#pendingExpenses[idx])) {
          /** @type {HTMLInputElement} */ (cb).checked = false;
        }
      });
      this.#updateStatementSelectedCount();
    });
  }

  async handleStatementResult(res) {
    if (!res || res.canceled) return;

    if (!res.success || !Array.isArray(res.expenses) || res.expenses.length === 0) {
      const errMsg =
        res.errors && res.errors.length
          ? res.errors.join('\n')
          : 'No valid expense records could be parsed from the statement.';
      if (typeof alert !== 'undefined') alert(`Import Error:\n${errMsg}`);
      return;
    }

    this.#pendingExpenses = res.expenses;
    this.#itemResolutions = new Map();

    // Perform Tri-State Multi-Signal Fuzzy Reconciliation
    if (this.#api?.reconcileStatementBatch) {
      try {
        const reconRes = await this.#api.reconcileStatementBatch(this.#pendingExpenses);
        if (reconRes && reconRes.success && reconRes.data) {
          this.#reconciliationBatchResult = reconRes.data;
          if (Array.isArray(this.#reconciliationBatchResult.results)) {
            this.#reconciliationBatchResult.results.forEach((item, idx) => {
              if (item.status === 'matched_merged') {
                this.#itemResolutions.set(idx, {
                  action: 'merge',
                  matchedExpenseId: item.match?.expense?.id,
                  incomingId: item.id
                });
              } else if (item.status === 'conflict') {
                this.#itemResolutions.set(idx, {
                  action: 'skip',
                  matchedExpenseId: item.candidates?.[0]?.expense?.id,
                  incomingId: item.id
                });
              } else {
                this.#itemResolutions.set(idx, {
                  action: 'import',
                  incomingId: item.id
                });
              }
            });
          }
        } else {
          this.#reconciliationBatchResult = null;
        }
      } catch (err) {
        console.warn('[ImportView] Reconciliation engine execution error:', err);
        this.#reconciliationBatchResult = null;
      }
    }

    const staging = document.getElementById('statement-staging-container');
    const formatBadge = document.getElementById('statement-format-badge');
    const countText = document.getElementById('statement-count-text');

    if (staging) staging.classList.remove('hidden');
    if (formatBadge) formatBadge.textContent = (res.format || 'CSV').toUpperCase();
    if (countText) countText.textContent = String(res.expenses.length);

    this.#renderStatements();
    showToast(`Parsed ${res.expenses.length} statement records ready for review.`);
  }

  #renderStatements() {
    const tbody = document.getElementById('statement-preview-tbody');
    if (!tbody || this.#pendingExpenses.length === 0) return;

    const salaryConfig = this.#state.get('salaryConfig');
    let dupCount = 0;

    const html = this.#pendingExpenses
      .slice(0, 150)
      .map((exp, idx) => {
        const reconItem = this.#reconciliationBatchResult?.results?.[idx];
        const isMatched = reconItem?.status === 'matched_merged';
        const isConflict = reconItem?.status === 'conflict';
        const isDup = isMatched || isConflict || this.isPotentialDuplicate(exp);
        if (isDup) dupCount++;

        let statusBadgeHtml;
        let actionDropdownHtml = '';

        if (reconItem) {
          if (reconItem.status === 'matched_merged') {
            const scorePct = Math.round((reconItem.match?.score || 0) * 100);
            const targetTitle = escapeHTML(reconItem.match?.expense?.title || 'Ledger Match');
            statusBadgeHtml = `
              <span style="display: inline-block; padding: 2px 7px; border-radius: 4px; font-size: 11px; font-weight: 700; color: #059669; background: rgba(16, 185, 129, 0.12);" title="Matched with existing ledger item: ${targetTitle} (${scorePct}%)">
                ✓ Matched (${scorePct}%)
              </span>
              <div style="font-size: 10px; color: var(--text-dim); margin-top: 2px;">Merge Target: ${targetTitle}</div>
            `;
            actionDropdownHtml = `
              <select class="statement-action-select" data-idx="${idx}" style="font-size: 11px; padding: 2px 4px; border-radius: 4px; background: var(--bg-card); color: var(--text-main); border: 1px solid var(--border-color); margin-top: 4px;">
                <option value="merge" selected>Merge</option>
                <option value="import">Import as New</option>
                <option value="skip">Skip</option>
              </select>
            `;
          } else if (reconItem.status === 'conflict') {
            const topScore = Math.round((reconItem.candidates?.[0]?.score || 0.5) * 100);
            const candidateTitle = escapeHTML(reconItem.candidates?.[0]?.expense?.title || 'Candidate');
            statusBadgeHtml = `
              <span style="display: inline-block; padding: 2px 7px; border-radius: 4px; font-size: 11px; font-weight: 700; color: #D97706; background: rgba(245, 158, 11, 0.14);" title="${escapeHTML(reconItem.reason || 'Multiple competing ledger matches')}">
                ⚠️ Ambiguous (${topScore}%)
              </span>
              <div style="font-size: 10px; color: var(--text-dim); margin-top: 2px;">Near: ${candidateTitle}</div>
            `;
            actionDropdownHtml = `
              <select class="statement-action-select" data-idx="${idx}" style="font-size: 11px; padding: 2px 4px; border-radius: 4px; background: var(--bg-card); color: var(--text-main); border: 1px solid var(--border-color); margin-top: 4px;">
                <option value="skip" selected>Skip (Review)</option>
                <option value="merge">Merge with Near</option>
                <option value="import">Import as New</option>
              </select>
            `;
          } else {
            statusBadgeHtml = `
              <span style="display: inline-block; padding: 2px 7px; border-radius: 4px; font-size: 11px; font-weight: 700; color: #2563EB; background: rgba(37, 99, 235, 0.12);">
                + Net-New
              </span>
            `;
            actionDropdownHtml = `
              <select class="statement-action-select" data-idx="${idx}" style="font-size: 11px; padding: 2px 4px; border-radius: 4px; background: var(--bg-card); color: var(--text-main); border: 1px solid var(--border-color); margin-top: 4px;">
                <option value="import" selected>Import</option>
                <option value="skip">Skip</option>
              </select>
            `;
          }
        } else {
          statusBadgeHtml = isDup
            ? '<span style="color: #F59E0B; font-size: 11px; font-weight: 700;">⚠️ Duplicate</span>'
            : '<span style="color: #10B981; font-size: 11px; font-weight: 700;">✓ Ready</span>';
        }

        const isCheckedByDefault = isConflict ? false : true;

        return `
        <tr style="${isDup ? 'background: rgba(245, 158, 11, 0.05);' : ''}">
          <td>
            <input type="checkbox" class="statement-row-cb" data-idx="${idx}" ${isCheckedByDefault ? 'checked' : ''}>
          </td>
          <td style="font-family: var(--font-mono); font-size: 11.5px; color: var(--text-muted);">${escapeHTML(exp.date || 'Today')}</td>
          <td><strong>${escapeHTML(exp.title || 'Expense')}</strong></td>
          <td><span class="category-pill">${escapeHTML(exp.category || 'Imported')}</span></td>
          <td style="text-align: right; font-family: var(--font-mono); color: var(--accent-primary);">-${formatCurrency(parseFloat(exp.amount) || 0, 2, salaryConfig)}</td>
          <td style="font-size: 11px; color: var(--text-dim);">${escapeHTML(exp.paymentMethod || 'Statement')}</td>
          <td>
            ${statusBadgeHtml}
            ${actionDropdownHtml}
          </td>
        </tr>
      `;
      })
      .join('');

    setInnerHTML(tbody, html);

    // Duplicate alert / reconciliation bar
    const reconBar = document.getElementById('statement-reconciliation-bar');
    const dupCountText = document.getElementById('statement-duplicates-count-text');
    if (reconBar) {
      if (this.#reconciliationBatchResult) {
        const stats = this.#reconciliationBatchResult.stats;
        reconBar.classList.remove('hidden');
        if (dupCountText) {
          dupCountText.innerHTML = `<strong>Reconciliation Cockpit:</strong> ${stats.matched} Matched & Merged · ${stats.netNew} Net-New · ${stats.conflicts} Ambiguous (${this.#reconciliationBatchResult.executionTimeMs || 0}ms)`;
        }
      } else if (dupCount > 0) {
        reconBar.classList.remove('hidden');
        if (dupCountText) {
          dupCountText.textContent = `Found ${dupCount} potential duplicate transaction${dupCount > 1 ? 's' : ''} within ±2 days.`;
        }
      } else {
        reconBar.classList.add('hidden');
      }
    }

    tbody.querySelectorAll('.statement-row-cb').forEach(cb => {
      cb.addEventListener('change', () => this.#updateStatementSelectedCount());
    });

    tbody.querySelectorAll('.statement-action-select').forEach(sel => {
      sel.addEventListener('change', e => {
        const idx = parseInt(sel.getAttribute('data-idx') || '-1', 10);
        if (idx >= 0) {
          const existing = this.#itemResolutions.get(idx) || { incomingId: `tx_${idx}` };
          existing.action = /** @type {HTMLSelectElement} */ (e.target).value;
          this.#itemResolutions.set(idx, existing);
          const cb = /** @type {HTMLInputElement|null} */ (tbody.querySelector(`.statement-row-cb[data-idx="${idx}"]`));
          if (cb) {
            cb.checked = existing.action !== 'skip';
          }
          this.#updateStatementSelectedCount();
        }
      });
    });

    this.#updateStatementSelectedCount();
  }

  #updateStatementSelectedCount() {
    const checked = document.querySelectorAll('.statement-row-cb:checked').length;
    const countEl = document.getElementById('statement-btn-count');
    if (countEl) countEl.textContent = String(checked);
  }

  async #confirmStatementImport() {
    if (this.#pendingExpenses.length === 0) return;

    const checkedRows = Array.from(document.querySelectorAll('.statement-row-cb:checked'));
    const checkedIndices = new Set(checkedRows.map(cb => parseInt(cb.getAttribute('data-idx') || '0', 10)));

    if (checkedIndices.size === 0) {
      if (typeof alert !== 'undefined') alert('Please select at least one statement record to import.');
      return;
    }

    // If Tri-State Reconciliation is active, apply resolutions
    if (this.#reconciliationBatchResult && typeof this.#api?.applyReconciliation === 'function') {
      const resolutions = [];
      for (let i = 0; i < this.#pendingExpenses.length; i++) {
        const exp = this.#pendingExpenses[i];
        const isChecked = checkedIndices.has(i);
        const resConfig = this.#itemResolutions.get(i) || { action: 'import' };
        if (!isChecked) {
          resolutions.push({
            incomingId: resConfig.incomingId || `tx_${i}`,
            action: 'skip'
          });
        } else {
          resolutions.push({
            incomingId: resConfig.incomingId || `tx_${i}`,
            action: resConfig.action || 'import',
            matchedExpenseId: resConfig.matchedExpenseId,
            expenseData: exp
          });
        }
      }

      const res = await this.#api.applyReconciliation(resolutions);
      if (res?.success) {
        showToast(
          `⚡ Reconciled: ${res.mergedCount} merged, ${res.importedCount} imported, ${res.skippedCount} skipped!`
        );
        this.#pendingExpenses = [];
        this.#reconciliationBatchResult = null;
        this.#itemResolutions.clear();
        const staging = document.getElementById('statement-staging-container');
        staging?.classList.add('hidden');
        await this.#refreshAppData();
      } else {
        const errorMsg = res?.errors?.join(', ') || 'Failed to apply reconciliation.';
        if (typeof alert !== 'undefined') alert(`Reconciliation Error: ${errorMsg}`);
      }
      return;
    }

    // Fallback import
    const selectedExpenses = Array.from(checkedIndices)
      .map(idx => this.#pendingExpenses[idx])
      .filter(Boolean);

    const res = await this.#api.confirmImport(selectedExpenses);
    if (res?.success) {
      showToast(`Successfully imported ${res.imported} statement records!`);
      this.#pendingExpenses = [];
      this.#reconciliationBatchResult = null;
      this.#itemResolutions.clear();
      const staging = document.getElementById('statement-staging-container');
      staging?.classList.add('hidden');
      await this.#refreshAppData();
    } else {
      const errorMsg = res?.errors?.join(', ') || 'Failed to insert statement expenses.';
      if (typeof alert !== 'undefined') alert(`Import error: ${errorMsg}`);
    }
  }

  // ==========================================================================
  //  Utility: Duplicate Checking & Drag-Drop Fallback
  // ==========================================================================

  /**
   * Checks if an incoming parsed expense resembles an already existing record.
   *
   * @param {any} exp - Parsed expense candidate
   * @returns {boolean} True if matching title, date, and amount exists
   */
  isPotentialDuplicate(exp) {
    if (this.#reconciliationBatchResult && Array.isArray(this.#reconciliationBatchResult.results)) {
      const match = this.#reconciliationBatchResult.results.find(
        r =>
          r.incoming === exp ||
          (r.incoming?.title === exp.title &&
            r.incoming?.amount === exp.amount &&
            r.incoming?.date === exp.date)
      );
      if (match) {
        return match.status === 'matched_merged' || match.status === 'conflict';
      }
    }

    if (!exp || !exp.date || !exp.amount) return false;
    const existingExpenses = this.#state.get('expenses') || [];

    return existingExpenses.some(
      existing =>
        existing.date === exp.date &&
        Math.abs(parseFloat(existing.amount) - parseFloat(exp.amount)) < 0.01 &&
        (existing.title || '').trim().toLowerCase() === (exp.title || '').trim().toLowerCase()
    );
  }

  /**
   * Window-level drag and drop overlay setup.
   */
  setupDragAndDrop() {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    const overlay = document.getElementById('dropzone-overlay');
    let dragCounter = 0;

    const onDragEnter = e => {
      e.preventDefault();
      dragCounter++;
      if (e.dataTransfer?.types && Array.from(e.dataTransfer.types).includes('Files')) {
        overlay?.classList.remove('hidden');
      }
    };

    const onDragOver = e => {
      e.preventDefault();
    };

    const onDragLeave = e => {
      e.preventDefault();
      dragCounter--;
      if (dragCounter <= 0) {
        dragCounter = 0;
        overlay?.classList.add('hidden');
      }
    };

    const onDrop = async e => {
      e.preventDefault();
      dragCounter = 0;
      overlay?.classList.add('hidden');

      if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
        const filePaths = Array.from(e.dataTransfer.files)
          .map(f => f.path)
          .filter(Boolean);

        if (filePaths.length > 0) {
          // If files look like receipts/images or we are in ml-queue tab -> enqueue in ML queue
          const hasImages = filePaths.some(p => /\.(?:jpe?g|png|webp|bmp)$/i.test(p));
          if (hasImages || this.#activeSubTab === 'ml-queue') {
            this.#switchTab('import');
            this.#activeSubTab = 'ml-queue';
            await this.enqueueFiles(filePaths);
          } else {
            this.#switchTab('import');
            this.#activeSubTab = 'statements';
            const res = await this.#api.importFilePath(filePaths[0]);
            this.handleStatementResult(res);
          }
        }
      }
    };

    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('drop', onDrop);

    this.#cleanupListeners.push(() => {
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('drop', onDrop);
    });
  }

  // Backward compatibility for modal
  #bindModalControls() {
    const closeBtn = document.getElementById('import-modal-close');
    const cancelBtn = document.getElementById('import-cancel-btn');
    const closeModal = () => {
      document.getElementById('import-modal')?.classList.remove('active');
    };
    closeBtn?.addEventListener('click', closeModal);
    cancelBtn?.addEventListener('click', closeModal);
    this.#cleanupListeners.push(() => {
      closeBtn?.removeEventListener('click', closeModal);
      cancelBtn?.removeEventListener('click', closeModal);
    });
  }

  closeModal() {
    if (typeof document !== 'undefined') {
      document.getElementById('import-modal')?.classList.remove('active');
    }
  }

  renderPreviewTable() {
    this.#renderStatements();
  }
}
