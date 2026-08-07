import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  buildLocalizedConsumption,
  consumeLocalizedContent,
  applyFallbackToOriginal,
  assertConsumptionBoundary,
  requiresExplicitOptIn,
  defaultAllowGenerate,
  getConsumptionFrameworkInfo,
  getLanguageIntelligenceDiagnostics,
  CONSUMPTION_BOUNDARY_VERSION,
  __reinitializeLanguageIntelligenceRegistriesForTests,
} from '../index.js';

describe('Language Intelligence Phase 5A — ownership & fallback', () => {
  it('requires explicit opt-in for business/campaign/public', () => {
    expect(requiresExplicitOptIn('business_owned')).toBe(true);
    expect(requiresExplicitOptIn('campaign')).toBe(true);
    expect(requiresExplicitOptIn('storefront_public')).toBe(true);
    expect(requiresExplicitOptIn('system_ui')).toBe(false);
    expect(defaultAllowGenerate('storefront_public')).toBe(false);
    expect(defaultAllowGenerate('conversation')).toBe(true);
  });

  it('falls back to original on error', () => {
    const r = applyFallbackToOriginal({
      originalText: 'Bánh mì',
      localizedText: 'Banh mi',
      status: 'ready',
      error: new Error('timeout'),
    });
    expect(r.text).toBe('Bánh mì');
    expect(r.status).toBe('fallback_original');
    expect(r.usedFallback).toBe(true);
  });

  it('rejects direct engine calls at the boundary', () => {
    expect(() =>
      assertConsumptionBoundary('dashboard_chrome', { callsEngineDirectly: true }),
    ).toThrow(/must not call TranslationEngine/);
    expect(assertConsumptionBoundary('dashboard_chrome').authoritative).toBe(false);
  });
});

describe('Language Intelligence Phase 5A — LocalizedConsumptionView', () => {
  beforeEach(() => {
    __reinitializeLanguageIntelligenceRegistriesForTests();
  });

  it('gates business_owned without explicitOptIn', () => {
    const view = buildLocalizedConsumption({
      contentOwnership: 'business_owned',
      originalText: 'Bánh Mì Đặc Biệt',
      originalLanguage: 'vi',
      localizedText: 'Special Vietnamese Bánh Mì',
      targetLanguage: 'en',
      displayMode: 'both',
      status: 'ready',
      explicitOptIn: false,
    });
    expect(view.status).toBe('opt_in_required');
    expect(view.render.primary).toBe('Bánh Mì Đặc Biệt');
    expect(view.canonicalPreserved).toBe(true);
    expect(view.authoritative).toBe(false);
    expect(view.allowGenerate).toBe(false);
  });

  it('renders translated + attribution when opted in', () => {
    const view = buildLocalizedConsumption({
      contentOwnership: 'business_owned',
      originalText: 'Bánh Mì Đặc Biệt',
      originalLanguage: 'vi',
      localizedText: 'Special Vietnamese Bánh Mì',
      targetLanguage: 'en',
      displayMode: 'both',
      status: 'ready',
      explicitOptIn: true,
      surface: 'dashboard_chrome',
    });
    expect(view.status).toBe('ready');
    expect(view.render.primary).toBe('Special Vietnamese Bánh Mì');
    expect(view.render.secondary).toBe('Bánh Mì Đặc Biệt');
    expect(view.attribution).toMatch(/Cardbey AI/);
    expect(view.labels.viewOriginal).toBe('View Original');
    expect(view.version).toBe(CONSUMPTION_BOUNDARY_VERSION);
  });

  it('fails safe on failed status', () => {
    const view = buildLocalizedConsumption({
      contentOwnership: 'conversation',
      originalText: 'Xin chào',
      originalLanguage: 'vi',
      localizedText: null,
      targetLanguage: 'en',
      status: 'failed',
      explicitOptIn: true,
      error: 'provider_down',
    });
    expect(view.status).toBe('fallback_original');
    expect(view.render.primary).toBe('Xin chào');
    expect(view.usedFallback).toBe(true);
  });
});

describe('Language Intelligence Phase 5A — consumeLocalizedContent facade', () => {
  beforeEach(() => {
    process.env.ENABLE_LANGUAGE_INTELLIGENCE_V1 = 'true';
    process.env.ENABLE_LANGUAGE_INTELLIGENCE_ENGINE_V1 = 'true';
    process.env.ENABLE_LANGUAGE_INTELLIGENCE_CONSUMPTION_V1 = 'true';
    __reinitializeLanguageIntelligenceRegistriesForTests();
  });

  it('reads translations layer with preference + cultural metadata', () => {
    const entity = {
      name: 'Quán Việt',
      translations: { en: { name: 'Viet Cafe' } },
    };
    const view = consumeLocalizedContent({
      contentOwnership: 'business_owned',
      surface: 'storefront_public',
      entity,
      field: 'name',
      originalLanguage: 'vi',
      targetLanguage: 'en',
      explicitOptIn: true,
      accountPreference: { preferredLanguage: 'en', preferredRegion: 'AU' },
      displayMode: 'translated',
      force: true,
    });
    expect(view.status).toBe('ready');
    expect(view.localizedText).toBe('Viet Cafe');
    expect(view.preference?.preferredRegion || view.preference?.region).toBeTruthy();
    expect(view.cultural?.communicationStyle).toBeTruthy();
    expect(view.allowGenerate).toBe(false);
  });

  it('does not generate when translation missing', () => {
    const view = consumeLocalizedContent({
      contentOwnership: 'storefront_public',
      originalText: 'Phở',
      originalLanguage: 'vi',
      targetLanguage: 'en',
      explicitOptIn: true,
      force: true,
    });
    expect(view.status).toBe('missing');
    expect(view.render.primary).toBe('Phở');
    expect(view.allowGenerate).toBe(false);
  });
});

describe('Language Intelligence Phase 5A — diagnostics', () => {
  const keys = [
    'ENABLE_LANGUAGE_INTELLIGENCE_V1',
    'ENABLE_LANGUAGE_INTELLIGENCE_ENGINE_V1',
    'ENABLE_LANGUAGE_INTELLIGENCE_CONVERSATION_V1',
    'ENABLE_LANGUAGE_INTELLIGENCE_STOREFRONT_LOCALIZER_V1',
    'ENABLE_LANGUAGE_INTELLIGENCE_PREFERENCES_V1',
    'ENABLE_LANGUAGE_INTELLIGENCE_CONSUMPTION_V1',
  ];
  const prev = {};

  beforeEach(() => {
    for (const k of keys) prev[k] = process.env[k];
  });

  afterEach(() => {
    for (const k of keys) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
  });

  it('reports phase 5 with empty surfacesWired', () => {
    process.env.ENABLE_LANGUAGE_INTELLIGENCE_V1 = 'true';
    process.env.ENABLE_LANGUAGE_INTELLIGENCE_ENGINE_V1 = 'true';
    process.env.ENABLE_LANGUAGE_INTELLIGENCE_CONVERSATION_V1 = 'false';
    process.env.ENABLE_LANGUAGE_INTELLIGENCE_STOREFRONT_LOCALIZER_V1 = 'false';
    process.env.ENABLE_LANGUAGE_INTELLIGENCE_PREFERENCES_V1 = 'false';
    process.env.ENABLE_LANGUAGE_INTELLIGENCE_CONSUMPTION_V1 = 'true';
    delete process.env.ENABLE_LANGUAGE_AUTO_RESOLUTION_V1;
    delete process.env.ENABLE_LANGUAGE_DASHBOARD_PREF_BRIDGE_V1;
    const d = getLanguageIntelligenceDiagnostics();
    expect(d.phase).toBe(5);
    expect(d.consumption.enabled).toBe(true);
    expect(d.consumption.surfacesWired).toEqual([]);
    expect(d.authoritative).toBe(false);
    expect(getConsumptionFrameworkInfo().version).toBe(CONSUMPTION_BOUNDARY_VERSION);
  });
});
