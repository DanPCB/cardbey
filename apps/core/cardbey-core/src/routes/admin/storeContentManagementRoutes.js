/**
 * Platform admin — store catalog / services / shows content management.
 *
 * GET    /api/admin/platform/store-content/search?q=
 * GET    /api/admin/platform/store-content/:storeId
 * POST   /api/admin/platform/store-content/:storeId/products/:productId/unpublish  { confirmed, reason }
 * DELETE /api/admin/platform/store-content/:storeId/products/:productId             { confirmed, reason }
 */

import { Router } from 'express';
import { requireAuth, requireAdmin } from '../../middleware/auth.js';
import { getPrismaClient } from '../../lib/prisma.js';
import {
  adminSoftDeleteProduct,
  adminUnpublishProduct,
  getStoreContentInventory,
  searchStoresForAdmin,
} from '../../lib/admin/storeContentManagementService.js';

const router = Router();
router.use(requireAuth);
router.use(requireAdmin);

function requireConfirmed(req, res) {
  if (req.body?.confirmed !== true) {
    res.status(400).json({
      ok: false,
      error: 'confirmation_required',
      message: 'Set confirmed: true in request body to proceed.',
    });
    return false;
  }
  return true;
}

router.get('/platform/store-content/search', async (req, res, next) => {
  try {
    const prisma = getPrismaClient();
    const payload = await searchStoresForAdmin(prisma, {
      q: req.query.q,
      limit: req.query.limit,
    });
    return res.json({ ok: true, ...payload });
  } catch (err) {
    return next(err);
  }
});

router.get('/platform/store-content/:storeId', async (req, res, next) => {
  try {
    const storeId = String(req.params.storeId ?? '').trim();
    if (!storeId) {
      return res.status(400).json({ ok: false, error: 'storeId_required' });
    }
    const prisma = getPrismaClient();
    const payload = await getStoreContentInventory(prisma, storeId);
    return res.json({ ok: true, ...payload });
  } catch (err) {
    if (err?.statusCode === 404) {
      return res.status(404).json({ ok: false, error: err.code, message: err.message });
    }
    return next(err);
  }
});

router.post('/platform/store-content/:storeId/products/:productId/unpublish', async (req, res, next) => {
  try {
    if (!requireConfirmed(req, res)) return;
    const storeId = String(req.params.storeId ?? '').trim();
    const productId = String(req.params.productId ?? '').trim();
    if (!storeId || !productId) {
      return res.status(400).json({ ok: false, error: 'storeId_and_productId_required' });
    }
    const prisma = getPrismaClient();
    const result = await adminUnpublishProduct(prisma, {
      storeId,
      productId,
      actorUserId: req.userId ?? null,
      reason: req.body?.reason,
    });
    return res.json({ ok: true, ...result });
  } catch (err) {
    if (err?.statusCode && err.statusCode < 500) {
      return res.status(err.statusCode).json({ ok: false, error: err.code, message: err.message });
    }
    return next(err);
  }
});

router.delete('/platform/store-content/:storeId/products/:productId', async (req, res, next) => {
  try {
    if (!requireConfirmed(req, res)) return;
    const storeId = String(req.params.storeId ?? '').trim();
    const productId = String(req.params.productId ?? '').trim();
    if (!storeId || !productId) {
      return res.status(400).json({ ok: false, error: 'storeId_and_productId_required' });
    }
    const prisma = getPrismaClient();
    const result = await adminSoftDeleteProduct(prisma, {
      storeId,
      productId,
      actorUserId: req.userId ?? null,
      reason: req.body?.reason,
    });
    return res.json({ ok: true, ...result });
  } catch (err) {
    if (err?.statusCode && err.statusCode < 500) {
      return res.status(err.statusCode).json({ ok: false, error: err.code, message: err.message });
    }
    return next(err);
  }
});

export default router;
