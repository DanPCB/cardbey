/**
 * ENABLE_DESIGN_LIBRARY_V1
 *
 * Flag OFF (default in production):
 *   - No production behavior changes
 *   - Template library + renderer remain authoritative for generation/render
 *
 * Flag ON (default in non-production when unset):
 *   - Registries and adapters may be read for diagnostics
 *   - Phase 2: classification metadata attached to research/suggested catalog rows
 *   - Still MUST NOT alter rendering, blueprint selection, or CTA authority
 *     (isDesignLibraryAuthoritative() remains false)
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

/**
 * @returns {boolean}
 */
export function isDesignLibraryV1Enabled() {
  const raw = process.env.ENABLE_DESIGN_LIBRARY_V1;
  if (raw != null && String(raw).trim() !== '') {
    return parseBoolEnv(raw, false);
  }
  // Staging Render uses NODE_ENV=production + CARDEY_DEPLOY_ENV=staging
  const deployEnv = String(process.env.CARDEY_DEPLOY_ENV || process.env.RENDER_SERVICE_NAME || '')
    .trim()
    .toLowerCase();
  if (deployEnv.includes('staging') || deployEnv === 'development' || deployEnv === 'dev') {
    return true;
  }
  return process.env.NODE_ENV !== 'production';
}

/**
 * Phase 1: even when enabled, live generation/render paths must ignore this library.
 * Use this guard in any future integration — always false for authority in Phase 1.
 */
export function isDesignLibraryAuthoritative() {
  return false;
}
