/**
 * Canonical create-store attachment/card context resolver (server).
 * Precedence: current message → session workflow / conversation stash → mission artifact → none.
 *
 * Does not perform OCR — only hydrates refs for BusinessCardUnderstandingProvider / preflight.
 */

import { peekIntakeWorkflowContext } from './intakeWorkflowContext.js';

/**
 * @typedef {'current_message' | 'conversation_recent' | 'mission_artifact' | 'none'} AttachmentSource
 */

/**
 * @typedef {object} CreateStoreAttachmentContext
 * @property {string | null} attachmentId
 * @property {string | null} evidenceId
 * @property {string | null} mediaUrlOrRef
 * @property {string | null} ocrText
 * @property {Record<string, unknown> | null} cardExtraction
 * @property {Record<string, unknown> | null} storeCandidate
 * @property {Record<string, unknown> | null} documentExtraction
 * @property {'ready' | 'ocr_pending' | 'extraction_empty' | 'attachment_missing' | 'consumed'} extractionStatus
 * @property {AttachmentSource} attachmentSource
 * @property {string | null} sourceTurnId
 * @property {string | null} fallbackReason
 */

/**
 * @param {object} [input]
 * @param {string | null} [input.conversationId]
 * @param {string | null} [input.missionId]
 * @param {string | null} [input.sessionKey]
 * @param {string | null} [input.currentImageDataUrl]
 * @param {unknown[]} [input.currentAttachments]
 * @param {Record<string, unknown> | null} [input.intentSourceContext]
 * @param {Record<string, unknown> | null} [input.missionArtifacts]
 * @returns {CreateStoreAttachmentContext}
 */
export function resolveCreateStoreAttachmentContext(input = {}) {
  const empty = (fallbackReason, extractionStatus = 'attachment_missing') => ({
    attachmentId: null,
    evidenceId: null,
    mediaUrlOrRef: null,
    ocrText: null,
    cardExtraction: null,
    storeCandidate: null,
    documentExtraction: null,
    extractionStatus,
    attachmentSource: 'none',
    sourceTurnId: null,
    fallbackReason,
  });

  const isc =
    input.intentSourceContext && typeof input.intentSourceContext === 'object'
      ? input.intentSourceContext
      : {};

  const currentFromAtts = Array.isArray(input.currentAttachments)
    ? input.currentAttachments
        .map((a) => {
          if (!a || typeof a !== 'object') return '';
          return String(a.dataUrl ?? a.uri ?? a.url ?? '').trim();
        })
        .find((u) => u.length > 20)
    : '';
  const currentUrl =
    (typeof input.currentImageDataUrl === 'string' && input.currentImageDataUrl.trim().length > 20
      ? input.currentImageDataUrl.trim()
      : '') ||
    (typeof isc.pendingImageDataUrl === 'string' && isc.pendingImageDataUrl.trim().length > 20
      ? isc.pendingImageDataUrl.trim()
      : '') ||
    (typeof isc.imageDataUrl === 'string' && isc.imageDataUrl.trim().length > 20
      ? isc.imageDataUrl.trim()
      : '') ||
    currentFromAtts ||
    '';

  const cardFromIsc =
    isc.cardExtraction && typeof isc.cardExtraction === 'object' ? isc.cardExtraction : null;
  const candidateFromIsc =
    isc.storeCandidate && typeof isc.storeCandidate === 'object' ? isc.storeCandidate : null;
  const docFromIsc =
    isc.documentExtraction && typeof isc.documentExtraction === 'object'
      ? isc.documentExtraction
      : null;

  if (currentUrl) {
    const hasIdentity = Boolean(cardFromIsc?.businessName || candidateFromIsc || docFromIsc);
    return {
      attachmentId: typeof isc.attachmentId === 'string' ? isc.attachmentId : null,
      evidenceId: typeof isc.evidenceId === 'string' ? isc.evidenceId : null,
      mediaUrlOrRef: currentUrl,
      ocrText: typeof isc.ocrText === 'string' ? isc.ocrText : null,
      cardExtraction: cardFromIsc,
      storeCandidate: candidateFromIsc,
      documentExtraction: docFromIsc,
      extractionStatus: hasIdentity ? 'ready' : 'ocr_pending',
      attachmentSource: 'current_message',
      sourceTurnId: typeof isc.sourceMessageId === 'string' ? isc.sourceMessageId : null,
      fallbackReason: null,
    };
  }

  const sessionKey = String(input.sessionKey || input.conversationId || '').trim();
  if (sessionKey) {
    try {
      const wf = peekIntakeWorkflowContext(sessionKey);
      const uploaded =
        wf?.uploadedAsset && typeof wf.uploadedAsset === 'object' ? wf.uploadedAsset : null;
      if (uploaded) {
        const media =
          typeof uploaded.imageDataUrl === 'string' && uploaded.imageDataUrl.trim().length > 20
            ? uploaded.imageDataUrl.trim()
            : null;
        const card = cardFromIsc;
        const candidate =
          candidateFromIsc ||
          (uploaded.storeCandidate && typeof uploaded.storeCandidate === 'object'
            ? uploaded.storeCandidate
            : null);
        const doc =
          docFromIsc ||
          (uploaded.documentExtraction && typeof uploaded.documentExtraction === 'object'
            ? uploaded.documentExtraction
            : null);
        const hasIdentity = Boolean(card?.businessName || candidate || doc || uploaded.rawOcrText);
        if (media || hasIdentity) {
          return {
            attachmentId: typeof isc.attachmentId === 'string' ? isc.attachmentId : null,
            evidenceId: typeof isc.evidenceId === 'string' ? isc.evidenceId : null,
            mediaUrlOrRef: media,
            ocrText: typeof uploaded.rawOcrText === 'string' ? uploaded.rawOcrText : null,
            cardExtraction: card,
            storeCandidate: candidate,
            documentExtraction: doc,
            extractionStatus: hasIdentity ? 'ready' : media ? 'ocr_pending' : 'extraction_empty',
            attachmentSource: 'conversation_recent',
            sourceTurnId: null,
            fallbackReason: hasIdentity || media ? null : 'CARD_EXTRACTION_EMPTY',
          };
        }
      }
    } catch {
      /* ignore */
    }
  }

  const artifact =
    input.missionArtifacts && typeof input.missionArtifacts === 'object'
      ? input.missionArtifacts
      : null;
  if (
    artifact &&
    (artifact.imageDataUrl ||
      artifact.attachmentId ||
      artifact.cardExtraction ||
      artifact.storeCandidate ||
      artifact.documentExtraction)
  ) {
    const media =
      typeof artifact.imageDataUrl === 'string' && artifact.imageDataUrl.trim().length > 20
        ? artifact.imageDataUrl.trim()
        : null;
    const hasIdentity = Boolean(
      artifact.cardExtraction?.businessName || artifact.storeCandidate || artifact.documentExtraction,
    );
    return {
      attachmentId: artifact.attachmentId ?? null,
      evidenceId: artifact.evidenceId ?? null,
      mediaUrlOrRef: media,
      ocrText: typeof artifact.ocrText === 'string' ? artifact.ocrText : null,
      cardExtraction: artifact.cardExtraction ?? null,
      storeCandidate: artifact.storeCandidate ?? null,
      documentExtraction: artifact.documentExtraction ?? null,
      extractionStatus: hasIdentity ? 'ready' : media ? 'ocr_pending' : 'extraction_empty',
      attachmentSource: 'mission_artifact',
      sourceTurnId: artifact.sourceTurnId ?? null,
      fallbackReason: hasIdentity ? null : 'CARD_EXTRACTION_EMPTY',
    };
  }

  // Identity-only ISC (client OCR) without pixels — still usable for preflight.
  if (cardFromIsc?.businessName || candidateFromIsc || docFromIsc) {
    return {
      attachmentId: typeof isc.attachmentId === 'string' ? isc.attachmentId : null,
      evidenceId: typeof isc.evidenceId === 'string' ? isc.evidenceId : null,
      mediaUrlOrRef: null,
      ocrText: typeof isc.ocrText === 'string' ? isc.ocrText : null,
      cardExtraction: cardFromIsc,
      storeCandidate: candidateFromIsc,
      documentExtraction: docFromIsc,
      extractionStatus: 'ready',
      attachmentSource: 'conversation_recent',
      sourceTurnId: typeof isc.sourceMessageId === 'string' ? isc.sourceMessageId : null,
      fallbackReason: null,
    };
  }

  return empty('CARD_ATTACHMENT_NOT_RESOLVED', 'attachment_missing');
}

/**
 * @param {CreateStoreAttachmentContext} ctx
 * @param {object} [extra]
 */
export function emitCreateStoreCardContextResolved(ctx, extra = {}) {
  try {
    console.info('[performer.create_store_card_context_resolved]', {
      event: 'performer.create_store_card_context_resolved',
      conversationId: extra.conversationId ?? null,
      missionId: extra.missionId ?? null,
      attachmentId: ctx.attachmentId,
      sourceTurnId: ctx.sourceTurnId,
      attachmentSource: ctx.attachmentSource,
      ocrStatus: extra.ocrStatus ?? ctx.extractionStatus,
      extractedFields: extra.extractedFields ?? [],
      missingFields: extra.missingFields ?? [],
      preflightStatus: extra.preflightStatus ?? null,
      fallbackReason: ctx.fallbackReason,
      hasMediaRef: Boolean(ctx.mediaUrlOrRef),
      hasCardName: Boolean(ctx.cardExtraction?.businessName),
    });
  } catch {
    /* ignore */
  }
}

/**
 * @param {string} code
 * @param {object} [extra]
 */
export function emitCreateStoreCardContextFailed(code, extra = {}) {
  try {
    console.warn('[performer.create_store_card_context_failed]', {
      event: 'performer.create_store_card_context_failed',
      code: String(code || 'CARD_ATTACHMENT_NOT_RESOLVED'),
      conversationId: extra.conversationId ?? null,
      missionId: extra.missionId ?? null,
      attachmentSource: extra.attachmentSource ?? 'none',
    });
  } catch {
    /* ignore */
  }
}
