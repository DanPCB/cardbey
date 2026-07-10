/**

 * Loyalty intake dispatch — compiler spine when USE_LOYALTY_SPINE, else legacy proactive path.

 */



import { Features } from '../../config/features.js';

import { generateExecutionPlan } from './generateExecutionPlan.js';

import { shouldUseMultiAgentCompiler } from './intentCompilerBridge.js';

import { getTenantId } from '../missionAccess.js';

import { intakeMessage } from '../intake/performerIntakeMessageCatalog.js';

import { RISK } from '../intake/intakeToolRegistry.js';

import { emitSpinePathTelemetry } from '../intake/spinePathTelemetry.js';
import { withCanonicalRuntimeState } from '../runtime/canonicalRuntimeState.js';
import { fetchUserStoresForDisambiguation } from '../intake/resolveStoreAmbiguity.js';
import {
  resolveStoreForIntakeTool,
  executionContextQuestionForTool,
} from './executionContextKernel.js';
import {
  buildExecutionContextClarifyPayload,
  buildStoreCandidateCard,
} from './resolveExecutionContext.js';



function pickString(...values) {

  for (const value of values) {

    if (typeof value === 'string' && value.trim()) return value.trim();

  }

  return null;

}



/**

 * @param {Record<string, unknown> | null | undefined} classification

 */

export function isLoyaltyCompilerTool(classification) {

  const tool = String(classification?.tool ?? '').trim();

  return tool === 'setup_loyalty_program' || tool === 'create_loyalty_program';

}



/**

 * @param {Record<string, unknown> | null | undefined} classification

 */

export function shouldDispatchLoyaltyViaCompiler(classification) {

  return Features.loyalty.useSpine && isLoyaltyCompilerTool(classification);

}



/**

 * TopologyReview / intake response shape for loyalty compiler.

 * @param {object} planResult

 * @param {{ storeId: string; tool: string; pathId?: string }} extra

 */

export function buildLoyaltyCompilerResponseBody(planResult, extra) {

  const tool = String(extra.tool || 'setup_loyalty_program').trim();

  const pathId = extra.pathId || 'loyalty_chat_compile';

  const bundle = planResult?.artifactBundle ?? {};

  const topology = bundle.topology ?? planResult?.response?.pendingTopology ?? { nodes: [] };

  const policy = bundle.policy ?? planResult?.response?.pendingPolicy ?? {};

  const reasoning = bundle.reasoning ?? planResult?.response?.pendingReasoning ?? {};

  const metadata = {

    ...(planResult?.metadata && typeof planResult.metadata === 'object' ? planResult.metadata : {}),

    ...(planResult?.response?.executionPlan?.metadata &&

    typeof planResult.response.executionPlan.metadata === 'object'

      ? planResult.response.executionPlan.metadata

      : {}),

    tool,

    pathId,

    storeId: extra.storeId,
    executionContext: extra.executionContext ?? null,
  };



  const base =

    planResult?.response && typeof planResult.response === 'object' ? { ...planResult.response } : {};



  return withCanonicalRuntimeState({

    ...base,

    ok: true,

    success: true,

    action: 'show_execution_plan',

    missionId: planResult?.missionId ?? base.missionId ?? null,

    storeId: extra.storeId,
    executionContext: extra.executionContext ?? null,
    selectedStore: extra.executionContext?.selectedStore ?? null,

    missingContext: [],

    executionPath: pathId,

    pathId,

    spine: true,

    executionPlan: {

      topology,

      policy,

      reasoning,

      metadata,

    },

    pendingTopology: topology,

    pendingPolicy: policy,

    pendingReasoning: reasoning,

    executionContext: extra.executionContext ?? null,

    selectedStore: extra.executionContext?.selectedStore ?? null,

    multiAgentStatus: metadata.multiAgentStatus ?? 'pending_approval',
  });

}



/**

 * @param {{

 *   classification?: { parameters?: Record<string, unknown>; tool?: string } | null;

 *   userMessage?: string;

 *   storeId?: string | null;

 * }} input

 */

export function resolveLoyaltyHandoffFields(input = {}) {

  const params =

    input.classification?.parameters &&

    typeof input.classification.parameters === 'object' &&

    !Array.isArray(input.classification.parameters)

      ? input.classification.parameters

      : {};



  return {

    storeId: pickString(params.storeId, input.storeId),

    intentText: pickString(params.goal, params.hint, input.userMessage),

    sessionId: pickString(params.sessionId, input.sessionId),

    missionId: pickString(params.missionId, input.missionId),

  };

}



/**

 * Locked-intent store clarification (no rephrase).

 * @param {{ tool?: string; message?: string }} [opts]

 */

export function buildLoyaltyStoreClarifyResponse(opts = {}) {

  const tool = String(opts.tool || 'setup_loyalty_program').trim();

  const message =

    opts.message || executionContextQuestionForTool(tool);

  const storeCandidates = Array.isArray(opts.storeCandidates) ? opts.storeCandidates : [];
  const lockedParams =
    opts.lockedParams && typeof opts.lockedParams === 'object' && !Array.isArray(opts.lockedParams)
      ? opts.lockedParams
      : {};
  const options =
    Array.isArray(opts.options) && opts.options.length > 0
      ? opts.options
      : storeCandidates
          .map((raw) => {
            const card =
              raw && typeof raw === 'object' ? buildStoreCandidateCard(raw) : null;
            if (!card?.id || !card?.name) return null;
            return {
              label: card.name,
              tool,
              parameters: {
                ...lockedParams,
                storeId: card.id,
                activeStoreId: card.id,
                selectionMethod: 'manual',
              },
              logoUrl: card.logoUrl,
              hint: card.category,
              storeCandidate: card,
            };
          })
          .filter(Boolean);

  return {

    ok: true,

    success: true,

    action: 'clarify_store',

    lockedTool: tool,

    missingContext: ['store'],

    clarifyType: 'execution_context_store_picker',

    response: message,

    message,

    options,

    storeCandidates,

    pendingIntent: {

      originalTool: tool,

      tool,

      lockedTool: tool,

      lockedIntent: tool,

      clarifyType: 'execution_context_store_picker',

      storeCandidates,

    },

    executionPath: 'resolve_execution_context',

    pathId: 'resolve_execution_context',

  };

}

/**
 * Fetch owner stores and build a full execution-context clarify payload for loyalty.
 * @param {{ actorId?: string | null; tool?: string; lockedParams?: Record<string, unknown> }} opts
 */
export async function buildLoyaltyStoreClarifyWithCandidates(opts = {}) {
  const tool = String(opts.tool || 'setup_loyalty_program').trim();
  const actorId = pickString(opts.actorId);
  const lockedParams =
    opts.lockedParams && typeof opts.lockedParams === 'object' && !Array.isArray(opts.lockedParams)
      ? opts.lockedParams
      : {};
  if (!actorId) {
    return buildLoyaltyStoreClarifyResponse({ tool });
  }
  const storesRaw = await fetchUserStoresForDisambiguation(actorId);
  if (!storesRaw.length) {
    return buildLoyaltyStoreClarifyResponse({
      tool,
      message: executionContextQuestionForTool(tool),
    });
  }
  return buildExecutionContextClarifyPayload({
    stores: storesRaw,
    lockedTool: tool,
    lockedParams,
    clarifyType: 'execution_context_store_picker',
  });
}



/**

 * @param {object} deps

 * @returns {Promise<

 *   | { kind: 'auth_required' }

 *   | { kind: 'store_required' }
 *   | { kind: 'execution_context_required'; clarify: object }

 *   | { kind: 'compiled'; responseBody: object; telemetry: object; missionId: string }

 *   | { kind: 'failed'; statusCode: number; responseBody: object }

 *   | { kind: 'skip' }

 * >}

 */

export async function runLoyaltyCompilerFromIntake(deps) {

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



  if (!shouldDispatchLoyaltyViaCompiler(classification)) {

    return { kind: 'skip' };

  }



  if (!actorId || !user?.id) {

    emitSpinePathTelemetry({

      pathId: 'loyalty_chat_compile',

      source: auditSource ?? 'intake_v2',

      ok: false,

      reason: 'auth_required',

      tool: classification?.tool ?? null,

      spine: false,

      executionPath: 'loyalty_chat_compile',

    });

    return { kind: 'auth_required' };

  }



  const handoff = resolveLoyaltyHandoffFields({

    classification,

    userMessage,

    storeId: storeIdFromDeps,

  });



  const params =

    classification?.parameters &&

    typeof classification.parameters === 'object' &&

    !Array.isArray(classification.parameters)

      ? classification.parameters

      : {};



  const tool = String(classification?.tool ?? 'setup_loyalty_program').trim();

  const intentText =

    handoff.intentText ||

    'Setup a loyalty program from the uploaded card';



  const resolution = await resolveStoreForIntakeTool({

    userId: actorId,

    tool,

    userMessage,

    classification,

    hintedStoreId: pickString(storeIdFromDeps, handoff.storeId),

    lockedParams: params,

  });



  if (!resolution.resolved) {

    if (resolution.kind === 'no_stores') {

      emitSpinePathTelemetry({

        pathId: 'loyalty_store_required',

        source: auditSource ?? 'intake_v2',

        ok: true,

        reason: 'store_required',

        tool,

        storeId: null,

        missingContext: ['store'],

        executionPath: 'resolve_execution_context',

        action: 'clarify_store',

        spine: false,

      });

      return { kind: 'store_required' };

    }

    if (resolution.clarify) {

      emitSpinePathTelemetry({

        pathId: 'resolve_execution_context',

        source: auditSource ?? 'intake_v2',

        ok: true,

        reason: resolution.kind ?? 'execution_context_pending',

        tool,

        storeId: null,

        missingContext: ['store'],

        executionPath: 'resolve_execution_context',

        action: 'clarify_store',

        spine: false,

      });

      return { kind: 'execution_context_required', clarify: resolution.clarify };

    }

    emitSpinePathTelemetry({

      pathId: 'loyalty_store_required',

      source: auditSource ?? 'intake_v2',

      ok: true,

      reason: 'store_required',

      tool,

      storeId: null,

      missingContext: ['store'],

      executionPath: 'loyalty_store_required',

      action: 'clarify_store',

      spine: false,

    });

    return { kind: 'store_required' };

  }



  const executionContext = resolution.executionContext;

  const storeId = pickString(executionContext?.storeId, resolution.storeId);

  if (!storeId) {

    return { kind: 'store_required' };

  }



  try {

    const tenantId = getTenantId(user) ?? actorId;

    const planResult = await generateExecutionPlan(

      {

        text: intentText,

        tool,

        missionType: 'setup_loyalty_program',

        parameters: {

          ...params,

          storeId,

          source: params.source ?? 'intake_v2_loyalty_chat',

        },

      },

      storeId,

      handoff.sessionId ?? sessionId ?? null,

      {

        missionId: handoff.missionId ?? missionIdFromDeps ?? undefined,

        userId: actorId,

        tenantId,

        locale: locale ?? 'en',

        title: `Loyalty: ${intentText.slice(0, 60)}`,

        executionContext,

        intakeEvidence:
          params.intakeEvidence && typeof params.intakeEvidence === 'object' ? params.intakeEvidence : undefined,

      },

    );



    const responseBody = buildLoyaltyCompilerResponseBody(planResult, {

      storeId,

      tool,

      pathId: 'loyalty_chat_compile',

      executionContext,

    });



    emitSpinePathTelemetry({

      pathId: 'loyalty_chat_compile',

      source: auditSource ?? 'intake_v2',

      ok: true,

      reason: 'compiled',

      tool,

      storeId,

      missingContext: [],

      executionPath: 'loyalty_chat_compile',

      action: 'show_execution_plan',

      missionId: planResult.missionId,

      spine: true,

      nodeCount: responseBody.executionPlan?.topology?.nodes?.length ?? 0,

      useLoyaltySpine: true,

    });



    return {

      kind: 'compiled',

      missionId: planResult.missionId,

      responseBody: withCanonicalRuntimeState({

        ...responseBody,

        auditSource: auditSource ?? 'intake_v2_loyalty_chat',

      }),

      telemetry: {

        classification: {

          executionPath: 'loyalty_chat_compile',

          tool,

          confidence: classification?.confidence ?? 1,

          parameters: {

            storeId,

            confirmed: params.confirmed === true,

          },

          pathId: 'loyalty_chat_compile',

        },

        validated: true,

        downgraded: false,

        validationErrors: [],

        riskLevel: RISK.STATE_CHANGE,

        result: 'success',

      },

    };

  } catch (err) {

    emitSpinePathTelemetry({

      pathId: 'loyalty_compile_failed_fallback',

      source: auditSource ?? 'intake_v2',

      ok: false,

      reason: 'compiler_failed',

      tool,

      storeId,

      missingContext: [],

      executionPath: 'loyalty_compile_failed_fallback',

      action: 'setup_loyalty_failed',

      spine: false,

      useLoyaltySpine: true,

    });

    return {

      kind: 'failed',

      statusCode: 500,

      responseBody: {

        success: false,

        ok: false,

        action: 'setup_loyalty_failed',

        message: err?.message ?? 'Loyalty plan compilation failed.',

        error: 'compiler_failed',

        pathId: 'loyalty_compile_failed_fallback',

        executionPath: 'loyalty_compile_failed_fallback',

        missingContext: [],

        storeId,

      },

    };

  }

}



/**

 * @param {import('express').Response} res

 * @param {Awaited<ReturnType<typeof runLoyaltyCompilerFromIntake>>} result

 * @param {{ locale: string; safeJson: Function; tool?: string; actorId?: string | null; lockedParams?: Record<string, unknown> }} ctx

 */

export async function respondLoyaltyCompilerDispatch(res, result, ctx) {

  const { locale, safeJson } = ctx;

  const tool = String(ctx.tool || 'setup_loyalty_program').trim();



  if (result.kind === 'skip') return null;



  if (result.kind === 'auth_required') {

    await safeJson(

      {

        success: true,

        action: 'chat',

        response: intakeMessage('signInToContinue', locale),

      },

      {

        classification: {

          executionPath: 'loyalty_chat_compile',

          tool,

          confidence: 1,

          pathId: 'loyalty_chat_compile',

        },

        validated: true,

        downgraded: false,

        validationErrors: [],

        riskLevel: RISK.SAFE_READ,

        result: 'auth_required',

      },

    );

    return res;

  }



  if (result.kind === 'store_required') {

    const clarifyPayload = await buildLoyaltyStoreClarifyWithCandidates({
      actorId: ctx.actorId,
      tool,
      lockedParams: ctx.lockedParams,
    });

    await safeJson(
      clarifyPayload,
      {
        classification: {
          executionPath: 'resolve_execution_context',
          tool,
          confidence: 1,
          pathId: 'resolve_execution_context',
          lockedTool: tool,
          _requiresStore: true,
          requiresStore: true,
        },
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



  if (result.kind === 'execution_context_required' && result.clarify) {

    await safeJson(result.clarify, {

      classification: {

        executionPath: 'resolve_execution_context',

        tool,

        confidence: 1,

        pathId: 'resolve_execution_context',

        lockedTool: tool,

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

 * @param {import('express').Request} req

 * @param {import('express').Response} res

 * @param {object} deps

 * @param {string} auditSource

 */

export async function dispatchAndRespondLoyaltyCompile(req, res, deps, auditSource) {

  if (!shouldDispatchLoyaltyViaCompiler(deps.classification)) {

    return null;

  }



  const result = await runLoyaltyCompilerFromIntake({

    ...deps,

    auditSource,

  });



  if (result.kind === 'skip') return null;



  const loyaltyParams =
    deps.classification?.parameters &&
    typeof deps.classification.parameters === 'object' &&
    !Array.isArray(deps.classification.parameters)
      ? deps.classification.parameters
      : {};

  return respondLoyaltyCompilerDispatch(res, result, {

    locale: deps.locale,

    safeJson: deps.safeJson,

    tool: String(deps.classification?.tool ?? 'setup_loyalty_program').trim(),

    actorId: deps.actorId ?? null,

    lockedParams: loyaltyParams,

  });

}



export { shouldUseMultiAgentCompiler };


