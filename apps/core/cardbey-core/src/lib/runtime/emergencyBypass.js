/**
 * EMERGENCY USE ONLY — catastrophic rollback for kernel-mandatory mode.
 * Must never be enabled in normal operation.
 */

function envTruthy(name) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || String(raw).trim() === '') return false;
  const v = String(raw).trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

export const EMERGENCY_BYPASS = {
  get enabled() {
    return envTruthy('EMERGENCY_BYPASS_KERNEL');
  },

  /**
   * @param {string} reason
   * @param {string} route
   * @param {string|null} [userId]
   */
  logBypass(reason, route, userId = null) {
    console.error(
      `[EMERGENCY_BYPASS_KERNEL] reason=${reason} route=${route}${userId ? ` userId=${userId}` : ''}`,
    );
  },
};

export function isEmergencyBypassEnabled() {
  return EMERGENCY_BYPASS.enabled;
}
