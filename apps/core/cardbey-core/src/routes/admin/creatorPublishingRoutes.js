/**
 * Admin API — Creator Publishing Center.
 * All write actions dispatch Runtime Authority tools.
 */
import { Router } from 'express';
import { requireAuth, requireAdmin } from '../../middleware/auth.js';
import { dispatchTool } from '../../lib/toolDispatcher.js';
import { markRuntimeOwnedContext } from '../../lib/runtime/performerRuntime/runtimeOwnership.js';
import {
  getCreatorPublishingDetail,
  getCreatorPublishingStats,
  listCreatorPublishingQueue,
} from '../../lib/creator/publishing/creatorPublishingService.js';
import { listContentClassifications } from '../../lib/creator/publishing/creatorClassificationService.js';
import { listPublishingEvents } from '../../lib/creator/publishing/creatorPublishingEventService.js';
import { toCreatorContentErrorPayload } from '../../lib/creator/creatorContentErrors.js';

const router = Router();
router.use(requireAuth);
router.use(requireAdmin);

function buildAdminRuntimeContext(req) {
  return markRuntimeOwnedContext(
    {
      userId: req.userId ?? req.user?.id ?? null,
      role: req.user?.role ?? 'platform_admin',
      source: 'creator_publishing_center',
      route: req.originalUrl,
      runtimeExecutionId: req.headers['x-cardbey-trace-id'] ?? `publishing-${Date.now()}`,
    },
    req.headers['x-cardbey-trace-id'] ?? 'creator-publishing-admin',
  );
}

async function dispatchPublishingTool(req, res, toolName, input) {
  const context = buildAdminRuntimeContext(req);
  const result = await dispatchTool(toolName, input, context);
  const statusCode = result.status === 'ok' ? 200 : result.status === 'blocked' ? 403 : 422;
  return res.status(statusCode).json({
    ok: result.status === 'ok',
    status: result.status,
    toolName,
    output: result.output ?? null,
    blocker: result.blocker ?? null,
    error: result.error ?? null,
  });
}

router.get('/creator-publishing/queue', async (req, res, next) => {
  try {
    const queue = String(req.query.queue || 'human_review_required');
    const limit = Number(req.query.limit) || 30;
    const q = req.query.q ? String(req.query.q) : undefined;
    const type = req.query.type ? String(req.query.type) : undefined;
    const sort = req.query.sort ? String(req.query.sort) : 'oldest';
    const items = await listCreatorPublishingQueue({ queue, limit, q, type, sort });
    return res.json({ ok: true, items, queue });
  } catch (err) {
    return next(err);
  }
});

router.get('/creator-publishing/stats', async (_req, res, next) => {
  try {
    const stats = await getCreatorPublishingStats();
    return res.json({ ok: true, stats });
  } catch (err) {
    return next(err);
  }
});

router.get('/creator-publishing/content/:contentId', async (req, res, next) => {
  try {
    const contentId = String(req.params.contentId || '').trim();
    const detail = await getCreatorPublishingDetail(contentId);
    if (!detail) return res.status(404).json({ ok: false, error: 'content_not_found' });
    return res.json({ ok: true, ...detail });
  } catch (err) {
    return next(err);
  }
});

router.get('/creator-publishing/content/:contentId/history', async (req, res, next) => {
  try {
    const contentId = String(req.params.contentId || '').trim();
    const events = await listPublishingEvents(contentId);
    return res.json({ ok: true, events });
  } catch (err) {
    return next(err);
  }
});

router.get('/creator-publishing/content/:contentId/classifications', async (req, res, next) => {
  try {
    const contentId = String(req.params.contentId || '').trim();
    const classifications = await listContentClassifications(contentId);
    return res.json({ ok: true, classifications });
  } catch (err) {
    return next(err);
  }
});

router.post('/creator-publishing/content/:contentId/classify', async (req, res) => {
  const contentId = String(req.params.contentId || '').trim();
  return dispatchPublishingTool(req, res, 'classify_creator_content', { contentId, ...req.body });
});

router.post('/creator-publishing/content/:contentId/approve', async (req, res) => {
  const contentId = String(req.params.contentId || '').trim();
  return dispatchPublishingTool(req, res, 'approve_creator_content', {
    contentId,
    publishNow: req.body?.publishNow !== false,
    ...req.body,
  });
});

router.post('/creator-publishing/content/:contentId/request-changes', async (req, res) => {
  const contentId = String(req.params.contentId || '').trim();
  return dispatchPublishingTool(req, res, 'request_creator_content_changes', { contentId, ...req.body });
});

router.post('/creator-publishing/content/:contentId/reject', async (req, res) => {
  const contentId = String(req.params.contentId || '').trim();
  return dispatchPublishingTool(req, res, 'reject_creator_content', { contentId, ...req.body });
});

router.post('/creator-publishing/content/:contentId/escalate', async (req, res) => {
  const contentId = String(req.params.contentId || '').trim();
  return dispatchPublishingTool(req, res, 'escalate_creator_content', { contentId, ...req.body });
});

router.post('/creator-publishing/content/:contentId/schedule', async (req, res) => {
  const contentId = String(req.params.contentId || '').trim();
  return dispatchPublishingTool(req, res, 'schedule_creator_content', { contentId, ...req.body });
});

router.post('/creator-publishing/content/:contentId/publish', async (req, res) => {
  const contentId = String(req.params.contentId || '').trim();
  return dispatchPublishingTool(req, res, 'publish_creator_content', { contentId, action: 'publish', ...req.body });
});

export default router;
