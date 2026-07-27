/**
 * Attach visitor-safe awareness signals onto a public store DTO.
 * Observe-only: active loyalty/campaigns/promotions + recent lifecycle events.
 * Never includes owner analytics, drafts, or private membership data.
 */

import {
  PUBLIC_LIFECYCLE_EVENT_TYPES,
  listPublicStoreLifecycleEvents,
  synthesizeLifecycleFromCreatedAt,
} from '../lib/publicStoreLifecycle/publicStoreLifecycleEvents.js';

const LIVE_CAMPAIGN_STATUSES = new Set(['RUNNING', 'SCHEDULED', 'ACTIVE', 'LIVE']);
const LIVE_PROMOTION_STATUSES = new Set(['active', 'ACTIVE']);

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {object} storeDto - Public store DTO (mutated copy returned)
 * @returns {Promise<object>}
 */
export async function attachPublicStoreAwarenessSignals(prisma, storeDto) {
  if (!prisma || !storeDto?.id) return storeDto;

  const storeId = String(storeDto.id);
  const now = new Date();
  const nowMs = now.getTime();

  let loyaltyPrograms = [];
  let campaigns = [];
  let promotions = [];
  let recentActivity = [];

  try {
    const [loyaltyRows, campaignRows, promotionRows, lifecycleEvents] = await Promise.all([
      prisma.loyaltyProgram
        .findMany({
          where: {
            storeId,
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
          },
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: {
            id: true,
            name: true,
            stampsRequired: true,
            reward: true,
            expiresAt: true,
            createdAt: true,
          },
        })
        .catch(() => []),
      prisma.campaignV2
        .findMany({
          where: {
            storeId,
            status: { in: [...LIVE_CAMPAIGN_STATUSES] },
          },
          orderBy: { updatedAt: 'desc' },
          take: 8,
          select: {
            id: true,
            title: true,
            objective: true,
            status: true,
            createdAt: true,
            updatedAt: true,
          },
        })
        .catch(() => []),
      prisma.promotion
        .findMany({
          where: {
            storeId,
            status: { in: [...LIVE_PROMOTION_STATUSES] },
            AND: [
              { OR: [{ startAt: null }, { startAt: { lte: now } }] },
              { OR: [{ endAt: null }, { endAt: { gt: now } }] },
            ],
          },
          orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
          take: 8,
          select: {
            id: true,
            title: true,
            message: true,
            ctaLabel: true,
            status: true,
            endAt: true,
            priority: true,
            createdAt: true,
            updatedAt: true,
          },
        })
        .catch(() => []),
      listPublicStoreLifecycleEvents(prisma, storeId, { now: nowMs }).catch(() => []),
    ]);

    loyaltyPrograms = (loyaltyRows || []).map((row) => ({
      id: row.id,
      name: row.name,
      stampsRequired: row.stampsRequired,
      reward: row.reward,
      status: 'active',
      expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
      createdAt: row.createdAt ? row.createdAt.toISOString() : null,
    }));

    campaigns = (campaignRows || []).map((row) => ({
      id: row.id,
      title: row.title,
      description: row.objective || null,
      status: row.status,
      priorityKey: 'pinned_campaign',
      createdAt: row.createdAt ? row.createdAt.toISOString() : null,
      updatedAt: row.updatedAt ? row.updatedAt.toISOString() : null,
    }));

    promotions = (promotionRows || []).map((row) => ({
      id: row.id,
      title: row.title,
      description: row.message || null,
      ctaLabel: row.ctaLabel || 'View Offer',
      status: row.status,
      expiresAt: row.endAt ? row.endAt.toISOString() : null,
      priorityKey: 'promotion',
      createdAt: row.createdAt ? row.createdAt.toISOString() : null,
    }));

    const emitted = Array.isArray(lifecycleEvents) ? lifecycleEvents : [];
    const emittedKeys = new Set(
      emitted.map((e) => `${e.type}:${e.entityId || e.id}`),
    );
    const synth = [
      ...synthesizeLifecycleFromCreatedAt(
        loyaltyPrograms,
        PUBLIC_LIFECYCLE_EVENT_TYPES.LOYALTY_PROGRAM_PUBLISHED,
        nowMs,
      ),
      ...synthesizeLifecycleFromCreatedAt(
        campaigns,
        PUBLIC_LIFECYCLE_EVENT_TYPES.CAMPAIGN_LAUNCHED,
        nowMs,
      ),
      ...synthesizeLifecycleFromCreatedAt(
        promotions,
        PUBLIC_LIFECYCLE_EVENT_TYPES.PROMOTION_ACTIVATED,
        nowMs,
      ),
    ].filter((e) => !emittedKeys.has(`${e.type}:${e.entityId || e.id}`));

    recentActivity = [...emitted, ...synth]
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .slice(0, 20);
  } catch (err) {
    console.warn(
      '[attachPublicStoreAwarenessSignals] failed',
      storeId,
      err?.message ?? err,
    );
    return storeDto;
  }

  return {
    ...storeDto,
    loyaltyPrograms,
    campaigns,
    activeCampaigns: campaigns,
    promotions,
    activeOffers: promotions,
    recentActivity,
  };
}
