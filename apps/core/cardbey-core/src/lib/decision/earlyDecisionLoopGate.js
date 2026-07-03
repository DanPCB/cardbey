/**
 * Early decision-loop gate — runs before create_store early returns (upload ask).
 */

import { isIntakeDecisionLoopAuthorityEnabled } from './constants.js';
import { loadBelief } from './beliefLoader.js';
import { hydrateBeliefForDecisionLoop } from './hydrateBeliefForDecisionLoop.js';
import { runDecisionLoopAuthority } from './runDecisionLoopAuthority.js';
import { isExplicitCreateStoreFromUploadContext } from '../intake/assetUploadGuard.js';
import { UPLOAD_INTAKE_PHASE } from '../intake/uploadIntakePhase.js';
import { buildIntakeResponse, buildUploadAskResponseFromBelief } from '../response/responseBuilder.js';
import { activeGoalSupersedesUploadClarify } from './uploadBeliefContext.js';
import {
  conversationAwaitingIntakeConfirm,
  isIntakeConfirmAffirmation,
} from '../intake/intakeConfirmIntercept.js';
import { isCasualChatTurn } from '../intake/intakeCasualChatTurn.js';
import { clearStaleUploadBeliefContext, persistBeliefDelta } from './persistBeliefDelta.js';

const UPLOAD_ASK_SELECTION_TOOLS = new Set([
  'create_store',
  'replace_store_catalog',
  'ingest_asset_for_intent_detection',
]);

function strip(value) {
  return String(value ?? '').trim() || null;
}

/**
 * @param {object} opts
 */
function hasRelevantUploadAttachment(opts = {}) {
  const intentSourceContext = opts.intentSourceContext ?? opts.advisorInput?.intentSourceContext ?? {};
  return (
    opts.hasImageAttachment === true ||
    opts.attachmentOnlyUpload === true ||
    Boolean(String(opts.imageDataUrl ?? intentSourceContext.pendingImageDataUrl ?? '').trim())
  );
}

/**
 * @param {object} opts
 */
function isUploadAskSelectionResolved(opts = {}) {
  const intentSourceContext = opts.intentSourceContext ?? opts.advisorInput?.intentSourceContext ?? {};
  if (strip(intentSourceContext.fromAskSelection)) return true;
  const selected = opts.intakeV2Selection ?? opts.advisorInput?.intakeV2Selection;
  const tool = strip(selected?.selectedTool ?? selected?.tool);
  return Boolean(tool && UPLOAD_ASK_SELECTION_TOOLS.has(tool));
}

/**
 * @param {import('./constants.js').BeliefSnapshot | null | undefined} belief
 * @param {object} opts
 */
function hasUnrelatedPendingPlan(belief, opts = {}) {
  if (opts.hasActivePendingCheckpoint === true) return true;
  if (activeGoalSupersedesUploadClarify(belief?.activeGoal) && belief?.pendingClarify == null) {
    return true;
  }

  const intentSourceContext = opts.intentSourceContext ?? opts.advisorInput?.intentSourceContext ?? {};
  const contextGoal = strip(intentSourceContext.activeGoal ?? intentSourceContext.chosenTool);
  if (contextGoal && activeGoalSupersedesUploadClarify({ intent: contextGoal })) {
    return true;
  }

  const msg = strip(
    opts.advisorInput?.originalUserMessage ?? opts.advisorInput?.userMessage ?? opts.userMessage,
  );
  const history = opts.conversationHistory ?? opts.history ?? opts.advisorInput?.history;
  if (isIntakeConfirmAffirmation(msg) && conversationAwaitingIntakeConfirm(history)) {
    return true;
  }

  return false;
}

/**
 * @param {import('./constants.js').BeliefSnapshot | null | undefined} belief
 * @param {object} opts
 */
async function maybeClearSupersededUploadContext(belief, opts = {}) {
  const sessionKey = belief?.sessionKey ?? opts.beliefLoaderOpts?.sessionKey ?? null;
  if (!sessionKey) return;

  const msg = strip(
    opts.advisorInput?.originalUserMessage ?? opts.advisorInput?.userMessage ?? opts.userMessage,
  );
  if (isCasualChatTurn(msg) && (belief?.lastUpload || belief?.pendingClarify?.type === 'upload_goal')) {
    await clearStaleUploadBeliefContext(sessionKey);
    return;
  }

  if (isUploadAskSelectionResolved(opts)) {
    await persistBeliefDelta({
      sessionKey,
      clearUploadContext: true,
      uploadAskHandled: true,
      pendingClarify: null,
      clearPendingClarify: true,
    });
    return;
  }

  if (hasUnrelatedPendingPlan(belief, opts)) {
    await clearStaleUploadBeliefContext(sessionKey, {
      activeGoal: belief?.activeGoal?.intent ?? null,
    });
  }
}

/**
 * @param {object} opts
 * @param {import('./constants.js').BeliefSnapshot | null | undefined} belief
 */
function resolveIntentSourceContextForUploadGate(opts = {}, belief = null) {
  const base =
    opts.intentSourceContext && typeof opts.intentSourceContext === 'object'
      ? { ...opts.intentSourceContext }
      : opts.advisorInput?.intentSourceContext && typeof opts.advisorInput.intentSourceContext === 'object'
        ? { ...opts.advisorInput.intentSourceContext }
        : null;
  if (!base || base.uploadedAssetPending !== true) return base;
  if (hasUnrelatedPendingPlan(belief, opts) || isUploadAskSelectionResolved(opts)) {
    return { ...base, uploadedAssetPending: false };
  }
  if (!hasRelevantUploadAttachment(opts)) {
    return { ...base, uploadedAssetPending: false };
  }
  return base;
}

/**
 * Rule 1 — attachment-only / ask-intent phase must show upload Ask panel (not generic clarify).
 * @param {object} opts
 */
export function shouldRequireUploadAskPanel(opts = {}) {
  const advisorInput = opts.advisorInput ?? {};
  const userMessage = advisorInput.originalUserMessage ?? advisorInput.userMessage ?? opts.userMessage;
  if (isIntakeConfirmAffirmation(userMessage)) return false;
  if (isCasualChatTurn(userMessage)) return false;
  if (hasUnrelatedPendingPlan(opts.belief ?? null, opts)) return false;
  if (
    isExplicitCreateStoreFromUploadContext({
      userMessage,
      intentSourceContext: opts.intentSourceContext ?? advisorInput.intentSourceContext,
    })
  ) {
    return false;
  }
  const intentSourceContext = resolveIntentSourceContextForUploadGate(opts, opts.belief ?? null);
  return (
    opts.attachmentOnlyUpload === true ||
    opts.uploadIntakePhase === UPLOAD_INTAKE_PHASE.ASK_INTENT ||
    (intentSourceContext?.uploadedAssetPending === true && hasRelevantUploadAttachment(opts))
  );
}

/**
 * Rule 1 Ask panel — HTTP payload (works with or without authority flag).
 * @param {import('./constants.js').BeliefSnapshot} belief
 */
export function buildUploadAskClarifyFromBelief(belief) {
  return buildUploadAskResponseFromBelief(belief);
}

/**
 * @param {object} opts
 * @returns {Promise<import('./constants.js').BeliefSnapshot | null>}
 */
export async function loadHydratedBeliefForUploadDecision(opts = {}) {
  let belief = opts.belief ?? null;
  if (opts.beliefLoaderOpts) {
    try {
      belief = await loadBelief(opts.beliefLoaderOpts);
    } catch {
      belief = opts.belief ?? null;
    }
  }
  return hydrateBeliefForDecisionLoop(belief, {
    imageDataUrl: opts.imageDataUrl ?? null,
    extractedText: opts.extractedText ?? null,
    attachmentOnlyUpload: opts.attachmentOnlyUpload === true,
    hasAttachment: opts.hasImageAttachment === true,
    sessionKey: opts.beliefLoaderOpts?.sessionKey ?? opts.belief?.sessionKey ?? null,
  });
}

/**
 * @param {object} opts
 * @returns {Promise<{
 *   payload: Record<string, unknown>;
 *   classification: Record<string, unknown>;
 * } | null>}
 */
export async function buildUploadAskClarifyFallback(opts = {}) {
  const userMessage =
    opts.advisorInput?.originalUserMessage ??
    opts.advisorInput?.userMessage ??
    opts.userMessage ??
    '';
  if (isCasualChatTurn(userMessage) || isIntakeConfirmAffirmation(userMessage)) return null;

  const belief = await loadHydratedBeliefForUploadDecision(opts);
  if (!belief?.lastUpload?.imageRef && !opts.hasImageAttachment) return null;

  const payload = buildUploadAskClarifyFromBelief(belief);
  return {
    payload,
    classification: {
      executionPath: 'clarify',
      tool: 'ingest_asset_for_intent_detection',
      confidence: 0.9,
      parameters: {
        imageDataUrl: belief.lastUpload?.imageRef ?? opts.imageDataUrl ?? null,
        source: 'upload_ask_rule1_fallback',
      },
      message: payload.response,
      clarifyOptions: payload.options ?? [],
      _uploadAskSource: 'rule1_fallback',
    },
  };
}

/**
 * @param {object} opts
 * @returns {boolean}
 */
export function shouldForceUploadAskPanel(opts = {}) {
  if (isExplicitCreateStoreFromUploadContext({
    userMessage: opts.userMessage,
    intentSourceContext: opts.intentSourceContext,
  })) {
    return false;
  }
  return opts.attachmentOnlyUpload === true;
}

/**
 * @param {import('./decideTurn.js').TurnResult} turnResult
 * @param {Record<string, unknown>} classification
 * @param {import('./constants.js').BeliefSnapshot | null} [belief]
 */
export function buildClarifyPayloadFromTurnResult(turnResult, classification, belief = null) {
  return buildIntakeResponse(turnResult, belief);
}

/**
 * @param {object} opts
 * @returns {Promise<{
 *   classification: Record<string, unknown> | null;
 *   clarifyPayload: Record<string, unknown> | null;
 *   summary: Record<string, unknown> | null;
 *   skipPlanners: boolean;
 * } | null>}
 */
export async function tryEarlyDecisionLoopGate(opts = {}) {
  if (!isIntakeDecisionLoopAuthorityEnabled()) return null;
  if (opts.freshStoreMission || opts.forcedTool || opts.manualMode) return null;
  if (opts.draftConfirmationSubmit || opts.storeCreateFormPayload) return null;

  const advisorInput = opts.advisorInput ?? {};
  const userMessage = advisorInput.originalUserMessage ?? advisorInput.userMessage ?? opts.userMessage;
  if (isIntakeConfirmAffirmation(userMessage)) {
    return null;
  }
  if (isCasualChatTurn(userMessage)) {
    return null;
  }

  let beliefForGate = opts.belief ?? null;
  if (opts.beliefLoaderOpts) {
    try {
      beliefForGate = await loadBelief(opts.beliefLoaderOpts);
    } catch {
      beliefForGate = opts.belief ?? null;
    }
  }

  await maybeClearSupersededUploadContext(beliefForGate, opts);

  if (hasUnrelatedPendingPlan(beliefForGate, opts)) {
    return null;
  }

  const intentSourceContext = resolveIntentSourceContextForUploadGate(opts, beliefForGate);
  const gateOpts = { ...opts, intentSourceContext };

  const explicitCreateFromUpload = isExplicitCreateStoreFromUploadContext({
    userMessage,
    intentSourceContext,
  });

  const shouldConsider =
    gateOpts.attachmentOnlyUpload === true ||
    explicitCreateFromUpload ||
    (intentSourceContext?.uploadedAssetPending === true && hasRelevantUploadAttachment(gateOpts)) ||
    (gateOpts.hasImageAttachment === true && gateOpts.classification?.tool === 'create_store') ||
    (gateOpts.hasImageAttachment === true && gateOpts.attachmentOnlyUpload !== false);

  if (!shouldConsider) return null;

  // Rule 1 hard gate: attachment-only uploads always get the upload Ask panel — never generic clarify.
  if (shouldRequireUploadAskPanel({ ...gateOpts, belief: beliefForGate })) {
    const beliefForAsk = await loadHydratedBeliefForUploadDecision({
      ...gateOpts,
      belief: beliefForGate,
      sessionKey: gateOpts.beliefLoaderOpts?.sessionKey ?? beliefForGate?.sessionKey ?? null,
    });
    const hasImage =
      Boolean(beliefForAsk?.lastUpload?.imageRef) ||
      gateOpts.hasImageAttachment === true ||
      Boolean(String(gateOpts.imageDataUrl ?? '').trim());
    if (hasImage) {
      const payload = buildUploadAskClarifyFromBelief(beliefForAsk);
      return {
        classification: {
          executionPath: 'clarify',
          tool: 'ingest_asset_for_intent_detection',
          confidence: 0.9,
          parameters: {
            imageDataUrl: beliefForAsk?.lastUpload?.imageRef ?? gateOpts.imageDataUrl ?? null,
            source: 'upload_ask_rule1_early_gate',
          },
          message: payload.response,
          clarifyOptions: payload.options ?? [],
          _decisionLoop: true,
          _decisionNextStep: 'present_options',
          _uploadAskSource: 'rule1_early_gate',
        },
        clarifyPayload: payload,
        summary: { event: 'upload_ask_rule1_early_gate', attachmentOnlyUpload: true },
        skipPlanners: false,
      };
    }
  }

  let belief = beliefForGate;
  if (!belief && gateOpts.beliefLoaderOpts) {
    try {
      belief = await loadBelief(gateOpts.beliefLoaderOpts);
    } catch {
      belief = gateOpts.belief ?? null;
    }
  }

  belief = hydrateBeliefForDecisionLoop(belief, {
    imageDataUrl: gateOpts.imageDataUrl ?? null,
    extractedText: gateOpts.extractedText ?? null,
    attachmentOnlyUpload: gateOpts.attachmentOnlyUpload === true,
    hasAttachment: gateOpts.hasImageAttachment === true,
    sessionKey: gateOpts.beliefLoaderOpts?.sessionKey ?? belief?.sessionKey ?? null,
  });

  if (!belief?.lastUpload?.imageRef && !gateOpts.hasImageAttachment) return null;

  const authorityOut = await runDecisionLoopAuthority({
    belief,
    input: advisorInput,
    legacyClassification: gateOpts.classification ?? null,
  });

  if (!authorityOut.classification) return null;

  const turnResult = authorityOut.turnResult;
  const skipPlanners =
    turnResult?.nextStep === 'execute' &&
    (turnResult.tool?.name === 'create_store' || turnResult.chosen?.intent === 'create_store_from_upload');

  if (!turnResult) {
    return {
      classification: authorityOut.classification,
      clarifyPayload: null,
      summary: authorityOut.summary,
      skipPlanners: false,
    };
  }

  const wantsUploadAskPanel =
    turnResult.nextStep === 'present_options' ||
    (gateOpts.attachmentOnlyUpload === true &&
      (turnResult.nextStep === 'clarify' || turnResult.nextStep === 'present_options'));

  if (wantsUploadAskPanel) {
    return {
      classification: authorityOut.classification,
      clarifyPayload: buildClarifyPayloadFromTurnResult(
        turnResult,
        authorityOut.classification,
        belief,
      ),
      summary: authorityOut.summary,
      skipPlanners: false,
    };
  }

  return {
    classification: authorityOut.classification,
    clarifyPayload: null,
    summary: authorityOut.summary,
    skipPlanners,
  };
}

/**
 * @param {Record<string, unknown> | null | undefined} classification
 */
export function shouldSkipCreateStoreEarlyDraftForDecisionLoop(classification) {
  if (!isIntakeDecisionLoopAuthorityEnabled() || !classification?._decisionLoop) return false;
  const tool = String(classification.tool ?? '').trim();
  if (tool === 'ingest_asset_for_intent_detection') return true;
  if (classification.executionPath === 'clarify' && classification._decisionNextStep === 'present_options') {
    return true;
  }
  return false;
}

/**
 * @param {Record<string, unknown> | null | undefined} classification
 */
export function shouldSkipPlannersForDecisionLoop(classification) {
  if (!isIntakeDecisionLoopAuthorityEnabled() || !classification?._decisionLoop) return false;
  const next = String(classification._decisionNextStep ?? '').trim();
  const tool = String(classification.tool ?? '').trim();
  if (next === 'present_options') return true;
  if (next === 'execute' && tool === 'create_store') return true;
  if (next === 'checkpoint' && tool === 'create_store') return true;
  return false;
}
