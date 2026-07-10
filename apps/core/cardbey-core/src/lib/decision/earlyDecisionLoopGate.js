/**
 * Early decision-loop gate — runs before create_store early returns (upload ask).
 */

import { isIntakeDecisionLoopAuthorityEnabled } from './constants.js';
import { loadBelief } from './beliefLoader.js';
import { hydrateBeliefForDecisionLoop } from './hydrateBeliefForDecisionLoop.js';
import { isExplicitCreateStoreFromUploadContext, isExplicitLoyaltyFromUploadContext } from '../intake/assetUploadGuard.js';
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
  if (
    isExplicitLoyaltyFromUploadContext({
      userMessage,
      intentSourceContext: opts.intentSourceContext ?? advisorInput.intentSourceContext,
      attachmentAnalysis: opts.attachmentAnalysis ?? null,
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
export async function tryEarlyDecisionLoopGate(_opts = {}) {
  return null;
}

/**
 * @param {Record<string, unknown> | null | undefined} classification
 */
export function shouldSkipCreateStoreEarlyDraftForDecisionLoop(_classification) {
  return false;
}

/**
 * @param {Record<string, unknown> | null | undefined} classification
 */
export function shouldSkipPlannersForDecisionLoop(_classification) {
  return false;
}
