/**
 * Memory Cache Manager — TTL-based in-process cache for memory bundles.
 */

const DEFAULT_TTL_SEC = 120;
const GUEST_TTL_SEC = 60;

/** @type {Map<string, { value: unknown; expiresAt: number }>} */
const store = new Map();

/**
 * @param {import('../../lib/memory/memoryTypes.js').MemoryContext} context
 */
export function getMemoryCacheKey(context) {
  const { actor, storeId, sessionId, missionId } = context;
  const actorType = actor?.type ?? 'guest';
  const actorId = actor?.id ?? actor?.userId ?? 'anon';
  return `memory:${actorType}:${actorId}:${storeId || 'none'}:${sessionId || 'none'}:${missionId || 'none'}`;
}

/**
 * @param {import('../../lib/memory/memoryTypes.js').MemoryContext} context
 */
export function getCachedMemory(context) {
  const key = getMemoryCacheKey(context);
  const entry = store.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt < Date.now()) {
    store.delete(key);
    return undefined;
  }
  return entry.value;
}

/**
 * @param {import('../../lib/memory/memoryTypes.js').MemoryContext} context
 * @param {unknown} bundle
 */
export function setCachedMemory(context, bundle) {
  const key = getMemoryCacheKey(context);
  const ttl = context.storeId ? DEFAULT_TTL_SEC : GUEST_TTL_SEC;
  store.set(key, { value: bundle, expiresAt: Date.now() + ttl * 1000 });
}

/**
 * @param {import('../../lib/memory/memoryTypes.js').MemoryContext} context
 */
export function invalidateMemoryCache(context) {
  const key = getMemoryCacheKey(context);
  store.delete(key);
  console.log(`[MemoryCache] Invalidated: ${key}`);
}

/**
 * @param {string} pattern
 */
export function invalidateMemoryByPattern(pattern) {
  const needle = String(pattern ?? '').trim();
  if (!needle) return 0;
  let count = 0;
  for (const key of store.keys()) {
    if (key.includes(needle)) {
      store.delete(key);
      count += 1;
    }
  }
  if (count > 0) {
    console.log(`[MemoryCache] Invalidated ${count} keys matching: ${needle}`);
  }
  return count;
}

export const INVALIDATION_TRIGGERS = {
  MISSION_COMPLETE: (missionId) => invalidateMemoryByPattern(String(missionId)),
  STORE_SWITCH: (storeId) => invalidateMemoryByPattern(`:${storeId}:`),
  LOGOUT: (userId) => invalidateMemoryByPattern(`:${userId}:`),
  SUITCASE_SAVE: (storeId) => invalidateMemoryByPattern(`:${storeId}:`),
};

/** @internal tests */
export function clearMemoryCacheForTests() {
  store.clear();
}
