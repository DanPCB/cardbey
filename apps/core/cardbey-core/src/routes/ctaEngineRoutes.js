/**
 * CTA Engine HTTP API — Phase 2 platform marketing consumer.
 * Selection only; does not execute protected mutations.
 */

import { Router } from 'express';
import { optionalAuth } from '../middleware/auth.js';
import { Features } from '../config/features.js';
import { evaluatePlatformMarketingCta } from '../lib/ctaEngine/platformMarketing/evaluatePlatformMarketing.js';
import { dismissCta, recordInteraction, recordConversion, recordImpression } from '../lib/ctaEngine/api/index.js';
import { PHASE2_PLATFORM_CAPABILITIES } from '../lib/ctaEngine/platformMarketing/phase2Capabilities.js';

const router = Router();

function subjectKeyFromReq(req) {
  const userId = req.user?.id || req.user?.userId;
  if (userId) return `user:${userId}`;
  const session =
    req.body?.subjectKey ||
    req.headers['x-cta-subject'] ||
    req.cookies?.cardbey_guest ||
    null;
  return session ? String(session) : 'anonymous';
}

/**
 * POST /api/cta/evaluate
 * Body: { surface, section, route, authenticated?, completedCapabilityIds?, dismissedCtaIds?, device? }
 */
router.post('/evaluate', optionalAuth, (req, res) => {
  try {
    if (!Features.ctaEngine.v1) {
      return res.status(404).json({ ok: false, error: 'CTA_ENGINE_DISABLED' });
    }
    if (!Features.ctaEngine.platformMarketingV1) {
      return res.status(404).json({ ok: false, error: 'PLATFORM_MARKETING_CTA_DISABLED' });
    }

    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const surface = String(body.surface || 'platform_marketing');
    if (surface !== 'platform_marketing') {
      return res.status(400).json({
        ok: false,
        error: 'UNSUPPORTED_SURFACE',
        message: 'Phase 2 only supports surface=platform_marketing',
      });
    }

    const authenticated = Boolean(req.user?.id || body.authenticated);
    const result = evaluatePlatformMarketingCta(
      {
        route: body.route || '/for-business',
        pageKind: 'marketing',
        section: body.section || null,
        scrollRatio: body.scrollRatio,
        authenticated,
        audience: authenticated ? body.audience || 'authenticated' : 'guest',
        completedCapabilityIds: body.completedCapabilityIds,
        dismissedCtaIds: body.dismissedCtaIds,
        device: body.device || 'mobile',
        language: body.language || 'en',
        journeyStage: body.journeyStage,
        featureFlags: body.featureFlags,
      },
      { subjectKey: subjectKeyFromReq(req) },
    );

    return res.json(result);
  } catch (err) {
    console.warn('[ctaEngine] evaluate failed:', err?.message || err);
    return res.status(200).json({
      ok: true,
      primary: null,
      secondary: [],
      error: 'EVALUATE_FALLBACK_EMPTY',
      message: 'CTA evaluation failed safely; no floating CTA',
    });
  }
});

/** GET /api/cta/platform-marketing/capabilities — serialisable descriptors for clients/docs */
router.get('/platform-marketing/capabilities', (_req, res) => {
  if (!Features.ctaEngine.v1 || !Features.ctaEngine.platformMarketingV1) {
    return res.status(404).json({ ok: false, error: 'PLATFORM_MARKETING_CTA_DISABLED' });
  }
  return res.json({
    ok: true,
    capabilities: PHASE2_PLATFORM_CAPABILITIES.map((c) => ({
      id: c.id,
      title: c.title,
      description: c.description,
      category: c.category,
      provider: c.provider,
      priority: c.priority,
      requiresAuth: c.requiresAuth,
      analyticsId: c.analyticsId,
      action: c.action,
      variantLabel: c.variantLabel,
      contexts: c.contexts,
    })),
  });
});

router.post('/dismiss', optionalAuth, (req, res) => {
  try {
    const variantId = String(req.body?.variantId || '').trim();
    if (!variantId) return res.status(400).json({ ok: false, error: 'variantId_required' });
    dismissCta(subjectKeyFromReq(req), variantId, {
      capabilityId: req.body?.capabilityId,
      surface: 'platform_marketing',
    });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(200).json({ ok: true, warning: err?.message });
  }
});

router.post('/events', optionalAuth, (req, res) => {
  try {
    const type = String(req.body?.type || 'impression');
    const payload = {
      capabilityId: req.body?.capabilityId,
      variantId: req.body?.variantId,
      analyticsId: req.body?.analyticsId,
      placement: req.body?.placement,
      surface: req.body?.surface || 'platform_marketing',
      meta: req.body?.meta,
    };
    if (type === 'click') recordInteraction(payload);
    else if (type === 'conversion') recordConversion(payload);
    else recordImpression(payload);
    return res.json({ ok: true, durable: false, status: 'EMITTED_ONLY' });
  } catch {
    return res.status(200).json({ ok: true, durable: false });
  }
});

export default router;
