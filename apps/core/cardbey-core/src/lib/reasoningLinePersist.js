/**
 * Reasoning line persistence during long SQLite-backed draft builds.
 * SSE + blackboard update immediately; Mission.context.reasoning_log is debounced
 * to avoid P1008 socket timeouts from mission.update + missionEvent.create per line.
 */

import { appendEvent } from './missionBlackboard.js';
import { broadcastMissionReasoningLine } from '../realtime/simpleSse.js';
import { Features } from '../config/features.js';
import { appendMissionReasoningToGraph } from './evidence/missionEvidenceGraphService.js';

/** @type {Map<string, { lines: string[], timer: ReturnType<typeof setTimeout> | null, prisma: object, mergeMissionContext: Function, agent: string }>} */
const pendingByMission = new Map();

/** Last normalized line per mission — skip consecutive duplicates. */
const lastEmittedLineByMission = new Map();

/** Rapid-fire coalesce bucket before SSE/blackboard append. */
/** @type {Map<string, { lines: string[], timer: ReturnType<typeof setTimeout> | null, agent: string, prisma?: object, mergeMissionContext?: Function }>} */
const coalesceByMission = new Map();

function normalizeReasoningLine(line) {
  return String(line ?? '')
    .trimEnd()
    .trim()
    .replace(/\s+/g, ' ');
}

function coalesceWindowMs() {
  const n = Number(process.env.REASONING_LINE_COALESCE_MS);
  return Number.isFinite(n) && n > 0 ? n : 400;
}

/**
 * Skip exact consecutive duplicate (after normalize). Milestone lines with different text still pass.
 * @param {string} missionId
 * @param {string} line
 */
export function shouldSkipDuplicateReasoningLine(missionId, line) {
  const mid = String(missionId ?? '').trim();
  const key = normalizeReasoningLine(line);
  if (!mid || !key) return true;
  const prev = lastEmittedLineByMission.get(mid);
  if (prev === key) return true;
  lastEmittedLineByMission.set(mid, key);
  return false;
}

/** @param {string} missionId */
export function resetReasoningLineDedupe(missionId) {
  const mid = String(missionId ?? '').trim();
  if (!mid) return;
  lastEmittedLineByMission.delete(mid);
  const c = coalesceByMission.get(mid);
  if (c?.timer) clearTimeout(c.timer);
  coalesceByMission.delete(mid);
}

function flushCoalescedReasoning(mid) {
  const bucket = coalesceByMission.get(mid);
  if (!bucket || bucket.lines.length === 0) return;
  const lines = bucket.lines.splice(0, bucket.lines.length);
  bucket.timer = null;
  const agent = bucket.agent;
  const prisma = bucket.prisma;
  const mergeMissionContext = bucket.mergeMissionContext;
  const startedAt = Date.now() - coalesceWindowMs();
  const completedAt = Date.now();

  for (const text of lines) {
    emitReasoningLineLive(mid, text, agent);
  }

  if (Features.phase1.consolidatedReasoningTrace) {
    void appendMissionReasoningToGraph(mid, lines.join(' · '), { agent, batch: true, lineCount: lines.length }).catch(
      () => {},
    );
  }

  void appendEvent(
    mid,
    'reasoning_batch',
    {
      lines,
      startedAt,
      completedAt,
      nodeId: agent,
      agent,
      lineCount: lines.length,
    },
    { agentId: agent },
  ).catch(() => {});

  if (prisma && typeof mergeMissionContext === 'function') {
    let b = pendingByMission.get(mid);
    if (!b) {
      b = { lines: [], timer: null, prisma, mergeMissionContext, agent };
      pendingByMission.set(mid, b);
    }
    b.lines.push(...lines);
  }

  const pending = pendingByMission.get(mid);
  if (pending?.lines.length) {
    if (pending.timer) clearTimeout(pending.timer);
    pending.timer = setTimeout(() => {
      void flushReasoningPersist(mid);
    }, flushDelayMs());
  }
}

function isSqliteDatabase() {
  const url = String(process.env.DATABASE_URL ?? '').toLowerCase();
  return url.includes('sqlite') || url.includes('file:');
}

/**
 * When true: broadcast SSE immediately; defer mission.update / missionEvent to debounced flush.
 */
export function shouldUseLightweightReasoningPersist() {
  if (process.env.REASONING_PERSIST_MODE === 'full') return false;
  if (process.env.REASONING_PERSIST_MODE === 'light') return true;
  return isSqliteDatabase() && process.env.NODE_ENV !== 'production';
}

function flushDelayMs() {
  const n = Number(process.env.REASONING_PERSIST_DEBOUNCE_MS);
  return Number.isFinite(n) && n > 0 ? n : 1500;
}

/**
 * Immediate UI path — does not touch Mission row.
 */
export function emitReasoningLineLive(missionId, line, agent = 'orchestra', timestamp = Date.now()) {
  const mid = String(missionId ?? '').trim();
  const text = String(line ?? '').trimEnd();
  if (!mid || !text) return;
  broadcastMissionReasoningLine(mid, { line: text, timestamp, agent });
}

/**
 * Queue blackboard + debounced context.reasoning_log merge (SQLite dev default).
 */
export function scheduleReasoningLinePersist(missionId, line, options = {}) {
  const mid = String(missionId ?? '').trim();
  const text = String(line ?? '').trimEnd();
  if (!mid || !text) return;
  if (shouldSkipDuplicateReasoningLine(mid, text)) return;

  const agent = options.agent != null && String(options.agent).trim() ? String(options.agent).trim() : 'orchestra';

  let bucket = coalesceByMission.get(mid);
  if (!bucket) {
    bucket = {
      lines: [],
      timer: null,
      agent,
      prisma: options.prisma,
      mergeMissionContext: options.mergeMissionContext,
    };
    coalesceByMission.set(mid, bucket);
  }
  bucket.lines.push(text);
  if (bucket.timer) clearTimeout(bucket.timer);
  bucket.timer = setTimeout(() => {
    flushCoalescedReasoning(mid);
  }, coalesceWindowMs());
}

/**
 * Full persist path (non-lightweight): coalesce + dedupe still apply.
 */
export function emitReasoningLineWithDedupe(missionId, line, agent = 'orchestra', timestamp = Date.now()) {
  const mid = String(missionId ?? '').trim();
  const text = String(line ?? '').trimEnd();
  if (!mid || !text) return;
  if (shouldSkipDuplicateReasoningLine(mid, text)) return;
  emitReasoningLineLive(mid, text, agent, timestamp);
}

async function flushReasoningPersist(missionId) {
  const mid = String(missionId ?? '').trim();
  const bucket = pendingByMission.get(mid);
  if (!bucket || bucket.lines.length === 0) return;

  const lines = bucket.lines.splice(0, bucket.lines.length);
  bucket.timer = null;

  const { prisma, mergeMissionContext } = bucket;
  if (!prisma || typeof mergeMissionContext !== 'function') return;

  try {
    let row = await prisma.mission.findUnique({ where: { id: mid }, select: { context: true } }).catch(() => null);
    if (!row) {
      const { ensureMissionRowForBlackboard } = await import('./missionBlackboard.js');
      await ensureMissionRowForBlackboard(prisma, mid);
      row = await prisma.mission.findUnique({ where: { id: mid }, select: { context: true } }).catch(() => null);
    }
    if (!row) return;
    const ctx = row.context && typeof row.context === 'object' ? row.context : {};
    const prev = Array.isArray(ctx.reasoning_log) ? ctx.reasoning_log.map(String) : [];
    await mergeMissionContext(mid, { reasoning_log: [...prev, ...lines] }, { prisma });
  } catch (e) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[reasoningLinePersist] flush failed:', mid, e?.message || e);
    }
  }
}

/** Flush debounced lines for one mission (call before draft build completes). */
export async function flushReasoningForMission(missionId) {
  const mid = String(missionId ?? '').trim();
  if (!mid) return;
  const bucket = pendingByMission.get(mid);
  if (bucket?.timer) {
    clearTimeout(bucket.timer);
    bucket.timer = null;
  }
  await flushReasoningPersist(mid);
}

/** Flush any pending lines (e.g. server shutdown). */
export async function flushAllPendingReasoningPersist() {
  const ids = [...pendingByMission.keys()];
  for (const mid of ids) {
    await flushReasoningForMission(mid);
  }
}
