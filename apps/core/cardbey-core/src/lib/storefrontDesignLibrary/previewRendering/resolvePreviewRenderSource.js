/**
 * Phase 8A — preview-mode render source priority (authorised preview only).
 * Public / publish paths must never import this module for authority.
 */

import { isDesignLibraryAuthoritative } from '../flags.js';

/**
 * @typedef {'legacy'|'projection'} PreviewPrimarySource
 * @typedef {'accepted_projection'|'preview_render_disabled'|'no_acceptance'|'acceptance_stale'|'projection_missing'|'projection_invalid'|'legacy_fallback'} PreviewRenderReason
 */

/**
 * @param {{
 *   previewMode: boolean,
 *   previewRenderEnabled: boolean,
 *   acceptanceEnabled: boolean,
 *   acceptanceRecord: object|null,
 *   currentProjectionFingerprint: string|null,
 *   projectionValidation: { ok: boolean, errors?: string[] }|null,
 *   legacyPackage: object|null,
 *   projectionPackage: object|null,
 * }} input
 */
export function resolvePreviewRenderSource(input) {
  void isDesignLibraryAuthoritative();

  const legacyPackage = input.legacyPackage ?? null;
  const projectionPackage = input.projectionPackage ?? null;
  const packages = Object.freeze({
    legacy: legacyPackage,
    projection: projectionPackage,
  });

  const acceptanceRecord = input.acceptanceRecord ?? null;
  const fingerprintMatches = Boolean(
    acceptanceRecord?.projectionFingerprint &&
      input.currentProjectionFingerprint &&
      acceptanceRecord.projectionFingerprint === input.currentProjectionFingerprint,
  );
  const acceptance = Object.freeze({
    status: acceptanceRecord?.status ?? null,
    fingerprintMatches,
    acceptedAt: acceptanceRecord?.acceptedAt ?? null,
  });

  /** @param {PreviewRenderReason} reason */
  const legacyResult = (reason) =>
    Object.freeze({
      primarySource: /** @type {const} */ ('legacy'),
      reason,
      primaryPackage: legacyPackage,
      packages,
      acceptance,
      authoritative: false,
    });

  if (!input.previewMode) {
    return legacyResult('legacy_fallback');
  }
  if (!input.previewRenderEnabled) {
    return legacyResult('preview_render_disabled');
  }
  if (!input.acceptanceEnabled) {
    return legacyResult('no_acceptance');
  }
  if (
    !acceptanceRecord ||
    acceptanceRecord.status !== 'accepted' ||
    acceptanceRecord.applyToDraftPreview !== true
  ) {
    return legacyResult('no_acceptance');
  }
  if (!fingerprintMatches) {
    return legacyResult('acceptance_stale');
  }
  if (!projectionPackage) {
    return legacyResult('projection_missing');
  }
  if (!input.projectionValidation?.ok) {
    return legacyResult('projection_invalid');
  }

  return Object.freeze({
    primarySource: /** @type {const} */ ('projection'),
    reason: /** @type {const} */ ('accepted_projection'),
    primaryPackage: projectionPackage,
    packages,
    acceptance,
    authoritative: false,
  });
}
