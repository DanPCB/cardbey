/**
 * Plain-Node ESM smoke test for the production create-store research graph.
 * Must pass without --import tsx (same resolution semantics as a broken/absent TS loader).
 *
 * Usage (from apps/core/cardbey-core):
 *   node scripts/smoke-create-store-runtime-graph.mjs
 */
import { pathToFileURL } from 'url';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const targets = [
  'src/lib/businessDiscovery/businessDataNormalizer.runtime.js',
  'src/lib/businessDiscovery/businessDataNormalizer.js',
  'src/lib/businessDiscovery/businessEntityResolver.js',
  'src/lib/businessDiscovery/businessDiscoverySources.js',
  'src/lib/businessDiscovery/businessSourceAttribution.js',
  'src/lib/location/resolveCanonicalBusinessLocation.runtime.js',
  'src/lib/location/resolveCanonicalBusinessLocation.js',
  'src/lib/location/applyCanonicalLocation.js',
  'src/lib/storeCreationResearch/index.js',
  'src/lib/storeResearch/index.js',
  'src/services/draftStore/websiteTemplateFoundation.js',
  'src/services/draftStore/websiteSectionsGenerator.js',
];

let failed = 0;
for (const rel of targets) {
  const href = pathToFileURL(path.join(root, rel)).href;
  try {
    await import(href);
    console.log('OK', rel);
  } catch (err) {
    failed += 1;
    console.error('FAIL', rel, err?.code || '', (err?.message || String(err)).split('\n')[0]);
  }
}

// structured_store_build pulls prisma/bcrypt — only assert the module path resolves past research/location.
try {
  const href = pathToFileURL(path.join(root, 'src/lib/toolExecutors/store/structured_store_build.js')).href;
  await import(href);
  console.log('OK src/lib/toolExecutors/store/structured_store_build.js');
} catch (err) {
  const msg = err?.message || String(err);
  // Local workspaces may lack bcryptjs/prisma client; research/location graph is the production defect.
  if (
    /bcryptjs|@prisma\/client|\.prisma\/client|client-gen/i.test(msg) &&
    !/businessDiscovery|storeCreationResearch|applyCanonicalLocation|resolveCanonicalBusinessLocation|websiteTemplateFoundation/i.test(
      msg,
    )
  ) {
    console.log(
      'SKIP structured_store_build (env dependency missing, not research graph):',
      (msg.split('\n')[0] || '').slice(0, 120),
    );
  } else {
    failed += 1;
    console.error('FAIL structured_store_build', err?.code || '', msg.split('\n')[0]);
  }
}

if (failed > 0) {
  console.error(`\nsmoke-create-store-runtime-graph: ${failed} failure(s)`);
  process.exit(1);
}
console.log('\nsmoke-create-store-runtime-graph: all required imports OK under plain Node ESM');
