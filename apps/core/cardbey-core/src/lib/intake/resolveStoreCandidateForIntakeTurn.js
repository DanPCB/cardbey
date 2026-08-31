/**
 * Unified StoreCandidate + assetExtraction resolution for one upload intake turn.
 */

import { buildAssetIngestFromCardExtraction } from './attachmentOcrPersistence.js';
import {
  buildAssetExtractionInput,
  enrichAssetExtractionWithUploadOcr,
  hasMeaningfulAssetExtraction,
  mergeAssetExtraction,
} from './storeCreationDraftAssetBridge.js';
import {
  mergeStoreCandidates,
  resolveStoreCandidateForHandoff,
  storeCandidateToAssetExtraction,
} from './storeCandidate.js';

/**
 * @param {object} opts
 * @returns {Promise<{ storeCandidate: import('./storeCandidate.js').StoreCandidate | null, assetExtraction: Record<string, unknown> | null }>}
 */
export async function resolveStoreCandidateForIntakeTurn(opts = {}) {
  const intentSourceContext =
    opts.intentSourceContext && typeof opts.intentSourceContext === 'object'
      ? opts.intentSourceContext
      : null;
  const persistedIngest = opts.persistedIngest ?? null;
  const ingestResult = opts.ingestResult ?? null;
  const effectiveIngest = ingestResult?.ok !== false ? ingestResult : persistedIngest;

  const currentImageDataUrl =
    typeof opts.imageDataUrl === 'string' && opts.imageDataUrl.trim() ? opts.imageDataUrl.trim() : null;

  let storeCandidate = resolveStoreCandidateForHandoff({
    intentSourceContext: {
      ...(intentSourceContext ?? {}),
      ...(effectiveIngest ? { assetIngestResult: effectiveIngest } : {}),
    },
    metadataJson: opts.metadataJson ?? null,
    sessionId: opts.sessionId ?? null,
    persistedIngest,
    currentImageDataUrl,
  });

  if (
    (!storeCandidate || !hasMeaningfulAssetExtraction(storeCandidateToAssetExtraction(storeCandidate))) &&
    intentSourceContext?.cardExtraction &&
    typeof intentSourceContext.cardExtraction === 'object'
  ) {
    const fromClientCard = buildAssetIngestFromCardExtraction(intentSourceContext.cardExtraction);
    if (fromClientCard) {
      const fromCardCandidate = resolveStoreCandidateForHandoff({
        intentSourceContext: { assetIngestResult: fromClientCard },
        sessionId: opts.sessionId ?? null,
        currentImageDataUrl,
      });
      storeCandidate = mergeStoreCandidates(storeCandidate, fromCardCandidate);
    }
  }

  let assetExtraction = buildAssetExtractionInput({
    ingestResult: effectiveIngest,
    imageContext: opts.imageContext ?? null,
    userMessage: opts.userMessage ?? '',
    intentSourceContext,
    persistedIngestResult: persistedIngest,
    storeCandidate,
  });

  assetExtraction = await enrichAssetExtractionWithUploadOcr(assetExtraction, {
    imageDataUrl: opts.imageDataUrl ?? null,
    rawOcrText:
      opts.imageContext?.extractedText ??
      storeCandidate?.rawOcrText ??
      effectiveIngest?.rawOcrText ??
      null,
    imageContext: opts.imageContext ?? null,
    ocrExtractFn: opts.ocrExtractFn ?? null,
  });

  if (storeCandidate) {
    assetExtraction = mergeAssetExtraction(
      storeCandidateToAssetExtraction(storeCandidate),
      assetExtraction,
    );
  }

  return { storeCandidate, assetExtraction };
}
