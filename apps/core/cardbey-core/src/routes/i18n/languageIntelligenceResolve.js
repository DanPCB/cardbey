/**
 * Stage 0–2 Auto Resolution APIs
 *
 * GET    /api/language-intelligence/resolve
 * PUT    /api/language-intelligence/guest-language
 * DELETE /api/language-intelligence/guest-language
 *
 * Does not change dashboard i18next or storefront render.
 */

import express from 'express';
import { optionalAuth } from '../../middleware/auth.js';
import {
  isLanguageAutoResolutionV1Enabled,
  isLanguageResolveApiV1Enabled,
  isLanguageVisitorPreferenceV1Enabled,
  resolveAutoLanguage,
  toPublicLanguageResolutionEnvelope,
  readGuestLanguageCookie,
  setGuestLanguageCookie,
  clearGuestLanguageCookie,
  getUserLocalePreference,
  getBusinessLocalePreference,
} from '../../lib/languageIntelligence/index.js';

const router = express.Router();

function parseDeviceCandidates(req) {
  const raw = req.query.deviceLanguages || req.headers['x-device-languages'];
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(String);
  return String(raw)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Build resolution input from request (shared by resolve + after guest set).
 */
async function buildResolveInput(req) {
  const explicit =
    req.query.lang ||
    req.query.language ||
    req.body?.language ||
    req.body?.lang ||
    null;

  const authenticated = Boolean(req.userId);
  let accountPreference = null;
  if (authenticated) {
    try {
      accountPreference = await getUserLocalePreference(req.userId);
    } catch {
      accountPreference = null;
    }
  }

  let storeDefaultLanguage = null;
  let region = req.query.region || null;
  const storeId = req.query.storeId || req.body?.storeId;
  if (storeId) {
    try {
      const biz = await getBusinessLocalePreference(String(storeId));
      if (biz?.locale?.preferredLanguage) storeDefaultLanguage = biz.locale.preferredLanguage;
      if (!region && biz?.locale?.preferredRegion) region = biz.locale.preferredRegion;
      if (!region && biz?.regionHint) region = biz.regionHint;
    } catch {
      /* ignore */
    }
  }

  const guestLanguage = isLanguageVisitorPreferenceV1Enabled()
    ? readGuestLanguageCookie(req)
    : null;

  return {
    explicitSessionLanguage: explicit ? String(explicit) : null,
    accountPreference,
    guestLanguage,
    acceptLanguageHeader: req.headers['accept-language'],
    navigatorLanguages: parseDeviceCandidates(req),
    deviceLanguages: parseDeviceCandidates(req),
    region,
    storeDefaultLanguage,
    context: String(req.query.context || 'public_storefront'),
    authenticated,
    emitTelemetry: true,
  };
}

router.get('/language-intelligence/resolve', optionalAuth, async (req, res, next) => {
  try {
    if (!isLanguageResolveApiV1Enabled()) {
      return res.status(503).json({
        ok: false,
        error: 'resolve_api_disabled',
        message: 'ENABLE_LANGUAGE_RESOLVE_API_V1 is off',
      });
    }
    if (!isLanguageAutoResolutionV1Enabled()) {
      return res.status(503).json({
        ok: false,
        error: 'auto_resolution_disabled',
      });
    }

    const input = await buildResolveInput(req);
    const resolution = resolveAutoLanguage(input);
    const envelope = toPublicLanguageResolutionEnvelope(resolution);

    const body = { ok: true, ...envelope };

    // Dev-only diagnostics — never in production
    const debug =
      String(req.query.languageDebug || '') === '1' && process.env.NODE_ENV !== 'production';
    if (debug) {
      body.diagnostics = resolution.diagnostics;
    }

    res.json(body);
  } catch (err) {
    next(err);
  }
});

router.put('/language-intelligence/guest-language', optionalAuth, async (req, res, next) => {
  try {
    if (!isLanguageVisitorPreferenceV1Enabled()) {
      return res.status(503).json({
        ok: false,
        error: 'visitor_preference_disabled',
        message: 'ENABLE_LANGUAGE_VISITOR_PREFERENCE_V1 is off',
      });
    }
    const language = req.body?.language ?? req.body?.lang;
    if (!language) {
      return res.status(400).json({ ok: false, error: 'language_required' });
    }
    const set = setGuestLanguageCookie(res, language);
    if (!set.ok) {
      return res.status(400).json({ ok: false, error: set.error || 'unsupported_locale' });
    }

    // Return updated resolution envelope when resolve API also enabled
    if (isLanguageResolveApiV1Enabled()) {
      const input = await buildResolveInput(req);
      input.guestLanguage = set.language;
      input.explicitSessionLanguage = null; // preference saved; mode manual via cookie
      const resolution = resolveAutoLanguage(input);
      return res.json({
        ok: true,
        language: set.language,
        ...toPublicLanguageResolutionEnvelope(resolution),
      });
    }

    res.json({ ok: true, language: set.language });
  } catch (err) {
    next(err);
  }
});

router.delete('/language-intelligence/guest-language', optionalAuth, async (req, res, next) => {
  try {
    if (!isLanguageVisitorPreferenceV1Enabled()) {
      return res.status(503).json({
        ok: false,
        error: 'visitor_preference_disabled',
      });
    }
    clearGuestLanguageCookie(res);

    if (isLanguageResolveApiV1Enabled()) {
      const input = await buildResolveInput(req);
      input.guestLanguage = null;
      const resolution = resolveAutoLanguage(input);
      return res.json({
        ok: true,
        reset: true,
        ...toPublicLanguageResolutionEnvelope(resolution),
      });
    }

    res.json({ ok: true, reset: true });
  } catch (err) {
    next(err);
  }
});

export default router;
