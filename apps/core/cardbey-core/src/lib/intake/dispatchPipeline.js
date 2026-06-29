/**
 * Unified backend dispatch pipeline — memory → plan → reason → execute.
 * Single stack for dashboard POST /api/performer/dispatch and internal callers.
 */

import memoryFacade from '../../services/memory/memoryFacade.js';
import { FEATURE_FLAGS } from '../../config/featureFlags.js';
import { planAction } from './dispatchPlanAction.js';
import { reasonAboutDispatch } from './dispatchReasoningEngine.js';
import { selectDispatchCapability } from './dispatchCapabilityRegistry.js';
import { executeUiRuntimeAction } from '../runtime/performerRuntime/uiRuntimeActionService.js';
import { executeMissionStep } from '../runtime/performerRuntimeKernel.js';
import { unifiedDispatch } from './unifiedDispatch.js';
import { isRegisteredTool } from './intakeToolRegistry.js';

/**
 * @param {{ steps?: Array<{ executable?: boolean; action?: string; params?: Record<string, unknown> }> }} plan
 */
export function resolveExecutablePlanStep(plan) {
  const steps = Array.isArray(plan?.steps) ? plan.steps : [];
  return steps.find((s) => s.executable !== false) ?? steps[steps.length - 1] ?? null;
}

/**
 * @param {Record<string, unknown>} action
 * @param {Record<string, unknown>} [options]
 */
export function normalizeDispatchIntent(action, options = {}) {
  const payload =
    action.payload && typeof action.payload === 'object' && !Array.isArray(action.payload)
      ? { ...action.payload }
      : {};
  const storeId =
    String(action.storeId ?? payload.storeId ?? '').trim() ||
    null;
  const missionId =
    String(action.missionId ?? payload.missionId ?? '').trim() ||
    null;

  return {
    type: String(action.type ?? '').trim(),
    parameters: payload,
    requireConfirmation:
      options.requireConfirmation === true || action.requireConfirmation === true,
    source: String(options.source ?? action.source ?? 'dashboard_dispatch').trim(),
    storeId,
    missionId,
    hybrid:
      action.hybrid && typeof action.hybrid === 'object' && !Array.isArray(action.hybrid)
        ? action.hybrid
        : options.hybrid,
  };
}

/**
 * @param {{ req: import('express').Request; intent: ReturnType<typeof normalizeDispatchIntent>; conversationId?: string | null; memorySnapshot?: Record<string, unknown> | null }} input
 */
async function loadPipelineMemory(input) {
  const userId = String(input.req?.user?.id ?? input.req?.userId ?? '').trim();
  if (!userId) {
    return input.memorySnapshot && typeof input.memorySnapshot === 'object'
      ? input.memorySnapshot
      : null;
  }

  try {
    const bundle = await memoryFacade.getBundle({
      actor: { type: 'store_owner', id: userId },
      storeId: input.intent.storeId,
      missionId: input.intent.missionId,
      sessionId: input.conversationId ?? null,
    });
    if (input.memorySnapshot && typeof input.memorySnapshot === 'object') {
      return { ...bundle, clientSnapshot: input.memorySnapshot };
    }
    return bundle;
  } catch (err) {
    console.warn('[dispatchPipeline] memory load failed:', err?.message ?? err);
    return input.memorySnapshot && typeof input.memorySnapshot === 'object'
      ? input.memorySnapshot
      : null;
  }
}

/**
 * @param {{
 *   capability: ReturnType<typeof selectDispatchCapability>;
 *   plan: Awaited<ReturnType<typeof planAction>>;
 *   intent: ReturnType<typeof normalizeDispatchIntent>;
 *   req: import('express').Request;
 * }} input
 */
async function executeDispatchCapability(input) {
  const { capability, plan, intent, req } = input;
  const step = resolveExecutablePlanStep(plan);
  const params = step?.params ?? intent.parameters;
  const user = req.user ?? { id: req.userId ?? null };
  const hybrid = intent.hybrid && typeof intent.hybrid === 'object' ? intent.hybrid : {};

  if (capability.channel === 'ui_runtime') {
    const action = capability.uiAction ?? capability.id;
    const result = await executeUiRuntimeAction({
      action,
      missionId: intent.missionId,
      storeId: intent.storeId,
      tenantId: req.user?.tenantId ?? req.userId ?? null,
      userId: req.userId ?? req.user?.id ?? null,
      source: intent.source,
      payload: {
        ...params,
        ...(hybrid.preferAgent ? { _preferAgent: true } : {}),
        ...(hybrid.confirmed ? { confirmed: true } : {}),
        ...(hybrid.executeAfterReview ? { _executeAfterReview: true } : {}),
      },
    });
    return {
      ok: result.ok !== false && result.status !== 'blocked',
      status: result.status ?? (result.ok !== false ? 'completed' : 'failed'),
      output: result.output ?? result,
      error: result.error ?? null,
      message: result.message ?? null,
    };
  }

  if (capability.channel === 'runtime_mission_step') {
    const missionId = String(params.missionId ?? intent.missionId ?? '').trim();
    const stepNumber = Math.floor(Number(params.stepNumber));
    const requestedTool = String(
      params.requestedTool ?? params.recommendedTool ?? intent.type,
    ).trim();

    const stepResult = await executeMissionStep({
      user,
      missionId,
      stepNumber,
      requestedTool,
      proactivePlanTotal: Math.max(0, Math.floor(Number(params.proactivePlanTotal) || 0)),
      parameters: params.parameters && typeof params.parameters === 'object' ? params.parameters : params,
      body: {
        ...(params.proactivePlanStep ? { proactivePlanStep: params.proactivePlanStep } : {}),
        ...(params.forceRetry ? { forceRetry: true, regenerate: true } : {}),
        storeId: intent.storeId,
        sessionId: params.sessionId ?? null,
      },
      source: intent.source || 'dashboard_dispatch',
    });

    return {
      ok: stepResult.ok === true,
      status: stepResult.ok === true ? 'completed' : 'failed',
      output: stepResult,
      error: stepResult.ok ? null : { code: stepResult.code, message: stepResult.message },
    };
  }

  if (capability.channel === 'performer_intake') {
    const intentText =
      (typeof params.intentText === 'string' && params.intentText.trim()) ||
      (typeof params.text === 'string' && params.text.trim()) ||
      (typeof params.label === 'string' && params.label.trim()) ||
      capability.id;
    return {
      ok: true,
      status: 'submit_intent',
      output: {
        intentText,
        label: (typeof params.label === 'string' && params.label.trim()) || intentText,
        storeId: intent.storeId,
        dispatchType: capability.id,
      },
    };
  }

  const toolName = capability.id;
  if (isRegisteredTool(toolName)) {
    const runtimeResult = await unifiedDispatch(
      {
        type: toolName,
        payload: {
          ...params,
          toolName,
          storeId: intent.storeId ?? params.storeId ?? null,
          missionId: intent.missionId ?? params.missionId ?? null,
          userId: req.userId ?? req.user?.id ?? null,
        },
      },
      {
        source: intent.source,
        confirmed: hybrid.confirmed === true || params.confirmed === true,
        requireConfirmation: capability.requiresConfirmation,
        useMemoryPipeline: false,
      },
    );
    return {
      ok: runtimeResult.ok !== false,
      status: runtimeResult.status ?? (runtimeResult.ok !== false ? 'ok' : 'failed'),
      output: runtimeResult,
      error: runtimeResult.ok === false ? { code: runtimeResult.code, message: runtimeResult.message } : null,
    };
  }

  return {
    ok: false,
    status: 'failed',
    error: {
      code: 'UNSUPPORTED_CAPABILITY_CHANNEL',
      message: `Unsupported dispatch channel: ${capability.channel}`,
    },
  };
}

/**
 * @param {{
 *   action: Record<string, unknown>;
 *   options?: Record<string, unknown>;
 *   req: import('express').Request;
 *   conversationId?: string | null;
 *   memorySnapshot?: Record<string, unknown> | null;
 * }} input
 */
export async function runPerformerDispatchPipeline(input) {
  const action = input.action && typeof input.action === 'object' ? input.action : {};
  const options = input.options && typeof input.options === 'object' ? input.options : {};
  const intent = normalizeDispatchIntent(action, options);

  if (!intent.type) {
    return {
      ok: false,
      status: 'error',
      error: { code: 'MISSING_ACTION_TYPE', message: 'Dispatch requires action.type' },
      dispatchSource: 'backend',
    };
  }

  const memoryBundle = await loadPipelineMemory({
    req: input.req,
    intent,
    conversationId: input.conversationId ?? null,
    memorySnapshot: input.memorySnapshot ?? null,
  });

  const plan = options.skipPlanning === true
    ? {
        steps: [{ action: intent.type, params: intent.parameters, executable: true }],
        metadata: { memoryUsed: Boolean(memoryBundle), reasoning: [] },
      }
    : await planAction({
        intentType: intent.type,
        parameters: intent.parameters,
        storeId: intent.storeId,
        memoryBundle,
      });

  const executableAction = resolveExecutablePlanStep(plan)?.action ?? intent.type;
  const capability = selectDispatchCapability(executableAction, memoryBundle);
  const reasoning = reasonAboutDispatch(executableAction, memoryBundle, capability);

  const userConfirmed = options.confirmed === true || intent.parameters.confirmed === true;
  const skipConfirmation = options.requireConfirmation === false;
  const forceConfirmation = intent.requireConfirmation || options.requireConfirmation === true;
  const needsConfirmation =
    (reasoning.requiresConfirmation || forceConfirmation) && !skipConfirmation && !userConfirmed;

  if (needsConfirmation) {
    return {
      ok: false,
      status: 'pending_confirmation',
      proposedAction: reasoning.governanceAction,
      capability,
      plan,
      reasoning: reasoning.reasoning,
      memoryUsed: reasoning.memoryUsed,
      requiresConfirmation: true,
      dispatchSource: 'backend',
    };
  }

  const result = await executeDispatchCapability({
    capability,
    plan,
    intent,
    req: input.req,
  });

  return {
    ...result,
    missionId: intent.missionId,
    capability,
    plan,
    reasoning: reasoning.reasoning,
    memoryUsed: reasoning.memoryUsed,
    requiresConfirmation: false,
    dispatchSource: 'backend',
    features: {
      useBackendDispatch: FEATURE_FLAGS.USE_BACKEND_DISPATCH,
    },
  };
}
