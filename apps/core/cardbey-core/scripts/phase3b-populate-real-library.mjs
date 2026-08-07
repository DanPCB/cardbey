/**
 * Phase 3B local population: originals → pexels → collections → audit.
 * Usage: node scripts/phase3b-populate-real-library.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prisma, ensurePrismaConnection } from '../src/lib/prisma.js';
import { importCardbeyOriginals } from '../src/services/universalLibrary/cardbeyOriginalsImport.js';
import { runPexelsLibrarySync } from '../src/services/universalLibrary/pexelsLibrarySync.js';
import { publishRealCollections } from '../src/services/universalLibrary/realCollections.js';
import { projectCreatorContentToLibrary } from '../src/services/universalLibrary/creatorLibraryProjection.js';
import { isDevelopmentFixture, getContentOrigin } from '../src/services/universalLibrary/contentOrigin.js';
import { ASSET_STATUS } from '../src/services/universalLibrary/universalAssetTypes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m || process.env[m[1]]) continue;
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

process.env.ENABLE_FIRST_EXTERNAL_PROVIDER_V1 =
  process.env.ENABLE_FIRST_EXTERNAL_PROVIDER_V1 || 'true';
process.env.ENABLE_REAL_LIBRARY_COLLECTIONS_V1 =
  process.env.ENABLE_REAL_LIBRARY_COLLECTIONS_V1 || 'true';

async function main() {
  await ensurePrismaConnection();
  console.log('=== Import Cardbey Originals ===');
  const originals = await importCardbeyOriginals(prisma, { skipExisting: true });
  console.log({
    ok: originals.ok,
    importedOrUpgraded: originals.importedOrUpgraded,
    failed: originals.failed,
    catalogRealCount: originals.catalogRealCount,
  });

  console.log('=== Project pilot creator sample (if none) ===');
  const creatorCount = await prisma.universalAsset.count({
    where: { provider: 'creator_studio', status: ASSET_STATUS.PUBLISHED },
  });
  const pilotPreviews = [
    ['beauty', '/assets/template-preview/beauty-wellness-website.jpg'],
    ['food-drink', '/assets/template-preview/restaurant-cafe-website.jpg'],
    ['retail', '/assets/template-preview/retail-store-website.jpg'],
    ['fashion', '/assets/template-preview/minimal-seller-storefront.jpg'],
    ['home-services', '/assets/template-preview/trades-home-services-website.jpg'],
  ];
  if (creatorCount < 5) {
    for (let i = creatorCount; i < 5; i += 1) {
      const [industry, preview] = pilotPreviews[i % pilotPreviews.length];
      const r = await projectCreatorContentToLibrary(prisma, {
        creatorId: 'pilot_creator_studio',
        creatorLabel: 'Pilot Creator',
        creatorContentId: `pilot-creator-asset-${i + 1}`,
        title: `Pilot Creator ${industry} Asset ${i + 1}`,
        description: 'Controlled pilot Creator Studio projection for Phase 3B.',
        type: 'image',
        preview,
        industry,
        categories: [industry],
        accessMode: 'FREE_WITH_ATTRIBUTION',
        rightsDeclaration: true,
        withdrawalPolicyAcknowledged: true,
        creatorVerified: true,
        allowPilot: true,
      });
      console.log('creator project', r);
    }
  } else {
    console.log('creator assets already >= 5', creatorCount);
  }

  console.log('=== Pexels curated sync ===');
  const pexels = await runPexelsLibrarySync(prisma, { maxPublish: 60, force: true });
  console.log({
    ok: pexels.ok,
    status: pexels.status,
    published: pexels.published,
    outcomes: pexels.outcomes,
    error: pexels.error,
  });

  console.log('=== Publish real collections ===');
  const cols = await publishRealCollections(prisma);
  console.log(cols);

  const published = await prisma.universalAsset.findMany({
    where: { status: ASSET_STATUS.PUBLISHED },
    take: 5000,
  });
  const real = published.filter((a) => !isDevelopmentFixture(a));
  /** @type {Record<string, number>} */
  const byOrigin = {};
  /** @type {Record<string, number>} */
  const byIndustry = {};
  for (const a of real) {
    const o = getContentOrigin(a);
    byOrigin[o] = (byOrigin[o] || 0) + 1;
    const meta = a.metadata && typeof a.metadata === 'object' ? a.metadata : {};
    const ind = String(meta.industry || (a.categories?.[0] ?? 'unset'));
    byIndustry[ind] = (byIndustry[ind] || 0) + 1;
  }
  console.log('=== Catalogue ===');
  console.log({
    realPublished: real.length,
    fixtures: published.length - real.length,
    byOrigin,
    byIndustry,
    collections: cols.collections,
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
