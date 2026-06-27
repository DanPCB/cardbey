/**
 * In-memory dashboard surface heartbeat for System Observation (Phase 3).
 * Updated when Control Center loads; used to enrich frontend component probes.
 */

/** @typedef {Record<string, { available?: boolean; route?: string; note?: string }>} SurfaceMap */

/** @type {{ commitSha?: string; buildTime?: string | null; appVersion?: string; environment?: string; surfaces?: SurfaceMap; timestamp?: string; receivedAt?: string; userId?: string | null } | null} */
let lastHeartbeat = null;

const DEFAULT_STALE_MS = 5 * 60 * 1000;

function getStaleMs() {
  const raw = Number(process.env.SYSTEM_OBSERVATION_HEARTBEAT_STALE_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_STALE_MS;
}

/**
 * @param {Record<string, unknown>} payload
 * @param {{ userId?: string | null }} [meta]
 */
export function recordFrontendHeartbeat(payload, meta = {}) {
  lastHeartbeat = {
    commitSha: payload.commitSha ? String(payload.commitSha) : undefined,
    buildTime: payload.buildTime != null ? String(payload.buildTime) : null,
    appVersion: payload.appVersion ? String(payload.appVersion) : undefined,
    environment: payload.environment ? String(payload.environment) : undefined,
    surfaces:
      payload.surfaces && typeof payload.surfaces === 'object'
        ? /** @type {SurfaceMap} */ (payload.surfaces)
        : {},
    timestamp: payload.timestamp ? String(payload.timestamp) : new Date().toISOString(),
    receivedAt: new Date().toISOString(),
    userId: meta.userId ?? null,
  };
  return lastHeartbeat;
}

export function getFrontendHeartbeat() {
  return lastHeartbeat;
}

export function isFrontendHeartbeatStale() {
  if (!lastHeartbeat?.receivedAt) return true;
  const age = Date.now() - new Date(lastHeartbeat.receivedAt).getTime();
  return age > getStaleMs();
}

export function resetFrontendHeartbeatForTests() {
  lastHeartbeat = null;
}
