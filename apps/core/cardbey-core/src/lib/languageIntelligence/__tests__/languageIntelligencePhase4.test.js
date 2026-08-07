import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  readLanguagesField,
  mergeLanguagesField,
  spokenLanguagesFromField,
  resolveCulturalAdaptation,
  culturalAdaptationInstruction,
  proposeGlossaryCandidates,
  normalizeUserLocalePreference,
  getLanguageIntelligenceDiagnostics,
  __reinitializeLanguageIntelligenceRegistriesForTests,
} from '../index.js';
import { resolveCanonicalIdentity } from '../../account/accountProfileResolver.js';

describe('Language Intelligence Phase 4 — languages field compat', () => {
  it('reads legacy array languages', () => {
    const r = readLanguagesField(['en', 'vi']);
    expect(r.spoken).toEqual(['en', 'vi']);
    expect(r.preference).toEqual({});
    expect(spokenLanguagesFromField(['vi'])).toEqual(['vi']);
  });

  it('merges structured preference without dropping spoken', () => {
    const next = mergeLanguagesField(['en'], {
      preference: {
        preferredLanguage: 'vi',
        preferredRegion: 'VN',
        preferredCurrency: 'VND',
        preferredDateFormat: 'dd/MM/yyyy',
        preferredMeasurementUnits: 'metric',
      },
    });
    expect(next.v).toBe(1);
    expect(next.spoken).toEqual(['en']);
    expect(next.preference.preferredLanguage).toBe('vi');
    expect(next.preference.manualLanguageSelection).toBe(true);
    expect(next.preference.preferredCurrency).toBe('VND');
  });

  it('keeps identity languages as spoken list for structured field', () => {
    const identity = resolveCanonicalIdentity({
      id: 'u1',
      accountProfile: {
        languages: {
          v: 1,
          spoken: ['vi', 'en'],
          preference: { preferredLanguage: 'vi', preferredRegion: 'VN' },
        },
      },
    });
    expect(identity.languages).toEqual(['vi', 'en']);
  });
});

describe('Language Intelligence Phase 4 — cultural adaptation', () => {
  beforeEach(() => {
    __reinitializeLanguageIntelligenceRegistriesForTests();
  });

  it('resolves VN polite and JP formal guidance', () => {
    const vn = resolveCulturalAdaptation({ region: 'VN', language: 'vi' });
    expect(vn.communicationStyle).toBe('polite');
    expect(vn.currency).toBe('VND');
    expect(culturalAdaptationInstruction(vn)).toMatch(/polite/i);

    const jp = resolveCulturalAdaptation({ region: 'JP' });
    expect(jp.communicationStyle).toBe('formal');
    expect(culturalAdaptationInstruction(jp)).toMatch(/formal/i);

    const us = resolveCulturalAdaptation({ region: 'US' });
    expect(us.communicationStyle).toBe('direct');
    expect(us.measurementUnits).toBe('imperial');
  });

  it('honors style override and brand tone', () => {
    const a = resolveCulturalAdaptation({
      region: 'AU',
      communicationStyle: 'structured',
      brandTone: 'minimal',
    });
    expect(a.communicationStyle).toBe('structured');
    expect(culturalAdaptationInstruction(a)).toMatch(/minimal/);
  });
});

describe('Language Intelligence Phase 4 — glossary learning', () => {
  it('proposes never-translate and Vietnamese food terms', () => {
    const candidates = proposeGlossaryCandidates(
      'Welcome to Saigon Kitchen. Try our bánh mì and Phở Đặc Biệt today.',
      { storeId: 's1', sourceLanguage: 'vi' },
    );
    expect(candidates.some((c) => /bánh/i.test(c.term))).toBe(true);
    expect(candidates.some((c) => c.term.includes('Saigon') || c.term.includes('Kitchen'))).toBe(true);
    expect(candidates.every((c) => c.ownerApproved === false)).toBe(true);
  });
});

describe('Language Intelligence Phase 4 — preference normalize', () => {
  it('accepts communicationStyleOverride', () => {
    const p = normalizeUserLocalePreference({
      preferredLanguage: 'en',
      communicationStyleOverride: 'direct',
    });
    expect(p.communicationStyleOverride).toBe('direct');
  });
});

describe('Language Intelligence Phase 4 — diagnostics', () => {
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

  it('reports phase 4 when preferences enabled', () => {
    process.env.ENABLE_LANGUAGE_INTELLIGENCE_V1 = 'true';
    process.env.ENABLE_LANGUAGE_INTELLIGENCE_ENGINE_V1 = 'true';
    process.env.ENABLE_LANGUAGE_INTELLIGENCE_CONVERSATION_V1 = 'false';
    process.env.ENABLE_LANGUAGE_INTELLIGENCE_STOREFRONT_LOCALIZER_V1 = 'false';
    process.env.ENABLE_LANGUAGE_INTELLIGENCE_PREFERENCES_V1 = 'true';
    process.env.ENABLE_LANGUAGE_INTELLIGENCE_CONSUMPTION_V1 = 'false';
    delete process.env.ENABLE_LANGUAGE_AUTO_RESOLUTION_V1;
    delete process.env.ENABLE_LANGUAGE_DASHBOARD_PREF_BRIDGE_V1;
    const d = getLanguageIntelligenceDiagnostics();
    expect(d.phase).toBe(4);
    expect(d.preferences.enabled).toBe(true);
    expect(d.authoritative).toBe(false);
  });
});

describe('Language Intelligence Phase 4 — business prefs merge (unit)', () => {
  it('readBusinessLanguageBlock isolates LI key', async () => {
    const { readBusinessLanguageBlock } = await import('../preferences/businessPreferenceStore.js');
    const { stylePreferences, block } = readBusinessLanguageBlock({
      style: 'modern',
      languageIntelligence: {
        locale: { preferredLanguage: 'vi' },
        culturalStyle: 'polite',
        glossary: [{ id: 'g1', term: 'Cardbey', policy: 'never_translate', ownerApproved: true }],
      },
    });
    expect(stylePreferences.style).toBe('modern');
    expect(block.culturalStyle).toBe('polite');
    expect(block.glossary).toHaveLength(1);
  });
});
