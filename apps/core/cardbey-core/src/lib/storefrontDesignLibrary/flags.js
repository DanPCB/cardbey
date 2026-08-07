/**
 * Design Library + Phase 6 shadow/preview flags.
 *
 * ENABLE_DESIGN_LIBRARY_V1
 *   OFF (default in production): no advisory metadata
 *   ON (default non-prod / staging when unset): Phases 1–5 advisory metadata
 *
 * ENABLE_STOREFRONT_PROJECTION_SHADOW_V1
 *   OFF (default in production): no shadow comparison metadata
 *   ON: build projected render VM + compare to legacy (no public UI change)
 *
 * ENABLE_STOREFRONT_PROJECTION_PREVIEW_V1
 *   OFF (default in production): no projected preview mode
 *   ON: authorised owner/admin/dev preview only (public URL stays legacy)
 *
 * ENABLE_STOREFRONT_PROJECTION_ACCEPTANCE_V1
 *   OFF (default in production): no owner accept/reject workflow
 *   ON: per-draft acceptance of recommended structure for controlled preview only
 *
 * ENABLE_STOREFRONT_PROJECTION_PREVIEW_RENDER_V1
 *   OFF (default in production): preview primary stays legacy; no projection render priority
 *   ON: authorised preview may use accepted projection as primary render source (not public)
 *
 * ENABLE_STOREFRONT_PROJECTION_PUBLISH_V1
 *   OFF (default in production): draft-store publish always uses legacy snapshot
 *   ON: accepted + fingerprint-valid projection may become the publish snapshot for that draft only
 *
 * ENABLE_STOREFRONT_PROJECTION_RENDER_CUTOVER_V1
 *   OFF (default in production): draft/public storefront renderer stays legacy
 *   ON: accepted + fingerprint-valid projection may drive the storefront renderer for that draft
 *       (automatic legacy fallback). Does not change publish cutover or global authority.
 *
 * isDesignLibraryAuthoritative() remains false — no global production cutover.
 */

function parseBoolEnv(raw, defaultValue) {
  const normalized = String(raw ?? '').trim().toLowerCase();
  if (normalized === 'false' || normalized === '0' || normalized === 'off' || normalized === 'no') {
    return false;
  }
  if (normalized === 'true' || normalized === '1' || normalized === 'on' || normalized === 'yes') {
    return true;
  }
  return defaultValue;
}

function isNonProductionDeploy() {
  const deployEnv = String(process.env.CARDEY_DEPLOY_ENV || process.env.RENDER_SERVICE_NAME || '')
    .trim()
    .toLowerCase();
  if (deployEnv.includes('staging') || deployEnv === 'development' || deployEnv === 'dev') {
    return true;
  }
  return process.env.NODE_ENV !== 'production';
}

/**
 * @returns {boolean}
 */
export function isDesignLibraryV1Enabled() {
  const raw = process.env.ENABLE_DESIGN_LIBRARY_V1;
  if (raw != null && String(raw).trim() !== '') {
    return parseBoolEnv(raw, false);
  }
  return isNonProductionDeploy();
}

/**
 * Shadow comparison — requires design library on. Default off in production.
 * @returns {boolean}
 */
export function isStorefrontProjectionShadowEnabled() {
  if (!isDesignLibraryV1Enabled()) return false;
  const raw = process.env.ENABLE_STOREFRONT_PROJECTION_SHADOW_V1;
  if (raw != null && String(raw).trim() !== '') {
    return parseBoolEnv(raw, false);
  }
  return isNonProductionDeploy();
}

/**
 * Authorised projection preview — requires design library on. Default off in production.
 * @returns {boolean}
 */
export function isStorefrontProjectionPreviewEnabled() {
  if (!isDesignLibraryV1Enabled()) return false;
  const raw = process.env.ENABLE_STOREFRONT_PROJECTION_PREVIEW_V1;
  if (raw != null && String(raw).trim() !== '') {
    return parseBoolEnv(raw, false);
  }
  return isNonProductionDeploy();
}

/**
 * Per-draft acceptance workflow — requires design library on. Default off in production.
 * @returns {boolean}
 */
export function isStorefrontProjectionAcceptanceEnabled() {
  if (!isDesignLibraryV1Enabled()) return false;
  const raw = process.env.ENABLE_STOREFRONT_PROJECTION_ACCEPTANCE_V1;
  if (raw != null && String(raw).trim() !== '') {
    return parseBoolEnv(raw, false);
  }
  return isNonProductionDeploy();
}

/**
 * Accepted-projection preview render priority — requires design library on.
 * Default off in production. Does not affect public or publish paths.
 * @returns {boolean}
 */
export function isStorefrontProjectionPreviewRenderEnabled() {
  if (!isDesignLibraryV1Enabled()) return false;
  const raw = process.env.ENABLE_STOREFRONT_PROJECTION_PREVIEW_RENDER_V1;
  if (raw != null && String(raw).trim() !== '') {
    return parseBoolEnv(raw, false);
  }
  return isNonProductionDeploy();
}

/**
 * Controlled projection publish cutover — draft-store snapshot publish only.
 * Default off in production. Never sets global authority.
 * @returns {boolean}
 */
export function isStorefrontProjectionPublishEnabled() {
  if (!isDesignLibraryV1Enabled()) return false;
  const raw = process.env.ENABLE_STOREFRONT_PROJECTION_PUBLISH_V1;
  if (raw != null && String(raw).trim() !== '') {
    return parseBoolEnv(raw, false);
  }
  return isNonProductionDeploy();
}

/**
 * Per-draft projection → live storefront renderer cutover.
 * Requires design library. Default off in production. Never sets global authority.
 * @returns {boolean}
 */
export function isStorefrontProjectionRenderCutoverEnabled() {
  if (!isDesignLibraryV1Enabled()) return false;
  const raw = process.env.ENABLE_STOREFRONT_PROJECTION_RENDER_CUTOVER_V1;
  if (raw != null && String(raw).trim() !== '') {
    return parseBoolEnv(raw, false);
  }
  return isNonProductionDeploy();
}

/**
 * Live / global generation-render paths must ignore this library for authority.
 * Always false through Phase 8B / render cutover V1 (per-draft ≠ global authority).
 */
export function isDesignLibraryAuthoritative() {
  return false;
}
