/**
 * Resolve which view model a controlled draft preview should use.
 * Public publish / canonical live routes must not call this for authority.
 */

import {
  isDesignLibraryV1Enabled,
  isDesignLibraryAuthoritative,
  isStorefrontProjectionAcceptanceEnabled,
  isStorefrontProjectionPreviewEnabled,
} from '../flags.js';
import { canAccessProjectionPreview } from '../rendering/projectionPreviewAccess.js';
import { buildProjectionPreviewPayload } from '../rendering/applyDesignLibraryRenderShadow.js';
import { fingerprintProjection, readAcceptanceFromMeta } from './acceptanceRecord.js';
import { isAcceptanceCurrent } from './acceptanceValidator.js';

/**
 * @param {{
 *   catalog: object,
 *   draft?: object,
 *   actor?: object,
 *   context?: Record<string, unknown>,
 *   preferAccepted?: boolean,
 * }} input
 * @returns {{
 *   source: 'legacy'|'design_library_projection',
 *   viewModel: object|null,
 *   acceptance: object|null,
 *   reason: string,
 *   authoritative: false,
 * }}
 */
export function resolveAcceptedPreviewSource(input) {
  void isDesignLibraryAuthoritative();
  const catalog = input.catalog;
  const actor = input.actor;
  const draft = input.draft;
  const context = input.context ?? {};

  if (!isDesignLibraryV1Enabled() || !isStorefrontProjectionAcceptanceEnabled()) {
    return legacyResult('acceptance_disabled');
  }
  if (!isStorefrontProjectionPreviewEnabled()) {
    return legacyResult('preview_flag_off');
  }
  if (
    !canAccessProjectionPreview(actor, {
      ownerUserId: draft?.ownerUserId ?? context.ownerUserId,
    })
  ) {
    return legacyResult('actor_not_authorised');
  }

  const acceptance = readAcceptanceFromMeta(catalog?.meta);
  if (!acceptance || acceptance.status !== 'accepted') {
    return legacyResult('not_accepted');
  }
  if (!acceptance.applyToDraftPreview) {
    return legacyResult('apply_to_draft_preview_false');
  }

  const projection = catalog?.meta?.designLibraryStorefrontProjection;
  if (!projection) {
    return legacyResult('projection_missing');
  }

  const fingerprint = fingerprintProjection(
    projection,
    catalog?.meta?.designLibraryRenderShadow?.projectedViewModelSummary,
  );
  if (!isAcceptanceCurrent(acceptance, fingerprint)) {
    return legacyResult('acceptance_stale');
  }

  if (input.preferAccepted === false) {
    return legacyResult('prefer_legacy');
  }

  const payload = buildProjectionPreviewPayload(catalog, context);
  if (!payload.ok || !payload.viewModel) {
    return legacyResult('view_model_build_failed');
  }

  return Object.freeze({
    source: /** @type {const} */ ('design_library_projection'),
    viewModel: payload.viewModel,
    acceptance,
    reason: 'accepted_apply_to_draft_preview',
    authoritative: false,
  });
}

/** @param {string} reason */
function legacyResult(reason) {
  return Object.freeze({
    source: /** @type {const} */ ('legacy'),
    viewModel: null,
    acceptance: null,
    reason,
    authoritative: false,
  });
}
