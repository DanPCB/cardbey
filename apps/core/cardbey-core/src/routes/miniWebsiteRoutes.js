/**
 * Mini-website publish API (dashboard PublishModal).
 * POST /publish/cardbey uses the same publishDraft path as POST /api/store/publish (temp store + draftId).
 * Published Business rows are isActive: true and appear on GET /api/storefront/frontscreen (Cardbey frontpage feed).
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getPrismaClient } from '../lib/prisma.js';
import { hasRole } from '../lib/authorization.js';
import { getTenantId } from '../lib/tenant.js';
import { canAccessDraftStore } from '../lib/draftOwnership.js';
import { getDraft } from '../services/draftStore/draftStoreService.js';
import { publishDraft, PublishDraftError } from '../services/draftStore/publishDraftService.js';
import { computeStylePreferencesUpdate } from '../lib/miniWebsiteSectionMerge.js';

const prisma = getPrismaClient();
const router = Router();

function isSuperAdmin(req) {
  return !!req.user && hasRole(req.user, 'super_admin');
}

/** Marketing app origin for public storefront links (/s/:slug). */
function publicWebBase() {
  const b =
    process.env.PUBLIC_WEB_BASE_URL ||
    process.env.FRONTEND_URL ||
    process.env.PUBLIC_BASE_URL ||
    'http://localhost:5174';
  return String(b).replace(/\/+$/, '');
}

/**
 * POST /api/mini-website/publish/cardbey
 * Body: { draftStoreId: string }
 */
router.post('/publish/cardbey', requireAuth, async (req, res, next) => {
  try {
    const draftStoreId =
      typeof req.body?.draftStoreId === 'string' ? req.body.draftStoreId.trim() : '';
    if (!draftStoreId) {
      return res.status(400).json({
        ok: false,
        error: 'draft_store_id_required',
        message: 'draftStoreId is required',
      });
    }

    const requireVerifiedToPublish =
      process.env.ENABLE_EMAIL_VERIFICATION === 'true' || process.env.ENABLE_EMAIL_VERIFICATION === '1';
    const allowUnverifiedPublish =
      process.env.CARD_BEY_ALLOW_UNVERIFIED_PUBLISH === 'true' ||
      process.env.CARD_BEY_ALLOW_UNVERIFIED_PUBLISH === '1';
    const superAdminBypass =
      req.user &&
      hasRole(req.user, 'super_admin') &&
      (process.env.NODE_ENV !== 'production' || process.env.PROD_OVERRIDE === 'true');
    if (
      requireVerifiedToPublish &&
      !allowUnverifiedPublish &&
      !superAdminBypass &&
      req.userId
    ) {
      const user = await prisma.user.findUnique({
        where: { id: req.userId },
        select: { emailVerified: true },
      });
      if (user && user.emailVerified !== true) {
        return res.status(403).json({
          ok: false,
          code: 'EMAIL_VERIFICATION_REQUIRED',
          error: 'EMAIL_VERIFICATION_REQUIRED',
          message:
            'Please verify your email before publishing. Check your inbox for the verification link, or request a new one from the store review page.',
        });
      }
    }

    const draft = await getDraft(draftStoreId);
    if (!draft) {
      return res.status(404).json({
        ok: false,
        error: 'not_found',
        message: 'Not found',
      });
    }

    const userId = req.userId ?? req.user?.id ?? null;
    const tenantKey = getTenantId(req.user) ?? userId ?? null;
    const allowed = await canAccessDraftStore(draft, {
      userId,
      tenantKey,
      isSuperAdmin: isSuperAdmin(req),
    });
    if (!allowed) {
      return res.status(403).json({
        ok: false,
        error: 'forbidden',
        message: 'You do not have access to this draft.',
      });
    }

    const result = await publishDraft(prisma, {
      storeId: 'temp',
      draftId: draftStoreId,
      userId: req.userId,
    });

    let slug = result.slug;
    if (!slug && result.storeId) {
      const business = await prisma.business.findUnique({
        where: { id: result.storeId },
        select: { slug: true },
      });
      slug = business?.slug ?? null;
    }

    const webBase = publicWebBase();
    const publicUrl = slug
      ? `${webBase}/s/${encodeURIComponent(slug)}`
      : `${webBase}/preview/store/${result.storeId}?view=public`;

    return res.status(200).json({
      ok: true,
      url: publicUrl,
      publishedSiteId: result.storeId,
      storefrontUrl: result.storefrontUrl,
      slug,
    });
  } catch (error) {
    if (error instanceof PublishDraftError) {
      const status = error.statusCode || 500;
      return res.status(status).json({
        ok: false,
        code: error.code,
        error: error.code,
        message: error.message,
      });
    }
    console.error('[MiniWebsite] publish/cardbey error:', error);
    next(error);
  }
});

/**
 * POST /api/mini-website/publish/custom-domain
 * Not implemented — explicit response so the dashboard gets JSON instead of 404.
 */
router.post('/publish/custom-domain', requireAuth, async (req, res) => {
  res.status(501).json({
    ok: false,
    error: 'not_implemented',
    message: 'Custom domain publishing is not available yet. Use Publish on Cardbey.',
  });
});

/**
 * GET /api/mini-website/publish/:draftStoreId/status
 * Placeholder for custom-domain polling; returns empty sites until custom domain is implemented.
 */
router.get('/publish/:draftStoreId/status', requireAuth, async (req, res) => {
  res.json({ ok: true, sites: [] });
});

/**
 * PATCH /api/mini-website/:storeId/sections
 * Body: { sections?: WebsiteSection[], patch?: { type, content }[], theme?: { templateId } | null }
 */
router.patch('/:storeId/sections', requireAuth, async (req, res, next) => {
  try {
    const storeId = typeof req.params?.storeId === 'string' ? req.params.storeId.trim() : '';
    if (!storeId) {
      return res.status(400).json({ ok: false, error: 'store_id_required', message: 'storeId is required' });
    }

    const userId = req.userId ?? req.user?.id ?? null;
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'unauthorized', message: 'Authentication required' });
    }

    const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
    const sections = Array.isArray(body.sections) ? body.sections : undefined;
    const patch = Array.isArray(body.patch) ? body.patch : undefined;
    const hasThemeKey = Object.prototype.hasOwnProperty.call(body, 'theme');

    if (!sections && !patch) {
      return res.status(400).json({
        ok: false,
        error: 'sections_or_patch_required',
        message: 'Provide sections (full replace) or patch (merge by section type)',
      });
    }

    const business = await prisma.business.findUnique({
      where: { id: storeId },
      select: { id: true, userId: true, stylePreferences: true },
    });
    if (!business) {
      return res.status(404).json({ ok: false, error: 'not_found', message: 'Store not found' });
    }
    if (business.userId !== userId) {
      return res.status(403).json({ ok: false, error: 'forbidden', message: 'You do not own this store' });
    }

    const updateBody = {};
    if (sections) updateBody.sections = sections;
    if (patch) updateBody.patch = patch;
    if (hasThemeKey) updateBody.theme = body.theme;

    const { nextStylePreferences, miniWebsite } = computeStylePreferencesUpdate(business.stylePreferences, updateBody);

    await prisma.business.update({
      where: { id: storeId },
      data: {
        stylePreferences: nextStylePreferences,
        updatedAt: new Date(),
      },
    });

    return res.status(200).json({
      ok: true,
      sections: miniWebsite.sections,
      theme: miniWebsite.theme ?? null,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
