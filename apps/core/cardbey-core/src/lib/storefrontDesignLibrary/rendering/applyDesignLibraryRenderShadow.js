/**
 * Attach advisory shadow comparison metadata when shadow flag is on.
 */

import {
  isDesignLibraryV1Enabled,
  isDesignLibraryAuthoritative,
  isStorefrontProjectionShadowEnabled,
} from '../flags.js';
import { adaptProjectionToRenderViewModel, summarizeRenderViewModel } from './projectionRenderAdapter.js';
import { extractLegacyStorefrontStructure } from './legacyStructureExtractor.js';
import { compareLegacyAndProjectedStorefront } from './shadowComparison.js';
import { ADAPTER_VERSION, COMPARISON_VERSION } from './renderCompatibility.js';

/**
 * @param {object} catalog
 * @param {Record<string, unknown>} [context]
 * @param {{ force?: boolean, emit?: boolean, missionId?: string|null, draftStoreId?: string|null, legacyStore?: object }} [opts]
 */
export function applyDesignLibraryRenderShadow(catalog, context = {}, opts = {}) {
  if (!catalog || typeof catalog !== 'object') {
    return { catalog, shadow: null, attached: false };
  }
  if (!opts.force && (!isDesignLibraryV1Enabled() || !isStorefrontProjectionShadowEnabled())) {
    return { catalog, shadow: null, attached: false };
  }
  void isDesignLibraryAuthoritative();

  const projection = catalog.meta?.designLibraryStorefrontProjection;
  if (!projection || projection.authoritative !== false) {
    return { catalog, shadow: null, attached: false };
  }

  const policy = catalog.meta?.designLibraryCommercePolicy ?? {};
  const businessData = {
    phone: context.phone,
    bookingUrl: context.bookingUrl,
    bookingProvider: context.bookingProvider,
    address: context.facts?.address ?? context.address,
    location: context.facts?.location,
    deliveryUrl: context.deliveryUrl ?? context.facts?.deliveryUrl,
    reservationUrl: context.reservationUrl ?? context.facts?.reservationUrl,
    commercePolicy: policy,
    designLibraryCommercePolicy: policy,
    evidenceSummary: policy.evidenceSummary,
  };

  let viewModel;
  try {
    viewModel = adaptProjectionToRenderViewModel({
      projection,
      businessData,
      catalogItems: catalog.products,
      theme: {
        id: context.themeId ?? catalog.meta?.themeId,
        visualThemeId: context.visualThemeId ?? catalog.meta?.visualThemeId,
      },
    });
  } catch (err) {
    emitShadowFailed({
      missionId: opts.missionId ?? null,
      draftStoreId: opts.draftStoreId ?? null,
      detail: err instanceof Error ? err.message : String(err),
    });
    return { catalog, shadow: null, attached: false, error: err };
  }

  const legacyStore =
    opts.legacyStore ??
    context.legacyStore ??
    {
      products: catalog.products,
      preview: catalog.preview,
      website: catalog.website,
      meta: catalog.meta,
      primaryCTA: catalog.meta?.primaryCTA,
      websiteTemplateId: catalog.meta?.websiteTemplateId ?? context.websiteTemplateId,
      contentTemplateId: catalog.meta?.contentTemplateId,
      theme: catalog.theme,
      legacyThemeTemplateId: catalog.meta?.legacyThemeTemplateId,
    };

  const legacySnapshot = extractLegacyStorefrontStructure(legacyStore);
  const comparison = compareLegacyAndProjectedStorefront({
    legacySnapshot,
    projectedViewModel: viewModel,
    catalogItems: catalog.products,
  });

  const shadow = Object.freeze({
    projectedViewModelSummary: summarizeRenderViewModel(viewModel),
    comparisonSummary: comparison.summary,
    readiness: comparison.readiness,
    criticalFindingCodes: Object.freeze(
      comparison.criticalFindings.map((f) => f.code),
    ),
    authoritative: false,
    adapterVersion: ADAPTER_VERSION,
    comparisonVersion: COMPARISON_VERSION,
  });

  const next = {
    ...catalog,
    meta: {
      ...(catalog.meta && typeof catalog.meta === 'object' ? catalog.meta : {}),
      designLibraryRenderShadow: shadow,
    },
  };

  // Stash full view model only when preview flag path requests it (in-memory return)
  if (opts.emit !== false) {
    emitShadowCompleted({
      missionId: opts.missionId ?? null,
      draftStoreId: opts.draftStoreId ?? null,
      viewModel,
      comparison,
      shadow,
    });
  }

  return {
    catalog: next,
    shadow,
    attached: true,
    viewModel,
    comparison,
    legacySnapshot,
  };
}

/**
 * Build projected preview payload for authorised callers (does not attach to catalog).
 * @param {object} catalog
 * @param {Record<string, unknown>} [context]
 */
export function buildProjectionPreviewPayload(catalog, context = {}) {
  const result = applyDesignLibraryRenderShadow(catalog, context, {
    force: true,
    emit: false,
  });
  if (!result.attached || !result.viewModel) {
    return { ok: false, viewModel: null, comparison: null, error: result.error ?? null };
  }
  return {
    ok: true,
    viewModel: result.viewModel,
    comparison: result.comparison,
    shadow: result.shadow,
    previewLabel: 'Projection preview — not live',
    authoritative: false,
  };
}

function emitShadowCompleted(payload) {
  const { viewModel, comparison, shadow } = payload;
  const event = {
    event: 'storefront.render_shadow.completed',
    missionId: payload.missionId ?? null,
    draftStoreId: payload.draftStoreId ?? null,
    adapterVersion: ADAPTER_VERSION,
    comparisonVersion: COMPARISON_VERSION,
    blueprintId: viewModel.blueprintId,
    projectedSectionCount: viewModel.sections.length,
    legacySectionCount: comparison.summary.legacySectionCount,
    semanticCorrectionCount: comparison.summary.semanticCorrections,
    CTAChangeCount: comparison.summary.CTAChanges,
    compatibilityFallbackCount: viewModel.compatibility.fallbackCount,
    safeForPreview: shadow.readiness.safeForPreview,
    safeForControlledCutover: shadow.readiness.safeForControlledCutover,
    blockerCodes: shadow.readiness.blockers,
  };
  if (process.env.NODE_ENV !== 'production' || process.env.DESIGN_LIBRARY_POLICY_LOG === '1') {
    try {
      console.info('[storefrontDesignLibrary]', JSON.stringify(event));
    } catch {
      /* ignore */
    }
  }
  return event;
}

function emitShadowFailed(payload) {
  const event = {
    event: 'storefront.render_shadow.failed',
    missionId: payload.missionId ?? null,
    draftStoreId: payload.draftStoreId ?? null,
    detail: payload.detail,
  };
  if (process.env.NODE_ENV !== 'production' || process.env.DESIGN_LIBRARY_POLICY_LOG === '1') {
    try {
      console.warn('[storefrontDesignLibrary]', JSON.stringify(event));
    } catch {
      /* ignore */
    }
  }
  return event;
}
