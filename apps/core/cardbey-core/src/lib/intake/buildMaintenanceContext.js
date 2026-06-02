/**
 * Build execution context for Performer maintenance routes (/maintenance/*).
 * Restored from maintenance pipeline refactor — omitted from staging merge.
 */

export function buildMaintenanceContext(req, overrides = {}) {
  return {
    missionType: 'MAINTENANCE',
    userRole: 'super_admin',
    operatorSession: req.operatorSession === true,
    maintenanceToken: req.headers?.['x-maintenance-token'] ?? null,
    missionId: req.body?.missionId ?? null,
    storeId: req.body?.storeId ?? null,
    userId: req.user?.id ?? req.userId ?? null,
    errorType: req.body?.errorType ?? 'unknown',
    ...overrides,
  };
}
