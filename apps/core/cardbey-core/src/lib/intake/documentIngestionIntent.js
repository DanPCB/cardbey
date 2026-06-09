// DANH: skill-round6-document
/**
 * Fast-path document ingestion intent — URL paste, attachments, natural language.
 * Runs before LLM classification to avoid token spend on obvious uploads.
 */

import { recoverStoreId } from '../runwayContext.js';

const DOCUMENT_URL_PATTERN = /https?:\/\/\S+\.(jpg|jpeg|png|pdf|webp)/i;

const INGESTION_PHRASES = [
  /ingest (a |this |my )?(business )?(document|flyer|brochure)/i,
  /^ingest_document$/i,
  /here'?s? (our|the|my) flyer/i,
  /scan (this|our|the) (flyer|brochure|document|poster)/i,
  /import (this|from) (flyer|document|image)/i,
  /extract (from|this) (document|image|flyer)/i,
  /uploaded? (a |this )?(flyer|brochure|document)/i,
  /read (this|the) (flyer|document)/i,
];

/**
 * @param {object} [context]
 * @returns {object | null}
 */
function resolveAttachment(context) {
  const attachments = Array.isArray(context?.attachments) ? context.attachments : [];
  const first = attachments[0];
  if (first && typeof first === 'object') {
    if (typeof first.base64 === 'string' && first.base64.trim()) {
      return {
        base64: first.base64.trim(),
        mimeType: typeof first.mimeType === 'string' && first.mimeType.trim() ? first.mimeType.trim() : 'image/jpeg',
      };
    }
    const dataUrl = [first.data, first.dataUrl, first.imageDataUrl, first.uri, first.url].find(
      (x) => typeof x === 'string' && x.trim().length > 0,
    );
    if (dataUrl && String(dataUrl).startsWith('data:')) {
      const m = String(dataUrl).match(/^data:([^;]+);base64,(.+)$/);
      if (m) {
        return { base64: m[2], mimeType: m[1] };
      }
    }
  }

  const imageDataUrl =
    (typeof context?.imageDataUrl === 'string' && context.imageDataUrl.trim()) ||
    (typeof context?.imageUrl === 'string' && context.imageUrl.trim()) ||
    null;
  if (imageDataUrl?.startsWith('data:')) {
    const m = imageDataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (m) {
      return { base64: m[2], mimeType: m[1] };
    }
  }

  return null;
}

/**
 * @param {string} message
 * @param {object} [context]
 * @returns {'ingest_document' | null}
 */
export function detectDocumentIngestionIntent(message, context = {}) {
  const msg = String(message ?? '').trim();
  if (!msg && !(Array.isArray(context?.attachments) && context.attachments.length)) {
    return null;
  }

  if (DOCUMENT_URL_PATTERN.test(msg)) {
    return 'ingest_document';
  }

  if (Array.isArray(context?.attachments) && context.attachments.length > 0) {
    return 'ingest_document';
  }

  if (context?.imageDataUrl || context?.imageUrl) {
    return 'ingest_document';
  }

  if (INGESTION_PHRASES.some((p) => p.test(msg))) {
    return 'ingest_document';
  }

  return null;
}

/**
 * @param {string} message
 * @param {object} [context]
 */
export function extractIngestionInputs(message, context = {}) {
  const attachment = resolveAttachment(context);
  const urlMatch = String(message ?? '').match(DOCUMENT_URL_PATTERN);

  /** Prefer attachment over URL (higher fidelity). */
  const documentUrl = attachment ? null : urlMatch?.[0] ?? null;
  const documentBase64 = attachment?.base64 ?? null;
  const mimeType = attachment?.mimeType ?? 'image/jpeg';

  const imageDataUrl =
    attachment && attachment.base64
      ? `data:${mimeType};base64,${attachment.base64}`
      : documentUrl;

  return {
    documentUrl,
    documentBase64,
    mimeType,
    imageUrl: documentUrl ?? undefined,
    imageDataUrl: imageDataUrl ?? undefined,
    storeId: recoverStoreId(context),
  };
}

/**
 * Build intake classification shape for document ingestion fast path.
 * @param {string} message
 * @param {object} [context]
 */
export function buildDocumentIngestionClassification(message, context = {}) {
  const inputs = extractIngestionInputs(message, context);
  return {
    executionPath: 'direct_action',
    tool: 'ingest_document',
    confidence: 0.95,
    parameters: {
      ...(inputs.storeId ? { storeId: inputs.storeId } : {}),
      ...(inputs.documentUrl ? { documentUrl: inputs.documentUrl, imageUrl: inputs.documentUrl } : {}),
      ...(inputs.documentBase64 ? { documentBase64: inputs.documentBase64 } : {}),
      ...(inputs.mimeType ? { mimeType: inputs.mimeType } : {}),
      ...(inputs.imageDataUrl ? { imageDataUrl: inputs.imageDataUrl } : {}),
    },
    _fastPath: 'document_ingestion',
  };
}
