/**
 * Phase 2.3-B / 2.3-F — Critical pipeline writes (authority lane + P1008 retry).
 */

import { isPerformerPipelineWriteHardeningEnabled, isPerformerSqliteRuntimeWriteSerializationEnabled } from './broker/brokerFlags.js';
import { appendEvent as appendBlackboardEvent } from './missionBlackboard.js';
import {
  isPrismaSocketTimeoutError,
  isTransientSqliteWriteError,
  recordPipelineUpdate,
  sleep,
} from './orchestration/orchestrationStabilityMetrics.js';
import { runCriticalSqliteWriteWithP1008Retry } from './sqliteCriticalWrite.js';
import { runSqliteAuthorityWrite } from './sqliteWriteLane.js';

const DEFAULT_MAX_ATTEMPTS = 5;
const STEP_UPDATE_MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 50;

/**
 * @param {unknown} err
 * @param {number} attempt
 * @param {number} maxAttempts
 */
function shouldRetryPipelineWrite(err, attempt, maxAttempts) {
  return attempt < maxAttempts && isTransientSqliteWriteError(err);
}

/**
 * @param {object} prisma
 * @param {() => Promise<object>} run
 * @param {{ label?: string, maxAttempts?: number }} [opts]
 */
async function runPipelineWrite(prisma, run, opts = {}) {
  const maxAttempts = opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  let attempt = 0;
  while (true) {
    attempt += 1;
    try {
      return await run();
    } catch (err) {
      if (!isPerformerPipelineWriteHardeningEnabled() || !shouldRetryPipelineWrite(err, attempt, maxAttempts)) {
        throw err;
      }
      recordPipelineUpdate({ retry: true });
      if (attempt >= maxAttempts) {
        recordPipelineUpdate({ timeout: true });
        throw err;
      }
      const delay = BASE_BACKOFF_MS * attempt;
      if (opts.label && process.env.NODE_ENV !== 'production') {
        console.warn(`[safePipelineUpdate] retry ${attempt}/${maxAttempts} label=${opts.label}: ${err?.message || err}`);
      }
      await sleep(delay);
    }
  }
}

/**
 * @param {unknown} err
 * @param {string} missionId
 * @param {string|undefined} stepId
 */
async function appendStepUpdateBlackboardError(err, missionId, stepId) {
  const mid = typeof missionId === 'string' ? missionId.trim() : '';
  if (!mid) return;
  const code = err && typeof err === 'object' && 'code' in err ? String(/** @type {{ code?: string }} */ (err).code ?? '') : '';
  const message = err && typeof err === 'object' && 'message' in err ? String(/** @type {{ message?: string }} */ (err).message ?? err) : String(err);
  try {
    await appendBlackboardEvent(mid, 'pipeline.step.update_failed', {
      stepId: stepId ?? null,
      code: code || 'PIPELINE_STEP_UPDATE_FAILED',
      message,
    });
  } catch (bbErr) {
    console.warn(
      '[safeMissionPipelineStepUpdate] blackboard append failed:',
      bbErr?.message || bbErr,
    );
  }
}

const PIPELINE_UPDATE_MAX_ATTEMPTS = 3;
const PIPELINE_P1008_BASE_BACKOFF_MS = 50;

/**
 * @param {number} attempt
 * @param {{ logPrefix?: string, label?: string, retryLog?: (attempt: number) => string }} [opts]
 */
function logPipelineUpdateP1008Retry(attempt, opts = {}) {
  if (typeof opts.retryLog === 'function') {
    console.warn(opts.retryLog(attempt));
    return;
  }
  const prefix = opts.logPrefix ?? '[safeMissionPipelineUpdate]';
  const label = opts.label ?? 'missionPipeline.update';
  console.warn(`${prefix} retry P1008 attempt=${attempt} label=${label}`);
}

/**
 * @param {object} prisma
 * @param {{ where: object, data: object }} args
 * @param {{ missionId?: string, label?: string, logPrefix?: string, retryLog?: (attempt: number) => string }} [opts]
 */
export async function safeMissionPipelineUpdate(prisma, args, opts = {}) {
  const runUpdate = async () => {
    let attempt = 0;
    while (true) {
      attempt += 1;
      try {
        return await prisma.missionPipeline.update(args);
      } catch (err) {
        if (!isPrismaSocketTimeoutError(err) || attempt >= PIPELINE_UPDATE_MAX_ATTEMPTS) {
          throw err;
        }
        recordPipelineUpdate({ retry: true });
        logPipelineUpdateP1008Retry(attempt, opts);
        await sleep(PIPELINE_P1008_BASE_BACKOFF_MS * 2 ** (attempt - 1));
      }
    }
  };

  if (isPerformerSqliteRuntimeWriteSerializationEnabled()) {
    return runSqliteAuthorityWrite(() => runUpdate(), opts.label ?? 'missionPipeline.update');
  }
  if (isPerformerPipelineWriteHardeningEnabled()) {
    return runPipelineWrite(prisma, () => prisma.missionPipeline.update(args), opts);
  }
  return runUpdate();
}

/**
 * @param {object} prisma
 * @param {{ where: object, data: object }} args
 * @param {{ label?: string, maxAttempts?: number }} [opts]
 */
export async function safePipelineUpdate(prisma, args, opts = {}) {
  return safeMissionPipelineUpdate(prisma, args, opts);
}

/**
 * Serialized MissionPipelineStep update with P1008/socket-timeout retry (never skips FSM writes).
 *
 * @param {object} prisma
 * @param {{ where: object, data: object }} args
 * @param {{ missionId?: string, label?: string }} [opts]
 */
export async function safeMissionPipelineStepUpdate(prisma, args, opts = {}) {
  const stepId =
    args?.where && typeof args.where === 'object' && args.where.id != null
      ? String(args.where.id)
      : undefined;

  const runUpdate = async () => {
    let attempt = 0;
    while (true) {
      attempt += 1;
      try {
        return await prisma.missionPipelineStep.update(args);
      } catch (err) {
        if (!isPrismaSocketTimeoutError(err) || attempt >= STEP_UPDATE_MAX_ATTEMPTS) {
          throw err;
        }
        recordPipelineUpdate({ retry: true });
        console.warn(
          `[safeMissionPipelineStepUpdate] retry P1008 attempt=${attempt} stepId=${stepId ?? 'unknown'}`,
        );
        await sleep(50 * 2 ** (attempt - 1));
      }
    }
  };

  try {
    if (isPerformerSqliteRuntimeWriteSerializationEnabled()) {
      return await runSqliteAuthorityWrite(() => runUpdate(), opts.label ?? 'missionPipelineStep.update');
    }
    return await runUpdate();
  } catch (err) {
    if (opts.missionId) {
      await appendStepUpdateBlackboardError(err, opts.missionId, stepId);
    }
    throw err;
  }
}

/**
 * @param {object} prisma
 * @param {{ where: object, data: object }} args
 * @param {{ missionId?: string, label?: string }} [opts]
 */
export async function safePipelineStepUpdate(prisma, args, opts = {}) {
  return safeMissionPipelineStepUpdate(prisma, args, opts);
}
