/**
 * Promotion Slot Pipeline v1: resolve API + optional create for verification.
 * GET /api/promotions/public/:publicId — public runway landing (no auth).
 * GET /api/promotions/slots/:slotKey/resolve?storeId= — public read.
 * POST /api/promotions, POST /api/promotions/slots, POST /api/promotions/placements — optional, for verification (can requireAuth).
 */

import { Router } from 'express';
import { getPrismaClient } from '../lib/prisma.js';
import { resolvePromotionForSlot } from '../lib/promotionResolver.js';
import { resolveLandingPageContentFields } from '../services/promotionLaunchDeployer.js';

const router = Router();

function publicBaseUrl() {
  return String(process.env.PUBLIC_BASE_URL || process.env.FRONTEND_URL || 'http://localhost:5174').replace(
    /\/$/,
    '',
  );
}

function asObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}

/**
 * GET /public/:publicId
 * Runway launch_campaign landing — Promotion.metadataJson.publicId, status active only.
 */
router.get('/public/:publicId', async (req, res, next) => {
  try {
    const publicId = typeof req.params.publicId === 'string' ? req.params.publicId.trim() : '';
    if (!publicId) {
      return res.status(400).json({ ok: false, error: 'validation', message: 'publicId is required' });
    }

    const prisma = getPrismaClient();
    const dbUrl = String(process.env.DATABASE_URL || '').toLowerCase();
    const isPg = dbUrl.startsWith('postgresql://') || dbUrl.startsWith('postgres://');

    let promotionId = null;
    if (isPg) {
      const rows = await prisma.$queryRaw`
        SELECT id FROM "Promotion"
        WHERE status = 'active'
        AND "metadataJson"->>'publicId' = ${publicId}
        LIMIT 1
      `;
      promotionId = Array.isArray(rows) && rows[0]?.id ? rows[0].id : null;
    } else {
      const rows = await prisma.$queryRaw`
        SELECT id FROM Promotion
        WHERE status = 'active'
        AND json_extract(metadataJson, '$.publicId') = ${publicId}
        LIMIT 1
      `;
      promotionId = Array.isArray(rows) && rows[0]?.id ? rows[0].id : null;
    }

    if (!promotionId) {
      return res.status(404).json({ ok: false, error: 'not_found', message: 'Promotion not found' });
    }

    const promotion = await prisma.promotion.findUnique({ where: { id: promotionId } });
    if (!promotion || promotion.status !== 'active') {
      return res.status(404).json({ ok: false, error: 'not_found', message: 'Promotion not found' });
    }

    const meta = asObject(promotion.metadataJson);
    const contentId = typeof meta.contentInstanceId === 'string' && meta.contentInstanceId.trim()
      ? meta.contentInstanceId.trim()
      : null;
    let content = null;
    if (contentId) {
      content = await prisma.content.findUnique({ where: { id: contentId } }).catch(() => null);
    }

    const fields = resolveLandingPageContentFields(promotion, content);
    let business = null;
    if (promotion.storeId) {
      business = await prisma.business.findUnique({ where: { id: promotion.storeId } }).catch(() => null);
    }

    const base = publicBaseUrl();
    const storeUrl = business?.slug ? `${base}/s/${business.slug}` : null;
    const ctaUrl = fields.ctaUrl || storeUrl || null;

    return res.json({
      ok: true,
      storeName: business?.name || 'Store',
      headline: fields.headline,
      bodyText: fields.bodyText,
      ctaText: fields.ctaText,
      ctaUrl,
      productImageUrl: fields.productImageUrl || null,
      mediaUrl: promotion.mediaUrl ?? null,
      mediaType: promotion.mediaType ?? null,
      status: promotion.status,
      storeUrl,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /slots/:slotKey/resolve?storeId=<id>
 * Returns resolved slot content or null. Public (no auth) so surfaces can fetch.
 */
router.get('/slots/:slotKey/resolve', async (req, res, next) => {
  try {
    const slotKey = typeof req.params.slotKey === 'string' ? req.params.slotKey.trim() : '';
    const storeId = typeof req.query.storeId === 'string' ? req.query.storeId.trim() || undefined : undefined;
    if (!slotKey) {
      return res.status(400).json({ ok: false, error: 'slot_key_required', message: 'slotKey is required' });
    }
    const result = await resolvePromotionForSlot({ slotKey, storeId });
    return res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /slots — create a slot (optional, for verification). requireAuth can be added by caller.
 */
router.post('/slots', async (req, res, next) => {
  try {
    const body = req.body ?? {};
    const slotKey = typeof body.slotKey === 'string' ? body.slotKey.trim() : '';
    const surfaceType = typeof body.surfaceType === 'string' ? body.surfaceType.trim() : 'storefront';
    const displayMode = typeof body.displayMode === 'string' ? body.displayMode.trim() : 'banner';
    if (!slotKey) {
      return res.status(400).json({ ok: false, error: 'validation', message: 'slotKey is required' });
    }
    const prisma = getPrismaClient();
    const slot = await prisma.promotionSlot.create({
      data: {
        slotKey,
        surfaceType,
        displayMode,
        isActive: body.isActive !== false,
        configJson: body.configJson ?? undefined,
      },
    });
    return res.status(201).json({ ok: true, slot: { id: slot.id, slotKey: slot.slotKey, surfaceType: slot.surfaceType, displayMode: slot.displayMode } });
  } catch (err) {
    next(err);
  }
});

/**
 * POST / — create a promotion (optional, for verification).
 */
router.post('/', async (req, res, next) => {
  try {
    const body = req.body ?? {};
    const type = typeof body.type === 'string' ? body.type.trim() : 'banner';
    const title = typeof body.title === 'string' ? body.title.trim() : 'Untitled';
    if (!title) {
      return res.status(400).json({ ok: false, error: 'validation', message: 'title is required' });
    }
    const prisma = getPrismaClient();
    const promotion = await prisma.promotion.create({
      data: {
        storeId: body.storeId ?? null,
        type,
        title,
        message: body.message ?? null,
        mediaType: body.mediaType ?? null,
        mediaUrl: body.mediaUrl ?? null,
        ctaLabel: body.ctaLabel ?? null,
        ctaUrl: body.ctaUrl ?? null,
        status: body.status ?? 'active',
        startAt: body.startAt ? new Date(body.startAt) : null,
        endAt: body.endAt ? new Date(body.endAt) : null,
        priority: typeof body.priority === 'number' ? body.priority : 0,
        metadataJson: body.metadataJson ?? undefined,
      },
    });
    return res.status(201).json({ ok: true, promotion: { id: promotion.id, title: promotion.title, status: promotion.status } });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /placements — create a placement (optional, for verification).
 */
router.post('/placements', async (req, res, next) => {
  try {
    const body = req.body ?? {};
    const promotionId = typeof body.promotionId === 'string' ? body.promotionId.trim() : '';
    const slotId = typeof body.slotId === 'string' ? body.slotId.trim() : '';
    if (!promotionId || !slotId) {
      return res.status(400).json({ ok: false, error: 'validation', message: 'promotionId and slotId are required' });
    }
    const prisma = getPrismaClient();
    const placement = await prisma.promotionPlacement.create({
      data: {
        promotionId,
        slotId,
        storeId: body.storeId ?? null,
        enabled: body.enabled !== false,
        startAt: body.startAt ? new Date(body.startAt) : null,
        endAt: body.endAt ? new Date(body.endAt) : null,
        priority: typeof body.priority === 'number' ? body.priority : 0,
        metadataJson: body.metadataJson ?? undefined,
      },
    });
    return res.status(201).json({ ok: true, placement: { id: placement.id, promotionId: placement.promotionId, slotId: placement.slotId } });
  } catch (err) {
    next(err);
  }
});

export default router;
