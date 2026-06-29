/**
 * Single source of truth for upload intake phase (Rule 1 Ask vs Rule 2 extract+draft).
 * Replaces scattered overrides in performerIntakeV2Routes.js.
 */

import {
  buildAssetIntentDetectionClassification,
  buildAnalyzeUploadedAssetForStoreCreationClassification,
} from './assetIntentIngestService.js';
import {
  detectCreateStoreFromUploadedAssetIntent,
  detectExplicitStoreIntent,
  hasUploadAttachmentEvidence,
  isAttachmentOnlyPlaceholderMessage,
  isUploadWithoutClearUserIntent,
  shouldRouteToAssetIntentDetection,
} from './assetUploadGuard.js';
import { peekPendingDocumentExtraction } from './storeCandidate.js';

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
 * Full attachment guard context (body + handoff + session stash).
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

/**
 * Rule 1: upload-only / ambiguous message → Ask panel (not create_store).
 * @param {string} message
 * @param {object} ctx
 */
export function isUploadOnlyAskTurn(message, ctx = {}) {
  return shouldRouteToAssetIntentDetection(message, ctx);
}

/**
 * Hard override: never leave attachment-only uploads on create_store / proactive_plan.
 * @param {object} opts
 */
export function enforceUploadAskIntentClassification(opts = {}) {
  const {
    userMessage,
    classification,
    body,
    intentSourceContext,
    uploadAttachmentGuardCtx,
    storeId,
    resolveImageRef,
    reason = 'enforce_upload_ask_intent',
  } = opts;

  if (!isUploadOnlyAskTurn(userMessage, uploadAttachmentGuardCtx)) {
    return { classification, intentSourceContext, applied: false };
  }
  if (String(classification?.tool ?? '').trim() === 'ingest_asset_for_intent_detection') {
    return { classification, intentSourceContext, applied: false };
  }

  const handoffImage = String(
    uploadAttachmentGuardCtx?.imageDataUrl ??
      intentSourceContext?.pendingImageDataUrl ??
      '',
  ).trim();
  if (handoffImage.length > 50 && typeof resolveImageRef === 'function' && !resolveImageRef(body)) {
    injectUploadImageIntoBody(body, handoffImage);
  }

  const nextIntentSourceContext = clearStaleAssetAction(intentSourceContext, userMessage);
  return {
    classification: {
      ...buildAssetIntentDetectionClassification(userMessage, {
        attachments: body?.attachments,
        imageDataUrl:
          (typeof resolveImageRef === 'function' ? resolveImageRef(body) : null) ?? handoffImage ?? null,
        storeId: storeId ?? null,
        source:
          body?.intentSource ??
          (nextIntentSourceContext && typeof nextIntentSourceContext === 'object'
            ? nextIntentSourceContext.source
            : null) ??
          'performer_composer',
        currentEntry: 'performer',
      }),
      _classificationOverride: reason,
    },
    intentSourceContext: nextIntentSourceContext,
    applied: true,
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
 * Strip stale assetAction on placeholder-only turns (e.g. "(Image attached)").
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

/**
 * Explicit create-store from upload — never on placeholder-only messages.
 * @param {string} message
 * @param {Record<string, unknown> | null | undefined} intentSourceContext
 */
export function isExplicitCreateFromUpload(message, intentSourceContext) {
  const msg = String(message ?? '').trim();
  if (isAttachmentOnlyPlaceholderMessage(msg)) return false;
  if (detectCreateStoreFromUploadedAssetIntent(msg)) return true;
  if (detectExplicitStoreIntent(msg)) return true;
  const isc =
    intentSourceContext && typeof intentSourceContext === 'object' ? intentSourceContext : null;
  if (String(isc?.assetAction ?? '').trim() === 'create_store') return true;
  if (String(isc?.fromAskSelection ?? '').trim() === 'create_store') return true;
  return false;
}

/**
 * @param {object} opts
 * @returns {{ phase: string }}
 */
export function resolveUploadIntakePhase(opts = {}) {
  const ctx = buildUploadRoutingCtx(opts);
  const userMessage = String(opts.userMessage ?? '').trim();

  if (!hasUploadAttachmentEvidence(ctx)) {
    return { phase: UPLOAD_INTAKE_PHASE.NONE };
  }

  if (isUploadWithoutClearUserIntent(userMessage, ctx)) {
    return { phase: UPLOAD_INTAKE_PHASE.ASK_INTENT };
  }

  if (isExplicitCreateFromUpload(userMessage, opts.intentSourceContext)) {
    return { phase: UPLOAD_INTAKE_PHASE.EXTRACT_AND_DRAFT };
  }

  return { phase: UPLOAD_INTAKE_PHASE.ASK_INTENT };
}

/**
 * Inject handoff image into body when missing (follow-up create-store turns).
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

/**
 * Apply phase → classification + intentSourceContext (single gate).
 * @param {object} opts
 */
export function applyUploadPhaseRouting(opts = {}) {
  const {
    phase,
    userMessage,
    classification,
    body,
    intentSourceContext,
    uploadedAssetRoutingCtx,
    storeId,
    resolveImageRef,
  } = opts;

  let nextClassification = classification;
  let nextIntentSourceContext =
    intentSourceContext && typeof intentSourceContext === 'object' ? { ...intentSourceContext } : {};

  if (phase === UPLOAD_INTAKE_PHASE.NONE) {
    return {
      classification: nextClassification,
      intentSourceContext: Object.keys(nextIntentSourceContext).length ? nextIntentSourceContext : null,
      skipCreateStoreEarlyDraft: false,
    };
  }

  const handoffImage = String(uploadedAssetRoutingCtx?.imageDataUrl ?? '').trim();
  if (handoffImage.length > 50 && typeof resolveImageRef === 'function' && !resolveImageRef(body)) {
    injectUploadImageIntoBody(body, handoffImage);
  }

  if (phase === UPLOAD_INTAKE_PHASE.ASK_INTENT) {
    delete nextIntentSourceContext.assetAction;
    nextClassification = {
      ...buildAssetIntentDetectionClassification(userMessage, {
        attachments: body?.attachments,
        imageDataUrl:
          (typeof resolveImageRef === 'function' ? resolveImageRef(body) : null) ?? handoffImage ?? null,
        storeId: storeId ?? null,
        source: body?.intentSource ?? nextIntentSourceContext?.source ?? 'performer_composer',
        currentEntry: 'performer',
      }),
      _classificationOverride: 'upload_intake_phase_ask_intent',
    };
    if (handoffImage) nextIntentSourceContext.pendingImageDataUrl = handoffImage;
    return {
      classification: nextClassification,
      intentSourceContext: nextIntentSourceContext,
      skipCreateStoreEarlyDraft: true,
    };
  }

  if (phase === UPLOAD_INTAKE_PHASE.EXTRACT_AND_DRAFT) {
    nextClassification = {
      ...buildAnalyzeUploadedAssetForStoreCreationClassification(userMessage, {
        attachments: body?.attachments,
        imageDataUrl:
          (typeof resolveImageRef === 'function' ? resolveImageRef(body) : null) ?? handoffImage ?? null,
        source: 'uploaded_asset_store_creation',
        currentEntry: 'performer',
      }),
      _classificationOverride: 'upload_intake_phase_extract_and_draft',
    };
    nextIntentSourceContext.assetAction = 'create_store';
    if (handoffImage) nextIntentSourceContext.pendingImageDataUrl = handoffImage;
    return {
      classification: nextClassification,
      intentSourceContext: nextIntentSourceContext,
      skipCreateStoreEarlyDraft: true,
    };
  }

  return {
    classification: nextClassification,
    intentSourceContext: Object.keys(nextIntentSourceContext).length ? nextIntentSourceContext : null,
    skipCreateStoreEarlyDraft: false,
  };
}
