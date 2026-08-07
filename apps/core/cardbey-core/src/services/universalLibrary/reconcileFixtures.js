/**
 * Mark synthetic Phase 2F rich-seed inventory as DEVELOPMENT_FIXTURE.
 * Does not delete — fixtures remain for automated tests when flag enabled.
 */

import {
  CATALOGUE_QUALITY,
  CONTENT_ORIGIN,
  looksLikeRichSeedFixture,
  getContentOrigin,
} from './contentOrigin.js';

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {object} [options]
 */
export async function reconcileDevelopmentFixtures(prisma, options = {}) {
  const forceAllSeed = options.forceAllSeed === true;
  const assets = await prisma.universalAsset.findMany({ take: 5000 });

  let marked = 0;
  let skipped = 0;
  let already = 0;
  /** @type {string[]} */
  const sampleTitles = [];

  for (const asset of assets) {
    const meta = asset.metadata && typeof asset.metadata === 'object' ? { ...asset.metadata } : {};
    if (getContentOrigin(asset) === CONTENT_ORIGIN.DEVELOPMENT_FIXTURE) {
      already += 1;
      continue;
    }
    // Never demote approved first-party / creator real assets
    if (
      meta.contentOrigin === CONTENT_ORIGIN.REAL_FIRST_PARTY ||
      meta.contentOrigin === CONTENT_ORIGIN.REAL_CREATOR ||
      meta.contentOrigin === CONTENT_ORIGIN.REAL_BUSINESS ||
      meta.contentOrigin === CONTENT_ORIGIN.REAL_PROVIDER
    ) {
      skipped += 1;
      continue;
    }

    const isFixture =
      forceAllSeed ||
      looksLikeRichSeedFixture(asset) ||
      (String(asset.provider) === 'seed' && Boolean(meta.seedKey)) ||
      (String(asset.provider) === 'cardbey_internal' && Boolean(meta.seedKey) && Boolean(meta.assetRole)) ||
      // Unclassified Phase 2 inventory without real provenance
      (!meta.provenance &&
        !meta.manifestId &&
        !meta.sourceFile &&
        (String(asset.provider) === 'seed' || Boolean(meta.seedKey) || Boolean(meta.assetRole)));

    if (!isFixture) {
      skipped += 1;
      continue;
    }

    await prisma.universalAsset.update({
      where: { id: asset.id },
      data: {
        metadata: {
          ...meta,
          contentOrigin: CONTENT_ORIGIN.DEVELOPMENT_FIXTURE,
          catalogueQualityStatus: CATALOGUE_QUALITY.FIXTURE_ONLY,
          syntheticEngagement: true,
          fixtureLabel: 'Development fixture',
          // Strip misleading product signals from metadata used by public cards
          premium: false,
          creatorVerified: false,
          views: 0,
          downloads: 0,
          rating: null,
        },
      },
    });
    marked += 1;
    if (sampleTitles.length < 12) sampleTitles.push(asset.title);
  }

  const real = await countByOrigin(prisma, CONTENT_ORIGIN.REAL_FIRST_PARTY);
  const fixtures = await countFixtures(prisma);

  return {
    ok: true,
    totalScanned: assets.length,
    marked,
    alreadyFixture: already,
    skipped,
    sampleTitles,
    totals: { fixtures, realFirstParty: real },
  };
}

async function countFixtures(prisma) {
  const assets = await prisma.universalAsset.findMany({
    select: { metadata: true },
    take: 5000,
  });
  return assets.filter((a) => {
    const m = a.metadata && typeof a.metadata === 'object' ? a.metadata : {};
    return m.contentOrigin === CONTENT_ORIGIN.DEVELOPMENT_FIXTURE;
  }).length;
}

async function countByOrigin(prisma, origin) {
  const assets = await prisma.universalAsset.findMany({
    select: { metadata: true },
    take: 5000,
  });
  return assets.filter((a) => {
    const m = a.metadata && typeof a.metadata === 'object' ? a.metadata : {};
    return m.contentOrigin === origin;
  }).length;
}

/**
 * Audit snapshot for readiness report.
 * @param {import('@prisma/client').PrismaClient} prisma
 */
export async function auditRealContentReadiness(prisma) {
  const assets = await prisma.universalAsset.findMany({ take: 5000 });
  /** @type {Record<string, number>} */
  const byOrigin = {};
  /** @type {Record<string, number>} */
  const previewCounts = {};
  let syntheticCreators = 0;
  let premiumWithoutListing = 0;
  let repeatedSeedMedia = 0;
  let noProvenance = 0;
  let unsupportedRights = 0;

  const SYNTH_CREATORS = new Set([
    'creator_cardbey_studio',
    'creator_atelier_north',
    'creator_signal_media',
    'creator_local_lens',
    'creator_orbit_design',
  ]);

  for (const a of assets) {
    const meta = a.metadata && typeof a.metadata === 'object' ? a.metadata : {};
    const origin = String(meta.contentOrigin || CONTENT_ORIGIN.LEGACY_UNKNOWN);
    byOrigin[origin] = (byOrigin[origin] || 0) + 1;
    const thumb = String(a.thumbnail || '');
    if (thumb) previewCounts[thumb] = (previewCounts[thumb] || 0) + 1;
    if (SYNTH_CREATORS.has(String(a.creatorId || ''))) syntheticCreators += 1;
    if (meta.premium && !meta.marketplaceListingId) premiumWithoutListing += 1;
    if (!meta.provenance && !meta.manifestId && !meta.sourceFile) noProvenance += 1;
    if (['UNKNOWN', 'RESTRICTED', 'REJECTED'].includes(String(a.rightsStatus || '').toUpperCase())) {
      unsupportedRights += 1;
    }
  }

  const duplicatePreviews = Object.entries(previewCounts).filter(([, n]) => n > 3);
  for (const [, n] of duplicatePreviews) repeatedSeedMedia += n;

  return {
    ok: true,
    totalRecords: assets.length,
    byOrigin,
    fixtureRecords: byOrigin[CONTENT_ORIGIN.DEVELOPMENT_FIXTURE] || 0,
    realRecords:
      (byOrigin[CONTENT_ORIGIN.REAL_FIRST_PARTY] || 0) +
      (byOrigin[CONTENT_ORIGIN.REAL_CREATOR] || 0) +
      (byOrigin[CONTENT_ORIGIN.REAL_BUSINESS] || 0) +
      (byOrigin[CONTENT_ORIGIN.REAL_PROVIDER] || 0),
    recordsWithDuplicatePreviews: duplicatePreviews.reduce((s, [, n]) => s + n, 0),
    duplicatePreviewPaths: duplicatePreviews.map(([path, n]) => ({ path, count: n })),
    syntheticCreators,
    unsupportedRights,
    premiumWithoutMarketplaceAuthority: premiumWithoutListing,
    recordsUsingRepeatedSeedMedia: repeatedSeedMedia,
    recordsWithoutMeaningfulProvenance: noProvenance,
    note: 'PUBLISHED status alone does not imply realness.',
  };
}
