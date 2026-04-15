/**
 * Auth promo routes: POST /api/promos, GET /api/promos?storeId=, PATCH /api/promos/:id
 * Store owner only (business.userId === req.userId).
 */

import express from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth } from '../middleware/auth.js';
import { generateUniqueShortSlug } from '../utils/shortSlug.js';

const router = express.Router();
const prisma = new PrismaClient();

async function ensureStoreOwner(req, res, storeId) {
  const business = await prisma.business.findUnique({ where: { id: storeId } });
  if (!business) {
    res.status(404).json({ ok: false, error: 'Store not found', message: 'Store not found' });
    return [null, res];
  }
  const isDevAdmin = process.env.NODE_ENV !== 'production' && req.user?.isDevAdmin === true;
  if (!isDevAdmin && business.userId !== req.userId) {
    res.status(403).json({ ok: false, error: 'Forbidden', message: 'You do not have permission to access this store' });
    return [null, res];
  }
  return [business, null];
}

function buildTargetUrl(business, productId) {
  const base = `/feed/${business.slug}`;
  if (productId && productId.trim()) return `${base}?product=${encodeURIComponent(productId.trim())}`;
  return base;
}

/**
 * POST /api/promos
 * Body: storeId (required), productId?, title (required), subtitle?, heroImageUrl?, ctaLabel?, targetUrl?, couponCode?, startsAt?, endsAt?
 * Generates slug, sets isActive true, scanCount 0.
 */
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const { storeId, productId, title, subtitle, heroImageUrl, ctaLabel, targetUrl, couponCode, startsAt, endsAt } = req.body ?? {};
    if (!storeId || !title || typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({ ok: false, error: 'storeId and title are required', message: 'storeId and title are required' });
    }
    const [business, errRes] = await ensureStoreOwner(req, res, storeId);
    if (errRes) return;
    const slug = await generateUniqueShortSlug(prisma);
    const resolvedTargetUrl = (targetUrl && typeof targetUrl === 'string' && targetUrl.trim()) ? targetUrl.trim() : buildTargetUrl(business, productId);
    const promo = await prisma.storePromo.create({
      data: {
        storeId: business.id,
        productId: productId && typeof productId === 'string' ? productId.trim() || null : null,
        title: title.trim(),
        subtitle: subtitle && typeof subtitle === 'string' ? subtitle.trim() || null : null,
        heroImageUrl: heroImageUrl && typeof heroImageUrl === 'string' ? heroImageUrl.trim() || null : null,
        ctaLabel: ctaLabel && typeof ctaLabel === 'string' ? ctaLabel.trim() || null : null,
        targetUrl: resolvedTargetUrl,
        code: couponCode && typeof couponCode === 'string' ? couponCode.trim() || null : null,
        startsAt: startsAt ? new Date(startsAt) : null,
        endsAt: endsAt ? new Date(endsAt) : null,
        slug,
        isActive: true,
        scanCount: 0,
      },
    });
    res.status(201).json({ ok: true, promo });
  } catch (error) {
    console.error('[Promos] Create error:', error);
    next(error);
  }
});

/**
 * GET /api/promos?storeId=
 * List promos for store. Auth required; store owner only.
 */
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const storeId = req.query.storeId;
    if (!storeId || typeof storeId !== 'string') {
      return res.status(400).json({ ok: false, error: 'storeId query is required', message: 'storeId is required' });
    }
    const [business, errRes] = await ensureStoreOwner(req, res, storeId.trim());
    if (errRes) return;
    const promos = await prisma.storePromo.findMany({
      where: { storeId: business.id },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ ok: true, promos });
  } catch (error) {
    console.error('[Promos] List error:', error);
    next(error);
  }
});

/**
 * PATCH /api/promos/:id
 * Update promo. Auth required; store owner only.
 */
router.patch('/:id', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const promo = await prisma.storePromo.findUnique({ where: { id }, include: { business: true } });
    if (!promo || !promo.business) {
      return res.status(404).json({ ok: false, error: 'Not found', message: 'Promo not found' });
    }
    const isDevAdmin = process.env.NODE_ENV !== 'production' && req.user?.isDevAdmin === true;
    if (!isDevAdmin && promo.business.userId !== req.userId) {
      return res.status(403).json({ ok: false, error: 'Forbidden', message: 'You do not have permission to update this promo' });
    }
    const { title, subtitle, heroImageUrl, ctaLabel, targetUrl, couponCode, startsAt, endsAt, isActive } = req.body ?? {};
    const data = {};
    if (title !== undefined) data.title = typeof title === 'string' ? title.trim() : promo.title;
    if (subtitle !== undefined) data.subtitle = typeof subtitle === 'string' ? subtitle.trim() || null : promo.subtitle;
    if (heroImageUrl !== undefined) data.heroImageUrl = typeof heroImageUrl === 'string' ? heroImageUrl.trim() || null : promo.heroImageUrl;
    if (ctaLabel !== undefined) data.ctaLabel = typeof ctaLabel === 'string' ? ctaLabel.trim() || null : promo.ctaLabel;
    if (targetUrl !== undefined) data.targetUrl = typeof targetUrl === 'string' ? targetUrl.trim() || null : promo.targetUrl;
    if (couponCode !== undefined) data.code = typeof couponCode === 'string' ? couponCode.trim() || null : promo.code;
    if (startsAt !== undefined) data.startsAt = startsAt ? new Date(startsAt) : promo.startsAt;
    if (endsAt !== undefined) data.endsAt = endsAt ? new Date(endsAt) : promo.endsAt;
    if (isActive !== undefined) data.isActive = Boolean(isActive);
    const updated = await prisma.storePromo.update({ where: { id }, data });
    res.json({ ok: true, promo: updated });
  } catch (error) {
    console.error('[Promos] PATCH error:', error);
    next(error);
  }
});

export default router;
