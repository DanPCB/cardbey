/**
 * Project Core CanonicalUnderstandingBundle → create-store identity fields.
 * Does not invent location/category (OCR / StoreCandidate remain authoritative for those).
 */

/**
 * @param {Record<string, unknown> | null | undefined} bundle
 * @returns {{
 *   businessName: string;
 *   category: string;
 *   location: string;
 *   confidence: number;
 *   artifactType: string;
 * } | null}
 */
export function projectCreateStoreFieldsFromBue(bundle) {
  if (!bundle || typeof bundle !== 'object') return null;
  const brand = bundle.brand && typeof bundle.brand === 'object' ? bundle.brand : null;
  const brandNameGv = brand?.brandName && typeof brand.brandName === 'object' ? brand.brandName : null;
  const businessName = String(brandNameGv?.value ?? '').trim();
  const brandConfRaw = Number(brandNameGv?.confidence);
  const artifact = bundle.artifact && typeof bundle.artifact === 'object' ? bundle.artifact : null;
  const classification =
    artifact?.classification && typeof artifact.classification === 'object'
      ? artifact.classification
      : null;
  const classConfRaw = Number(classification?.confidence);
  const artifactType = String(artifact?.artifactType ?? classification?.artifactType ?? '').trim();

  // BUE does not own address/category for create-store — leave empty for OCR merge.
  const confidenceParts = [];
  if (Number.isFinite(brandConfRaw)) {
    confidenceParts.push(brandConfRaw <= 1 ? brandConfRaw * 100 : brandConfRaw);
  }
  if (Number.isFinite(classConfRaw)) {
    confidenceParts.push(classConfRaw <= 1 ? classConfRaw * 100 : classConfRaw);
  }
  const confidence =
    confidenceParts.length > 0
      ? Math.round(Math.max(...confidenceParts))
      : businessName
        ? 55
        : 0;

  if (!businessName && !artifactType) return null;

  return {
    businessName,
    category: '',
    location: '',
    confidence: Math.max(0, Math.min(100, confidence)),
    artifactType,
  };
}

/**
 * @param {{
 *   attachmentAnalysis?: Record<string, unknown> | null;
 *   imageDataUrl?: string | null;
 *   imageUrl?: string | null;
 *   ocrText?: string | null;
 *   userMessage?: string | null;
 *   storeName?: string | null;
 *   missionId?: string | null;
 *   evidenceId?: string | null;
 *   filename?: string | null;
 *   mimeType?: string | null;
 * }} input
 * @returns {Promise<{
 *   ok: boolean;
 *   reused: boolean;
 *   failed: boolean;
 *   reason?: string;
 *   bundle: Record<string, unknown> | null;
 *   merchantSummary: Record<string, unknown> | null;
 *   projected: ReturnType<typeof projectCreateStoreFieldsFromBue>;
 * }>}
 */
export async function resolveBueForCreateStoreDraft(input = {}) {
  const analysis =
    input.attachmentAnalysis && typeof input.attachmentAnalysis === 'object'
      ? input.attachmentAnalysis
      : null;
  const existing =
    analysis?.businessUnderstanding && typeof analysis.businessUnderstanding === 'object'
      ? analysis.businessUnderstanding
      : null;
  if (existing) {
    return {
      ok: true,
      reused: true,
      failed: false,
      bundle: existing,
      merchantSummary:
        analysis?.merchantUnderstandingSummary &&
        typeof analysis.merchantUnderstandingSummary === 'object'
          ? analysis.merchantUnderstandingSummary
          : null,
      projected: projectCreateStoreFieldsFromBue(existing),
    };
  }

  try {
    const { Features } = await import('../../config/features.js');
    if (!Features.businessUnderstanding?.enabled) {
      return {
        ok: false,
        reused: false,
        failed: false,
        reason: 'BUE_DISABLED',
        bundle: null,
        merchantSummary: null,
        projected: null,
      };
    }
    const { runBusinessUnderstandingPipeline } = await import(
      '../businessUnderstanding/businessUnderstandingPipeline.js'
    );
    const bueResult = await runBusinessUnderstandingPipeline({
      imageUrl: input.imageUrl ?? null,
      imageDataUrl: input.imageDataUrl ?? null,
      filename: input.filename ?? null,
      mimeType: input.mimeType ?? null,
      ocrText: input.ocrText ?? null,
      userMessage: input.userMessage ?? null,
      storeName: input.storeName ?? null,
      missionId: input.missionId ?? null,
      evidenceId: input.evidenceId ?? null,
      priorArtifactType: 'business_card',
      enrichBrandFromVision: Features.businessUnderstanding.brandVision === true,
    });
    if (!bueResult?.ok || !bueResult.bundle) {
      return {
        ok: false,
        reused: false,
        failed: true,
        reason: bueResult?.reason ?? 'BUE_FAILED',
        bundle: null,
        merchantSummary: null,
        projected: null,
      };
    }
    return {
      ok: true,
      reused: false,
      failed: false,
      bundle: bueResult.bundle,
      merchantSummary: bueResult.merchantSummary ?? null,
      projected: projectCreateStoreFieldsFromBue(bueResult.bundle),
    };
  } catch (err) {
    console.warn(
      '[CreateStoreBue] pipeline failed (non-fatal):',
      err?.message ?? err,
    );
    return {
      ok: false,
      reused: false,
      failed: true,
      reason: 'BUE_EXCEPTION',
      bundle: null,
      merchantSummary: null,
      projected: null,
    };
  }
}

export default {
  projectCreateStoreFieldsFromBue,
  resolveBueForCreateStoreDraft,
};
