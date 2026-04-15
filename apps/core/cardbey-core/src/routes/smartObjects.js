/**
 * Smart Object routes - Dynamic QR codes for print/landing
 * POST /api/smart-objects - Create
 * GET /api/smart-objects/:idOrPublicCode - Get by id or publicCode
 * POST /api/smart-objects/:id/active-promo - Set active promo
 */

import express from 'express';
import { PrismaClient } from '@prisma/client';
import { nanoid } from 'nanoid';
import { requireAuth, optionalAuth } from '../middleware/auth.js';

const router = express.Router();
const prisma = new PrismaClient();

const DEFAULT_PUBLIC_CODE_LENGTH = 8;

function getBaseUrl(req) {
  const envBase = process.env.PUBLIC_BASE_URL || process.env.API_BASE;
  if (envBase) return envBase.replace(/\/$/, '');
  const proto = req.get('x-forwarded-proto') || req.protocol || 'https';
  const host = req.get('x-forwarded-host') || req.get('host') || 'localhost:3000';
  return `${proto}://${host}`;
}

function toSmartObjectResponse(row, req) {
  const baseUrl = getBaseUrl(req);
  const qrPath = `/q/${row.publicCode}`;
  const qrUrl = baseUrl.startsWith('http') ? `${baseUrl}${qrPath}` : qrPath;
  return {
    id: row.id,
    publicCode: row.publicCode,
    storeId: row.storeId,
    productId: row.productId ?? null,
    type: row.type || 'print_bag',
    status: row.status || 'active',
    qrUrl,
  };
}

/**
 * POST /api/smart-objects
 * Create a SmartObject. Auth required.
 * Body: { storeId, productId?, type?, publicCode? }
 */
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const { storeId, productId, type, publicCode: requestedCode } = req.body || {};
    if (!storeId || typeof storeId !== 'string') {
      return res.status(400).json({
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: 'storeId is required' },
      });
    }

    const store = await prisma.business.findUnique({
      where: { id: storeId },
      select: { id: true, userId: true },
    });
    if (!store) {
      return res.status(404).json({
        ok: false,
        error: { code: 'STORE_NOT_FOUND', message: 'Store not found' },
      });
    }
    if (store.userId !== req.userId) {
      return res.status(403).json({
        ok: false,
        error: { code: 'ACCESS_DENIED', message: 'Not your store' },
      });
    }

    let publicCode = requestedCode && typeof requestedCode === 'string'
      ? requestedCode.trim().toLowerCase().replace(/[^a-z0-9-_]/g, '').slice(0, 32)
      : null;
    if (!publicCode) {
      let attempt = 0;
      while (attempt < 10) {
        publicCode = nanoid(DEFAULT_PUBLIC_CODE_LENGTH).toLowerCase();
        const exists = await prisma.smartObject.findUnique({ where: { publicCode } });
        if (!exists) break;
        attempt++;
      }
      if (!publicCode) {
        return res.status(500).json({
          ok: false,
          error: { code: 'CODE_GENERATION_FAILED', message: 'Could not generate unique publicCode' },
        });
      }
    } else {
      const exists = await prisma.smartObject.findUnique({ where: { publicCode } });
      if (exists) {
        return res.status(409).json({
          ok: false,
          error: { code: 'CODE_TAKEN', message: 'publicCode already in use' },
        });
      }
    }

    const row = await prisma.smartObject.create({
      data: {
        publicCode,
        storeId,
        productId: productId && typeof productId === 'string' ? productId : null,
        type: type && typeof type === 'string' ? type : 'print_bag',
        status: 'active',
      },
    });

    return res.status(200).json({
      ok: true,
      smartObject: toSmartObjectResponse(row, req),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/smart-objects/:idOrPublicCode
 * Get SmartObject by id or publicCode. Optional auth (public landing may call without auth).
 */
router.get('/:idOrPublicCode', optionalAuth, async (req, res, next) => {
  try {
    const { idOrPublicCode } = req.params;
    if (!idOrPublicCode) {
      return res.status(400).json({
        ok: false,
        error: { code: 'MISSING_ID', message: 'id or publicCode required' },
      });
    }

    const row = await prisma.smartObject.findFirst({
      where: {
        OR: [
          { id: idOrPublicCode },
          { publicCode: idOrPublicCode },
        ],
      },
    });

    if (!row) {
      return res.status(404).json({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'Smart object not found' },
      });
    }

    return res.status(200).json({
      ok: true,
      smartObject: toSmartObjectResponse(row, req),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/smart-objects/:idOrPublicCode/landing
 * Full payload for QR landing page (store, product, promo, theme). No auth.
 */
router.get('/:idOrPublicCode/landing', optionalAuth, async (req, res, next) => {
  try {
    const { idOrPublicCode } = req.params;
    if (!idOrPublicCode) {
      return res.status(400).json({
        ok: false,
        error: { code: 'MISSING_ID', message: 'id or publicCode required' },
      });
    }

    const smart = await prisma.smartObject.findFirst({
      where: {
        OR: [{ id: idOrPublicCode }, { publicCode: idOrPublicCode }],
      },
    });
    if (!smart) {
      return res.status(404).json({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'QR code not found' },
      });
    }

    const store = await prisma.business.findUnique({
      where: { id: smart.storeId },
    });
    if (!store) {
      return res.status(404).json({
        ok: false,
        error: { code: 'STORE_NOT_FOUND', message: 'Store not found' },
      });
    }

    let product = null;
    if (smart.productId) {
      product = await prisma.product.findUnique({
        where: { id: smart.productId },
      });
    }

    let promo = null;
    if (smart.activePromoId) {
      const content = await prisma.content.findUnique({
        where: { id: smart.activePromoId },
      });
      if (content) {
        const settings = (content.settings && typeof content.settings === 'object') ? content.settings : {};
        const promoData = (settings.scene1 && settings.scene1.promo) || settings.promo || {};
        promo = {
          id: content.id,
          instanceId: content.id,
          draftId: content.id,
          status: 'active',
          targetType: 'item',
          targetId: smart.productId || '',
          config: {},
          content: {
            id: content.id,
            name: content.name,
            meta: {},
            promo: promoData,
            settings: settings,
            elements: content.elements || [],
            renderSlide: content.renderSlide || null,
            thumbnailUrl: content.thumbnailUrl || null,
          },
        };
      }
    }

    const logoJson = store.logo && typeof store.logo === 'string' ? (() => { try { return JSON.parse(store.logo); } catch { return null; } })() : store.logo;
    const theme = {
      primaryColor: store.primaryColor || '#6366f1',
      secondaryColor: store.secondaryColor || '#f59e0b',
      logo: (logoJson && logoJson.url) || null,
    };

    return res.status(200).json({
      ok: true,
      publicCode: smart.publicCode,
      store: {
        id: store.id,
        name: store.name,
        slug: store.slug,
        logo: store.logo,
        tagline: store.tagline || null,
      },
      product: product
        ? {
            id: product.id,
            name: product.name,
            description: product.description || null,
            price: product.price,
            currency: product.currency,
            category: product.category,
            imageUrl: product.imageUrl,
            images: product.images,
          }
        : null,
      promo,
      theme,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/smart-objects/:id/active-promo
 * Set active promo for this SmartObject. Auth required.
 * Body: { promoId?, draftId? } - draftId is Content.id; promoId can be same or PromoInstance id
 */
router.post('/:id/active-promo', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { promoId, draftId } = req.body || {};

    const smart = await prisma.smartObject.findUnique({
      where: { id },
    });
    if (!smart) {
      return res.status(404).json({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'Smart object not found' },
      });
    }

    const store = await prisma.business.findUnique({
      where: { id: smart.storeId },
      select: { userId: true },
    });
    if (!store || store.userId !== req.userId) {
      return res.status(403).json({
        ok: false,
        error: { code: 'ACCESS_DENIED', message: 'Not your store' },
      });
    }

    const activePromoId = (promoId && typeof promoId === 'string')
      ? promoId
      : (draftId && typeof draftId === 'string')
        ? draftId
        : null;

    await prisma.smartObject.update({
      where: { id },
      data: {
        activePromoId: activePromoId || null,
        updatedAt: new Date(),
      },
    });

    return res.status(200).json({
      ok: true,
      activePromo: {
        id: activePromoId || '',
        smartObjectId: id,
        promoId: activePromoId || '',
        updatedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
