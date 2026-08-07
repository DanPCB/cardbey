/**
 * Build Current vs Recommended package for owner/admin review.
 */

import { buildProjectionPreviewPayload } from '../rendering/applyDesignLibraryRenderShadow.js';
import { extractLegacyStorefrontStructure } from '../rendering/legacyStructureExtractor.js';
import { fingerprintProjection, createPendingAcceptance, readAcceptanceFromMeta } from './acceptanceRecord.js';

/**
 * @param {object} catalog
 * @param {Record<string, unknown>} [context]
 */
export function buildOwnerProjectionComparison(catalog, context = {}) {
  const projection = catalog?.meta?.designLibraryStorefrontProjection ?? null;
  const commerce = catalog?.meta?.designLibraryCommercePolicy ?? null;
  const recommendation = catalog?.meta?.designLibraryBlueprintRecommendation ?? null;
  const existingAcceptance = readAcceptanceFromMeta(catalog?.meta);

  const legacyStore =
    context.legacyStore ??
    {
      products: catalog?.products,
      preview: catalog?.preview,
      meta: catalog?.meta,
      primaryCTA: catalog?.meta?.primaryCTA,
      websiteTemplateId: catalog?.meta?.websiteTemplateId ?? context.websiteTemplateId,
      contentTemplateId: catalog?.meta?.contentTemplateId,
      theme: catalog?.theme,
    };

  const current = {
    label: 'Current storefront',
    source: 'legacy',
    structure: extractLegacyStorefrontStructure(legacyStore),
    primaryCta: catalog?.meta?.primaryCTA ?? legacyStore.primaryCTA ?? null,
  };

  const previewPayload = projection
    ? buildProjectionPreviewPayload(catalog, context)
    : { ok: false, viewModel: null, comparison: null, shadow: null };

  const recommended = {
    label: 'Recommended storefront',
    source: 'design_library_projection',
    ok: Boolean(previewPayload.ok),
    blueprintId: recommendation?.selectedBlueprintId ?? projection?.blueprintId ?? null,
    businessModel: commerce?.businessModel ?? projection?.businessModel ?? null,
    primaryAction: commerce?.primaryAction ?? projection?.primaryAction ?? null,
    primaryLabel: previewPayload.viewModel?.primaryAction?.label ?? null,
    viewModelSummary: previewPayload.shadow?.projectedViewModelSummary ?? null,
    comparisonSummary: previewPayload.comparison?.summary ?? null,
    readiness: previewPayload.comparison?.readiness ?? previewPayload.shadow?.readiness ?? null,
    criticalFindingCodes:
      previewPayload.shadow?.criticalFindingCodes ??
      previewPayload.comparison?.criticalFindings?.map((f) => f.code) ??
      [],
    sectionPlan: Array.isArray(projection?.sections)
      ? projection.sections.map((s) =>
          Object.freeze({
            role: s.role,
            visibility: s.visibility,
            variant: s.variant,
            itemCount: s.itemRefs?.length ?? 0,
          }),
        )
      : [],
  };

  const fingerprint = projection
    ? fingerprintProjection(projection, recommended.viewModelSummary)
    : null;

  const acceptance =
    existingAcceptance ??
    createPendingAcceptance({
      blueprintId: recommended.blueprintId,
      primaryAction: recommended.primaryAction,
      projectionFingerprint: fingerprint,
      comparisonSummary: recommended.comparisonSummary,
      readinessSafeForPreview: recommended.readiness?.safeForPreview ?? null,
    });

  const stale =
    existingAcceptance?.status === 'accepted' &&
    existingAcceptance.projectionFingerprint &&
    fingerprint &&
    existingAcceptance.projectionFingerprint !== fingerprint;

  return Object.freeze({
    version: 1,
    current: Object.freeze(current),
    recommended: Object.freeze({
      ...recommended,
      sectionPlan: Object.freeze([...(recommended.sectionPlan ?? [])]),
      criticalFindingCodes: Object.freeze([...(recommended.criticalFindingCodes ?? [])]),
    }),
    acceptance,
    projectionFingerprint: fingerprint,
    staleAcceptance: Boolean(stale),
    authoritative: false,
    labels: Object.freeze({
      headline: 'Compare storefront structures',
      currentTitle: 'Current',
      recommendedTitle: 'Recommended',
      acceptCta: 'Use recommended structure for this draft preview',
      rejectCta: 'Keep current structure',
      disclaimer:
        'Accepting updates this draft’s controlled preview only. It does not publish or change the live public storefront for all stores.',
    }),
  });
}
