/**
 * Mission blackboard: append-only event log per Mission for multi-agent coordination.
 * Safe across processes when using Postgres; SQLite serializes writers.
 */

import { getPrismaClient } from '../lib/prisma.js';
import { resolveMissionCorrelationId } from './agentRun.js';

// Default pagination limit for getEvents() – balance between recency and performance
// Increase if agents need more context; callers can override with explicit limit
export const DEFAULT_BLACKBOARD_LIMIT = 50;

/** Events loaded when folding snapshot state in getLatestSnapshot() (separate from getEvents default). */
export const DEFAULT_BLACKBOARD_SNAPSHOT_LIMIT = 2000;

/** Serialize event payload for DB (SQLite stores MissionBlackboard.payload as JSON text). */
function serializeBlackboardPayload(payload) {
  const obj =
    payload == null
      ? {}
      : typeof payload === 'object' && !Array.isArray(payload)
        ? payload
        : { value: payload };
  return JSON.stringify(obj);
}

/** Parse row payload to a plain object for API consumers. */
function normalizeBlackboardPayload(raw) {
  if (raw == null) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw);
      return p != null && typeof p === 'object' && !Array.isArray(p) ? p : { value: p };
    } catch {
      return { raw };
    }
  }
  return { value: raw };
}

/**
 * MissionBlackboard.missionId FK → Mission.id. MissionPipeline rows use the same string id but did not
 * always create a Mission row, which caused appendEvent to fail with FK errors (often surfaced as Prisma errors).
 * Ensures a minimal "shadow" Mission exists when we have a matching MissionPipeline.
 *
 * @param {import('@prisma/client').Prisma.TransactionClient} tx
 * @param {string} missionId
 * @returns {Promise<boolean>} true if Mission exists (or was created); false if nothing to attach to
 */
export async function ensureMissionRowForBlackboardTx(tx, missionId) {
  const mid = typeof missionId === 'string' ? missionId.trim() : '';
  if (!mid) return false;

  const existing = await tx.mission.findUnique({ where: { id: mid }, select: { id: true } });
  if (existing) return true;

  const pipe = await tx.missionPipeline.findUnique({
    where: { id: mid },
    select: { id: true, title: true, tenantId: true, createdBy: true },
  });
  if (!pipe) return false;

  const tenantId =
    (typeof pipe.tenantId === 'string' && pipe.tenantId.trim()) ||
    (typeof pipe.createdBy === 'string' && pipe.createdBy.trim()) ||
    'temp';
  const createdByUserId =
    (typeof pipe.createdBy === 'string' && pipe.createdBy.trim()) ||
    (typeof pipe.tenantId === 'string' && pipe.tenantId.trim()) ||
    'temp';

  try {
    await tx.mission.create({
      data: {
        id: pipe.id,
        tenantId,
        createdByUserId,
        title: pipe.title != null ? String(pipe.title).trim() || null : null,
        status: 'active',
      },
    });
  } catch (e) {
    const code = e?.code;
    if (code === 'P2002') return true;
    throw e;
  }
  return true;
}

/**
 * Ensure a Mission row exists for a MissionPipeline id (wrapper for emitContextUpdate / reasoning feed).
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} missionId
 * @returns {Promise<boolean>}
 */
export async function ensureMissionRowForBlackboard(prisma, missionId) {
  if (!prisma || typeof missionId !== 'string' || !missionId.trim()) return false;
  const mid = missionId.trim();
  try {
    return await prisma.$transaction(async (tx) => ensureMissionRowForBlackboardTx(tx, mid));
  } catch (e) {
    console.warn('[missionBlackboard] ensureMissionRowForBlackboard failed:', e?.message || e);
    return false;
  }
}

/**
 * @param {string} missionId
 * @param {string} eventType e.g. plan_proposed, turn_claimed, reflection, handoff
 * @param {unknown} payload
 * @param {{ agentId?: string, correlationId?: string | null }} [opts]
 * @returns {Promise<{ ok: boolean, seq?: number, id?: string, error?: string }>}
 */
export async function appendEvent(missionId, eventType, payload, opts = {}) {
  const mid = typeof missionId === 'string' ? missionId.trim() : '';
  const et = typeof eventType === 'string' ? eventType.trim() : '';
  if (!mid || !et) {
    return { ok: false, error: 'mission_id_and_event_type_required' };
  }
  const agentId = opts.agentId != null && String(opts.agentId).trim() ? String(opts.agentId).trim() : null;
  const prisma = getPrismaClient();
  if (!prisma.missionBlackboard || typeof prisma.missionBlackboard.create !== 'function') {
    const msg =
      'MissionBlackboard model missing in Prisma client — run: npx prisma generate --schema prisma/sqlite/schema.prisma (or postgres) then prisma db push';
    console.warn(`[missionBlackboard] appendEvent skipped: ${msg}`);
    return { ok: false, error: msg };
  }
  const traceId = await resolveMissionCorrelationId(mid, opts.correlationId ?? null);

  try {
    const row = await prisma.$transaction(async (tx) => {
      const ensured = await ensureMissionRowForBlackboardTx(tx, mid);
      if (!ensured) {
        throw new Error(
          'blackboard_parent_missing: no Mission or MissionPipeline row for this id (cannot satisfy MissionBlackboard FK)',
        );
      }
      const agg = await tx.missionBlackboard.aggregate({
        where: { missionId: mid },
        _max: { seq: true },
      });
      const nextSeq = (agg._max.seq ?? 0) + 1;
      return tx.missionBlackboard.create({
        data: {
          missionId: mid,
          seq: nextSeq,
          eventType: et,
          payload: serializeBlackboardPayload(payload),
          agentId,
          correlationId: traceId,
        },
      });
    });
    console.log(`[missionBlackboard][traceId=${traceId}] appendEvent missionId=${mid} eventType=${et} seq=${row.seq}`);
    return { ok: true, seq: row.seq, id: row.id };
  } catch (e) {
    const msg = e?.message || String(e);
    console.warn(`[missionBlackboard][traceId=${traceId}] appendEvent failed:`, msg);
    return { ok: false, error: msg };
  }
}

/**
 * @param {string} missionId
 * @param {{ afterSeq?: number, limit?: number, correlationId?: string }} [opts]
 * @returns {Promise<{ events: Array<{ id: string, seq: number, eventType: string, payload: unknown, agentId: string | null, correlationId: string | null, createdAt: Date }>, error?: string }>}
 */
export async function getEvents(missionId, opts = {}) {
  const mid = typeof missionId === 'string' ? missionId.trim() : '';
  if (!mid) {
    return { events: [], error: 'mission_id_required' };
  }
  const afterSeq = typeof opts.afterSeq === 'number' && opts.afterSeq >= 0 ? opts.afterSeq : undefined;
  const cid =
    typeof opts.correlationId === 'string' && opts.correlationId.trim() ? opts.correlationId.trim() : undefined;
  const limit =
    typeof opts.limit === 'number' && opts.limit > 0
      ? Math.min(opts.limit, 5000)
      : DEFAULT_BLACKBOARD_LIMIT;
  const prisma = getPrismaClient();
  if (!prisma?.missionBlackboard || typeof prisma.missionBlackboard.findMany !== 'function') {
    console.warn('[missionBlackboard] model missing on client');
    return { events: [] };
  }

  try {
    const events = await prisma.missionBlackboard.findMany({
      where: {
        missionId: mid,
        ...(cid ? { correlationId: cid } : {}),
        ...(afterSeq != null ? { seq: { gt: afterSeq } } : {}),
      },
      orderBy: { seq: 'asc' },
      take: limit,
      select: {
        id: true,
        seq: true,
        eventType: true,
        payload: true,
        agentId: true,
        correlationId: true,
        createdAt: true,
      },
    });
    return { events: events.map((e) => ({ ...e, payload: normalizeBlackboardPayload(e.payload) })) };
  } catch (err) {
    const msg = err?.message || String(err);
    const code = err?.code;
    if (
      msg.includes('does not exist') ||
      msg.includes('no such table') ||
      code === 'P2021'
    ) {
      console.warn('[missionBlackboard] table not yet created, returning []');
      return { events: [] };
    }
    throw err;
  }
}

/**
 * Minimal fold for UI / agents: last seq, counts by type, last plan/handoff/reflection payloads.
 * @param {string} missionId
 * @returns {Promise<{ latestSeq: number, byType: Record<string, number>, lastPlan: unknown | null, lastHandoff: unknown | null, lastReflection: unknown | null }>}
 */
export async function getLatestSnapshot(missionId) {
  const { events, error } = await getEvents(missionId, { limit: DEFAULT_BLACKBOARD_SNAPSHOT_LIMIT });
  if (error) {
    return { latestSeq: 0, byType: {}, lastPlan: null, lastHandoff: null, lastReflection: null };
  }

  const byType = {};
  let latestSeq = 0;
  let lastPlan = null;
  let lastHandoff = null;
  let lastReflection = null;

  for (const e of events) {
    latestSeq = e.seq;
    byType[e.eventType] = (byType[e.eventType] || 0) + 1;
    if (e.eventType === 'plan_proposed') lastPlan = e.payload;
    if (e.eventType === 'handoff') lastHandoff = e.payload;
    if (e.eventType === 'reflection') lastReflection = e.payload;
  }

  return { latestSeq, byType, lastPlan, lastHandoff, lastReflection };
}

/**
 * Fetch a single mission blackboard event by either:
 * - `id`: MissionBlackboard.id (cuid string)
 * - `seq`: numeric sequence (unique per mission)
 *
 * @param {string} missionId
 * @param {string} eventId - Cuid id or numeric seq
 * @returns {Promise<{ event: any | null, error?: string }>}
 */
export async function getBlackboardEventByIdOrSeq(missionId, eventId) {
  const mid = typeof missionId === 'string' ? missionId.trim() : '';
  const raw = typeof eventId === 'string' ? eventId.trim() : '';
  if (!mid || !raw) return { event: null, error: 'mission_id_and_event_id_required' };

  const prisma = getPrismaClient();
  if (!prisma.missionBlackboard || typeof prisma.missionBlackboard.findFirst !== 'function') {
    return { event: null, error: 'mission_blackboard_model_unavailable' };
  }

  // If numeric, treat as seq (int) — matches @@unique([missionId, seq]).
  const asSeq = /^\d+$/.test(raw) ? parseInt(raw, 10) : null;

  try {
    const event = await prisma.missionBlackboard.findFirst({
      where: {
        missionId: mid,
        ...(asSeq != null ? { seq: asSeq } : { id: raw }),
      },
      select: {
        id: true,
        seq: true,
        eventType: true,
        payload: true,
        agentId: true,
        correlationId: true,
        createdAt: true,
      },
    });

    return {
      event: event ? { ...event, payload: normalizeBlackboardPayload(event.payload) } : null,
    };
  } catch (e) {
    const msg = e?.message || String(e);
    return { event: null, error: msg };
  }
}
