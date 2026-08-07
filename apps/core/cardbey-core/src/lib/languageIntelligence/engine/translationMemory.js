/**
 * TranslationMemory — per-key history of TranslationRecords (versioning).
 */

import { cacheKeyFor } from './translationCache.js';

/** @type {Map<string, import('../contracts/translationRecord.js').TranslationRecord[]>} */
const memory = new Map();
const MAX_HISTORY_PER_KEY = 20;

/**
 * @param {{ entityType: string, entityId: string, field: string, targetLanguage: string, revision: string|number }} parts
 * @param {import('../contracts/translationRecord.js').TranslationRecord} record
 */
export function rememberTranslation(parts, record) {
  const key = cacheKeyFor(parts);
  const hist = memory.get(key) || [];
  hist.push(record);
  while (hist.length > MAX_HISTORY_PER_KEY) hist.shift();
  memory.set(key, hist);
  return record;
}

/**
 * Latest memory entry for exact cache key (includes revision in key).
 * @param {{ entityType: string, entityId: string, field: string, targetLanguage: string, revision: string|number }} parts
 */
export function recallLatestTranslation(parts) {
  const key = cacheKeyFor(parts);
  const hist = memory.get(key);
  if (!hist || hist.length === 0) return null;
  return hist[hist.length - 1];
}

/**
 * Full history for a key.
 * @param {{ entityType: string, entityId: string, field: string, targetLanguage: string, revision: string|number }} parts
 */
export function listTranslationHistory(parts) {
  const key = cacheKeyFor(parts);
  return Object.freeze([...(memory.get(key) || [])]);
}

/**
 * History across revisions for entity+field+language.
 * @param {{ entityType: string, entityId: string, field: string, targetLanguage: string }} parts
 */
export function listTranslationHistoryAcrossRevisions(parts) {
  const prefix = `${parts.entityType}::${parts.entityId}::${parts.field}::${parts.targetLanguage}::`;
  /** @type {import('../contracts/translationRecord.js').TranslationRecord[]} */
  const out = [];
  for (const [key, hist] of memory.entries()) {
    if (key.startsWith(prefix)) out.push(...hist);
  }
  return Object.freeze(out);
}

export function translationMemoryKeyCount() {
  return memory.size;
}

/** @internal */
export function __resetTranslationMemoryForTests() {
  memory.clear();
}
