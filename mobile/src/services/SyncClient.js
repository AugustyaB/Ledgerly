/**
 * ============================================================================
 * Ledgerly Mobile — SyncClient (LAN Wi-Fi Handshake & Synchronization Client)
 * ============================================================================
 *
 * @fileoverview
 * Zero-dependency, lightweight HTTP client managing local network pairing and
 * peer-to-peer data synchronization with Ledgerly Desktop over Wi-Fi.
 * Enforces Immediate Purge policy upon verified receipt upload.
 */

'use strict';

import { mobileSettings } from '../storage/mobileSettings.js';
import { indexedDbQueue } from '../storage/indexedDbQueue.js';

class SyncClient {
  constructor() {
    this.isSyncing = false;
  }

  /**
   * Evaluates if mobile device is paired with a desktop host.
   * @returns {boolean}
   */
  isPaired() {
    const s = mobileSettings.settings;
    return Boolean(s && s.pairedHost && s.sessionToken);
  }

  /**
   * Returns current paired connection metadata.
   * @returns {{ isPaired: boolean, host: string, port: number, machineName: string, lastSync: string }}
   */
  getPairedInfo() {
    const s = mobileSettings.settings || {};
    return {
      isPaired: this.isPaired(),
      host: s.pairedHost || '',
      port: s.pairedPort || 52410,
      machineName: s.pairedMachineName || 'Unknown Desktop',
      lastSync: s.lastSync || 'Never'
    };
  }

  /**
   * Builds the base URL for the paired desktop server.
   * @private
   * @param {string} [hostOverride]
   * @param {number} [portOverride]
   * @returns {string}
   */
  _getBaseUrl(hostOverride, portOverride) {
    const host = hostOverride || mobileSettings.settings.pairedHost || '127.0.0.1';
    const port = portOverride || mobileSettings.settings.pairedPort || 52410;
    return `http://${host}:${port}`;
  }

  /**
   * Checks the status and reachability of a desktop server over LAN.
   *
   * @param {string} host - LAN IP address.
   * @param {number} [port=52410] - Port number.
   * @returns {Promise<Object>} Server status response.
   */
  async checkDesktopStatus(host, port = 52410) {
    const url = `http://${host}:${port}/api/v1/status`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    try {
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);
      if (!res.ok) {
        throw new Error(`Desktop returned HTTP ${res.status}`);
      }
      return await res.json();
    } catch (err) {
      clearTimeout(timeout);
      throw new Error(`Cannot reach desktop at ${host}:${port}: ${err.message}`, { cause: err });
    }
  }

  /**
   * Initiates pairing handshake with desktop using PIN or QR ephemeral token.
   *
   * @param {Object} params
   * @param {string} params.host - Desktop LAN IP.
   * @param {number} [params.port=52410] - Desktop port.
   * @param {string} [params.pin] - 6-digit numeric PIN.
   * @param {string} [params.token] - Ephemeral pairing token.
   * @param {string} [params.deviceName] - Device display name.
   * @returns {Promise<Object>} Handshake response.
   */
  async pairWithDesktop({ host, port = 52410, pin, token, deviceName }) {
    if (!host) throw new Error('Desktop host IP is required for pairing.');
    if (!pin && !token) throw new Error('Either pairing PIN or token must be provided.');

    const url = `http://${host}:${port}/api/v1/pair`;
    const payload = {
      host,
      port,
      pin: pin ? String(pin).trim() : undefined,
      token: token ? String(token).trim() : undefined,
      deviceNodeId: mobileSettings.getNodeId(),
      deviceName: deviceName || 'Mobile Companion'
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || `Pairing failed with status ${res.status}`);
      }

      // Persist pairing credentials in mobileSettings
      mobileSettings.save({
        pairedHost: host,
        pairedPort: port,
        sessionToken: data.sessionToken,
        pairedMachineName: data.machineName || 'Desktop',
        targetProfileId: data.targetProfileId || null,
        currencySymbol: data.currencySymbol || mobileSettings.getCurrencySymbol(),
        lastSync: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      });

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('ledgerly:sync-paired', { detail: data }));
      }

      return data;
    } catch (err) {
      if (err.name === 'AbortError') {
        throw new Error(`Connection timed out after 10s connecting to ${host}:${port}. Verify desktop IP and Wi-Fi connection.`, { cause: err });
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Executes full two-way synchronization:
   * 1. Pushes offline transactions.
   * 2. Uploads pending receipts and immediately purges local image buffers upon confirmation.
   * 3. Pulls delta updates from desktop.
   *
   * @returns {Promise<{ success: boolean, pushedCount: number, uploadedReceipts: number, pulledCount: number }>}
   */
  async syncNow() {
    if (!this.isPaired()) {
      throw new Error('Device is not paired with a desktop host. Please pair first.');
    }

    if (this.isSyncing) {
      throw new Error('Sync is already in progress.');
    }

    this.isSyncing = true;
    this._emitStatus('syncing');

    try {
      const baseUrl = this._getBaseUrl();
      const token = mobileSettings.settings.sessionToken;
      const authHeaders = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      };

      // ----------------------------------------------------------------------
      // 1. Push Offline Transactions (with 15s Timeout)
      // ----------------------------------------------------------------------
      const allTx = await indexedDbQueue.getAllTransactions();
      const pendingTx = allTx.filter(t => t.syncStatus !== 'synced');
      let pushedCount = 0;

      if (pendingTx.length > 0) {
        const pushController = new AbortController();
        const pushTimeout = setTimeout(() => pushController.abort(), 15000);
        let pushRes;

        try {
          pushRes = await fetch(`${baseUrl}/api/v1/sync/push`, {
            method: 'POST',
            headers: authHeaders,
            body: JSON.stringify({
              transactions: pendingTx,
              profileId: mobileSettings.settings.targetProfileId || undefined
            }),
            signal: pushController.signal
          });
        } catch (fetchErr) {
          if (fetchErr.name === 'AbortError') {
            throw new Error('Pushing transactions timed out after 15s.', { cause: fetchErr });
          }
          throw fetchErr;
        } finally {
          clearTimeout(pushTimeout);
        }

        const pushData = await pushRes.json();
        if (!pushRes.ok || !pushData.success) {
          throw new Error(pushData.error || 'Failed to push transactions to desktop.');
        }

        // BUG-006 Remediation: Only delete transactions successfully ingested by desktop.
        // Transactions rejected during validation stay in IndexedDB with syncStatus: 'error'.
        const failedIds = new Set((pushData.errors || []).map(e => e.id));
        for (const tx of pendingTx) {
          if (!failedIds.has(tx.id)) {
            await indexedDbQueue.deleteTransaction(tx.id);
            pushedCount++;
          } else {
            const errObj = (pushData.errors || []).find(e => e.id === tx.id);
            const errMsg = errObj && errObj.errors
              ? (Array.isArray(errObj.errors) ? errObj.errors.join('; ') : String(errObj.errors))
              : 'Desktop schema rejected transaction';
            await indexedDbQueue.updateTransaction(tx.id, {
              syncStatus: 'error',
              lastError: errMsg
            });
          }
        }
      }

      // ----------------------------------------------------------------------
      // 2. Upload Pending Receipts (with Immediate Purge & Per-Item Error Isolation)
      // ----------------------------------------------------------------------
      const allReceipts = await indexedDbQueue.getAllReceipts();
      const pendingReceipts = allReceipts.filter(r => r.syncStatus !== 'synced');
      let uploadedReceipts = 0;

      for (const rcpt of pendingReceipts) {
        if (!rcpt.imageData) {
          // If no image data, delete entry
          await indexedDbQueue.deleteReceipt(rcpt.id);
          continue;
        }

        const rcptController = new AbortController();
        const rcptTimeout = setTimeout(() => rcptController.abort(), 25000);

        try {
          // BUG-005 Remediation: Pass draft financial metadata to desktop so an Expense entry is created
          const rcptRes = await fetch(`${baseUrl}/api/v1/sync/receipt`, {
            method: 'POST',
            headers: authHeaders,
            body: JSON.stringify({
              imageData: rcpt.imageData,
              mimeType: rcpt.mimeType || 'image/jpeg',
              hasManualDetails: Boolean(rcpt.draftAmount || rcpt.draftMerchant),
              draftAmount: rcpt.draftAmount || null,
              draftMerchant: rcpt.draftMerchant || null,
              draftDate: rcpt.draftDate || null,
              category: rcpt.category || null,
              notes: rcpt.notes || null,
              filename: rcpt.id,
              profileId: mobileSettings.settings.targetProfileId || undefined
            }),
            signal: rcptController.signal
          });

          const rcptData = await rcptRes.json();
          if (rcptRes.ok && rcptData.success) {
            // IMMEDIATE PURGE: Delete receipt from IndexedDB immediately to avoid ballooning storage
            await indexedDbQueue.deleteReceipt(rcpt.id);
            uploadedReceipts++;
          } else {
            await indexedDbQueue.updateReceipt(rcpt.id, {
              syncStatus: 'error',
              lastError: rcptData.error || `Upload failed with status ${rcptRes.status}`,
              retryCount: (rcpt.retryCount || 0) + 1
            });
          }
        } catch (rcptErr) {
          const errMsg = rcptErr.name === 'AbortError'
            ? 'Receipt upload timed out after 25s'
            : rcptErr.message;
          await indexedDbQueue.updateReceipt(rcpt.id, {
            syncStatus: 'error',
            lastError: errMsg,
            retryCount: (rcpt.retryCount || 0) + 1
          });
        } finally {
          clearTimeout(rcptTimeout);
        }
      }

      // ----------------------------------------------------------------------
      // 3. Pull Desktop Changes (with 15s Timeout & Safe Timestamp Invalidation)
      // ----------------------------------------------------------------------
      const lastSyncTime = mobileSettings.settings.lastSyncTimestamp || 0;
      let pullUrl = `${baseUrl}/api/v1/sync/pull?since=${encodeURIComponent(lastSyncTime)}`;
      if (mobileSettings.settings.targetProfileId) {
        pullUrl += `&profileId=${encodeURIComponent(mobileSettings.settings.targetProfileId)}`;
      }

      const pullController = new AbortController();
      const pullTimeout = setTimeout(() => pullController.abort(), 15000);
      let pullSuccess = false;
      let pulledCount = 0;

      try {
        const pullRes = await fetch(pullUrl, {
          headers: authHeaders,
          signal: pullController.signal
        });

        if (pullRes.ok) {
          const pullData = await pullRes.json();
          if (pullData.success) {
            pullSuccess = true;
            pulledCount = (pullData.expenses && pullData.expenses.length) || 0;
            if (pullData.currencySymbol) {
              mobileSettings.setCurrencySymbol(pullData.currencySymbol);
            }
          }
        }
      } catch (pullErr) {
        console.warn('[SyncClient] Pull delta warning:', pullErr.message);
      } finally {
        clearTimeout(pullTimeout);
      }

      const nowFormatted = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const updates = { lastSync: nowFormatted };
      // DEFECT-606-04 Remediation: Only advance lastSyncTimestamp if pull succeeded.
      // If pull failed or timed out, preserve prior timestamp to prevent delta loss.
      if (pullSuccess) {
        updates.lastSyncTimestamp = new Date().toISOString();
      }
      mobileSettings.save(updates);

      this._emitStatus('idle');
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('ledgerly:sync-complete', {
            detail: { pushedCount, uploadedReceipts, pulledCount, lastSync: nowFormatted }
          })
        );
      }

      return {
        success: true,
        pushedCount,
        uploadedReceipts,
        pulledCount,
        lastSync: nowFormatted
      };
    } catch (err) {
      this._emitStatus('error', err.message);
      throw err;
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Unpairs the mobile device and revokes session.
   * @returns {Promise<void>}
   */
  async unpair() {
    if (this.isPaired()) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      try {
        const baseUrl = this._getBaseUrl();
        const token = mobileSettings.settings.sessionToken;
        await fetch(`${baseUrl}/api/v1/unpair`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          signal: controller.signal
        });
      } catch {
        // Best effort server unpair
      } finally {
        clearTimeout(timeout);
      }
    }

    mobileSettings.save({
      pairedHost: '',
      pairedPort: null,
      sessionToken: null,
      pairedMachineName: null,
      lastSync: 'Not Paired'
    });

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('ledgerly:sync-unpaired'));
    }
  }

  /**
   * Emits sync status event for reactive UI updates.
   * @private
   * @param {'idle'|'syncing'|'error'} state
   * @param {string} [error]
   */
  _emitStatus(state, error = null) {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('ledgerly:sync-status', { detail: { state, error } }));
    }
  }
}

export const syncClient = new SyncClient();
export default syncClient;
