/**
 * Orchestrate live render packages + source resolution (Projection Renderer Cutover V1).
 * Read-only over draft meta — never mutates draft, truth, projection, or acceptance.
 * Does not affect publish cutover.
 */

import {
  isDesignLibraryAuthoritative,
  isStorefrontProjectionAcceptanceEnabled,
  isStorefrontProjectionRenderCutoverEnabled,
} from '../flags.js';
import { fingerprintProjection, readAcceptanceFromMeta } from '../acceptance/acceptanceRecord.js';
import {
  buildLegacyLiveRenderPackage,
  buildLiveRenderPackage,
} from './buildLiveRenderPackage.js';
import { resolveLiveRenderSource } from './resolveLiveRenderSource.js';
import {
  emitProjectionRenderCompleted,
  emitProjectionRenderFallback,
  emitRenderSourceSelected,
} from './emitRenderCutoverEvents.js';

/**
 * @param {{
 *   catalog: object,
 *   legacyStore: object,
 *   context?: Record<string, unknown>,
 *   draftStoreId?: string|null,
 *   emit?: boolean,
 * }} input
 */
export function buildLiveRenderPayload(input) {
  void isDesignLibraryAuthoritative();

  const catalog = input.catalog && typeof input.catalog === 'object' ? input.catalog : {};
  const legacyStore = input.legacyStore && typeof input.legacyStore === 'object' ? input.legacyStore : {};
  const context = input.context ?? {};
  const draftStoreId = input.draftStoreId ?? null;
  const shouldEmit = input.emit !== false;

  const metaSnap = JSON.stringify(catalog.meta ?? null);
  const acceptanceSnap = JSON.stringify(catalog.meta?.designLibraryProjectionAcceptance ?? null);
  const projectionSnap = JSON.stringify(catalog.meta?.designLibraryStorefrontProjection ?? null);

  const renderCutoverEnabled = isStorefrontProjectionRenderCutoverEnabled();
  const acceptanceEnabled = isStorefrontProjectionAcceptanceEnabled();

  const legacyPackage = buildLegacyLiveRenderPackage(legacyStore);

  /** @type {string|null} */
  let fingerprint = null;
  const projectionMeta = catalog?.meta?.designLibraryStorefrontProjection;
  if (projectionMeta) {
    fingerprint = fingerprintProjection(projectionMeta);
  }

  let projectionPackage = null;
  /** @type {{ ok: boolean, errors: string[] }} */
  let projectionValidation = { ok: false, errors: ['projection_omitted'] };
  let criticalUnsupported = false;
  /** @type {string|null} */
  let criticalDetail = null;
  let resolverError = false;

  if (renderCutoverEnabled) {
    try {
      const built = buildLiveRenderPackage(catalog, context);
      projectionPackage = built.package;
      projectionValidation = built.validation;
      fingerprint = built.fingerprint ?? fingerprint;
      criticalUnsupported = Boolean(built.criticalUnsupported);
      criticalDetail = built.criticalDetail ?? null;
    } catch (err) {
      resolverError = true;
      criticalDetail = err instanceof Error ? err.message : String(err);
      projectionValidation = { ok: false, errors: [`resolver_error:${criticalDetail}`] };
    }
  }

  const acceptanceRecord = readAcceptanceFromMeta(catalog?.meta);

  const resolved = resolveLiveRenderSource({
    renderCutoverEnabled,
    acceptanceEnabled,
    acceptanceRecord,
    currentProjectionFingerprint: fingerprint,
    projectionValidation: projectionPackage
      ? projectionValidation
      : { ok: false, errors: ['projection_missing'] },
    criticalUnsupported,
    legacyPackage,
    projectionPackage: renderCutoverEnabled ? projectionPackage : null,
    resolverError,
  });

  const honestPrimary =
    resolved.primarySource === 'projection'
      ? resolved.packages.projection
      : resolved.packages.legacy;

  const viewModel =
    resolved.primarySource === 'projection' ? honestPrimary?.viewModel ?? null : null;

  if (shouldEmit) {
    emitRenderSourceSelected({
      draftStoreId,
      primarySource: resolved.primarySource,
      reason: resolved.reason,
      fingerprint,
      blueprintId: honestPrimary?.blueprintId ?? viewModel?.blueprintId ?? null,
    });
    if (resolved.primarySource === 'projection' && viewModel) {
      emitProjectionRenderCompleted({
        draftStoreId,
        sectionCount: Array.isArray(viewModel.sections) ? viewModel.sections.length : 0,
        primaryAction: viewModel.primaryAction?.action ?? null,
        businessModel: viewModel.businessModel ?? null,
        fingerprint,
      });
    } else {
      emitProjectionRenderFallback({
        draftStoreId,
        reason: resolved.reason,
        detail: criticalDetail,
        fingerprint,
      });
    }
  }

  // Honesty: never mutate inputs
  if (JSON.stringify(catalog.meta ?? null) !== metaSnap) {
    throw new Error('[renderCutover] catalog.meta mutated during buildLiveRenderPayload');
  }
  if (JSON.stringify(catalog.meta?.designLibraryProjectionAcceptance ?? null) !== acceptanceSnap) {
    throw new Error('[renderCutover] acceptance mutated during buildLiveRenderPayload');
  }
  if (JSON.stringify(catalog.meta?.designLibraryStorefrontProjection ?? null) !== projectionSnap) {
    throw new Error('[renderCutover] projection mutated during buildLiveRenderPayload');
  }

  return Object.freeze({
    ok: Boolean(honestPrimary) || Boolean(resolved.packages.legacy),
    primarySource: resolved.primarySource,
    reason: resolved.reason,
    primaryPackage: honestPrimary,
    packages: resolved.packages,
    acceptance: resolved.acceptance,
    authoritative: false,
    viewModel,
    fingerprint,
    bypassLegacyNormalize: resolved.primarySource === 'projection',
    fallbackDetail: resolved.primarySource === 'legacy' ? criticalDetail : null,
    rendererId:
      resolved.primarySource === 'projection'
        ? honestPrimary?.rendererId ?? 'cardbey-projection-cutover-v1'
        : 'cardbey-legacy-storefront-v1',
    /** Ephemeral client payload — attach on GET response only; do not persist. */
    clientPayload: Object.freeze({
      primarySource: resolved.primarySource,
      reason: resolved.reason,
      authoritative: false,
      bypassLegacyNormalize: resolved.primarySource === 'projection',
      rendererId:
        resolved.primarySource === 'projection'
          ? 'cardbey-projection-cutover-v1'
          : 'cardbey-legacy-storefront-v1',
      fingerprint,
      viewModel,
      primaryAction: viewModel?.primaryAction ?? null,
      secondaryActions: viewModel?.secondaryActions ?? null,
      businessModel: viewModel?.businessModel ?? null,
      blueprintId: viewModel?.blueprintId ?? null,
      fallbackDetail: resolved.primarySource === 'legacy' ? criticalDetail : null,
    }),
  });
}
