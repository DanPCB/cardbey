/**
 * Seed provider — curated Cardbey internal catalog (no external APIs).
 * Phase 2F: rich multi-industry pilot catalogue (500–1000 metadata assets).
 */

import {
  ASSET_PROVIDER,
  ASSET_STATUS,
  RIGHTS_STATUS,
} from './universalAssetTypes.js';
import { createUniversalAsset, publishUniversalAsset } from './universalAssetService.js';
import { RICH_SEED_CATALOG, buildRichSeedCatalog } from './richSeedCatalog.js';
import {
  assignAssetsToCollections,
  linkEcosystemGraph,
  seedTaxonomyAndCollections,
} from './collectionService.js';

/** Legacy 5-item catalog retained for tests / small pilots. */
export const SEED_CATALOG = Object.freeze(RICH_SEED_CATALOG.slice(0, 5));

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {object} [options]
 */
export async function seedCuratedCatalog(prisma, options = {}) {
  const ownerId = options.ownerId ? String(options.ownerId) : 'cardbey_platform';
  const skipExisting = options.skipExisting !== false;
  const rich = options.rich !== false;
  const catalog = rich
    ? buildRichSeedCatalog({
        targetMin: Number(options.targetMin) || 560,
        targetMax: Number(options.targetMax) || 720,
      })
    : SEED_CATALOG;

  const results = [];

  for (const entry of catalog) {
    if (skipExisting) {
      const existing = await prisma.universalAsset.findFirst({
        where: {
          OR: [
            { provider: entry.provider, title: entry.title },
            // seedKey in metadata — best-effort across SQLite/Postgres
          ],
        },
      });
      if (existing) {
        results.push({ key: entry.key, skipped: true, assetId: existing.id });
        continue;
      }
    }

    const created = await createUniversalAsset(prisma, {
      title: entry.title,
      description: entry.description,
      type: entry.type,
      provider: entry.provider || ASSET_PROVIDER.SEED,
      categories: entry.categories,
      tags: entry.tags,
      license: entry.license,
      qualityScore: entry.qualityScore,
      thumbnail: entry.thumbnail,
      creatorId: entry.creatorId,
      metadata: entry.metadata || { seedKey: entry.key },
      ownerId,
      rightsStatus: RIGHTS_STATUS.CLEARED,
      status: ASSET_STATUS.NORMALIZED,
      hostingMode: 'HOSTED',
    });

    if (created.ok) {
      results.push({ key: entry.key, created: true, assetId: created.asset.id });
    } else {
      results.push({ key: entry.key, created: false, error: created.error });
    }
  }

  return { ok: true, seeded: results.length, results, catalogSize: catalog.length };
}

/**
 * Full Phase 2F seed: catalog → pipeline → taxonomy/collections → graph.
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {object} [options]
 */
export async function runRichLibrarySeed(prisma, options = {}) {
  const seeded = await seedCuratedCatalog(prisma, {
    ...options,
    rich: options.rich !== false,
  });

  // Condensed fail-closed publish for rich seed (rights already CLEARED at create).
  // External providers must still use the full stage runner — never bypass publish gates.
  const pipelineResults = [];
  const runPipeline = options.runPipeline !== false;
  for (const row of seeded.results || []) {
    if (!row.created || !row.assetId) {
      pipelineResults.push({
        assetId: row.assetId,
        skipped: true,
        reason: row.skipped ? 'exists' : row.error,
      });
      continue;
    }
    if (!runPipeline) {
      pipelineResults.push({ assetId: row.assetId, skipped: true, reason: 'pipeline_disabled' });
      continue;
    }
    const published = await publishUniversalAsset(prisma, row.assetId);
    pipelineResults.push({
      assetId: row.assetId,
      ok: Boolean(published.ok),
      status: published.asset?.status,
      error: published.error,
      mode: 'seed_fail_closed_publish',
    });
  }

  const taxonomy = await seedTaxonomyAndCollections(prisma);
  const collections = await assignAssetsToCollections(prisma);
  const graph = await linkEcosystemGraph(prisma);

  const published = await prisma.universalAsset.count({
    where: { status: ASSET_STATUS.PUBLISHED },
  });

  return {
    ok: true,
    seeded,
    pipelineResults,
    taxonomy,
    collections,
    graph,
    published,
    authority: 'core',
  };
}

export default seedCuratedCatalog;
