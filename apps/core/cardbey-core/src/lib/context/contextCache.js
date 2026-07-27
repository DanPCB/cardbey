/**
 * In-process TTL cache for persisted UserContext records.
 */

const DEFAULT_TTL_SEC = 3600;

/** @type {Map<string, { value: string; expiresAt: number }>} */
const store = new Map();

/**
 * @param {string} userId
 * @param {string} sessionId
 */
export function getContextCacheKey(userId, sessionId) {
  return `context:${userId}:${sessionId}`;
}

/**
 * @param {string} userId
 * @param {string} sessionId
 * @param {number} [ttlSec]
 */
export async function getCachedContext(userId, sessionId, ttlSec = DEFAULT_TTL_SEC) {
  const key = getContextCacheKey(userId, sessionId);
  const entry = store.get(key);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    store.delete(key);
    return null;
  }
  try {
    return JSON.parse(entry.value);
  } catch {
    store.delete(key);
    return null;
  }
}

/**
 * @param {string} userId
 * @param {string} sessionId
 * @param {unknown} context
 * @param {number} [ttlSec]
 */
export async function setCachedContext(userId, sessionId, context, ttlSec = DEFAULT_TTL_SEC) {
  const key = getContextCacheKey(userId, sessionId);
  store.set(key, {
    value: JSON.stringify(context),
    expiresAt: Date.now() + ttlSec * 1000,
  });
}

/**
 * @param {string} userId
 * @param {string} sessionId
 */
export async function deleteCachedContext(userId, sessionId) {
  store.delete(getContextCacheKey(userId, sessionId));
}

/** @internal tests */
export function clearContextCacheForTests() {
  store.clear();
}
