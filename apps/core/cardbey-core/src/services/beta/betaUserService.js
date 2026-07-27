/**
 * Beta user service — controlled PIL rollout to chosen testers.
 * Env: CARDEY_BETA_USER_IDS (comma-separated user ids)
 *      CARDEY_BETA_PIL_CANARY_PERCENT (0–100, default 0)
 *      CARDEY_BETA_PIL_OPEN_STAGING=true → all users on staging
 */

/** @type {Set<string>} */
let allowlistCache = null;

/** @type {number | null} */
let runtimeCanaryOverride = null;

function parseAllowlistFromEnv() {
  const raw = String(process.env.CARDEY_BETA_USER_IDS ?? process.env.BETA_USER_ALLOWLIST ?? '').trim();
  if (!raw) return new Set();
  return new Set(
    raw
      .split(/[,;\s]+/)
      .map((id) => id.trim())
      .filter(Boolean),
  );
}

function getAllowlist() {
  if (!allowlistCache) allowlistCache = parseAllowlistFromEnv();
  return allowlistCache;
}

export function reloadBetaAllowlist() {
  allowlistCache = parseAllowlistFromEnv();
}

export function isStagingOpenRollout() {
  return (
    process.env.CARDEY_BETA_PIL_OPEN_STAGING === 'true' ||
    process.env.CARDEY_ENV === 'staging'
  );
}

export function getCanaryPercentage() {
  if (runtimeCanaryOverride != null) return runtimeCanaryOverride;
  const n = parseInt(String(process.env.CARDEY_BETA_PIL_CANARY_PERCENT ?? '0'), 10);
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, n));
}

export function setCanaryPercentage(percentage) {
  const n = Number(percentage);
  if (!Number.isFinite(n)) {
    throw new Error('Invalid canary percentage');
  }
  runtimeCanaryOverride = Math.min(100, Math.max(0, Math.floor(n)));
  console.log(`[Beta] PIL canary percentage set to ${runtimeCanaryOverride}%`);
  return runtimeCanaryOverride;
}

/** @internal test helper */
export function resetCanaryOverrideForTests() {
  runtimeCanaryOverride = null;
}

function hashCode(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function isBetaUser(userId) {
  if (!userId) return false;
  if (isStagingOpenRollout()) return true;
  return getAllowlist().has(String(userId));
}

export function isPILEnabledForUser(userId) {
  if (isStagingOpenRollout()) return true;
  if (!isBetaUser(userId)) return false;
  const pct = getCanaryPercentage();
  if (pct <= 0) return false;
  if (pct >= 100) return true;
  return hashCode(String(userId)) % 100 < pct;
}

export function isBriefingEnabledForUser(userId) {
  return isBetaUser(userId);
}

export function isConciergeEnabledForUser(userId) {
  return isBetaUser(userId);
}

export function getBetaRolloutSnapshot(userId) {
  return {
    pilEnabled: isPILEnabledForUser(userId),
    briefingEnabled: isBriefingEnabledForUser(userId),
    conciergeEnabled: isConciergeEnabledForUser(userId),
    isBetaUser: isBetaUser(userId),
    canaryPercentage: getCanaryPercentage(),
    stagingOpen: isStagingOpenRollout(),
    allowlistSize: getAllowlist().size,
  };
}
