/**
 * Performer Runtime — execution ownership checks (Phase 1.5-F).
 */

import { emitHealthProbe } from '../../telemetry/healthProbes.js';
import {
  isPerformerRuntimeOwnershipWarnEnabled,
  isPerformerRuntimeOwnershipBlockEnabled,
} from './runtimeFlags.js';

const VIOLATION_TAG = 'broker.runtime.violation';

/**
 * @typedef {'orphan_execution'|'missing_telemetry'|'bypass_detected'|'duplicate_ownership'|'missing_runtime_context'} RuntimeViolationType
 */

/**
 * @param {RuntimeViolationType} type
 * @param {Record<string, unknown>} details
 */
export function recordRuntimeViolation(type, details = {}) {
  if (!isPerformerRuntimeOwnershipWarnEnabled()) return;

  emitHealthProbe(VIOLATION_TAG, {
    status: 'warn',
    violationType: type,
    missionId: typeof details.missionId === 'string' ? details.missionId : null,
    ...details,
  });
}

/**
 * @param {object} [context]
 * @param {string} [source]
 * @returns {{ allowed: boolean, violation?: RuntimeViolationType, code?: string, message?: string }}
 */
export function assertRuntimeOwnership(context, source) {
  const ctx = context && typeof context === 'object' ? context : {};
  const src = typeof source === 'string' ? source.trim() : 'unknown';

  if (ctx.runtimeOwned === true || ctx.performerRuntimeOwned === true) {
    return { allowed: true };
  }

  const violation = {
    allowed: false,
    violation: /** @type {RuntimeViolationType} */ ('orphan_execution'),
    code: 'RUNTIME_OWNERSHIP_REQUIRED',
    message: `Execution from "${src}" is not owned by Performer Runtime.`,
  };

  recordRuntimeViolation('orphan_execution', {
    source: src,
    missionId: ctx.missionId ?? ctx.activeMissionId ?? null,
    toolName: ctx.toolName ?? null,
  });

  if (isPerformerRuntimeOwnershipBlockEnabled()) {
    return violation;
  }

  return { allowed: true, violation: violation.violation };
}

/**
 * Mark context as runtime-owned for downstream dispatch.
 *
 * @param {object} context
 * @param {string} runtimeId
 */
export function markRuntimeOwnedContext(context, runtimeId) {
  const ctx = context && typeof context === 'object' ? { ...context } : {};
  ctx.runtimeOwned = true;
  ctx.performerRuntimeOwned = true;
  ctx.runtimeId = runtimeId;
  ctx.executionSource = 'performer_runtime';
  return ctx;
}
