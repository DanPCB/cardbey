/**
 * Performer Runtime — action execution facade (Phase 1.5-D).
 * Wraps executeMissionAction; does not rewrite legacy internals.
 */

import { executeMissionAction } from '../../execution/executeMissionAction.js';
import { guardBrokerDirectAction } from '../../broker/brokerRunwayGuard.js';
import { assertKernelAuthorizedExecution, isKernelAuthorizedRuntimeSource } from '../kernelMandatory.js';
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
import observationBus from '../observationBus.js';
import {
  deriveExecutionStateFromRuntime,
  EXECUTION_STATES,
} from '../../telemetry/executionStates.js';
import activeSummary from '../../../services/memory/activeSummary.js';
import hookExecutor from '../../../services/hooks/hookExecutor.js';
import { loadStepMemory } from '../loadStepMemory.js';

/**
 * @typedef {'dispatch_tool' | 'run_pipeline_step' | 'run_skill' | 'run_factory' | 'orchestra_start' | 'execute_action' | 'run_agent' | 'run_agents_parallel' | 'run_agents_chain'} RuntimeActionType
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
  // Pipeline step advancement, UI runtime, and kernel-authorized intake/mission sources
  // are not legacy Performer direct_action bypasses.
  const skipBrokerDirectGuard = isKernelAuthorizedRuntimeSource(source, actionTypeEarly);

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

  const runtimeMemory = await loadStepMemory({
    missionId: ctx.missionId ?? req.missionId ?? null,
    userId: ctx.userId ?? req.userId ?? null,
    storeId: ctx.storeId ?? req.storeId ?? innerPayload.storeId ?? null,
    sessionId:
      typeof innerPayload.sessionId === 'string' && innerPayload.sessionId.trim()
        ? innerPayload.sessionId.trim()
        : null,
  });
  if (runtimeMemory) {
    innerContext.memory = runtimeMemory;
    if (innerPayload.context && typeof innerPayload.context === 'object') {
      innerPayload.context = { ...innerPayload.context, memory: runtimeMemory };
    }
  }

  let facadeResult;
  const hookSkillId =
    toolName ||
    (typeof innerPayload.skillName === 'string' ? innerPayload.skillName.trim() : '') ||
    actionType;
  const hookContext = {
    userId: ctx.userId ?? req.userId ?? null,
    storeId: ctx.storeId ?? req.storeId ?? null,
    missionId: ctx.missionId ?? req.missionId ?? null,
    runtimeId: ctx.runtimeId,
    source,
    actionType,
    toolName: toolName || null,
    skillId: hookSkillId,
  };

  let hookPreOk = true;
  try {
    await hookExecutor.executePreHooks(hookSkillId, hookContext);
  } catch (preHookError) {
    hookPreOk = false;
    facadeResult = {
      status: 'failed',
      error: {
        code: 'HOOK_PRE_FAILED',
        message: preHookError?.message || 'Pre-execution hook failed',
      },
    };
  }

  if (hookPreOk) {
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
  } else if (
    actionType === 'run_agent' ||
    actionType === 'run_agents_parallel' ||
    actionType === 'run_agents_chain'
  ) {
    const { orchestrator, resolveAgentForCapability } = await import(
      '../../../services/agents/index.js'
    );

    const agentContext = markRuntimeOwnedContext(
      {
        ...(innerPayload.context && typeof innerPayload.context === 'object'
          ? innerPayload.context
          : {}),
        storeId: ctx.storeId ?? req.storeId ?? innerPayload.storeId ?? null,
        userId: ctx.userId ?? req.userId ?? null,
        missionId: ctx.missionId ?? req.missionId ?? null,
        runtimeId: ctx.runtimeId,
        memoryContext: {
          actor: {
            type: 'store_owner',
            id: ctx.userId ?? req.userId ?? null,
          },
          storeId: ctx.storeId ?? req.storeId ?? null,
          sessionId: innerPayload.sessionId ?? null,
          missionId: ctx.missionId ?? req.missionId ?? null,
        },
      },
      ctx.runtimeId,
    );

    try {
      if (actionType === 'run_agents_parallel') {
        const agents = Array.isArray(innerPayload.parallelAgents)
          ? innerPayload.parallelAgents
          : Array.isArray(innerPayload.agents)
            ? innerPayload.agents
            : [];
        const result = await orchestrator.parallel(agents, agentContext);
        facadeResult = { status: 'ok', output: { agentOrchestration: result } };
      } else if (actionType === 'run_agents_chain') {
        const agents = Array.isArray(innerPayload.chainAgents)
          ? innerPayload.chainAgents
          : Array.isArray(innerPayload.agents)
            ? innerPayload.agents
            : [];
        const result = await orchestrator.chain(agents, agentContext);
        facadeResult = { status: 'ok', output: { agentOrchestration: result } };
      } else {
        const agentId =
          (typeof innerPayload.agentId === 'string' && innerPayload.agentId.trim()) ||
          (typeof payload.agentId === 'string' && payload.agentId.trim()) ||
          '';
        const capability =
          (typeof innerPayload.requiredCapability === 'string' &&
            innerPayload.requiredCapability.trim()) ||
          (typeof innerPayload.intentLabel === 'string' && innerPayload.intentLabel.trim()) ||
          null;

        if (!agentId && capability) {
          const resolved = resolveAgentForCapability(capability);
          if (!resolved) {
            facadeResult = {
              status: 'failed',
              error: {
                code: 'AGENT_NOT_FOUND',
                message: `No agent found for capability: ${capability}`,
              },
            };
          } else {
            const result = await orchestrator.executeAgent(
              { id: resolved.id, skillId: resolved.skillId ?? undefined },
              { ...agentContext, requiredCapability: capability },
            );
            facadeResult = {
              status: 'ok',
              output: { agentExecution: result, agentId: resolved.id },
            };
          }
        } else if (!agentId) {
          facadeResult = {
            status: 'failed',
            error: { code: 'AGENT_ID_REQUIRED', message: 'agentId or requiredCapability required' },
          };
        } else {
          const result = await orchestrator.executeAgent({ id: agentId }, agentContext);
          facadeResult = {
            status: 'ok',
            output: { agentExecution: result, agentId },
          };
        }
      }
    } catch (error) {
      facadeResult = {
        status: 'failed',
        error: {
          code: 'AGENT_EXECUTION_FAILED',
          message: error?.message || 'Sub-agent execution failed',
        },
      };
    }
  } else if (actionType === 'run_skill') {
    const skillName =
      typeof innerPayload.skillName === 'string' && innerPayload.skillName.trim()
        ? innerPayload.skillName.trim()
        : '';
    const intentLabel =
      typeof innerPayload.intentLabel === 'string' && innerPayload.intentLabel.trim()
        ? innerPayload.intentLabel.trim()
        : '';
    const rawSkillCtx =
      innerPayload.context && typeof innerPayload.context === 'object' && !Array.isArray(innerPayload.context)
        ? innerPayload.context
        : {};
    const skillCtx = markRuntimeOwnedContext(rawSkillCtx, ctx.runtimeId);

    const { resolveComposableSkill, executeComposableSkill } = await import(
      '../../../services/skills/index.js'
    );
    const composableSkill = resolveComposableSkill(skillName || intentLabel);

    if (composableSkill) {
      try {
        const compositionMode =
          typeof innerPayload.composition === 'string' ? innerPayload.composition.trim() : null;
        const composedSkills = Array.isArray(innerPayload.skills) ? innerPayload.skills : null;
        const result = await executeComposableSkill(composableSkill.id, skillCtx, {
          version:
            typeof innerPayload.skillVersion === 'string' ? innerPayload.skillVersion.trim() : undefined,
          composition: compositionMode === 'sequence' || compositionMode === 'parallel' ? compositionMode : undefined,
          skills: composedSkills ?? undefined,
        });
        facadeResult = {
          status: 'ok',
          output: {
            composableSkill: result,
            skillId: composableSkill.id,
            version: composableSkill.version,
          },
        };
      } catch (error) {
        facadeResult = {
          status: 'failed',
          error: {
            code: 'COMPOSABLE_SKILL_FAILED',
            message: error?.message || 'Composable skill execution failed',
          },
        };
      }
    } else {
      const { skillRegistry, skillExecutor } = await import('../../skills/index.js');
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
    const { default: bulkhead } = await import('../../../services/reliability/bulkhead.js');
    facadeResult = await bulkhead.execute('llm_operations', () =>
      executeMissionAction({
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
      }),
    );
  }
  }

  const executionOk = facadeResult?.status === 'ok' || facadeResult?.status === 'completed';
  try {
    if (executionOk) {
      await hookExecutor.executePostHooks(hookSkillId, hookContext, facadeResult);
    } else if (facadeResult?.status === 'failed') {
      const hookError = new Error(facadeResult?.error?.message || 'execution_failed');
      await hookExecutor.executeErrorHooks(hookSkillId, hookContext, hookError);
      await hookExecutor.executeRollbackHooks(hookSkillId, hookContext, hookError);
    }
    await hookExecutor.executeCompleteHooks(
      hookSkillId,
      hookContext,
      executionOk ? facadeResult : null,
      executionOk ? null : new Error(facadeResult?.error?.message || 'execution_failed'),
    );
  } catch (hookTailError) {
    console.error('[executeRuntimeAction] lifecycle hook tail failed:', hookTailError?.message || hookTailError);
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

  const observationAction = toolName || actionId || actionType;
  const observationSuccess = status === 'completed';
  const executionState = deriveExecutionStateFromRuntime(facadeResult, { actionType });
  const sloExcludedIntent =
    actionType === 'run_pipeline_step' ||
    actionType === 'orchestra_start' ||
    actionType === 'mission_pipeline';
  try {
    await observationBus.emit({
      missionId: ctx.missionId ?? req.missionId ?? null,
      intent: { type: actionType },
      action: sloExcludedIntent ? actionType : observationAction,
      result: {
        success: observationSuccess,
        error:
          facadeResult.error?.message ??
          facadeResult.blocker?.message ??
          null,
        executionState,
        stubbed: executionState === EXECUTION_STATES.STUBBED,
        blocked: executionState === EXECUTION_STATES.BLOCKED,
        partial: executionState === EXECUTION_STATES.PARTIAL,
      },
      metadata: {
        latency: latencyMs,
        storeId: ctx.storeId ?? req.storeId ?? null,
        userId: ctx.userId ?? req.userId ?? null,
        source,
        sloEligible: !sloExcludedIntent,
        confidence: routePlan?.confidence ?? null,
        cost: facadeResult.metadata?.cost ?? null,
        tokens: facadeResult.metadata?.tokens ?? null,
        executionState,
        stubbed: executionState === EXECUTION_STATES.STUBBED,
        blocked: executionState === EXECUTION_STATES.BLOCKED,
        planned: executionState === EXECUTION_STATES.PLANNED,
        partial: executionState === EXECUTION_STATES.PARTIAL,
      },
    });
  } catch (obsErr) {
    console.error('[executeRuntimeAction] observation emit failed:', obsErr?.message || obsErr);
  }

  if (ctx.missionId && observationSuccess) {
    void activeSummary
      .recordMissionResult({
        missionId: ctx.missionId,
        mission: { type: actionType, primaryAction: observationAction },
        result: {
          success: true,
          output: facadeResult.output ?? null,
        },
        context: {
          storeId: ctx.storeId ?? null,
          source,
        },
      })
      .catch((summaryErr) => {
        console.warn('[executeRuntimeAction] active summary failed:', summaryErr?.message || summaryErr);
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
