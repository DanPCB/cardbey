/**
 * TranslationEngine — single platform entry for content translation.
 *
 * Never overwrites canonical fields. Returns TranslationRecords + translations-layer patches.
 */

import { randomUUID } from 'crypto';
import { normalizeLanguageCode } from '../contracts/languageCode.js';
import { assertTranslationRecord } from '../contracts/translationRecord.js';
import { decideTranslationPolicy } from '../contracts/translationPolicy.js';
import { buildDualLanguageView } from '../contracts/dualLanguageView.js';
import { buildTranslationsLayerPatch } from '../adapters/translationUtilsAdapter.js';
import { assertTranslationsOnlyPatch } from './canonicalOverwriteGuard.js';
import { scoreTranslationConfidence, aggregateConfidence } from './confidenceEngine.js';
import {
  getCachedTranslationForRevision,
  setCachedTranslation,
  cacheKeyFor,
  invalidateTranslationCache,
} from './translationCache.js';
import { rememberTranslation } from './translationMemory.js';
import { appendTranslationAudit } from './translationAudit.js';
import { ensureDefaultTranslationProvider, getTranslationProvider } from './providers/index.js';

/**
 * @typedef {Object} TranslateFieldInput
 * @property {string} entityType
 * @property {string} entityId
 * @property {string} field
 * @property {string} sourceText
 * @property {string} sourceLanguage
 * @property {string|number} revision
 * @property {string} targetLanguage
 * @property {string} [contentClass]
 * @property {boolean} [forceRefresh]
 */

/**
 * Translate one field through cache → provider → memory/audit.
 * @param {TranslateFieldInput} input
 */
export async function translateField(input) {
  const targetLanguage = normalizeLanguageCode(input.targetLanguage);
  if (!targetLanguage) {
    throw new Error(`[languageIntelligence] Unsupported target language: ${input.targetLanguage}`);
  }
  const sourceLanguage = normalizeLanguageCode(input.sourceLanguage) || String(input.sourceLanguage || 'en');
  const contentClass = input.contentClass || 'product';
  const revision = input.revision ?? 0;
  const parts = {
    entityType: String(input.entityType),
    entityId: String(input.entityId),
    field: String(input.field),
    targetLanguage,
    revision,
  };

  if (!input.forceRefresh) {
    const cached = getCachedTranslationForRevision(parts);
    if (cached) {
      appendTranslationAudit('cache_hit', {
        entityId: parts.entityId,
        field: parts.field,
        targetLanguage,
        recordId: cached.id,
      });
      return {
        record: cached,
        fromCache: true,
        policy: decideTranslationPolicy(contentClass, { confidence: cached.confidence }),
        view: buildDualLanguageView({
          mode: 'translated',
          originalLanguage: sourceLanguage,
          originalText: String(input.sourceText ?? ''),
          localizedLanguage: targetLanguage,
          localizedText: cached.text,
        }),
      };
    }
  } else {
    invalidateTranslationCache({
      entityType: parts.entityType,
      entityId: parts.entityId,
      field: parts.field,
      targetLanguage,
    });
  }

  // Same language → identity record (no provider call)
  if (sourceLanguage === targetLanguage) {
    const record = assertTranslationRecord({
      id: randomUUID(),
      targetLanguage,
      text: String(input.sourceText ?? ''),
      confidence: 'high',
      sourceRevision: revision,
      provider: 'identity',
      status: 'cached',
      createdAt: new Date().toISOString(),
      metadata: { identity: true },
    });
    setCachedTranslation(cacheKeyFor(parts), record);
    rememberTranslation(parts, record);
    appendTranslationAudit('identity', { entityId: parts.entityId, field: parts.field });
    return {
      record,
      fromCache: false,
      policy: decideTranslationPolicy(contentClass, { confidence: 'high' }),
      view: buildDualLanguageView({
        mode: 'original',
        originalLanguage: sourceLanguage,
        originalText: String(input.sourceText ?? ''),
        localizedLanguage: targetLanguage,
        localizedText: String(input.sourceText ?? ''),
      }),
    };
  }

  ensureDefaultTranslationProvider();
  const provider = getTranslationProvider();
  if (!provider) {
    throw new Error('[languageIntelligence] No TranslationProvider registered');
  }

  const batch = await provider.translateBatch(
    [
      {
        id: `${parts.entityId}:${parts.field}`,
        type: parts.entityType,
        fields: { [parts.field]: String(input.sourceText ?? '') },
        sourceLanguage,
      },
    ],
    targetLanguage,
  );

  const translatedText = batch[0]?.translated?.[parts.field] ?? '';
  const confidence = scoreTranslationConfidence({
    sourceText: input.sourceText,
    translatedText,
    sourceLanguage,
    targetLanguage,
  });
  const policy = decideTranslationPolicy(contentClass, { confidence });

  const record = assertTranslationRecord({
    id: randomUUID(),
    targetLanguage,
    text: translatedText,
    confidence,
    sourceRevision: revision,
    provider: provider.id,
    status: policy.requiresOwnerReview ? 'pending_review' : 'draft',
    createdAt: new Date().toISOString(),
    metadata: { contentClass, cacheKey: cacheKeyFor(parts) },
  });

  if (policy.cacheable) {
    setCachedTranslation(cacheKeyFor(parts), {
      ...record,
      status: 'cached',
    });
  }
  rememberTranslation(parts, record);
  appendTranslationAudit('translated', {
    entityId: parts.entityId,
    field: parts.field,
    targetLanguage,
    recordId: record.id,
    confidence,
    provider: provider.id,
  });

  return {
    record,
    fromCache: false,
    policy,
    view: buildDualLanguageView({
      mode: 'translated',
      originalLanguage: sourceLanguage,
      originalText: String(input.sourceText ?? ''),
      localizedLanguage: targetLanguage,
      localizedText: translatedText,
    }),
  };
}

/**
 * Translate multiple fields on one entity; returns translations-layer Prisma patch only.
 *
 * @param {object} input
 * @param {object} input.model                 Current entity (for merging existing translations)
 * @param {string} input.entityType
 * @param {string} input.entityId
 * @param {string} input.sourceLanguage
 * @param {string|number} input.revision
 * @param {string} input.targetLanguage
 * @param {Record<string, string>} input.fields  field → source text
 * @param {string} [input.contentClass]
 * @param {boolean} [input.forceRefresh]
 */
export async function translateEntityFields(input) {
  const targetLanguage = normalizeLanguageCode(input.targetLanguage);
  if (!targetLanguage) {
    throw new Error(`[languageIntelligence] Unsupported target language: ${input.targetLanguage}`);
  }

  /** @type {Record<string, string>} */
  const localizedValues = {};
  /** @type {import('../contracts/translationRecord.js').TranslationRecord[]} */
  const records = [];
  /** @type {Array<'high'|'medium'|'low'>} */
  const confidences = [];
  let anyFromCache = true;

  for (const [field, sourceText] of Object.entries(input.fields || {})) {
    if (sourceText == null || String(sourceText).trim() === '') continue;
    const result = await translateField({
      entityType: input.entityType,
      entityId: input.entityId,
      field,
      sourceText: String(sourceText),
      sourceLanguage: input.sourceLanguage,
      revision: input.revision,
      targetLanguage,
      contentClass: input.contentClass,
      forceRefresh: input.forceRefresh,
    });
    localizedValues[field] = result.record.text;
    records.push(result.record);
    confidences.push(result.record.confidence);
    if (!result.fromCache) anyFromCache = false;
  }

  const patch = assertTranslationsOnlyPatch(
    buildTranslationsLayerPatch(input.model || {}, targetLanguage, localizedValues),
    `translateEntityFields:${input.entityType}`,
  );

  const confidence = aggregateConfidence(confidences);
  const policy = decideTranslationPolicy(input.contentClass || 'product', { confidence });

  appendTranslationAudit('entity_translated', {
    entityId: input.entityId,
    entityType: input.entityType,
    targetLanguage,
    fieldCount: Object.keys(localizedValues).length,
    fromCache: anyFromCache,
    confidence,
  });

  return {
    patch,
    records,
    localizedValues,
    confidence,
    policy,
    fromCache: anyFromCache && records.length > 0,
    canonicalPreserved: true,
    mode: 'translations_layer',
  };
}

/**
 * Batch translate heterogeneous catalog items (store + products).
 * Uses one provider batch when possible for efficiency.
 *
 * @param {object} input
 * @param {Array<{ id: string, type: string, model: object, fields: Record<string, string>, sourceLanguage?: string, revision?: string|number, contentClass?: string }>} input.items
 * @param {string} input.targetLanguage
 * @param {boolean} [input.forceRefresh]
 */
export async function translateCatalogBatch(input) {
  const targetLanguage = normalizeLanguageCode(input.targetLanguage);
  if (!targetLanguage) {
    throw new Error(`[languageIntelligence] Unsupported target language: ${input.targetLanguage}`);
  }

  ensureDefaultTranslationProvider();
  const provider = getTranslationProvider();
  if (!provider) throw new Error('[languageIntelligence] No TranslationProvider registered');

  /** @type {Array<{ item: typeof input.items[0], fieldResults: Record<string, import('../contracts/translationRecord.js').TranslationRecord>, needsProvider: boolean }>} */
  const planned = [];
  /** @type {import('./providers/translationProvider.js').ProviderTranslateItem[]} */
  const providerItems = [];

  for (const item of input.items || []) {
    const sourceLanguage = normalizeLanguageCode(item.sourceLanguage) || item.sourceLanguage || 'en';
    const revision = item.revision ?? 0;
    /** @type {Record<string, import('../contracts/translationRecord.js').TranslationRecord>} */
    const fieldResults = {};
    /** @type {Record<string, string>} */
    const missingFields = {};

    for (const [field, sourceText] of Object.entries(item.fields || {})) {
      if (sourceText == null || String(sourceText).trim() === '') continue;
      const parts = {
        entityType: item.type,
        entityId: item.id,
        field,
        targetLanguage,
        revision,
      };

      if (!input.forceRefresh) {
        const cached = getCachedTranslationForRevision(parts);
        if (cached) {
          fieldResults[field] = cached;
          continue;
        }
      }

      if (sourceLanguage === targetLanguage) {
        const record = assertTranslationRecord({
          id: randomUUID(),
          targetLanguage,
          text: String(sourceText),
          confidence: 'high',
          sourceRevision: revision,
          provider: 'identity',
          status: 'cached',
          createdAt: new Date().toISOString(),
        });
        setCachedTranslation(cacheKeyFor(parts), record);
        rememberTranslation(parts, record);
        fieldResults[field] = record;
        continue;
      }

      missingFields[field] = String(sourceText);
    }

    const needsProvider = Object.keys(missingFields).length > 0;
    if (needsProvider) {
      providerItems.push({
        id: item.id,
        type: item.type,
        fields: missingFields,
        sourceLanguage,
      });
    }
    planned.push({ item, fieldResults, needsProvider });
  }

  /** @type {Map<string, Record<string, string>>} */
  const providerMap = new Map();
  if (providerItems.length > 0) {
    const results = await provider.translateBatch(providerItems, targetLanguage);
    for (const r of results) {
      providerMap.set(r.id, r.translated || {});
    }
  }

  /** @type {Array<object>} */
  const outputs = [];

  for (const plan of planned) {
    const { item, fieldResults } = plan;
    const sourceLanguage = normalizeLanguageCode(item.sourceLanguage) || item.sourceLanguage || 'en';
    const revision = item.revision ?? 0;
    const providerFields = providerMap.get(item.id) || {};

    for (const [field, sourceText] of Object.entries(item.fields || {})) {
      if (fieldResults[field]) continue;
      if (sourceText == null || String(sourceText).trim() === '') continue;
      const translatedText = providerFields[field] ?? '';
      const confidence = scoreTranslationConfidence({
        sourceText,
        translatedText,
        sourceLanguage,
        targetLanguage,
      });
      const contentClass = item.contentClass || (item.type === 'store' ? 'product' : item.type);
      const policy = decideTranslationPolicy(contentClass, { confidence });
      const parts = {
        entityType: item.type,
        entityId: item.id,
        field,
        targetLanguage,
        revision,
      };
      const record = assertTranslationRecord({
        id: randomUUID(),
        targetLanguage,
        text: translatedText,
        confidence,
        sourceRevision: revision,
        provider: provider.id,
        status: policy.requiresOwnerReview ? 'pending_review' : 'draft',
        createdAt: new Date().toISOString(),
        metadata: { contentClass },
      });
      if (policy.cacheable) {
        setCachedTranslation(cacheKeyFor(parts), { ...record, status: 'cached' });
      }
      rememberTranslation(parts, record);
      fieldResults[field] = record;
      appendTranslationAudit('translated', {
        entityId: item.id,
        field,
        targetLanguage,
        recordId: record.id,
        confidence,
        provider: provider.id,
      });
    }

    /** @type {Record<string, string>} */
    const localizedValues = {};
    for (const [field, record] of Object.entries(fieldResults)) {
      localizedValues[field] = record.text;
    }

    const patch = assertTranslationsOnlyPatch(
      buildTranslationsLayerPatch(item.model || {}, targetLanguage, localizedValues),
      `translateCatalogBatch:${item.type}`,
    );

    outputs.push({
      id: item.id,
      type: item.type,
      patch,
      records: Object.values(fieldResults),
      localizedValues,
      canonicalPreserved: true,
      mode: 'translations_layer',
    });
  }

  appendTranslationAudit('catalog_batch', {
    targetLanguage,
    itemCount: outputs.length,
    providerItemCount: providerItems.length,
  });

  return {
    targetLanguage,
    results: outputs,
    canonicalPreserved: true,
    mode: 'translations_layer',
  };
}
