import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  normalizeStorefrontLanguagePolicy,
  applyStorefrontConsumptionCutover,
  attachStorefrontLocalizationMeta,
  buildStorefrontLocalizationCacheKey,
  STOREFRONT_CUTOVER_REASON_CODES,
  isLanguageStorefrontConsumptionCutoverV1Enabled,
  isLanguageStorefrontSelectorV1Enabled,
  getLanguageIntelligenceDiagnostics,
  __reinitializeLanguageIntelligenceRegistriesForTests,
  __resetStorefrontCutoverTelemetryForTests,
} from '../index.js';

describe('Stage 4 — storefront language policy', () => {
  it('defaults existing stores to original-only / not public', () => {
    const p = normalizeStorefrontLanguagePolicy({});
    expect(p.publicLocalizationEnabled).toBe(false);
    expect(p.translationPolicy).toBe('original_only');
    expect(p.defaultDisplayMode).toBe('original');
  });

  it('opt-in enables existing_translations_only by default', () => {
    const p = normalizeStorefrontLanguagePolicy({
      publicLocalizationEnabled: true,
      canonicalLanguage: 'en',
      supportedDisplayLanguages: ['en', 'vi'],
    });
    expect(p.publicLocalizationEnabled).toBe(true);
    expect(p.translationPolicy).toBe('existing_translations_only');
    expect(p.supportedDisplayLanguages).toContain('en');
    expect(p.supportedDisplayLanguages).toContain('vi');
  });
});

describe('Stage 4 — consumption cutover', () => {
  const envKeys = [
    'ENABLE_LANGUAGE_INTELLIGENCE_V1',
    'ENABLE_LANGUAGE_INTELLIGENCE_ENGINE_V1',
    'ENABLE_LANGUAGE_AUTO_RESOLUTION_V1',
    'ENABLE_LANGUAGE_STOREFRONT_CONSUMPTION_CUTOVER_V1',
    'ENABLE_LANGUAGE_STOREFRONT_SELECTOR_V1',
    'ENABLE_LANGUAGE_INTELLIGENCE_CONSUMPTION_V1',
  ];
  /** @type {Record<string, string|undefined>} */
  const prev = {};

  beforeEach(() => {
    for (const k of envKeys) prev[k] = process.env[k];
    __reinitializeLanguageIntelligenceRegistriesForTests();
    __resetStorefrontCutoverTelemetryForTests();
    process.env.ENABLE_LANGUAGE_INTELLIGENCE_V1 = 'true';
    process.env.ENABLE_LANGUAGE_INTELLIGENCE_ENGINE_V1 = 'true';
    process.env.ENABLE_LANGUAGE_AUTO_RESOLUTION_V1 = 'true';
    process.env.ENABLE_LANGUAGE_STOREFRONT_CONSUMPTION_CUTOVER_V1 = 'true';
    process.env.ENABLE_LANGUAGE_INTELLIGENCE_CONSUMPTION_V1 = 'true';
  });

  afterEach(() => {
    for (const k of envKeys) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
  });

  const businessOptIn = {
    id: 'store-1',
    name: 'Hello Store',
    description: 'English description',
    translations: {
      vi: { name: 'Cua hang Xin chao', description: 'Mo ta tieng Viet' },
    },
    stylePreferences: {
      languageIntelligence: {
        storefrontLanguagePolicy: {
          publicLocalizationEnabled: true,
          canonicalLanguage: 'en',
          supportedDisplayLanguages: ['en', 'vi'],
          translationPolicy: 'existing_translations_only',
          defaultDisplayMode: 'translated',
        },
      },
    },
    products: [
      {
        id: 'p1',
        name: 'Coffee',
        description: 'Hot coffee',
        category: 'Drinks',
        translations: {
          vi: { name: 'Ca phe', description: 'Ca phe nong', category: 'Do uong' },
        },
      },
    ],
  };

  const publicStore = {
    id: 'store-1',
    name: 'Hello Store',
    description: 'English description',
    products: [
      { id: 'p1', name: 'Coffee', description: 'Hot coffee', category: 'Drinks' },
    ],
  };

  it('global flag off returns canonical', () => {
    delete process.env.ENABLE_LANGUAGE_STOREFRONT_CONSUMPTION_CUTOVER_V1;
    const r = applyStorefrontConsumptionCutover({
      publicStore,
      business: businessOptIn,
      requestedLanguage: 'vi',
      displayMode: 'translated',
    });
    expect(r.applied).toBe(false);
    expect(r.reasonCode).toBe(STOREFRONT_CUTOVER_REASON_CODES.STOREFRONT_LOCALIZATION_DISABLED_GLOBAL);
    expect(r.localizedStore.name).toBe('Hello Store');
  });

  it('store opt-in off returns canonical', () => {
    const r = applyStorefrontConsumptionCutover({
      publicStore,
      business: { ...businessOptIn, stylePreferences: {} },
      requestedLanguage: 'vi',
      displayMode: 'translated',
      force: true,
    });
    expect(r.applied).toBe(false);
    expect(r.reasonCode).toBe(STOREFRONT_CUTOVER_REASON_CODES.STOREFRONT_LOCALIZATION_DISABLED_STORE);
  });

  it('both enabled consume existing translation without live generation', () => {
    const r = applyStorefrontConsumptionCutover({
      publicStore,
      business: businessOptIn,
      products: businessOptIn.products,
      requestedLanguage: 'vi',
      displayMode: 'translated',
      force: true,
    });
    expect(r.applied).toBe(true);
    expect(r.generateMissingTranslations).toBe(false);
    expect(r.localizedStore.name).toBe('Cua hang Xin chao');
    expect(r.localizedProducts[0].name).toBe('Ca phe');
    expect(r.translatedByCardbeyAI).toBe(false);
  });

  it('missing field falls back per field (mixed)', () => {
    const biz = {
      ...businessOptIn,
      translations: { vi: { name: 'Cua hang Xin chao' } },
    };
    const r = applyStorefrontConsumptionCutover({
      publicStore,
      business: biz,
      products: businessOptIn.products,
      requestedLanguage: 'vi',
      displayMode: 'translated',
      force: true,
    });
    expect(r.translationStatus).toBe('mixed');
    expect(r.localizedStore.name).toBe('Cua hang Xin chao');
    expect(r.localizedStore.description).toBe('English description');
    expect(r.fieldMetadata['store.description'].status).toBe('fallback_original');
  });

  it('unsupported store language falls back to canonical', () => {
    const r = applyStorefrontConsumptionCutover({
      publicStore,
      business: businessOptIn,
      requestedLanguage: 'ja',
      displayMode: 'translated',
      force: true,
    });
    // ja not in supportedDisplayLanguages → requested remapped to canonical → original mode path
    expect(r.applied).toBe(false);
    expect(r.fallbackReasons).toContain(
      STOREFRONT_CUTOVER_REASON_CODES.STOREFRONT_LANGUAGE_UNSUPPORTED,
    );
  });

  it('shadowOnly does not mutate render fields', () => {
    const r = applyStorefrontConsumptionCutover({
      publicStore,
      business: businessOptIn,
      products: businessOptIn.products,
      requestedLanguage: 'vi',
      displayMode: 'translated',
      shadowOnly: true,
      force: true,
    });
    expect(r.shadow).toBe(true);
    expect(r.applied).toBe(false);
    expect(r.localizedStore.name).toBe('Hello Store');
  });

  it('attach meta is safe public envelope', () => {
    const r = applyStorefrontConsumptionCutover({
      publicStore,
      business: businessOptIn,
      products: businessOptIn.products,
      requestedLanguage: 'vi',
      displayMode: 'translated',
      force: true,
    });
    const dto = attachStorefrontLocalizationMeta(publicStore, r);
    expect(dto.languageIntelligence.storefrontLocalization.surface).toBe('public_storefront_v1');
    expect(dto.languageIntelligence.storefrontLocalization.applied).toBe(true);
    expect(JSON.stringify(dto)).not.toMatch(/Accept-Language|password|ipAddress/i);
  });

  it('cache keys differ by language and mode', () => {
    const a = buildStorefrontLocalizationCacheKey({
      storeId: 's1',
      contentRevision: '1',
      requestedLanguage: 'en',
      displayMode: 'original',
      translationRevision: '1',
    });
    const b = buildStorefrontLocalizationCacheKey({
      storeId: 's1',
      contentRevision: '1',
      requestedLanguage: 'vi',
      displayMode: 'translated',
      translationRevision: '1',
    });
    const c = buildStorefrontLocalizationCacheKey({
      storeId: 's1',
      contentRevision: '1',
      requestedLanguage: 'vi',
      displayMode: 'both',
      translationRevision: '1',
    });
    expect(a).not.toBe(b);
    expect(b).not.toBe(c);
  });

  it('flags fail closed', () => {
    delete process.env.ENABLE_LANGUAGE_STOREFRONT_CONSUMPTION_CUTOVER_V1;
    delete process.env.ENABLE_LANGUAGE_STOREFRONT_SELECTOR_V1;
    expect(isLanguageStorefrontConsumptionCutoverV1Enabled()).toBe(false);
    expect(isLanguageStorefrontSelectorV1Enabled()).toBe(false);
  });

  it('diagnostics expose pilot surface when cutover on', () => {
    process.env.ENABLE_LANGUAGE_STOREFRONT_SELECTOR_V1 = 'true';
    const d = getLanguageIntelligenceDiagnostics();
    expect(d.extensions).toContain('storefront-cutover-v1');
    expect(d.storefrontCutover.enabled).toBe(true);
    expect(d.storefrontCutover.requiresStoreOptIn).toBe(true);
    expect(d.consumption.surfacesWired).toEqual(['public_storefront_v1']);
    expect(d.authoritative).toBe(false);
  });
});
