/**
 * Authorization helpers: role checks and guards.
 * Role is stored in User.role (owner | staff | viewer | admin | super_admin).
 * Only backend/CLI may set role; client must never send or change role.
 */

/**
 * Check if user has the given role (case-insensitive; DB uses lowercase).
 * @param {object} user - User object with .role
 * @param {string} role - Role to check (e.g. 'SUPER_ADMIN', 'super_admin', 'admin')
 * @returns {boolean}
 */
export function hasRole(user, role) {
  if (!user || role == null) return false;
  const r = String(role).trim().toLowerCase();
  const userRole = (user.role && String(user.role).trim().toLowerCase()) || '';
  return userRole === r;
}

/**
 * Platform Control Center / admin metrics access.
 * Accepts legacy admin, super_admin, platform_admin, and dev-admin in non-production.
 * @param {object | null | undefined} user
 * @returns {boolean}
 */
export function isPlatformAdmin(user) {
  if (!user) return false;
  if (
    hasRole(user, 'admin') ||
    hasRole(user, 'super_admin') ||
    hasRole(user, 'platform_admin')
  ) {
    return true;
  }
  if (process.env.NODE_ENV !== 'production' && user.isDevAdmin === true) {
    return true;
  }
  const rolesRaw = user.roles;
  if (typeof rolesRaw === 'string' && rolesRaw.trim()) {
    try {
      const parsed = JSON.parse(rolesRaw);
      if (Array.isArray(parsed)) {
        const normalized = parsed.map((r) => String(r).trim().toLowerCase());
        if (
          normalized.includes('admin') ||
          normalized.includes('super_admin') ||
          normalized.includes('platform_admin')
        ) {
          return true;
        }
      }
    } catch {
      /* ignore malformed roles JSON */
    }
  }
  return false;
}

/**
 * Middleware: require super_admin. Use after requireAuth.
 * Returns 403 if user is not super_admin.
 */
export function requireSuperAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      ok: false,
      error: 'unauthorized',
      message: 'Authentication required',
    });
  }
  if (hasRole(req.user, 'super_admin')) {
    return next();
  }
  // Local dev: Bearer dev-admin-token sets isDevAdmin on req.user (see requireAuth).
  if (process.env.NODE_ENV !== 'production' && req.user?.isDevAdmin === true) {
    return next();
  }
  return res.status(403).json({
    ok: false,
    error: 'forbidden',
    message: 'Super admin access required',
  });
}
