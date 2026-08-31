/**
 * Independently renderable projection preview package (Phase 8A).
 * Does not mutate catalog / projection / acceptance.
 */

import { fingerprintProjection } from '../acceptance/acceptanceRecord.js';
import { buildProjectionPreviewPayload } from '../rendering/applyDesignLibraryRenderShadow.js';
import { validateRenderViewModel } from '../rendering/renderAdapterValidator.js';
import { ADAPTER_VERSION } from '../rendering/renderCompatibility.js';

export const PROJECTION_PREVIEW_PACKAGE_VERSION = 1;

/**
 * @param {object} catalog
 * @param {Record<string, unknown>} [context]
 * @returns {{
 *   package: object|null,
 *   validation: { ok: boolean, errors: string[] },
 *   fingerprint: string|null,
 *   comparison: object|null,
 * }}
 */
export function buildProjectionPreviewPackage(catalog, context = {}) {
  const projection = catalog?.meta?.designLibraryStorefrontProjection;
  if (!projection || typeof projection !== 'object') {
    return {
      package: null,
      validation: { ok: false, errors: ['projection_missing'] },
      fingerprint: null,
      comparison: null,
    };
  }

  const fingerprint = fingerprintProjection(projection);

  let viewModel = null;
  let comparison = null;
  try {
    const payload = buildProjectionPreviewPayload(catalog, context);
    if (!payload.ok || !payload.viewModel) {
      return {
        package: null,
        validation: {
          ok: false,
          errors: ['view_model_build_failed'],
        },
        fingerprint,
        comparison: null,
      };
    }
    viewModel = payload.viewModel;
    comparison = payload.comparison ?? null;
  } catch (err) {
    const validationErrors =
      err && typeof err === 'object' && Array.isArray(err.validation?.errors)
        ? err.validation.errors
        : [err instanceof Error ? err.message : String(err)];
    return {
      package: null,
      validation: { ok: false, errors: validationErrors },
      fingerprint,
      comparison: null,
    };
  }

  const validation = validateRenderViewModel(viewModel, {
    catalogItems: catalog.products,
    businessData: context,
  });
  if (!validation.ok) {
    return {
      package: null,
      validation,
      fingerprint,
      comparison,
    };
  }

  const policy =
    catalog.meta?.designLibraryCommercePolicy &&
    typeof catalog.meta.designLibraryCommercePolicy === 'object'
      ? catalog.meta.designLibraryCommercePolicy
      : {};

  const pkg = Object.freeze({
    kind: 'projection_preview_package',
    packageVersion: PROJECTION_PREVIEW_PACKAGE_VERSION,
    source: /** @type {const} */ ('projection'),
    authoritative: false,
    fingerprint,
    blueprintId: projection.blueprintId ?? viewModel.blueprintId ?? null,
    blueprintVersion:
      projection.blueprintVersion ?? projection.version ?? projection.projectorVersion ?? null,
    commercePolicySummary: Object.freeze({
      businessModel: policy.businessModel ?? projection.businessModel ?? null,
      primaryAction: policy.primaryAction ?? projection.primaryAction ?? null,
      secondaryAction: policy.secondaryAction ?? null,
      policyVersion: policy.policyVersion ?? null,
    }),
    themeReference: Object.freeze({
      visualThemeId: viewModel.visualThemeId ?? catalog.meta?.visualThemeId ?? null,
      themeId: catalog.meta?.themeId ?? null,
    }),
    viewModel,
    adapterVersion: viewModel.adapterVersion ?? ADAPTER_VERSION,
    validatorVersion: 1,
    compatibilitySummary: viewModel.compatibility,
    readiness: comparison?.readiness
      ? Object.freeze({
          safeForPreview: Boolean(comparison.readiness.safeForPreview),
          safeForControlledCutover: Boolean(comparison.readiness.safeForControlledCutover),
          blockers: Object.freeze([...(comparison.readiness.blockers ?? [])]),
        })
      : null,
  });

  return {
    package: pkg,
    validation: { ok: true, errors: [] },
    fingerprint,
    comparison,
  };
}
