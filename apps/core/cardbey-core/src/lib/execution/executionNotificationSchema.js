/**
 * Canonical execution notification schema.
 * Maps legacy blackboard/SSE event types to a unified contract for UI projection.
 */

/** @typedef {import('./executionTypes.js').ExecutionMode} ExecutionMode */

export const EXECUTION_EVENT_TYPES = Object.freeze({
  STARTED: 'execution.started',
  STEP_STARTED: 'execution.step.started',
  STEP_COMPLETED: 'execution.step.completed',
  CHECKPOINT_AWAITING: 'execution.checkpoint.awaiting',
  CHECKPOINT_RESOLVED: 'execution.checkpoint.resolved',
  COMPLETED: 'execution.completed',
  FAILED: 'execution.failed',
  CANCELLED: 'execution.cancelled',
  RESUMED: 'execution.resumed',
});

/** Legacy event type → canonical type */
const LEGACY_TO_CANONICAL = Object.freeze({
  'kernel.dispatch.started': EXECUTION_EVENT_TYPES.STARTED,
  'mission.step.started': EXECUTION_EVENT_TYPES.STEP_STARTED,
  'mission.step.completed': EXECUTION_EVENT_TYPES.STEP_COMPLETED,
  'mission.step.rejected': EXECUTION_EVENT_TYPES.FAILED,
  orchestration_complete: EXECUTION_EVENT_TYPES.COMPLETED,
  'mission.checkpoint': EXECUTION_EVENT_TYPES.CHECKPOINT_AWAITING,
  'mission.cancelled': EXECUTION_EVENT_TYPES.CANCELLED,
});

/** SSE event type → canonical type */
const SSE_TO_CANONICAL = Object.freeze({
  'mission.checkpoint': EXECUTION_EVENT_TYPES.CHECKPOINT_AWAITING,
  'mission.plan_approval': EXECUTION_EVENT_TYPES.CHECKPOINT_AWAITING,
  'mission.cancelled': EXECUTION_EVENT_TYPES.CANCELLED,
  'mission.artifact': EXECUTION_EVENT_TYPES.STEP_COMPLETED,
});

/**
 * @param {string} legacyType
 * @returns {string | null}
 */
export function canonicalTypeFromLegacy(legacyType) {
  const key = String(legacyType ?? '').trim();
  return LEGACY_TO_CANONICAL[key] ?? null;
}

/**
 * @param {string} sseType
 * @returns {string | null}
 */
export function canonicalTypeFromSse(sseType) {
  const key = String(sseType ?? '').trim();
  return SSE_TO_CANONICAL[key] ?? null;
}

/**
 * @param {string} type - canonical or legacy type
 * @param {object} payload
 * @param {{ missionId?: string, executionPath?: ExecutionMode, source?: string }} [ctx]
 * @returns {object}
 */
export function buildExecutionNotification(type, payload = {}, ctx = {}) {
  const rawType = String(type ?? '').trim();
  const canonicalType =
    Object.values(EXECUTION_EVENT_TYPES).includes(rawType)
      ? rawType
      : canonicalTypeFromLegacy(rawType) ?? canonicalTypeFromSse(rawType) ?? rawType;

  const missionId =
    ctx.missionId ??
    (typeof payload.missionId === 'string' ? payload.missionId : null) ??
    null;

  return {
    type: canonicalType,
    legacyType: rawType !== canonicalType ? rawType : undefined,
    missionId,
    executionPath: ctx.executionPath ?? payload.executionPath ?? null,
    source: ctx.source ?? payload.source ?? null,
    timestamp: new Date().toISOString(),
    stepId:
      typeof payload.stepId === 'string'
        ? payload.stepId
        : typeof payload.checkpoint?.stepId === 'string'
          ? payload.checkpoint.stepId
          : null,
    stepKind: payload.stepKind ?? null,
    checkpoint: payload.checkpoint ?? null,
    error: payload.error ?? null,
    result: payload.result ?? payload.output ?? null,
    data: payload,
  };
}

/**
 * Normalize SSE payload for frontend projection (backward compatible).
 *
 * @param {string} sseType
 * @param {object} data
 * @returns {{ canonical: object; sseType: string; data: object }}
 */
export function normalizeSseExecutionEvent(sseType, data = {}) {
  const canonical = buildExecutionNotification(sseType, data, {
    missionId: typeof data.missionId === 'string' ? data.missionId : undefined,
  });
  return { canonical, sseType, data };
}
