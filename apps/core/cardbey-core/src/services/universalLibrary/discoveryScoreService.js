/**
 * Universal discovery scoring — multi-signal (never views-only).
 */

import { ASSET_STATUS, RIGHTS_STATUS } from './universalAssetTypes.js';

const SIGNAL_WEIGHTS = Object.freeze({
  quality: 0.25,
  trust: 0.25,
  popularity: 0.2,
  trending: 0.15,
  recency: 0.15,
});

/**
 * Compute component scores from asset + optional signals.
 * @param {object} asset
 * @param {object} [signals]
 */
export function computeDiscoverySignals(asset, signals = {}) {
  const qualityBase = Number.isFinite(Number(asset?.qualityScore)) ? Number(asset.qualityScore) : 0;
  const qualityScore = Math.min(1, Math.max(0, qualityBase / 100));

  let trustScore = 0.3;
  if (String(asset?.rightsStatus ?? '').toUpperCase() === RIGHTS_STATUS.CLEARED) trustScore += 0.4;
  if (asset?.ownerId) trustScore += 0.2;
  if (asset?.license) trustScore += 0.1;
  trustScore = Math.min(1, trustScore);

  const relationCount = Number(signals.relationCount) || 0;
  const purchaseCount = Number(signals.purchaseCount) || 0;
  const saveCount = Number(signals.saveCount) || 0;
  const shareCount = Number(signals.shareCount) || 0;
  const viewCount = Number(signals.viewCount) || 0;

  const engagementRaw =
    relationCount * 2 + purchaseCount * 5 + saveCount * 3 + shareCount * 4 + viewCount * 0.1;
  const popularityScore = Math.min(1, engagementRaw / 100);

  const ageMs = asset?.createdAt
    ? Date.now() - new Date(asset.createdAt).getTime()
    : Number(signals.ageMs) || 0;
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  const recencyBoost = Math.max(0, 1 - ageDays / 90);

  const priorTrend = Number(signals.priorTrending) || 0;
  const trendingScore = Math.min(1, priorTrend * 0.5 + recencyBoost * 0.3 + shareCount * 0.02);

  const composite =
    qualityScore * SIGNAL_WEIGHTS.quality +
    trustScore * SIGNAL_WEIGHTS.trust +
    popularityScore * SIGNAL_WEIGHTS.popularity +
    trendingScore * SIGNAL_WEIGHTS.trending +
    recencyBoost * SIGNAL_WEIGHTS.recency;

  return {
    qualityScore,
    trustScore,
    popularityScore,
    trendingScore,
    discoveryScore: Math.min(1, composite),
    signals: {
      relationCount,
      purchaseCount,
      saveCount,
      shareCount,
      viewCount,
      recencyBoost,
      weights: SIGNAL_WEIGHTS,
      note: 'multi_signal_not_views_only',
    },
  };
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} assetId
 * @param {object} [extraSignals]
 */
export async function recalculateDiscoveryScore(prisma, assetId, extraSignals = {}) {
  const id = String(assetId ?? '').trim();
  if (!id) return { ok: false, error: 'asset_id_required', status: 400 };

  const asset = await prisma.universalAsset.findUnique({ where: { id } });
  if (!asset) return { ok: false, error: 'not_found', status: 404 };

  const relationCount = await prisma.universalAssetRelation.count({
    where: { OR: [{ fromAssetId: id }, { toAssetId: id }] },
  });

  const scores = computeDiscoverySignals(asset, { relationCount, ...extraSignals });

  const record = await prisma.universalDiscoveryScore.upsert({
    where: { assetId: id },
    create: {
      assetId: id,
      discoveryScore: scores.discoveryScore,
      trendingScore: scores.trendingScore,
      qualityScore: scores.qualityScore,
      trustScore: scores.trustScore,
      popularityScore: scores.popularityScore,
      signals: scores.signals,
    },
    update: {
      discoveryScore: scores.discoveryScore,
      trendingScore: scores.trendingScore,
      qualityScore: scores.qualityScore,
      trustScore: scores.trustScore,
      popularityScore: scores.popularityScore,
      signals: scores.signals,
    },
  });

  return { ok: true, score: record };
}

/**
 * Discovery feed — published assets ranked by composite score.
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {object} [filters]
 */
export async function getDiscoveryFeed(prisma, filters = {}) {
  const take = Math.min(Math.max(Number(filters.limit) || 24, 1), 100);
  const section = String(filters.section ?? 'featured').toLowerCase();

  /** @type {import('@prisma/client').Prisma.UniversalAssetWhereInput} */
  const where = { status: ASSET_STATUS.PUBLISHED };
  if (section === 'trending') {
    // ranked by trendingScore below
  } else if (section !== 'featured' && section !== 'all') {
    // Category filter applied in-memory for cross-DB Json compatibility
  }

  const items = await prisma.universalAsset.findMany({
    where,
    include: { discoveryScore: true },
    take: take * 3,
    orderBy: { updatedAt: 'desc' },
  });

  const filtered =
    section !== 'featured' && section !== 'trending' && section !== 'all'
      ? items.filter((asset) => {
          const cats = Array.isArray(asset.categories) ? asset.categories : [];
          return cats.map(String).some((c) => c.toLowerCase() === section);
        })
      : items;

  const ranked = filtered
    .map((asset) => {
      const ds = asset.discoveryScore;
      const sortKey =
        section === 'trending'
          ? ds?.trendingScore ?? 0
          : ds?.discoveryScore ?? asset.qualityScore / 100;
      return { asset, sortKey };
    })
    .sort((a, b) => b.sortKey - a.sortKey)
    .slice(0, take)
    .map((r) => r.asset);

  return { ok: true, section, items: ranked };
}

export { SIGNAL_WEIGHTS };
