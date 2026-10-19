/**
 * ============================================================================
 * Ledgerly — 5-Layer × 6-Section Architecture Boundary Verifier (ADR-013)
 * ============================================================================
 *
 * Statically verifies that all JavaScript source files in `src/` and `mobile/src/`
 * adhere to the canonical 5-Layer (L1–L5B) × 6-Section (Sec 1–6) matrix in FLOW.md:
 *
 *   1. 100% Layer & Section Registration: No unclassified/orphan .js files in src/ or mobile/src/.
 *   2. L5B Pure Visuals Isolation: Zero IPC calls (ipcRenderer, window.api, window.electronAPI)
 *      and zero imports from L1, L2, L3, L4, or L5A.
 *   3. L1–L3 Backend/Engine Isolation: Zero imports from L5 (UI views/components) or L4 entrypoints
 *      (src/main.js, src/preload.js).
 *   4. L2 Core Domain Isolation: Zero imports from L4 LAN/IPC transport services.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');

/**
 * Canonical 5-Layer × 6-Section Manifest (77 files across Desktop & Mobile)
 * Layers:
 *   L1  = Data & Persistence
 *   L2  = Core Domain Services (CRUD & Self-Healing)
 *   L3  = Intelligence & Automation (Offline ML, Heuristics & Financial Math)
 *   L4  = IPC Bridge, Validation & LAN Transport
 *   L5A = Stateful Feature Views (IPC / SyncClient Connected)
 *   L5B = Pure Visuals (Zero-Backend / Stateless UI)
 */
const ARCHITECTURE_MANIFEST = {
  // ── LAYER 1: Data, Schemas & Persistence (L1) ─────────────────────────────
  'src/constants.js': { layer: 'L1', sections: ['Sec 1', 'Sec 2', 'Sec 3', 'Sec 4', 'Sec 5', 'Sec 6'] },
  'src/types.js': { layer: 'L1', sections: ['Sec 1', 'Sec 2', 'Sec 3', 'Sec 4', 'Sec 5', 'Sec 6'] },
  'src/storage.js': { layer: 'L1', sections: ['Sec 1', 'Sec 2', 'Sec 3', 'Sec 4', 'Sec 5', 'Sec 6'] },
  'src/receiptStorage.js': { layer: 'L1', sections: ['Sec 3', 'Sec 5'] },
  'src/services/JsonDatabase.js': { layer: 'L1', sections: ['Sec 1', 'Sec 4', 'Sec 6'] },
  'src/services/BackupMirrorService.js': { layer: 'L1', sections: ['Sec 6'] },
  'src/services/VaultCipherService.js': { layer: 'L1', sections: ['Sec 6'] },
  'mobile/src/storage/indexedDbQueue.js': { layer: 'L1', sections: ['Sec 5'] },
  'mobile/src/storage/mobileSettings.js': { layer: 'L1', sections: ['Sec 5'] },

  // ── LAYER 2: Core Domain Services (L2 — CRUD & Self-Healing) ──────────────
  'src/services/ExpenseService.js': { layer: 'L2', sections: ['Sec 1'] },
  'src/services/BudgetService.js': { layer: 'L2', sections: ['Sec 2'] },
  'src/services/ProfileService.js': { layer: 'L2', sections: ['Sec 4'] },
  'src/services/HouseholdService.js': { layer: 'L2', sections: ['Sec 4'] },
  'src/services/NotesService.js': { layer: 'L2', sections: ['Sec 4'] },
  'src/services/AuthService.js': { layer: 'L2', sections: ['Sec 6'] },
  'src/services/DatabaseAuditor.js': { layer: 'L2', sections: ['Sec 6'] },
  'src/services/DataQualityAuditor.js': { layer: 'L2', sections: ['Sec 2', 'Sec 6'] },
  'src/services/DiagnosticExporter.js': { layer: 'L2', sections: ['Sec 6'] },
  'src/logger/crashLogger.js': { layer: 'L2', sections: ['Sec 6'] },

  // ── LAYER 3: Intelligence & Automation (L3 — Math, Heuristics & ML) ───────
  'src/nlpParser.js': { layer: 'L3', sections: ['Sec 1'] },
  'src/categoryMatcher.js': { layer: 'L3', sections: ['Sec 1', 'Sec 3'] },
  'src/fileImporter.js': { layer: 'L3', sections: ['Sec 3'] },
  'src/foresightEngine.js': { layer: 'L3', sections: ['Sec 2'] },
  'src/services/AggregationRollupService.js': { layer: 'L3', sections: ['Sec 2'] },
  'src/services/FinancialIntelligenceFacade.js': { layer: 'L3', sections: ['Sec 2'] },
  'src/services/SubscriptionHunterService.js': { layer: 'L3', sections: ['Sec 2'] },
  'src/services/NotificationEngine.js': { layer: 'L3', sections: ['Sec 2'] },
  'src/services/StatementReconciliationService.js': { layer: 'L3', sections: ['Sec 3'] },
  'src/services/DocumentIntelligenceService.js': { layer: 'L3', sections: ['Sec 3'] },
  'src/services/DocumentNormalizer.js': { layer: 'L3', sections: ['Sec 3'] },
  'src/services/ReceiptTier1Engine.js': { layer: 'L3', sections: ['Sec 3'] },
  'src/services/ReceiptTier2VisionEngine.js': { layer: 'L3', sections: ['Sec 3'] },
  'src/services/ReceiptTier3RegionalEngine.js': { layer: 'L3', sections: ['Sec 3'] },
  'src/services/ReceiptLearningService.js': { layer: 'L3', sections: ['Sec 3'] },
  'src/services/ModelManager.js': { layer: 'L3', sections: ['Sec 3'] },
  'src/services/RegionalIntelligenceRegistry.js': { layer: 'L3', sections: ['Sec 3'] },
  'src/services/SmartDocumentAnalyzer.js': { layer: 'L3', sections: ['Sec 3'] },
  'mobile/src/camera/cameraService.js': { layer: 'L3', sections: ['Sec 5'] },
  'mobile/src/camera/imageCompressor.js': { layer: 'L3', sections: ['Sec 5'] },

  // ── LAYER 4: IPC Bridge, Validation & LAN Transport (L4) ──────────────────
  'src/main.js': { layer: 'L4', sections: ['Sec 1', 'Sec 2', 'Sec 3', 'Sec 4', 'Sec 5', 'Sec 6'] },
  'src/preload.js': { layer: 'L4', sections: ['Sec 1', 'Sec 2', 'Sec 3', 'Sec 4', 'Sec 5', 'Sec 6'] },
  'src/validation/ipcGuard.js': { layer: 'L4', sections: ['Sec 6'] },
  'src/validation/schemaValidator.js': { layer: 'L4', sections: ['Sec 1', 'Sec 2', 'Sec 3', 'Sec 4', 'Sec 5', 'Sec 6'] },
  'src/services/SyncServer.js': { layer: 'L4', sections: ['Sec 5', 'Sec 6'] },
  'src/services/LanBeaconService.js': { layer: 'L4', sections: ['Sec 5'] },
  'src/services/SyncEngine.js': { layer: 'L4', sections: ['Sec 5'] },
  'mobile/src/services/SyncClient.js': { layer: 'L4', sections: ['Sec 5'] },
  'mobile/src/shared/validator.js': { layer: 'L4', sections: ['Sec 5', 'Sec 6'] },

  // ── LAYER 5A: Stateful Feature Views (L5A — IPC / SyncClient Connected) ───
  'src/app.js': { layer: 'L5A', sections: ['Sec 1', 'Sec 2', 'Sec 3', 'Sec 4', 'Sec 5', 'Sec 6'] },
  'src/quickPill.js': { layer: 'L5A', sections: ['Sec 1'] },
  'src/ui/AppRouter.js': { layer: 'L5A', sections: ['Sec 1', 'Sec 4'] },
  'src/ui/AppState.js': { layer: 'L5A', sections: ['Sec 1', 'Sec 2', 'Sec 4'] },
  'src/ui/views/DashboardView.js': { layer: 'L5A', sections: ['Sec 1', 'Sec 2'] },
  'src/ui/views/ExpenseFeedView.js': { layer: 'L5A', sections: ['Sec 1'] },
  'src/ui/views/BatchView.js': { layer: 'L5A', sections: ['Sec 1'] },
  'src/ui/views/ImportView.js': { layer: 'L5A', sections: ['Sec 3'] },
  'src/ui/views/HouseholdView.js': { layer: 'L5A', sections: ['Sec 4'] },
  'src/ui/views/NotesView.js': { layer: 'L5A', sections: ['Sec 4'] },
  'src/ui/views/NotificationView.js': { layer: 'L5A', sections: ['Sec 2'] },
  'src/ui/views/SettingsView.js': { layer: 'L5A', sections: ['Sec 5', 'Sec 6'] },
  'src/ui/components/AuthScreen.js': { layer: 'L5A', sections: ['Sec 6'] },
  'src/ui/components/ErrorBoundary.js': { layer: 'L5A', sections: ['Sec 6'] },
  'src/ui/components/WalkthroughGuide.js': { layer: 'L5A', sections: ['Sec 1', 'Sec 2', 'Sec 3', 'Sec 4', 'Sec 5', 'Sec 6'] },
  'mobile/src/main.js': { layer: 'L5A', sections: ['Sec 5'] },
  'mobile/src/router.js': { layer: 'L5A', sections: ['Sec 5'] },
  'mobile/src/views/CaptureView.js': { layer: 'L5A', sections: ['Sec 5'] },
  'mobile/src/views/QuickAddView.js': { layer: 'L5A', sections: ['Sec 5'] },
  'mobile/src/views/QueueView.js': { layer: 'L5A', sections: ['Sec 5'] },
  'mobile/src/views/SyncView.js': { layer: 'L5A', sections: ['Sec 5'] },

  // ── LAYER 5B: Pure Visuals (L5B — Zero Backend / Stateless UI) ────────────
  'src/icons.js': { layer: 'L5B', sections: ['Sec 1', 'Sec 2', 'Sec 3', 'Sec 4', 'Sec 5', 'Sec 6'] },
  'src/utils/qrCodeGenerator.js': { layer: 'L5B', sections: ['Sec 5'] },
  'src/ui/components/ChartManager.js': { layer: 'L5B', sections: ['Sec 2'] },
  'src/ui/components/CommandPalette.js': { layer: 'L5B', sections: ['Sec 1', 'Sec 6'] },
  'src/ui/helpers/dom.js': { layer: 'L5B', sections: ['Sec 1', 'Sec 2', 'Sec 3', 'Sec 4', 'Sec 5', 'Sec 6'] },
  'src/ui/helpers/formatters.js': { layer: 'L5B', sections: ['Sec 1', 'Sec 2', 'Sec 3', 'Sec 4'] },
  'src/ui/helpers/toast.js': { layer: 'L5B', sections: ['Sec 1', 'Sec 6'] },
  'mobile/src/icons.js': { layer: 'L5B', sections: ['Sec 5'] }
};

function collectJsFiles(dir, baseDir = ROOT_DIR) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'android' || entry.name === 'ios') {
        continue;
      }
      results.push(...collectJsFiles(fullPath, baseDir));
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      const relPath = path.relative(baseDir, fullPath).replace(/\\/g, '/');
      results.push(relPath);
    }
  }
  return results;
}

function extractImports(content) {
  const specs = [];
  const requireRegex = /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  const importRegex = /\bfrom\s+['"]([^'"]+)['"]/g;
  let match;
  while ((match = requireRegex.exec(content)) !== null) {
    specs.push(match[1]);
  }
  while ((match = importRegex.exec(content)) !== null) {
    specs.push(match[1]);
  }
  return specs;
}

function resolveRelativeImport(fromRelPath, importSpec) {
  if (!importSpec.startsWith('.')) return null;
  const fromDir = path.dirname(path.join(ROOT_DIR, fromRelPath));
  let resolved = path.resolve(fromDir, importSpec);
  if (!resolved.endsWith('.js') && fs.existsSync(`${resolved}.js`)) {
    resolved = `${resolved}.js`;
  }
  return path.relative(ROOT_DIR, resolved).replace(/\\/g, '/');
}

function main() {
  const diskFiles = [
    ...collectJsFiles(path.join(ROOT_DIR, 'src')),
    ...collectJsFiles(path.join(ROOT_DIR, 'mobile', 'src'))
  ];

  const errors = [];

  // 1. Check that every file on disk is registered in ARCHITECTURE_MANIFEST
  for (const relPath of diskFiles) {
    if (!ARCHITECTURE_MANIFEST[relPath]) {
      errors.push(
        `[UNCLASSIFIED_FILE] "${relPath}" is missing from ARCHITECTURE_MANIFEST in scripts/check-architecture-layers.js (ADR-013).`
      );
    }
  }

  // 2. Check that every manifest entry exists on disk
  for (const manifestPath of Object.keys(ARCHITECTURE_MANIFEST)) {
    const absPath = path.join(ROOT_DIR, manifestPath);
    if (!fs.existsSync(absPath)) {
      errors.push(`[STALE_MANIFEST_ENTRY] "${manifestPath}" is registered in manifest but does not exist on disk.`);
    }
  }

  // 3. Enforce Layer Boundary Contracts across all registered files
  for (const [relPath, meta] of Object.entries(ARCHITECTURE_MANIFEST)) {
    const absPath = path.join(ROOT_DIR, relPath);
    if (!fs.existsSync(absPath)) continue;

    const content = fs.readFileSync(absPath, 'utf8');
    const imports = extractImports(content);

    // Rule A: L5B (Pure Visuals) must have ZERO IPC calls and ZERO imports outside L5B
    if (meta.layer === 'L5B') {
      if (/\b(ipcRenderer|ipcMain|window\.api|window\.electronAPI)\b/.test(content)) {
        errors.push(
          `[L5B_IPC_VIOLATION] Pure Visual file "${relPath}" (L5B) references IPC/backend globals (ipcRenderer / window.api).`
        );
      }
      for (const spec of imports) {
        const targetRel = resolveRelativeImport(relPath, spec);
        if (targetRel && ARCHITECTURE_MANIFEST[targetRel]) {
          const targetLayer = ARCHITECTURE_MANIFEST[targetRel].layer;
          if (targetLayer !== 'L5B') {
            errors.push(
              `[L5B_IMPORT_VIOLATION] Pure Visual file "${relPath}" (L5B) imports "${targetRel}" (${targetLayer}). L5B may only import L5B.`
            );
          }
        }
      }
    }

    // Rule B: L1, L2, L3 (Backend/Domain/Intelligence) must NEVER import L5A/L5B UI or L4 main/preload
    if (meta.layer === 'L1' || meta.layer === 'L2' || meta.layer === 'L3') {
      for (const spec of imports) {
        const targetRel = resolveRelativeImport(relPath, spec);
        if (targetRel && ARCHITECTURE_MANIFEST[targetRel]) {
          const targetLayer = ARCHITECTURE_MANIFEST[targetRel].layer;
          if (targetLayer === 'L5A' || targetLayer === 'L5B') {
            errors.push(
              `[BACKEND_TO_UI_VIOLATION] "${relPath}" (${meta.layer}) imports UI module "${targetRel}" (${targetLayer}).`
            );
          }
          if (targetRel === 'src/main.js' || targetRel === 'src/preload.js') {
            errors.push(
              `[LAYER_INVERSION] "${relPath}" (${meta.layer}) imports L4 entrypoint "${targetRel}".`
            );
          }
        }
      }
    }

    // Rule C: L2 (Core Domain CRUD) must NEVER import L4 LAN/IPC transport services
    if (meta.layer === 'L2') {
      for (const spec of imports) {
        const targetRel = resolveRelativeImport(relPath, spec);
        if (targetRel && ARCHITECTURE_MANIFEST[targetRel]) {
          const targetLayer = ARCHITECTURE_MANIFEST[targetRel].layer;
          if (targetLayer === 'L4') {
            errors.push(
              `[L2_TO_L4_VIOLATION] Core Domain service "${relPath}" (L2) imports Transport/IPC module "${targetRel}" (L4).`
            );
          }
        }
      }
    }
  }

  if (errors.length > 0) {
    console.error(`\n❌ Architecture Layer Verification Failed (${errors.length} violation(s)):`);
    for (const err of errors) {
      console.error(`  - ${err}`);
    }
    process.exit(1);
  }

  const layerCounts = { L1: 0, L2: 0, L3: 0, L4: 0, L5A: 0, L5B: 0 };
  for (const meta of Object.values(ARCHITECTURE_MANIFEST)) {
    layerCounts[meta.layer] = (layerCounts[meta.layer] || 0) + 1;
  }

  console.log(
    `✔ 5-Layer × 6-Section Architecture Verified: ${diskFiles.length}/${diskFiles.length} files compliant ` +
      `(L1:${layerCounts.L1}, L2:${layerCounts.L2}, L3:${layerCounts.L3}, L4:${layerCounts.L4}, L5A:${layerCounts.L5A}, L5B:${layerCounts.L5B})`
  );
}

main();
