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

  if (ctx.forcedTool || ctx.freshStoreMission || ctx.draftConfirmationSubmit || ctx.storeCreateFormPayload) {
    return { handled: false };
  }

  if (ctx.performerMode === 'manual') {
    return { handled: false };
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

  const belief = await loadBeliefForIntake(pipelineInput);
  if (!belief) {
    return { handled: false };
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
