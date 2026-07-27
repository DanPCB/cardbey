/**
 * Emergency rollback for runtime upload enforcement.
 * Set ENABLE_UPLOAD_BYPASS=true to allow legacy direct upload routes without authority.
 */

function envTruthy(name) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || String(raw).trim() === '') return false;
  const v = String(raw).trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

/** When true, legacy direct upload routes skip authority guard (emergency only). */
export function isUploadBypassEnabled() {
  return envTruthy('ENABLE_UPLOAD_BYPASS') || envTruthy('EMERGENCY_BYPASS_KERNEL');
}

/**
 * @param {string} routeLabel
 */
export function logUploadBypassWarning(routeLabel) {
  if (process.env.NODE_ENV === 'test') return;
  console.warn(
    `[UploadBypass] ENABLE_UPLOAD_BYPASS active — legacy route allowed without runtime authority: ${routeLabel}`,
  );
}
