/**
 * Build an alternate publish preview from accepted projection (Phase 8B).
 * Does not mutate draft / legacy sections in place.
 */

import { fingerprintProjection } from '../acceptance/acceptanceRecord.js';
import { buildProjectionPreviewPayload } from '../rendering/applyDesignLibraryRenderShadow.js';
import { validateRenderViewModel } from '../rendering/renderAdapterValidator.js';
import { ADAPTER_VERSION } from '../rendering/renderCompatibility.js';
import { PROJECTOR_VERSION, PROJECTION_VERSION } from '../projection/projectionResult.js';
import { validatePublishSnapshot } from './validatePublishSnapshot.js';

export const PROJECTION_PUBLISH_PACKAGE_VERSION = 1;

/**
 * Map projection render VM → legacy-compatible website.sections.
 * @param {object} viewModel
 */
export function mapViewModelToWebsiteSections(viewModel) {
  const sections = Array.isArray(viewModel?.sections) ? viewModel.sections : [];
  return sections
    .filter((s) => s && s.visibility !== 'hidden')
    .map((s, index) => {
      const visibility = s.visibility === 'footer_only' ? 'footer_only' : 'visible';
      return Object.freeze({
        id: s.id || `proj_sec_${index + 1}`,
        type: s.rendererType || s.semanticRole || 'section',
        role: s.semanticRole || undefined,
        semanticRole: s.semanticRole || undefined,
        order: Number(s.order) || index + 1,
        visibility,
        placement: visibility === 'footer_only' ? 'footer' : undefined,
        heading: s.heading || undefined,
        description: s.description || undefined,
        variant: s.variant || undefined,
        items: Object.freeze(
          (Array.isArray(s.items) ? s.items : []).map((item) =>
            Object.freeze({
              id: item.id,
              name: item.name || item.title,
              title: item.title || item.name,
              description: item.description,
              price: item.price,
              imageUrl: item.imageUrl,
              contentRole: item.contentRole,
              contentOrigin: item.contentOrigin,
              refType: item.id ? 'catalog' : undefined,
            }),
          ),
        ),
        actions: Object.freeze(
          (Array.isArray(s.actions) ? s.actions : [])
            .filter((a) => a && a.action)
            .map((a) =>
              Object.freeze({
                action: a.action,
                label: a.label,
                href: a.href,
                enabled: a.enabled !== false,
              }),
            ),
        ),
        source: 'design_library_projection',
      });
    });
}

/**
 * @param {{
 *   catalog: object,
 *   legacyPreview: object,
 *   context?: Record<string, unknown>,
 * }} input
 * @returns {{
 *   ok: boolean,
 *   preview: object|null,
 *   fingerprint: string|null,
 *   blueprintId: string|null,
 *   blueprintVersion: string|number|null,
 *   projectionVersion: number,
 *   renderAdapterVersion: number,
 *   errors: string[],
 * }}
 */
export function buildProjectionPublishPackage(input) {
  const catalog = input.catalog;
  const legacyPreview = input.legacyPreview && typeof input.legacyPreview === 'object' ? input.legacyPreview : {};
  const context = input.context ?? {};
  const projection = catalog?.meta?.designLibraryStorefrontProjection;

  if (!projection) {
    return fail(['projection_missing']);
  }

  const fingerprint = fingerprintProjection(projection);
  let viewModel = null;
  try {
    const payload = buildProjectionPreviewPayload(catalog, context);
    if (!payload.ok || !payload.viewModel) {
      return fail(['view_model_build_failed'], fingerprint);
    }
    viewModel = payload.viewModel;
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return fail([`view_model_build_failed:${detail}`], fingerprint);
  }

  const vmValidation = validateRenderViewModel(viewModel, {
    catalogItems: catalog.products,
    businessData: context,
  });
  if (!vmValidation.ok) {
    return fail(vmValidation.errors.length ? vmValidation.errors : ['view_model_invalid'], fingerprint);
  }

  const sections = mapViewModelToWebsiteSections(viewModel);
  if (!sections.length) {
    return fail(['projection_sections_empty'], fingerprint);
  }

  const legacyWebsite =
    legacyPreview.website && typeof legacyPreview.website === 'object' ? legacyPreview.website : {};

  const preview = {
    ...legacyPreview,
    primaryCTA: viewModel.primaryAction?.label || legacyPreview.primaryCTA,
    meta: {
      ...(legacyPreview.meta && typeof legacyPreview.meta === 'object' ? legacyPreview.meta : {}),
      ...(catalog.meta && typeof catalog.meta === 'object' ? catalog.meta : {}),
      primaryCTA: viewModel.primaryAction?.label || legacyPreview.meta?.primaryCTA,
      primaryAction: viewModel.primaryAction?.action || null,
    },
    website: {
      ...legacyWebsite,
      sections,
      theme: legacyWebsite.theme,
      primaryAction: viewModel.primaryAction
        ? {
            action: viewModel.primaryAction.action,
            label: viewModel.primaryAction.label,
            href: viewModel.primaryAction.href,
          }
        : legacyWebsite.primaryAction,
    },
  };

  const publishValidation = validatePublishSnapshot(preview, {
    catalogProducts: catalog.products || legacyPreview.items,
  });
  if (!publishValidation.ok) {
    return fail(publishValidation.errors, fingerprint);
  }

  return {
    ok: true,
    preview,
    fingerprint,
    blueprintId: projection.blueprintId ?? viewModel.blueprintId ?? null,
    blueprintVersion: projection.blueprintVersion ?? projection.version ?? null,
    projectionVersion: projection.projectorVersion ?? PROJECTOR_VERSION ?? PROJECTION_VERSION,
    renderAdapterVersion: viewModel.adapterVersion ?? ADAPTER_VERSION,
    errors: [],
  };
}

/** @param {string[]} errors @param {string|null} [fingerprint] */
function fail(errors, fingerprint = null) {
  return {
    ok: false,
    preview: null,
    fingerprint,
    blueprintId: null,
    blueprintVersion: null,
    projectionVersion: PROJECTION_VERSION,
    renderAdapterVersion: ADAPTER_VERSION,
    errors,
  };
}
