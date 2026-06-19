/**
 * In-memory geocode cache — respects Nominatim usage by avoiding repeat lookups.
 */

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 500;

type CacheEntry<T> = { value: T; expiresAt: number };

const forwardCache = new Map<string, CacheEntry<unknown>>();
const reverseCache = new Map<string, CacheEntry<unknown>>();

function normalizeKey(parts: string[]): string {
  return parts.map((p) => p.trim().toLowerCase()).join('|');
}

function prune<T>(cache: Map<string, CacheEntry<T>>): void {
  if (cache.size <= MAX_ENTRIES) return;
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (entry.expiresAt <= now) cache.delete(key);
    if (cache.size <= MAX_ENTRIES * 0.8) break;
  }
  if (cache.size > MAX_ENTRIES) {
    const keys = [...cache.keys()].slice(0, cache.size - MAX_ENTRIES);
    for (const key of keys) cache.delete(key);
  }
}

export function getForwardGeocodeCache<T>(query: string, countryBias?: string | null, cityBias?: string | null): T | null {
  const key = normalizeKey(['fwd', query, countryBias ?? '', cityBias ?? '']);
  const entry = forwardCache.get(key) as CacheEntry<T> | undefined;
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    forwardCache.delete(key);
    return null;
  }
  return entry.value;
}

export function setForwardGeocodeCache<T>(
  query: string,
  countryBias: string | null | undefined,
  cityBias: string | null | undefined,
  value: T,
  ttlMs = DEFAULT_TTL_MS,
): void {
  const key = normalizeKey(['fwd', query, countryBias ?? '', cityBias ?? '']);
  forwardCache.set(key, { value, expiresAt: Date.now() + ttlMs });
  prune(forwardCache);
}

export function getReverseGeocodeCache<T>(latitude: number, longitude: number): T | null {
  const key = normalizeKey(['rev', latitude.toFixed(5), longitude.toFixed(5)]);
  const entry = reverseCache.get(key) as CacheEntry<T> | undefined;
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    reverseCache.delete(key);
    return null;
  }
  return entry.value;
}

export function setReverseGeocodeCache<T>(
  latitude: number,
  longitude: number,
  value: T,
  ttlMs = DEFAULT_TTL_MS,
): void {
  const key = normalizeKey(['rev', latitude.toFixed(5), longitude.toFixed(5)]);
  reverseCache.set(key, { value, expiresAt: Date.now() + ttlMs });
  prune(reverseCache);
}

/** Test helper */
export function clearGeocodeCache(): void {
  forwardCache.clear();
  reverseCache.clear();
}
