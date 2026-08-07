/**
 * Orchestrate dual preview packages + source resolution (Phase 8A-Core).
 * Preview / draft routes only — never public or publish.
 */

import {
  isDesignLibraryAuthoritative,
  isStorefrontProjectionAcceptanceEnabled,
  isStorefrontProjectionPreviewRenderEnabled,
} from '../flags.js';
import { fingerprintProjection, readAcceptanceFromMeta } from '../acceptance/acceptanceRecord.js';
import { buildLegacyPreviewPackage } from './buildLegacyPreviewPackage.js';
import { buildProjectionPreviewPackage } from './buildProjectionPreviewPackage.js';
import { resolvePreviewRenderSource } from './resolvePreviewRenderSource.js';

/**
 * @param {{
 *   catalog: object,
 *   legacyStore: object,
 *   context?: Record<string, unknown>,
 *   previewMode?: boolean,
 * }} input
 */
export function buildPreviewRenderPayload(input) {
  void isDesignLibraryAuthoritative();

  const catalog = input.catalog;
  const legacyStore = input.legacyStore;
  const context = input.context ?? {};
  const previewMode = input.previewMode !== false;

  const previewRenderEnabled = isStorefrontProjectionPreviewRenderEnabled();
  const acceptanceEnabled = isStorefrontProjectionAcceptanceEnabled();

  const legacyPackage = buildLegacyPreviewPackage(legacyStore);

  let projectionPackage = null;
  /** @type {{ ok: boolean, errors: string[] }} */
  let projectionValidation = { ok: false, errors: ['projection_omitted'] };
  /** @type {string|null} */
  let fingerprint = null;
  /** @type {object|null} */
  let comparison = null;

  const projectionMeta = catalog?.meta?.designLibraryStorefrontProjection;
  if (projectionMeta) {
    fingerprint = fingerprintProjection(projectionMeta);
  }

  if (previewRenderEnabled) {
    const built = buildProjectionPreviewPackage(catalog, context);
    projectionPackage = built.package;
    projectionValidation = built.validation;
    fingerprint = built.fingerprint ?? fingerprint;
    comparison = built.comparison;
  }

  const acceptanceRecord = readAcceptanceFromMeta(catalog?.meta);

  const resolved = resolvePreviewRenderSource({
    previewMode,
    previewRenderEnabled,
    acceptanceEnabled,
    acceptanceRecord,
    currentProjectionFingerprint: fingerprint,
    projectionValidation: projectionPackage
      ? projectionValidation
      : { ok: false, errors: ['projection_missing'] },
    legacyPackage,
    projectionPackage: previewRenderEnabled ? projectionPackage : null,
  });

  // Honesty: primaryPackage must equal packages[primarySource]
  const honestPrimary =
    resolved.primarySource === 'projection'
      ? resolved.packages.projection
      : resolved.packages.legacy;

  const ok = Boolean(honestPrimary) || Boolean(resolved.packages.legacy);

  return Object.freeze({
    ok,
    primarySource: resolved.primarySource,
    reason: resolved.reason,
    primaryPackage: honestPrimary,
    packages: resolved.packages,
    acceptance: resolved.acceptance,
    authoritative: false,
    comparison: comparison ?? null,
    // Phase 7 compat: never return a projection-only VM when primary is legacy
    viewModel:
      resolved.primarySource === 'projection' ? honestPrimary?.viewModel ?? null : null,
    previewLabel:
      resolved.primarySource === 'projection'
        ? 'Accepted projection preview — draft only (not live public)'
        : 'Legacy preview — not live',
  });
}
