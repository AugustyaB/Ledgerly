/**
 * ============================================================================
 * Ledgerly Mobile — IndexedDB Offline Ingestion Queue
 * ============================================================================
 *
 * @fileoverview
 * Zero-dependency client-side IndexedDB persistence layer for mobile receipts
 * and offline quick-add transactions awaiting local desktop Wi-Fi sync.
 * Enforces runtime schema validation at the storage boundary.
 */

'use strict';

import {
  validateMobileReceiptQueueItem,
  validateMobileTransaction,
  SyncStatus
} from '../shared/validator.js';

const DB_NAME = 'ledgerly_mobile_db';
const DB_VERSION = 1;
const STORE_RECEIPTS = 'receipt_queue';
const STORE_TRANSACTIONS = 'offline_transactions';

class IndexedDbQueue {
  constructor() {
    this.dbPromise = null;
  }

  /**
   * Opens or returns the cached IndexedDB instance.
   * @returns {Promise<IDBDatabase>}
   */
  async getDb() {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        return reject(new Error('IndexedDB is not supported in this environment.'));
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // 1. Receipt Queue Store
        if (!db.objectStoreNames.contains(STORE_RECEIPTS)) {
          const receiptStore = db.createObjectStore(STORE_RECEIPTS, { keyPath: 'id' });
          receiptStore.createIndex('capturedAt', 'capturedAt', { unique: false });
          receiptStore.createIndex('syncStatus', 'syncStatus', { unique: false });
        }

        // 2. Offline Transactions Store
        if (!db.objectStoreNames.contains(STORE_TRANSACTIONS)) {
          const txStore = db.createObjectStore(STORE_TRANSACTIONS, { keyPath: 'id' });
          txStore.createIndex('date', 'date', { unique: false });
          txStore.createIndex('syncStatus', 'syncStatus', { unique: false });
        }
      };

      request.onsuccess = (event) => {
        resolve(event.target.result);
      };

      request.onerror = (event) => {
        this.dbPromise = null;
        reject(new Error(`Failed to open IndexedDB: ${event.target.error?.message}`));
      };
    });

    return this.dbPromise;
  }

  /**
   * Helper to execute a transaction on an object store.
   * @private
   * @param {string} storeName
   * @param {'readonly'|'readwrite'} mode
   * @param {Function} callback
   * @returns {Promise<any>}
   */
  async runTransaction(storeName, mode, callback) {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      const store = tx.objectStore(storeName);

      let result;
      try {
        result = callback(store);
      } catch (err) {
        return reject(err);
      }

      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(new Error('IndexedDB transaction aborted'));
    });
  }

  /**
   * Emits a global queue update event.
   */
  notifyUpdate() {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('ledgerly:queue-updated'));
    }
  }

  // ==========================================================================
  // Receipt Queue Operations
  // ==========================================================================

  /**
   * Enqueues a validated receipt item into the offline queue.
   * @param {import('../../src/types.js').MobileReceiptQueueItem & { imageData?: string }} item
   * @returns {Promise<Object>}
   */
  async enqueueReceipt(item) {
    // 1. Validate Schema
    const validation = validateMobileReceiptQueueItem(item);
    if (!validation.valid) {
      throw new Error(`Receipt validation failed: ${validation.errors.join('; ')}`);
    }

    const payload = {
      ...item,
      syncStatus: item.syncStatus || 'queued',
      retryCount: item.retryCount || 0,
      lastError: item.lastError || null
    };

    await this.runTransaction(STORE_RECEIPTS, 'readwrite', (store) => {
      store.put(payload);
    });

    this.notifyUpdate();
    return payload;
  }

  /**
   * Retrieves all receipts from the queue sorted by capturedAt descending.
   * @returns {Promise<Array<Object>>}
   */
  async getAllReceipts() {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_RECEIPTS, 'readonly');
      const store = tx.objectStore(STORE_RECEIPTS);
      const request = store.getAll();

      request.onsuccess = () => {
        const list = request.result || [];
        list.sort((a, b) => new Date(b.capturedAt).getTime() - new Date(a.capturedAt).getTime());
        resolve(list);
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Retrieves a single receipt by ID.
   * @param {string} id
   * @returns {Promise<Object|null>}
   */
  async getReceiptById(id) {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_RECEIPTS, 'readonly');
      const store = tx.objectStore(STORE_RECEIPTS);
      const request = store.get(id);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Updates fields of an existing queued receipt.
   * @param {string} id
   * @param {Partial<Object>} patch
   * @returns {Promise<Object>}
   */
  async updateReceipt(id, patch) {
    const existing = await this.getReceiptById(id);
    if (!existing) {
      throw new Error(`Receipt with ID "${id}" not found.`);
    }

    const merged = { ...existing, ...patch };
    const validation = validateMobileReceiptQueueItem(merged);
    if (!validation.valid) {
      throw new Error(`Updated receipt validation failed: ${validation.errors.join('; ')}`);
    }

    await this.runTransaction(STORE_RECEIPTS, 'readwrite', (store) => {
      store.put(merged);
    });

    this.notifyUpdate();
    return merged;
  }

  /**
   * Deletes a receipt by ID.
   * @param {string} id
   * @returns {Promise<boolean>}
   */
  async deleteReceipt(id) {
    await this.runTransaction(STORE_RECEIPTS, 'readwrite', (store) => {
      store.delete(id);
    });

    this.notifyUpdate();
    return true;
  }

  /**
   * Counts the number of receipts currently pending sync.
   * @returns {Promise<number>}
   */
  async getPendingReceiptCount() {
    const receipts = await this.getAllReceipts();
    return receipts.filter((r) => r.syncStatus !== 'synced').length;
  }

  /**
   * Counts the number of offline quick-add transactions currently pending sync.
   * @returns {Promise<number>}
   */
  async getPendingTransactionCount() {
    const transactions = await this.getAllTransactions();
    return transactions.filter((t) => t.syncStatus !== 'synced').length;
  }

  /**
   * Counts total pending items (receipts + transactions) awaiting sync.
   * @returns {Promise<number>}
   */
  async getTotalPendingCount() {
    const [rcptCount, txCount] = await Promise.all([
      this.getPendingReceiptCount(),
      this.getPendingTransactionCount()
    ]);
    return rcptCount + txCount;
  }

  // ==========================================================================
  // Offline Transactions Operations (Quick Add)
  // ==========================================================================

  /**
   * Enqueues an offline transaction.
   * @param {Object} tx
   * @returns {Promise<Object>}
   */
  async enqueueTransaction(tx) {
    const validation = validateMobileTransaction(tx);
    if (!validation.valid) {
      throw new Error(`Transaction validation failed: ${validation.errors.join('; ')}`);
    }

    const payload = {
      ...tx,
      syncStatus: tx.syncStatus || SyncStatus.PENDING,
      version: tx.version || 1,
      localCreatedAt: tx.localCreatedAt || new Date().toISOString()
    };

    await this.runTransaction(STORE_TRANSACTIONS, 'readwrite', (store) => {
      store.put(payload);
    });

    this.notifyUpdate();
    return payload;
  }

  /**
   * Retrieves all offline transactions.
   * @returns {Promise<Array<Object>>}
   */
  async getAllTransactions() {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_TRANSACTIONS, 'readonly');
      const store = tx.objectStore(STORE_TRANSACTIONS);
      const request = store.getAll();

      request.onsuccess = () => {
        const list = request.result || [];
        list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        resolve(list);
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Deletes an offline transaction by ID.
   * @param {string} id
   * @returns {Promise<boolean>}
   */
  async deleteTransaction(id) {
    await this.runTransaction(STORE_TRANSACTIONS, 'readwrite', (store) => {
      store.delete(id);
    });

    this.notifyUpdate();
    return true;
  }

  /**
   * Retrieves a single offline transaction by ID.
   * @param {string} id
   * @returns {Promise<Object|null>}
   */
  async getTransactionById(id) {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_TRANSACTIONS, 'readonly');
      const store = tx.objectStore(STORE_TRANSACTIONS);
      const request = store.get(id);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Updates fields of an existing queued offline transaction.
   * @param {string} id
   * @param {Partial<Object>} patch
   * @returns {Promise<Object>}
   */
  async updateTransaction(id, patch) {
    const existing = await this.getTransactionById(id);
    if (!existing) {
      throw new Error(`Transaction with ID "${id}" not found.`);
    }

    const merged = { ...existing, ...patch };
    await this.runTransaction(STORE_TRANSACTIONS, 'readwrite', (store) => {
      store.put(merged);
    });

    this.notifyUpdate();
    return merged;
  }

  /**
   * Purges all stores in the database (used for testing or complete sync resets).
   * @returns {Promise<void>}
   */
  async clearAll() {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_RECEIPTS, STORE_TRANSACTIONS], 'readwrite');
      tx.objectStore(STORE_RECEIPTS).clear();
      tx.objectStore(STORE_TRANSACTIONS).clear();

      tx.oncomplete = () => {
        this.notifyUpdate();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    });
  }
}

export const indexedDbQueue = new IndexedDbQueue();
export default indexedDbQueue;
