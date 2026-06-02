/**
 * Episodic memory write-back via MissionBlackboard (append-only episodic_event rows).
 * Fire-and-forget safe; never blocks hot paths.
 */

import { getPrismaClient } from '../prisma.js';
import { appendEvent } from '../missionBlackboard.js';

const EPISODIC_EVENT_TYPE = 'episodic_event';
const MAX_EVENTS_PER_USER = 200;
const RETENTION_DAYS = 30;

/**
 * @param {unknown} raw
 */
function parsePayload(raw) {
  if (raw == null) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return /** @type {Record<string, unknown>} */ (raw);
  if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw);
      return p != null && typeof p === 'object' && !Array.isArray(p) ? p : {};
    } catch {
      return {};
    }
  }
  return {};
}

/**
 * Resolve a missionId to attach episodic events (explicit > latest pipeline for user).
 * @param {string | null | undefined} userId
 * @param {string | null | undefined} missionId
 */
async function resolveEpisodicMissionId(userId, missionId) {
  const mid = typeof missionId === 'string' ? missionId.trim() : '';
  if (mid) return mid;

  const uid = typeof userId === 'string' ? userId.trim() : '';
  if (!uid) return null;

  try {
    const prisma = getPrismaClient();
    const row = await prisma.missionPipeline.findFirst({
      where: { createdBy: uid },
      orderBy: { updatedAt: 'desc' },
      select: { id: true },
    });
    return row?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Trim old episodic rows for missions owned by userId.
 * @param {string} userId
 */
async function trimEpisodicRetention(userId) {
  const uid = typeof userId === 'string' ? userId.trim() : '';
  if (!uid) return;

  try {
    const prisma = getPrismaClient();
    if (!prisma.missionBlackboard?.findMany) return;

    const missions = await prisma.missionPipeline.findMany({
      where: { createdBy: uid },
      select: { id: true },
      take: 50,
      orderBy: { updatedAt: 'desc' },
    });
    const missionIds = missions.map((m) => m.id);
    if (!missionIds.length) return;

    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);

    await prisma.missionBlackboard.deleteMany({
      where: {
        missionId: { in: missionIds },
        eventType: EPISODIC_EVENT_TYPE,
        createdAt: { lt: cutoff },
      },
    });

    const rows = await prisma.missionBlackboard.findMany({
      where: {
        missionId: { in: missionIds },
        eventType: EPISODIC_EVENT_TYPE,
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
      skip: MAX_EVENTS_PER_USER,
    });

    if (rows.length > 0) {
      await prisma.missionBlackboard.deleteMany({
        where: { id: { in: rows.map((r) => r.id) } },
      });
    }
  } catch (err) {
    console.error('[EpisodicWriter] trim failed:', err?.message ?? err);
  }
}

/**
 * @typedef {{
 *   userId: string;
 *   missionId?: string | null;
 *   type: 'execution_outcome' | 'entity_resolved' | 'user_correction' | 'mission_complete';
 *   toolName?: string | null;
 *   storeId?: string | null;
 *   entityType?: string | null;
 *   entityRef?: string | null;
 *   resolvedId?: string | null;
 *   result?: 'success' | 'error' | null;
 *   errorMsg?: string | null;
 *   payload?: Record<string, unknown> | null;
 * }} EpisodicEventInput
 */

/**
 * Persist an episodic event (awaitable; callers should fire-and-forget).
 * @param {EpisodicEventInput} event
 */
export async function writeEpisodicEvent(event) {
  const userId = typeof event?.userId === 'string' ? event.userId.trim() : '';
  if (!userId) return;

  const missionId = await resolveEpisodicMissionId(userId, event.missionId);
  if (!missionId) {
    console.warn('[EpisodicWriter] skipped: no missionId for user', { userId: userId.slice(0, 12) });
    return;
  }

  const body = {
    userId,
    episodicType: event.type,
    toolName: event.toolName ?? null,
    storeId: event.storeId ?? null,
    entityType: event.entityType ?? null,
    entityRef: event.entityRef ?? null,
    resolvedId: event.resolvedId ?? null,
    result: event.result ?? null,
    errorMsg: event.errorMsg ?? null,
    payload: event.payload ?? null,
    recordedAt: new Date().toISOString(),
  };

  await appendEvent(missionId, EPISODIC_EVENT_TYPE, body, { agentId: 'memory_layer' });
  void trimEpisodicRetention(userId);
}

/**
 * Fire-and-forget episodic write.
 * @param {EpisodicEventInput} event
 */
export function writeEpisodicEventAsync(event) {
  writeEpisodicEvent(event).catch((err) => {
    console.error('[EpisodicWriter]', err?.message ?? err);
  });
}

/**
 * Read recent episodic events for hydration.
 * @param {{ userId?: string | null, missionId?: string | null, limit?: number }} opts
 */
export async function readEpisodicEvents(opts = {}) {
  const limit = typeof opts.limit === 'number' && opts.limit > 0 ? Math.min(opts.limit, 50) : 10;
  const mid =
    typeof opts.missionId === 'string' && opts.missionId.trim()
      ? opts.missionId.trim()
      : await resolveEpisodicMissionId(opts.userId, null);

  if (!mid) {
    return { events: [], missionId: null };
  }

  try {
    const prisma = getPrismaClient();
    const rows = await prisma.missionBlackboard.findMany({
      where: { missionId: mid, eventType: EPISODIC_EVENT_TYPE },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: { payload: true, createdAt: true },
    });

    const events = rows
      .map((row) => {
        const p = parsePayload(row.payload);
        return {
          ...p,
          createdAt: row.createdAt,
        };
      })
      .filter((e) => e && typeof e === 'object');

    return { events, missionId: mid };
  } catch (err) {
    console.error('[EpisodicWriter] read failed:', err?.message ?? err);
    return { events: [], missionId: mid };
  }
}

/**
 * Fold episodic rows into hydrator shape.
 * @param {Array<Record<string, unknown>>} events newest-first
 */
export function foldEpisodicContext(events) {
  const recentEvents = Array.isArray(events) ? events : [];
  /** @type {Record<string, unknown>} */
  const episodic = {
    recentEvents: recentEvents.slice(0, 5),
  };

  for (const ev of recentEvents) {
    const t = String(ev.episodicType ?? ev.type ?? '').trim();
    const ts = ev.createdAt instanceof Date ? ev.createdAt : ev.recordedAt ? new Date(String(ev.recordedAt)) : null;

    if (t === 'execution_outcome') {
      if (!episodic.lastAction && ev.result === 'success') {
        episodic.lastAction = {
          toolName: ev.toolName ?? null,
          storeId: ev.storeId ?? null,
          result: ev.result,
          timestamp: ts,
        };
      }
      if (!episodic.lastError && ev.result === 'error') {
        episodic.lastError = {
          toolName: ev.toolName ?? null,
          errorMessage: ev.errorMsg ?? null,
          storeId: ev.storeId ?? null,
          timestamp: ts,
        };
      }
    }

    if (t === 'entity_resolved') {
      const et = String(ev.entityType ?? '').toLowerCase();
      const resolved = {
        id: ev.resolvedId ?? null,
        name: ev.entityRef ?? null,
      };
      if (et === 'store' && !episodic.lastStore) {
        episodic.lastStore = { id: resolved.id, name: resolved.name };
        episodic.lastResolvedStore = { id: resolved.id, name: resolved.name };
      }
      if (et === 'product' && !episodic.lastProduct) {
        episodic.lastProduct = { id: resolved.id, name: resolved.name };
        episodic.lastResolvedProduct = { id: resolved.id, name: resolved.name };
      }
      if (et === 'campaign' && !episodic.lastCampaign) {
        episodic.lastCampaign = { id: resolved.id, name: resolved.name };
        episodic.lastResolvedCampaign = { id: resolved.id, name: resolved.name };
      }
    }
  }

  return episodic;
}
