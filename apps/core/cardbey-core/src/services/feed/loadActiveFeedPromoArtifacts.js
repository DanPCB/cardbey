/**
 * Batch-load active performer artifacts for public feed promo badges.
 * One entry per artifact type per store (most recently updated wins).
 */

/** @typedef {'offer' | 'campaign' | 'event' | 'loyalty' | 'announcement'} FeedPromoArtifactType */

/** @typedef {{ type: FeedPromoArtifactType, title: string }} FeedPromoArtifact */

/**
 * @param {string | null | undefined} promoType
 * @returns {FeedPromoArtifactType | null}
 */
export function mapStorePromoTypeToFeedType(promoType) {
  const t = String(promoType ?? 'general').toLowerCase().trim();
  if (t === 'campaign') return 'campaign';
  if (t === 'event') return 'event';
  if (t === 'loyalty') return 'loyalty';
  if (t === 'announcement') return 'announcement';
  if (t === 'discount' || t === 'offer') return 'offer';
  return null;
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string[]} storeIds
 * @returns {Promise<Map<string, FeedPromoArtifact[]>>}
 */
export async function loadActiveFeedPromoArtifacts(prisma, storeIds) {
  const map = new Map();
  const ids = [...new Set((storeIds ?? []).map((id) => String(id ?? '').trim()).filter(Boolean))];
  if (ids.length === 0) return map;

  const now = new Date();
  const activeEndsWhere = {
    OR: [{ endsAt: null }, { endsAt: { gte: now } }],
  };

  const [offers, promos, campaigns, loyaltyPrograms] = await Promise.all([
    prisma.storeOffer.findMany({
      where: {
        storeId: { in: ids },
        isActive: true,
        ...activeEndsWhere,
      },
      orderBy: { updatedAt: 'desc' },
      select: { storeId: true, title: true },
    }),
    loadActiveStorePromos(prisma, ids, now),
    prisma.campaignV2.findMany({
      where: {
        storeId: { in: ids },
        status: { in: ['RUNNING', 'SCHEDULED'] },
      },
      orderBy: { updatedAt: 'desc' },
      select: { storeId: true, title: true },
    }),
    prisma.loyaltyProgram.findMany({
      where: {
        storeId: { in: ids },
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      orderBy: { updatedAt: 'desc' },
      select: { storeId: true, name: true },
    }),
  ]);

  const push = (storeId, entry) => {
    if (!storeId || !entry?.type) return;
    if (!map.has(storeId)) map.set(storeId, []);
    const list = map.get(storeId);
    if (list.some((x) => x.type === entry.type)) return;
    const title = String(entry.title ?? '').trim();
    if (!title && entry.type !== 'loyalty') return;
    list.push({
      type: entry.type,
      title: title || 'Rewards Available',
    });
  };

  for (const row of offers) {
    push(row.storeId, { type: 'offer', title: row.title });
  }
  for (const row of campaigns) {
    if (row.storeId) push(row.storeId, { type: 'campaign', title: row.title });
  }
  for (const row of promos) {
    const type = mapStorePromoTypeToFeedType(row.promoType);
    if (type) push(row.storeId, { type, title: row.title });
  }
  for (const row of loyaltyPrograms) {
    push(row.storeId, { type: 'loyalty', title: row.name });
  }

  return map;
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string[]} storeIds
 * @param {Date} now
 */
async function loadActiveStorePromos(prisma, storeIds, now) {
  const where = {
    storeId: { in: storeIds },
    isActive: true,
    OR: [{ endsAt: null }, { endsAt: { gte: now } }],
  };
  try {
    return await prisma.storePromo.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      select: { storeId: true, title: true, promoType: true },
    });
  } catch (err) {
    if (!String(err?.message ?? '').includes('promoType')) throw err;
    const rows = await prisma.storePromo.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      select: { storeId: true, title: true },
    });
    return rows.map((row) => ({ ...row, promoType: 'general' }));
  }
}
