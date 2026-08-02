/**
 * Attach advisory storefront projection after Phase 4 recommendation.
 */

import { isDesignLibraryV1Enabled, isDesignLibraryAuthoritative } from '../flags.js';
import { gatherProjectionEvidence } from './projectionEvidence.js';
import { projectStorefront } from './storefrontProjector.js';
import { validateStorefrontProjection } from './projectionValidator.js';
import { PROJECTOR_VERSION } from './projectionResult.js';

/**
 * @param {object} catalog
 * @param {Record<string, unknown>} [context]
 * @returns {import('./projectionResult.js').StorefrontProjection | null}
 */
export function projectStorefrontForDraft(catalog, context = {}) {
  void isDesignLibraryAuthoritative();
  const evidence = gatherProjectionEvidence(catalog, context);
  if (!evidence) return null;
  return projectStorefront(evidence);
}

/**
 * @param {object} catalog
 * @param {Record<string, unknown>} [context]
 * @param {{ force?: boolean, emit?: boolean, missionId?: string|null, draftStoreId?: string|null }} [opts]
 */
export function applyDesignLibraryStorefrontProjection(catalog, context = {}, opts = {}) {
  if (!catalog || typeof catalog !== 'object') {
    return { catalog, projection: null, attached: false };
  }
  if (!opts.force && !isDesignLibraryV1Enabled()) {
    return { catalog, projection: null, attached: false };
  }

  // Require Phase 4 recommendation
  if (!catalog.meta?.designLibraryBlueprintRecommendation?.selectedBlueprintId) {
    return { catalog, projection: null, attached: false };
  }

  const evidence = gatherProjectionEvidence(catalog, context);
  if (!evidence) {
    return { catalog, projection: null, attached: false };
  }

  let projection;
  try {
    projection = projectStorefront(evidence);
  } catch (err) {
    recordProjectionDiagnostic({
      kind: 'project_threw',
      detail: err instanceof Error ? err.message : String(err),
      missionId: opts.missionId ?? null,
      draftStoreId: opts.draftStoreId ?? null,
    });
    return { catalog, projection: null, attached: false };
  }

  const validation = validateStorefrontProjection(projection, {
    itemsByRef: evidence.itemsByRef,
    strict: process.env.NODE_ENV !== 'production',
  });

  if (!validation.ok) {
    recordProjectionDiagnostic({
      kind: 'validation_failed',
      errors: validation.errors,
      missionId: opts.missionId ?? null,
      draftStoreId: opts.draftStoreId ?? null,
    });
    // Fail safely: do not attach invalid projection; preserve live behaviour
    if (process.env.NODE_ENV !== 'production' || process.env.DESIGN_LIBRARY_POLICY_LOG === '1') {
      try {
        console.warn(
          '[storefrontDesignLibrary]',
          JSON.stringify({
            event: 'storefront.projection.validation_failed',
            errors: validation.errors,
            missionId: opts.missionId ?? null,
            draftStoreId: opts.draftStoreId ?? null,
          }),
        );
      } catch {
        /* ignore */
      }
    }
    // In tests/dev, still throw-friendly via return; production skips attach
    if (opts.force && process.env.NODE_ENV === 'test' && opts.throwOnInvalid) {
      throw new Error(`Invalid storefront projection: ${validation.errors.join(', ')}`);
    }
    return { catalog, projection: null, attached: false, validation };
  }

  const next = {
    ...catalog,
    meta: {
      ...(catalog.meta && typeof catalog.meta === 'object' ? catalog.meta : {}),
      designLibraryStorefrontProjection: {
        ...projection,
        authoritative: false,
      },
    },
  };

  if (opts.emit !== false) {
    emitProjectionCompleted({
      missionId: opts.missionId ?? null,
      draftStoreId: opts.draftStoreId ?? null,
      projection,
    });
  }

  return { catalog: next, projection, attached: true, validation };
}

/**
 * @param {{
 *   missionId?: string|null,
 *   draftStoreId?: string|null,
 *   projection: import('./projectionResult.js').StorefrontProjection,
 * }} payload
 */
export function emitProjectionCompleted(payload) {
  const p = payload.projection;
  const sections = p.sections ?? [];
  const event = {
    event: 'storefront.projection.completed',
    missionId: payload.missionId ?? null,
    draftStoreId: payload.draftStoreId ?? null,
    projectorVersion: PROJECTOR_VERSION,
    blueprintId: p.blueprintId,
    businessModel: p.businessModel,
    primaryAction: p.primaryAction,
    sectionCount: sections.length,
    visibleSectionCount: sections.filter((s) => s.visibility === 'visible').length,
    hiddenSectionCount: sections.filter((s) => s.visibility === 'hidden').length,
    footerOnlySectionCount: sections.filter((s) => s.visibility === 'footer_only').length,
    sourcedSectionCount: sections.filter((s) => s.contentOrigin === 'sourced').length,
    mixedSectionCount: sections.filter((s) => s.contentOrigin === 'mixed').length,
    suggestedSectionCount: sections.filter((s) => s.contentOrigin === 'suggested').length,
    warningCodes: [...new Set((p.warnings ?? []).map((w) => w.code))],
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

/**
 * @param {Record<string, unknown>} diagnostic
 */
function recordProjectionDiagnostic(diagnostic) {
  if (process.env.NODE_ENV !== 'production' || process.env.DESIGN_LIBRARY_POLICY_LOG === '1') {
    try {
      console.warn(
        '[storefrontDesignLibrary]',
        JSON.stringify({ event: 'storefront.projection.diagnostic', ...diagnostic }),
      );
    } catch {
      /* ignore */
    }
  }
}
