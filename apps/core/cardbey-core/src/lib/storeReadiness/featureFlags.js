/**
 * Feature flags for Store Readiness (Core).
 */

function parseBoolEnv(raw, defaultValue = false) {
  const normalized = String(raw ?? '').trim().toLowerCase();
  if (normalized === 'false' || normalized === '0' || normalized === 'off') return false;
  if (normalized === 'true' || normalized === '1' || normalized === 'on') return true;
  return defaultValue;
}

export function isStoreReadinessV1Enabled() {
  return parseBoolEnv(process.env.ENABLE_STORE_READINESS_V1, false);
}

export function isPilSellerAssistantV1Enabled() {
  if (!isStoreReadinessV1Enabled()) return false;
  return parseBoolEnv(process.env.ENABLE_PIL_SELLER_ASSISTANT_V1, false);
}

/** Phase 3 governed drafts — requires readiness V1. */
export function isStoreReadinessDraftsV1Enabled() {
  if (!isStoreReadinessV1Enabled()) return false;
  return parseBoolEnv(process.env.ENABLE_STORE_READINESS_DRAFTS_V1, false);
}

export function getStoreReadinessFlags() {
  return {
    storeReadinessV1: isStoreReadinessV1Enabled(),
    pilSellerAssistantV1: isPilSellerAssistantV1Enabled(),
    storeReadinessDraftsV1: isStoreReadinessDraftsV1Enabled(),
  };
}
