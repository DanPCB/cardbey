/**
 * Single entry point for intake decision-loop turns.
 * Parse → belief → decide → govern → respond (one path, no competing overrides).
 */

import { Features } from '../../config/features.js';
import { loadBelief } from '../decision/beliefLoader.js';
import { hydrateBeliefForDecisionLoop } from '../decision/hydrateBeliefForDecisionLoop.js';
import { decideTurn } from '../decision/decideTurn.js';
import { runAllAdvisors } from '../decision/advisors/index.js';
import { applyGovernanceEnforcer } from '../decision/governanceEnforcer.js';
import { turnResultToClassification } from '../decision/turnResultToClassification.js';
import { buildIntakeResponse } from '../response/responseBuilder.js';
import { recordBeliefLoad, recordDecisionLoopTurn } from '../decision/decisionLoopHealth.js';
import { persistBeliefDelta } from '../decision/persistBeliefDelta.js';

/**
 * @param {import('express').Request} req
 * @returns {Record<string, unknown>}
 */
export function parseIntakeRequest(req) {
  const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
  const userMessage = String(body.message ?? body.userMessage ?? '').trim();
  return {
    req,
    body,
    userMessage,
    originalUserMessage: userMessage,
    attachments: body.attachments,
    imageDataUrl: body.imageDataUrl ?? body.pendingImageDataUrl ?? null,
    hasAttachment: Array.isArray(body.attachments) && body.attachments.length > 0,
    intentSourceContext: body.intentSourceContext ?? null,
    beliefLoaderOpts: null,
    advisorInput: null,
  };
}

/**
 * @param {Record<string, unknown>} input
 * @returns {Promise<import('../decision/constants.js').BeliefSnapshot | null>}
 */
export async function loadBeliefForIntake(input) {
  if (input.belief && typeof input.belief === 'object') {
    recordBeliefLoad();
    return input.belief;
  }

  const opts = input.beliefLoaderOpts;
  if (!opts || typeof opts !== 'object') return null;

  const belief = await loadBelief(opts);
  recordBeliefLoad();

  return hydrateBeliefForDecisionLoop(belief, {
    imageDataUrl: input.imageDataUrl ?? null,
    extractedText: input.extractedText ?? null,
    attachmentOnlyUpload: input.attachmentOnlyUpload === true,
    hasAttachment: input.hasAttachment === true,
  });
}

/**
 * @param {import('../decision/constants.js').BeliefSnapshot} belief
 * @param {Record<string, unknown>} input
 */
export async function decideIntakeTurn(belief, input) {
  const advisorInput = input.advisorInput ?? input;
  const hypotheses = runAllAdvisors(belief, advisorInput);
  return decideTurn(belief, advisorInput, hypotheses);
}

/**
 * @param {import('../decision/decideTurn.js').TurnResult} turnResult
 */
export async function applyGovernance(turnResult, context = {}) {
  return applyGovernanceEnforcer(turnResult, context);
}

/**
 * @param {import('../decision/decideTurn.js').TurnResult} governed
 * @param {import('../decision/constants.js').BeliefSnapshot | null} belief
 */
export function buildPipelineResponse(governed, belief) {
  return {
    httpPayload: buildIntakeResponse(governed, belief),
    classification: turnResultToClassification(governed),
    turnResult: governed,
  };
}

/**
 * Run the full decision pipeline when authority is enabled.
 *
 * @param {Record<string, unknown>} input — must include beliefLoaderOpts + advisorInput when loading belief
 * @returns {Promise<{
 *   skipped: boolean;
 *   belief: import('../decision/constants.js').BeliefSnapshot | null;
 *   turnResult: import('../decision/decideTurn.js').TurnResult | null;
 *   classification: Record<string, unknown> | null;
 *   httpPayload: Record<string, unknown> | null;
 * }>}
 */
export async function runIntakeDecisionPipeline(input = {}) {
  if (!Features.decisionLoop.enabled) {
    return {
      skipped: true,
      belief: null,
      turnResult: null,
      classification: null,
      httpPayload: null,
    };
  }

  const belief = await loadBeliefForIntake(input);
  if (!belief) {
    return {
      skipped: true,
      belief: null,
      turnResult: null,
      classification: null,
      httpPayload: null,
    };
  }

  const turnResult = await decideIntakeTurn(belief, input);
  const governed = await applyGovernance(turnResult);

  recordDecisionLoopTurn({
    event: 'intake_decision_pipeline',
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
  return {
    skipped: false,
    belief,
    turnResult: governed,
    classification: built.classification,
    httpPayload: built.httpPayload,
  };
}

/**
 * @param {Error | unknown} error
 */
export function formatIntakePipelineError(error) {
  const message = error instanceof Error ? error.message : String(error ?? 'unknown');
  return {
    success: false,
    action: 'error',
    response: 'Something went wrong processing your request. Please try again.',
    error: message,
  };
}
