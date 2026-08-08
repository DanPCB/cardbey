/**
 * Staging-safe Universal Library bootstrap.
 *
 * Reuses existing Originals import + Pexels sync + real collections.
 * Does NOT run development fixture seed.
 * Does NOT force-bypass provider flags unless --force is passed.
 * Does NOT project local filesystem creator pilot assets (staging has no those static paths).
 *
 * Usage:
 *   node scripts/staging-ul-bootstrap.mjs
 *   node scripts/staging-ul-bootstrap.mjs --provider=pexels --limit=16
 *   node scripts/staging-ul-bootstrap.mjs --skip-pexels
 *   node scripts/staging-ul-bootstrap.mjs --force   # only when ops explicitly need flag bypass
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prisma, ensurePrismaConnection } from '../src/lib/prisma.js';
import { importCardbeyOriginals } from '../src/services/universalLibrary/cardbeyOriginalsImport.js';
import { runPexelsLibrarySync } from '../src/services/universalLibrary/pexelsLibrarySync.js';
import { publishRealCollections } from '../src/services/universalLibrary/realCollections.js';
import { isDevelopmentFixture, getContentOrigin } from '../src/services/universalLibrary/contentOrigin.js';
import { ASSET_STATUS } from '../src/services/universalLibrary/universalAssetTypes.js';
import { Features } from '../src/config/features.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m || process.env[m[1]]) continue;
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

function parseArgs(argv) {
  const out = {
    provider: 'pexels',
    limit: 16,
    skipPexels: false,
    skipOriginals: false,
    skipCollections: false,
    force: false,
  };
  for (const a of argv) {
    if (a === '--skip-pexels') out.skipPexels = true;
    else if (a === '--skip-originals') out.skipOriginals = true;
    else if (a === '--skip-collections') out.skipCollections = true;
    else if (a === '--force') out.force = true;
    else if (a.startsWith('--provider=')) out.provider = a.slice('--provider='.length);
    else if (a.startsWith('--limit=')) {
      const n = Number(a.slice('--limit='.length));
      if (Number.isFinite(n)) out.limit = Math.min(Math.max(Math.trunc(n), 1), 40);
    }
  }
  return out;
}

async function catalogueSnapshot() {
  const published = await prisma.universalAsset.findMany({
    where: { status: ASSET_STATUS.PUBLISHED },
    take: 5000,
  });
  const real = published.filter((a) => !isDevelopmentFixture(a));
  /** @type {Record<string, number>} */
  const byOrigin = {};
  /** @type {Record<string, number>} */
  const byProvider = {};
  for (const a of real) {
    const o = getContentOrigin(a);
    byOrigin[o] = (byOrigin[o] || 0) + 1;
    const p = String(a.provider || 'unknown');
    byProvider[p] = (byProvider[p] || 0) + 1;
  }
  return {
    totalPublished: published.length,
    publicReal: real.length,
    fixtures: published.length - real.length,
    byOrigin,
    byProvider,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await ensurePrismaConnection();

  console.log('=== Staging UL bootstrap ===');
  console.log({
    args,
    ulV1: Features.universalLibrary.v1,
    externalOpenProviderV1: Features.universalLibrary.externalOpenProviderV1,
    fixturesV1: Features.universalLibrary.fixturesV1,
    scheduledSync: Features.universalLibrary.providerScheduledSyncV1,
    pexelsKey: process.env.PEXELS_API_KEY?.trim() ? 'PRESENT' : 'MISSING',
  });

  if (!Features.universalLibrary.v1) {
    throw new Error('ENABLE_UNIVERSAL_LIBRARY_V1 (or non-prod default) required');
  }
  if (Features.universalLibrary.fixturesV1) {
    console.warn(
      '[warn] ENABLE_UNIVERSAL_LIBRARY_FIXTURES_V1 is ON — public catalogue may include fixtures. Prefer OFF on staging.',
    );
  }

  if (!args.skipOriginals) {
    console.log('=== Import Cardbey Originals (files present under Core public only) ===');
    const originals = await importCardbeyOriginals(prisma, { skipExisting: true });
    console.log({
      ok: originals.ok,
      importedOrUpgraded: originals.importedOrUpgraded,
      failed: originals.failed,
      catalogRealCount: originals.catalogRealCount,
      note: 'Missing dashboard-only sources are expected failures until those assets ship with Core.',
    });
    // Staging Gate B does not require full-manifest Originals; Pexels pilot is sufficient for catalogue > 0.
    // Still re-run for idempotency proof on whatever succeeded.
    console.log('=== Re-run Originals (idempotency) ===');
    const originals2 = await importCardbeyOriginals(prisma, { skipExisting: true });
    console.log({
      ok: originals2.ok,
      importedOrUpgraded: originals2.importedOrUpgraded,
      failed: originals2.failed,
    });
  }

  if (!args.skipPexels) {
    if (args.provider !== 'pexels') {
      throw new Error(`Unsupported --provider=${args.provider} (staging bootstrap supports pexels only)`);
    }
    if (!process.env.PEXELS_API_KEY?.trim()) {
      throw new Error('PEXELS_API_KEY MISSING — configure staging Core secret before provider pilot');
    }
    if (!Features.universalLibrary.externalOpenProviderV1 && !args.force) {
      throw new Error(
        'ENABLE_FIRST_EXTERNAL_PROVIDER_V1 is off. Set it on staging, or pass --force only for explicit ops bypass.',
      );
    }
    console.log('=== Bounded Pexels pilot ===');
    const pexels = await runPexelsLibrarySync(prisma, {
      maxPublish: args.limit,
      force: args.force === true,
    });
    console.log({
      ok: pexels.ok,
      status: pexels.status,
      published: pexels.published,
      outcomes: pexels.outcomes,
      error: pexels.error,
    });
    if (!pexels.ok) {
      throw new Error(pexels.error || 'pexels_sync_failed');
    }
  }

  if (!args.skipCollections) {
    console.log('=== Publish real collections ===');
    const cols = await publishRealCollections(prisma);
    console.log(cols);
  }

  const snap = await catalogueSnapshot();
  console.log('=== Catalogue snapshot ===');
  console.log(snap);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
