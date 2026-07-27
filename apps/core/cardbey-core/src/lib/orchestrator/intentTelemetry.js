/**
 * Phase 0: planning telemetry — hashes only, no raw user text in logs.
 */

import { createHash } from 'node:crypto';

/**
 * @param {string} text
 * @returns {string} sha256 hex (empty string -> hash of empty)
 */
export function hashInput(text) {
  const t = typeof text === 'string' ? text : String(text ?? '');
  return createHash('sha256').update(t, 'utf8').digest('hex');
}

/**
 * Stable plan summary for hashing (no PII beyond structural mission fields).
 * @param {object|null|undefined} plan
 * @returns {string} sha256 hex
 */
export function hashPlanSummary(plan) {
  if (!plan || typeof plan !== 'object') {
    return createHash('sha256').update('null', 'utf8').digest('hex');
  }
  const stable = {
    missionType: plan.missionType ?? null,
    title: plan.title ?? null,
    targetType: plan.targetType ?? null,
    targetId: plan.targetId ?? null,
    requiresConfirmation: Boolean(plan.requiresConfirmation),
  };
  return createHash('sha256').update(JSON.stringify(stable), 'utf8').digest('hex');
}

/**
 * @param {{
 *   source: string,
 *   inputHash: string,
 *   planHash: string,
 *   missionType?: string|null,
 *   correlationId?: string|null,
 *   ok: boolean,
 *   code?: string,
 * }} payload
 */
export function logIntentPlanTelemetry(payload) {
  if (process.env.EXECUTE_INTENT_SHADOW !== 'true') return;
  const line = JSON.stringify({
    tag: 'INTENT_PLAN_SHADOW',
    source: payload.source,
    inputHash: payload.inputHash,
    planHash: payload.planHash,
    missionType: payload.missionType ?? undefined,
    correlationId: payload.correlationId ?? undefined,
    ok: payload.ok,
    code: payload.code ?? undefined,
  });
  console.log(line);
}
