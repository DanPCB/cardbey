/**
 * Public content interaction metrics — no auth required for love/view/share.
 * Comments: GET public; POST requires auth.
 * GET/POST /api/public/content-interactions/:contentType/:contentId[/comments|...]
 */

import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import {
  addContentClap,
  getContentInteractionSummary,
  recordContentShare,
  recordContentView,
  toggleContentLove,
} from '../services/contentInteractionService.js';
import {
  createActivityComment,
  listActivityComments,
} from '../services/activityCommentService.js';

const router = Router();

function viewerKeyFromReq(req) {
  const header = req.get('x-cardbey-viewer-key');
  if (header && String(header).trim()) return String(header).trim().slice(0, 128);
  const bodyKey = req.body?.viewerKey;
  if (bodyKey && String(bodyKey).trim()) return String(bodyKey).trim().slice(0, 128);
  return 'anonymous';
}

function metaFromReq(req) {
  const q = req.query ?? {};
  const b = req.body ?? {};
  return {
    storeId: b.storeId ?? q.storeId ?? null,
    artifactId: b.artifactId ?? q.artifactId ?? null,
  };
}

router.get('/:contentType/:contentId', async (req, res, next) => {
  try {
    const summary = await getContentInteractionSummary(prisma, {
      contentType: req.params.contentType,
      contentId: req.params.contentId,
      viewerKey: viewerKeyFromReq(req),
      ...metaFromReq(req),
    });
    if (!summary) {
      return res.status(400).json({ ok: false, error: 'invalid_content' });
    }
    return res.json({ ok: true, summary });
  } catch (err) {
    next(err);
  }
});

router.get('/:contentType/:contentId/comments', async (req, res, next) => {
  try {
    const result = await listActivityComments(prisma, {
      contentType: req.params.contentType,
      contentId: req.params.contentId,
      limit: req.query?.limit,
      cursor: req.query?.cursor,
      ...metaFromReq(req),
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
    next(err);
  }
});

router.post('/:contentType/:contentId/comments', requireAuth, async (req, res, next) => {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const result = await createActivityComment(prisma, {
      contentType: req.params.contentType,
      contentId: req.params.contentId,
      text: body.text ?? body.body ?? '',
      actorUserId: req.userId,
      actorType: 'user',
      ...metaFromReq(req),
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
    next(err);
  }
});

router.post('/:contentType/:contentId/view', async (req, res, next) => {
  try {
    const summary = await recordContentView(prisma, {
      contentType: req.params.contentType,
      contentId: req.params.contentId,
      viewerKey: viewerKeyFromReq(req),
      ...metaFromReq(req),
    });
    if (!summary) return res.status(400).json({ ok: false, error: 'invalid_content' });
    return res.json({ ok: true, summary });
  } catch (err) {
    next(err);
  }
});

router.post('/:contentType/:contentId/love', async (req, res, next) => {
  try {
    const summary = await toggleContentLove(prisma, {
      contentType: req.params.contentType,
      contentId: req.params.contentId,
      viewerKey: viewerKeyFromReq(req),
      ...metaFromReq(req),
    });
    if (!summary) return res.status(400).json({ ok: false, error: 'invalid_content' });
    return res.json({ ok: true, summary });
  } catch (err) {
    next(err);
  }
});

router.post('/:contentType/:contentId/clap', async (req, res, next) => {
  try {
    const summary = await addContentClap(prisma, {
      contentType: req.params.contentType,
      contentId: req.params.contentId,
      viewerKey: viewerKeyFromReq(req),
      ...metaFromReq(req),
    });
    if (!summary) return res.status(400).json({ ok: false, error: 'invalid_content' });
    return res.json({ ok: true, summary });
  } catch (err) {
    next(err);
  }
});

router.post('/:contentType/:contentId/share', async (req, res, next) => {
  try {
    const summary = await recordContentShare(prisma, {
      contentType: req.params.contentType,
      contentId: req.params.contentId,
      viewerKey: viewerKeyFromReq(req),
      ...metaFromReq(req),
    });
    if (!summary) return res.status(400).json({ ok: false, error: 'invalid_content' });
    return res.json({ ok: true, summary });
  } catch (err) {
    next(err);
  }
});

export default router;
