import { randomUUID } from 'node:crypto';
import {
  EVENT_SNAPSHOT_DELTA,
  STORE_ENGAGEMENT_EVENT_TYPES,
  VIEW_DEDUPE_WINDOW_MS,
  snapshotFieldForEvent,
} from './storeEngagementTypes.js';
import { applySnapshotDelta, refreshViewWindows } from './storeEngagementSnapshotService.js';
import { publishEngagementUpdated, publishOwnerActivityEvent } from './storeEngagementSse.js';

/** Map canonical event → owner Live Performance SSE type. */
const OWNER_SSE_TYPE_MAP = {
  STORE_VIEWED: 'store_viewed',
  OFFER_VIEWED: 'offer_viewed',
  OFFER_CLAIMED: 'offer_claimed',
  QR_SCANNED: 'device_qr_scanned',
  CAMPAIGN_CLICKED: 'campaign_clicked',
  ORDER_CLICKED: 'customer_inquiry',
  CALL_CLICKED: 'customer_inquiry',
};

/**
 * Check view dedupe: one view per session/store/source every 30 minutes.
 * @param {import('@prisma/client').PrismaClient} prisma
 */
async function isViewDeduped(prisma, { storeId, sessionId, source }) {
  if (!sessionId) return false;
  const since = new Date(Date.now() - VIEW_DEDUPE_WINDOW_MS);
  const recent = await prisma.storeActivityEvent.findFirst({
    where: {
      storeId,
      eventType: 'STORE_VIEWED',
      sessionId,
      source: source ?? 'unknown',
      createdAt: { gte: since },
    },
    select: { id: true },
  });
  return Boolean(recent);
}

/**
 * Write StoreActivityEvent → update snapshot → publish SSE.
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {object} input
 */
export async function recordStoreEngagementEvent(prisma, input) {
  const storeId = String(input.storeId ?? '').trim();
  const eventType = String(input.eventType ?? '').trim();
  const source = String(input.source ?? 'unknown').trim().slice(0, 80);

  if (!storeId || !STORE_ENGAGEMENT_EVENT_TYPES.has(eventType)) {
    return { ok: false, error: 'invalid_event' };
  }

  if (eventType === 'STORE_VIEWED') {
    const deduped = await isViewDeduped(prisma, {
      storeId,
      sessionId: input.sessionId ?? null,
      source,
    });
    if (deduped) {
      return { ok: true, deduped: true };
    }
  }

  const metadata =
    input.metadata && typeof input.metadata === 'object' && !Array.isArray(input.metadata)
      ? input.metadata
      : {};

  const event = await prisma.storeActivityEvent.create({
    data: {
      id: randomUUID(),
      storeId,
      actorUserId: input.actorUserId ?? null,
      sessionId: input.sessionId ?? null,
      eventType,
      source,
      metadataJson: metadata,
    },
  });

  let snapshot = null;
  const delta = EVENT_SNAPSHOT_DELTA[eventType];
  if (delta) {
    if (eventType === 'STORE_VIEWED') {
      snapshot = await refreshViewWindows(prisma, storeId);
    } else {
      snapshot = await applySnapshotDelta(prisma, storeId, delta);
    }
  } else {
    const { getOrCreateSnapshot } = await import('./storeEngagementSnapshotService.js');
    snapshot = await getOrCreateSnapshot(prisma, storeId);
  }

  const changedField = snapshotFieldForEvent(eventType);
  const changedDelta = changedField && delta ? delta[changedField] : undefined;

  publishEngagementUpdated({
    storeId,
    snapshot,
    changedField,
    delta: changedDelta,
  });

  publishOwnerActivityEvent({ storeId, event });

  void bridgeOwnerLivePerformanceSse({
    storeId,
    eventType,
    metadata,
    entityType: input.entityType ?? null,
    entityId: input.entityId ?? null,
  });

  return { ok: true, event, snapshot, deduped: false };
}

/**
 * Bridge to existing in-memory owner SSE (Live Performance).
 */
async function bridgeOwnerLivePerformanceSse(input) {
  const sseType = OWNER_SSE_TYPE_MAP[input.eventType];
  if (!sseType) return;
  try {
    const { emitStoreActivity } = await import('../../lib/storeActivity/storeActivityEmitter.js');
    emitStoreActivity({
      storeId: input.storeId,
      type: sseType,
      actorType: 'user',
      entityType: input.entityType,
      entityId: input.entityId,
      metadata: input.metadata ?? {},
    });
  } catch {
    // non-fatal
  }
}

/**
 * Query recent events for Performer / Signal Intelligence.
 * @param {import('@prisma/client').PrismaClient} prisma
 */
export async function queryStoreActivityEvents(prisma, storeId, opts = {}) {
  const since = opts.since ? new Date(opts.since) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 500);

  return prisma.storeActivityEvent.findMany({
    where: { storeId, createdAt: { gte: since } },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

/**
 * Summarize events for Performer reasoning.
 * @param {import('@prisma/client').PrismaClient} prisma
 */
export async function summarizeStoreEngagementForPerformer(prisma, storeId, windowDays = 1) {
  const since = new Date();
  since.setDate(since.getDate() - windowDays);
  const prevSince = new Date();
  prevSince.setDate(prevSince.getDate() - windowDays * 2);

  const [current, previous, snapshot] = await Promise.all([
    prisma.storeActivityEvent.groupBy({
      by: ['eventType'],
      where: { storeId, createdAt: { gte: since } },
      _count: { _all: true },
    }),
    prisma.storeActivityEvent.groupBy({
      by: ['eventType'],
      where: { storeId, createdAt: { gte: prevSince, lt: since } },
      _count: { _all: true },
    }),
    prisma.storeEngagementSnapshot.findUnique({ where: { storeId } }),
  ]);

  const countMap = (rows) => {
    const m = {};
    for (const r of rows) m[r.eventType] = r._count._all;
    return m;
  };

  const now = countMap(current);
  const prev = countMap(previous);
  const totalNow = Object.values(now).reduce((a, b) => a + b, 0);
  const totalPrev = Object.values(prev).reduce((a, b) => a + b, 0);
  const pctChange =
    totalPrev > 0 ? Math.round(((totalNow - totalPrev) / totalPrev) * 100) : totalNow > 0 ? 100 : 0;

  return {
    storeId,
    windowDays,
    counts: now,
    engagementScore: snapshot?.engagementScore ?? 0,
    totalEvents: totalNow,
    changePercent: pctChange,
  };
}
