/**
 * ============================================================================
 * Ledgerly — Build-Time Single-Bundle Collapse & IPC Opcode Abstractism
 * ============================================================================
 *
 * Produces a minified, comment-stripped, IPC-abstracted `dist-app/` directory
 * for packaged Electron releases without altering readable `src/` dev files.
 *
 * Outputs:
 *   - dist-app/main.cjs
 *   - dist-app/preload.cjs
 *   - dist-app/app.bundle.js
 *   - dist-app/quickPill.bundle.js
 *   - dist-app/icons.js
 *   - dist-app/styles.css
 *   - dist-app/quickPill.css
 *   - dist-app/index.html
 *   - dist-app/quickPill.html
 */

'use strict';

const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const ROOT_DIR = path.resolve(__dirname, '..');
const SRC_DIR = path.join(ROOT_DIR, 'src');
const DIST_APP_DIR = path.join(ROOT_DIR, 'dist-app');

const IPC_CALL_SITE_REGEX =
  /(\b(?:invokeIPC|ipcRenderer\.(?:send|on|removeAllListeners)|ipcMain\.(?:handle|on)|wrapIPC|guardedHandle|webContents\.send)\s*\(\s*(?:ipcMain\s*,\s*)?)(['"])([^'"]+)\2/g;

/**
 * Collects all IPC channel names across main.js and preload.js and maps each
 * deterministically to an opaque opcode (`op_0x01`, `op_0x02`, ...).
 *
 * @returns {Map<string, string>}
 */
function buildIpcOpcodeMap() {
  const mainSrc = fs.readFileSync(path.join(SRC_DIR, 'main.js'), 'utf8');
  const preloadSrc = fs.readFileSync(path.join(SRC_DIR, 'preload.js'), 'utf8');

  const channels = new Set();
  for (const source of [mainSrc, preloadSrc]) {
    IPC_CALL_SITE_REGEX.lastIndex = 0;
    let match;
    while ((match = IPC_CALL_SITE_REGEX.exec(source)) !== null) {
      channels.add(match[3]);
    }
  }

  const sorted = [...channels].sort();
  const padWidth = Math.max(2, sorted.length.toString(16).length);
  const map = new Map();
  sorted.forEach((channel, idx) => {
    const hex = (idx + 1).toString(16).padStart(padWidth, '0');
    map.set(channel, `op_0x${hex}`);
  });

  return map;
}

/**
 * Rewrites descriptive IPC channel strings at IPC call sites using the opaque opcode map.
 *
 * @param {string} code
 * @param {Map<string, string>} opcodeMap
 * @returns {string}
 */
function rewriteIpcChannels(code, opcodeMap) {
  IPC_CALL_SITE_REGEX.lastIndex = 0;
  return code.replace(IPC_CALL_SITE_REGEX, (full, prefix, quote, channel) => {
    const opcode = opcodeMap.get(channel);
    return opcode ? `${prefix}${quote}${opcode}${quote}` : full;
  });
}

/**
 * Injects a local `__dirname` shadow for bundled submodules originating from subdirectories
 * of `src/` (e.g. `src/services/`, `src/logger/`, `src/validation/`) so relative `../../assets`
 * lookups resolve identically from `dist-app/main.cjs`.
 *
 * @param {string} code
 * @param {string} relDir
 * @returns {string}
 */
function normalizeSubmoduleDirname(code, relDir) {
  if (!relDir || relDir === '.' || !/\b__dirname\b/.test(code)) {
    return code;
  }
  const dirnameDecl = `const __dirname = require('path').join(__LEDGERLY_APP_ROOT__, 'dist-app', ${JSON.stringify(relDir)});\n`;
  const strictPrologue = /^(\s*(?:\/\*[\s\S]*?\*\/\s*|\/\/[^\n]*\n\s*)*['"]use strict['"];?\s*)/;
  if (strictPrologue.test(code)) {
    return code.replace(strictPrologue, `$1\n${dirnameDecl}`);
  }
  return `${dirnameDecl}${code}`;
}

/**
 * Creates an esbuild plugin that normalizes `__dirname` depth for bundled backend modules
 * and applies build-time IPC opcode abstractism to main/preload entrypoints.
 *
 * @param {Map<string, string>} opcodeMap
 * @param {{ normalizeDirname?: boolean }} [options]
 * @returns {import('esbuild').Plugin}
 */
function createHardeningPlugin(opcodeMap, options = {}) {
  const { normalizeDirname = false } = options;
  return {
    name: 'ledgerly-bundle-hardening',
    setup(build) {
      build.onLoad({ filter: /\.js$/ }, args => {
        const resolved = path.resolve(args.path);
        const relToSrc = path.relative(SRC_DIR, resolved).replace(/\\/g, '/');
        if (relToSrc.startsWith('..')) {
          return undefined;
        }

        let contents = fs.readFileSync(resolved, 'utf8');

        if (relToSrc === 'main.js' || relToSrc === 'preload.js') {
          contents = rewriteIpcChannels(contents, opcodeMap);
        }

        if (normalizeDirname) {
          const relDir = path.dirname(relToSrc);
          contents = normalizeSubmoduleDirname(contents, relDir);
        }

        return { contents, loader: 'js' };
      });
    }
  };
}

/**
 * Rewrites HTML files into `dist-app/`, stripping comments and pointing script tags to
 * the compiled esbuild bundles.
 *
 * @param {string} filename
 * @param {Array<[string|RegExp, string]>} replacements
 */
function buildHtmlFile(filename, replacements) {
  let html = fs.readFileSync(path.join(SRC_DIR, filename), 'utf8');
  html = html.replace(/<!--[\s\S]*?-->/g, '');
  for (const [pattern, replacement] of replacements) {
    html = html.replace(pattern, replacement);
  }
  html = html.replace(/^\s*[\r\n]+/gm, '');
  fs.writeFileSync(path.join(DIST_APP_DIR, filename), html, 'utf8');
}

async function main() {
  fs.rmSync(DIST_APP_DIR, { recursive: true, force: true });
  fs.mkdirSync(DIST_APP_DIR, { recursive: true });

  const opcodeMap = buildIpcOpcodeMap();

  await Promise.all([
    // 1. Main process bundle (CJS, node, external native/heavy packages)
    esbuild.build({
      entryPoints: [path.join(SRC_DIR, 'main.js')],
      outfile: path.join(DIST_APP_DIR, 'main.cjs'),
      platform: 'node',
      format: 'cjs',
      bundle: true,
      minify: true,
      legalComments: 'none',
      sourcemap: false,
      drop: ['debugger'],
      external: ['electron', 'xlsx', 'pdf-parse', 'tesseract.js', 'onnxruntime-node'],
      banner: {
        js: 'const __LEDGERLY_APP_ROOT__=require("path").resolve(__dirname,"..");'
      },
      plugins: [createHardeningPlugin(opcodeMap, { normalizeDirname: true })]
    }),

    // 2. Preload IPC bridge bundle (CJS, node, external electron)
    esbuild.build({
      entryPoints: [path.join(SRC_DIR, 'preload.js')],
      outfile: path.join(DIST_APP_DIR, 'preload.cjs'),
      platform: 'node',
      format: 'cjs',
      bundle: true,
      minify: true,
      legalComments: 'none',
      sourcemap: false,
      drop: ['debugger'],
      external: ['electron'],
      plugins: [createHardeningPlugin(opcodeMap, { normalizeDirname: false })]
    }),

    // 3. Main renderer bundle (IIFE, browser)
    esbuild.build({
      entryPoints: [path.join(SRC_DIR, 'app.js')],
      outfile: path.join(DIST_APP_DIR, 'app.bundle.js'),
      platform: 'browser',
      format: 'iife',
      bundle: true,
      minify: true,
      legalComments: 'none',
      sourcemap: false,
      drop: ['debugger']
    }),

    // 4. Quick Pill renderer bundle (IIFE, browser)
    esbuild.build({
      entryPoints: [path.join(SRC_DIR, 'quickPill.js')],
      outfile: path.join(DIST_APP_DIR, 'quickPill.bundle.js'),
      platform: 'browser',
      format: 'iife',
      bundle: true,
      minify: true,
      legalComments: 'none',
      sourcemap: false,
      drop: ['debugger']
    }),

    // 5. Global icon helper script (minified, preserving window globals)
    esbuild.build({
      entryPoints: [path.join(SRC_DIR, 'icons.js')],
      outfile: path.join(DIST_APP_DIR, 'icons.js'),
      platform: 'browser',
      bundle: false,
      minify: true,
      legalComments: 'none',
      sourcemap: false,
      drop: ['debugger']
    }),

    // 6. Minified CSS stylesheets (bundle: false preserves ../assets/* relative URLs)
    esbuild.build({
      entryPoints: [path.join(SRC_DIR, 'styles.css')],
      outfile: path.join(DIST_APP_DIR, 'styles.css'),
      bundle: false,
      minify: true,
      legalComments: 'none',
      sourcemap: false
    }),

    esbuild.build({
      entryPoints: [path.join(SRC_DIR, 'quickPill.css')],
      outfile: path.join(DIST_APP_DIR, 'quickPill.css'),
      bundle: false,
      minify: true,
      legalComments: 'none',
      sourcemap: false
    })
  ]);

  // 7. Rewrite HTML entrypoints to consume bundled scripts
  buildHtmlFile('index.html', [
    [/<script\s+type="module"\s+src="app\.js"\s*><\/script>/i, '<script src="app.bundle.js"></script>']
  ]);

  buildHtmlFile('quickPill.html', [
    [/<script\s+src="quickPill\.js"\s*><\/script>/i, '<script src="quickPill.bundle.js"></script>']
  ]);

  if (isCommercial) {
    applyCommercialHardeningStubs();
  }

  console.log(
    `✔ Built dist-app/ production bundle (${opcodeMap.size} IPC channels mapped to op_0x01..op_0x${opcodeMap.size
      .toString(16)
      .padStart(2, '0')}${isCommercial ? ', commercial stubs evaluated' : ''})`
  );
}

/**
 * Commercial hardening profile for signed v2.0+ releases (opt-in via `--commercial`).
 * Disabled by default on unsigned v1.2.0 builds to prevent Windows Defender / WinGet false positives.
 */
const COMMERCIAL_OBFUSCATOR_PROFILE = {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.75,
  deadCodeInjection: true,
  deadCodeInjectionThreshold: 0.35,
  stringArray: true,
  stringArrayEncoding: ['rc4'],
  splitStrings: true,
  splitStringsChunkLength: 8
};

/**
 * Resolves an optional commercial toolchain module without requiring it in standard v1.2.0 installs.
 *
 * @param {string} moduleName
 * @returns {any|null}
 */
function tryRequireOptional(moduleName) {
  try {
    return require(moduleName);
  } catch {
    return null;
  }
}

/**
 * Applies opt-in commercial AST control-flow flattening, opaque dead-code chaff predicates,
 * and bytenode `.jsc` compilation hooks when `--commercial` is passed.
 */
function applyCommercialHardeningStubs() {
  console.log('[build-bundle] --commercial flag active (signed v2.0+ hardening pipeline)...');

  const obfuscator = tryRequireOptional('javascript-obfuscator');
  const bundleTargets = ['main.cjs', 'preload.cjs', 'app.bundle.js', 'quickPill.bundle.js'];

  if (obfuscator && typeof obfuscator.obfuscate === 'function') {
    for (const file of bundleTargets) {
      const targetPath = path.join(DIST_APP_DIR, file);
      const source = fs.readFileSync(targetPath, 'utf8');
      const result = obfuscator.obfuscate(source, COMMERCIAL_OBFUSCATOR_PROFILE);
      fs.writeFileSync(targetPath, result.getObfuscatedCode(), 'utf8');
    }
    console.log('[build-bundle] Commercial AST control-flow flattening & chaff predicates applied.');
  } else {
    console.log(
      '[build-bundle] Commercial stub: `javascript-obfuscator` not installed; skipping AST control-flow flattening & opaque dead-code chaff predicates.'
    );
  }

  const bytenode = tryRequireOptional('bytenode');
  const mainBundlePath = path.join(DIST_APP_DIR, 'main.cjs');

  if (bytenode && typeof bytenode.compileFile === 'function') {
    const jscPath = path.join(DIST_APP_DIR, 'main.jsc');
    bytenode.compileFile({ filename: mainBundlePath, output: jscPath });
    fs.writeFileSync(
      mainBundlePath,
      `'use strict';\nrequire('bytenode');\nrequire('./main.jsc');\n`,
      'utf8'
    );
    console.log('[build-bundle] Commercial bytenode `.jsc` bytecode compiled for dist-app/main.jsc.');
  } else {
    console.log(
      '[build-bundle] Commercial stub: `bytenode` not installed; skipping V8 `.jsc` bytecode hook.'
    );
  }
}

const isCommercial = process.argv.includes('--commercial');

main().catch(err => {
  console.error('[build-bundle] Failed:', err);
  process.exit(1);
});
