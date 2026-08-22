/**
 * Activity scoring for public feed sidebar — StoreEngagementSnapshot (canonical) with legacy fallback.
 */

import { batchGetSnapshots } from '../storeEngagement/storeEngagementSnapshotService.js';

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string[]} storeIds
 * @param {number} [windowDays=7]
 * @returns {Promise<Map<string, { activityScore: number; views: number; offerViews: number; qrScans: number; engagement: object | null }>>}
 */
export async function batchStoreActivityScores(prisma, storeIds, windowDays = 7) {
  const map = new Map();
  const ids = [...new Set((storeIds ?? []).map((id) => String(id ?? '').trim()).filter(Boolean))];
  if (ids.length === 0) return map;

  const since = new Date();
  since.setDate(since.getDate() - windowDays);

  const [snapshots, legacySignals, legacyMetrics] = await Promise.all([
    batchGetSnapshots(prisma, ids),
    prisma.intentSignal.findMany({
      where: { storeId: { in: ids }, createdAt: { gte: since } },
      select: { storeId: true, type: true },
    }),
    prisma.contentInteractionMetrics.findMany({
      where: { storeId: { in: ids }, contentType: 'store' },
      select: { storeId: true, viewsCount: true, lovesCount: true, sharesCount: true, bookingsCount: true },
    }),
  ]);

  for (const id of ids) {
    const snap = snapshots.get(id);
    const hasCanonical = snap && (snap.engagementScore > 0 || snap.viewsCount > 0);
    map.set(id, {
      activityScore: snap?.engagementScore ?? 0,
      views: snap?.views7d ?? 0,
      offerViews: 0,
      qrScans: snap?.qrScansCount ?? 0,
      engagement: snap
        ? {
            followersCount: snap.followersCount,
            likesCount: snap.likesCount,
            savesCount: snap.savesCount,
            sharesCount: snap.sharesCount,
            views7d: snap.views7d,
            engagementScore: snap.engagementScore,
          }
        : null,
      _canonical: hasCanonical,
    });
  }

  // Legacy fallback for stores without canonical data yet
  const SIGNAL_WEIGHTS = { page_view: 1, offer_view: 2, qr_scan: 3, cta_click: 4, publish: 5 };
  for (const s of legacySignals) {
    const row = map.get(s.storeId);
    if (!row || row._canonical) continue;
    row.activityScore += SIGNAL_WEIGHTS[s.type] ?? 0;
    if (s.type === 'page_view') row.views += 1;
    if (s.type === 'offer_view') row.offerViews += 1;
    if (s.type === 'qr_scan') row.qrScans += 1;
  }
  for (const m of legacyMetrics) {
    if (!m.storeId) continue;
    const row = map.get(m.storeId);
    if (!row || row._canonical) continue;
    row.activityScore +=
      (m.viewsCount ?? 0) +
      (m.lovesCount ?? 0) * 2 +
      (m.sharesCount ?? 0) * 3 +
      (m.bookingsCount ?? 0) * 4;
    row.views += m.viewsCount ?? 0;
  }

  for (const row of map.values()) {
    delete row._canonical;
  }

  return map;
}

/**
 * @param {number} activityScore
 * @param {Date | string | null | undefined} publishedAt
 * @returns {string[]}
 */
export function deriveStoreBadges(activityScore, publishedAt) {
  const badges = [];
  if (activityScore >= 40) badges.push('HOT');
  else if (activityScore >= 6) badges.push('TRENDING');
  const published = publishedAt ? new Date(publishedAt) : null;
  if (published && !Number.isNaN(published.getTime())) {
    const ageMs = Date.now() - published.getTime();
    if (ageMs >= 0 && ageMs <= 7 * 24 * 60 * 60 * 1000) badges.push('NEW');
  }
  return badges;
}
