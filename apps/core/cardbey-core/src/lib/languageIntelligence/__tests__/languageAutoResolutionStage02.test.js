import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  canonicalizeLocaleTag,
  parseAcceptLanguageHeader,
  matchSupportedLocale,
  resolveInterfaceLanguage,
  resolveRegionalLocale,
  resolveAutoLanguage,
  toPublicLanguageResolutionEnvelope,
  LANGUAGE_REASON_CODES,
  readGuestLanguageCookie,
  setGuestLanguageCookie,
  clearGuestLanguageCookie,
  guestCookiePolicy,
  __resetLanguageShadowTelemetryForTests,
  __reinitializeLanguageIntelligenceRegistriesForTests,
  listLanguageShadowTelemetry,
  isLanguageAutoResolutionV1Enabled,
  isLanguageResolveApiV1Enabled,
  isLanguageVisitorPreferenceV1Enabled,
} from '../index.js';

function mockRes() {
  /** @type {Record<string, any>} */
  const state = { cookies: {}, cleared: [] };
  return {
    state,
    cookie(name, value, opts) {
      state.cookies[name] = { value, opts };
    },
    clearCookie(name, opts) {
      state.cleared.push({ name, opts });
      delete state.cookies[name];
    },
  };
}

describe('Stage 0–2 — locale normalization', () => {
  beforeEach(() => {
    __reinitializeLanguageIntelligenceRegistriesForTests();
  });

  it('canonicalizes case and underscores', () => {
    expect(canonicalizeLocaleTag('VI_AU')).toBe('vi-au');
    expect(canonicalizeLocaleTag('en-US;q=0.9')).toBe('en-us');
  });

  it('rejects malformed locales', () => {
    expect(canonicalizeLocaleTag('!!!')).toBe('');
    expect(matchSupportedLocale('!!!').language).toBeNull();
  });

  it('matches vi-AU → vi base', () => {
    const m = matchSupportedLocale('vi-AU');
    expect(m.language).toBe('vi');
    expect(m.matchKind).toBe('base');
    expect(m.regionalLocaleHint).toBe('vi-au');
  });

  it('matches vi-VN exact via registry bcp47 when supported', () => {
    const m = matchSupportedLocale('vi-VN');
    expect(m.language).toBe('vi');
    expect(m.matchKind).toBe('exact');
  });

  it('matches en exact / en-GB → en base without region', () => {
    expect(matchSupportedLocale('en').matchKind).toBe('exact');
    const m = matchSupportedLocale('en-GB');
    expect(m.language).toBe('en');
    expect(m.matchKind).toBe('base');
  });

  it('en-GB → configured English regional variant when region set', () => {
    const m = matchSupportedLocale('en-GB', { regionId: 'AU' });
    expect(m.language).toBe('en');
    expect(m.matchKind).toBe('regional_variant');
    expect(m.regionalLocaleHint).toBe('en-AU');
  });

  it('falls through unsupported (does not invent region default)', () => {
    expect(matchSupportedLocale('xx-YY').language).toBeNull();
    expect(matchSupportedLocale('xx-YY', { regionId: 'JP' }).language).toBeNull();
  });

  it('parses weighted Accept-Language', () => {
    const tags = parseAcceptLanguageHeader('vi-AU,vi;q=0.9,en-AU;q=0.8,en;q=0.7');
    expect(tags[0]).toBe('vi-au');
    expect(tags).toContain('en-au');
  });

  it('empty / malformed header → []', () => {
    expect(parseAcceptLanguageHeader('')).toEqual([]);
    expect(parseAcceptLanguageHeader(null)).toEqual([]);
  });

  it('interface language falls back for non en/vi display', () => {
    expect(resolveInterfaceLanguage('vi')).toBe('vi');
    expect(resolveInterfaceLanguage('ja')).toBe('en');
  });

  it('regional locale can differ from display language', () => {
    const loc = resolveRegionalLocale({
      displayLanguage: 'vi',
      regionId: 'AU',
      matchedRegionalHint: 'vi-au',
    });
    // AU region intlLocale wins when regionId set
    expect(loc).toBe('en-AU');
  });
});

describe('Stage 0–2 — autoLanguageResolver precedence', () => {
  const envKeys = [
    'ENABLE_LANGUAGE_INTELLIGENCE_V1',
    'ENABLE_LANGUAGE_INTELLIGENCE_ENGINE_V1',
    'ENABLE_LANGUAGE_AUTO_RESOLUTION_V1',
  ];
  /** @type {Record<string, string|undefined>} */
  const prevEnv = {};

  beforeEach(() => {
    for (const k of envKeys) prevEnv[k] = process.env[k];
    __reinitializeLanguageIntelligenceRegistriesForTests();
    __resetLanguageShadowTelemetryForTests();
    process.env.ENABLE_LANGUAGE_INTELLIGENCE_V1 = 'true';
    process.env.ENABLE_LANGUAGE_INTELLIGENCE_ENGINE_V1 = 'true';
    process.env.ENABLE_LANGUAGE_AUTO_RESOLUTION_V1 = 'true';
  });

  afterEach(() => {
    for (const k of envKeys) {
      if (prevEnv[k] === undefined) delete process.env[k];
      else process.env[k] = prevEnv[k];
    }
  });

  it('explicit session wins for anonymous', () => {
    const r = resolveAutoLanguage({
      explicitSessionLanguage: 'ja',
      guestLanguage: 'vi',
      acceptLanguageHeader: 'en-AU,en;q=0.8',
      authenticated: false,
      force: true,
      emitTelemetry: true,
    });
    expect(r.displayLanguage).toBe('ja');
    expect(r.source).toBe('explicit_session');
    expect(r.reasonCode).toBe(LANGUAGE_REASON_CODES.LANGUAGE_EXPLICIT_SESSION);
    expect(r.mode).toBe('manual');
    expect(r.confidence).toBe('explicit');
  });

  it('guest cookie wins for anonymous over browser', () => {
    const r = resolveAutoLanguage({
      guestLanguage: 'vi',
      acceptLanguageHeader: 'en-AU,en;q=0.9',
      authenticated: false,
      force: true,
    });
    expect(r.displayLanguage).toBe('vi');
    expect(r.source).toBe('visitor_preference');
    expect(r.reasonCode).toBe(LANGUAGE_REASON_CODES.LANGUAGE_VISITOR_SAVED);
  });

  it('manual account is not overridden by guest cookie', () => {
    const r = resolveAutoLanguage({
      authenticated: true,
      accountPreference: {
        preferredLanguage: 'en',
        preferredRegion: 'AU',
        manualLanguageSelection: true,
      },
      guestLanguage: 'vi',
      acceptLanguageHeader: 'ja,en;q=0.5',
      force: true,
    });
    expect(r.displayLanguage).toBe('en');
    expect(r.source).toBe('account_preference');
    expect(r.diagnostics.hasManualAccount).toBe(true);
  });

  it('manual account wins over explicit session when signed-in', () => {
    const r = resolveAutoLanguage({
      authenticated: true,
      accountPreference: {
        preferredLanguage: 'vi',
        manualLanguageSelection: true,
      },
      explicitSessionLanguage: 'ja',
      force: true,
    });
    expect(r.displayLanguage).toBe('vi');
    expect(r.source).toBe('account_preference');
  });

  it('browser exact / base match', () => {
    const exact = resolveAutoLanguage({
      acceptLanguageHeader: 'ja-JP,en;q=0.5',
      authenticated: false,
      force: true,
    });
    expect(exact.displayLanguage).toBe('ja');
    expect([
      LANGUAGE_REASON_CODES.LANGUAGE_BROWSER_EXACT_MATCH,
      LANGUAGE_REASON_CODES.LANGUAGE_BROWSER_BASE_MATCH,
    ]).toContain(exact.reasonCode);

    const base = resolveAutoLanguage({
      acceptLanguageHeader: 'vi-AU;q=1',
      authenticated: false,
      force: true,
    });
    expect(base.displayLanguage).toBe('vi');
  });

  it('weighted Accept-Language prefers higher q', () => {
    const r = resolveAutoLanguage({
      acceptLanguageHeader: 'en;q=0.5,ja;q=0.9',
      authenticated: false,
      force: true,
    });
    expect(r.displayLanguage).toBe('ja');
  });

  it('regional then global English fallback', () => {
    const regional = resolveAutoLanguage({
      region: 'JP',
      acceptLanguageHeader: 'xx-YY',
      authenticated: false,
      force: true,
    });
    expect(regional.displayLanguage).toBe('ja');
    expect(regional.reasonCode).toBe(LANGUAGE_REASON_CODES.LANGUAGE_REGION_FALLBACK);

    const global = resolveAutoLanguage({
      acceptLanguageHeader: 'xx',
      region: 'ZZ',
      authenticated: false,
      force: true,
    });
    // ZZ unknown → AU default region → en
    expect(global.displayLanguage).toBe('en');
  });

  it('display language can differ from regional locale', () => {
    const r = resolveAutoLanguage({
      explicitSessionLanguage: 'vi',
      region: 'AU',
      authenticated: false,
      force: true,
    });
    expect(r.displayLanguage).toBe('vi');
    expect(r.interfaceLanguage).toBe('vi');
    expect(r.regionalLocale).toBe('en-AU');
  });

  it('public envelope strips diagnostics', () => {
    const r = resolveAutoLanguage({
      explicitSessionLanguage: 'en',
      force: true,
    });
    const env = toPublicLanguageResolutionEnvelope(r);
    expect(env).toEqual({
      displayLanguage: 'en',
      interfaceLanguage: 'en',
      regionalLocale: expect.any(String),
      source: 'explicit_session',
      confidence: 'explicit',
      reasonCode: LANGUAGE_REASON_CODES.LANGUAGE_EXPLICIT_SESSION,
      mode: 'manual',
    });
    expect(env).not.toHaveProperty('diagnostics');
  });

  it('emits shadow telemetry', () => {
    resolveAutoLanguage({
      acceptLanguageHeader: 'en',
      force: true,
      emitTelemetry: true,
      context: 'public_storefront',
    });
    const events = listLanguageShadowTelemetry(10);
    expect(events.some((e) => e.event === 'language.resolution.completed')).toBe(true);
  });
});

describe('Stage 0–2 — guest cookie', () => {
  it('saves valid locale and rejects unsupported', () => {
    const res = mockRes();
    expect(setGuestLanguageCookie(res, 'vi').ok).toBe(true);
    expect(res.state.cookies.cardbey_language.value).toBe('vi');
    expect(res.state.cookies.cardbey_language.opts.sameSite).toBe('lax');
    expect(res.state.cookies.cardbey_language.opts.path).toBe('/');

    expect(setGuestLanguageCookie(res, 'xx-ZZ').ok).toBe(false);
  });

  it('reads cookie and ignores tampered values', () => {
    expect(
      readGuestLanguageCookie({ cookies: { cardbey_language: 'vi' } }),
    ).toBe('vi');
    expect(
      readGuestLanguageCookie({ cookies: { cardbey_language: 'evil;script' } }),
    ).toBeNull();
    expect(
      readGuestLanguageCookie({ cookies: { cardbey_language: 'not-a-lang' } }),
    ).toBeNull();
  });

  it('reset clears preference', () => {
    const res = mockRes();
    setGuestLanguageCookie(res, 'ja');
    clearGuestLanguageCookie(res);
    expect(res.state.cleared.some((c) => c.name === 'cardbey_language')).toBe(true);
  });

  it('production cookie is secure', () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    const res = mockRes();
    setGuestLanguageCookie(res, 'en');
    expect(res.state.cookies.cardbey_language.opts.secure).toBe(true);
    process.env.NODE_ENV = prev;
  });

  it('policy documents minimal value', () => {
    expect(guestCookiePolicy().value).toMatch(/language_code/);
  });
});

describe('Stage 0–2 — resolve API envelope (flag-gated)', () => {
  const keys = [
    'ENABLE_LANGUAGE_INTELLIGENCE_V1',
    'ENABLE_LANGUAGE_INTELLIGENCE_ENGINE_V1',
    'ENABLE_LANGUAGE_AUTO_RESOLUTION_V1',
    'ENABLE_LANGUAGE_RESOLVE_API_V1',
    'ENABLE_LANGUAGE_VISITOR_PREFERENCE_V1',
  ];
  /** @type {Record<string, string|undefined>} */
  const prev = {};

  beforeEach(async () => {
    for (const k of keys) prev[k] = process.env[k];
    __reinitializeLanguageIntelligenceRegistriesForTests();
    __resetLanguageShadowTelemetryForTests();
  });

  afterEach(() => {
    for (const k of keys) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
  });

  async function mountApp() {
    const express = (await import('express')).default;
    const cookieParser = (await import('cookie-parser')).default;
    const router = (await import('../../../routes/i18n/languageIntelligenceResolve.js')).default;
    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use((req, _res, next) => {
      // optionalAuth stub — tests set req.userId via header
      const uid = req.headers['x-test-user-id'];
      if (uid) req.userId = String(uid);
      next();
    });
    app.use('/api', router);
    return app;
  }

  it('flag-off returns 503', async () => {
    delete process.env.ENABLE_LANGUAGE_AUTO_RESOLUTION_V1;
    delete process.env.ENABLE_LANGUAGE_RESOLVE_API_V1;
    process.env.ENABLE_LANGUAGE_INTELLIGENCE_V1 = 'true';
    process.env.ENABLE_LANGUAGE_INTELLIGENCE_ENGINE_V1 = 'true';
    const request = (await import('supertest')).default;
    const app = await mountApp();
    const res = await request(app).get('/api/language-intelligence/resolve');
    expect(res.status).toBe(503);
    expect(res.body.ok).toBe(false);
  });

  it('safe public envelope — anonymous + Accept-Language', async () => {
    process.env.ENABLE_LANGUAGE_INTELLIGENCE_V1 = 'true';
    process.env.ENABLE_LANGUAGE_INTELLIGENCE_ENGINE_V1 = 'true';
    process.env.ENABLE_LANGUAGE_AUTO_RESOLUTION_V1 = 'true';
    process.env.ENABLE_LANGUAGE_RESOLVE_API_V1 = 'true';
    const request = (await import('supertest')).default;
    const app = await mountApp();
    const res = await request(app)
      .get('/api/language-intelligence/resolve')
      .set('Accept-Language', 'vi-AU,vi;q=0.9,en;q=0.8');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.displayLanguage).toBe('vi');
    expect(res.body.interfaceLanguage).toBe('vi');
    expect(res.body).toHaveProperty('regionalLocale');
    expect(res.body).toHaveProperty('source');
    expect(res.body).toHaveProperty('confidence');
    expect(res.body).toHaveProperty('reasonCode');
    expect(res.body).toHaveProperty('mode');
    expect(res.body).not.toHaveProperty('diagnostics');
    expect(JSON.stringify(res.body)).not.toMatch(/accept-language|userId|ip/i);
  });

  it('explicit query override', async () => {
    process.env.ENABLE_LANGUAGE_INTELLIGENCE_V1 = 'true';
    process.env.ENABLE_LANGUAGE_INTELLIGENCE_ENGINE_V1 = 'true';
    process.env.ENABLE_LANGUAGE_AUTO_RESOLUTION_V1 = 'true';
    process.env.ENABLE_LANGUAGE_RESOLVE_API_V1 = 'true';
    const request = (await import('supertest')).default;
    const app = await mountApp();
    const res = await request(app)
      .get('/api/language-intelligence/resolve?lang=ja')
      .set('Accept-Language', 'en');
    expect(res.body.displayLanguage).toBe('ja');
    expect(res.body.source).toBe('explicit_session');
    expect(res.body.mode).toBe('manual');
  });

  it('guest set / reset idempotent when visitor flag on', async () => {
    process.env.ENABLE_LANGUAGE_INTELLIGENCE_V1 = 'true';
    process.env.ENABLE_LANGUAGE_INTELLIGENCE_ENGINE_V1 = 'true';
    process.env.ENABLE_LANGUAGE_AUTO_RESOLUTION_V1 = 'true';
    process.env.ENABLE_LANGUAGE_RESOLVE_API_V1 = 'true';
    process.env.ENABLE_LANGUAGE_VISITOR_PREFERENCE_V1 = 'true';
    const request = (await import('supertest')).default;
    const app = await mountApp();
    const agent = request.agent(app);
    const set1 = await agent.put('/api/language-intelligence/guest-language').send({ language: 'vi' });
    expect(set1.status).toBe(200);
    expect(set1.body.language).toBe('vi');
    const set2 = await agent.put('/api/language-intelligence/guest-language').send({ language: 'vi' });
    expect(set2.status).toBe(200);
    expect(set2.body.language).toBe('vi');
    const resolved = await agent.get('/api/language-intelligence/resolve');
    expect(resolved.body.displayLanguage).toBe('vi');
    expect(resolved.body.source).toBe('visitor_preference');
    const reset1 = await agent.delete('/api/language-intelligence/guest-language');
    expect(reset1.status).toBe(200);
    expect(reset1.body.reset).toBe(true);
    const reset2 = await agent.delete('/api/language-intelligence/guest-language');
    expect(reset2.status).toBe(200);
    expect(reset2.body.reset).toBe(true);
    expect(reset2.body.source).not.toBe('visitor_preference');
  });

  it('visitor preference flag-off rejects guest set', async () => {
    process.env.ENABLE_LANGUAGE_INTELLIGENCE_V1 = 'true';
    process.env.ENABLE_LANGUAGE_INTELLIGENCE_ENGINE_V1 = 'true';
    process.env.ENABLE_LANGUAGE_AUTO_RESOLUTION_V1 = 'true';
    process.env.ENABLE_LANGUAGE_RESOLVE_API_V1 = 'true';
    delete process.env.ENABLE_LANGUAGE_VISITOR_PREFERENCE_V1;
    const request = (await import('supertest')).default;
    const app = await mountApp();
    const res = await request(app).put('/api/language-intelligence/guest-language').send({ language: 'vi' });
    expect(res.status).toBe(503);
  });

});

describe('Stage 0–2 — flags fail closed', () => {
  const keys = [
    'ENABLE_LANGUAGE_INTELLIGENCE_V1',
    'ENABLE_LANGUAGE_INTELLIGENCE_ENGINE_V1',
    'ENABLE_LANGUAGE_AUTO_RESOLUTION_V1',
    'ENABLE_LANGUAGE_RESOLVE_API_V1',
    'ENABLE_LANGUAGE_VISITOR_PREFERENCE_V1',
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

  it('auto resolution off when unset even if engine on', () => {
    process.env.ENABLE_LANGUAGE_INTELLIGENCE_V1 = 'true';
    process.env.ENABLE_LANGUAGE_INTELLIGENCE_ENGINE_V1 = 'true';
    delete process.env.ENABLE_LANGUAGE_AUTO_RESOLUTION_V1;
    delete process.env.ENABLE_LANGUAGE_RESOLVE_API_V1;
    delete process.env.ENABLE_LANGUAGE_VISITOR_PREFERENCE_V1;
    expect(isLanguageAutoResolutionV1Enabled()).toBe(false);
    expect(isLanguageResolveApiV1Enabled()).toBe(false);
    expect(isLanguageVisitorPreferenceV1Enabled()).toBe(false);
  });

  it('child flags require parent', () => {
    process.env.ENABLE_LANGUAGE_INTELLIGENCE_V1 = 'true';
    process.env.ENABLE_LANGUAGE_INTELLIGENCE_ENGINE_V1 = 'true';
    process.env.ENABLE_LANGUAGE_AUTO_RESOLUTION_V1 = 'true';
    process.env.ENABLE_LANGUAGE_RESOLVE_API_V1 = 'true';
    process.env.ENABLE_LANGUAGE_VISITOR_PREFERENCE_V1 = 'true';
    expect(isLanguageAutoResolutionV1Enabled()).toBe(true);
    expect(isLanguageResolveApiV1Enabled()).toBe(true);
    expect(isLanguageVisitorPreferenceV1Enabled()).toBe(true);
  });
});
