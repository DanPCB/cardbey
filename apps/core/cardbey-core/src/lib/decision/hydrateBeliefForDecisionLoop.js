/**
 * Patch belief snapshot with live attachment/OCR when workflow stash lags (turn 1 upload).
 */

import { buildOcrHintsFromImageText } from '../intake/storeCreationDraftAssetBridge.js';

function strip(value) {
  return String(value ?? '').trim() || null;
}

/**
 * @param {import('./constants.js').BeliefSnapshot | null} belief
 * @param {object} [input]
 * @param {string | null} [input.imageDataUrl]
 * @param {string | null} [input.extractedText]
 * @param {boolean} [input.attachmentOnlyUpload]
 * @param {boolean} [input.hasAttachment]
 * @param {string | null} [input.sessionKey]
 * @returns {import('./constants.js').BeliefSnapshot | null}
 */
/**
 * Minimal belief row when loader has not run yet but the turn carries an attachment.
 * @param {object} [input]
 * @returns {import('./constants.js').BeliefSnapshot}
 */
export function createEphemeralBeliefForUpload(input = {}) {
  const sessionKey = strip(input.sessionKey) ?? 'upload-turn';
  return {
    sessionId: sessionKey,
    sessionKey,
    identity: { guest: false, actorId: null, userId: null },
    anchors: { storeId: null, draftId: null, missionId: null },
    workflow: null,
    lastUpload: null,
    activeGoal: null,
    pendingClarify: null,
    blockers: [],
    sourcesLoaded: ['ephemeral_upload'],
    divergences: [],
    loadedAt: new Date().toISOString(),
    loaderVersion: '1.0.0',
  };
}

export function hydrateBeliefForDecisionLoop(belief, input = {}) {
  const imageRef = strip(input.imageDataUrl) ?? belief?.lastUpload?.imageRef ?? null;
  const hasAttachment = input.hasAttachment === true || Boolean(imageRef);

  if (!belief) {
    if (!hasAttachment) return null;
    belief = createEphemeralBeliefForUpload({ sessionKey: input.sessionKey });
  }

  const imageRefResolved = imageRef;
  const ocrText = strip(input.extractedText) ?? belief.lastUpload?.ocrText ?? null;
  const attachmentOnly = input.attachmentOnlyUpload === true;

  if (!hasAttachment && !belief.lastUpload) return belief;

  const hints = ocrText ? buildOcrHintsFromImageText(ocrText) : null;
  const businessName =
    belief.lastUpload?.businessName ??
    strip(hints?.businessName) ??
    strip(hints?.detectedBusinessName) ??
    null;

  /** @type {import('./constants.js').BeliefLastUpload} */
  const lastUpload = {
    imageRef: imageRefResolved,
    ocrText,
    documentType: belief.lastUpload?.documentType ?? (ocrText ? 'business_card' : null),
    businessName,
    sessionKey: belief.sessionKey,
    at: belief.lastUpload?.at ?? new Date().toISOString(),
  };

  let pendingClarify = belief.pendingClarify;
  let workflow = belief.workflow;

  if (attachmentOnly && imageRef) {
    pendingClarify = {
      type: 'upload_goal',
      question: pendingClarify?.question ?? 'What would you like to do with this upload?',
      options: pendingClarify?.options ?? [
        { id: 'create_store' },
        { id: 'import_catalog' },
        { id: 'analyze_document' },
      ],
    };
    if (!workflow || workflow.status !== 'pending_confirmation') {
      workflow = {
        type: 'upload_intake',
        status: 'pending_confirmation',
        source: 'decision_loop_hydrate',
      };
    }
  }

  return {
    ...belief,
    lastUpload,
    pendingClarify,
    workflow,
  };
}
