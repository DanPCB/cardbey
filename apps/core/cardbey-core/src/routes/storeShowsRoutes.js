/**
 * Owner store Shows management — canonical featuredWorks mutations.
 * GET/PATCH under /api/stores/:storeId/shows
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getPrismaClient } from '../lib/prisma.js';
import { isPlatformAdmin } from '../lib/authorization.js';
import {
  listStoreShows,
  upsertStoreShow,
  setStoreShowStatus,
  reorderStoreShows,
  buildRelevanceWarning,
  getStoreShow,
} from '../services/storeShows/storeShowsService.js';
import { bumpPublicFeedRankForStore } from '../lib/feed/publicFeedRankBump.js';

const router = Router();

async function assertStoreAccess(prisma, storeId, userId, user) {
  const store = await prisma.business.findUnique({
    where: { id: storeId },
    select: { id: true, userId: true, name: true, type: true, description: true, isActive: true },
  });
  if (!store) {
    const err = new Error('Store not found');
    err.statusCode = 404;
    err.code = 'store_not_found';
    throw err;
  }
  if (store.userId !== userId && !isPlatformAdmin(user)) {
    const err = new Error('Forbidden');
    err.statusCode = 403;
    err.code = 'forbidden';
    throw err;
  }
  return store;
}

async function invalidatePublic(prisma, store) {
  if (store.isActive) {
    try {
      await bumpPublicFeedRankForStore(prisma, store.id, { reason: 'store_shows_mutation' });
    } catch {
      /* non-fatal */
    }
  }
}

router.get('/:storeId/shows', requireAuth, async (req, res, next) => {
  try {
    const storeId = String(req.params.storeId || '').trim();
    const prisma = getPrismaClient();
    const store = await assertStoreAccess(prisma, storeId, req.userId, req.user);
    const includeArchived = String(req.query.includeArchived || '') === '1';
    const statusFilter = typeof req.query.status === 'string' ? req.query.status : null;
    const result = await listStoreShows(prisma, { storeId, includeArchived, statusFilter });
    const works = result.works.map((w) => ({
      ...w,
      relevanceWarning: buildRelevanceWarning(w, store),
    }));
    return res.json({ ok: true, storeId, storeName: store.name, works });
  } catch (err) {
    if (err.statusCode && err.statusCode < 500) {
      return res.status(err.statusCode).json({ ok: false, error: err.code, message: err.message });
    }
    return next(err);
  }
});

router.post('/:storeId/shows', requireAuth, async (req, res, next) => {
  try {
    const storeId = String(req.params.storeId || '').trim();
    const prisma = getPrismaClient();
    const store = await assertStoreAccess(prisma, storeId, req.userId, req.user);
    const patch = req.body || {};
    const provenance = isPlatformAdmin(req.user) && store.userId !== req.userId ? 'admin' : 'owner';
    const result = await upsertStoreShow(prisma, {
      storeId,
      workId: null,
      patch: { ...patch, status: patch.status || 'DRAFT' },
      actorId: req.userId,
      provenance,
      reason: typeof req.body?.reason === 'string' ? req.body.reason : 'show_create',
    });
    await invalidatePublic(prisma, store);
    return res.status(201).json({ ok: true, ...result });
  } catch (err) {
    if (err.statusCode && err.statusCode < 500) {
      return res.status(err.statusCode).json({ ok: false, error: err.code, message: err.message });
    }
    return next(err);
  }
});

router.patch('/:storeId/shows/:workId', requireAuth, async (req, res, next) => {
  try {
    const storeId = String(req.params.storeId || '').trim();
    const workId = String(req.params.workId || '').trim();
    const prisma = getPrismaClient();
    const store = await assertStoreAccess(prisma, storeId, req.userId, req.user);
    await getStoreShow(prisma, { storeId, workId });
    const provenance = isPlatformAdmin(req.user) && store.userId !== req.userId ? 'admin' : 'owner';
    const result = await upsertStoreShow(prisma, {
      storeId,
      workId,
      patch: req.body || {},
      actorId: req.userId,
      provenance,
      reason: typeof req.body?.reason === 'string' ? req.body.reason : 'show_update',
    });
    await invalidatePublic(prisma, store);
    return res.json({ ok: true, ...result });
  } catch (err) {
    if (err.statusCode && err.statusCode < 500) {
      return res.status(err.statusCode).json({ ok: false, error: err.code, message: err.message });
    }
    return next(err);
  }
});

router.post('/:storeId/shows/:workId/hide', requireAuth, async (req, res, next) => {
  try {
    const storeId = String(req.params.storeId || '').trim();
    const workId = String(req.params.workId || '').trim();
    const prisma = getPrismaClient();
    const store = await assertStoreAccess(prisma, storeId, req.userId, req.user);
    const result = await setStoreShowStatus(prisma, {
      storeId,
      workId,
      status: 'HIDDEN',
      actorId: req.userId,
      reason: typeof req.body?.reason === 'string' ? req.body.reason : 'show_hide',
    });
    await invalidatePublic(prisma, store);
    return res.json({ ok: true, ...result });
  } catch (err) {
    if (err.statusCode && err.statusCode < 500) {
      return res.status(err.statusCode).json({ ok: false, error: err.code, message: err.message });
    }
    return next(err);
  }
});

router.post('/:storeId/shows/:workId/archive', requireAuth, async (req, res, next) => {
  try {
    const storeId = String(req.params.storeId || '').trim();
    const workId = String(req.params.workId || '').trim();
    const prisma = getPrismaClient();
    const store = await assertStoreAccess(prisma, storeId, req.userId, req.user);
    const result = await setStoreShowStatus(prisma, {
      storeId,
      workId,
      status: 'ARCHIVED',
      actorId: req.userId,
      reason: typeof req.body?.reason === 'string' ? req.body.reason : 'show_archive',
    });
    await invalidatePublic(prisma, store);
    return res.json({ ok: true, ...result });
  } catch (err) {
    if (err.statusCode && err.statusCode < 500) {
      return res.status(err.statusCode).json({ ok: false, error: err.code, message: err.message });
    }
    return next(err);
  }
});

router.post('/:storeId/shows/:workId/restore', requireAuth, async (req, res, next) => {
  try {
    const storeId = String(req.params.storeId || '').trim();
    const workId = String(req.params.workId || '').trim();
    const prisma = getPrismaClient();
    const store = await assertStoreAccess(prisma, storeId, req.userId, req.user);
    // Restore to HIDDEN (non-public) unless explicit publish requested
    const toStatus = req.body?.publish === true ? 'PUBLISHED' : 'HIDDEN';
    if (toStatus === 'PUBLISHED' && req.body?.confirmPublish !== true) {
      return res.status(400).json({
        ok: false,
        error: 'confirmation_required',
        message: 'Set confirmPublish: true to restore as published',
      });
    }
    const result = await setStoreShowStatus(prisma, {
      storeId,
      workId,
      status: toStatus,
      actorId: req.userId,
      reason: typeof req.body?.reason === 'string' ? req.body.reason : 'show_restore',
    });
    await invalidatePublic(prisma, store);
    return res.json({ ok: true, ...result });
  } catch (err) {
    if (err.statusCode && err.statusCode < 500) {
      return res.status(err.statusCode).json({ ok: false, error: err.code, message: err.message });
    }
    return next(err);
  }
});

router.post('/:storeId/shows/:workId/publish', requireAuth, async (req, res, next) => {
  try {
    const storeId = String(req.params.storeId || '').trim();
    const workId = String(req.params.workId || '').trim();
    const prisma = getPrismaClient();
    const store = await assertStoreAccess(prisma, storeId, req.userId, req.user);
    if (req.body?.confirmed !== true) {
      return res.status(400).json({
        ok: false,
        error: 'confirmation_required',
        message: 'Set confirmed: true to publish this Show',
      });
    }
    const result = await setStoreShowStatus(prisma, {
      storeId,
      workId,
      status: 'PUBLISHED',
      actorId: req.userId,
      reason: typeof req.body?.reason === 'string' ? req.body.reason : 'show_publish',
    });
    await invalidatePublic(prisma, store);
    return res.json({ ok: true, ...result });
  } catch (err) {
    if (err.statusCode && err.statusCode < 500) {
      return res.status(err.statusCode).json({ ok: false, error: err.code, message: err.message });
    }
    return next(err);
  }
});

router.put('/:storeId/shows/reorder', requireAuth, async (req, res, next) => {
  try {
    const storeId = String(req.params.storeId || '').trim();
    const prisma = getPrismaClient();
    const store = await assertStoreAccess(prisma, storeId, req.userId, req.user);
    const orderedIds = Array.isArray(req.body?.orderedIds) ? req.body.orderedIds.map(String) : [];
    const result = await reorderStoreShows(prisma, {
      storeId,
      orderedIds,
      actorId: req.userId,
    });
    await invalidatePublic(prisma, store);
    return res.json({ ok: true, ...result });
  } catch (err) {
    if (err.statusCode && err.statusCode < 500) {
      return res.status(err.statusCode).json({ ok: false, error: err.code, message: err.message });
    }
    return next(err);
  }
});

export default router;
