/**
 * Activity comments — platform-wide.
 *
 * Alias (mission contract):
 *   GET/POST /api/activities/:activityId/comments
 *
 * Content-interactions namespace (preferred identity):
 *   GET/POST /api/public/content-interactions/:contentType/:contentId/comments
 */

import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import {
  assertCommentTargetExists,
  createActivityComment,
  listActivityComments,
  publicLifecycleContentKey,
} from '../services/activityCommentService.js';

const router = Router();

function storeMeta(req) {
  const q = req.query ?? {};
  const b = req.body ?? {};
  return {
    storeId: b.storeId ?? q.storeId ?? null,
    artifactId: b.artifactId ?? q.artifactId ?? null,
  };
}

async function handleList(req, res, next, contentType, contentId) {
  try {
    const result = await listActivityComments(prisma, {
      contentType,
      contentId,
      limit: req.query?.limit,
      cursor: req.query?.cursor,
      ...storeMeta(req),
    });
    if (!result.ok) {
      return res.status(result.status || 400).json({ ok: false, error: result.error });
    }
    return res.json({
      ok: true,
      comments: result.comments,
      total: result.total,
      nextCursor: result.nextCursor,
    });
  } catch (err) {
    return next(err);
  }
}

async function handleCreate(req, res, next, contentType, contentId) {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const result = await createActivityComment(prisma, {
      contentType,
      contentId,
      text: body.text ?? body.body ?? '',
      actorUserId: req.userId,
      actorType: 'user',
      ...storeMeta(req),
    });
    if (!result.ok) {
      return res.status(result.status || 400).json({
        ok: false,
        error: result.error,
        message: result.error,
      });
    }
    return res.status(result.status || 201).json({
      ok: true,
      comment: result.comment,
      total: result.total,
    });
  } catch (err) {
    return next(err);
  }
}

/** GET /api/activities/:activityId/comments */
router.get('/:activityId/comments', async (req, res, next) => {
  const key = publicLifecycleContentKey(req.params.activityId);
  if (!key) {
    return res.status(400).json({ ok: false, error: 'invalid_activity' });
  }
  const exists = await assertCommentTargetExists(prisma, key.contentType, key.contentId);
  if (!exists.ok) {
    return res.status(exists.status || 404).json({ ok: false, error: exists.error });
  }
  return handleList(req, res, next, key.contentType, key.contentId);
});

/** POST /api/activities/:activityId/comments */
router.post('/:activityId/comments', requireAuth, async (req, res, next) => {
  const key = publicLifecycleContentKey(req.params.activityId);
  if (!key) {
    return res.status(400).json({ ok: false, error: 'invalid_activity' });
  }
  return handleCreate(req, res, next, key.contentType, key.contentId);
});

export default router;

export { handleList as listCommentsHttp, handleCreate as createCommentsHttp };
