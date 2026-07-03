/**
 * Single authoritative intake turn — replaces legacy bypass chains.
 */

import { Features } from '../../config/features.js';
import {
  runIntakeDecisionPipeline,
  loadBeliefForIntake,
  decideIntakeTurn,
  buildPipelineResponse,
} from './intakeDecisionPipeline.js';
import { applyGovernanceEnforcer } from '../decision/governanceEnforcer.js';
import { persistBeliefDelta } from '../decision/persistBeliefDelta.js';
import { recordDecisionLoopTurn } from '../decision/decisionLoopHealth.js';
import { getToolEntry, RISK } from './intakeToolRegistry.js';
import {
  shouldRequireUploadAskPanel,
  buildUploadAskClarifyFromBelief,
  loadHydratedBeliefForUploadDecision,
} from '../decision/earlyDecisionLoopGate.js';
import { isCasualChatTurn } from './intakeCasualChatTurn.js';
import { clearStaleUploadBeliefContext } from '../decision/persistBeliefDelta.js';

const DIRECT_RESPONSE_STEPS = new Set([
  'present_options',
  'clarify',
  'guide_auth',
  'checkpoint',
  'chat',
]);

/**
 * @param {object} ctx
 * @returns {Promise<{
 *   handled: boolean;
 *   httpPayload?: Record<string, unknown>;
 *   classification?: Record<string, unknown>;
 *   telExtra?: Record<string, unknown>;
 *   skipPlanners?: boolean;
 * }>}
 */
export async function runIntakeAuthorityTurn(ctx = {}) {
  if (!Features.decisionLoop.enabled) {
    return { handled: false };
  }

  if (ctx.performerMode === 'manual') {
    return { handled: false };
  }

  const intentSourceContext =
    ctx.advisorInput?.intentSourceContext ??
    ctx.beliefLoaderOpts?.intentSourceContext ??
    null;

  if (
    shouldRequireUploadAskPanel({
      attachmentOnlyUpload: ctx.attachmentOnlyUpload === true,
      uploadIntakePhase: ctx.uploadIntakePhase,
      intentSourceContext,
      userMessage: ctx.advisorInput?.userMessage ?? ctx.advisorInput?.originalUserMessage,
      advisorInput: ctx.advisorInput,
    })
  ) {
    const beliefForAsk = await loadHydratedBeliefForUploadDecision({
      belief: ctx.belief ?? null,
      beliefLoaderOpts: ctx.beliefLoaderOpts,
      attachmentOnlyUpload: true,
      hasImageAttachment: ctx.hasAttachment === true,
      imageDataUrl: ctx.imageDataUrl ?? null,
      extractedText: ctx.extractedText ?? null,
    });
    const hasImage =
      Boolean(beliefForAsk?.lastUpload?.imageRef) ||
      ctx.hasAttachment === true ||
      Boolean(String(ctx.imageDataUrl ?? '').trim());
    if (hasImage) {
      const httpPayload = buildUploadAskClarifyFromBelief(beliefForAsk);
      const classification = {
        executionPath: 'clarify',
        tool: 'ingest_asset_for_intent_detection',
        confidence: 0.9,
        parameters: {
          imageDataUrl: beliefForAsk?.lastUpload?.imageRef ?? ctx.imageDataUrl ?? null,
          source: 'upload_ask_authority_turn',
        },
        message: httpPayload.response,
        clarifyOptions: httpPayload.options ?? [],
        _decisionLoop: true,
        _decisionNextStep: 'present_options',
        _uploadAskSource: 'authority_turn',
      };
      const toolEntry = getToolEntry(classification.tool);
      return {
        handled: true,
        httpPayload,
        classification,
        telExtra: {
          classification,
          validated: true,
          downgraded: false,
          downgradeReason: null,
          validationErrors: [],
          riskLevel: toolEntry?.riskLevel ?? RISK.SAFE_READ,
          result: 'clarify',
        },
        skipPlanners: true,
      };
    }
  }

  const pipelineInput = {
    attachmentOnlyUpload: ctx.attachmentOnlyUpload === true,
    hasAttachment: ctx.hasAttachment === true,
    imageDataUrl: ctx.imageDataUrl ?? null,
    extractedText: ctx.extractedText ?? null,
    beliefLoaderOpts: ctx.beliefLoaderOpts,
    advisorInput: ctx.advisorInput,
    belief: ctx.belief ?? null,
  };

  let belief = await loadBeliefForIntake(pipelineInput);
  if (!belief) {
    return { handled: false };
  }

  const casualMsg =
    ctx.advisorInput?.originalUserMessage ?? ctx.advisorInput?.userMessage ?? null;
  if (isCasualChatTurn(casualMsg) && belief.sessionKey) {
    if (belief.lastUpload || belief.pendingClarify?.type === 'upload_goal') {
      await clearStaleUploadBeliefContext(belief.sessionKey);
    }
    belief = {
      ...belief,
      lastUpload: null,
      pendingClarify: null,
      workflow:
        belief.workflow?.status === 'pending_confirmation' ? null : belief.workflow,
    };
  }

  const turnResult = await decideIntakeTurn(belief, pipelineInput);
  const governed = applyGovernanceEnforcer(turnResult, {
    isGuest: belief.identity.guest === true,
    confirmed: ctx.confirmed === true,
  });

  recordDecisionLoopTurn({
    event: 'intake_authority_turn',
    sessionKey: belief.sessionKey,
    nextStep: governed.nextStep,
    tool: governed.tool?.name ?? null,
  });

  if (governed.beliefDelta && Object.keys(governed.beliefDelta).length > 0) {
    await persistBeliefDelta({
      ...governed.beliefDelta,
      userId: belief.identity.userId,
      actorKey: belief.identity.actorId,
      tenantKey: belief.identity.actorId?.startsWith('u:') ? `t:${belief.identity.userId}` : 'unknown',
      storeId: belief.anchors.storeId,
      draftId: belief.anchors.draftId,
      missionId: belief.anchors.missionId,
    });
  }

  const built = buildPipelineResponse(governed, belief);
  const classification = built.classification;
  const httpPayload = built.httpPayload;
  const toolEntry = getToolEntry(classification?.tool);
  const riskLevel = toolEntry?.riskLevel ?? RISK.SAFE_READ;

  const telBase = {
    classification,
    validated: true,
    downgraded: false,
    downgradeReason: null,
    validationErrors: [],
    riskLevel,
  };

  if (DIRECT_RESPONSE_STEPS.has(governed.nextStep)) {
    return {
      handled: true,
      httpPayload,
      classification,
      telExtra: { ...telBase, result: governed.nextStep === 'checkpoint' ? 'proactive_plan' : 'clarify' },
      skipPlanners: true,
    };
  }

  if (governed.nextStep === 'execute' && httpPayload?.action === 'create_store') {
    return {
      handled: true,
      httpPayload,
      classification,
      telExtra: { ...telBase, result: 'success' },
      skipPlanners: true,
    };
  }

  if (governed.nextStep === 'execute') {
    return {
      handled: false,
      classification,
      skipPlanners: true,
    };
  }

  return {
    handled: true,
    httpPayload,
    classification,
    telExtra: { ...telBase, result: 'chat' },
    skipPlanners: true,
  };
}

/**
 * Top-of-handler authority gate — routes every intake turn through the decision loop when enabled.
 * @param {object} ctx
 * @returns {Promise<ReturnType<typeof runIntakeAuthorityTurn>>}
 */
export async function runIntakeAuthorityGateEarly(ctx = {}) {
  if (!Features.decisionLoop.enabled) {
    return { handled: false };
  }

  console.log('[INTAKE] Decision loop authority ON - routing to loop');
  console.log('[INTAKE] Message:', ctx.advisorInput?.userMessage || '(no message)');
  console.log('[INTAKE] Has image:', ctx.hasAttachment === true);

  try {
    const result = await runIntakeAuthorityTurn(ctx);
    if (result.handled && result.httpPayload) {
      console.log('[INTAKE] Loop result:', {
        nextStep: result.classification?._decisionNextStep ?? result.httpPayload?.nextStep ?? null,
        tool: result.classification?.tool ?? result.httpPayload?.action ?? null,
        action: result.httpPayload?.action ?? null,
        hasDraft: Boolean(result.httpPayload?.draft),
      });
    }
    return result;
  } catch (error) {
    console.error('[INTAKE] Decision loop error:', error);
    throw error;
  }
}
