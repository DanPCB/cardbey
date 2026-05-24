/**
 * Mission blackboard: append-only event log per Mission for multi-agent coordination.
 * Safe across processes when using Postgres; SQLite serializes writers.
 */

import { getPrismaClient } from '../lib/prisma.js';
import { resolveMissionCorrelationId } from './agentRun.js';
import { ensureShadowUserRowForGuest } from './mission.js';

/** One-time warn when MissionBlackboard table is missing (staging / pending migration). */
let missionBlackboardMissingTableWarned = false;

function isMissingBlackboardTableError(err) {
  const msg = err?.message || String(err || '');
  return msg.includes('does not exist') || msg.includes('no such table') || err?.code === 'P2021';
}

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

function isNonUserIdPlaceholder(uid) {
  if (uid == null || typeof uid !== 'string') return true;
  const s = uid.trim();
  return !s || s === 'temp' || s === 'dev-user-id';
}

/**
 * MissionBlackboard.missionId FK → Mission.id. MissionPipeline rows use the same string id but did not
 * always create a Mission row, which caused appendEvent to fail with FK errors (often surfaced as Prisma errors).
 * Ensures a minimal "shadow" Mission exists when we have a matching MissionPipeline.
 *
 * @param {import('./prismaClient.js').Prisma.TransactionClient} tx
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

  let createdByUserId =
    typeof pipe.createdBy === 'string' && !isNonUserIdPlaceholder(pipe.createdBy) ? pipe.createdBy.trim() : null;
  let tenantId =
    (typeof pipe.tenantId === 'string' && pipe.tenantId.trim()) || createdByUserId || null;

  const linkTask = await tx.orchestratorTask.findFirst({
    where: { missionId: mid },
    select: { userId: true, tenantId: true },
    orderBy: { createdAt: 'desc' },
  });
  if (isNonUserIdPlaceholder(createdByUserId) && linkTask?.userId && !isNonUserIdPlaceholder(linkTask.userId)) {
    createdByUserId = String(linkTask.userId).trim();
  }
  if ((!tenantId || tenantId === 'temp') && linkTask?.tenantId && String(linkTask.tenantId).trim()) {
    tenantId = String(linkTask.tenantId).trim();
  }
  if (!tenantId) {
    tenantId = createdByUserId;
  }
  if (isNonUserIdPlaceholder(createdByUserId)) {
    console.warn('[missionBlackboard] cannot create shadow Mission: no valid User id for createdByUserId', { mid });
    return false;
  }

  await ensureShadowUserRowForGuest(tx, createdByUserId);
  const creatorExists = await tx.user.findUnique({ where: { id: createdByUserId }, select: { id: true } });
  if (!creatorExists) {
    console.warn('[missionBlackboard] cannot create shadow Mission: User row missing for createdByUserId', {
      mid,
      createdByUserId,
    });
    return false;
  }

  await tx.mission.upsert({
    where: { id: pipe.id },
    create: {
      id: pipe.id,
      tenantId: tenantId || createdByUserId,
      createdByUserId,
      title: pipe.title != null ? String(pipe.title).trim() || null : null,
      status: 'active',
    },
    update: {},
  });
  return true;
}

/**
 * Ensure a Mission row exists for a MissionPipeline id (wrapper for emitContextUpdate / reasoning feed).
 * @param {import('./prismaClient.js').PrismaClient} prisma
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

  const isBlackboardSeqCollision = (e) =>
    e?.code === 'P2002' ||
    (typeof e?.message === 'string' && e.message.includes('Unique constraint') && e.message.includes('missionId'));

  try {
    let row = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        row = await prisma.$transaction(async (tx) => {
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
        break;
      } catch (inner) {
        if (!isBlackboardSeqCollision(inner) || attempt >= 2) throw inner;
      }
    }
    if (!row) {
      return { ok: false, error: 'blackboard_append_failed' };
    }
    console.log(`[missionBlackboard][traceId=${traceId}] appendEvent missionId=${mid} eventType=${et} seq=${row.seq}`);
    return { ok: true, seq: row.seq, id: row.id };
  } catch (e) {
    if (isMissingBlackboardTableError(e)) {
      if (!missionBlackboardMissingTableWarned) {
        console.warn(
          '[missionBlackboard] MissionBlackboard table not found — run prisma migrate deploy. Events will not be persisted.',
        );
        missionBlackboardMissingTableWarned = true;
      }
      return { ok: false, reason: 'table_missing' };
    }
    const msg = e?.message || String(e);
    console.warn(`[missionBlackboard][traceId=${traceId}] appendEvent failed:`, msg);
    return { ok: false, error: msg };
  }
}

/**
 * Set a dotted-path blackboard key for mission agents (append-only snapshot event).
 * @param {string} missionId
 * @param {string} key e.g. business.socialLinks
 * @param {unknown} value
 * @param {{ agentId?: string, correlationId?: string | null }} [opts]
 */
export async function setBlackboardKey(missionId, key, value, opts = {}) {
  const k = typeof key === 'string' ? key.trim() : '';
  if (!k) return { ok: false, error: 'blackboard_key_required' };
  return appendEvent(missionId, 'blackboard_set', { key: k, value }, opts);
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
        /** Exclusive cursor: afterSeq=N returns only rows with seq > N (never re-send seq N). */
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
    if (isMissingBlackboardTableError(err)) {
      if (!missionBlackboardMissingTableWarned) {
        console.warn(
          '[missionBlackboard] MissionBlackboard table not found — run prisma migrate deploy. Events will not be persisted.',
        );
        missionBlackboardMissingTableWarned = true;
      }
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
    if (isMissingBlackboardTableError(e)) {
      if (!missionBlackboardMissingTableWarned) {
        console.warn(
          '[missionBlackboard] MissionBlackboard table not found — run prisma migrate deploy. Events will not be persisted.',
        );
        missionBlackboardMissingTableWarned = true;
      }
      return { event: null, error: 'table_missing' };
    }
    const msg = e?.message || String(e);
    return { event: null, error: msg };
  }
}
