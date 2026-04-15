/**
 * Public promo routes: GET /api/public/promos/:slug, POST /api/public/promos/:slug/scan
 * No auth. Safe fields only; 404 if promo/store missing.
 */

import express from 'express';
import { PrismaClient } from '@prisma/client';

const router = express.Router();
const prisma = new PrismaClient();

/** CUIDs are typically 25 chars; short slug is 8. */
function isLikelyCuid(s) {
  return typeof s === 'string' && s.length > 15;
}

/**
 * GET /api/public/promos/:slug
 * Public. Lookup by slug (or by id if slug param looks like a cuid for backward compat).
 * Returns safe fields for landing: slug, title, subtitle, heroImageUrl, ctaLabel, targetUrl, couponCode, storeName, storeSlug, storeLogo.
 */
router.get('/:slug', async (req, res, next) => {
  try {
    const slugParam = req.params.slug?.trim();
    if (!slugParam) {
      return res.status(404).json({ ok: false, error: 'Not found', message: 'Promo not found' });
    }
    const bySlug = !isLikelyCuid(slugParam);
    const promo = bySlug
      ? await prisma.storePromo.findUnique({
          where: { slug: slugParam, isActive: true },
          include: { business: { select: { id: true, name: true, slug: true, logo: true } } },
        })
      : await prisma.storePromo.findUnique({
          where: { id: slugParam },
          include: { business: { select: { id: true, name: true, slug: true, logo: true } } },
        });
    if (!promo || !promo.business) {
      return res.status(404).json({ ok: false, error: 'Not found', message: 'Promo not found' });
    }
    const b = promo.business;
    const heroUrl = promo.heroImageUrl ?? promo.heroImage ?? null;
    res.json({
      ok: true,
      promo: {
        id: promo.id,
        slug: promo.slug ?? promo.id,
        title: promo.title,
        subtitle: promo.subtitle ?? null,
        description: promo.description ?? null,
        heroImageUrl: heroUrl,
        ctaLabel: promo.ctaLabel ?? 'View offer',
        targetUrl: promo.targetUrl ?? `/feed/${b.slug}`,
        couponCode: promo.code ?? null,
        storeId: b.id,
        storeName: b.name,
        storeSlug: b.slug,
        storeLogo: b.logo ?? null,
      },
    });
  } catch (error) {
    console.error('[PromosPublic] GET error:', error);
    next(error);
  }
});

/**
 * POST /api/public/promos/:slug/scan
 * Increment scanCount (idempotent; throttle is client-side).
 */
router.post('/:slug/scan', async (req, res, next) => {
  try {
    const slugParam = req.params.slug?.trim();
    if (!slugParam) {
      return res.status(404).json({ ok: false, error: 'Not found', message: 'Promo not found' });
    }
    const bySlug = !isLikelyCuid(slugParam);
    const promo = bySlug
      ? await prisma.storePromo.findUnique({ where: { slug: slugParam } })
      : await prisma.storePromo.findUnique({ where: { id: slugParam } });
    if (!promo) {
      return res.status(404).json({ ok: false, error: 'Not found', message: 'Promo not found' });
    }
    await prisma.storePromo.update({
      where: { id: promo.id },
      data: { scanCount: { increment: 1 } },
    });
    res.json({ ok: true });
  } catch (error) {
    console.error('[PromosPublic] Scan error:', error);
    next(error);
  }
});

export default router;
