/**
 * Upload intake utilities — phase routing removed; decision loop is sole authority.
 * Kept: image handoff helpers used by belief loader and routes.
 */

import { peekPendingDocumentExtraction } from './storeCandidate.js';
import {
  isAttachmentOnlyPlaceholderMessage,
  shouldRouteToAssetIntentDetection,
} from './assetUploadGuard.js';

export const UPLOAD_INTAKE_PHASE = {
  NONE: 'none',
  ASK_INTENT: 'ask_intent',
  EXTRACT_AND_DRAFT: 'extract_and_draft',
};

/**
 * @param {object} [opts]
 * @returns {Record<string, unknown>}
 */
export function buildUploadRoutingCtx(opts = {}) {
  return {
    userMessage: opts.userMessage,
    attachments: opts.attachments,
    imageDataUrl: opts.imageDataUrl,
    intentSourceContext: opts.intentSourceContext,
    sessionId: opts.sessionId,
    hasSessionPendingExtraction: opts.hasSessionPendingExtraction,
  };
}

/**
 * @param {object} opts
 */
export function buildUploadAttachmentGuardCtx(opts = {}) {
  const sessionId = String(opts.sessionId ?? '').trim() || null;
  const hasSessionPendingExtraction =
    opts.hasSessionPendingExtraction === true ||
    Boolean(sessionId && peekPendingDocumentExtraction(sessionId));
  return {
    attachments: opts.attachments,
    imageDataUrl: opts.imageDataUrl ?? null,
    intentSourceContext: opts.intentSourceContext ?? null,
    sessionId,
    hasSessionPendingExtraction,
  };
}

export function isUploadOnlyAskTurn(message, ctx = {}) {
  return shouldRouteToAssetIntentDetection(message, ctx);
}

/** @deprecated Removed — decision loop is sole authority */
export function enforceUploadAskIntentClassification(opts = {}) {
  return {
    classification: opts.classification,
    intentSourceContext: opts.intentSourceContext,
    applied: false,
  };
}

/**
 * @param {object} payload
 */
export function logUploadIntakePhaseIfDev(isDev, payload) {
  if (!isDev) return;
  console.log('[UPLOAD PHASE]', payload);
}

/**
 * @param {Record<string, unknown> | null | undefined} intentSourceContext
 * @param {string} userMessage
 */
export function clearStaleAssetAction(intentSourceContext, userMessage) {
  const base =
    intentSourceContext && typeof intentSourceContext === 'object' && !Array.isArray(intentSourceContext)
      ? { ...intentSourceContext }
      : {};
  if (!isAttachmentOnlyPlaceholderMessage(userMessage)) return base;
  delete base.assetAction;
  if (!base.uploadedAssetPending) base.uploadedAssetPending = true;
  return base;
}

/** @deprecated Decision loop handles explicit create detection */
export function isExplicitCreateFromUpload(message, intentSourceContext) {
  void message;
  void intentSourceContext;
  return false;
}

/** @deprecated Phase routing removed — always none */
export function resolveUploadIntakePhase(opts = {}) {
  void opts;
  return { phase: UPLOAD_INTAKE_PHASE.NONE };
}

/**
 * @param {Record<string, unknown>} body
 * @param {string | null | undefined} imageDataUrl
 */
export function injectUploadImageIntoBody(body, imageDataUrl) {
  const handoffImage = String(imageDataUrl ?? '').trim();
  if (handoffImage.length < 50) return;
  if (!body || typeof body !== 'object') return;
  if (String(body.imageDataUrl ?? '').trim()) return;
  body.imageDataUrl = handoffImage;
  if (!Array.isArray(body.attachments) || body.attachments.length === 0) {
    body.attachments = [{ type: 'image', dataUrl: handoffImage, uri: handoffImage }];
  }
}

/** @deprecated Phase routing removed — pass-through */
export function applyUploadPhaseRouting(opts = {}) {
  const intentSourceContext =
    opts.intentSourceContext && typeof opts.intentSourceContext === 'object'
      ? { ...opts.intentSourceContext }
      : null;
  return {
    classification: opts.classification,
    intentSourceContext,
    skipCreateStoreEarlyDraft: false,
  };
}
