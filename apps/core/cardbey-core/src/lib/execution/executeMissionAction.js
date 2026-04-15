/**
 * Post-V1 Convergence — Phase 1.1 Execution Facade
 *
 * Single normalized entry point for **runtime-owned** execution requests. This is an **alignment layer**:
 * it normalizes inputs/routing intent and delegates to existing implementations. It is explicitly **not**
 * a second runtime, not an orchestrator brain, and not for UI — Mission Execution remains authoritative.
 *
 * New server-side execution call sites should prefer `executeMissionAction` over ad hoc entry points
 * when the action maps to a supported `actionType`.
 *
 * @see docs/MISSION_EXECUTION_INDEX.md
 */

import { dispatchTool } from '../toolDispatcher.js';

/**
 * @typedef {'dispatch_tool' | 'run_pipeline_step'} ExecutionFacadeActionType
 */

/**
 * @typedef {object} ExecuteMissionActionRequest
 * @property {ExecutionFacadeActionType} actionType
 * @property {string|null} [missionId]
 * @property {object} [payload] — For `dispatch_tool`: `{ toolName: string, input?: object, context?: object }` (`context` = full third arg to `dispatchTool`, e.g. `stepOutputs`, `agentHint`)
 * @property {string|null} [stepId]
 * @property {string|null} [tenantId]
 * @property {string|null} [tenantKey]
 * @property {string|null} [userId]
 * @property {string|null} [intentId]
 * @property {string|null} [storeId]
 * @property {string} source — Caller label for audit/metadata, e.g. `mission_pipeline`, `missions_api_run_next_step`
 */

/**
 * @typedef {object} ExecuteMissionActionResult
 * @property {'ok'|'failed'|'blocked'} status
 * @property {object} [output]
 * @property {object} [metadata]
 * @property {object} [error]
 * @property {object} [blocker]
 */

/**
 * Fallback context when `payload.context` is omitted (minimal fields from the request).
 * Prefer passing full runtime context via `payload.context` from the caller (e.g. mission runner).
 *
 * @param {ExecuteMissionActionRequest} req
 */
function buildDispatchContextFallback(req) {
  return {
    missionId: req.missionId ?? undefined,
    stepId: req.stepId ?? undefined,
    tenantId: req.tenantId ?? undefined,
    userId: req.userId ?? undefined,
    createdBy: req.userId ?? undefined,
    storeId: req.storeId ?? undefined,
    intentId: req.intentId ?? undefined,
  };
}

/**
 * @param {ExecuteMissionActionRequest} request
 * @returns {Promise<ExecuteMissionActionResult>}
 */
export async function executeMissionAction(request) {
  if (!request || typeof request !== 'object') {
    return {
      status: 'failed',
      error: { code: 'INVALID_REQUEST', message: 'executeMissionAction: request object required' },
      metadata: { actionType: null, source: 'unknown' },
    };
  }

  const actionType = typeof request.actionType === 'string' ? request.actionType.trim() : '';
  const source = typeof request.source === 'string' ? request.source.trim() || 'unknown' : 'unknown';
  const missionId = request.missionId != null ? String(request.missionId).trim() || null : null;

  const metaBase = {
    actionType,
    source,
    missionId,
    tenantKey: request.tenantKey ?? request.tenantId ?? null,
  };

  if (actionType === 'dispatch_tool') {
    const payload = request.payload && typeof request.payload === 'object' ? request.payload : {};
    const toolName = typeof payload.toolName === 'string' ? payload.toolName.trim() : '';
    if (!toolName) {
      return {
        status: 'failed',
        error: { code: 'TOOL_NAME_REQUIRED', message: 'dispatch_tool requires payload.toolName' },
        metadata: { ...metaBase },
      };
    }
    const input = payload.input != null && typeof payload.input === 'object' ? payload.input : {};
    const toolCtx =
      payload.context && typeof payload.context === 'object' && !Array.isArray(payload.context)
        ? payload.context
        : buildDispatchContextFallback(request);
    const dr = await dispatchTool(toolName, input, toolCtx);
    return {
      status: dr.status,
      ...(dr.output !== undefined && { output: dr.output }),
      ...(dr.error !== undefined && { error: dr.error }),
      ...(dr.blocker !== undefined && { blocker: dr.blocker }),
      metadata: { ...metaBase, toolName },
    };
  }

  if (actionType === 'run_pipeline_step') {
    const id = missionId;
    if (!id) {
      return {
        status: 'failed',
        error: { code: 'MISSION_ID_REQUIRED', message: 'run_pipeline_step requires missionId' },
        metadata: { ...metaBase },
      };
    }
    const { runNextMissionPipelineStep } = await import('../missionPipelineRunner.js');
    const raw = await runNextMissionPipelineStep(id);
    const status = raw.ok ? 'ok' : 'failed';
    return {
      status,
      output: raw,
      metadata: { ...metaBase },
    };
  }

  return {
    status: 'failed',
    error: {
      code: 'UNKNOWN_ACTION_TYPE',
      message: `executeMissionAction: unsupported actionType "${actionType}"`,
    },
    metadata: { ...metaBase, actionType: actionType || null },
  };
}

/**
 * Supported action types for guards and documentation.
 * @type {ExecutionFacadeActionType[]}
 */
export const EXECUTION_FACADE_ACTION_TYPES = ['dispatch_tool', 'run_pipeline_step'];
