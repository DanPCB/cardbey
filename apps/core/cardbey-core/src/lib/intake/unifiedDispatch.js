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

const ORCHESTRATION_TYPES = new Set(['multi_agent', 'campaign_orchestration']);
const FACTORY_ACTION_TYPE = 'run_factory';

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

  const metadata =
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
    executionPath: 'proactive_plan',
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

  if (requireConfirmation && !confirmed) {
    return {
      ok: false,
      status: 'pending_confirmation',
      proposedAction: type,
      executionPath: 'proactive_plan',
    };
  }

  const kernelAuth = assertKernelAuthorizedExecution({
    source,
    actionType: confirmed ? 'execute_action' : undefined,
    userId: payload.userId ?? null,
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

  if (ORCHESTRATION_TYPES.has(type)) {
    return dispatchOrchestrationViaKernel({ type, payload, source });
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

  if (result.action === 'multi_agent_dispatched' || result.action === 'campaign_orchestration_dispatched') {
    return {
      success: true,
      missionId: result.missionId,
      action: result.action,
      reasoning: result.reasoning,
      executionPath: 'proactive_plan',
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