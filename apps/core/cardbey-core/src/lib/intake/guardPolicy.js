export const SUPER_ADMIN_GUARD_POLICY = {
  // Role that must appear in x-performer-role header or body.userRole
  requiredRole: 'super_admin',

  // Header name carrying the static secret token
  tokenHeader: 'x-maintenance-token',

  // Env var that holds the expected token value.
  // If the env var is not set, ALL maintenance requests are rejected.
  tokenEnvVar: 'PERFORMER_MAINTENANCE_SECRET',

  // Env var holding comma-separated allowed IPs (optional).
  // If not set or empty, IP check is skipped.
  ipAllowlistEnvVar: 'PERFORMER_MAINTENANCE_IP_ALLOWLIST',
};

export function assertSuperAdmin(req) {
  const policy = SUPER_ADMIN_GUARD_POLICY;
  const violations = [];

  // ── Layer 1: token check ───────────────────────────────────
  const expectedToken = process.env[policy.tokenEnvVar];

  if (!expectedToken) {
    // Env var not configured — fail closed, never open
    violations.push(
      `${policy.tokenEnvVar} is not set. ` +
      'Maintenance endpoint is disabled until this is configured.',
    );
  } else {
    const providedToken = req.headers?.[policy.tokenHeader];
    if (!providedToken || providedToken !== expectedToken) {
      violations.push(
        `Invalid or missing ${policy.tokenHeader} token.`,
      );
    }
  }

  // ── Layer 2: role check ────────────────────────────────────
  const role = (
    req.body?.userRole ??
    req.headers?.['x-performer-role'] ??
    ''
  ).toLowerCase();

  if (role !== policy.requiredRole) {
    violations.push(
      `Role "${role}" is not authorised. ` +
      `Required: "${policy.requiredRole}".`,
    );
  }

  // ── Layer 3: IP allowlist (optional) ──────────────────────
  const rawAllowlist = process.env[policy.ipAllowlistEnvVar] ?? '';
  if (rawAllowlist.trim()) {
    const allowedIps = rawAllowlist
      .split(',')
      .map((ip) => ip.trim())
      .filter(Boolean);

    const requestIp =
      req.headers?.['x-forwarded-for']?.split(',')[0]?.trim() ??
      req.socket?.remoteAddress ??
      '';

    if (!allowedIps.includes(requestIp)) {
      violations.push(
        `Request IP "${requestIp}" is not in the maintenance allowlist.`,
      );
    }
  }

  // ── Verdict ────────────────────────────────────────────────
  if (violations.length > 0) {
    const err = new Error('GUARD_POLICY_VIOLATION');
    err.violations = violations;
    err.statusCode = 403;
    throw err;
  }
}

export function superAdminOnly(req, res, next) {
  try {
    assertSuperAdmin(req);
    next();
  } catch (err) {
    if (err.message === 'GUARD_POLICY_VIOLATION') {
      // Never reveal which specific layer failed in production
      const isDev = process.env.NODE_ENV !== 'production';
      return res.status(err.statusCode ?? 403).json({
        error: 'Access denied.',
        ...(isDev ? { violations: err.violations } : {}),
      });
    }
    // Unexpected error — pass to Express error handler
    next(err);
  }
}
