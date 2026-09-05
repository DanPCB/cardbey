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

const plainNodeTargets = [
  'src/lib/businessDiscovery/businessDataNormalizer.runtime.js',
  'src/lib/businessDiscovery/businessDataNormalizer.js',
  'src/lib/businessDiscovery/businessEntityResolver.js',
  'src/lib/businessDiscovery/businessDiscoverySources.js',
  'src/lib/businessDiscovery/businessSourceAttribution.js',
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
  const href = moduleHref(rel);
  const snippet = `import('${href}').then(()=>process.exit(0)).catch((e)=>{console.error(e?.code||'', (e?.message||String(e)).split('\\n')[0]);process.exit(1);})`;
  const result = spawnSync(process.execPath, ['--import', 'tsx/esm', '--input-type=module', '-e', snippet], {
    cwd: root,
    env: process.env,
    encoding: 'utf8',
  });
  if (result.status === 0) {
    console.log('OK', rel, '(tsx)');
  } else {
    failed += 1;
    const detail = (result.stderr || result.stdout || '').trim().split('\n')[0] || `exit ${result.status}`;
    console.error('FAIL', rel, '(tsx)', detail);
  }
}

if (failed > 0) {
  console.error(`\ngate:create-store-runtime: ${failed} failure(s)`);
  process.exit(1);
}
console.log('\ngate:create-store-runtime: all required imports OK (plain Node + tsx/esm)');
