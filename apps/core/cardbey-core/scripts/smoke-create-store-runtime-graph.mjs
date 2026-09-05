/**
 * RELEASE INTEGRITY gate — create-store runtime import graph.
 *
 * Phase 1 (plain Node ESM): research/location modules must load without tsx.
 * Phase 2 (tsx/esm): production-parity imports for catalogAuthorityDecision +
 * structured_store_build (same loader as `npm start`).
 *
 * Usage (from apps/core/cardbey-core):
 *   node scripts/smoke-create-store-runtime-graph.mjs
 *   npm run gate:create-store-runtime
 */

import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** @param {string} rel */
function moduleHref(rel) {
  return pathToFileURL(path.join(root, rel)).href;
}

/** @param {string} text */
function summarizeSpawnOutput(text) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.length > 0);
  if (!lines.length) return '(no output)';
  // Prefer the real ERR_* / Cannot find module line over Node's stack frame header.
  const interesting =
    lines.find((l) => /ERR_[A-Z0-9_]+|Cannot find (module|package)|Detected cycle/i.test(l)) ||
    lines[lines.length - 1];
  const tail = lines.slice(-12).join(' | ');
  return interesting === tail ? interesting : `${interesting} :: ${tail}`;
}

const plainNodeTargets = [
  'src/lib/businessDiscovery/businessDataNormalizer.runtime.js',
  'src/lib/businessDiscovery/businessDataNormalizer.js',
  'src/lib/businessDiscovery/businessEntityResolver.js',
  'src/lib/businessDiscovery/businessDiscoverySources.js',
  'src/lib/businessDiscovery/businessSourceAttribution.js',
  'src/lib/businessDiscovery/seoDisplayName.runtime.js',
  'src/lib/location/resolveCanonicalBusinessLocation.runtime.js',
  'src/lib/location/resolveCanonicalBusinessLocation.js',
  'src/lib/location/applyCanonicalLocation.js',
  'src/lib/storeCreationResearch/index.js',
  'src/lib/storeCreationResearch/catalogAuthorityDecision.js',
  'src/lib/storeResearch/index.js',
  'src/services/draftStore/websiteTemplateFoundation.js',
  'src/services/draftStore/websiteSectionsGenerator.js',
];

/** Production-parity imports (require tsx like `node --import tsx/esm src/server.js`). */
const tsxTargets = [
  'src/lib/storeCreationResearch/catalogAuthorityDecision.js',
  'src/lib/toolExecutors/store/structured_store_build.js',
];

let failed = 0;

console.log('[gate:create-store-runtime] phase=plain-node-esm');
for (const rel of plainNodeTargets) {
  try {
    await import(moduleHref(rel));
    console.log('OK', rel);
  } catch (err) {
    failed += 1;
    console.error('FAIL', rel, err?.code || '', (err?.message || String(err)).split('\n')[0]);
  }
}

console.log('[gate:create-store-runtime] phase=tsx-esm (production parity)');
for (const rel of tsxTargets) {
  // Relative import from package cwd — mirrors production better than file:// URLs.
  const snippet = `
import(${JSON.stringify('./' + rel)}).then(() => process.exit(0)).catch((e) => {
  console.error(e?.code || 'ERR', e?.message || String(e));
  if (e?.cause) console.error('cause', e.cause?.message || e.cause);
  if (e?.stack) console.error(e.stack);
  process.exit(1);
});
`.trim();

  const result = spawnSync(
    process.execPath,
    ['--import', 'tsx/esm', '--input-type=module', '-e', snippet],
    {
      cwd: root,
      env: process.env,
      encoding: 'utf8',
      maxBuffer: 2 * 1024 * 1024,
    },
  );

  if (result.status === 0) {
    console.log('OK', rel, '(tsx)');
  } else {
    failed += 1;
    const detail = summarizeSpawnOutput(
      [result.error?.message, result.stderr, result.stdout].filter(Boolean).join('\n'),
    );
    console.error('FAIL', rel, '(tsx)', detail || `exit ${result.status ?? '?'} signal=${result.signal ?? 'none'}`);
  }
}

if (failed > 0) {
  console.error(`\ngate:create-store-runtime: ${failed} failure(s)`);
  process.exit(1);
}
console.log('\ngate:create-store-runtime: all required imports OK (plain Node + tsx/esm)');
