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
  if (!hasRole(req.user, 'super_admin')) {
    return res.status(403).json({
      ok: false,
      error: 'forbidden',
      message: 'Super admin access required',
    });
  }
  next();
}
