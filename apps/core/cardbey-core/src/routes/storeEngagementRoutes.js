/**
 * Public store engagement API — canonical write path for follow/like/save/share/view/click.
 * SOCIAL category: direct execution, no Runtime Authority (anonymous public interactions).
 */

import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { optionalAuth } from '../middleware/auth.js';
import { viewerKeyFromReq, sessionIdFromReq } from '../services/storeEngagement/storeEngagementActor.js';
import {
  getStoreEngagementSummary,
  recordOfferClaim,
  recordStoreClick,
  recordStoreShare,
  recordStoreView,
  toggleStoreFollow,
  toggleStoreLike,
  toggleStoreSave,
} from '../services/storeEngagement/storeEngagementActionService.js';
import {
  queryStoreActivityEvents,
  summarizeStoreEngagementForPerformer,
} from '../services/storeEngagement/storeEngagementEventService.js';
import { handleSse } from '../realtime/simpleSse.js';
import { assertStoreActivityAccess } from '../lib/storeActivity/storeActivityAccess.js';

const router = Router();

function actorContext(req) {
  return {
    userId: req.user?.id ?? req.userId ?? null,
    viewerKey: viewerKeyFromReq(req),
    sessionId: sessionIdFromReq(req),
    source: req.body?.source ?? req.query?.source ?? 'feed',
  };
}

/** SSE routes first — before /:storeId param routes. */

/** GET /api/public/store-engagement/stream/public-feed */
router.get('/stream/public-feed', (req, res) => {
  req.query.key = 'public-feed';
  handleSse(req, res);
});

/** GET /api/public/store-engagement/stream/store/:storeId */
router.get('/stream/store/:storeId', (req, res) => {
  req.query.key = `store:${req.params.storeId?.trim()}`;
  handleSse(req, res);
});

/** GET /api/public/store-engagement/stream/owner/:storeId — owner-only SSE */
router.get('/stream/owner/:storeId', optionalAuth, async (req, res, next) => {
  try {
    const storeId = req.params.storeId?.trim();
    const access = await assertStoreActivityAccess(req, storeId);
    if (!access.ok) return res.status(access.status).json({ ok: false, error: access.error });
    req.query.key = `owner-store:${access.store.id}`;
    handleSse(req, res);
  } catch (err) {
    next(err);
  }
});

/** GET /api/public/store-engagement/:storeId */
router.get('/:storeId', optionalAuth, async (req, res, next) => {
  try {
    const storeId = req.params.storeId?.trim();
    const ctx = actorContext(req);
    const summary = await getStoreEngagementSummary(prisma, { storeId, ...ctx });
    if (!summary) return res.status(404).json({ ok: false, error: 'store_not_found' });
    return res.json({ ok: true, ...summary });
  } catch (err) {
    next(err);
  }
});

/** POST /api/public/store-engagement/:storeId/view */
router.post('/:storeId/view', optionalAuth, async (req, res, next) => {
  try {
    const storeId = req.params.storeId?.trim();
    const ctx = actorContext(req);
    const result = await recordStoreView(prisma, { storeId, ...ctx, metadata: req.body?.metadata });
    if (!result.ok) return res.status(404).json(result);
    const summary = await getStoreEngagementSummary(prisma, { storeId, ...ctx });
    return res.json({ ok: true, ...summary, deduped: result.deduped ?? false });
  } catch (err) {
    next(err);
  }
});

/** POST /api/public/store-engagement/:storeId/follow */
router.post('/:storeId/follow', optionalAuth, async (req, res, next) => {
  try {
    const storeId = req.params.storeId?.trim();
    const result = await toggleStoreFollow(prisma, { storeId, ...actorContext(req) });
    if (!result.ok) return res.status(404).json(result);
    return res.json(result);
  } catch (err) {
    next(err);
  }
});

/** POST /api/public/store-engagement/:storeId/like */
router.post('/:storeId/like', optionalAuth, async (req, res, next) => {
  try {
    const storeId = req.params.storeId?.trim();
    const result = await toggleStoreLike(prisma, { storeId, ...actorContext(req) });
    if (!result.ok) return res.status(404).json(result);
    return res.json(result);
  } catch (err) {
    next(err);
  }
});

/** POST /api/public/store-engagement/:storeId/save */
router.post('/:storeId/save', optionalAuth, async (req, res, next) => {
  try {
    const storeId = req.params.storeId?.trim();
    const result = await toggleStoreSave(prisma, { storeId, ...actorContext(req) });
    if (!result.ok) return res.status(404).json(result);
    return res.json(result);
  } catch (err) {
    next(err);
  }
});

/** POST /api/public/store-engagement/:storeId/share */
router.post('/:storeId/share', optionalAuth, async (req, res, next) => {
  try {
    const storeId = req.params.storeId?.trim();
    const result = await recordStoreShare(prisma, {
      storeId,
      ...actorContext(req),
      metadata: req.body?.metadata,
    });
    if (!result.ok) return res.status(404).json(result);
    return res.json(result);
  } catch (err) {
    next(err);
  }
});

/** POST /api/public/store-engagement/:storeId/click/:clickType */
router.post('/:storeId/click/:clickType', optionalAuth, async (req, res, next) => {
  try {
    const storeId = req.params.storeId?.trim();
    const result = await recordStoreClick(prisma, {
      storeId,
      clickType: req.params.clickType,
      ...actorContext(req),
      metadata: req.body?.metadata,
    });
    if (!result.ok) return res.status(result.error === 'invalid_click_type' ? 400 : 404, result);
    return res.json(result);
  } catch (err) {
    next(err);
  }
});

/** POST /api/public/store-engagement/:storeId/offer-claim */
router.post('/:storeId/offer-claim', optionalAuth, async (req, res, next) => {
  try {
    const storeId = req.params.storeId?.trim();
    const offerId = String(req.body?.offerId ?? '').trim();
    if (!offerId) return res.status(400).json({ ok: false, error: 'offer_id_required' });
    const result = await recordOfferClaim(prisma, { storeId, offerId, ...actorContext(req) });
    if (!result.ok) return res.status(404).json(result);
    return res.json(result);
  } catch (err) {
    next(err);
  }
});

/** GET /api/public/store-engagement/:storeId/events — owner/admin analytics */
router.get('/:storeId/events', optionalAuth, async (req, res, next) => {
  try {
    const storeId = req.params.storeId?.trim();
    const access = await assertStoreActivityAccess(req, storeId);
    if (!access.ok) return res.status(access.status).json({ ok: false, error: access.error });

    const limit = req.query.limit;
    const since = typeof req.query.since === 'string' ? req.query.since : undefined;
    const events = await queryStoreActivityEvents(prisma, access.store.id, { limit, since });
    return res.json({ ok: true, events });
  } catch (err) {
    next(err);
  }
});

/** GET /api/public/store-engagement/:storeId/performer-summary — BI reasoning */
router.get('/:storeId/performer-summary', optionalAuth, async (req, res, next) => {
  try {
    const storeId = req.params.storeId?.trim();
    const access = await assertStoreActivityAccess(req, storeId);
    if (!access.ok) return res.status(access.status).json({ ok: false, error: access.error });

    const windowDays = Math.min(Math.max(parseInt(req.query.windowDays, 10) || 1, 1), 30);
    const summary = await summarizeStoreEngagementForPerformer(prisma, access.store.id, windowDays);
    return res.json({ ok: true, summary });
  } catch (err) {
    next(err);
  }
});

export default router;
