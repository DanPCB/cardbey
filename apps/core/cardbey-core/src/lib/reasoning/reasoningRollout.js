/**
 * Phase 2 gradual rollout — mission-scoped reasoning activation.
 */

import crypto from 'node:crypto';
import { Features } from '../../config/features.js';

function pickString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

/**
 * Deterministic 0–99 bucket for stable rollout cohorts.
 *
 * @param {string} missionId
 */
export function reasoningRolloutBucket(missionId) {
  const mid = pickString(missionId);
  if (!mid) return 100;
  const hash = crypto.createHash('sha256').update(`phase2:${mid}`).digest();
  return hash[0] % 100;
}

/**
 * Whether the active reasoning loop should run for this mission.
 *
 * @param {string} missionId
 */
export function isReasoningEnabledForMission(missionId) {
  if (!Features.phase2.activeReasoning) {
    return { enabled: false, reason: 'PHASE2_ACTIVE_REASONING disabled' };
  }

  if (Features.phase2.stagingOnly) {
    const deployEnv = String(process.env.CARDEY_DEPLOY_ENV ?? '').trim().toLowerCase();
    if (deployEnv !== 'staging') {
      return { enabled: false, reason: 'PHASE2_REASONING_STAGING_ONLY' };
    }
  }

  const percent = Features.phase2.rolloutPercent;
  if (percent >= 100) {
    return { enabled: true, reason: 'rollout_100', bucket: reasoningRolloutBucket(missionId) };
  }
  if (percent <= 0) {
    return { enabled: false, reason: 'rollout_0', bucket: reasoningRolloutBucket(missionId) };
  }

  const bucket = reasoningRolloutBucket(missionId);
  if (bucket < percent) {
    return { enabled: true, reason: 'rollout_cohort', bucket, percent };
  }
  return { enabled: false, reason: 'rollout_excluded', bucket, percent };
}
