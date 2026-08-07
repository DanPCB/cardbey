/**
 * Phase 4 preference / cultural / glossary APIs.
 *
 * GET|PATCH /api/language-intelligence/preferences
 * GET|PATCH /api/language-intelligence/business/:storeId/preferences
 * GET  /api/language-intelligence/business/:storeId/glossary
 * POST /api/language-intelligence/business/:storeId/glossary/propose
 * POST /api/language-intelligence/business/:storeId/glossary/approve
 * GET  /api/language-intelligence/cultural-style
 */

import express from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { prisma } from '../../lib/prisma.js';
import {
  isLanguageIntelligencePreferencesV1Enabled,
  getUserLocalePreference,
  setUserLocalePreference,
  getBusinessLocalePreference,
  setBusinessLocalePreference,
  resolveLanguageForUser,
  resolveEffectiveCulturalStyle,
  resolveCulturalAdaptation,
  culturalAdaptationInstruction,
  proposeGlossaryCandidates,
  listStoreGlossary,
  approveStoreGlossaryEntry,
} from '../../lib/languageIntelligence/index.js';

const router = express.Router();

async function assertStoreOwner(storeId, userId) {
  const store = await prisma.business.findUnique({
    where: { id: storeId },
    select: { id: true, userId: true },
  });
  if (!store) return { error: 'store_not_found', status: 404 };
  if (store.userId !== userId) return { error: 'access_denied', status: 403 };
  return { store };
}

router.get('/language-intelligence/preferences', requireAuth, async (req, res, next) => {
  try {
    if (!isLanguageIntelligencePreferencesV1Enabled()) {
      return res.status(503).json({ ok: false, error: 'preferences_disabled' });
    }
    const preference = await getUserLocalePreference(req.userId);
    const resolution = await resolveLanguageForUser(req.userId, {
      browserLanguage: req.headers['accept-language'],
    });
    res.json({ ok: true, preference, resolution });
  } catch (err) {
    next(err);
  }
});

router.patch('/language-intelligence/preferences', requireAuth, async (req, res, next) => {
  try {
    if (!isLanguageIntelligencePreferencesV1Enabled()) {
      return res.status(503).json({ ok: false, error: 'preferences_disabled' });
    }
    const preference = await setUserLocalePreference(req.userId, req.body || {});
    const resolution = await resolveLanguageForUser(req.userId, {});
    res.json({ ok: true, preference, resolution, manualSelectionHonored: true });
  } catch (err) {
    next(err);
  }
});

router.get('/language-intelligence/business/:storeId/preferences', requireAuth, async (req, res, next) => {
  try {
    if (!isLanguageIntelligencePreferencesV1Enabled()) {
      return res.status(503).json({ ok: false, error: 'preferences_disabled' });
    }
    const gate = await assertStoreOwner(req.params.storeId, req.userId);
    if (gate.error) return res.status(gate.status).json({ ok: false, error: gate.error });
    const preference = await getBusinessLocalePreference(req.params.storeId);
    const cultural = await resolveEffectiveCulturalStyle({ storeId: req.params.storeId });
    res.json({ ok: true, preference, cultural });
  } catch (err) {
    next(err);
  }
});

router.patch('/language-intelligence/business/:storeId/preferences', requireAuth, async (req, res, next) => {
  try {
    if (!isLanguageIntelligencePreferencesV1Enabled()) {
      return res.status(503).json({ ok: false, error: 'preferences_disabled' });
    }
    const gate = await assertStoreOwner(req.params.storeId, req.userId);
    if (gate.error) return res.status(gate.status).json({ ok: false, error: gate.error });
    const preference = await setBusinessLocalePreference(req.params.storeId, {
      locale: req.body?.locale,
      culturalStyle: req.body?.culturalStyle,
      storefrontLanguagePolicy: req.body?.storefrontLanguagePolicy,
    });
    res.json({ ok: true, preference });
  } catch (err) {
    next(err);
  }
});

router.get('/language-intelligence/business/:storeId/glossary', requireAuth, async (req, res, next) => {
  try {
    if (!isLanguageIntelligencePreferencesV1Enabled()) {
      return res.status(503).json({ ok: false, error: 'preferences_disabled' });
    }
    const gate = await assertStoreOwner(req.params.storeId, req.userId);
    if (gate.error) return res.status(gate.status).json({ ok: false, error: gate.error });
    const glossary = await listStoreGlossary(req.params.storeId);
    res.json({ ok: true, ...glossary });
  } catch (err) {
    next(err);
  }
});

router.post('/language-intelligence/business/:storeId/glossary/propose', requireAuth, async (req, res, next) => {
  try {
    if (!isLanguageIntelligencePreferencesV1Enabled()) {
      return res.status(503).json({ ok: false, error: 'preferences_disabled' });
    }
    const gate = await assertStoreOwner(req.params.storeId, req.userId);
    if (gate.error) return res.status(gate.status).json({ ok: false, error: gate.error });
    const text = String(req.body?.text || '');
    if (!text.trim()) return res.status(400).json({ ok: false, error: 'text_required' });
    const candidates = proposeGlossaryCandidates(text, {
      storeId: req.params.storeId,
      sourceLanguage: req.body?.sourceLanguage,
    });
    res.json({ ok: true, candidates, persisted: false });
  } catch (err) {
    next(err);
  }
});

router.post('/language-intelligence/business/:storeId/glossary/approve', requireAuth, async (req, res, next) => {
  try {
    if (!isLanguageIntelligencePreferencesV1Enabled()) {
      return res.status(503).json({ ok: false, error: 'preferences_disabled' });
    }
    const gate = await assertStoreOwner(req.params.storeId, req.userId);
    if (gate.error) return res.status(gate.status).json({ ok: false, error: gate.error });
    if (!req.body?.term) return res.status(400).json({ ok: false, error: 'term_required' });
    const entry = await approveStoreGlossaryEntry(req.params.storeId, req.body);
    res.json({ ok: true, entry });
  } catch (err) {
    next(err);
  }
});

router.get('/language-intelligence/cultural-style', requireAuth, async (req, res, next) => {
  try {
    if (!isLanguageIntelligencePreferencesV1Enabled()) {
      return res.status(503).json({ ok: false, error: 'preferences_disabled' });
    }
    const adaptation = resolveCulturalAdaptation({
      region: req.query.region,
      language: req.query.language,
      communicationStyle: req.query.style,
      brandTone: req.query.brandTone,
    });
    res.json({
      ok: true,
      adaptation,
      instruction: culturalAdaptationInstruction(adaptation),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
