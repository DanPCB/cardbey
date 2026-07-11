/**
 * Unified dispatch — single authoritative execution contract for Intake V2.
 * All confirmed tool execution and orchestration must route through here.
 */

import { assertKernelAuthorizedExecution } from '../runtime/kernelMandatory.js';
import { executeRuntimeAction } from '../runtime/performerRuntime/executeRuntimeAction.js';
import { getTenantId } from '../missionAccess.js';
import { isRegisteredTool } from './intakeToolRegistry.js';
import {
  deriveExecutionStateFromRuntime,
  EXECUTION_STATES,
} from '../telemetry/executionStates.js';
import { UNIFIED_ACTION_TYPES } from '../execution/executionTypes.js';
import { executeMission } from '../execution/missionExecutionEngine.js';
import { dispatchCreateStoreCheckpointPipeline, buildNeedsFormCreateStoreIntakeBody } from './createStoreCheckpointDispatch.js';
import { buildPerformerStoreSelectionClarify } from './accountStoreIntakeGate.js';
import { dispatchCreateCampaignCheckpointPipeline } from './createCampaignCheckpointDispatch.js';
import { loadStepMemory } from '../runtime/loadStepMemory.js';
import { reasonAboutDispatch } from './dispatchReasoningEngine.js';
import { Features } from '../../config/features.js';
import { readMissionSpineOwnership, SPINE_OWNERS } from '../kernel/spineAuthority.js';

const ORCHESTRATION_TYPES = new Set(['multi_agent', 'campaign_orchestration']);
const FACTORY_ACTION_TYPE = 'run_factory';
const ARTIFACT_ACTION_TYPE = 'execute_artifact';
const PIPELINE_ACTION_TYPES = new Set([
  UNIFIED_ACTION_TYPES.CREATE_STORE_CHECKPOINT,
  UNIFIED_ACTION_TYPES.CREATE_CAMPAIGN_CHECKPOINT,
  UNIFIED_ACTION_TYPES.RUN_PIPELINE,
  UNIFIED_ACTION_TYPES.RUN_PROACTIVE_STEP,
  UNIFIED_ACTION_TYPES.RESPOND_CHECKPOINT,
]);

/**
 * @param {object} runtimeResult
 * @param {string} toolName
 * @param {object} payload
 */
function normalizeToolRuntimeResult(runtimeResult, toolName, payload, actionType = 'dispatch_tool') {
  const blocked = runtimeResult?.status === 'blocked';
  const ok = runtimeResult?.status === 'ok' || runtimeResult?.status === 'completed';
  const executionState = deriveExecutionStateFromRuntime(runtimeResult, { actionType });
  return {
    ok,
    status: blocked ? 'blocked' : ok ? 'ok' : 'failed',
    code: runtimeResult?.blocker?.code ?? runtimeResult?.error?.code ?? null,
    message:
      runtimeResult?.blocker?.message ??
      runtimeResult?.error?.message ??
      runtimeResult?.output?.message ??
      null,
    executionPath: 'proactive_plan',
    executionState,
    source: 'intake_v2_unified',
    tool: toolName,
    toolResult: runtimeResult,
    payload,
  };
}

/**
 * Factory execution via unified dispatch (replaces direct executeRuntimeAction in factory router).
 *
 * @param {{ payload: object, source: string }} input
 */
async function dispatchRunFactoryViaKernel({ payload, source }) {
  const factoryId =
    typeof payload.factoryId === 'string' ? payload.factoryId.trim() : '';
  const missionId = payload.missionId ?? null;
  const userId = payload.userId ?? null;
  const storeId = payload.storeId ?? null;
  const intent =
    typeof payload.intent === 'string'
      ? payload.intent.trim()
      : typeof payload.userMessage === 'string'
        ? payload.userMessage.trim()
        : '';
  const factoryContext =
    payload.context && typeof payload.context === 'object' && !Array.isArray(payload.context)
      ? payload.context
      : {};

  if (!factoryId || !missionId || !userId) {
    return {
      ok: false,
      status: 'error',
      code: 'FACTORY_CONTEXT_REQUIRED',
      message: 'run_factory requires factoryId, missionId, and userId',
      executionPath: 'proactive_plan',
      executionState: EXECUTION_STATES.BLOCKED,
      source: 'intake_v2_unified',
    };
  }

  const runtimeResult = await executeRuntimeAction({
    actionType: FACTORY_ACTION_TYPE,
    actionId: `factory:${factoryId}`,
    missionId,
    userId,
    storeId,
    source,
    payload: {
      factoryId,
      intent,
      context: {
        ...factoryContext,
        storeId: storeId ?? factoryContext.storeId ?? null,
        userMessage: intent,
        missionId,
        runtimeOwned: true,
        performerRuntimeOwned: true,
      },
      resumeState: payload.resumeState ?? null,
    },
  });

  const blocked = runtimeResult?.status === 'blocked';
  const ok = runtimeResult?.status === 'ok' || runtimeResult?.status === 'completed';
  const factoryExecution = runtimeResult?.output?.factoryExecution ?? runtimeResult?.output ?? null;
  const executionState = deriveExecutionStateFromRuntime(runtimeResult, {
    actionType: FACTORY_ACTION_TYPE,
  });

  return {
    ok,
    status: blocked ? 'blocked' : ok ? 'ok' : 'failed',
    code: runtimeResult?.blocker?.code ?? runtimeResult?.error?.code ?? null,
    message:
      runtimeResult?.blocker?.message ??
      runtimeResult?.error?.message ??
      factoryExecution?.error?.message ??
      null,
    executionPath: 'proactive_plan',
    executionState,
    source: 'intake_v2_unified',
    actionType: FACTORY_ACTION_TYPE,
    factoryId,
    factoryExecution,
    toolResult: runtimeResult,
    payload: {
      ...payload,
      missionId,
      dispatchedVia: 'unified_dispatch',
    },
  };
}

/**
 * Universal Artifact Factory execution via Runtime Authority.
 *
 * @param {{ payload: object, source: string }} input
 */
async function dispatchExecuteArtifactViaKernel({ payload, source }) {
  const missionId = payload.missionId ?? null;
  const userId = payload.userId ?? null;
  const artifactType = payload.artifactType ?? payload.type ?? null;

  if (!artifactType || !missionId || !userId) {
    return {
      ok: false,
      status: 'error',
      code: 'ARTIFACT_CONTEXT_REQUIRED',
      message: 'execute_artifact requires artifactType, missionId, and userId',
      executionPath: 'universal_artifact_factory',
      executionState: EXECUTION_STATES.BLOCKED,
      source: 'intake_v2_unified',
    };
  }

  const runtimeResult = await executeRuntimeAction({
    actionType: ARTIFACT_ACTION_TYPE,
    actionId: `artifact:${artifactType}`,
    missionId,
    userId,
    storeId: payload.storeId ?? null,
    source,
    payload: {
      artifactType,
      objective: payload.objective ?? payload.intent ?? null,
      context: payload.context ?? {},
      inputs: payload.inputs ?? {},
      outputs: payload.outputs ?? {},
      skipReview: payload.skipReview === true,
      autoPublish: payload.autoPublish === true,
    },
  });

  const blocked = runtimeResult?.status === 'blocked';
  const ok = runtimeResult?.status === 'ok' || runtimeResult?.status === 'completed';
  const artifactExecution = runtimeResult?.output?.artifactExecution ?? runtimeResult?.output ?? null;
  const executionState = deriveExecutionStateFromRuntime(runtimeResult, {
    actionType: ARTIFACT_ACTION_TYPE,
  });

  return {
    ok,
    status: blocked ? 'blocked' : ok ? 'ok' : 'failed',
    code: runtimeResult?.blocker?.code ?? runtimeResult?.error?.code ?? null,
    message:
      runtimeResult?.blocker?.message ??
      runtimeResult?.error?.message ??
      artifactExecution?.error?.message ??
      null,
    executionPath: 'universal_artifact_factory',
    executionState,
    source: 'intake_v2_unified',
    actionType: ARTIFACT_ACTION_TYPE,
    artifactType,
    artifactExecution,
    toolResult: runtimeResult,
    payload: {
      ...payload,
      missionId,
      dispatchedVia: 'unified_dispatch',
    },
  };
}

/**
 * Create and start an orchestration mission pipeline via kernel-authorized path.
 *
 * @param {{ type: string, payload: object, source: string }} input
 */
async function dispatchOrchestrationViaKernel({ type, payload, source }) {
  const body = payload?.body && typeof payload.body === 'object' ? payload.body : payload ?? {};
  const currentContext =
    payload?.currentContext && typeof payload.currentContext === 'object' ? payload.currentContext : {};
  const userMessage = String(payload?.userMessage ?? body.message ?? body.goal ?? body.brief ?? '').trim();
  const locale = String(payload?.locale ?? body.locale ?? 'en');
  const cardbeyTraceId = payload?.cardbeyTraceId ?? body.cardbeyTraceId ?? null;
  const actorId = String(payload?.actorId ?? body.actorId ?? body.userId ?? '').trim();
  const storeContext = payload?.storeContext && typeof payload.storeContext === 'object' ? payload.storeContext : null;

  const goal =
    String(body.message ?? body.goal ?? body.brief ?? userMessage ?? 'Campaign orchestration').trim() ||
    'Campaign orchestration';
  const tenantId = payload?.tenantId ?? getTenantId(payload?.user ?? body.user) ?? actorId;
  const storeId =
    String(
      currentContext.storeId ??
        currentContext.activeStoreId ??
        body.storeId ??
        storeContext?.storeId ??
        '',
    ).trim() || null;

  const missionType = type === 'multi_agent' ? 'multi_agent' : 'campaign_orchestration';
  const metaIn =
    body.metadataJson && typeof body.metadataJson === 'object' && !Array.isArray(body.metadataJson)
      ? body.metadataJson
      : payload?.metadata && typeof payload.metadata === 'object'
        ? payload.metadata
        : {};

  let metadata =
    missionType === 'multi_agent'
      ? {
          ...metaIn,
          goal: String(metaIn.goal ?? payload?.goal ?? goal).trim() || goal,
          context: payload?.context ?? metaIn.context ?? '',
          locale,
          source: source || 'intake_v2_unified',
          cardbeyTraceId,
        }
      : {
          goal,
          brief: goal,
          intentType: 'campaign_orchestration',
          storeContext: storeContext ?? {
            businessName: body.businessName ?? null,
            category: body.category ?? null,
            location: body.location ?? null,
            storeId,
          },
          source: source || 'intake_v2_unified',
          locale,
          cardbeyTraceId,
        };

  if (missionType === 'multi_agent' && process.env.MULTI_AGENT_ENABLED === 'true') {
    try {
      const { enrichMultiAgentDispatchMetadata } = await import('../multiAgent/deepseekIntakeBridge.ts');
      metadata = await enrichMultiAgentDispatchMetadata(metadata, goal);
    } catch (deepSeekMetaErr) {
      console.warn(
        '[unifiedDispatch] DeepSeek metadata enrichment failed (non-blocking):',
        deepSeekMetaErr?.message ?? deepSeekMetaErr,
      );
    }
  }

  const title =
    missionType === 'multi_agent'
      ? String(body.message ?? metadata.goal ?? 'Multi-agent mission').trim() || 'Multi-agent mission'
      : `Campaign: ${goal.slice(0, 60)}`;

  const { createMissionPipeline } = await import('../missionPipelineService.js');
  const pipeline = await createMissionPipeline({
    type: missionType,
    title: title.slice(0, 180),
    targetType: storeId ? 'store' : 'generic',
    targetId: storeId ?? undefined,
    targetLabel: undefined,
    metadata,
    requiresConfirmation: false,
    executionMode: 'AUTO_RUN',
    tenantId,
    createdBy: actorId || null,
  });

  const { runMissionUntilBlocked } = await import('../missionPipelineOrchestrator.js');
  runMissionUntilBlocked(pipeline.id).catch((err) =>
    console.error(`[unifiedDispatch] ${missionType} pipeline error:`, err?.message ?? err),
  );

  return {
    ok: true,
    status: 'ok',
    executionPath: 'run_pipeline',
    missionId: pipeline.id,
    action:
      missionType === 'multi_agent' ? 'multi_agent_dispatched' : 'campaign_orchestration_dispatched',
    reasoning:
      missionType === 'multi_agent'
        ? 'Detected complex multi-step goal — running multi-agent orchestration.'
        : 'Running multi-agent campaign orchestration via AgentCoordinator.',
    ...(missionType === 'multi_agent'
      ? {
          plan: [
            { step: 1, agent: 'research', description: 'Research and analyze the topic' },
            { step: 2, agent: 'build', description: 'Build the deliverable' },
            { step: 3, agent: 'qa', description: 'Review and validate' },
          ],
        }
      : {}),
  };
}

/**
 * Map create_store checkpoint dispatch result to unified dispatch shape.
 *
 * @param {Awaited<ReturnType<typeof dispatchCreateStoreCheckpointPipeline>>} dispatchResult
 */
function mapCreateStoreDispatchResult(dispatchResult) {
  if (!dispatchResult || typeof dispatchResult !== 'object') {
    return {
      ok: false,
      status: 'error',
      code: 'DISPATCH_FAILED',
      message: 'Create store dispatch returned no result',
      executionPath: 'kernel_dispatch',
    };
  }

  if (dispatchResult.kind === 'started') {
    return {
      ok: true,
      status: 'ok',
      executionPath: 'kernel_dispatch',
      action: 'store_mission_started',
      dispatchKind: dispatchResult.kind,
      responseBody: dispatchResult.responseBody,
      telemetry: dispatchResult.telemetry,
      missionId: dispatchResult.responseBody?.missionId ?? null,
    };
  }

  return {
    ok: false,
    status: dispatchResult.kind === 'failed' ? 'failed' : 'blocked',
    executionPath: 'checkpoint_pipeline',
    dispatchKind: dispatchResult.kind,
    statusCode: dispatchResult.statusCode,
    responseBody: dispatchResult.responseBody,
    ...(dispatchResult.kind === 'duplicate'
      ? {
          businessName: dispatchResult.businessName,
          existingStoreId: dispatchResult.existingStoreId ?? null,
          existingStoreName: dispatchResult.existingStoreName ?? dispatchResult.businessName,
        }
      : {}),
    ...(dispatchResult.kind === 'needs_form' ? { intentMode: dispatchResult.intentMode } : {}),
    ...(dispatchResult.kind === 'store_selection_required'
      ? {
          stores: dispatchResult.stores ?? [],
          userMessage: dispatchResult.userMessage ?? '',
          lockedTool: dispatchResult.lockedTool ?? 'general_chat',
        }
      : {}),
    ...(dispatchResult.kind === 'intake_chat' ? { message: dispatchResult.message ?? null } : {}),
  };
}

function mapCreateCampaignDispatchResult(dispatchResult) {
  if (!dispatchResult || typeof dispatchResult !== 'object') {
    return {
      ok: false,
      status: 'error',
      code: 'DISPATCH_FAILED',
      message: 'Create campaign dispatch returned no result',
      executionPath: 'kernel_dispatch',
    };
  }

  if (dispatchResult.kind === 'started') {
    return {
      ok: true,
      status: 'ok',
      executionPath: 'kernel_dispatch',
      action: 'campaign_mission_started',
      dispatchKind: dispatchResult.kind,
      responseBody: dispatchResult.responseBody,
      telemetry: dispatchResult.telemetry,
      missionId: dispatchResult.responseBody?.missionId ?? null,
    };
  }

  return {
    ok: false,
    status: dispatchResult.kind === 'failed' ? 'failed' : 'blocked',
    executionPath: 'checkpoint_pipeline',
    dispatchKind: dispatchResult.kind,
    statusCode: dispatchResult.statusCode,
    responseBody: dispatchResult.responseBody,
    ...(dispatchResult.kind === 'store_required' ? { storeRequired: true } : {}),
  };
}

/**
 * @param {{ type?: string, payload?: object }} action
 * @param {{ requireConfirmation?: boolean, confirmed?: boolean, source?: string }} [options]
 */
export async function unifiedDispatch(action, options = {}) {
  const type = String(action?.type ?? '').trim();
  const payload = action?.payload && typeof action.payload === 'object' ? action.payload : {};
  const source = String(options.source ?? 'intake_v2_unified').trim();
  const confirmed = options.confirmed === true;
  const requireConfirmation = options.requireConfirmation === true;

  if (!type) {
    return {
      ok: false,
      status: 'error',
      code: 'MISSING_ACTION_TYPE',
      message: 'Unified dispatch requires action.type',
      executionPath: 'proactive_plan',
    };
  }

  const missionId = typeof payload.missionId === 'string' ? payload.missionId.trim() : '';
  if (missionId && PIPELINE_ACTION_TYPES.has(type)) {
    const spineOwnership = await readMissionSpineOwnership(missionId);
    if (spineOwnership?.owner === SPINE_OWNERS.COMPILER_TOPOLOGY) {
      return {
        ok: false,
        status: 'blocked',
        code: 'MISSION_SPINE_LOCKED',
        message: `Mission ${missionId} is owned by compiler topology and cannot fall back to checkpoint dispatch.`,
        executionPath: 'proactive_plan',
      };
    }
  }

  if (requireConfirmation && !confirmed) {
    return {
      ok: false,
      status: 'pending_confirmation',
      proposedAction: type,
      executionPath: 'proactive_plan',
    };
  }

  if (options.useMemoryPipeline !== false && !confirmed) {
    try {
      const memoryBundle = await loadStepMemory({
        userId: payload.userId ?? payload.actorId ?? null,
        storeId: payload.storeId ?? null,
        missionId: payload.missionId ?? null,
        sessionId: payload.sessionId ?? null,
      });
      const reasoning = reasonAboutDispatch(type, memoryBundle, { requiresConfirmation });
      if (reasoning.requiresConfirmation) {
        return {
          ok: false,
          status: 'pending_confirmation',
          proposedAction: reasoning.governanceAction,
          reasoning: reasoning.reasoning,
          memoryUsed: reasoning.memoryUsed,
          executionPath: 'proactive_plan',
        };
      }
    } catch (memErr) {
      console.warn('[unifiedDispatch] memory pipeline skipped:', memErr?.message ?? memErr);
    }
  }

  const kernelAuth = assertKernelAuthorizedExecution({
    source: PIPELINE_ACTION_TYPES.has(type) ? 'intake_v2_unified' : source,
    actionType: confirmed ? 'execute_action' : undefined,
    userId: payload.userId ?? payload.actorId ?? null,
  });
  if (!kernelAuth.ok) {
    return {
      ok: false,
      status: 'blocked',
      code: kernelAuth.code,
      message: kernelAuth.message,
      executionPath: 'proactive_plan',
    };
  }

  if (type === UNIFIED_ACTION_TYPES.CREATE_STORE_CHECKPOINT) {
    const dispatchResult = await dispatchCreateStoreCheckpointPipeline(payload);
    return mapCreateStoreDispatchResult(dispatchResult);
  }

  if (type === UNIFIED_ACTION_TYPES.CREATE_CAMPAIGN_CHECKPOINT) {
    if (Features.compiler.useForCampaigns) {
      try {
        const { runMultiAgentCompilerFromIntake, shouldDispatchCampaignViaCompiler } = await import(
          '../mission/dispatchMultiAgentCompilerFromIntake.js'
        );
        const classification =
          payload.classification && typeof payload.classification === 'object'
            ? payload.classification
            : { tool: 'create_campaign', parameters: {} };
        if (shouldDispatchCampaignViaCompiler(classification)) {
          const compilerResult = await runMultiAgentCompilerFromIntake({
            user: payload.user,
            actorId: payload.actorId,
            locale: payload.locale,
            userMessage: payload.userMessage,
            classification,
            storeId: payload.storeId ?? classification.parameters?.storeId ?? null,
            sessionId: payload.sessionId ?? null,
            missionId: payload.missionId ?? null,
            auditSource: source,
          });
          if (compilerResult.kind === 'compiled') {
            return {
              ok: true,
              status: 'ok',
              dispatchKind: 'compiled',
              executionPath: 'multi_agent_compile',
              missionId: compilerResult.missionId,
              responseBody: compilerResult.responseBody,
              telemetry: compilerResult.telemetry,
            };
          }
          if (compilerResult.kind === 'auth_required') {
            return { ok: true, dispatchKind: 'auth_required', executionPath: 'multi_agent_compile' };
          }
          if (compilerResult.kind === 'store_required') {
            return { ok: true, dispatchKind: 'store_required', executionPath: 'multi_agent_compile' };
          }
        }
      } catch (compilerErr) {
        console.error(
          '[unifiedDispatch] compiler failed, falling back to checkpoint:',
          compilerErr?.message ?? compilerErr,
        );
      }
    }

    const dispatchResult = await dispatchCreateCampaignCheckpointPipeline(payload);
    return mapCreateCampaignDispatchResult(dispatchResult);
  }

  if (type === UNIFIED_ACTION_TYPES.RUN_PIPELINE) {
    const missionId = String(payload.missionId ?? '').trim();
    if (!missionId) {
      return {
        ok: false,
        status: 'error',
        code: 'MISSION_REQUIRED',
        message: 'run_pipeline requires payload.missionId',
        executionPath: 'run_pipeline',
      };
    }
    const engineResult = await executeMission({
      mode: 'run_pipeline',
      missionId,
      body: payload,
      source,
    });
    return {
      ok: engineResult.ok !== false,
      status: engineResult.ok !== false ? 'ok' : 'failed',
      executionPath: 'run_pipeline',
      missionId,
      orchestration: engineResult.orchestration ?? null,
    };
  }

  if (type === UNIFIED_ACTION_TYPES.RESPOND_CHECKPOINT) {
    const prisma = payload.prisma;
    const missionId = String(payload.missionId ?? '').trim();
    const stepId = String(payload.stepId ?? '').trim();
    if (!prisma || !missionId || !stepId) {
      return {
        ok: false,
        status: 'error',
        code: 'CHECKPOINT_CONTEXT_REQUIRED',
        message: 'respond_checkpoint requires prisma, missionId, and stepId',
        executionPath: 'kernel_dispatch',
      };
    }
    const engineResult = await executeMission({
      mode: 'respond_checkpoint',
      prisma,
      missionId,
      stepId,
      response: payload.response,
      data: payload.data ?? {},
      source,
    });
    return {
      ok: engineResult.ok === true,
      status: engineResult.ok === true ? 'ok' : 'failed',
      executionPath: 'kernel_dispatch',
      missionId,
      stepId,
      orchestration: engineResult.orchestration ?? null,
      missionStatus: engineResult.missionStatus ?? null,
      code: engineResult.error ?? null,
      message: engineResult.message ?? null,
      statusCode: engineResult.statusCode,
    };
  }

  if (type === UNIFIED_ACTION_TYPES.RUN_PROACTIVE_STEP) {
    const engineResult = await executeMission({
      mode: 'proactive_step',
      proactiveBody: payload.body ?? payload,
      source,
    });
    return {
      ok: engineResult.ok !== false,
      status: engineResult.ok !== false ? 'ok' : 'failed',
      executionPath: 'proactive_step',
      stepResult: engineResult,
    };
  }

  if (ORCHESTRATION_TYPES.has(type)) {
    return dispatchOrchestrationViaKernel({ type, payload, source });
  }

  if (type === 'execute_artifact') {
    return dispatchExecuteArtifactViaKernel({ payload, source });
  }

  if (type === FACTORY_ACTION_TYPE) {
    return dispatchRunFactoryViaKernel({ payload, source });
  }

  const toolName =
    typeof payload.toolName === 'string' && payload.toolName.trim()
      ? payload.toolName.trim()
      : type === 'ingest_document'
        ? 'scan_document'
        : type;

  if (!toolName || (!isRegisteredTool(toolName) && type !== 'dispatch_tool')) {
    return {
      ok: false,
      status: 'error',
      code: 'UNKNOWN_ACTION_TYPE',
      message: `Unknown unified dispatch type: ${type}`,
      executionPath: 'proactive_plan',
    };
  }

  const runtimeResult = await executeRuntimeAction({
    actionType: 'dispatch_tool',
    source: 'intake_v2_unified',
    missionId: payload.missionId ?? null,
    userId: payload.userId ?? null,
    tenantId: payload.tenantId ?? null,
    storeId: payload.storeId ?? null,
    payload: {
      toolName,
      input: payload.input ?? payload.parameters ?? payload,
      context: {
        ...(payload.context && typeof payload.context === 'object' ? payload.context : {}),
        source: 'intake_v2_unified',
        runtimeOwned: true,
        performerRuntimeOwned: true,
        locale: payload.locale ?? 'en',
        missionId: payload.missionId ?? null,
        confirmed,
      },
    },
  });

  return normalizeToolRuntimeResult(
    runtimeResult,
    toolName,
    {
      ...payload,
      missionId: payload.missionId ?? null,
      dispatchedVia: 'unified_dispatch',
    },
    'dispatch_tool',
  );
}

/** @deprecated alias — use unifiedDispatch({ type: 'run_factory', payload }) */
export async function routeFactoryIntentViaUnifiedDispatch(intent, context = {}, options = {}) {
  const ctx = context && typeof context === 'object' ? context : {};
  return unifiedDispatch(
    {
      type: FACTORY_ACTION_TYPE,
      payload: {
        factoryId: ctx.factoryId ?? intent?.factoryId ?? null,
        intent: ctx.intent ?? intent?.userMessage ?? intent?.intent ?? '',
        missionId: ctx.missionId ?? intent?.missionId ?? null,
        userId: ctx.userId ?? intent?.userId ?? null,
        storeId: ctx.storeId ?? intent?.storeId ?? null,
        context: ctx.context ?? intent?.context ?? {},
        resumeState: ctx.resumeState ?? null,
      },
    },
    {
      source: options.source ?? 'intake_v2_unified',
      requireConfirmation: options.requireConfirmation === true,
      confirmed: options.confirmed === true,
    },
  );
}

/**
 * Map unified dispatch output to Intake V2 JSON response shape.
 *
 * @param {object} result
 * @param {{ locale?: string, tool?: string }} [ctx]
 */
export function mapUnifiedDispatchToIntakeResponse(result, ctx = {}) {
  if (!result || typeof result !== 'object') {
    return {
      success: false,
      action: 'error',
      code: 'KERNEL_EXECUTION_REQUIRED',
      response: 'Execution failed.',
    };
  }

  if (result.status === 'pending_confirmation') {
    return {
      success: true,
      action: 'approval_required',
      requiresConfirmation: true,
      tool: ctx.tool ?? result.proposedAction ?? null,
      executionPath: 'proactive_plan',
    };
  }

  if (result.status === 'blocked' || result.ok === false) {
    return {
      success: false,
      action: 'error',
      code: result.code ?? 'KERNEL_EXECUTION_REQUIRED',
      response: result.message ?? 'Execution must go through the Runtime Kernel.',
      executionPath: 'proactive_plan',
    };
  }

  if (result.action === 'store_mission_started' && result.responseBody) {
    return {
      success: true,
      ...result.responseBody,
      executionPath: 'kernel_dispatch',
    };
  }

  if (result.action === 'campaign_mission_started' && result.responseBody) {
    return {
      success: true,
      ...result.responseBody,
      executionPath: 'kernel_dispatch',
    };
  }

  if (result.dispatchKind === 'compiled' && result.responseBody) {
    return {
      success: true,
      ...result.responseBody,
      executionPath: 'multi_agent_compile',
      missionId: result.missionId ?? result.responseBody.missionId ?? null,
    };
  }

  if (result.dispatchKind && result.dispatchKind !== 'started') {
    if (result.dispatchKind === 'store_selection_required') {
      return {
        ...buildPerformerStoreSelectionClarify({
          stores: result.stores ?? [],
          userMessage: ctx.userMessage,
          lockedTool: result.lockedTool ?? 'general_chat',
        }),
        executionPath: 'kernel_dispatch',
      };
    }
    if (result.dispatchKind === 'intake_chat') {
      return {
        success: true,
        action: 'chat',
        response:
          result.message ??
          "I didn't quite catch that. You can ask for help, manage campaigns, add products, or create a new business — what would you like to do?",
        executionPath: 'direct_action',
      };
    }
    if (result.dispatchKind === 'needs_form') {
      return {
        ...buildNeedsFormCreateStoreIntakeBody({
          userMessage: ctx.userMessage,
          intentMode: result.intentMode ?? 'store',
          classification: ctx.classification,
          storeCreateForm: ctx.storeCreateForm,
          memoryContext: ctx.memoryContext,
        }),
        executionPath: 'kernel_dispatch',
      };
    }
    if (result.dispatchKind === 'auth_required') {
      return {
        success: true,
        action: 'chat',
        executionPath: 'kernel_dispatch',
      };
    }
    if (result.dispatchKind === 'failed') {
      return {
        success: false,
        ...(result.responseBody ?? {}),
        executionPath: 'kernel_dispatch',
      };
    }
  }

  if (result.action === 'multi_agent_dispatched' || result.action === 'campaign_orchestration_dispatched') {
    return {
      success: true,
      missionId: result.missionId,
      action: result.action,
      reasoning: result.reasoning,
      executionPath: result.executionPath ?? 'run_pipeline',
      ...(Array.isArray(result.plan) ? { plan: result.plan } : {}),
    };
  }

  const tool = result.tool ?? ctx.tool ?? null;
  const toolResult = result.toolResult ?? {};
  const output = toolResult.output ?? {};
  return {
    success: toolResult.status === 'ok' || toolResult.status === 'completed',
    action: 'tool_call',
    tool,
    parameters: result.payload ?? {},
    response:
      output.message ??
      output.summary ??
      toolResult.blocker?.message ??
      toolResult.error?.message ??
      'Action completed.',
    result: output ?? null,
    artifacts: output.artifacts ?? [],
    executionPath: 'proactive_plan',
    missionId: result.payload?.missionId ?? null,
  };
}