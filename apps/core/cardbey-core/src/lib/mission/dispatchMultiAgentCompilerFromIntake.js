/**
 * Intake dispatch for multi-agent compiler (replaces checkpoint path for create_campaign).
 */

import { getTenantId } from '../missionAccess.js';
import { generateExecutionPlan } from './generateExecutionPlan.js';
import { shouldUseMultiAgentCompiler } from './intentCompilerBridge.js';
import { intakeMessage } from '../intake/performerIntakeMessageCatalog.js';
import { RISK } from '../intake/intakeToolRegistry.js';
import { resolveStoreForIntakeTool } from './executionContextKernel.js';

function pickString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

/**
 * @param {{
 *   classification?: { parameters?: Record<string, unknown>; tool?: string } | null;
 *   userMessage?: string;
 *   storeId?: string | null;
 *   missionId?: string | null;
 *   sessionId?: string | null;
 * }} input
 */
export function resolveCompilerHandoffFields(input = {}) {
  const params =
    input.classification?.parameters &&
    typeof input.classification.parameters === 'object' &&
    !Array.isArray(input.classification.parameters)
      ? input.classification.parameters
      : {};

  return {
    storeId: pickString(params.storeId, input.storeId),
    intentText: pickString(
      params.campaignContext,
      params.hint,
      params.goal,
      input.userMessage,
    ),
    sessionId: pickString(params.sessionId, input.sessionId),
    missionId: pickString(params.missionId, input.missionId),
  };
}

/**
 * @param {object} deps
 * @returns {Promise<
 *   | { kind: 'auth_required' }
 *   | { kind: 'store_required' }
 *   | { kind: 'execution_context_required'; clarify: object }
 *   | { kind: 'compiled'; responseBody: object; telemetry: object; missionId: string }
 *   | { kind: 'failed'; statusCode: number; responseBody: object }
 * >}
 */
export async function runMultiAgentCompilerFromIntake(deps) {
  const {
    user,
    actorId,
    locale,
    userMessage,
    classification,
    storeId: storeIdFromDeps,
    sessionId,
    missionId: missionIdFromDeps,
    auditSource,
  } = deps;

  if (!actorId || !user?.id) {
    return { kind: 'auth_required' };
  }

  const handoff = resolveCompilerHandoffFields({
    classification,
    userMessage,
    storeId: storeIdFromDeps,
    sessionId,
    missionId: missionIdFromDeps,
  });

  const resolution = await resolveStoreForIntakeTool({
    userId: actorId,
    tool: 'create_campaign',
    userMessage,
    classification,
    hintedStoreId: pickString(storeIdFromDeps, handoff.storeId),
  });

  if (!resolution.resolved) {
    if (resolution.clarify) {
      return { kind: 'execution_context_required', clarify: resolution.clarify };
    }
    return { kind: 'store_required' };
  }

  const storeId = pickString(resolution.storeId, handoff.storeId);
  const executionContext = resolution.executionContext ?? null;
  const intentText = handoff.intentText;
  const resolvedSessionId = handoff.sessionId;
  const missionId = handoff.missionId;

  if (!storeId) {
    return { kind: 'store_required' };
  }

  const text = intentText || String(userMessage ?? '').trim();
  if (!text) {
    return {
      kind: 'failed',
      statusCode: 400,
      responseBody: {
        success: false,
        action: 'create_campaign_failed',
        message: 'Campaign intent text is required for plan compilation.',
        error: 'missing_intent_text',
      },
    };
  }

  try {
    const tenantId = getTenantId(user) ?? actorId;
    const planResult = await generateExecutionPlan(
      {
        text,
        tool: 'create_campaign',
        parameters:
          classification?.parameters &&
          typeof classification.parameters === 'object' &&
          !Array.isArray(classification.parameters)
            ? { ...classification.parameters, storeId }
            : { storeId },
      },
      storeId,
      resolvedSessionId,
      {
        missionId: missionId ?? undefined,
        userId: actorId,
        tenantId,
        locale,
        executionContext,
      },
    );

    return {
      kind: 'compiled',
      missionId: planResult.missionId,
      responseBody: {
        ...planResult.response,
        storeId,
        executionContext,
        selectedStore: executionContext?.selectedStore ?? null,
        auditSource,
      },
      telemetry: {
        classification: {
          executionPath: 'multi_agent_compile',
          tool: 'create_campaign',
          confidence: classification?.confidence ?? 1,
          parameters: {
            storeId,
            campaignContext: text,
            confirmed: classification?.parameters?.confirmed === true,
            selectionMethod: executionContext?.selectionMethod ?? null,
          },
        },
        validated: true,
        downgraded: false,
        validationErrors: [],
        riskLevel: RISK.STATE_CHANGE,
        result: 'success',
      },
    };
  } catch (err) {
    return {
      kind: 'failed',
      statusCode: 500,
      responseBody: {
        success: false,
        action: 'create_campaign_failed',
        message: err?.message ?? 'Campaign plan compilation failed.',
        error: 'compiler_failed',
      },
    };
  }
}

/**
 * @param {import('express').Response} res
 * @param {Awaited<ReturnType<typeof runMultiAgentCompilerFromIntake>>} result
 * @param {{ locale: string; safeJson: Function }} ctx
 */
export async function respondMultiAgentCompilerDispatch(res, result, ctx) {
  const { locale, safeJson } = ctx;

  if (result.kind === 'auth_required') {
    await safeJson(
      {
        success: true,
        action: 'chat',
        response: intakeMessage('signInToContinue', locale),
      },
      {
        classification: { executionPath: 'multi_agent_compile', tool: 'create_campaign', confidence: 1 },
        validated: true,
        downgraded: false,
        validationErrors: [],
        riskLevel: RISK.SAFE_READ,
        result: 'auth_required',
      },
    );
    return res;
  }

  if (result.kind === 'execution_context_required' && result.clarify) {
    await safeJson(result.clarify, {
      classification: {
        executionPath: 'resolve_execution_context',
        tool: 'create_campaign',
        confidence: 1,
        lockedTool: 'create_campaign',
        _requiresStore: true,
        requiresStore: true,
      },
      validated: true,
      downgraded: true,
      downgradeReason: 'requires_execution_context',
      validationErrors: [],
      riskLevel: RISK.STATE_CHANGE,
      result: 'clarify_store',
    });
    return res;
  }

  if (result.kind === 'store_required') {
    await safeJson(
      {
        success: true,
        action: 'clarify_store',
        clarifyType: 'execution_context_store_picker',
        response: intakeMessage('campaignRequiresStore', locale),
        message: intakeMessage('campaignRequiresStore', locale),
        options: [],
        missingContext: ['store'],
        lockedTool: 'create_campaign',
      },
      {
        classification: { executionPath: 'multi_agent_compile', tool: 'create_campaign', confidence: 1 },
        validated: true,
        downgraded: true,
        downgradeReason: 'requires_store',
        validationErrors: [],
        riskLevel: RISK.STATE_CHANGE,
        result: 'clarify_store',
      },
    );
    return res;
  }

  if (result.kind === 'compiled') {
    await safeJson(result.responseBody, result.telemetry);
    return res;
  }

  if (result.kind === 'failed') {
    return res.status(result.statusCode).json(result.responseBody);
  }

  return null;
}

/**
 * Route create_campaign through compiler; other campaign checkpoint tools stay on legacy path.
 *
 * @param {Record<string, unknown>} classification
 */
export function shouldDispatchCampaignViaCompiler(classification) {
  return shouldUseMultiAgentCompiler(classification);
}
