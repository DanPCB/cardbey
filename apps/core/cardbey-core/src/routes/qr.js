/**
 * Dynamic QR v0 - Editable /q/:code that redirects to promo/storefront.
 * POST /api/qr/create - Create (auth required)
 * GET /api/qr/:code/resolve - Resolve + record scan, return redirectUrl (no auth)
 * PATCH /api/qr/:code - Update (auth required)
 */

import express from 'express';
import { PrismaClient } from '@prisma/client';
import { nanoid } from 'nanoid';
import { requireAuth, optionalAuth } from '../middleware/auth.js';

const router = express.Router();
const prisma = new PrismaClient();

const CODE_LENGTH = 8;

function getBaseUrl(req) {
  const envBase = process.env.PUBLIC_BASE_URL || process.env.API_BASE;
  if (envBase) return envBase.replace(/\/$/, '');
  const proto = req.get('x-forwarded-proto') || req.protocol || 'https';
  const host = req.get('x-forwarded-host') || req.get('host') || 'localhost:3000';
  return `${proto}://${host}`;
}

/** Append UTM params for QR scan redirect (single source for analytics). */
function appendUtmParams(url, codeOrSlug) {
  if (!url || typeof url !== 'string') return url;
  const campaign = (codeOrSlug && String(codeOrSlug).slice(0, 20)) || 'qr';
  const sep = url.includes('?') ? '&' : '?';
  const utm = `utm_source=qr&utm_medium=print&utm_campaign=${encodeURIComponent(campaign)}`;
  return `${url}${sep}${utm}`;
}

/**
 * GET /api/qr?storeId=
 * List Dynamic QR records for store. Auth required; store owner only.
 */
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const storeId = req.query.storeId;
    if (!storeId || typeof storeId !== 'string') {
      return res.status(400).json({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'storeId query is required' } });
    }
    const store = await prisma.business.findUnique({
      where: { id: storeId.trim() },
      select: { id: true, userId: true },
    });
    if (!store) {
      return res.status(404).json({ ok: false, error: { code: 'STORE_NOT_FOUND', message: 'Store not found' } });
    }
    if (store.userId !== req.userId) {
      return res.status(403).json({ ok: false, error: { code: 'ACCESS_DENIED', message: 'Not your store' } });
    }
    const list = await prisma.dynamicQr.findMany({
      where: { storeId: store.id },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { scanEvents: true } } },
    });
    const items = list.map((row) => ({
      id: row.id,
      code: row.code,
      type: row.type,
      targetPath: row.targetPath,
      isActive: row.isActive,
      createdAt: row.createdAt,
      scanCount: row._count.scanEvents,
    }));
    return res.status(200).json({ ok: true, items });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/qr/create
 * Body: { storeId, type: 'storefront'|'loyalty'|'discount'|'promotion', payload?, targetPath? }
 * Returns: { code, url }
 */
router.post('/create', requireAuth, async (req, res, next) => {
  try {
    const { storeId, type, payload, targetPath } = req.body || {};
    if (!storeId || typeof storeId !== 'string') {
      return res.status(400).json({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'storeId is required' } });
    }
    const validTypes = ['storefront', 'loyalty', 'discount', 'promotion', 'offer'];
    const resolvedType = validTypes.includes(type) ? type : 'storefront';

    const store = await prisma.business.findUnique({
      where: { id: storeId },
      select: { id: true, userId: true, slug: true },
    });
    if (!store) {
      return res.status(404).json({ ok: false, error: { code: 'STORE_NOT_FOUND', message: 'Store not found' } });
    }
    if (store.userId !== req.userId) {
      return res.status(403).json({ ok: false, error: { code: 'ACCESS_DENIED', message: 'Not your store' } });
    }

    let code;
    for (let attempt = 0; attempt < 10; attempt++) {
      code = nanoid(CODE_LENGTH).toLowerCase();
      const exists = await prisma.dynamicQr.findUnique({ where: { code } });
      if (!exists) break;
    }
    if (!code) {
      return res.status(500).json({ ok: false, error: { code: 'CODE_GENERATION_FAILED', message: 'Could not generate unique code' } });
    }

    await prisma.dynamicQr.create({
      data: {
        code,
        storeId,
        type: resolvedType,
        payload: payload && typeof payload === 'object' ? payload : undefined,
        targetPath: typeof targetPath === 'string' ? targetPath.trim() || null : null,
        isActive: true,
        createdByUserId: req.userId,
      },
    });

    const baseUrl = getBaseUrl(req);
    const qrUrl = baseUrl.startsWith('http') ? `${baseUrl}/q/${code}` : `/q/${code}`;
    return res.status(200).json({ ok: true, code, url: qrUrl });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/qr/:code/resolve
 * No auth. Returns { redirectUrl } and records ScanEvent. Fallback to storefront if inactive/missing.
 */
router.get('/:code/resolve', async (req, res, next) => {
  try {
    const code = (req.params.code || '').trim().toLowerCase();
    if (!code) {
      return res.status(400).json({ ok: false, error: { code: 'MISSING_CODE', message: 'code is required' } });
    }

    const row = await prisma.dynamicQr.findUnique({
      where: { code },
      include: { scanEvents: false },
    });

    const baseUrl = getBaseUrl(req);

    if (!row || !row.isActive) {
      const storeId = row?.storeId;
      let fallback = `${baseUrl}/preview/store/${storeId}?view=public`;
      if (!storeId) {
        fallback = baseUrl.startsWith('http') ? baseUrl : `${baseUrl}/`;
      }
      return res.status(200).json({ ok: true, redirectUrl: fallback });
    }

    await prisma.scanEvent.create({
      data: {
        dynamicQrId: row.id,
        storeId: row.storeId,
        userAgent: req.get('user-agent') || null,
        referer: req.get('referer') || null,
      },
    });

    let redirectUrl = row.targetPath || '';
    if (redirectUrl && !redirectUrl.startsWith('http')) {
      redirectUrl = `${baseUrl.replace(/\/$/, '')}${redirectUrl.startsWith('/') ? '' : '/'}${redirectUrl}`;
    }
    if (!redirectUrl && row.type === 'promotion' && row.payload?.publicId) {
      redirectUrl = `${baseUrl.replace(/\/$/, '')}/p/promo/${row.payload.publicId}`;
    }
    if (!redirectUrl) {
      redirectUrl = `${baseUrl}/preview/store/${row.storeId}?view=public`;
    }
    redirectUrl = appendUtmParams(redirectUrl, row.code);
    return res.status(200).json({ ok: true, redirectUrl });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/qr/:code
 * Body: { type?, payload?, targetPath?, isActive? }
 */
router.patch('/:code', requireAuth, async (req, res, next) => {
  try {
    const code = (req.params.code || '').trim().toLowerCase();
    if (!code) {
      return res.status(400).json({ ok: false, error: { code: 'MISSING_CODE', message: 'code is required' } });
    }
    const row = await prisma.dynamicQr.findUnique({ where: { code } });
    if (!row) {
      return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: 'Dynamic QR not found' } });
    }
    const store = await prisma.business.findUnique({
      where: { id: row.storeId },
      select: { userId: true },
    });
    if (!store || store.userId !== req.userId) {
      return res.status(403).json({ ok: false, error: { code: 'ACCESS_DENIED', message: 'Not your store' } });
    }

    const { type, payload, targetPath, isActive } = req.body || {};
    const validTypes = ['storefront', 'loyalty', 'discount', 'promotion', 'offer'];
    const data = {};
    if (validTypes.includes(type)) data.type = type;
    if (payload !== undefined) data.payload = typeof payload === 'object' ? payload : null;
    if (targetPath !== undefined) data.targetPath = typeof targetPath === 'string' ? targetPath.trim() || null : null;
    if (typeof isActive === 'boolean') data.isActive = isActive;

    await prisma.dynamicQr.update({
      where: { code },
      data: { ...data, updatedAt: new Date() },
    });
    const baseUrl = getBaseUrl(req);
    const url = baseUrl.startsWith('http') ? `${baseUrl}/q/${code}` : `/q/${code}`;
    return res.status(200).json({ ok: true, code, url });
  } catch (err) {
    next(err);
  }
});

export default router;
