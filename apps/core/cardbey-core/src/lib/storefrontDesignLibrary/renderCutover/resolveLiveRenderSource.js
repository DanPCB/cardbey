/**
 * Projection Renderer Cutover V1 — fail-closed source resolution for live storefront render.
 * Does not mutate draft / truth / projection / acceptance. Does not affect publish.
 */

import { isDesignLibraryAuthoritative } from '../flags.js';

/**
 * @typedef {'legacy'|'projection'} LiveRenderPrimarySource
 * @typedef {
 *   | 'accepted_projection_render'
 *   | 'render_cutover_disabled'
 *   | 'no_acceptance'
 *   | 'acceptance_stale'
 *   | 'projection_missing'
 *   | 'projection_invalid'
 *   | 'unsupported_critical_section'
 *   | 'resolver_error'
 *   | 'legacy_fallback'
 * } LiveRenderReason
 */

/**
 * @param {{
 *   renderCutoverEnabled: boolean,
 *   acceptanceEnabled: boolean,
 *   acceptanceRecord: object|null,
 *   currentProjectionFingerprint: string|null,
 *   projectionValidation: { ok: boolean, errors?: string[] }|null,
 *   criticalUnsupported: boolean,
 *   legacyPackage: object|null,
 *   projectionPackage: object|null,
 *   resolverError?: boolean,
 * }} input
 */
export function resolveLiveRenderSource(input) {
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

  /** @param {LiveRenderReason} reason */
  const legacyResult = (reason) =>
    Object.freeze({
      primarySource: /** @type {const} */ ('legacy'),
      reason,
      primaryPackage: legacyPackage,
      packages,
      acceptance,
      authoritative: false,
    });

  if (input.resolverError) {
    return legacyResult('resolver_error');
  }
  if (!input.renderCutoverEnabled) {
    return legacyResult('render_cutover_disabled');
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
  if (input.criticalUnsupported) {
    return legacyResult('unsupported_critical_section');
  }

  return Object.freeze({
    primarySource: /** @type {const} */ ('projection'),
    reason: /** @type {const} */ ('accepted_projection_render'),
    primaryPackage: projectionPackage,
    packages,
    acceptance,
    authoritative: false,
  });
}
