/**
 * Shared identity for non-production Bearer `dev-admin-token`.
 * Must resolve to a real User.id (never the legacy placeholder `dev-user-id`).
 */

/**
 * @returns {string}
 */
export function resolveDevAdminUserId() {
  const id = String(process.env.DEV_USER_ID || '').trim();
  if (!id || id === 'dev-user-id' || id === 'dev-admin' || id === 'temp') {
    const err = new Error(
      'DEV_USER_ID must be set in .env to a real User.id for dev-admin-token to work (do not use "dev-user-id")',
    );
    err.code = 'DEV_USER_ID_REQUIRED';
    throw err;
  }
  return id;
}

/**
 * @returns {{
 *   id: string,
 *   email: string,
 *   displayName: string,
 *   roles: string,
 *   role: string,
 *   emailVerified: boolean,
 *   isDevAdmin: true,
 *   isSuperAdmin: true,
 *   business: null,
 * }}
 */
export function buildDevAdminUser() {
  return {
    id: resolveDevAdminUserId(),
    email: process.env.DEV_USER_EMAIL || 'dev@cardbey.local',
    displayName: process.env.DEV_USER_NAME || 'Dev Admin',
    roles: '["super_admin"]',
    role: 'super_admin',
    emailVerified: true,
    isDevAdmin: true,
    isSuperAdmin: true,
    business: null,
  };
}
