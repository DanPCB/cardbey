/**
 * Provider registration — Platform, Store, Performer, Discovery, Campaign.
 */

/** @type {Map<string, import('../sharedTypes/index.js').CtaProvider>} */
const providers = new Map();

/**
 * @param {import('../sharedTypes/index.js').CtaProvider} provider
 */
export function registerProvider(provider) {
  if (!provider?.id) throw new Error('registerProvider: id required');
  if (typeof provider.listCapabilities !== 'function') {
    throw new Error(`registerProvider: listCapabilities required for ${provider.id}`);
  }
  if (typeof provider.listVariants !== 'function') {
    throw new Error(`registerProvider: listVariants required for ${provider.id}`);
  }
  providers.set(provider.id, provider);
  return provider;
}

/**
 * @param {string} id
 * @returns {import('../sharedTypes/index.js').CtaProvider | null}
 */
export function getProvider(id) {
  return providers.get(String(id || '').trim()) ?? null;
}

/**
 * @returns {import('../sharedTypes/index.js').CtaProvider[]}
 */
export function listProviders() {
  return [...providers.values()];
}

/** @internal */
export function _resetProvidersForTests() {
  providers.clear();
}
