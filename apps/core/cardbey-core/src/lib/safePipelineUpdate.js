/**
 * Phase 2.3-B — Critical Pipeline Write Hardening, Step 5.
 *
 * Wraps MissionPipeline / MissionPipelineStep updates. When PERFORMER_PIPELINE_WRITE_HARDENING
 * is OFF (default), behavior is identical to raw prisma.*.update. When ON, retries transient
 * SQLite contention with bounded backoff (never coalesces or skips FSM writes).
 */

import { isPerformerPipelineWriteHardeningEnabled } from './broker/brokerFlags.js';
import {
  isTransientSqliteWriteError,
  recordPipelineUpdate,
  sleep,
} from './orchestration/orchestrationStabilityMetrics.js';

const DEFAULT_MAX_ATTEMPTS = 5;
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
 * @param {object} prisma
 * @param {{ where: object, data: object }} args
 * @param {{ label?: string, maxAttempts?: number }} [opts]
 */
export async function safePipelineUpdate(prisma, args, opts = {}) {
  if (!isPerformerPipelineWriteHardeningEnabled()) {
    return prisma.missionPipeline.update(args);
  }
  return runPipelineWrite(prisma, () => prisma.missionPipeline.update(args), opts);
}

/**
 * @param {object} prisma
 * @param {{ where: object, data: object }} args
 * @param {{ label?: string, maxAttempts?: number }} [opts]
 */
export async function safePipelineStepUpdate(prisma, args, opts = {}) {
  if (!isPerformerPipelineWriteHardeningEnabled()) {
    return prisma.missionPipelineStep.update(args);
  }
  return runPipelineWrite(prisma, () => prisma.missionPipelineStep.update(args), opts);
}
