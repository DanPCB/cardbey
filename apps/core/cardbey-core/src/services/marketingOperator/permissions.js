/**
 * Marketing operator permission resolution.
 * v1: platform_admin / super_admin / admin → full permission set.
 */

import { isPlatformAdmin } from '../../lib/authorization.js';
import { ALL_MARKETING_PERMISSIONS, PERMISSIONS } from './constants.js';

/**
 * @param {object | null | undefined} user
 * @returns {string[]}
 */
export function resolveMarketingPermissions(user) {
  if (!user) return [];
  if (isPlatformAdmin(user)) {
    return [...ALL_MARKETING_PERMISSIONS];
  }
  const raw = user.marketingPermissions;
  if (Array.isArray(raw)) {
    return raw.map((p) => String(p)).filter((p) => ALL_MARKETING_PERMISSIONS.includes(p));
  }
  return [];
}

/**
 * @param {object | null | undefined} user
 * @param {string} perm
 * @returns {boolean}
 */
export function hasMarketingPermission(user, perm) {
  if (!perm) return false;
  const set = resolveMarketingPermissions(user);
  if (set.includes(PERMISSIONS.MARKETING_ADMINISTRATOR)) return true;
  return set.includes(perm);
}

/**
 * Express middleware factory — 403 when permission missing.
 * @param {string} perm
 */
export function requireMarketingPermission(perm) {
  return function marketingPermissionGuard(req, res, next) {
    if (!hasMarketingPermission(req.user, perm)) {
      return res.status(403).json({
        ok: false,
        error: 'marketing_permission_denied',
        permission: perm,
      });
    }
    return next();
  };
}

export { PERMISSIONS };
