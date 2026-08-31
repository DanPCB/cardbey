/**
 * Phase 8B — choose legacy vs projection publish snapshot (fail closed).
 */

import { isDesignLibraryAuthoritative } from '../flags.js';

/**
 * @param {{
 *   publishCutoverEnabled: boolean,
 *   acceptanceEnabled: boolean,
 *   acceptanceRecord: object|null,
 *   currentProjectionFingerprint: string|null,
 *   projectionPackageOk: boolean,
 *   legacyPreview: object,
 *   projectionPreview: object|null,
 * }} input
 */
export function resolvePublishSnapshotSource(input) {
  void isDesignLibraryAuthoritative();

  const legacyPreview = input.legacyPreview;
  const projectionPreview = input.projectionPreview ?? null;

  /** @param {string} reason */
  const legacy = (reason) =>
    Object.freeze({
      primarySource: /** @type {const} */ ('legacy'),
      reason,
      previewOverride: legacyPreview,
      authoritative: false,
    });

  if (!input.publishCutoverEnabled) {
    return legacy('publish_cutover_disabled');
  }
  if (!input.acceptanceEnabled) {
    return legacy('no_acceptance');
  }

  const acceptance = input.acceptanceRecord;
  if (
    !acceptance ||
    acceptance.status !== 'accepted' ||
    acceptance.applyToDraftPreview !== true
  ) {
    return legacy('no_acceptance');
  }

  const fingerprintMatches = Boolean(
    acceptance.projectionFingerprint &&
      input.currentProjectionFingerprint &&
      acceptance.projectionFingerprint === input.currentProjectionFingerprint,
  );
  if (!fingerprintMatches) {
    return legacy('acceptance_stale');
  }

  if (!input.projectionPackageOk || !projectionPreview) {
    return legacy('projection_package_invalid');
  }

  return Object.freeze({
    primarySource: /** @type {const} */ ('projection'),
    reason: /** @type {const} */ ('accepted_projection_publish'),
    previewOverride: projectionPreview,
    authoritative: false,
  });
}
