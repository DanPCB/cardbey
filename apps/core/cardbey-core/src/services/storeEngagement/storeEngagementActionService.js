import { buildActorKey } from './storeEngagementActor.js';
import { recordStoreEngagementEvent } from './storeEngagementEventService.js';
import {
  batchGetSnapshots,
  getOrCreateSnapshot,
  toPublicEngagement,
} from './storeEngagementSnapshotService.js';

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} storeId
 */
async function assertPublicStore(prisma, storeId) {
  const store = await prisma.business.findUnique({
    where: { id: storeId },
    select: { id: true, isActive: true, publishedAt: true },
  });
  if (!store || !store.isActive) return null;
  return store;
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {object} ctx
 */
async function getViewerState(prisma, storeId, actorKey, userId) {
  const [follow, reaction, save, viewEvent] = await Promise.all([
    prisma.storeFollow.findUnique({ where: { storeId_actorKey: { storeId, actorKey } } }),
    prisma.storeReaction.findUnique({ where: { storeId_actorKey: { storeId, actorKey } } }),
    prisma.storeSave.findUnique({ where: { storeId_actorKey: { storeId, actorKey } } }),
    prisma.storeActivityEvent.findFirst({
      where: { storeId, eventType: 'STORE_VIEWED', actorUserId: userId ?? undefined },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    }),
  ]);

  return {
    viewerHasLiked: Boolean(reaction?.active),
    viewerHasSaved: Boolean(save),
    viewerIsFollowing: Boolean(follow),
    viewerHasViewed: Boolean(viewEvent),
  };
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {object} input
 */
export async function getStoreEngagementSummary(prisma, input) {
  const storeId = String(input.storeId ?? '').trim();
  const actorKey = buildActorKey({ userId: input.userId, viewerKey: input.viewerKey });
  if (!storeId) return null;

  const snap = await getOrCreateSnapshot(prisma, storeId);
  const viewer = await getViewerState(prisma, storeId, actorKey, input.userId ?? null);

  return {
    storeId,
    engagement: toPublicEngagement(snap),
    viewer,
  };
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string[]} storeIds
 * @param {object} viewer
 */
export async function batchStoreEngagementSummaries(prisma, storeIds, viewer = {}) {
  const actorKey = buildActorKey({ userId: viewer.userId, viewerKey: viewer.viewerKey });
  const snapMap = await batchGetSnapshots(prisma, storeIds);
  const map = new Map();

  for (const storeId of storeIds) {
    const snap = snapMap.get(storeId);
    map.set(storeId, {
      engagement: toPublicEngagement(snap),
      viewer: {
        viewerHasLiked: false,
        viewerHasSaved: false,
        viewerIsFollowing: false,
        viewerHasViewed: false,
      },
    });
  }

  if (storeIds.length === 0) return map;

  const [follows, reactions, saves] = await Promise.all([
    prisma.storeFollow.findMany({
      where: { storeId: { in: storeIds }, actorKey },
      select: { storeId: true },
    }),
    prisma.storeReaction.findMany({
      where: { storeId: { in: storeIds }, actorKey, active: true },
      select: { storeId: true },
    }),
    prisma.storeSave.findMany({
      where: { storeId: { in: storeIds }, actorKey },
      select: { storeId: true },
    }),
  ]);

  for (const f of follows) {
    const row = map.get(f.storeId);
    if (row) row.viewer.viewerIsFollowing = true;
  }
  for (const r of reactions) {
    const row = map.get(r.storeId);
    if (row) row.viewer.viewerHasLiked = true;
  }
  for (const s of saves) {
    const row = map.get(s.storeId);
    if (row) row.viewer.viewerHasSaved = true;
  }

  return map;
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {object} input
 */
export async function recordStoreView(prisma, input) {
  const store = await assertPublicStore(prisma, input.storeId);
  if (!store) return { ok: false, error: 'store_not_found' };

  return recordStoreEngagementEvent(prisma, {
    storeId: input.storeId,
    eventType: 'STORE_VIEWED',
    source: input.source ?? 'storefront',
    actorUserId: input.userId ?? null,
    sessionId: input.sessionId ?? null,
    metadata: input.metadata ?? {},
  });
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {object} input
 */
export async function toggleStoreFollow(prisma, input) {
  const store = await assertPublicStore(prisma, input.storeId);
  if (!store) return { ok: false, error: 'store_not_found' };

  const actorKey = buildActorKey({ userId: input.userId, viewerKey: input.viewerKey });
  const existing = await prisma.storeFollow.findUnique({
    where: { storeId_actorKey: { storeId: input.storeId, actorKey } },
  });

  if (existing) {
    await prisma.storeFollow.delete({ where: { id: existing.id } });
    await recordStoreEngagementEvent(prisma, {
      storeId: input.storeId,
      eventType: 'STORE_UNFOLLOWED',
      source: input.source ?? 'feed',
      actorUserId: input.userId ?? null,
      sessionId: input.sessionId ?? null,
    });
    const summary = await getStoreEngagementSummary(prisma, input);
    return { ok: true, following: false, ...summary };
  }

  await prisma.storeFollow.create({
    data: {
      storeId: input.storeId,
      actorKey,
      userId: input.userId ?? null,
    },
  });
  await recordStoreEngagementEvent(prisma, {
    storeId: input.storeId,
    eventType: 'STORE_FOLLOWED',
    source: input.source ?? 'feed',
    actorUserId: input.userId ?? null,
    sessionId: input.sessionId ?? null,
  });
  const summary = await getStoreEngagementSummary(prisma, input);
  return { ok: true, following: true, ...summary };
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {object} input
 */
export async function toggleStoreLike(prisma, input) {
  const store = await assertPublicStore(prisma, input.storeId);
  if (!store) return { ok: false, error: 'store_not_found' };

  const actorKey = buildActorKey({ userId: input.userId, viewerKey: input.viewerKey });
  const existing = await prisma.storeReaction.findUnique({
    where: { storeId_actorKey: { storeId: input.storeId, actorKey } },
  });

  if (existing?.active) {
    await prisma.storeReaction.update({
      where: { id: existing.id },
      data: { active: false },
    });
    await recordStoreEngagementEvent(prisma, {
      storeId: input.storeId,
      eventType: 'STORE_UNLIKED',
      source: input.source ?? 'feed',
      actorUserId: input.userId ?? null,
      sessionId: input.sessionId ?? null,
    });
    const summary = await getStoreEngagementSummary(prisma, input);
    return { ok: true, liked: false, ...summary };
  }

  if (existing) {
    await prisma.storeReaction.update({
      where: { id: existing.id },
      data: { active: true },
    });
  } else {
    await prisma.storeReaction.create({
      data: {
        storeId: input.storeId,
        actorKey,
        userId: input.userId ?? null,
        active: true,
      },
    });
  }

  await recordStoreEngagementEvent(prisma, {
    storeId: input.storeId,
    eventType: 'STORE_LIKED',
    source: input.source ?? 'feed',
    actorUserId: input.userId ?? null,
    sessionId: input.sessionId ?? null,
  });
  const summary = await getStoreEngagementSummary(prisma, input);
  return { ok: true, liked: true, ...summary };
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {object} input
 */
export async function toggleStoreSave(prisma, input) {
  const store = await assertPublicStore(prisma, input.storeId);
  if (!store) return { ok: false, error: 'store_not_found' };

  const actorKey = buildActorKey({ userId: input.userId, viewerKey: input.viewerKey });
  const existing = await prisma.storeSave.findUnique({
    where: { storeId_actorKey: { storeId: input.storeId, actorKey } },
  });

  if (existing) {
    await prisma.storeSave.delete({ where: { id: existing.id } });
    await recordStoreEngagementEvent(prisma, {
      storeId: input.storeId,
      eventType: 'STORE_UNSAVED',
      source: input.source ?? 'feed',
      actorUserId: input.userId ?? null,
      sessionId: input.sessionId ?? null,
    });
    const summary = await getStoreEngagementSummary(prisma, input);
    return { ok: true, saved: false, ...summary };
  }

  await prisma.storeSave.create({
    data: {
      storeId: input.storeId,
      actorKey,
      userId: input.userId ?? null,
    },
  });
  await recordStoreEngagementEvent(prisma, {
    storeId: input.storeId,
    eventType: 'STORE_SAVED',
    source: input.source ?? 'feed',
    actorUserId: input.userId ?? null,
    sessionId: input.sessionId ?? null,
  });
  const summary = await getStoreEngagementSummary(prisma, input);
  return { ok: true, saved: true, ...summary };
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {object} input
 */
export async function recordStoreShare(prisma, input) {
  const store = await assertPublicStore(prisma, input.storeId);
  if (!store) return { ok: false, error: 'store_not_found' };

  const actorKey = buildActorKey({ userId: input.userId, viewerKey: input.viewerKey });
  await prisma.storeShare.create({
    data: {
      storeId: input.storeId,
      actorKey,
      userId: input.userId ?? null,
      source: input.source ?? 'feed',
    },
  });

  await recordStoreEngagementEvent(prisma, {
    storeId: input.storeId,
    eventType: 'STORE_SHARED',
    source: input.source ?? 'feed',
    actorUserId: input.userId ?? null,
    sessionId: input.sessionId ?? null,
    metadata: input.metadata ?? {},
  });

  const summary = await getStoreEngagementSummary(prisma, input);
  return { ok: true, shared: true, ...summary };
}

const CLICK_EVENT_MAP = {
  order: 'ORDER_CLICKED',
  call: 'CALL_CLICKED',
  message: 'MESSAGE_CLICKED',
  website: 'WEBSITE_CLICKED',
  map: 'MAP_CLICKED',
};

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {object} input
 */
export async function recordStoreClick(prisma, input) {
  const store = await assertPublicStore(prisma, input.storeId);
  if (!store) return { ok: false, error: 'store_not_found' };

  const eventType = CLICK_EVENT_MAP[input.clickType];
  if (!eventType) return { ok: false, error: 'invalid_click_type' };

  return recordStoreEngagementEvent(prisma, {
    storeId: input.storeId,
    eventType,
    source: input.source ?? 'storefront',
    actorUserId: input.userId ?? null,
    sessionId: input.sessionId ?? null,
    metadata: input.metadata ?? {},
  });
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {object} input
 */
export async function recordOfferClaim(prisma, input) {
  const store = await assertPublicStore(prisma, input.storeId);
  if (!store) return { ok: false, error: 'store_not_found' };

  const actorKey = buildActorKey({ userId: input.userId, viewerKey: input.viewerKey });
  await prisma.offerClaim.create({
    data: {
      storeId: input.storeId,
      offerId: input.offerId,
      actorKey,
      userId: input.userId ?? null,
    },
  });

  return recordStoreEngagementEvent(prisma, {
    storeId: input.storeId,
    eventType: 'OFFER_CLAIMED',
    source: input.source ?? 'offer',
    actorUserId: input.userId ?? null,
    sessionId: input.sessionId ?? null,
    entityType: 'offer',
    entityId: input.offerId,
    metadata: { offerId: input.offerId },
  });
}
