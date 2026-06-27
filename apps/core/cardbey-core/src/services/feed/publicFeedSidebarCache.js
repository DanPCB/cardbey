/**
 * Short-lived in-memory cache for public feed sidebar responses.
 */

const DEFAULT_TTL_MS = 90_000;
const MAX_ENTRIES = 64;

/** @type {Map<string, { expiresAt: number; payload: unknown }>} */
const cache = new Map();

/**
 * @param {Record<string, unknown>} params
 */
export function buildSidebarCacheKey(params) {
  const parts = [
    params.lat ?? '',
    params.lng ?? '',
    params.city ?? '',
    params.category ?? '',
    params.limitPerSection ?? 5,
    params.viewerId ?? 'anon',
  ];
  return parts.join('|');
}

/**
 * @param {string} key
 * @returns {unknown | null}
 */
export function getSidebarCache(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.payload;
}

/**
 * @param {string} key
 * @param {unknown} payload
 * @param {number} [ttlMs]
 */
export function setSidebarCache(key, payload, ttlMs = DEFAULT_TTL_MS) {
  if (cache.size >= MAX_ENTRIES) {
    const first = cache.keys().next().value;
    if (first) cache.delete(first);
  }
  cache.set(key, { expiresAt: Date.now() + ttlMs, payload });
}

/** Test helper */
export function clearSidebarCache() {
  cache.clear();
}
