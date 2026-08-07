import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  evaluateTranslationReadiness,
  normalizeStorefrontPilotState,
  isPilotPublicLocalizationAllowed,
  applyStorefrontConsumptionCutover,
  fingerprintSourceText,
  translationMetaKey,
  isLanguageBlockEditArtifactTranslateEnabled,
  __reinitializeLanguageIntelligenceRegistriesForTests,
} from '../index.js';

describe('Stage 5A — readiness', () => {
  beforeEach(() => {
    __reinitializeLanguageIntelligenceRegistriesForTests();
  });

  it('no records → not_started', () => {
    const r = evaluateTranslationReadiness({
      storeId: 's1',
      canonicalLanguage: 'en',
      targetLanguage: 'vi',
      business: { id: 's1', name: 'Hello', description: 'Desc', translations: {} },
      products: [],
      metaMap: {},
    });
    expect(r.status).toBe('not_started');
    expect(r.publishable).toBe(false);
  });

  it('partial translations → partial', () => {
    const r = evaluateTranslationReadiness({
      storeId: 's1',
      canonicalLanguage: 'en',
      targetLanguage: 'vi',
      business: {
        id: 's1',
        name: 'Hello',
        description: 'Desc',
        translations: { vi: { description: 'Mo ta' } },
      },
      products: [
        {
          id: 'p1',
          name: 'Coffee',
          description: 'Hot',
          category: 'Drinks',
          translations: {},
        },
      ],
      metaMap: {},
    });
    expect(r.status).toBe('partial');
    expect(r.counts.translated).toBeGreaterThan(0);
    expect(r.counts.missing).toBeGreaterThan(0);
  });

  it('complete unreviewed → ready_for_review', () => {
    const r = evaluateTranslationReadiness({
      storeId: 's1',
      canonicalLanguage: 'en',
      targetLanguage: 'vi',
      business: {
        id: 's1',
        name: 'Hello',
        description: 'Desc',
        translations: { vi: { name: 'Xin chao', description: 'Mo ta' } },
      },
      products: [],
      metaMap: {},
    });
    // store.name is translationNotRequired — only description required
    expect(r.status).toBe('ready_for_review');
    expect(r.publishable).toBe(false);
  });

  it('approved required fields → publishable', () => {
    const key = translationMetaKey({
      entityType: 'store',
      lang: 'vi',
      field: 'description',
    });
    const source = 'Desc';
    const r = evaluateTranslationReadiness({
      storeId: 's1',
      canonicalLanguage: 'en',
      targetLanguage: 'vi',
      business: {
        id: 's1',
        name: 'Hello',
        description: source,
        translations: { vi: { description: 'Mo ta' } },
      },
      products: [],
      metaMap: {
        [key]: {
          status: 'approved',
          sourceFingerprint: fingerprintSourceText(source),
        },
      },
    });
    expect(r.status).toBe('approved');
    expect(r.publishable).toBe(true);
  });

  it('source change → stale', () => {
    const key = translationMetaKey({
      entityType: 'store',
      lang: 'vi',
      field: 'description',
    });
    const r = evaluateTranslationReadiness({
      storeId: 's1',
      canonicalLanguage: 'en',
      targetLanguage: 'vi',
      business: {
        id: 's1',
        name: 'Hello',
        description: 'New desc',
        translations: { vi: { description: 'Mo ta' } },
      },
      products: [],
      metaMap: {
        [key]: {
          status: 'approved',
          sourceFingerprint: fingerprintSourceText('Old desc'),
        },
      },
    });
    expect(r.status).toBe('stale');
    expect(r.publishable).toBe(false);
  });

  it('translationNotRequired name does not block readiness', () => {
    const key = translationMetaKey({
      entityType: 'store',
      lang: 'vi',
      field: 'description',
    });
    const r = evaluateTranslationReadiness({
      storeId: 's1',
      canonicalLanguage: 'en',
      targetLanguage: 'vi',
      business: {
        id: 's1',
        name: 'BrandCo',
        description: 'About us',
        translations: { vi: { description: 'Ve chung toi' } },
      },
      products: [],
      metaMap: {
        [key]: {
          status: 'approved',
          sourceFingerprint: fingerprintSourceText('About us'),
        },
      },
    });
    expect(r.publishable).toBe(true);
  });
});

describe('Stage 5A — pilot + approved consumption', () => {
  const envKeys = [
    'ENABLE_LANGUAGE_INTELLIGENCE_V1',
    'ENABLE_LANGUAGE_INTELLIGENCE_ENGINE_V1',
    'ENABLE_LANGUAGE_AUTO_RESOLUTION_V1',
    'ENABLE_LANGUAGE_STOREFRONT_CONSUMPTION_CUTOVER_V1',
    'ENABLE_LANGUAGE_TRANSLATION_APPROVAL_V1',
  ];
  const prev = {};

  beforeEach(() => {
    for (const k of envKeys) prev[k] = process.env[k];
    __reinitializeLanguageIntelligenceRegistriesForTests();
    process.env.ENABLE_LANGUAGE_INTELLIGENCE_V1 = 'true';
    process.env.ENABLE_LANGUAGE_INTELLIGENCE_ENGINE_V1 = 'true';
    process.env.ENABLE_LANGUAGE_AUTO_RESOLUTION_V1 = 'true';
    process.env.ENABLE_LANGUAGE_STOREFRONT_CONSUMPTION_CUTOVER_V1 = 'true';
    process.env.ENABLE_LANGUAGE_TRANSLATION_APPROVAL_V1 = 'true';
  });

  afterEach(() => {
    for (const k of envKeys) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
  });

  it('paused pilot returns canonical', () => {
    const pilot = normalizeStorefrontPilotState({
      enrolled: true,
      paused: true,
      validationStatus: 'paused',
    });
    expect(isPilotPublicLocalizationAllowed(pilot)).toBe(false);
  });

  it('unapproved translation not consumed under approved_only', () => {
    const business = {
      id: 's1',
      name: 'Hello',
      description: 'Desc',
      translations: { vi: { name: 'Xin', description: 'Mo ta' } },
      stylePreferences: {
        languageIntelligence: {
          storefrontLanguagePolicy: {
            publicLocalizationEnabled: true,
            canonicalLanguage: 'en',
            supportedDisplayLanguages: ['en', 'vi'],
            translationPolicy: 'existing_translations_only',
          },
          storefrontPilot: {
            enrolled: true,
            publicTranslationConsumptionPolicy: 'approved_translations_only',
            validationStatus: 'ready',
          },
          translationMeta: {},
        },
      },
      products: [],
    };
    const r = applyStorefrontConsumptionCutover({
      publicStore: { id: 's1', name: 'Hello', description: 'Desc', products: [] },
      business,
      requestedLanguage: 'vi',
      displayMode: 'translated',
      force: true,
      forceApproval: true,
    });
    expect(r.localizedStore.description).toBe('Desc');
    expect(r.translationStatus === 'fallback_original' || r.translationStatus === 'mixed').toBe(true);
  });

  it('approved translation is consumed', () => {
    const descKey = translationMetaKey({
      entityType: 'store',
      lang: 'vi',
      field: 'description',
    });
    const business = {
      id: 's1',
      name: 'Hello',
      description: 'Desc',
      translations: { vi: { description: 'Mo ta' } },
      stylePreferences: {
        languageIntelligence: {
          storefrontLanguagePolicy: {
            publicLocalizationEnabled: true,
            canonicalLanguage: 'en',
            supportedDisplayLanguages: ['en', 'vi'],
            translationPolicy: 'existing_translations_only',
          },
          storefrontPilot: {
            enrolled: true,
            publicTranslationConsumptionPolicy: 'approved_translations_only',
            validationStatus: 'ready',
          },
          translationMeta: {
            [descKey]: {
              status: 'approved',
              sourceFingerprint: fingerprintSourceText('Desc'),
            },
          },
        },
      },
      products: [],
    };
    const r = applyStorefrontConsumptionCutover({
      publicStore: { id: 's1', name: 'Hello', description: 'Desc', products: [] },
      business,
      requestedLanguage: 'vi',
      displayMode: 'translated',
      force: true,
      forceApproval: true,
    });
    expect(r.applied).toBe(true);
    expect(r.localizedStore.description).toBe('Mo ta');
  });
});

describe('Stage 5A — editArtifact translate block', () => {
  it('defaults on when engine enabled', () => {
    process.env.ENABLE_LANGUAGE_INTELLIGENCE_V1 = 'true';
    process.env.ENABLE_LANGUAGE_INTELLIGENCE_ENGINE_V1 = 'true';
    delete process.env.ENABLE_LANGUAGE_BLOCK_EDIT_ARTIFACT_TRANSLATE;
    expect(isLanguageBlockEditArtifactTranslateEnabled()).toBe(true);
  });
});
