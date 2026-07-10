/**
 * Creator Foundation Phase 1 — REST API routes.
 * Reads: direct service calls. Writes: Runtime Authority dispatch only.
 */

import { Router } from 'express';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import { dispatchTool } from '../lib/toolDispatcher.js';
import { markRuntimeOwnedContext } from '../lib/runtime/performerRuntime/runtimeOwnership.js';
import {
  getCreatorByUserId,
  getCreatorByUsername,
  listPublicCreators,
  listCreatorContent,
  listLatestOriginalContent,
  getCreatorAnalytics,
  listCreatorFeedArtifacts,
} from '../lib/creator/creatorService.js';
import {
  calculateCreatorProgress,
  QUALIFICATION_MINUTES,
} from '../lib/creator/creatorProgressService.js';
import { getPrismaClient } from '../lib/prisma.js';

const router = Router();

function buildRuntimeContext(req, body = {}) {
  return markRuntimeOwnedContext(
    {
      userId: req.user?.id ?? req.userId ?? null,
      creatorId: body.creatorId ?? null,
      missionId: body.missionId ?? req.headers['x-mission-id'] ?? null,
      runtimeExecutionId:
        body.runtimeExecutionId ??
        req.headers['x-runtime-execution-id'] ??
        req.headers['x-cardbey-trace-id'] ??
        null,
      source: 'creator_api',
      route: req.originalUrl,
      role: req.user?.role ?? null,
    },
    body.runtimeExecutionId ?? req.headers['x-cardbey-trace-id'] ?? 'creator-api',
  );
}

async function dispatchCreatorTool(req, res, toolName, input) {
  const context = buildRuntimeContext(req, input);
  const result = await dispatchTool(toolName, input, context);
  const statusCode =
    result.status === 'ok' ? 200 : result.status === 'blocked' ? 403 : 422;
  return res.status(statusCode).json({
    ok: result.status === 'ok',
    status: result.status,
    toolName,
    output: result.output ?? null,
    blocker: result.blocker ?? null,
    error: result.error ?? null,
  });
}

/**
 * GET /api/creators/feed — published creator content for public marketplace feed
 */
router.get('/creators/feed', optionalAuth, async (req, res, next) => {
  try {
    const limit = Number(req.query.limit) || 24;
    const items = await listCreatorFeedArtifacts(limit);
    res.json({ ok: true, items });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/creators — public listing (deterministic ordering)
 */
router.get('/creators', optionalAuth, async (req, res, next) => {
  try {
    const section = String(req.query.section || 'featured');
    const limit = Number(req.query.limit) || 12;
    const creators = await listPublicCreators({ section, limit });
    const latestContent = await listLatestOriginalContent(12);
    res.json({ ok: true, creators, latestContent, section });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/creator/me — authenticated creator profile
 */
router.get('/creator/me', requireAuth, async (req, res, next) => {
  try {
    const creator = await getCreatorByUserId(req.userId);
    res.json({ ok: true, creator });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/creator/progress — qualification progress
 */
router.get('/creator/progress', requireAuth, async (req, res, next) => {
  try {
    const prisma = getPrismaClient();
    const creator = await prisma.creator.findUnique({ where: { userId: req.userId } });
    if (!creator) {
      return res.json({
        ok: true,
        progress: {
          totalPublishedMinutes: 0,
          qualificationProgress: 0,
          isQualified: false,
          targetMinutes: QUALIFICATION_MINUTES,
        },
      });
    }
    const progress = await calculateCreatorProgress(creator.id);
    res.json({
      ok: true,
      progress: { ...progress, targetMinutes: QUALIFICATION_MINUTES },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/creator/analytics — foundation analytics (store only)
 */
router.get('/creator/analytics', requireAuth, async (req, res, next) => {
  try {
    const analytics = await getCreatorAnalytics(req.userId);
    res.json({ ok: true, analytics });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/creator/:username — public profile
 */
router.get('/creator/:username', optionalAuth, async (req, res, next) => {
  try {
    const username = String(req.params.username || '').toLowerCase();
    if (['me', 'progress', 'analytics', 'content'].includes(username)) {
      return res.status(404).json({ ok: false, error: 'not_found' });
    }
    const creator = await getCreatorByUsername(username);
    if (!creator) {
      return res.status(404).json({ ok: false, error: 'creator_not_found' });
    }
    const content = await listCreatorContent(creator.creatorId, { status: 'published' });
    res.json({ ok: true, creator, content });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/creator/content — list own content (auth)
 */
router.get('/creator/content/list', requireAuth, async (req, res, next) => {
  try {
    const prisma = getPrismaClient();
    const creator = await prisma.creator.findUnique({ where: { userId: req.userId } });
    if (!creator) {
      return res.json({ ok: true, content: [] });
    }
    const status = req.query.status ? String(req.query.status) : undefined;
    const content = await listCreatorContent(creator.id, { status, limit: 100 });
    res.json({ ok: true, content });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/creator/profile — create creator profile (runtime)
 */
router.post('/creator/profile', requireAuth, async (req, res, next) => {
  try {
    const input = { ...req.body, userId: req.userId };
    return dispatchCreatorTool(req, res, 'create_creator_profile', input);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/creator/content — create/publish content (runtime)
 */
router.post('/creator/content', requireAuth, async (req, res, next) => {
  try {
    const input = { ...req.body, userId: req.userId };
    const action = req.body?.action || 'publish';
    if (action === 'draft') {
      return dispatchCreatorTool(req, res, 'publish_creator_content', {
        ...input,
        publish: false,
        action: 'draft',
      });
    }
    if (action === 'submit_review') {
      return dispatchCreatorTool(req, res, 'submit_creator_content_for_review', input);
    }
    return dispatchCreatorTool(req, res, 'publish_creator_content', { ...input, action: 'publish' });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/creator/content/:contentId/submit-review — owner review gate (runtime)
 */
router.post('/creator/content/:contentId/submit-review', requireAuth, async (req, res, next) => {
  try {
    const input = { ...req.body, contentId: req.params.contentId, userId: req.userId };
    return dispatchCreatorTool(req, res, 'submit_creator_content_for_review', input);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/creator/content/:contentId/publish — publish after owner review (runtime)
 */
router.post('/creator/content/:contentId/publish', requireAuth, async (req, res, next) => {
  try {
    const input = { ...req.body, contentId: req.params.contentId, userId: req.userId, action: 'publish' };
    return dispatchCreatorTool(req, res, 'publish_creator_content', input);
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/creator/content/:contentId — update content (runtime)
 */
router.patch('/creator/content/:contentId', requireAuth, async (req, res, next) => {
  try {
    const input = { ...req.body, contentId: req.params.contentId, userId: req.userId };
    return dispatchCreatorTool(req, res, 'update_creator_content', input);
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/creator/content/:contentId — delete content (runtime)
 */
router.delete('/creator/content/:contentId', requireAuth, async (req, res, next) => {
  try {
    const input = { contentId: req.params.contentId, userId: req.userId };
    return dispatchCreatorTool(req, res, 'delete_creator_content', input);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/creator/progress/recalculate — sync progress (runtime)
 */
router.post('/creator/progress/recalculate', requireAuth, async (req, res, next) => {
  try {
    const input = { ...req.body, userId: req.userId };
    return dispatchCreatorTool(req, res, 'calculate_creator_progress', input);
  } catch (err) {
    next(err);
  }
});

export default router;
