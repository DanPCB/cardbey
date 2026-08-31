/**
 * Build projection package for live renderer cutover (cutover capabilities).
 */

import { fingerprintProjection } from '../acceptance/acceptanceRecord.js';
import { adaptProjectionToRenderViewModel } from '../rendering/projectionRenderAdapter.js';
import { validateRenderViewModel } from '../rendering/renderAdapterValidator.js';
import {
  ADAPTER_VERSION,
  PROJECTION_CUTOVER_RENDERER_CAPABILITIES,
} from '../rendering/renderCompatibility.js';
import { assessCriticalSectionSupport } from './criticalSectionCheck.js';

export const LIVE_RENDER_PACKAGE_VERSION = 1;

/**
 * @param {object} catalog
 * @param {Record<string, unknown>} [context]
 */
export function buildLiveRenderPackage(catalog, context = {}) {
  const projection = catalog?.meta?.designLibraryStorefrontProjection;
  if (!projection) {
    return {
      package: null,
      validation: { ok: false, errors: ['projection_missing'] },
      fingerprint: null,
      criticalUnsupported: true,
      criticalDetail: 'projection_missing',
    };
  }

  const fingerprint = fingerprintProjection(projection);
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
      catalogItems: catalog.products ?? catalog.items ?? [],
      theme: {
        id: context.themeId ?? catalog.meta?.themeId,
        visualThemeId: context.visualThemeId ?? catalog.meta?.visualThemeId,
      },
      rendererCapabilities: PROJECTION_CUTOVER_RENDERER_CAPABILITIES,
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return {
      package: null,
      validation: { ok: false, errors: [`view_model_build_failed:${detail}`] },
      fingerprint,
      criticalUnsupported: true,
      criticalDetail: detail,
    };
  }

  const validation = validateRenderViewModel(viewModel, {
    catalogItems: catalog.products ?? catalog.items ?? [],
    businessData,
  });
  const critical = assessCriticalSectionSupport(viewModel);

  const pkg = Object.freeze({
    source: /** @type {const} */ ('projection'),
    kind: /** @type {const} */ ('projection_live_render_package'),
    version: LIVE_RENDER_PACKAGE_VERSION,
    fingerprint,
    blueprintId: viewModel.blueprintId ?? null,
    businessModel: viewModel.businessModel ?? null,
    primaryAction: viewModel.primaryAction ?? null,
    secondaryActions: viewModel.secondaryActions ?? [],
    viewModel,
    adapterVersion: ADAPTER_VERSION,
    rendererId: PROJECTION_CUTOVER_RENDERER_CAPABILITIES.rendererId,
    bypassLegacyNormalize: true,
  });

  return {
    package: pkg,
    validation,
    fingerprint,
    criticalUnsupported: critical.criticalUnsupported,
    criticalDetail: critical.detail,
  };
}

/**
 * Legacy package pointer — renderer continues using existing preview/website.sections.
 * @param {object} legacyStore
 */
export function buildLegacyLiveRenderPackage(legacyStore) {
  return Object.freeze({
    source: /** @type {const} */ ('legacy'),
    kind: /** @type {const} */ ('legacy_live_render_package'),
    version: LIVE_RENDER_PACKAGE_VERSION,
    preview: legacyStore?.preview ?? null,
    website: legacyStore?.preview?.website ?? legacyStore?.website ?? null,
    primaryCTA: legacyStore?.primaryCTA ?? legacyStore?.preview?.primaryCTA ?? null,
    bypassLegacyNormalize: false,
  });
}
