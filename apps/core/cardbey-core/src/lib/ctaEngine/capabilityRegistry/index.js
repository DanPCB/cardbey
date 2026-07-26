/**
 * First-class platform/store capability registry for the CTA Engine.
 */

/** @type {Map<string, import('../sharedTypes/index.js').CtaCapability>} */
const capabilities = new Map();

/**
 * @param {import('../sharedTypes/index.js').CtaCapability} capability
 * @returns {import('../sharedTypes/index.js').CtaCapability}
 */
export function registerCapability(capability) {
  if (!capability || typeof capability !== 'object') {
    throw new Error('registerCapability: capability required');
  }
  const id = String(capability.id || '').trim();
  if (!id) throw new Error('registerCapability: id required');
  if (!capability.title) throw new Error(`registerCapability: title required for ${id}`);
  if (!capability.provider) throw new Error(`registerCapability: provider required for ${id}`);

  /** @type {import('../sharedTypes/index.js').CtaCapability} */
  const row = {
    priority: 50,
    requiresAuth: false,
    supportedAudiences: ['guest', 'authenticated', 'visitor', 'owner'],
    requiredPermissions: [],
    requiredFeatureFlags: [],
    dependencies: [],
    ...capability,
    id,
  };
  capabilities.set(id, row);
  return row;
}

/**
 * @param {string} id
 * @returns {import('../sharedTypes/index.js').CtaCapability | null}
 */
export function getCapability(id) {
  const key = String(id || '').trim();
  return key ? capabilities.get(key) ?? null : null;
}

/**
 * @param {{ provider?: string, category?: string } | null | undefined} [filter]
 * @returns {import('../sharedTypes/index.js').CtaCapability[]}
 */
export function listCapabilities(filter = null) {
  const rows = [...capabilities.values()];
  if (!filter) return rows;
  return rows.filter((c) => {
    if (filter.provider && c.provider !== filter.provider) return false;
    if (filter.category && c.category !== filter.category) return false;
    return true;
  });
}

/** @internal test helper */
export function _resetCapabilityRegistryForTests() {
  capabilities.clear();
}
