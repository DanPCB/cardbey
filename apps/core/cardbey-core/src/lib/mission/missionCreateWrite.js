/**
 * Mission pipeline create — authority write lane + bounded P1008/SQLITE_BUSY retry.
 * Prevents Core crash on SQLite contention during store creation.
 */

import { createHash } from 'node:crypto';
import {
  isPrismaSocketTimeoutError,
  isSqliteBusyError,
  isTransientSqliteWriteError,
  sleep,
} from '../orchestration/orchestrationStabilityMetrics.js';
import { runSqliteAuthorityWrite } from '../sqliteWriteLane.js';

export const MISSION_CREATE_BACKOFF_MS = [150, 400, 900];
export const MISSION_CREATE_IDEMPOTENCY_WINDOW_MS = 60_000;
export const MISSION_CREATE_TIMEOUT_MS = 12_000;

const STORE_MISSION_REUSE_STATUSES = [
  'requested',
  'planned',
  'awaiting_confirmation',
  'queued',
  'executing',
  'awaiting_input',
];

export class MissionCreateBusyError extends Error {
  /** @param {unknown} [cause] */
  constructor(cause) {
    super('mission_create_busy');
    this.name = 'MissionCreateBusyError';
    this.code = 'mission_create_busy';
    this.cause = cause;
  }
}

export class MissionCreateTimeoutError extends Error {
  /** @param {unknown} [cause] */
  constructor(cause) {
    super('mission_create_timeout');
    this.name = 'MissionCreateTimeoutError';
    this.code = 'mission_create_timeout';
    this.cause = cause;
  }
}

/** @param {unknown} err */
export function isMissionCreateBusyError(err) {
  return err instanceof MissionCreateBusyError || err?.code === 'mission_create_busy';
}

/** @param {unknown} err */
export function isMissionCreateTimeoutError(err) {
  return err instanceof MissionCreateTimeoutError || err?.code === 'mission_create_timeout';
}

export function missionCreateBusyHttpBody() {
  return {
    ok: false,
    error: 'mission_create_busy',
    message: 'Cardbey is preparing your mission. Please try again in a moment.',
  };
}

export function missionCreateTimeoutHttpBody() {
  return {
    ok: false,
    error: 'mission_create_timeout',
    message: 'Cardbey is still preparing your mission. Please try again.',
  };
}

/** @param {import('express').Response} res */
export function respondMissionCreateBusy(res) {
  return res.status(503).json(missionCreateBusyHttpBody());
}

/** @param {import('express').Response} res */
export function respondMissionCreateTimeout(res) {
  return res.status(503).json(missionCreateTimeoutHttpBody());
}

/**
 * Intake route helper — always ends the HTTP response on mission-create failure.
 *
 * @param {import('express').Response} res
 * @param {(params: object) => Promise<object>} createMissionPipeline
 * @param {object} params
 * @returns {Promise<{ pipeline?: object, handled: boolean }>}
 */
export async function createMissionPipelineForIntakeRoute(res, createMissionPipeline, params) {
  try {
    const pipeline = await createMissionPipeline(params);
    return { pipeline, handled: false };
  } catch (err) {
    if (isMissionCreateBusyError(err)) {
      respondMissionCreateBusy(res);
      return { handled: true };
    }
    if (isMissionCreateTimeoutError(err)) {
      respondMissionCreateTimeout(res);
      return { handled: true };
    }
    console.error('[mission-create] route_error', {
      error: err?.code ?? err?.name,
      message: err?.message || String(err),
    });
    if (!res.headersSent) {
      res.status(500).json({
        ok: false,
        error: 'mission_create_failed',
        message: 'Could not create your mission. Please try again.',
      });
    }
    return { handled: true };
  } finally {
    console.log('[mission-create] route_response', {
      headersSent: res.headersSent,
      statusCode: res.statusCode,
    });
  }
}

function normalizeIdempotencyPart(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/**
 * userId + normalized goal + category + location + intentMode (60s reuse window enforced separately).
 * @param {{ createdBy?: string | null, title?: string | null, metadata?: Record<string, unknown> | null }} params
 */
export function buildStoreMissionIdempotencyKey(params) {
  const userId = String(params.createdBy ?? '').trim();
  if (!userId) return null;

  const meta =
    params.metadata && typeof params.metadata === 'object' && !Array.isArray(params.metadata)
      ? params.metadata
      : {};

  const goal = normalizeIdempotencyPart(
    meta.businessName ?? params.title ?? meta.rawUserText ?? '',
  );
  const category = normalizeIdempotencyPart(meta.businessType ?? '');
  const location = normalizeIdempotencyPart(meta.location ?? '');
  const intentMode = normalizeIdempotencyPart(meta.intentMode ?? 'store');

  const raw = `${userId}|${goal}|${category}|${location}|${intentMode}`;
  return createHash('sha256').update(raw).digest('hex').slice(0, 32);
}

/**
 * @param {string} createdBy
 * @param {Record<string, unknown>} meta
 * @param {string | null | undefined} title
 */
export function buildStoreMissionIdempotencyKeyFromMeta(createdBy, meta, title) {
  return buildStoreMissionIdempotencyKey({
    createdBy,
    title,
    metadata: meta,
  });
}

/**
 * @param {import('../prismaClient.js').PrismaClient} prisma
 * @param {string} idempotencyKey
 * @param {string} createdBy
 */
export async function findRecentStoreMissionByIdempotencyKey(prisma, idempotencyKey, createdBy) {
  const key = String(idempotencyKey ?? '').trim();
  const userId = String(createdBy ?? '').trim();
  if (!key || !userId) return null;

  const since = new Date(Date.now() - MISSION_CREATE_IDEMPOTENCY_WINDOW_MS);
  const rows = await prisma.missionPipeline.findMany({
    where: {
      type: 'store',
      createdBy: userId,
      status: { in: STORE_MISSION_REUSE_STATUSES },
      createdAt: { gte: since },
    },
    orderBy: { createdAt: 'desc' },
    take: 12,
    select: { id: true, status: true, title: true, metadataJson: true, createdAt: true },
  });

  for (const row of rows) {
    const meta =
      row.metadataJson && typeof row.metadataJson === 'object' && !Array.isArray(row.metadataJson)
        ? row.metadataJson
        : {};
    if (String(meta.idempotencyKey ?? '') === key) return row;
    const computed = buildStoreMissionIdempotencyKeyFromMeta(userId, meta, row.title);
    if (computed === key) return row;
  }
  return null;
}

/**
 * @param {Promise<T>} promise
 * @param {number} timeoutMs
 * @param {string} label
 * @returns {Promise<T>}
 * @template T
 */
function withMissionCreateTimeout(promise, timeoutMs, label) {
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new MissionCreateTimeoutError(new Error(`timeout after ${timeoutMs}ms (${label})`)));
    }, timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

/**
 * @param {() => Promise<T>} fn
 * @param {{ label?: string, maxAttempts?: number, timeoutMs?: number }} [opts]
 * @returns {Promise<T>}
 * @template T
 */
export async function runMissionCreateWrite(fn, opts = {}) {
  const label = opts.label ?? 'missionPipeline.create';
  const maxAttempts = opts.maxAttempts ?? MISSION_CREATE_BACKOFF_MS.length;
  const timeoutMs = opts.timeoutMs ?? MISSION_CREATE_TIMEOUT_MS;

  console.log('[mission-create] queued', { label });

  const runWithRetry = async () => {
    let attempt = 0;
    while (true) {
      attempt += 1;
      try {
        return await fn();
      } catch (err) {
        const transient = isTransientSqliteWriteError(err);
        if (!transient || attempt >= maxAttempts) {
          if (transient) {
            console.warn('[mission-create] failed_busy', {
              label,
              attempt,
              code: err?.code,
              message: err?.message || String(err),
            });
            throw new MissionCreateBusyError(err);
          }
          throw err;
        }
        const backoffMs = MISSION_CREATE_BACKOFF_MS[attempt - 1] ?? 900;
        console.warn('[mission-create] retry', {
          label,
          attempt,
          backoffMs,
          code: isPrismaSocketTimeoutError(err) ? 'P1008' : isSqliteBusyError(err) ? 'SQLITE_BUSY' : err?.code,
        });
        await sleep(backoffMs);
      }
    }
  };

  try {
    console.log('[mission-create] started', { label });
    const result = await withMissionCreateTimeout(
      runSqliteAuthorityWrite(() => runWithRetry(), label),
      timeoutMs,
      label,
    );
    console.log('[mission-create] success', { label });
    return result;
  } catch (err) {
    if (isMissionCreateTimeoutError(err)) {
      console.warn('[mission-create] timeout', { label, timeoutMs });
    }
    throw err;
  } finally {
    console.log('[mission-create] released', { label });
  }
}

/** @param {Parameters<typeof import('../missionPipelineService.js').createMissionPipeline>[0]} params */
export function attachStoreMissionIdempotencyKey(params) {
  if (String(params?.type ?? '').trim().toLowerCase() !== 'store') return params;
  const idempotencyKey = buildStoreMissionIdempotencyKey(params);
  if (!idempotencyKey) return params;
  const metadata =
    params.metadata && typeof params.metadata === 'object' && !Array.isArray(params.metadata)
      ? { ...params.metadata, idempotencyKey }
      : { idempotencyKey };
  return { ...params, metadata };
}
