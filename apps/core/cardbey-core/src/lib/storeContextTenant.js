/**
 * Resolve tenantId for GET /api/store/.../context responses.
 * Tenant scope uses the store owner's User.id (Business.userId), not a literal "missing" placeholder.
 */

export class StoreContextTenantError extends Error {
  /**
   * @param {string} message
   * @param {string} [code]
   * @param {number} [statusCode]
   */
  constructor(message, code = 'tenant_id_unresolved', statusCode = 500) {
    super(message);
    this.name = 'StoreContextTenantError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

/**
 * @param {unknown} value
 * @returns {string | null}
 */
function normalizeId(value) {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s || s === 'missing') return null;
  return s;
}

/**
 * Prefer the store owner's user id; fall back to the authenticated viewer's user id.
 *
 * @param {{ authUserId?: string | null, business?: { userId?: string | null } | null }} params
 * @returns {string | null}
 */
export function resolveStoreContextTenantId({ authUserId, business }) {
  const ownerUserId = normalizeId(business?.userId);
  if (ownerUserId) return ownerUserId;
  return normalizeId(authUserId);
}

/**
 * @param {string | null} tenantId
 * @param {{ storeId?: string | null, allowTempWithoutTenant?: boolean }} [options]
 * @returns {string | null}
 */
export function requireStoreContextTenantId(tenantId, options = {}) {
  const resolved = normalizeId(tenantId);
  if (resolved) return resolved;

  const storeId = options.storeId != null ? String(options.storeId).trim() : '';
  if (options.allowTempWithoutTenant && (!storeId || storeId === 'temp')) {
    return null;
  }

  throw new StoreContextTenantError(
    `Could not resolve tenantId for store context (storeId=${storeId || 'unknown'})`,
  );
}

/**
 * @param {import('express').Response} res
 * @param {unknown} error
 * @returns {boolean} true when handled
 */
export function respondStoreContextTenantError(res, error) {
  if (!(error instanceof StoreContextTenantError)) return false;
  res.status(error.statusCode).json({
    ok: false,
    error: error.code,
    message: error.message,
  });
  return true;
}
