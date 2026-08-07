/**
 * Separate discovery cache namespaces — do not mix projection / metadata / schema / etc.
 */

export const DISCOVERY_CACHE_NAMESPACES = Object.freeze({
  PROJECTION: 'projection',
  METADATA: 'metadata',
  SCHEMA: 'schema',
  SOCIAL: 'social',
  AI: 'ai',
  DIRECTORY: 'directory',
  SITEMAP: 'sitemap',
});

export const DISCOVERY_CACHE_NAMESPACE_LIST = Object.freeze(
  Object.values(DISCOVERY_CACHE_NAMESPACES),
);

/**
 * @param {string} namespace
 * @returns {boolean}
 */
export function isDiscoveryCacheNamespace(namespace) {
  return DISCOVERY_CACHE_NAMESPACE_LIST.includes(namespace);
}
