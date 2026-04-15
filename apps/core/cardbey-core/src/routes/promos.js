/**
 * Public promo routes (Phase 1 Scan & Redeem).
 * GET /api/promos/:promoId - Public; returns safe fields for landing page. 404 if promo or store missing.
 */

import express from 'express';
import { PrismaClient } from '@prisma/client';

const router = express.Router();
const prisma = new PrismaClient();

/**
 * GET /api/promos/:promoId
 * Public. Returns: id, title, description, code, storeId, storeName, storeSlug, storeLogo, heroImage.
 * 404 if promo not found or store missing.
 */
router.get('/:promoId', async (req, res, next) => {
  try {
    const { promoId } = req.params;
    if (!promoId || !promoId.trim()) {
      return res.status(404).json({ ok: false, error: 'Not found', message: 'Promo not found' });
    }
    const promo = await prisma.storePromo.findUnique({
      where: { id: promoId.trim() },
      include: { business: { select: { id: true, name: true, slug: true, logo: true } } },
    });
    if (!promo || !promo.business) {
      return res.status(404).json({ ok: false, error: 'Not found', message: 'Promo not found' });
    }
    const b = promo.business;
    res.json({
      ok: true,
      promo: {
        id: promo.id,
        title: promo.title,
        description: promo.description ?? null,
        code: promo.code ?? null,
        startsAt: promo.startsAt?.toISOString() ?? null,
        endsAt: promo.endsAt?.toISOString() ?? null,
        heroImage: promo.heroImage ?? null,
        storeId: b.id,
        storeName: b.name,
        storeSlug: b.slug,
        storeLogo: b.logo ?? null,
      },
    });
  } catch (error) {
    console.error('[Promos] Get public error:', error);
    next(error);
  }
});

export default router;
