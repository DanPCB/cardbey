/**
 * TranslationCache — keyed by entity × field × language × revision.
 * Invalidates when source revision changes.
 */

import { buildTranslationCacheKey } from '../contracts/translationPolicy.js';

/** @type {Map<string, import('../contracts/translationRecord.js').TranslationRecord>} */
const cache = new Map();

/**
 * @param {{ entityType: string, entityId: string, field: string, targetLanguage: string, revision: string|number }} parts
 * @returns {string}
 */
export function cacheKeyFor(parts) {
  return buildTranslationCacheKey(parts);
}

/**
 * @param {string} key
 * @returns {import('../contracts/translationRecord.js').TranslationRecord|null}
 */
export function getCachedTranslation(key) {
  return cache.get(key) ?? null;
}

/**
 * @param {string} key
 * @param {import('../contracts/translationRecord.js').TranslationRecord} record
 */
export function setCachedTranslation(key, record) {
  cache.set(key, record);
  return record;
}

/**
 * Drop cache entries for an entity (all fields/languages), or a specific revision mismatch.
 * @param {{ entityType?: string, entityId: string, field?: string, targetLanguage?: string }} filter
 */
export function invalidateTranslationCache(filter) {
  const entityId = String(filter.entityId ?? '');
  const entityType = filter.entityType != null ? String(filter.entityType) : null;
  const field = filter.field != null ? String(filter.field) : null;
  const lang = filter.targetLanguage != null ? String(filter.targetLanguage) : null;
  let removed = 0;
  for (const key of [...cache.keys()]) {
    const [etype, eid, f, tlang] = key.split('::');
    if (eid !== entityId) continue;
    if (entityType && etype !== entityType) continue;
    if (field && f !== field) continue;
    if (lang && tlang !== lang) continue;
    cache.delete(key);
    removed++;
  }
  return removed;
}

/**
 * Get only if cached revision matches current source revision.
 * @param {{ entityType: string, entityId: string, field: string, targetLanguage: string, revision: string|number }} parts
 */
export function getCachedTranslationForRevision(parts) {
  const key = cacheKeyFor(parts);
  const hit = getCachedTranslation(key);
  if (!hit) return null;
  if (String(hit.sourceRevision) !== String(parts.revision)) {
    cache.delete(key);
    return null;
  }
  return hit;
}

export function translationCacheSize() {
  return cache.size;
}

/** @internal */
export function __resetTranslationCacheForTests() {
  cache.clear();
}
