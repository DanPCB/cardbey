import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  LANGUAGE_CODES,
  isLanguageCode,
  assertRegionProfile,
  assertCanonicalContentRef,
  assertTranslationRecord,
  assertGlossaryEntry,
  resolveGlossaryTerm,
  buildDualLanguageView,
  pickDualLanguageDisplay,
  decideTranslationPolicy,
  buildTranslationCacheKey,
  normalizeUserLocalePreference,
  resolveLanguage,
  formatCurrency,
  formatDate,
  formatDistance,
  formatTimeOfDay,
  getLanguage,
  listLanguages,
  hasLanguage,
  getRegion,
  listRegions,
  listGlossaryEntries,
  matchGlossaryInText,
  __reinitializeLanguageIntelligenceRegistriesForTests,
  toLegacyLlmLocale,
  listLegacyLlmLocales,
  readCanonicalField,
  buildTranslationsLayerPatch,
  readLocalizedField,
  isLanguageIntelligenceAuthoritative,
  getLanguageIntelligenceDiagnostics,
  isLanguageIntelligenceV1Enabled,
} from '../index.js';

describe('Language Intelligence Phase 1 — contracts', () => {
  it('seeds twelve language codes', () => {
    expect(LANGUAGE_CODES).toHaveLength(12);
    expect(isLanguageCode('vi')).toBe(true);
    expect(isLanguageCode('en-AU')).toBe(false);
    expect(isLanguageCode('xx')).toBe(false);
  });

  it('accepts a valid region profile', () => {
    const region = assertRegionProfile({
      id: 'TEST',
      version: 1,
      name: 'Test',
      defaultLanguage: 'en',
      currency: 'AUD',
      dateFormat: 'dd/MM/yyyy',
      measurementUnits: 'metric',
      communicationStyle: 'friendly',
    });
    expect(region.id).toBe('TEST');
  });

  it('rejects invalid currency', () => {
    expect(() =>
      assertRegionProfile({
        id: 'BAD',
        version: 1,
        name: 'Bad',
        defaultLanguage: 'en',
        currency: 'aud',
        dateFormat: 'dd/MM/yyyy',
        measurementUnits: 'metric',
        communicationStyle: 'friendly',
      }),
    ).toThrow(/currency/);
  });

  it('builds dual language views', () => {
    const view = buildDualLanguageView({
      mode: 'both',
      originalLanguage: 'vi',
      originalText: 'Bánh Mì Đặc Biệt',
      localizedLanguage: 'en',
      localizedText: 'Special Vietnamese Bánh Mì',
    });
    expect(view.attributionLabel).toMatch(/Cardbey AI/);
    expect(pickDualLanguageDisplay(view)).toEqual({
      primary: 'Special Vietnamese Bánh Mì',
      secondary: 'Bánh Mì Đặc Biệt',
    });
  });

  it('never allows overwriting canonical via policy', () => {
    const product = decideTranslationPolicy('product', { confidence: 'high' });
    expect(product.mayOverwriteCanonical).toBe(false);
    expect(product.writeToTranslationsLayer).toBe(true);
    expect(product.requiresOwnerReview).toBe(true);

    const chat = decideTranslationPolicy('conversation', { confidence: 'low' });
    expect(chat.mayOverwriteCanonical).toBe(false);
    expect(chat.requiresOwnerReview).toBe(false);
  });

  it('requires review for low-confidence published classes', () => {
    const decision = decideTranslationPolicy('category', { confidence: 'low' });
    expect(decision.requiresOwnerReview).toBe(true);
  });

  it('validates translation + canonical refs', () => {
    const ref = assertCanonicalContentRef({
      entityType: 'product',
      entityId: 'p1',
      field: 'name',
      sourceLanguage: 'vi',
      revision: 3,
    });
    expect(ref.revision).toBe(3);
    const tr = assertTranslationRecord({
      id: 't1',
      targetLanguage: 'en',
      text: 'Special Vietnamese Bánh Mì',
      confidence: 'high',
      sourceRevision: 3,
      status: 'draft',
    });
    expect(tr.confidence).toBe('high');
  });

  it('resolves glossary preferred terms', () => {
    const entry = assertGlossaryEntry({
      id: 'g1',
      term: 'Bánh mì',
      policy: 'preferred_term',
      preferredByLanguage: { en: 'Vietnamese Bánh Mì' },
    });
    expect(resolveGlossaryTerm(entry, 'en')).toEqual({
      action: 'prefer',
      text: 'Vietnamese Bánh Mì',
    });
    expect(resolveGlossaryTerm({ ...entry, policy: 'never_translate' }, 'en')).toEqual({
      action: 'keep',
      text: 'Bánh mì',
    });
  });

  it('builds cache keys per language × revision', () => {
    expect(
      buildTranslationCacheKey({
        entityType: 'product',
        entityId: 'p1',
        field: 'name',
        targetLanguage: 'en',
        revision: 2,
      }),
    ).toBe('product::p1::name::en::2');
  });
});

describe('Language Intelligence Phase 1 — registries', () => {
  beforeEach(() => {
    __reinitializeLanguageIntelligenceRegistriesForTests();
  });

  afterEach(() => {
    __reinitializeLanguageIntelligenceRegistriesForTests();
  });

  it('registers seed languages, regions, glossary', () => {
    expect(listLanguages()).toHaveLength(12);
    expect(hasLanguage('vi')).toBe(true);
    expect(getLanguage('ja')?.nativeName).toBe('日本語');
    expect(listRegions().map((r) => r.id).sort()).toEqual(['AU', 'DE', 'JP', 'US', 'VN']);
    expect(getRegion('VN')?.currency).toBe('VND');
    expect(listGlossaryEntries().length).toBeGreaterThanOrEqual(3);
    expect(matchGlossaryInText('Welcome to Cardbey', 'vi')[0]?.resolution.action).toBe('keep');
  });
});

describe('Language Intelligence Phase 1 — resolver', () => {
  beforeEach(() => {
    __reinitializeLanguageIntelligenceRegistriesForTests();
  });

  it('honors explicit language over browser', () => {
    const r = resolveLanguage({
      explicitLanguage: 'ja',
      browserLanguage: 'vi',
      region: 'AU',
    });
    expect(r.language).toBe('ja');
    expect(r.resolvedFrom).toBe('explicit');
    expect(r.manualSelectionHonored).toBe(true);
  });

  it('uses account preference before browser', () => {
    const r = resolveLanguage({
      accountPreference: { preferredLanguage: 'vi', preferredRegion: 'VN' },
      browserLanguage: 'en-US',
    });
    expect(r.language).toBe('vi');
    expect(r.region).toBe('VN');
    expect(r.currency).toBe('VND');
    expect(r.resolvedFrom).toBe('account');
  });

  it('falls back to region default then English', () => {
    const byRegion = resolveLanguage({ region: 'JP' });
    expect(byRegion.language).toBe('ja');
    expect(byRegion.resolvedFrom).toBe('region_default');

    const fallback = resolveLanguage({
      region: 'ZZ',
      browserLanguage: 'xx-XX',
    });
    expect(fallback.language).toBe('en');
  });

  it('normalizes user preference shape', () => {
    const pref = normalizeUserLocalePreference({
      preferredLanguage: 'en-AU',
      preferredCurrency: 'aud',
      preferredMeasurementUnits: 'imperial',
    });
    expect(pref.preferredLanguage).toBe('en');
    expect(pref.preferredCurrency).toBe('AUD');
    expect(pref.preferredMeasurementUnits).toBe('imperial');
  });
});

describe('Language Intelligence Phase 1 — regional formatting', () => {
  it('formats currency and distance', () => {
    expect(formatCurrency(25, 'AUD', 'en-AU')).toMatch(/25/);
    expect(formatDistance(5, 'metric')).toBe('5 km');
    expect(formatDistance(5, 'imperial')).toMatch(/miles/);
  });

  it('formats dates and US 12h time', () => {
    expect(formatDate('2026-07-31T00:00:00.000Z', 'dd/MM/yyyy')).toBe('31/07/2026');
    expect(formatDate('2026-07-31T00:00:00.000Z', 'MM/dd/yyyy')).toBe('07/31/2026');
    expect(formatTimeOfDay('09:00', 'US')).toMatch(/9:00/i);
    expect(formatTimeOfDay('09:00', 'AU')).toMatch(/09:00|9:00/);
  });
});

describe('Language Intelligence Phase 1 — adapters', () => {
  it('maps unsupported LI languages to en for legacy LLM', () => {
    expect(listLegacyLlmLocales()).toEqual(expect.arrayContaining(['en', 'vi']));
    expect(toLegacyLlmLocale('vi')).toBe('vi');
    expect(toLegacyLlmLocale('th')).toBe('en');
  });

  it('reads canonical vs localized without overwrite', () => {
    const model = {
      name: 'Bánh Mì Đặc Biệt',
      translations: { en: { name: 'Special Vietnamese Bánh Mì' } },
    };
    expect(readCanonicalField(model, 'name')).toBe('Bánh Mì Đặc Biệt');
    expect(readLocalizedField(model, 'name', 'en')).toBe('Special Vietnamese Bánh Mì');
    const patch = buildTranslationsLayerPatch(model, 'ja', { name: '特別バインミー' });
    expect(patch.translations.ja.name).toBe('特別バインミー');
    expect(model.name).toBe('Bánh Mì Đặc Biệt');
  });
});

describe('Language Intelligence Phase 1 — flags', () => {
  const prev = process.env.ENABLE_LANGUAGE_INTELLIGENCE_V1;

  afterEach(() => {
    if (prev === undefined) delete process.env.ENABLE_LANGUAGE_INTELLIGENCE_V1;
    else process.env.ENABLE_LANGUAGE_INTELLIGENCE_V1 = prev;
  });

  it('is never authoritative', () => {
    expect(isLanguageIntelligenceAuthoritative()).toBe(false);
  });

  it('diagnostics empty when flag off', () => {
    process.env.ENABLE_LANGUAGE_INTELLIGENCE_V1 = 'false';
    expect(isLanguageIntelligenceV1Enabled()).toBe(false);
    expect(getLanguageIntelligenceDiagnostics().enabled).toBe(false);
    expect(getLanguageIntelligenceDiagnostics().languageCount).toBe(0);
  });

  it('diagnostics populated when flag on', () => {
    process.env.ENABLE_LANGUAGE_INTELLIGENCE_V1 = 'true';
    __reinitializeLanguageIntelligenceRegistriesForTests();
    const d = getLanguageIntelligenceDiagnostics();
    expect(d.enabled).toBe(true);
    expect(d.authoritative).toBe(false);
    expect(d.languageCount).toBe(12);
    expect(d.regionCount).toBe(5);
  });
});
