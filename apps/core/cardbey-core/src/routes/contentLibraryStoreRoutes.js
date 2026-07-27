/**
 * Store-scoped content library routes.
 * GET/POST/DELETE /api/stores/:storeId/assets
 * GET/POST/PATCH/DELETE /api/stores/:storeId/collections
 */

import { Router } from 'express';
import multer from 'multer';
import { requireAuth } from '../middleware/auth.js';
import { assetService } from '../lib/content/assetService.js';
import { VIDEO_UPLOAD_MAX_BYTES } from '../constants/videoUploadLimits.js';

const router = Router({ mergeParams: true });
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: VIDEO_UPLOAD_MAX_BYTES },
});

function handleError(err, res, next) {
  if (err?.status === 403) {
    return res.status(403).json({ ok: false, error: 'forbidden', message: err.message });
  }
  if (err?.status === 404) {
    return res.status(404).json({ ok: false, error: 'not_found', message: err.message });
  }
  return next(err);
}

/** GET /api/stores/:storeId/assets */
router.get('/:storeId/assets', requireAuth, async (req, res, next) => {
  try {
    const storeId = String(req.params.storeId || '').trim();
    const userId = req.userId;
    if (!storeId || !userId) {
      return res.status(400).json({ ok: false, error: 'invalid_request' });
    }
    await assetService.assertStoreOwner(storeId, userId);

    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const type = typeof req.query.type === 'string' ? req.query.type.trim() : undefined;
    const source = typeof req.query.source === 'string' ? req.query.source.trim() : undefined;
    const limit = req.query.limit != null ? Number(req.query.limit) : 100;
    const offset = req.query.offset != null ? Number(req.query.offset) : 0;

    const assets = q
      ? await assetService.searchAssets(storeId, q, { type, source, limit, offset })
      : await assetService.listAssets(storeId, { type, source, limit, offset });

    const summary = await assetService.getLibrarySummary(storeId);
    return res.json({
      ok: true,
      assets,
      totalAssets: summary.totalAssets,
      usedStorage: summary.usedStorage,
      maxStorage: summary.maxStorage,
    });
  } catch (err) {
    return handleError(err, res, next);
  }
});

/** GET /api/stores/:storeId/content-library */
router.get('/:storeId/content-library', requireAuth, async (req, res, next) => {
  try {
    const storeId = String(req.params.storeId || '').trim();
    const userId = req.userId;
    if (!storeId || !userId) {
      return res.status(400).json({ ok: false, error: 'invalid_request' });
    }
    await assetService.assertStoreOwner(storeId, userId);
    const library = await assetService.getLibrarySummary(storeId);
    return res.json({ ok: true, ...library });
  } catch (err) {
    return handleError(err, res, next);
  }
});

/** POST /api/stores/:storeId/assets/upload */
router.post('/:storeId/assets/upload', requireAuth, upload.single('file'), async (req, res, next) => {
  try {
    const storeId = String(req.params.storeId || '').trim();
    const userId = req.userId;
    if (!storeId || !userId) {
      return res.status(400).json({ ok: false, error: 'invalid_request' });
    }
    if (!req.file) {
      return res.status(400).json({ ok: false, error: 'file_required', message: 'file is required' });
    }

    let metadata = {};
    if (typeof req.body.metadata === 'string' && req.body.metadata.trim()) {
      try {
        metadata = JSON.parse(req.body.metadata);
      } catch {
        metadata = {};
      }
    } else if (req.body.metadata && typeof req.body.metadata === 'object') {
      metadata = req.body.metadata;
    }
    if (req.body.name) metadata.name = req.body.name;
    if (req.body.description) metadata.description = req.body.description;
    if (req.body.tags) {
      try {
        metadata.tags = typeof req.body.tags === 'string' ? JSON.parse(req.body.tags) : req.body.tags;
      } catch {
        metadata.tags = [];
      }
    }

    const asset = await assetService.uploadAsset(req.file, metadata, storeId, userId);
    return res.status(201).json({ ok: true, asset });
  } catch (err) {
    return handleError(err, res, next);
  }
});

/** DELETE /api/stores/:storeId/assets/:assetId */
router.delete('/:storeId/assets/:assetId', requireAuth, async (req, res, next) => {
  try {
    const storeId = String(req.params.storeId || '').trim();
    const assetId = String(req.params.assetId || '').trim();
    const userId = req.userId;
    if (!storeId || !assetId || !userId) {
      return res.status(400).json({ ok: false, error: 'invalid_request' });
    }
    const result = await assetService.deleteAsset(storeId, assetId, userId);
    return res.json({ ok: true, ...result });
  } catch (err) {
    return handleError(err, res, next);
  }
});

/** GET /api/stores/:storeId/collections */
router.get('/:storeId/collections', requireAuth, async (req, res, next) => {
  try {
    const storeId = String(req.params.storeId || '').trim();
    const userId = req.userId;
    if (!storeId || !userId) {
      return res.status(400).json({ ok: false, error: 'invalid_request' });
    }
    await assetService.assertStoreOwner(storeId, userId);
    const collections = await assetService.listCollections(storeId);
    return res.json({ ok: true, collections, total: collections.length });
  } catch (err) {
    return handleError(err, res, next);
  }
});

/** POST /api/stores/:storeId/collections */
router.post('/:storeId/collections', requireAuth, async (req, res, next) => {
  try {
    const storeId = String(req.params.storeId || '').trim();
    const userId = req.userId;
    if (!storeId || !userId) {
      return res.status(400).json({ ok: false, error: 'invalid_request' });
    }
    const collection = await assetService.createCollection(storeId, req.body || {}, userId);
    return res.status(201).json({ ok: true, collection });
  } catch (err) {
    return handleError(err, res, next);
  }
});

/** PATCH /api/stores/:storeId/collections/:collectionId */
router.patch('/:storeId/collections/:collectionId', requireAuth, async (req, res, next) => {
  try {
    const storeId = String(req.params.storeId || '').trim();
    const collectionId = String(req.params.collectionId || '').trim();
    const userId = req.userId;
    if (!storeId || !collectionId || !userId) {
      return res.status(400).json({ ok: false, error: 'invalid_request' });
    }
    const collection = await assetService.updateCollection(storeId, collectionId, req.body || {}, userId);
    return res.json({ ok: true, collection });
  } catch (err) {
    return handleError(err, res, next);
  }
});

/** DELETE /api/stores/:storeId/collections/:collectionId */
router.delete('/:storeId/collections/:collectionId', requireAuth, async (req, res, next) => {
  try {
    const storeId = String(req.params.storeId || '').trim();
    const collectionId = String(req.params.collectionId || '').trim();
    const userId = req.userId;
    if (!storeId || !collectionId || !userId) {
      return res.status(400).json({ ok: false, error: 'invalid_request' });
    }
    const result = await assetService.deleteCollection(storeId, collectionId, userId);
    return res.json({ ok: true, ...result });
  } catch (err) {
    return handleError(err, res, next);
  }
});

export default router;
