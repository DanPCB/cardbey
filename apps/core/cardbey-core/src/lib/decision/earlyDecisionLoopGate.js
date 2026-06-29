/**
 * Early decision-loop gate — runs before create_store early returns (upload ask).
 */

import { isIntakeDecisionLoopAuthorityEnabled } from './constants.js';
import { loadBelief } from './beliefLoader.js';
import { hydrateBeliefForDecisionLoop } from './hydrateBeliefForDecisionLoop.js';
import { runDecisionLoopAuthority } from './runDecisionLoopAuthority.js';
import { isExplicitCreateStoreFromUploadContext } from '../intake/assetUploadGuard.js';
import { buildIntakeResponse, buildUploadAskResponseFromBelief } from '../response/responseBuilder.js';

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
  const explicitCreateFromUpload = isExplicitCreateStoreFromUploadContext({
    userMessage: advisorInput.originalUserMessage ?? advisorInput.userMessage,
    intentSourceContext: advisorInput.intentSourceContext,
  });

  const shouldConsider =
    opts.attachmentOnlyUpload === true ||
    explicitCreateFromUpload ||
    opts.intentSourceContext?.uploadedAssetPending === true ||
    (opts.hasImageAttachment === true && opts.classification?.tool === 'create_store') ||
    (opts.hasImageAttachment === true && opts.attachmentOnlyUpload !== false);

  if (!shouldConsider) return null;

  let belief = opts.belief ?? null;
  if (opts.beliefLoaderOpts) {
    try {
      belief = await loadBelief(opts.beliefLoaderOpts);
    } catch {
      belief = opts.belief ?? null;
    }
  }

  belief = hydrateBeliefForDecisionLoop(belief, {
    imageDataUrl: opts.imageDataUrl ?? null,
    extractedText: opts.extractedText ?? null,
    attachmentOnlyUpload: opts.attachmentOnlyUpload === true,
    hasAttachment: opts.hasImageAttachment === true,
  });

  if (!belief?.lastUpload?.imageRef && !opts.hasImageAttachment) return null;

  const authorityOut = await runDecisionLoopAuthority({
    belief,
    input: advisorInput,
    legacyClassification: opts.classification ?? null,
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
    (opts.attachmentOnlyUpload === true &&
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
