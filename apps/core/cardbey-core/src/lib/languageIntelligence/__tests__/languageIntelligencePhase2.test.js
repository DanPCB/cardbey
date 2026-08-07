import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  translateField,
  translateEntityFields,
  translateCatalogBatch,
  assertTranslationsOnlyPatch,
  wouldOverwriteCanonical,
  scoreTranslationConfidence,
  setTranslationProvider,
  createStubTranslationProvider,
  __resetTranslationProviderForTests,
  __resetTranslationCacheForTests,
  __resetTranslationMemoryForTests,
  __resetTranslationAuditForTests,
  getCachedTranslationForRevision,
  listTranslationHistory,
  listTranslationAudit,
  __reinitializeLanguageIntelligenceRegistriesForTests,
  getLanguageIntelligenceDiagnostics,
  ENGINE_VERSION,
} from '../index.js';

describe('Language Intelligence Phase 2 — overwrite guard', () => {
  it('accepts translations-only patches', () => {
    const patch = assertTranslationsOnlyPatch({
      translations: { en: { name: 'Hello' } },
    });
    expect(patch.translations.en.name).toBe('Hello');
  });

  it('refuses canonical field overwrites', () => {
    expect(() =>
      assertTranslationsOnlyPatch({
        name: 'Hacked',
        translations: { en: { name: 'Hello' } },
      }),
    ).toThrow(/refused canonical overwrite/);
    expect(wouldOverwriteCanonical({ name: 'x' })).toBe(true);
    expect(wouldOverwriteCanonical({ translations: {} })).toBe(false);
  });
});

describe('Language Intelligence Phase 2 — TranslationEngine', () => {
  beforeEach(() => {
    __reinitializeLanguageIntelligenceRegistriesForTests();
    __resetTranslationCacheForTests();
    __resetTranslationMemoryForTests();
    __resetTranslationAuditForTests();
    __resetTranslationProviderForTests();
    setTranslationProvider(createStubTranslationProvider({ prefix: 'TR' }));
  });

  afterEach(() => {
    __resetTranslationProviderForTests();
    __resetTranslationCacheForTests();
    __resetTranslationMemoryForTests();
    __resetTranslationAuditForTests();
  });

  it('translates a field and never returns canonical overwrite', async () => {
    const result = await translateField({
      entityType: 'product',
      entityId: 'p1',
      field: 'name',
      sourceText: 'Bánh Mì Đặc Biệt',
      sourceLanguage: 'vi',
      revision: 1,
      targetLanguage: 'en',
      contentClass: 'product',
    });
    expect(result.record.text).toBe('TR:en:Bánh Mì Đặc Biệt');
    expect(result.record.confidence).toMatch(/high|medium|low/);
    expect(result.view.originalText).toBe('Bánh Mì Đặc Biệt');
    expect(result.fromCache).toBe(false);
  });

  it('serves cache on same revision and invalidates on revision change', async () => {
    const input = {
      entityType: 'product',
      entityId: 'p2',
      field: 'name',
      sourceText: 'Cafe',
      sourceLanguage: 'en',
      revision: 1,
      targetLanguage: 'vi',
    };
    const first = await translateField(input);
    const second = await translateField(input);
    expect(second.fromCache).toBe(true);
    expect(second.record.id).toBe(first.record.id);

    const hit = getCachedTranslationForRevision({
      entityType: 'product',
      entityId: 'p2',
      field: 'name',
      targetLanguage: 'vi',
      revision: 1,
    });
    expect(hit?.text).toBe('TR:vi:Cafe');

    const miss = getCachedTranslationForRevision({
      entityType: 'product',
      entityId: 'p2',
      field: 'name',
      targetLanguage: 'vi',
      revision: 2,
    });
    expect(miss).toBeNull();

    const third = await translateField({ ...input, revision: 2 });
    expect(third.fromCache).toBe(false);
    expect(listTranslationHistory({ ...input, revision: 2 }).length).toBeGreaterThanOrEqual(1);
  });

  it('builds translations-layer entity patch without touching name', async () => {
    const model = { name: 'Original VI', description: 'Mô tả', translations: null };
    const out = await translateEntityFields({
      model,
      entityType: 'product',
      entityId: 'p3',
      sourceLanguage: 'vi',
      revision: 5,
      targetLanguage: 'en',
      fields: { name: 'Original VI', description: 'Mô tả' },
      contentClass: 'product',
    });
    expect(out.canonicalPreserved).toBe(true);
    expect(out.mode).toBe('translations_layer');
    expect(out.patch).toEqual({
      translations: {
        en: {
          name: 'TR:en:Original VI',
          description: 'TR:en:Mô tả',
        },
      },
    });
    expect(out.patch).not.toHaveProperty('name');
    expect(model.name).toBe('Original VI');
  });

  it('batch-translates store + products through one provider call path', async () => {
    const batch = await translateCatalogBatch({
      targetLanguage: 'ja',
      items: [
        {
          id: 's1',
          type: 'store',
          model: { name: 'Quán A', translations: {} },
          fields: { name: 'Quán A' },
          sourceLanguage: 'vi',
          revision: 1,
          contentClass: 'product',
        },
        {
          id: 'p9',
          type: 'product',
          model: { name: 'Phở', translations: {} },
          fields: { name: 'Phở', description: 'Ngon' },
          sourceLanguage: 'vi',
          revision: 1,
          contentClass: 'product',
        },
      ],
    });
    expect(batch.canonicalPreserved).toBe(true);
    expect(batch.results).toHaveLength(2);
    expect(batch.results[0].patch.translations.ja.name).toBe('TR:ja:Quán A');
    expect(batch.results[1].patch).not.toHaveProperty('description');
    expect(batch.results[1].patch.translations.ja.description).toBe('TR:ja:Ngon');
    expect(listTranslationAudit({ type: 'catalog_batch' }).length).toBeGreaterThanOrEqual(1);
  });

  it('scores low confidence when translation equals source across languages', () => {
    expect(
      scoreTranslationConfidence({
        sourceText: 'Hello',
        translatedText: 'Hello',
        sourceLanguage: 'en',
        targetLanguage: 'vi',
      }),
    ).toBe('low');
  });
});

describe('Language Intelligence Phase 2 — diagnostics', () => {
  const prevV1 = process.env.ENABLE_LANGUAGE_INTELLIGENCE_V1;
  const prevEng = process.env.ENABLE_LANGUAGE_INTELLIGENCE_ENGINE_V1;

  afterEach(() => {
    if (prevV1 === undefined) delete process.env.ENABLE_LANGUAGE_INTELLIGENCE_V1;
    else process.env.ENABLE_LANGUAGE_INTELLIGENCE_V1 = prevV1;
    if (prevEng === undefined) delete process.env.ENABLE_LANGUAGE_INTELLIGENCE_ENGINE_V1;
    else process.env.ENABLE_LANGUAGE_INTELLIGENCE_ENGINE_V1 = prevEng;
  });

  it('exposes engine diagnostics when engine flag on', () => {
    process.env.ENABLE_LANGUAGE_INTELLIGENCE_V1 = 'true';
    process.env.ENABLE_LANGUAGE_INTELLIGENCE_ENGINE_V1 = 'true';
    process.env.ENABLE_LANGUAGE_INTELLIGENCE_CONVERSATION_V1 = 'false';
    process.env.ENABLE_LANGUAGE_INTELLIGENCE_STOREFRONT_LOCALIZER_V1 = 'false';
    process.env.ENABLE_LANGUAGE_INTELLIGENCE_PREFERENCES_V1 = 'false';
    process.env.ENABLE_LANGUAGE_INTELLIGENCE_CONSUMPTION_V1 = 'false';
    __reinitializeLanguageIntelligenceRegistriesForTests();
    const d = getLanguageIntelligenceDiagnostics();
    expect(d.phase).toBe(2);
    expect(d.engine?.version).toBe(ENGINE_VERSION);
    expect(d.authoritative).toBe(false);
  });
});
