/**
 * In-memory observability for POST /api/device/request-pairing (device-initiated).
 * Helps identify which IP/client is spamming pairing while a device is already paired elsewhere.
 *
 * Dev-only popup suppression: does not change HTTP response body/status.
 * Set DISABLE_PAIRING_POPUP_SUPPRESS_DEV=1 to always emit dashboard events in development.
 */

const WINDOW_MS = 25_000;
const MAX_ENTRIES_PER_IP = 24;

/** @type {Map<string, Array<{ t: number, sessionId?: string, code?: string, hadDeviceId: boolean, platform?: string | null, deviceModel?: string | null, userAgentSnippet?: string }>>} */
const ipHistory = new Map();

export function normalizePairingClientIp(ip) {
  if (ip == null || ip === '') return 'unknown';
  return String(ip).replace(/^::ffff:/i, '');
}

function pruneWindow(ip, now = Date.now()) {
  let arr = ipHistory.get(ip) || [];
  arr = arr.filter((e) => now - e.t < WINDOW_MS);
  return arr;
}

/**
 * Structured log for every pairing request (before DB work).
 * @param {object} meta
 */
export function logPairingRequestIngress(meta) {
  console.log('[PAIRING_REQUEST]', {
    timestamp: new Date().toISOString(),
    remoteIp: meta.remoteIp,
    userAgent: meta.userAgent ?? null,
    platform: meta.platform ?? null,
    engineVersion: meta.engineVersion ?? null,
    deviceIdFromBody: meta.deviceIdFromBody ?? null,
    deviceModel: meta.deviceModel ?? null,
    deviceType: meta.deviceType ?? null,
    tenantId: meta.tenantId ?? null,
    storeId: meta.storeId ?? null,
    requestId: meta.requestId ?? null,
    path: meta.path ?? null,
  });
}

/**
 * Compare this hit to recent hits from the same IP; log duplicate patterns.
 * Call before requestPairing (sessionId/code unknown yet).
 */
export function logPairingRequestPatternAnalysis(meta) {
  const now = Date.now();
  const ip = normalizePairingClientIp(meta.remoteIp);
  const hadDeviceId = !!(meta.deviceIdFromBody && String(meta.deviceIdFromBody).trim());
  const prior = pruneWindow(ip, now);

  const samePlatformModel =
    meta.platform &&
    prior.some(
      (e) =>
        e.platform === meta.platform &&
        (e.deviceModel || '') === (meta.deviceModel || '')
    );

  console.log('[PAIRING_REQUEST_PATTERN]', {
    timestamp: new Date().toISOString(),
    remoteIp: ip,
    priorRequestsInWindow: prior.length,
    windowMs: WINDOW_MS,
    hadDeviceIdInBody: hadDeviceId,
    missingStableDeviceIdentity: !hadDeviceId,
    sameIpAsPriorInWindow: prior.length > 0,
    samePlatformAndModelAsPrior: samePlatformModel,
    priorSessionIds: prior.map((e) => e.sessionId).filter(Boolean),
    priorPairingCodes: prior.map((e) => e.code).filter(Boolean),
  });
}

/**
 * Dev-only: suppress duplicate dashboard popups when the same IP repeats request-pairing
 * without a deviceId, within WINDOW_MS. First request in the window still emits events.
 */
export function shouldSuppressPairingDashboardPopupsDev({ remoteIp, deviceIdFromBody }) {
  if (process.env.NODE_ENV === 'production') return false;
  if (process.env.DISABLE_PAIRING_POPUP_SUPPRESS_DEV === '1') return false;
  const ip = normalizePairingClientIp(remoteIp);
  const hadDeviceId = !!(deviceIdFromBody && String(deviceIdFromBody).trim());
  if (hadDeviceId) return false;
  const prior = pruneWindow(ip, Date.now());
  return prior.length >= 1;
}

/**
 * Record outcome after successful pairing creation (for next request's pattern analysis).
 */
export function recordPairingRequestOutcome(remoteIp, outcome) {
  const ip = normalizePairingClientIp(remoteIp);
  const now = Date.now();
  let arr = pruneWindow(ip, now);
  arr.push({
    t: now,
    sessionId: outcome.sessionId,
    code: outcome.code,
    hadDeviceId: !!outcome.hadDeviceId,
    platform: outcome.platform ?? null,
    deviceModel: outcome.deviceModel ?? null,
    userAgentSnippet: (outcome.userAgent || '').slice(0, 160),
  });
  if (arr.length > MAX_ENTRIES_PER_IP) {
    arr = arr.slice(-MAX_ENTRIES_PER_IP);
  }
  ipHistory.set(ip, arr);
}
