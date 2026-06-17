/**
 * Permission hook bypass rules for test, development, and staging smoke probes.
 * Production (non-staging) always enforces store ownership unless explicitly allowlisted
 * via env SLO_TEST_STORE_IDS for controlled smoke checks.
 */

/** @type {Set<string>} */
export const TEST_STORE_ALLOWLIST = new Set([
  'test',
  'test-store',
  'cmqi1y4ss002fmzf1piirwrjd',
]);

function parseExtraAllowlist() {
  const raw = String(process.env.SLO_TEST_STORE_IDS ?? '').trim();
  if (!raw) return [];
  return raw
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
}

export function isStagingDeploy() {
  return (
    process.env.CARDEY_DEPLOY_ENV === 'staging' ||
    String(process.env.RENDER_SERVICE_NAME || '')
      .toLowerCase()
      .includes('staging')
  );
}

export function isNonProductionRuntime() {
  const env = String(process.env.NODE_ENV || '').toLowerCase();
  return env === 'test' || env === 'development' || isStagingDeploy();
}

/**
 * @param {string | null | undefined} storeId
 */
export function isTestStoreId(storeId) {
  const id = String(storeId ?? '').trim();
  if (!id) return false;
  if (TEST_STORE_ALLOWLIST.has(id)) return true;
  if (id === 'test' || id.startsWith('test-')) return true;
  for (const extra of parseExtraAllowlist()) {
    if (id === extra) return true;
  }
  return false;
}

/**
 * @param {string | null | undefined} userId
 */
export function isTestUserId(userId) {
  const id = String(userId ?? '').trim();
  if (!id) return false;
  return id === 'test-user' || id === 'test-user-id' || id.startsWith('test-');
}

/**
 * @param {{ userId?: string | null; storeId?: string | null; source?: string | null }} [ctx]
 */
export function shouldBypassPermissionValidation(ctx = {}) {
  const userId = String(ctx.userId ?? '').trim();
  const storeId = String(ctx.storeId ?? '').trim();
  const source = String(ctx.source ?? '').trim().toLowerCase();

  const isProd = String(process.env.NODE_ENV || '').toLowerCase() === 'production' && !isStagingDeploy();
  if (isProd) {
    return false;
  }

  if (source === 'smoke_test' || source === 'slo_probe') {
    return true;
  }

  if (isStagingDeploy() && (isTestStoreId(storeId) || isTestUserId(userId))) {
    return true;
  }

  if (isNonProductionRuntime() && (isTestStoreId(storeId) || isTestUserId(userId))) {
    return true;
  }

  return false;
}

/**
 * Synthetic store row for hooks when bypassing permission checks.
 *
 * @param {string} storeId
 * @param {string} [userId]
 */
export function syntheticBypassStore(storeId, userId) {
  return {
    id: storeId,
    name: `Test Store (${storeId})`,
    userId: userId || 'test-user',
    isActive: true,
    bypass: true,
  };
}
