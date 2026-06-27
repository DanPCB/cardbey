/**
 * Short-TTL cache for expensive admin / control-center queries.
 */

const cache = new Map();
const DEFAULT_TTL_MS = 30_000;

/**
 * @template T
 * @param {string} key
 * @param {() => Promise<T>} fetcher
 * @param {number} [ttlMs]
 * @returns {Promise<T>}
 */
export async function getCachedAdminData(key, fetcher, ttlMs = DEFAULT_TTL_MS) {
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && now - cached.timestamp < ttlMs) {
    return cached.data;
  }
  const data = await fetcher();
  cache.set(key, { data, timestamp: now });
  if (cache.size > 64) {
    const oldest = cache.keys().next().value;
    if (oldest != null) cache.delete(oldest);
  }
  return data;
}

/** @internal test helper */
export function clearAdminCacheForTests() {
  cache.clear();
}
