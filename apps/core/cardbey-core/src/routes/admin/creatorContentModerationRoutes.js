/**
 * Admin API — creator content moderation queue.
 *
 * GET  /api/admin/moderation/creator-content/pending
 * GET  /api/admin/moderation/creator-content/pending/count
 * POST /api/admin/moderation/creator-content/:contentId/approve
 * POST /api/admin/moderation/creator-content/:contentId/reject
 */
import { Router } from 'express';
import { requireAuth, requireAdmin } from '../../middleware/auth.js';
import {
  approveCreatorContentModeration,
  countCreatorContentPendingModeration,
  listCreatorContentPendingModeration,
  rejectCreatorContentModeration,
} from '../../lib/creator/creatorContentModerationService.js';
import { toCreatorContentErrorPayload } from '../../lib/creator/creatorContentErrors.js';

const router = Router();
router.use(requireAuth);
router.use(requireAdmin);

router.get('/moderation/creator-content/pending', async (req, res, next) => {
  try {
    const limit = Number(req.query.limit) || 50;
    const items = await listCreatorContentPendingModeration({ limit });
    return res.json({ ok: true, items });
  } catch (err) {
    return next(err);
  }
});

router.get('/moderation/creator-content/pending/count', async (_req, res, next) => {
  try {
    const count = await countCreatorContentPendingModeration();
    return res.json({ ok: true, count });
  } catch (err) {
    return next(err);
  }
});

router.get('/moderation/pending/count', async (_req, res, next) => {
  try {
    const count = await countCreatorContentPendingModeration();
    return res.json({ ok: true, count });
  } catch (err) {
    return next(err);
  }
});

router.post('/moderation/creator-content/:contentId/approve', async (req, res, next) => {
  try {
    const contentId = String(req.params.contentId || '').trim();
    if (!contentId) {
      return res.status(400).json({ ok: false, error: 'contentId_required' });
    }
    const result = await approveCreatorContentModeration(contentId, {
      adminUserId: req.userId ?? null,
    });
    return res.json({
      ok: true,
      content: result.content,
      progress: result.progress,
      alreadyPublished: result.alreadyPublished ?? false,
    });
  } catch (err) {
    const payload = toCreatorContentErrorPayload(err);
    return res.status(422).json({ ok: false, error: payload });
  }
});

router.post('/moderation/creator-content/:contentId/reject', async (req, res, next) => {
  try {
    const contentId = String(req.params.contentId || '').trim();
    if (!contentId) {
      return res.status(400).json({ ok: false, error: 'contentId_required' });
    }
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
    const content = await rejectCreatorContentModeration(contentId, reason, {
      adminUserId: req.userId ?? null,
    });
    return res.json({ ok: true, content });
  } catch (err) {
    const payload = toCreatorContentErrorPayload(err);
    return res.status(422).json({ ok: false, error: payload });
  }
});

export default router;
