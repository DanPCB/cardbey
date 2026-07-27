/**
 * Structured loyalty program runway telemetry.
 */

import { emitHealthProbe } from '../../telemetry/healthProbes.js';

const PROBE_PREFIX = 'broker.loyalty.program';

/**
 * @param {string} tag
 * @param {Record<string, unknown>} [fields]
 */
export function emitLoyaltyProgramTelemetry(tag, fields = {}) {
  const payload = { event: tag, ...fields };
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[${tag}]`, JSON.stringify(payload));
  }
  emitHealthProbe(`${PROBE_PREFIX}.${tag.toLowerCase()}`, {
    status: tag.includes('FAILED') ? 'fail' : 'pass',
    ...payload,
  });
}

export const LOYALTY_TELEMETRY = {
  PLAN: 'LOYALTY_PROGRAM_PLAN',
  DRAFT_READY: 'LOYALTY_PROGRAM_DRAFT_READY',
  AWAITING_REVIEW: 'LOYALTY_PROGRAM_AWAITING_OWNER_REVIEW',
  APPLY_REQUESTED: 'LOYALTY_PROGRAM_APPLY_REQUESTED',
  MISSION_WRITE: 'MISSION_WRITE',
  APPLY_SUCCESS: 'LOYALTY_PROGRAM_APPLY_SUCCESS',
  APPLY_FAILED: 'LOYALTY_PROGRAM_APPLY_FAILED',
};
