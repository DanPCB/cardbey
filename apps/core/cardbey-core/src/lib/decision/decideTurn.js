/**
 * Canonical decision loop — sole authority when INTAKE_DECISION_LOOP_AUTHORITY is on (Phase 3).
 */

import { runAllAdvisors } from './advisors/index.js';
import { rankHypotheses, isAmbiguousRank } from './rankHypotheses.js';
import { resolveToolForIntent } from './intentToolMap.js';
import { getDecisionThresholds } from './decisionThresholds.js';
import { evaluateToolGovernance } from './governancePolicy.js';
import { buildUploadGoalOptions, buildDisambiguationOptions } from './presentOptions.js';
import { getToolEntry } from '../intake/intakeToolRegistry.js';
import {
  detectExplicitStoreIntent,
  hasExplicitUploadCreateStoreOrWebsiteIntent,
  isAttachmentOnlyPlaceholderMessage,
} from '../intake/assetUploadGuard.js';

/** @typedef {import('./hypothesisUtils.js').Hypothesis} Hypothesis */

/**
 * @typedef {'execute' | 'clarify' | 'present_options' | 'continue_workflow' | 'checkpoint' | 'guide_auth' | 'chat' | 'defer'} NextStep
 */

/**
 * @typedef {object} TurnResult
 * @property {import('./constants.js').BeliefSnapshot} belief
 * @property {import('./rankHypotheses.js').RankedHypothesis[]} hypotheses
 * @property {import('./rankHypotheses.js').RankedHypothesis | null} chosen
 * @property {NextStep} nextStep
 * @property {{ name: string; parameters: Record<string, unknown> } | null} tool
 * @property {string[]} missing
 * @property {{ requiresConfirmation: boolean; confirmationState: string; proposedAction: string | null }} governance
 * @property {string} rationale
 * @property {Array<{ id: string; label: string; tool?: string; parameters?: Record<string, unknown> }>} [options]
 * @property {Record<string, unknown>} [beliefDelta]
 */

/**
 * @param {import('./rankHypotheses.js').RankedHypothesis | null} chosen
 * @param {import('./constants.js').BeliefSnapshot} belief
 * @param {import('./advisorTypes.js').AdvisorInput} input
 */
function buildRationale(chosen, belief, input) {
  if (!chosen) return 'I need a bit more context to proceed.';
  const fact = chosen.evidence?.[0]?.fact;
  if (chosen.intent === 'create_store_from_upload' && belief.lastUpload?.businessName) {
    return `Creating a store draft from your upload (${belief.lastUpload.businessName}).`;
  }
  if (chosen.intent === 'analyze_asset' && belief.lastUpload) {
    return 'Your upload needs a goal — here are the most likely next steps.';
  }
  if (fact) return `Based on ${fact.replace(/_/g, ' ')}, I'll proceed with ${chosen.intent.replace(/_/g, ' ')}.`;
  return `Proceeding with ${chosen.intent.replace(/_/g, ' ')}.`;
}

/**
 * @param {import('./advisorTypes.js').AdvisorInput} input
 */
function userWantsExplicitCreate(input) {
  const msg = String(input.originalUserMessage ?? input.userMessage ?? '').trim();
  return hasExplicitUploadCreateStoreOrWebsiteIntent(msg) || detectExplicitStoreIntent(msg);
}

/**
 * @param {import('./advisorTypes.js').AdvisorInput} input
 */
function isUploadAskTurn(belief, input) {
  const msg = String(input.originalUserMessage ?? input.userMessage ?? '').trim();
  const explicitCreate = userWantsExplicitCreate(input);
  if (explicitCreate) return false;
  const hasUploadEvidence =
    Boolean(belief.lastUpload?.imageRef) ||
    Boolean(input.hasAttachment && input.imageDataUrl) ||
    Boolean(input.hasAttachment && isAttachmentOnlyPlaceholderMessage(msg));
  if (!hasUploadEvidence) return false;
  return (
    isAttachmentOnlyPlaceholderMessage(msg) ||
    belief.pendingClarify?.type === 'upload_goal' ||
    belief.workflow?.status === 'pending_confirmation' ||
    input.hasAttachment === true
  );
}

function beliefForUploadPanel(belief, input) {
  if (belief.lastUpload?.imageRef) return belief;
  const imageRef = input.imageDataUrl ?? null;
  if (!imageRef) return belief;
  return {
    ...belief,
    lastUpload: {
      imageRef,
      ocrText: belief.lastUpload?.ocrText ?? null,
      documentType: belief.lastUpload?.documentType ?? 'business_card',
      businessName: belief.lastUpload?.businessName ?? null,
      sessionKey: belief.sessionKey,
      at: belief.lastUpload?.at ?? new Date().toISOString(),
    },
  };
}

/**
 * @param {import('./constants.js').BeliefSnapshot} belief
 * @param {import('./advisorTypes.js').AdvisorInput} input
 * @param {Hypothesis[] | null} [hypotheses]
 * @returns {TurnResult}
 */
export function decideTurn(belief, input, hypotheses = null) {
  const { tLow, tMargin } = getDecisionThresholds();
  const raw = hypotheses ?? runAllAdvisors(belief, input);
  const { ranked, top } = rankHypotheses(raw, belief);
  const second = ranked[1] ?? null;
  const chosen = top;
  const explicitCreate = userWantsExplicitCreate(input);

  const base = {
    belief,
    hypotheses: ranked,
    chosen,
    missing: [],
    governance: {
      requiresConfirmation: false,
      confirmationState: 'not_required',
      proposedAction: null,
    },
    beliefDelta: {},
  };

  // Active mission continuation (non-forced text)
  if (
    belief.anchors.missionId &&
    chosen?.intent === 'continue_workflow' &&
    (chosen.score ?? 0) >= 0.65
  ) {
    return {
      ...base,
      nextStep: 'continue_workflow',
      tool: { name: 'general_chat', parameters: { missionId: belief.anchors.missionId, command: 'continue' } },
      rationale: 'Continuing your active mission.',
    };
  }

  // Upload awaiting goal — prefer present_options unless explicit create
  const panelBeliefEarly = beliefForUploadPanel(belief, input);
  const uploadAwaiting = isUploadAskTurn(panelBeliefEarly, input);

  if (uploadAwaiting) {
    const panelBelief = panelBeliefEarly;
    const panel = buildUploadGoalOptions(panelBelief);
    return {
      ...base,
      nextStep: 'present_options',
      tool: {
        name: 'ingest_asset_for_intent_detection',
        parameters: {
          imageDataUrl: belief.lastUpload?.imageRef ?? input.imageDataUrl ?? null,
          userPrompt: String(input.originalUserMessage ?? input.userMessage ?? '').trim() || null,
          source: 'decision_loop_upload_ask',
        },
      },
      options: panel.options,
      rationale: panel.question,
      beliefDelta: {
        sessionKey: belief.sessionKey,
        pendingClarify: { type: 'upload_goal', question: panel.question, options: panel.options },
      },
    };
  }

  if (!chosen || chosen.score < tLow) {
    const panelBelief = beliefForUploadPanel(belief, input);
    const panel =
      isUploadAskTurn(belief, input) || panelBelief.lastUpload?.imageRef
        ? buildUploadGoalOptions(panelBelief)
        : null;
    return {
      ...base,
      nextStep: panel ? 'present_options' : 'clarify',
      tool: panel
        ? { name: 'ingest_asset_for_intent_detection', parameters: {} }
        : { name: 'general_chat', parameters: {} },
      options: panel?.options,
      rationale: panel?.question ?? 'Could you clarify what you would like to do?',
    };
  }

  if (
    second &&
    isAmbiguousRank(ranked, tMargin) &&
    !explicitCreate &&
    (top?.score ?? 0) < 0.9
  ) {
    const options = buildDisambiguationOptions(ranked, 3);
    return {
      ...base,
      nextStep: 'present_options',
      tool: {
        name: resolveToolForIntent(chosen.intent, chosen.suggestedTool),
        parameters: {},
      },
      options,
      rationale: 'I see a few possible paths — which one matches your goal?',
    };
  }

  const toolName = resolveToolForIntent(chosen.intent, chosen.suggestedTool);
  const toolEntry = getToolEntry(toolName);
  const governance = evaluateToolGovernance(toolName);

  /** @type {Record<string, unknown>} */
  const parameters = {
    ...(belief.anchors.storeId ? { storeId: belief.anchors.storeId } : {}),
    ...(belief.anchors.draftId ? { draftId: belief.anchors.draftId } : {}),
  };

  if (chosen.intent === 'create_store_from_upload' || chosen.intent === 'create_store') {
    parameters.source =
      chosen.intent === 'create_store_from_upload' ? 'uploaded_asset_store_creation' : 'decision_loop';
    if (belief.lastUpload?.businessName) parameters.storeName = belief.lastUpload.businessName;
    if (belief.lastUpload?.imageRef) parameters.imageDataUrl = belief.lastUpload.imageRef;
    parameters._autoSubmit = false;
  }

  if (toolName === 'ingest_asset_for_intent_detection') {
    parameters.imageDataUrl = belief.lastUpload?.imageRef ?? input.imageDataUrl ?? null;
    parameters.userPrompt = String(input.originalUserMessage ?? input.userMessage ?? '').trim() || null;
    parameters.source = 'decision_loop';
  }

  if (toolEntry?.requiresStore && !belief.anchors.storeId && !belief.anchors.draftId) {
    if (chosen.intent !== 'create_store' && chosen.intent !== 'create_store_from_upload') {
      return {
        ...base,
        nextStep: 'clarify',
        tool: { name: toolName, parameters },
        missing: ['store'],
        rationale: 'Which store should this apply to?',
      };
    }
  }

  if (belief.identity.guest && toolEntry?.riskLevel === 'state_change' && chosen.intent === 'create_campaign') {
    return {
      ...base,
      nextStep: 'guide_auth',
      tool: { name: toolName, parameters },
      rationale: 'Sign in to launch a campaign.',
    };
  }

  if (governance.requiresConfirmation) {
    parameters._autoSubmit = false;
    return {
      ...base,
      nextStep: 'checkpoint',
      tool: { name: toolName, parameters },
      governance,
      rationale: buildRationale(chosen, belief, input),
    };
  }

  if (governance.requiresConfirmation === false && toolName === 'create_store') {
    parameters._autoSubmit = false;
  }

  return {
    ...base,
    nextStep: 'execute',
    tool: { name: toolName, parameters },
    governance,
    rationale: buildRationale(chosen, belief, input),
    beliefDelta:
      chosen.intent === 'create_store_from_upload' && belief.lastUpload
        ? {
            sessionKey: belief.sessionKey,
            activeGoal: { intent: chosen.intent, confidence: chosen.score },
          }
        : {},
  };
}
