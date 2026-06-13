/**
 * Performer Runtime — action execution facade (Phase 1.5-D).
 * Wraps executeMissionAction; does not rewrite legacy internals.
 */

import { executeMissionAction } from '../../execution/executeMissionAction.js';
import { guardBrokerDirectAction } from '../../broker/brokerRunwayGuard.js';
import { assertKernelAuthorizedExecution } from '../kernelMandatory.js';
import { actionIdForTool, recordExecutionTelemetry } from '../../broker/executionTelemetry.js';
import { getBrokerActionForTool } from '../../broker/actionRegistry.js';
import { routeToolToAction } from '../../broker/capabilityRouter.js';
import { runtimeContextFromRequest } from './runtimeContext.js';
import { resolveRuntimeContext, updateRuntimeState } from './runtimeState.js';
import { emitRuntimeStreamEvent } from './unifiedRuntimeStream.js';
import { markRuntimeOwnedContext } from './runtimeOwnership.js';
import { recordRuntimeExecutionNode } from './runtimeStateGraph.js';
import { detectExecutionDuplication } from './runtimeAuthorityStaging.js';
import { recordRuntimeAuthorityPathUsed } from './runtimeAuthorityGuard.js';

/**
 * @typedef {'dispatch_tool' | 'run_pipeline_step' | 'run_skill' | 'run_factory' | 'orchestra_start' | 'execute_action'} RuntimeActionType
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

  const kernelAuth = assertKernelAuthorizedExecution({
    source,
    actionType: req.actionType,
    userId: req.userId ?? ctx.userId ?? null,
  });
  if (!kernelAuth.ok) {
    return {
      status: 'blocked',
      blocker: { code: kernelAuth.code, message: kernelAuth.message },
      metadata: { runtimeId: ctx.runtimeId, source },
    };
  }

  const actionTypeEarly =
    typeof req.actionType === 'string' && req.actionType.trim() ? req.actionType.trim() : '';
  // Pipeline step advancement and UI runtime / hybrid assist are not Performer direct_action tool dispatch.
  const skipBrokerDirectGuard =
    actionTypeEarly === 'run_pipeline_step' ||
    actionTypeEarly === 'execute_action' ||
    actionTypeEarly === 'assist_hybrid_operation';

  if (!skipBrokerDirectGuard) {
    const directGuard = guardBrokerDirectAction({ source });
    if (directGuard.blocked) {
      return {
        status: 'blocked',
        blocker: { code: directGuard.code, message: directGuard.message },
        metadata: { runtimeId: ctx.runtimeId, source },
      };
    }
  }

  const actionType =
    actionTypeEarly ||
    (req.actionId ? 'execute_action' : 'dispatch_tool');

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
  if (actionType === 'run_skill') {
    const skillName =
      typeof payload.skillName === 'string' && payload.skillName.trim()
        ? payload.skillName.trim()
        : '';
    if (skillName) actionId = `skill:${skillName}`;
  }
  if (actionType === 'orchestra_start') {
    actionId = 'orchestra:start';
  }
  if (actionType === 'run_factory') {
    const fid =
      typeof payload.factoryId === 'string' && payload.factoryId.trim()
        ? payload.factoryId.trim()
        : '';
    if (fid) actionId = `factory:${fid}`;
  }

  recordRuntimeAuthorityPathUsed({
    route: source,
    toolName: toolName || actionId || actionType,
    userId: req.userId ?? ctx.userId ?? null,
    missionId: ctx.missionId ?? req.missionId ?? null,
    source,
  });

  const routePlan = toolName ? routeToolToAction(toolName) : null;
  const capabilityId = req.capabilityId ?? routePlan?.capabilityFamily ?? null;
  const brokerAction = toolName ? getBrokerActionForTool(toolName) : null;

  ctx = updateRuntimeState(ctx.runtimeId, {
    runtimeState: 'running',
    intentId: req.intentId ?? ctx.intentId,
  }) ?? ctx;

  // Duplication detection is for user-triggered tool dispatch. Pipeline facade can legitimately
  // call multiple sequential steps quickly; do not flag those as duplicates.
  if (actionType !== 'run_pipeline_step' && actionType !== 'orchestra_start') {
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
  } else if (actionType === 'run_skill') {
    const { skillRegistry, skillExecutor } = await import('../../skills/index.js');
    const skillName =
      typeof innerPayload.skillName === 'string' && innerPayload.skillName.trim()
        ? innerPayload.skillName.trim()
        : '';
    const intentLabel =
      typeof innerPayload.intentLabel === 'string' && innerPayload.intentLabel.trim()
        ? innerPayload.intentLabel.trim()
        : '';
    const skillDef =
      (skillName ? skillRegistry.get(skillName) : null) || skillRegistry.findByTrigger(intentLabel);
    if (!skillDef) {
      facadeResult = {
        status: 'failed',
        error: {
          code: 'SKILL_NOT_FOUND',
          message: `Skill not found: ${skillName || intentLabel || '(empty)'}`,
        },
      };
    } else {
      const rawSkillCtx =
        innerPayload.context && typeof innerPayload.context === 'object' && !Array.isArray(innerPayload.context)
          ? innerPayload.context
          : {};
      const skillCtx = markRuntimeOwnedContext(rawSkillCtx, ctx.runtimeId);
      const execution = await skillExecutor.execute(skillDef, skillCtx);
      const okStatus =
        execution?.status === 'completed' ||
        execution?.status === 'awaiting_plan_approval' ||
        execution?.status === 'running';
      facadeResult = {
        status: okStatus ? 'ok' : 'failed',
        output: { skillExecution: execution },
        ...(okStatus
          ? {}
          : {
              error: {
                code: 'SKILL_FAILED',
                message: execution?.failedReason ?? `Skill ended in status ${execution?.status}`,
              },
            }),
      };
    }
  } else if (actionType === 'orchestra_start') {
    facadeResult = {
      status: 'ok',
      output: {
        orchestraEnvelope: true,
        goal:
          typeof innerPayload.goal === 'string' && innerPayload.goal.trim()
            ? innerPayload.goal.trim()
            : null,
      },
    };
  } else if (actionType === 'run_factory') {
    const { runFactoryExecution } = await import('../../factoryRuntime/factoryRuntimeExecutor.js');
    const factoryId =
      typeof innerPayload.factoryId === 'string' ? innerPayload.factoryId.trim() : '';
    const intent =
      typeof innerPayload.intent === 'string'
        ? innerPayload.intent.trim()
        : typeof innerPayload.goal === 'string'
          ? innerPayload.goal.trim()
          : '';
    const factoryContext =
      innerPayload.context && typeof innerPayload.context === 'object'
        ? innerPayload.context
        : {};
    const factoryResult = await runFactoryExecution({
      factoryId,
      missionId: ctx.missionId ?? req.missionId ?? null,
      userId: req.userId ?? ctx.userId ?? null,
      intent,
      context: {
        ...factoryContext,
        storeId: factoryContext.storeId ?? req.storeId ?? ctx.storeId ?? null,
      },
      resumeState: innerPayload.resumeState ?? null,
    });
    const okStatus =
      factoryResult.status === 'completed' || factoryResult.status === 'awaiting_factory_approval';
    facadeResult = {
      status: okStatus ? 'ok' : 'failed',
      output: { factoryExecution: factoryResult },
      ...(okStatus
        ? {}
        : {
            error: factoryResult.error ?? {
              code: 'FACTORY_FAILED',
              message: `Factory ended in status ${factoryResult.status}`,
            },
          }),
    };
  } else if (actionType === 'execute_action') {
    // UI runtime gateway (uiRuntimeActionService) runs adapters after this envelope completes.
    facadeResult = { status: 'ok', output: { uiActionEnvelope: true, actionId } };
  } else if (actionType === 'assist_hybrid_operation') {
    facadeResult = {
      status: 'ok',
      output: {
        hybridAssistEnvelope: true,
        operation: innerPayload.operation ?? null,
        message: 'Hybrid operation reviewed via runtime assist envelope.',
        suggestions: Array.isArray(innerPayload.suggestions) ? innerPayload.suggestions : [],
      },
    };
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
