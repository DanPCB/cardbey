/**
 * Patch belief snapshot with live attachment/OCR when workflow stash lags (turn 1 upload).
 */

import { buildOcrHintsFromImageText } from '../intake/storeCreationDraftAssetBridge.js';

function strip(value) {
  return String(value ?? '').trim() || null;
}

/**
 * This-turn OCR (including empty string) replaces stash identity.
 * @param {object} input
 */
function hasLiveExtractedText(input) {
  return typeof input?.extractedText === 'string';
}

/**
 * Cheap type from this read only — not a parallel reasoner.
 * @param {string | null} ocrText
 * @param {Record<string, unknown> | null} hints
 */
function documentTypeFromThisRead(ocrText, hints) {
  const text = String(ocrText ?? '');
  if (/\b(menu|entree|entrée|appetizer|mains?|catalog)\b/i.test(text)) return 'menu';
  if (strip(hints?.businessName) || strip(hints?.detectedBusinessName)) return 'business_card';
  return text ? 'unknown' : null;
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

  const incomingImage = strip(input.imageDataUrl);
  const priorImage = strip(belief?.lastUpload?.imageRef);
  const imageChanged = Boolean(incomingImage && priorImage && incomingImage !== priorImage);
  const liveRead = hasLiveExtractedText(input);
  const replaceStashIdentity = liveRead || imageChanged;

  const imageRefResolved = incomingImage ?? priorImage;
  const ocrText = liveRead
    ? strip(input.extractedText)
    : imageChanged
      ? null
      : belief.lastUpload?.ocrText ?? null;
  const attachmentOnly = input.attachmentOnlyUpload === true;

  if (!hasAttachment && !belief.lastUpload) return belief;

  const hints = ocrText ? buildOcrHintsFromImageText(ocrText) : null;
  const fromThisRead = strip(hints?.businessName) ?? strip(hints?.detectedBusinessName) ?? null;
  const businessName = replaceStashIdentity ? fromThisRead : fromThisRead ?? belief.lastUpload?.businessName ?? null;

  /** @type {import('./constants.js').BeliefLastUpload} */
  const lastUpload = {
    imageRef: imageRefResolved,
    ocrText,
    documentType: replaceStashIdentity
      ? documentTypeFromThisRead(ocrText, hints)
      : belief.lastUpload?.documentType ?? documentTypeFromThisRead(ocrText, hints),
    businessName,
    sessionKey: belief.sessionKey,
    at: imageChanged ? new Date().toISOString() : belief.lastUpload?.at ?? new Date().toISOString(),
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
