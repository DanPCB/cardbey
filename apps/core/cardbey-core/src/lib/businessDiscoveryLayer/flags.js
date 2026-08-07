/**
 * Business Discovery Layer (BDL) flags — Phase 4 foundation.
 *
 * Fail-closed. isBusinessDiscoveryAuthoritative() remains false —
 * no public consumer cutover (SEO, AI, directory, storefront) in this phase.
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

/** Fail-closed: production off unless explicitly enabled. */
function failClosedFlag(envName) {
  const raw = process.env[envName];
  if (raw != null && String(raw).trim() !== '') {
    return parseBoolEnv(raw, false);
  }
  return false;
}

/** Foundation contracts + projection builder (non-prod default on). */
export function isBusinessDiscoveryLayerV1Enabled() {
  const raw = process.env.ENABLE_BUSINESS_DISCOVERY_LAYER_V1;
  if (raw != null && String(raw).trim() !== '') {
    return parseBoolEnv(raw, false);
  }
  return isNonProductionDeploy();
}

/** Projection engine may build from published artifacts. */
export function isBusinessDiscoveryProjectionV1Enabled() {
  if (!isBusinessDiscoveryLayerV1Enabled()) return false;
  const raw = process.env.ENABLE_BUSINESS_DISCOVERY_PROJECTION_V1;
  if (raw != null && String(raw).trim() !== '') {
    return parseBoolEnv(raw, false);
  }
  return isNonProductionDeploy();
}

/** Validation gate for publishable discovery state. */
export function isBusinessDiscoveryValidationV1Enabled() {
  if (!isBusinessDiscoveryProjectionV1Enabled()) return false;
  const raw = process.env.ENABLE_BUSINESS_DISCOVERY_VALIDATION_V1;
  if (raw != null && String(raw).trim() !== '') {
    return parseBoolEnv(raw, false);
  }
  return isNonProductionDeploy();
}

/** In-process discovery events (no external bus yet). */
export function isBusinessDiscoveryEventsV1Enabled() {
  if (!isBusinessDiscoveryLayerV1Enabled()) return false;
  const raw = process.env.ENABLE_BUSINESS_DISCOVERY_EVENTS_V1;
  if (raw != null && String(raw).trim() !== '') {
    return parseBoolEnv(raw, false);
  }
  return isNonProductionDeploy();
}

/** Namespaced discovery caches (in-memory foundation). */
export function isBusinessDiscoveryCacheV1Enabled() {
  if (!isBusinessDiscoveryProjectionV1Enabled()) return false;
  const raw = process.env.ENABLE_BUSINESS_DISCOVERY_CACHE_V1;
  if (raw != null && String(raw).trim() !== '') {
    return parseBoolEnv(raw, false);
  }
  return isNonProductionDeploy();
}

/**
 * Consumer cutovers (SEO, AI, directory, social emit) — always fail-closed in Phase 4.
 * Reserved for later phases; unset env never enables.
 */
export function isBusinessDiscoveryConsumerCutoverV1Enabled() {
  return failClosedFlag('ENABLE_BUSINESS_DISCOVERY_CONSUMER_CUTOVER_V1');
}

/** Multilingual SEO consumer — Stage 6; always off until explicitly enabled later. */
export function isBusinessDiscoverySeoConsumerV1Enabled() {
  if (!isBusinessDiscoveryConsumerCutoverV1Enabled()) return false;
  return failClosedFlag('ENABLE_BUSINESS_DISCOVERY_SEO_CONSUMER_V1');
}

/**
 * Locked: BDL is not authoritative for public responses in Phase 4.
 * Consumers must continue using existing publish/public paths.
 */
export function isBusinessDiscoveryAuthoritative() {
  return false;
}
