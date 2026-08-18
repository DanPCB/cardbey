/**
 * Guard frozen evidence replay — do not reuse a prior evidence bundle when the client
 * attached a different image (prevents stale topology / seed template on fresh upload).
 */

import { hashAttachmentContent } from './attachmentAnalysisCache.js';
import { getCachedAnalysisForImageRef } from './attachmentEvidenceRegistry.js';
import {
  detectCreateStoreFromUploadedAssetIntent,
  isExplicitCreateStoreFromUploadContext,
} from './assetUploadGuard.js';

function pickString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

/**
 * @param {string | null | undefined} a
 * @param {string | null | undefined} b
 */
export function attachmentImageRefsMatch(a, b) {
  const left = pickString(a);
  const right = pickString(b);
  if (!left || !right) return false;
  const leftHash = hashAttachmentContent(left);
  const rightHash = hashAttachmentContent(right);
  return Boolean(leftHash && rightHash && leftHash === rightHash);
}

/**
 * @param {{
 *   bundle?: { imageRef?: string | null } | null;
 *   currentImageRef?: string | null;
 *   hasFreshImageAttachment?: boolean;
 *   hasLastUpload?: boolean;
 *   userMessage?: string | null;
 *   intentSourceContext?: Record<string, unknown> | null;
 *   refuseTextOnlyReplay?: boolean;
 * }} input
 */
function isUploadCreateWithoutCurrentImage(input = {}) {
  if (pickString(input.currentImageRef)) return false;
  const isc =
    input.intentSourceContext && typeof input.intentSourceContext === 'object'
      ? input.intentSourceContext
      : null;
  if (String(isc?.fromAskSelection ?? '').trim() === 'create_store') return true;
  if (String(isc?.assetAction ?? '').trim() === 'create_store') return true;
  if (String(isc?.type ?? '').trim() === 'CREATE_STORE_FROM_UPLOAD') return true;
  return (
    input.refuseTextOnlyReplay === true ||
    detectCreateStoreFromUploadedAssetIntent(input.userMessage) ||
    isExplicitCreateStoreFromUploadContext({
      userMessage: input.userMessage,
      intentSourceContext: input.intentSourceContext,
    })
  );
}

/**
 * @param {{
 *   bundle?: { imageRef?: string | null } | null;
 *   currentImageRef?: string | null;
 *   hasFreshImageAttachment?: boolean;
 *   hasLastUpload?: boolean;
 *   userMessage?: string | null;
 *   intentSourceContext?: Record<string, unknown> | null;
 *   refuseTextOnlyReplay?: boolean;
 * }} input
 */
export function shouldReuseFrozenEvidenceBundle(input = {}) {
  const bundle = input.bundle ?? null;
  if (!bundle) return false;

  const currentImageRef = pickString(input.currentImageRef);
  const bundleImageRef = pickString(bundle.imageRef);

  // Upload create without pixels on this turn — never reuse prior evidenceId OCR/topology.
  if (isUploadCreateWithoutCurrentImage(input)) return false;
  if (!currentImageRef && input.hasLastUpload === false && input.refuseTextOnlyReplay === true) {
    return false;
  }

  // Text-only chip/confirm without pixels — allow reuse unless caller refused above.
  if (!currentImageRef) return true;

  // Client sent image bytes but bundle has no image ref — force fresh barrier.
  if (!bundleImageRef) return false;

  return attachmentImageRefsMatch(bundleImageRef, currentImageRef);
}

/**
 * Recover attachment analysis from a frozen intake evidence bundle.
 *
 * @param {{ imageRef?: string | null; snapshot?: { ocrText?: string | null }; evidenceView?: { evidenceId?: string } } | null | undefined} bundle
 */
export function hydrateAttachmentAnalysisFromFrozenBundle(bundle) {
  if (!bundle || typeof bundle !== 'object') return null;

  const imageRef = pickString(bundle.imageRef);
  if (imageRef) {
    const cached = getCachedAnalysisForImageRef(imageRef);
    if (cached?.attachmentAnalysis && typeof cached.attachmentAnalysis === 'object') {
      return {
        ...cached.attachmentAnalysis,
        evidenceId: pickString(
          cached.attachmentAnalysis.evidenceId,
          cached.evidenceId,
          bundle.evidenceView?.evidenceId,
        ),
        ocrText: pickString(
          cached.attachmentAnalysis.ocrText,
          cached.ocrTextRef,
          bundle.snapshot?.ocrText,
        ),
      };
    }
  }

  const ocrText = pickString(bundle.snapshot?.ocrText);
  if (!ocrText) return null;

  return {
    artifactType: 'loyalty_card',
    ocrText,
    confidence: 0.55,
    evidenceId: pickString(bundle.evidenceView?.evidenceId) || undefined,
    ocrStatus: 'ok',
  };
}

export default {
  attachmentImageRefsMatch,
  shouldReuseFrozenEvidenceBundle,
  hydrateAttachmentAnalysisFromFrozenBundle,
};
