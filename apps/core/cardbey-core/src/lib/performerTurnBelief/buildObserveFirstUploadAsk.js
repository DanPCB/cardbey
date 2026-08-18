/**
 * Observe-first upload Ask — TurnBelief before runway chips/forms.
 *
 * @module performerTurnBelief/buildObserveFirstUploadAsk
 */

import { buildTurnBeliefFromIntake } from './buildTurnBeliefFromIntake.js';
import { hasHardConflict, patchTurnBelief } from './turnBelief.js';
import { PERFORMER_STATUS } from './performerStatus.js';
import { projectPerformerStatus, performerStatusResponseFields } from './projectPerformerStatus.js';
import { buildUploadAttachmentActionContext } from '../decision/presentOptions.js';
import { isRegisteredTool } from '../intake/intakeToolRegistry.js';

/**
 * @param {unknown} attachmentAnalysis
 * @returns {string}
 */
export function extractOcrTextFromAttachmentAnalysis(attachmentAnalysis) {
  if (!attachmentAnalysis || typeof attachmentAnalysis !== 'object') return '';
  const aa = /** @type {Record<string, unknown>} */ (attachmentAnalysis);
  for (const key of ['ocrText', 'rawOcrText', 'extractedText', 'text']) {
    const v = aa[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}

/**
 * @param {import('../decision/constants.js').BeliefSnapshot | null | undefined} decisionBelief
 * @param {Record<string, unknown>} [extra]
 */
function stampParams(decisionBelief, extra = {}) {
  const base = buildUploadAttachmentActionContext(decisionBelief ?? null);
  // Keep base.source = upload_ask_selection so dashboard Create-store chip
  // posts "Create store from uploaded card" (not replaying "(Image attached)").
  // Do not stamp non-schema keys (e.g. observeFirstAsk) — they become unknown_field
  // and force a second "need more detail" clarify after Create store.
  return {
    ...base,
    ...extra,
    source: 'upload_ask_selection',
  };
}

/**
 * Belief-grounded intent options (no storeCreationDraft).
 * @param {import('./turnBelief.js').TurnBelief} turnBelief
 * @param {import('../decision/constants.js').BeliefSnapshot | null | undefined} decisionBelief
 */
export function buildObserveFirstIntentOptions(turnBelief, decisionBelief = null) {
  const name = String(turnBelief.identity?.name ?? '').trim();
  const conflict = hasHardConflict(turnBelief);

  /** @type {Array<{ label: string; tool: string; parameters: Record<string, unknown> }>} */
  const raw = [];

  if (conflict) {
    raw.push({
      label: name ? `Use upload identity (${name})` : 'Use upload identity',
      tool: 'create_store',
      parameters: stampParams(decisionBelief, {
        intent: 'create_store',
        type: 'CREATE_STORE_FROM_UPLOAD',
        resolveConflict: 'use_evidence',
        fromAskSelection: 'create_store',
      }),
    });
    raw.push({
      label: 'Keep prior goal name',
      tool: 'create_store',
      parameters: stampParams(decisionBelief, {
        intent: 'create_store',
        type: 'CREATE_STORE_FROM_UPLOAD',
        resolveConflict: 'use_goal',
        fromAskSelection: 'create_store',
      }),
    });
  } else if (name) {
    const locationFact = Array.isArray(turnBelief.nonOfferingFacts)
      ? turnBelief.nonOfferingFacts.find(
          (f) => f && typeof f === 'object' && String(f.kind ?? '').toUpperCase() === 'LOCATION',
        )
      : null;
    const locationText =
      locationFact && typeof locationFact.text === 'string' ? locationFact.text.trim() : '';
    raw.push({
      label: `Create store for ${name}`,
      tool: 'create_store',
      parameters: stampParams(decisionBelief, {
        intent: 'create_store',
        type: 'CREATE_STORE_FROM_UPLOAD',
        fromAskSelection: 'create_store',
        storeName: name,
        ...(locationText ? { location: locationText } : {}),
      }),
    });
  } else {
    raw.push({
      label: 'Create a store (I will ask for details)',
      tool: 'create_store',
      parameters: stampParams(decisionBelief, {
        intent: 'create_store',
        type: 'CREATE_STORE_FROM_UPLOAD',
        fromAskSelection: 'create_store',
      }),
    });
  }

  raw.push({
    label: 'Import catalog / menu',
    tool: 'replace_store_catalog',
    parameters: stampParams(decisionBelief, { intent: 'import_catalog' }),
  });
  raw.push({
    label: 'Analyze this upload only',
    tool: 'ingest_asset_for_intent_detection',
    parameters: stampParams(decisionBelief, { intent: 'analyze_document' }),
  });
  raw.push({
    label: 'Something else',
    tool: 'general_chat',
    parameters: { source: 'observe_first_other_intent' },
  });

  return raw.filter((o) => o.label && o.tool && isRegisteredTool(o.tool));
}

/**
 * Plain-language observe sentence from TurnBelief.
 * @param {import('./turnBelief.js').TurnBelief} turnBelief
 */
export function buildObserveFirstQuestion(turnBelief) {
  const name = String(turnBelief.identity?.name ?? '').trim();
  if (hasHardConflict(turnBelief)) {
    return (
      turnBelief.userVisibleSummary ||
      turnBelief.missingQuestions?.[0] ||
      `I read "${name}" from this upload, but it conflicts with your prior goal. What should I do?`
    );
  }
  if (name) {
    return `I read "${name}" from your upload. What do you want to do with it?`;
  }
  return (
    turnBelief.userVisibleSummary ||
    'I received your upload but could not yet read a clear business name. What do you want to do with it?'
  );
}

/**
 * When upload identity is known, ask intent (READY_TO_PROPOSE) — do not open a form yet.
 * @param {import('./turnBelief.js').TurnBelief} belief
 */
function ensureObserveAskStatus(belief) {
  if (hasHardConflict(belief)) return belief;
  const name = String(belief.identity?.name ?? '').trim();
  if (!name) return belief;
  if (belief.status === PERFORMER_STATUS.READY_TO_PROPOSE) return belief;
  return patchTurnBelief(belief, {
    status: PERFORMER_STATUS.READY_TO_PROPOSE,
    userVisibleSummary:
      belief.userVisibleSummary ||
      `I read "${name}" from your upload. Tell me what you want to do before I start a runway.`,
    gaps: [],
    missingQuestions: [],
    confidence: Math.max(Number(belief.confidence) || 0, 0.6),
  });
}

/**
 * Build Observe-first Ask payload (TurnBelief bound; no runway form).
 *
 * @param {{
 *   goal?: string | null;
 *   stickyGoalName?: string | null;
 *   ocrText?: string | null;
 *   attachmentAnalysis?: unknown;
 *   imageDataUrl?: string | null;
 *   missionId?: string | null;
 *   decisionLoopBelief?: import('../decision/constants.js').BeliefSnapshot | null;
 * }} input
 */
export function buildObserveFirstUploadAskPayload(input = {}) {
  const ocrText =
    String(input.ocrText ?? '').trim() ||
    extractOcrTextFromAttachmentAnalysis(input.attachmentAnalysis);

  // Upload Ask must never inherit a prior turn's sticky business name.
  // Identity comes from this-turn OCR only.
  let turnBelief = buildTurnBeliefFromIntake({
    goal: '',
    businessName: undefined,
    missionId: input.missionId ?? null,
    ocrText: ocrText || null,
    attachmentAnalysis: input.attachmentAnalysis ?? null,
  });

  turnBelief = ensureObserveAskStatus(turnBelief);

  const statusProjection = projectPerformerStatus(turnBelief);
  const question = buildObserveFirstQuestion(turnBelief);
  const options = buildObserveFirstIntentOptions(turnBelief, input.decisionLoopBelief ?? null);

  return {
    success: true,
    action: 'clarify',
    clarifyType: 'observe_first_upload',
    executionPath: 'observe_first_upload_ask',
    response: question,
    message: question,
    ...performerStatusResponseFields(statusProjection),
    turnBelief,
    options,
    storeCreationDraft: null,
    pendingIntent: {
      tool: 'ingest_asset_for_intent_detection',
      lockedIntent: null,
      turnBeliefId: turnBelief.turnBeliefId,
      turnBelief,
      observeFirst: true,
    },
  };
}

export default {
  extractOcrTextFromAttachmentAnalysis,
  buildObserveFirstIntentOptions,
  buildObserveFirstQuestion,
  buildObserveFirstUploadAskPayload,
};
