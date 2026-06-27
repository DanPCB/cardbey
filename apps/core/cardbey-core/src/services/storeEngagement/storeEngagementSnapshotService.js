import { computeEngagementScore } from './storeEngagementTypes.js';

const EMPTY_SNAPSHOT = {
  followersCount: 0,
  likesCount: 0,
  savesCount: 0,
  sharesCount: 0,
  viewsCount: 0,
  views24h: 0,
  views7d: 0,
  qrScansCount: 0,
  orderClicksCount: 0,
  callClicksCount: 0,
  offerClaimsCount: 0,
  engagementScore: 0,
};

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} storeId
 */
export async function getOrCreateSnapshot(prisma, storeId) {
  const id = String(storeId ?? '').trim();
  if (!id) return null;

  const existing = await prisma.storeEngagementSnapshot.findUnique({ where: { storeId: id } });
  if (existing) return existing;

  return prisma.storeEngagementSnapshot.create({
    data: { storeId: id, ...EMPTY_SNAPSHOT },
  });
}

/**
 * Apply incremental delta from a single event, then recompute engagementScore.
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} storeId
 * @param {Record<string, number>} delta
 */
export async function applySnapshotDelta(prisma, storeId, delta) {
  const snap = await getOrCreateSnapshot(prisma, storeId);
  if (!snap) return null;

  const next = { ...snap };
  for (const [field, amount] of Object.entries(delta)) {
    if (typeof amount !== 'number' || !Number.isFinite(amount)) continue;
    next[field] = Math.max(0, (next[field] ?? 0) + amount);
  }
  next.engagementScore = computeEngagementScore(next);

  return prisma.storeEngagementSnapshot.update({
    where: { storeId },
    data: {
      followersCount: next.followersCount,
      likesCount: next.likesCount,
      savesCount: next.savesCount,
      sharesCount: next.sharesCount,
      viewsCount: next.viewsCount,
      views24h: next.views24h,
      views7d: next.views7d,
      qrScansCount: next.qrScansCount,
      orderClicksCount: next.orderClicksCount,
      callClicksCount: next.callClicksCount,
      offerClaimsCount: next.offerClaimsCount,
      engagementScore: next.engagementScore,
    },
  });
}

/**
 * Recompute rolling view windows from StoreActivityEvent (accurate refresh).
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} storeId
 */
export async function refreshViewWindows(prisma, storeId) {
  const now = new Date();
  const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const since7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [views24h, views7d, viewsTotal] = await Promise.all([
    prisma.storeActivityEvent.count({
      where: { storeId, eventType: 'STORE_VIEWED', createdAt: { gte: since24h } },
    }),
    prisma.storeActivityEvent.count({
      where: { storeId, eventType: 'STORE_VIEWED', createdAt: { gte: since7d } },
    }),
    prisma.storeActivityEvent.count({
      where: { storeId, eventType: 'STORE_VIEWED' },
    }),
  ]);

  const snap = await getOrCreateSnapshot(prisma, storeId);
  const merged = {
    ...snap,
    views24h,
    views7d,
    viewsCount: viewsTotal,
  };
  merged.engagementScore = computeEngagementScore(merged);

  return prisma.storeEngagementSnapshot.update({
    where: { storeId },
    data: {
      views24h,
      views7d,
      viewsCount: viewsTotal,
      engagementScore: merged.engagementScore,
    },
  });
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string[]} storeIds
 */
export async function batchGetSnapshots(prisma, storeIds) {
  const ids = [...new Set((storeIds ?? []).map((id) => String(id ?? '').trim()).filter(Boolean))];
  const map = new Map();
  if (ids.length === 0) return map;

  const rows = await prisma.storeEngagementSnapshot.findMany({
    where: { storeId: { in: ids } },
  });
  for (const row of rows) {
    map.set(row.storeId, row);
  }
  for (const id of ids) {
    if (!map.has(id)) {
      map.set(id, { storeId: id, ...EMPTY_SNAPSHOT });
    }
  }
  return map;
}

/**
 * Public engagement payload for feed cards.
 * @param {object | null} snap
 */
export function toPublicEngagement(snap) {
  const s = snap ?? EMPTY_SNAPSHOT;
  return {
    followersCount: s.followersCount ?? 0,
    likesCount: s.likesCount ?? 0,
    savesCount: s.savesCount ?? 0,
    sharesCount: s.sharesCount ?? 0,
    views7d: s.views7d ?? 0,
    engagementScore: s.engagementScore ?? 0,
  };
}
