/**
 * Intent Capture: Store intent feed (no auth).
 * GET /api/public/stores/:storeId/intent-feed — JSON with store, offers, urls, qrUrl per offer.
 */

import express from 'express';
import { PrismaClient } from '@prisma/client';

const router = express.Router();
const prisma = new PrismaClient();

function getBaseUrl(req) {
  const envBase = process.env.PUBLIC_BASE_URL || process.env.API_BASE;
  if (envBase) return envBase.replace(/\/$/, '');
  const proto = req.get('x-forwarded-proto') || req.protocol || 'https';
  const host = req.get('x-forwarded-host') || req.get('host') || 'localhost:3000';
  return `${proto}://${host}`;
}

router.get('/:storeId/intent-feed', async (req, res, next) => {
  try {
    const storeId = (req.params.storeId || '').trim();
    if (!storeId) {
      return res.status(400).json({ ok: false, error: 'storeId required' });
    }

    const store = await prisma.business.findUnique({
      where: { id: storeId, isActive: true },
      select: { id: true, name: true, slug: true, address: true, suburb: true, postcode: true, country: true },
    });
    if (!store) {
      return res.status(404).json({ ok: false, error: 'Store not found' });
    }

    const offers = await prisma.storeOffer.findMany({
      where: { storeId: store.id, isActive: true },
      orderBy: { createdAt: 'desc' },
    });

    const baseUrl = getBaseUrl(req);
    const storeSlug = store.slug;

    const qrByOfferId = await prisma.dynamicQr.findMany({
      where: { storeId: store.id, type: 'offer', isActive: true },
    });
    const payloadOfferIds = new Map();
    qrByOfferId.forEach((qr) => {
      const offerId = qr.payload && typeof qr.payload === 'object' && qr.payload.offerId;
      if (offerId) payloadOfferIds.set(offerId, qr);
    });

    const offersWithUrls = offers.map((o) => {
      const qr = payloadOfferIds.get(o.id) || qrByOfferId.find((q) => q.targetPath && q.targetPath.includes(o.slug));
      const offerUrl = `${baseUrl}/p/${storeSlug}/offers/${o.slug}`;
      const qrUrl = qr ? `${baseUrl}/q/${qr.code}` : null;
      return {
        id: o.id,
        slug: o.slug,
        title: o.title,
        description: o.description,
        priceText: o.priceText,
        url: offerUrl,
        qrUrl,
      };
    });

    const body = {
      ok: true,
      store: {
        id: store.id,
        name: store.name,
        slug: store.slug,
        address: store.address,
        suburb: store.suburb,
        postcode: store.postcode,
        country: store.country,
      },
      offers: offersWithUrls,
    };

    res.json(body);
  } catch (err) {
    next(err);
  }
});

export default router;
