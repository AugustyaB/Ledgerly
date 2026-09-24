# 🐛 Defect Report: BUG-007

> **Defect ID**: `BUG-007`  
> **Title**: Zero Desktop Pairing UI: IPC Surface Exists in Main/Preload but Desktop App Has No Visual Interface to Pair Devices  
> **Component**: `src/ui/views/SettingsView.js`, `src/preload.js`, `src/main.js`  
> **Severity**: **P0 — Blocker (Core User Journey Broken / Orphaned Feature)**  
> **Found By**: Antigravity Lead QA & Head of Software Quality  
> **Date Logged**: September 19, 2026  
> **Status**: 🟢 RESOLVED  
> **Milestone / Phase**: Milestone v0.6 / Phase 0.6.3  

---

## 1. Defect Summary

In Phase 0.6.3, backend IPC handlers were registered in `src/main.js` and exposed via context bridge in `src/preload.js`:
- `window.electronAPI.startSyncServer()`
- `window.electronAPI.stopSyncServer()`
- `window.electronAPI.getSyncServerStatus()`
- `window.electronAPI.generatePairingToken()`
- `window.electronAPI.getPairedDevices()`
- `window.electronAPI.revokePairedDevice()`

However, an audit of the desktop frontend codebase (`src/ui/`, `src/index.html`) reveals that **none of these methods are ever called in the desktop user interface**.

There is no "Mobile Companion" card in Settings, no button to start/stop the LAN server, no display for the 6-digit ephemeral PIN, no QR code renderer, and no management list to view or revoke paired mobile devices.

A regular desktop user opening Ledgerly has zero visibility into the mobile sync system and no way to discover the computer's IP address or generate a pairing PIN. Currently, pairing can only be initiated by developers running headless Node.js test scripts.

---

## 2. Affected Code Locations

### Location 1: `src/preload.js` (Lines 182–188)
```javascript
// Local Wi-Fi Pairing & LAN Sync Engine (Phase 0.6.3)
startSyncServer: () => invokeIPC('start-sync-server'),
stopSyncServer: () => invokeIPC('stop-sync-server'),
getSyncServerStatus: () => invokeIPC('get-sync-server-status'),
generatePairingToken: () => invokeIPC('generate-pairing-token'),
getPairedDevices: () => invokeIPC('get-paired-devices'),
revokePairedDevice: deviceId => invokeIPC('revoke-paired-device', deviceId),
```
*Grep search for any invocation of these methods in `src/ui/` returned 0 occurrences.*

### Location 2: `src/ui/views/SettingsView.js`
Settings contains sections for General, Database, Models, and Backup, but contains zero cards or dialogs for mobile device pairing or LAN server controls.

---

## 3. Reproduction Steps

1. Launch Ledgerly Desktop (`npm start`).
2. Navigate to Settings (or any other tab).
3. Search for any option to pair a mobile companion, generate a PIN, or view server status.
4. **Actual Result**: No pairing controls or PIN displays exist anywhere in the desktop UI.
5. **Expected Result**: A "Mobile Companion & Wi-Fi Sync" card should exist in Settings with a live status indicator ("Running on 192.168.x.x:52410"), a "Pair Mobile Device" button that renders a 6-digit PIN with a 5-minute countdown, and a list of paired phones with a "Revoke" button.

---

## 4. Remediation Plan

1. In `src/ui/views/SettingsView.js`: Add a dedicated "Mobile Sync & Pairing" section.
2. Hook up `window.electronAPI.getSyncServerStatus()` on mount to show server IP and port.
3. Add a "Pair Mobile Device" button that calls `window.electronAPI.generatePairingToken()`, displays the 6-digit PIN in large monospace font, and optionally renders a QR code.
4. Render the list of currently paired devices via `window.electronAPI.getPairedDevices()` with one-click revocation.
