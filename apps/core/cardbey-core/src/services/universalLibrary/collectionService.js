/**
 * Phase 2F collections — curated lists referencing existing UniversalAssets only.
 * Stored as UniversalEntity (kind=collection); membership via asset metadata.collections
 * and optional UniversalAssetRelation PART_OF_COLLECTION between peer assets.
 */

import { ASSET_RELATION_TYPE, ASSET_STATUS, ENTITY_KIND } from './universalAssetTypes.js';
import { COLLECTION_DEFS, INDUSTRIES } from './richSeedCatalog.js';
import { upsertTaxonomyEntity } from './taxonomyService.js';

/**
 * Ensure industry + collection entities exist.
 * @param {import('@prisma/client').PrismaClient} prisma
 */
export async function seedTaxonomyAndCollections(prisma) {
  const industries = [];
  for (const ind of INDUSTRIES) {
    const r = await upsertTaxonomyEntity(prisma, {
      kind: ENTITY_KIND.CATEGORY,
      name: ind.name,
      slug: ind.slug,
      metadata: { dimension: 'industry', subs: ind.subs },
    });
    if (r.ok) industries.push(r.entity);
  }
  // Parent food-drink for bakery/cafe/restaurant discovery
  await upsertTaxonomyEntity(prisma, {
    kind: ENTITY_KIND.CATEGORY,
    name: 'Food & Drink',
    slug: 'food-drink',
    metadata: { dimension: 'industry', children: ['bakery', 'cafe', 'restaurant'] },
  });

  const collections = [];
  for (const col of COLLECTION_DEFS) {
    const r = await upsertTaxonomyEntity(prisma, {
      kind: ENTITY_KIND.COLLECTION,
      name: col.name,
      slug: col.slug,
      metadata: { description: col.description, dimension: 'collection' },
    });
    if (r.ok) collections.push(r.entity);
  }

  return { ok: true, industries: industries.length, collections: collections.length };
}

/**
 * Assign published seed assets into curated collections (by rules). Never duplicates assets.
 * @param {import('@prisma/client').PrismaClient} prisma
 */
export async function assignAssetsToCollections(prisma) {
  const assets = await prisma.universalAsset.findMany({
    where: { status: ASSET_STATUS.PUBLISHED },
    take: 2000,
  });

  /** @type {Record<string, string[]>} */
  const membership = {
    'new-businesses': [],
    'popular-bakery': [],
    'french-cafe-kit': [],
    'minimal-storefront': [],
    'summer-promo': [],
    'restaurant-starter': [],
    'top-creator-videos': [],
    'cardbey-originals': [],
    'open-license-picks': [],
  };

  for (const asset of assets) {
    const cats = Array.isArray(asset.categories) ? asset.categories.map(String) : [];
    const meta = asset.metadata && typeof asset.metadata === 'object' ? asset.metadata : {};
    const role = String(meta.assetRole || '');
    const tags = Array.isArray(asset.tags) ? asset.tags.map(String) : [];

    membership['cardbey-originals'].push(asset.id);
    if (meta.openLicense !== false) membership['open-license-picks'].push(asset.id);
    if (cats.includes('bakery') || tags.includes('bakery')) membership['popular-bakery'].push(asset.id);
    if (cats.includes('cafe') || tags.includes('cafe')) membership['french-cafe-kit'].push(asset.id);
    if (cats.includes('restaurant') || tags.includes('restaurant')) {
      membership['restaurant-starter'].push(asset.id);
    }
    if (role === 'storefront' || role === 'template' || tags.includes('minimal')) {
      membership['minimal-storefront'].push(asset.id);
    }
    if (role === 'promo' || role === 'social-post') membership['summer-promo'].push(asset.id);
    if (asset.type === 'video' && asset.creatorId) membership['top-creator-videos'].push(asset.id);
    if (role === 'guide' || role === 'template' || role === 'storefront') {
      membership['new-businesses'].push(asset.id);
    }
  }

  let updated = 0;
  for (const asset of assets) {
    const cols = Object.entries(membership)
      .filter(([, ids]) => ids.includes(asset.id))
      .map(([slug]) => slug)
      .slice(0, 6);
    const prev = asset.metadata && typeof asset.metadata === 'object' ? asset.metadata : {};
    await prisma.universalAsset.update({
      where: { id: asset.id },
      data: {
        metadata: {
          ...prev,
          collections: cols,
        },
      },
    });
    updated += 1;
  }

  // Cap list stored on collection entities
  for (const [slug, ids] of Object.entries(membership)) {
    const entity = await prisma.universalEntity.findUnique({
      where: { kind_slug: { kind: ENTITY_KIND.COLLECTION, slug } },
    });
    if (!entity) continue;
    const prev = entity.metadata && typeof entity.metadata === 'object' ? entity.metadata : {};
    await prisma.universalEntity.update({
      where: { id: entity.id },
      data: {
        metadata: {
          ...prev,
          assetIds: ids.slice(0, 48),
          assetCount: ids.length,
        },
      },
    });
  }

  return { ok: true, assetsUpdated: updated, collections: Object.keys(membership).length };
}

/**
 * Link assets within the same industry as recommended_with (bounded).
 * @param {import('@prisma/client').PrismaClient} prisma
 */
export async function linkEcosystemGraph(prisma) {
  const assets = await prisma.universalAsset.findMany({
    where: { status: ASSET_STATUS.PUBLISHED },
    select: { id: true, categories: true, metadata: true, type: true },
    take: 2000,
  });

  /** @type {Record<string, typeof assets>} */
  const byIndustry = {};
  for (const a of assets) {
    const meta = a.metadata && typeof a.metadata === 'object' ? a.metadata : {};
    const industry = String(meta.industry || (Array.isArray(a.categories) ? a.categories[0] : 'retail'));
    if (!byIndustry[industry]) byIndustry[industry] = [];
    byIndustry[industry].push(a);
  }

  let created = 0;
  for (const group of Object.values(byIndustry)) {
    const sample = group.slice(0, 24);
    for (let i = 0; i < sample.length; i += 1) {
      const from = sample[i];
      const to = sample[(i + 1) % sample.length];
      if (!to || from.id === to.id) continue;
      try {
        await prisma.universalAssetRelation.create({
          data: {
            fromAssetId: from.id,
            toAssetId: to.id,
            relationType: ASSET_RELATION_TYPE.RECOMMENDED_WITH,
            weight: 1,
            metadata: { source: 'phase2f_ecosystem' },
          },
        });
        created += 1;
      } catch {
        /* unique violation — already linked */
      }
    }
  }

  return { ok: true, relationsCreated: created };
}

/**
 * List curated collections with resolved asset summaries.
 * @param {import('@prisma/client').PrismaClient} prisma
 */
export async function listCollections(prisma) {
  const entities = await prisma.universalEntity.findMany({
    where: { kind: ENTITY_KIND.COLLECTION },
    orderBy: { name: 'asc' },
  });

  const collections = [];
  for (const entity of entities) {
    const meta = entity.metadata && typeof entity.metadata === 'object' ? entity.metadata : {};
    const assetIds = Array.isArray(meta.assetIds) ? meta.assetIds.slice(0, 24) : [];
    const assets =
      assetIds.length > 0
        ? await prisma.universalAsset.findMany({
            where: { id: { in: assetIds }, status: ASSET_STATUS.PUBLISHED },
          })
        : [];
    collections.push({
      id: entity.id,
      slug: entity.slug,
      name: entity.name,
      description: meta.description || null,
      assetCount: meta.assetCount ?? assets.length,
      assets,
    });
  }

  return { ok: true, collections };
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} assetId
 */
export async function getRelatedAssets(prisma, assetId) {
  const relations = await prisma.universalAssetRelation.findMany({
    where: {
      OR: [{ fromAssetId: assetId }, { toAssetId: assetId }],
    },
    take: 24,
  });
  const ids = new Set();
  for (const r of relations) {
    if (r.fromAssetId !== assetId) ids.add(r.fromAssetId);
    if (r.toAssetId !== assetId) ids.add(r.toAssetId);
  }
  const assets = await prisma.universalAsset.findMany({
    where: { id: { in: [...ids] }, status: ASSET_STATUS.PUBLISHED },
  });
  return { ok: true, assets, relations };
}
