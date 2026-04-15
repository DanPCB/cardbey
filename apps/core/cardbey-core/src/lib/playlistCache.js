// src/lib/playlistCache.js
// Simple in-memory cache for playlist responses

const cache = new Map();

// TTL in milliseconds (default: 3 seconds)
const CACHE_TTL_MS = parseInt(process.env.PLAYLIST_CACHE_TTL_MS || '3000', 10);

/**
 * Generate cache key from screenId and options
 */
function getCacheKey(screenId, options = {}) {
  const full = options.full === true ? 'full' : 'basic';
  return `${screenId}:${full}`;
}

/**
 * Check if cache entry is still valid
 */
function isValid(entry) {
  if (!entry || !entry.expiresAt) {
    return false;
  }
  return Date.now() < entry.expiresAt;
}

/**
 * Get cached playlist data
 * 
 * @param {string} screenId - Screen ID
 * @param {object} options - Options { full: boolean }
 * @returns {any|null} Cached data or null if not found/expired
 */
export function getCachedPlaylist(screenId, options = {}) {
  // If caching is disabled (TTL = 0), always return null
  if (CACHE_TTL_MS <= 0) {
    return null;
  }
  
  const key = getCacheKey(screenId, options);
  const entry = cache.get(key);
  
  if (entry && isValid(entry)) {
    return entry.data;
  }
  
  // Remove expired entry
  if (entry) {
    cache.delete(key);
  }
  
  return null;
}

/**
 * Set cached playlist data
 * 
 * @param {string} screenId - Screen ID
 * @param {object} options - Options { full: boolean }
 * @param {any} data - Data to cache (must be JSON-serializable)
 */
export function setCachedPlaylist(screenId, options = {}, data) {
  // If caching is disabled (TTL = 0), don't cache
  if (CACHE_TTL_MS <= 0) {
    return;
  }
  
  // Ensure data is plain JSON (no circular refs, no DB handles)
  // Deep clone to avoid reference issues
  let serializableData;
  try {
    serializableData = JSON.parse(JSON.stringify(data));
  } catch (err) {
    // If serialization fails, don't cache
    console.warn('[PlaylistCache] Failed to serialize data for caching, skipping cache');
    return;
  }
  
  const key = getCacheKey(screenId, options);
  const expiresAt = Date.now() + CACHE_TTL_MS;
  
  cache.set(key, {
    data: serializableData,
    expiresAt,
  });
}

/**
 * Invalidate cached playlist for a screen
 * 
 * @param {string} screenId - Screen ID
 */
export function invalidatePlaylist(screenId) {
  // Remove both full and basic cache entries
  cache.delete(`${screenId}:full`);
  cache.delete(`${screenId}:basic`);
}

/**
 * Clear all cached playlists (useful for testing or manual cleanup)
 */
export function clearCache() {
  cache.clear();
}

/**
 * Get cache stats (for debugging)
 */
export function getCacheStats() {
  const now = Date.now();
  let valid = 0;
  let expired = 0;
  
  for (const [key, entry] of cache.entries()) {
    if (isValid(entry)) {
      valid++;
    } else {
      expired++;
    }
  }
  
  return {
    totalEntries: cache.size,
    validEntries: valid,
    expiredEntries: expired,
    ttlMs: CACHE_TTL_MS,
    enabled: CACHE_TTL_MS > 0,
  };
}


