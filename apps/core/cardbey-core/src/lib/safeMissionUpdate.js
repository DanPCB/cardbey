/**
 * Phase 2.3-B — safe Mission row updates (NOT MissionPipeline FSM).
 *
 * When PERFORMER_ORCHESTRATION_STABILITY is OFF (default), identical to prisma.mission.update.
 * When ON, non-critical writes may retry lightly and degrade to { ok: false, skipped: true }
 * instead of throwing.
 */

import { getPrismaClient } from './prisma.js';
import { isPerformerOrchestrationStabilityEnabled } from './broker/brokerFlags.js';
import {
  isTransientSqliteWriteError,
  recordMissionUpdate,
  sleep,
} from './orchestration/orchestrationStabilityMetrics.js';

const DEFAULT_MAX_ATTEMPTS = 4;
const BASE_BACKOFF_MS = 40;

/**
 * @param {{ where: object, data: object }} args
 * @param {{ prisma?: object, label?: string, nonCritical?: boolean, maxAttempts?: number }} [opts]
 * @returns {Promise<object>}
 */
export async function safeMissionUpdate(args, opts = {}) {
  const prisma = opts.prisma ?? getPrismaClient();
  const maxAttempts = opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const nonCritical = opts.nonCritical === true;

  if (!isPerformerOrchestrationStabilityEnabled()) {
    return prisma.mission.update(args);
  }

  let attempt = 0;
  while (true) {
    attempt += 1;
    try {
      const result = await prisma.mission.update(args);
      return { ok: true, result };
    } catch (err) {
      const retryable = isTransientSqliteWriteError(err) && attempt < maxAttempts;
      if (retryable) {
        recordMissionUpdate({ retry: true });
        await sleep(BASE_BACKOFF_MS * attempt);
        continue;
      }
      if (nonCritical) {
        recordMissionUpdate({ skipped: true });
        if (opts.label && process.env.NODE_ENV !== 'production') {
          console.warn(`[safeMissionUpdate] skipped non-critical label=${opts.label}: ${err?.message || err}`);
        }
        return { ok: false, skipped: true };
      }
      throw err;
    }
  }
}
