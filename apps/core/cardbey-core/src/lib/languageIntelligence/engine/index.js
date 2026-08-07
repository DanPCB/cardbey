export {
  assertTranslationsOnlyPatch,
  wouldOverwriteCanonical,
  CANONICAL_CONTENT_FIELDS,
} from './canonicalOverwriteGuard.js';
export { scoreTranslationConfidence, aggregateConfidence } from './confidenceEngine.js';
export {
  appendTranslationAudit,
  listTranslationAudit,
  getTranslationAuditStats,
  __resetTranslationAuditForTests,
} from './translationAudit.js';
export {
  cacheKeyFor,
  getCachedTranslation,
  setCachedTranslation,
  invalidateTranslationCache,
  getCachedTranslationForRevision,
  translationCacheSize,
  __resetTranslationCacheForTests,
} from './translationCache.js';
export {
  rememberTranslation,
  recallLatestTranslation,
  listTranslationHistory,
  listTranslationHistoryAcrossRevisions,
  translationMemoryKeyCount,
  __resetTranslationMemoryForTests,
} from './translationMemory.js';
export {
  translateField,
  translateEntityFields,
  translateCatalogBatch,
} from './translationEngine.js';
export {
  setTranslationProvider,
  getTranslationProvider,
  ensureDefaultTranslationProvider,
  createStubTranslationProvider,
  createOpenAiTranslationProvider,
  __resetTranslationProviderForTests,
} from './providers/index.js';

export const ENGINE_VERSION = 'language-intelligence-engine-v1';
