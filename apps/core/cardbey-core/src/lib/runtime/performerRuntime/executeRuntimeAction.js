/**
 * Performer Runtime — action execution facade (Phase 1.5-D).
 * Wraps executeMissionAction; does not rewrite legacy internals.
 */

import { executeMissionAction } from '../../execution/executeMissionAction.js';
import { guardBrokerDirectAction } from '../../broker/brokerRunwayGuard.js';
import { actionIdForTool, recordExecutionTelemetry } from '../../broker/executionTelemetry.js';
import { getBrokerActionForTool } from '../../broker/actionRegistry.js';
import { routeToolToAction } from '../../broker/capabilityRouter.js';
import { runtimeContextFromRequest } from './runtimeContext.js';
import { resolveRuntimeContext, updateRuntimeState } from './runtimeState.js';
import { emitRuntimeStreamEvent } from './unifiedRuntimeStream.js';
import { markRuntimeOwnedContext } from './runtimeOwnership.js';
import { recordRuntimeExecutionNode } from './runtimeStateGraph.js';
import { detectExecutionDuplication } from './runtimeAuthorityStaging.js';

/**
 * @typedef {'dispatch_tool' | 'run_pipeline_step' | 'execute_action'} RuntimeActionType
 */

/**
 * @typedef {object} ExecuteRuntimeActionRequest
 * @property {RuntimeActionType} [actionType]
 * @property {string} [actionId] — explicit action id (maps to tool for tool:* ids)
 * @property {string|null} [runtimeId]
 * @property {string|null} [missionId]
 * @property {string|null} [intentId]
 * @property {string|null} [storeId]
 * @property {string|null} [tenantId]
 * @property {string|null} [userId]
 * @property {string|null} [capabilityId]
 * @property {string} source
 * @property {object} [payload]
 * @property {boolean} [skipDirectGuard]
 */

/**
 * @param {string} actionId
 * @returns {string|null}
 */
function toolNameFromActionId(actionId) {
  const id = typeof actionId === 'string' ? actionId.trim() : '';
  if (id.startsWith('tool:')) return id.slice(5);
  return null;
}

/**
 * @param {ExecuteRuntimeActionRequest} request
 * @returns {Promise<object>}
 */
export async function executeRuntimeAction(request) {
  const req = request && typeof request === 'object' ? request : {};
  const source = typeof req.source === 'string' ? req.source.trim() || 'performer_runtime' : 'performer_runtime';

  let ctx = resolveRuntimeContext({
    runtimeId: req.runtimeId ?? null,
    missionId: req.missionId ?? null,
    intentId: req.intentId ?? null,
    storeId: req.storeId ?? null,
    tenantId: req.tenantId ?? null,
    userId: req.userId ?? null,
  });

  if (!req.skipDirectGuard) {
    const directGuard = guardBrokerDirectAction();
    if (directGuard.blocked) {
      return {
        status: 'blocked',
        blocker: { code: directGuard.code, message: directGuard.message },
        metadata: { runtimeId: ctx.runtimeId, source },
      };
    }
  }

  const actionType =
    typeof req.actionType === 'string' && req.actionType.trim()
      ? req.actionType.trim()
      : req.actionId
        ? 'execute_action'
        : 'dispatch_tool';

  let actionId = typeof req.actionId === 'string' ? req.actionId.trim() : '';
  const payload = req.payload && typeof req.payload === 'object' ? req.payload : {};
  let toolName =
    typeof payload.toolName === 'string'
      ? payload.toolName.trim()
      : toolNameFromActionId(actionId);

  if (!toolName && actionType === 'dispatch_tool') {
    toolName = typeof payload.toolName === 'string' ? payload.toolName.trim() : '';
  }
  if (!actionId && toolName) {
    actionId = actionIdForTool(toolName);
  }

  // Normalize actionId for pipeline facade so telemetry is stable and queryable.
  if (actionType === 'run_pipeline_step') {
    actionId = 'pipeline:run_next_step';
  }

  const routePlan = toolName ? routeToolToAction(toolName) : null;
  const capabilityId = req.capabilityId ?? routePlan?.capabilityFamily ?? null;
  const brokerAction = toolName ? getBrokerActionForTool(toolName) : null;

  ctx = updateRuntimeState(ctx.runtimeId, {
    runtimeState: 'running',
    intentId: req.intentId ?? ctx.intentId,
  }) ?? ctx;

  // Duplication detection is for user-triggered tool dispatch. Pipeline facade can legitimately
  // call multiple sequential steps quickly; do not flag those as duplicates.
  if (actionType !== 'run_pipeline_step') {
    detectExecutionDuplication({
      missionId: ctx.missionId,
      toolName: toolName || null,
      actionId: actionId || null,
      source,
    });
  }

  const startMs = Date.now();
  const executionId = recordExecutionTelemetry({
    actionId: actionType === 'run_pipeline_step' ? 'pipeline:run_next_step' : actionId || 'runtime:unknown',
    source,
    status: 'started',
    missionId: ctx.missionId,
    intentId: ctx.intentId,
    toolName: toolName || null,
    capabilityFamily: capabilityId,
    runtimeId: ctx.runtimeId,
    executionSource: 'performer_runtime',
  });

  if (ctx.missionId) {
    await emitRuntimeStreamEvent({
      missionId: ctx.missionId,
      runtimeId: ctx.runtimeId,
      eventType: 'execution.started',
      payload: { actionId, toolName, source, executionId },
    });
  }

  const innerPayload = { ...payload };
  if (toolName && !innerPayload.toolName) innerPayload.toolName = toolName;

  const innerContext = markRuntimeOwnedContext(
    {
      ...(innerPayload.context && typeof innerPayload.context === 'object'
        ? innerPayload.context
        : runtimeContextFromRequest(req)),
      skipNestedBrokerTelemetry: true,
      runtimeId: ctx.runtimeId,
    },
    ctx.runtimeId,
  );

  let facadeResult;
  if (actionType === 'run_pipeline_step') {
    facadeResult = await executeMissionAction({
      actionType: 'run_pipeline_step',
      missionId: ctx.missionId,
      intentId: ctx.intentId,
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      storeId: ctx.storeId,
      source,
      payload: innerPayload,
    });
  } else {
    facadeResult = await executeMissionAction({
      actionType: 'dispatch_tool',
      missionId: ctx.missionId,
      intentId: ctx.intentId,
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      storeId: ctx.storeId,
      source,
      payload: {
        ...innerPayload,
        toolName: toolName || innerPayload.toolName,
        context: innerContext,
      },
    });
  }

  const latencyMs = Date.now() - startMs;
  const status =
    facadeResult.status === 'blocked'
      ? 'blocked'
      : facadeResult.status === 'failed'
        ? 'failed'
        : 'completed';

  recordExecutionTelemetry({
    executionId: executionId ?? undefined,
    actionId: actionType === 'run_pipeline_step' ? 'pipeline:run_next_step' : actionId || 'runtime:unknown',
    source,
    status,
    missionId: ctx.missionId,
    intentId: ctx.intentId,
    toolName: toolName || null,
    capabilityFamily: capabilityId,
    durationMs: latencyMs,
    failureCode: facadeResult.error?.code ?? facadeResult.blocker?.code ?? null,
    runtimeId: ctx.runtimeId,
    executionSource: 'performer_runtime',
  });

  let nextCtx = updateRuntimeState(ctx.runtimeId, {
    runtimeState: status === 'completed' ? 'completed' : status === 'blocked' ? 'blocked' : 'failed',
  }) ?? ctx;

  nextCtx = recordRuntimeExecutionNode(nextCtx, {
    actionId: actionId || 'runtime:unknown',
    capabilityId,
    status,
    executionId: executionId ?? undefined,
    latencyMs,
    artifactRefs: extractArtifactRefs(facadeResult),
    error: facadeResult.error?.message ?? facadeResult.blocker?.message ?? null,
  });
  updateRuntimeState(nextCtx.runtimeId, {
    executionNodes: nextCtx.executionNodes,
    executionHistory: nextCtx.executionHistory,
    actionGraph: nextCtx.actionGraph,
    telemetry: [
      ...nextCtx.telemetry,
      {
        executionId,
        actionId,
        status,
        latencyMs,
        at: new Date().toISOString(),
      },
    ],
  });

  if (ctx.missionId) {
    await emitRuntimeStreamEvent({
      missionId: ctx.missionId,
      runtimeId: ctx.runtimeId,
      eventType: status === 'completed' ? 'execution.completed' : `execution.${status}`,
      payload: {
        actionId,
        toolName,
        source,
        executionId,
        latencyMs,
        status,
      },
    });
  }

  return {
    ...facadeResult,
    metadata: {
      ...(facadeResult.metadata ?? {}),
      runtimeId: ctx.runtimeId,
      actionId,
      capabilityId,
      executionId,
      executionSource: 'performer_runtime',
      routingStrategy: routePlan?.routingStrategy ?? null,
      brokerAction: brokerAction
        ? { id: brokerAction.id, riskLevel: brokerAction.permissions?.riskLevel }
        : null,
    },
  };
}

/**
 * @param {object} result
 * @returns {string[]}
 */
function extractArtifactRefs(result) {
  const refs = [];
  const out = result?.output;
  if (out?.artifact?.id) refs.push(String(out.artifact.id));
  if (Array.isArray(out?.artifacts)) {
    for (const a of out.artifacts) {
      if (a?.id) refs.push(String(a.id));
    }
  }
  return refs;
}
