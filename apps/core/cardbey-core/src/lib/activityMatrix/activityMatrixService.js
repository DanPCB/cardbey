/**
 * User Activity Matrix — server-side aggregation service.
 */

import {
  getEventDefinition,
  listEventDefinitions,
  matrixKeyForSourceEvent,
  resolveEventSources,
} from './activityMatrixEventRegistry.js';
import {
  generateIntervals,
  intervalKeyForTimestamp,
  validateDateRange,
  MAX_RANGE_DAYS,
  PLATFORM_MAX_RANGE_DAYS,
} from './activityMatrixIntervals.js';
import {
  CLASSIFICATION_CONFIG,
  classifyUser,
  computeLongestStreak,
  detectSlipping,
  median,
} from './activityMatrixClassifier.js';
import { generateMatrixInsights } from './activityMatrixInsights.js';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const STORE_EVENT_TAKE = 500_000;
const PLATFORM_EVENT_TAKE = 150_000;

/**
 * @typedef {object} MatrixContext
 * @property {'store' | 'platform'} scope
 * @property {string} [storeId]
 * @property {string} [ownerUserId]
 * @property {Set<string>} [platformOwnerUserIds]
 */

/**
 * @typedef {object} RawEvent
 * @property {string} id
 * @property {string} eventName
 * @property {Date} occurredAt
 * @property {string} [actorUserId]
 * @property {string} [sessionId]
 * @property {string} [storeId]
 * @property {'storeActivity' | 'pil'} sourceTable
 * @property {number} [value]
 */

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string[]} storeActivityTypes
 * @param {Date} from
 * @param {Date} to
 * @param {string} [storeIdFilter]
 */
async function fetchStoreActivityEvents(prisma, storeActivityTypes, from, to, storeIdFilter) {
  if (!storeActivityTypes.length) return [];
  const where = {
    eventType: { in: storeActivityTypes },
    createdAt: { gte: from, lte: to },
  };
  if (storeIdFilter) where.storeId = storeIdFilter;
  const rows = await prisma.storeActivityEvent.findMany({
    where,
    select: {
      id: true,
      eventType: true,
      createdAt: true,
      actorUserId: true,
      sessionId: true,
      storeId: true,
      metadataJson: true,
    },
    orderBy: { createdAt: 'asc' },
    take: storeIdFilter ? STORE_EVENT_TAKE : PLATFORM_EVENT_TAKE,
  });
  return rows.map((r) => ({
    id: r.id,
    eventName: r.eventType,
    occurredAt: r.createdAt,
    actorUserId: r.actorUserId ?? undefined,
    sessionId: r.sessionId ?? undefined,
    storeId: r.storeId,
    sourceTable: 'storeActivity',
    value: extractValue(r.metadataJson),
  }));
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string[]} pilTypes
 * @param {Date} from
 * @param {Date} to
 * @param {string} [storeIdFilter]
 */
async function fetchPilEvents(prisma, pilTypes, from, to, storeIdFilter) {
  if (!pilTypes.length || !prisma.pilEvent) return [];
  const where = {
    type: { in: pilTypes },
    timestamp: { gte: from, lte: to },
  };
  if (storeIdFilter) where.storeId = storeIdFilter;
  const rows = await prisma.pilEvent.findMany({
    where,
    select: {
      id: true,
      type: true,
      timestamp: true,
      userId: true,
      sessionId: true,
      storeId: true,
      metadata: true,
    },
    orderBy: { timestamp: 'asc' },
    take: storeIdFilter ? STORE_EVENT_TAKE : PLATFORM_EVENT_TAKE,
  });
  return rows.map((r) => ({
    id: r.id,
    eventName: r.type,
    occurredAt: r.timestamp,
    actorUserId: r.userId ?? undefined,
    sessionId: r.sessionId ?? undefined,
    storeId: r.storeId ?? undefined,
    sourceTable: 'pil',
    value: extractValue(r.metadata),
  }));
}

/** @param {unknown} metadata */
function extractValue(metadata) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return undefined;
  const v = /** @type {Record<string, unknown>} */ (metadata).value ?? /** @type {Record<string, unknown>} */ (metadata).amount;
  return typeof v === 'number' ? v : undefined;
}

/**
 * @param {RawEvent} event
 */
function actorKeyForEvent(event) {
  if (event.actorUserId) return `user:${event.actorUserId}`;
  if (event.sessionId) return `session:${event.sessionId}`;
  return null;
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string[]} actorUserIds
 * @param {string[]} eventTypes
 * @param {string[]} pilTypes
 * @param {Date} before
 * @param {string} [storeIdFilter]
 */
async function fetchFirstSeenMap(prisma, actorUserIds, eventTypes, pilTypes, before, storeIdFilter) {
  const map = new Map();
  if (!actorUserIds.length) return map;

  const storeWhere = {
    actorUserId: { in: actorUserIds },
    eventType: { in: eventTypes },
    createdAt: { lt: before },
  };
  if (storeIdFilter) storeWhere.storeId = storeIdFilter;

  const storeRows = eventTypes.length
    ? await prisma.storeActivityEvent.groupBy({
        by: ['actorUserId'],
        where: storeWhere,
        _min: { createdAt: true },
      })
    : [];

  for (const row of storeRows) {
    if (row.actorUserId && row._min.createdAt) {
      map.set(row.actorUserId, row._min.createdAt.toISOString());
    }
  }

  if (prisma.pilEvent && pilTypes.length) {
    const pilWhere = {
      userId: { in: actorUserIds },
      type: { in: pilTypes },
      timestamp: { lt: before },
    };
    if (storeIdFilter) pilWhere.storeId = storeIdFilter;
    const pilRows = await prisma.pilEvent.groupBy({
      by: ['userId'],
      where: pilWhere,
      _min: { timestamp: true },
    });
    for (const row of pilRows) {
      if (row.userId && row._min.timestamp) {
        const existing = map.get(row.userId);
        const ts = row._min.timestamp.toISOString();
        if (!existing || ts < existing) map.set(row.userId, ts);
      }
    }
  }

  return map;
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 */
async function fetchPlatformOwnerUserIds(prisma) {
  const rows = await prisma.business.findMany({
    select: { userId: true },
    distinct: ['userId'],
  });
  return new Set(rows.map((r) => r.userId).filter(Boolean));
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string[]} userIds
 */
async function fetchUserProfiles(prisma, userIds) {
  if (!userIds.length) return new Map();
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, displayName: true, fullName: true, email: true, avatarUrl: true, accountType: true },
  });
  return new Map(users.map((u) => [u.id, u]));
}

/**
 * @param {object} query
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {MatrixContext} context
 */
export async function buildActivityMatrix(query, prisma, context) {
  const scope = context.scope ?? 'store';
  const storeIdFilter = scope === 'store' ? context.storeId : query.storeIdFilter || context.storeId || undefined;
  if (scope === 'store' && !storeIdFilter) {
    throw Object.assign(new Error('storeId required'), { status: 400 });
  }

  const eventKeys = query.events?.length ? query.events : query.event ? [query.event] : [];
  if (!eventKeys.length) {
    const def = listEventDefinitions(scope === 'platform' ? 'platform' : 'store')[0];
    if (def) eventKeys.push(def.key);
  }

  for (const key of eventKeys) {
    if (!getEventDefinition(key)) {
      throw Object.assign(new Error(`Unknown event: ${key}`), { status: 400 });
    }
  }

  const def = getEventDefinition(eventKeys[0]);
  const granularity = query.granularity ?? 'day';
  if (def && !def.supportedGranularities.includes(granularity)) {
    throw Object.assign(new Error(`Granularity ${granularity} not supported for ${eventKeys[0]}`), { status: 400 });
  }

  const timezone = query.timezone ?? 'UTC';
  const from = new Date(query.from);
  const to = new Date(query.to);
  const rangeLimits = scope === 'platform' ? PLATFORM_MAX_RANGE_DAYS : MAX_RANGE_DAYS;
  const rangeCheck = validateDateRange(from, to, granularity, timezone, rangeLimits);
  if (!rangeCheck.ok) {
    throw Object.assign(new Error(rangeCheck.error), { status: 400 });
  }

  const platformOwnerUserIds =
    scope === 'platform'
      ? context.platformOwnerUserIds ?? (await fetchPlatformOwnerUserIds(prisma))
      : null;

  const { storeActivityTypes, pilTypes } = resolveEventSources(eventKeys);
  const intervals = generateIntervals(from, to, granularity, timezone, rangeLimits);

  const [storeEvents, pilEvents] = await Promise.all([
    fetchStoreActivityEvents(prisma, storeActivityTypes, from, to, storeIdFilter),
    fetchPilEvents(prisma, pilTypes, from, to, storeIdFilter),
  ]);
  const allEvents = [...storeEvents, ...pilEvents];

  /** @type {Map<string, { events: RawEvent[]; actorUserId?: string; sessionId?: string; storeIds: Set<string> }>} */
  const actorMap = new Map();

  for (const event of allEvents) {
    const actorKey = actorKeyForEvent(event);
    if (!actorKey) continue;

    const userType = resolveUserType(event, context.ownerUserId, platformOwnerUserIds);
    if (query.userType && query.userType !== 'all' && userType !== query.userType) continue;

    let bucket = actorMap.get(actorKey);
    if (!bucket) {
      bucket = { events: [], actorUserId: event.actorUserId, sessionId: event.sessionId, storeIds: new Set() };
      actorMap.set(actorKey, bucket);
    }
    bucket.events.push(event);
    if (event.storeId) bucket.storeIds.add(event.storeId);
  }

  const actorUserIds = [...actorMap.values()]
    .map((b) => b.actorUserId)
    .filter((id) => typeof id === 'string');

  const priorFirstSeen = await fetchFirstSeenMap(
    prisma,
    actorUserIds,
    storeActivityTypes,
    pilTypes,
    from,
    storeIdFilter,
  );
  const userProfiles = await fetchUserProfiles(prisma, actorUserIds);

  /** @type {Array<object>} */
  let userRows = [];

  for (const [actorKey, bucket] of actorMap) {
    /** @type {Map<string, { count: number; first?: string; last?: string; value: number; breakdown: Record<string, number> }>} */
    const cellMap = new Map();

    for (const event of bucket.events) {
      const matrixKey = matrixKeyForSourceEvent(event.sourceTable, event.eventName, eventKeys);
      const intervalKey = intervalKeyForTimestamp(event.occurredAt.toISOString(), intervals, granularity, timezone);
      let cell = cellMap.get(intervalKey);
      if (!cell) {
        cell = { count: 0, value: 0, breakdown: {} };
        cellMap.set(intervalKey, cell);
      }
      cell.count += 1;
      const iso = event.occurredAt.toISOString();
      if (!cell.first || iso < cell.first) cell.first = iso;
      if (!cell.last || iso > cell.last) cell.last = iso;
      if (event.value) cell.value += event.value;
      const bk = matrixKey ?? event.eventName;
      cell.breakdown[bk] = (cell.breakdown[bk] ?? 0) + 1;
    }

    const activeIntervalKeys = new Set([...cellMap.entries()].filter(([, c]) => c.count > 0).map(([k]) => k));
    const activeIntervals = activeIntervalKeys.size;
    const totalEvents = bucket.events.length;
    const longestStreak = computeLongestStreak(activeIntervalKeys, intervals);

    const timestamps = bucket.events.map((e) => e.occurredAt.getTime());
    const firstSeen = new Date(Math.min(...timestamps)).toISOString();
    const lastActive = new Date(Math.max(...timestamps)).toISOString();
    const inactivityDays = Math.floor((Date.now() - new Date(lastActive).getTime()) / 86_400_000);

    const userId = bucket.actorUserId ?? actorKey;
    const profile = bucket.actorUserId ? userProfiles.get(bucket.actorUserId) : null;
    const displayName =
      profile?.displayName || profile?.fullName || profile?.email || (bucket.sessionId ? `Guest ${bucket.sessionId.slice(0, 6)}` : userId);
    let secondaryLabel = profile?.email && profile.email !== displayName ? profile.email : bucket.sessionId ? `Session ${bucket.sessionId.slice(0, 8)}` : undefined;
    if (scope === 'platform' && bucket.storeIds.size > 0) {
      const storeSuffix = `${bucket.storeIds.size} store${bucket.storeIds.size === 1 ? '' : 's'}`;
      secondaryLabel = secondaryLabel ? `${secondaryLabel} · ${storeSuffix}` : storeSuffix;
    }
    const userType = resolveUserType(bucket.events[0], context.ownerUserId, platformOwnerUserIds);

    const hadPriorActivity = bucket.actorUserId ? priorFirstSeen.has(bucket.actorUserId) : false;
    const firstEventInRange = !hadPriorActivity;

    const summary = {
      activeIntervals,
      totalEvents,
      longestStreak,
      firstSeen,
      lastActive,
      inactivityDays,
      firstEventInRange,
      hadPriorActivity,
      slipping: detectSlipping(activeIntervalKeys, intervals),
    };

    const cells = intervals.map((interval) => {
      const c = cellMap.get(interval.key);
      return {
        intervalKey: interval.key,
        eventCount: c?.count ?? 0,
        firstOccurredAt: c?.first,
        lastOccurredAt: c?.last,
        totalValue: c?.value || undefined,
        eventBreakdown: Object.keys(c?.breakdown ?? {}).length ? c.breakdown : undefined,
      };
    });

    userRows.push({
      userId,
      displayName,
      secondaryLabel,
      avatarUrl: profile?.avatarUrl ?? undefined,
      userType,
      cells,
      summary,
      _sortActive: activeIntervals,
      _sortEvents: totalEvents,
      _sortName: displayName.toLowerCase(),
      _sortLast: lastActive,
    });
  }

  // Filters
  if (query.minActiveIntervals) {
    userRows = userRows.filter((u) => u.summary.activeIntervals >= query.minActiveIntervals);
  }
  if (query.search) {
    const q = query.search.toLowerCase();
    userRows = userRows.filter(
      (u) =>
        u.userId.toLowerCase().includes(q) ||
        u.displayName.toLowerCase().includes(q) ||
        (u.secondaryLabel?.toLowerCase().includes(q) ?? false),
    );
  }
  if (query.state) {
    // Applied after classification below — placeholder
  }

  // Sort
  const sort = query.sort ?? 'active_desc';
  userRows.sort((a, b) => {
    if (sort === 'name_asc') return a._sortName.localeCompare(b._sortName);
    if (sort === 'last_active') return b._sortLast.localeCompare(a._sortLast);
    if (sort === 'events_desc') return b._sortEvents - a._sortEvents;
    return b._sortActive - a._sortActive;
  });

  // Rank for power user
  const activeCounts = userRows.map((u) => u.summary.activeIntervals).sort((a, b) => a - b);
  const eventLabel = getEventDefinition(eventKeys[0])?.label ?? eventKeys[0];

  for (const row of userRows) {
    const rankIdx = activeCounts.filter((c) => c <= row.summary.activeIntervals).length;
    const rankPercentile = activeCounts.length ? rankIdx / activeCounts.length : 0;
    row.classification = classifyUser(row.summary, intervals, new Set(row.cells.filter((c) => c.eventCount > 0).map((c) => c.intervalKey)), {
      eventLabel,
      rankPercentile,
      isPowerUserCandidate: userRows.length >= 5,
    });
  }

  if (query.state) {
    userRows = userRows.filter((u) => u.classification?.key === query.state);
  }

  const metrics = computeMetrics(userRows);
  const insights =
    userRows.length >= 3
      ? generateMatrixInsights(userRows, metrics, intervals, eventLabel)
      : [];

  // Cursor pagination
  const limit = Math.min(query.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
  let startIdx = 0;
  if (query.cursor) {
    const idx = userRows.findIndex((u) => u.userId === query.cursor);
    startIdx = idx >= 0 ? idx + 1 : 0;
  }
  const page = userRows.slice(startIdx, startIdx + limit);
  const nextCursor = startIdx + limit < userRows.length ? page[page.length - 1]?.userId : undefined;

  const cleanUsers = page.map((u) => {
    const { _sortActive, _sortEvents, _sortName, _sortLast, ...rest } = u;
    return rest;
  });

  return {
    scope,
    range: { from: from.toISOString(), to: to.toISOString(), granularity, timezone },
    intervals,
    users: cleanUsers,
    metrics,
    insights,
    nextCursor,
    eventDefinitions: listEventDefinitions(scope === 'platform' ? 'platform' : 'store'),
    storeIdFilter: storeIdFilter ?? null,
  };
}

/** @param {Array<{ summary: { activeIntervals: number; totalEvents: number }; classification?: { key: string } }>} users */
function computeMetrics(users) {
  const activeIntervalsList = users.map((u) => u.summary.activeIntervals);
  return {
    uniqueUsers: users.length,
    activeUsers: users.filter((u) => u.summary.activeIntervals >= 1).length,
    returningUsers: users.filter((u) => u.summary.activeIntervals >= 2).length,
    newlyActivatedUsers: users.filter((u) => u.classification?.key === 'new').length,
    dormantUsers: users.filter((u) => u.classification?.key === 'dormant').length,
    reactivatedUsers: users.filter((u) => u.classification?.key === 'reactivated').length,
    medianActiveIntervals: median(activeIntervalsList),
    totalEvents: users.reduce((s, u) => s + u.summary.totalEvents, 0),
  };
}

/**
 * @param {RawEvent | { actorUserId?: string; sessionId?: string }} event
 * @param {string} [ownerUserId]
 * @param {Set<string> | null} [platformOwnerUserIds]
 */
function resolveUserType(event, ownerUserId, platformOwnerUserIds) {
  if (event.actorUserId) {
    if (platformOwnerUserIds) {
      return platformOwnerUserIds.has(event.actorUserId) ? 'owner' : 'buyer';
    }
    return event.actorUserId === ownerUserId ? 'owner' : 'buyer';
  }
  return 'guest';
}

export { listEventDefinitions, CLASSIFICATION_CONFIG };
