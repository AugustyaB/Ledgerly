/**
 * ============================================================================
 * Ledgerly — Electron Fuses Hook (afterPack)
 * ============================================================================
 *
 * Flips security & anti-inspection Electron Fuses on the packaged binary
 * prior to installer packaging, and re-signs unsigned macOS ARM64 bundles
 * ad-hoc so Apple Silicon does not SIGKILL modified Mach-O headers.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const PLATFORM_EXT = {
  darwin: '.app',
  mas: '.app',
  win32: '.exe',
  linux: ''
};

/**
 * Resolves the target Electron executable or macOS `.app` bundle path inside `appOutDir`.
 *
 * @param {import('app-builder-lib').AfterPackContext} context
 * @returns {string}
 */
function resolveElectronBinaryPath(context) {
  const { appOutDir, electronPlatformName, packager } = context;
  const ext = PLATFORM_EXT[electronPlatformName] ?? '';
  const candidates = [
    electronPlatformName === 'linux' ? packager.executableName : null,
    packager.appInfo && packager.appInfo.productFilename,
    packager.executableName
  ].filter(Boolean);

  for (const name of candidates) {
    const candidatePath = path.join(appOutDir, `${name}${ext}`);
    if (fs.existsSync(candidatePath)) {
      return candidatePath;
    }
  }

  const fallbackName = candidates[0] || 'Ledgerly';
  return path.join(appOutDir, `${fallbackName}${ext}`);
}

/**
 * electron-builder `afterPack` hook.
 *
 * @param {import('app-builder-lib').AfterPackContext} context
 */
module.exports = async function afterPackFuses(context) {
  const { electronPlatformName } = context;
  const electronBinaryPath = resolveElectronBinaryPath(context);

  if (!fs.existsSync(electronBinaryPath)) {
    throw new Error(`[afterPackFuses] Packaged Electron binary not found: ${electronBinaryPath}`);
  }

  const { flipFuses, FuseVersion, FuseV1Options } = await import('@electron/fuses');

  const fuseConfig = {
    version: FuseVersion.V1,
    [FuseV1Options.RunAsNode]: false,
    [FuseV1Options.EnableNodeCliInspectArguments]: false,
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
    [FuseV1Options.OnlyLoadAppFromAsar]: true,
    [FuseV1Options.EnableCookieEncryption]: true
  };

  console.log(`[afterPackFuses] Flipping Electron fuses on ${electronBinaryPath}...`);
  await flipFuses(electronBinaryPath, fuseConfig);
  console.log('[afterPackFuses] Electron fuses flipped successfully.');

  // macOS ARM64 Guard: unsigned Mach-O binaries modified by flipFuses require ad-hoc re-signing
  // so Apple Silicon Gatekeeper/kernel code-signature checks do not SIGKILL the process on launch.
  if ((electronPlatformName === 'darwin' || electronPlatformName === 'mas') && !process.env.CSC_LINK) {
    console.log(`[afterPackFuses] Unsigned ${electronPlatformName} build detected; applying ad-hoc codesign...`);
    execFileSync('codesign', ['--force', '--deep', '--sign', '-', electronBinaryPath], {
      stdio: 'inherit'
    });
    console.log('[afterPackFuses] Ad-hoc codesign complete.');
  }
};
