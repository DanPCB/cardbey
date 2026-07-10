/**
 * In-memory provider search cache (rate-limit friendly, not final-image cache).
 */

const CACHE = new Map();
const MAX_ENTRIES = 500;

/**
 * @param {string} provider
 * @param {string} canonicalService
 * @param {string} query
 * @param {string} [orientation]
 */
export function buildServiceImageSearchCacheKey(provider, canonicalService, query, orientation = 'square') {
  return `${provider}:${canonicalService.toLowerCase()}:${query.toLowerCase()}:${orientation}`;
}

/**
 * @param {string} key
 */
export function getCachedServiceImageSearch(key) {
  const row = CACHE.get(key);
  if (!row) return null;
  if (Date.now() - row.at > row.ttlMs) {
    CACHE.delete(key);
    return null;
  }
  return row.value;
}

/**
 * @param {string} key
 * @param {unknown} value
 * @param {number} [ttlMs]
 */
export function setCachedServiceImageSearch(key, value, ttlMs = 15 * 60 * 1000) {
  if (CACHE.size >= MAX_ENTRIES) {
    const first = CACHE.keys().next().value;
    if (first) CACHE.delete(first);
  }
  CACHE.set(key, { value, at: Date.now(), ttlMs });
}

export function clearServiceImageSearchCache() {
  CACHE.clear();
}
