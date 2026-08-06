/**
 * Public store reviews API — SOCIAL category (no Runtime Authority for public reads).
 * Mount: /api/public/store-reviews
 */

import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { optionalAuth, requireAuth, requireAdmin } from '../middleware/auth.js';
import { Features } from '../config/features.js';
import {
  getSummary,
  listPublished,
  getEligibility,
  getMyReview,
  submitReview,
  updateMyReview,
  withdrawMyReview,
  reportReview,
} from '../services/storeReview/storeReviewService.js';
import { moderateReview } from '../services/storeReview/storeReviewModerationService.js';
import { createOrUpdateOwnerReply } from '../services/storeReview/storeReviewReplyService.js';

const router = Router();

function failClosed(res, code = 'feature_disabled') {
  return res.status(404).json({ ok: false, error: code });
}

function userIdFromReq(req) {
  return req.user?.id ?? req.userId ?? null;
}

/** Admin moderation — registered before /:storeId to avoid param capture. */
router.post('/admin/reviews/:reviewId/moderate', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    if (!Features.storeReviews?.v1 || !Features.storeReviews?.moderationV1) {
      return failClosed(res, 'moderation_disabled');
    }
    const result = await moderateReview(prisma, {
      reviewId: req.params.reviewId?.trim(),
      actorUserId: userIdFromReq(req),
      action: req.body?.action,
      reason: req.body?.reason,
      isAdmin: true,
    });
    if (!result.ok) return res.status(result.status ?? 400).json(result);
    return res.json(result);
  } catch (err) {
    next(err);
  }
});

/** GET /:storeId/summary */
router.get('/:storeId/summary', optionalAuth, async (req, res, next) => {
  try {
    if (!Features.storeReviews?.v1) return failClosed(res);
    const storeId = req.params.storeId?.trim();
    const store = await prisma.business.findUnique({
      where: { id: storeId },
      select: { id: true },
    });
    if (!store) return res.status(404).json({ ok: false, error: 'store_not_found' });
    const summary = await getSummary(prisma, storeId);
    return res.json({ ok: true, storeId, ...summary });
  } catch (err) {
    next(err);
  }
});

/** GET /:storeId/eligibility */
router.get('/:storeId/eligibility', requireAuth, async (req, res, next) => {
  try {
    if (!Features.storeReviews?.v1) return failClosed(res);
    const storeId = req.params.storeId?.trim();
    const result = await getEligibility(prisma, {
      userId: userIdFromReq(req),
      storeId,
      sourceType: req.query.sourceType,
      sourceReferenceId: req.query.sourceReferenceId,
    });
    return res.status(result.ok === false && result.error === 'store_not_found' ? 404 : 200).json({
      ok: true,
      ...result,
    });
  } catch (err) {
    next(err);
  }
});

/** GET /:storeId/mine */
router.get('/:storeId/mine', requireAuth, async (req, res, next) => {
  try {
    if (!Features.storeReviews?.v1) return failClosed(res);
    const storeId = req.params.storeId?.trim();
    const review = await getMyReview(prisma, {
      userId: userIdFromReq(req),
      storeId,
    });
    return res.json({ ok: true, review });
  } catch (err) {
    next(err);
  }
});

/** PATCH /:storeId/mine */
router.patch('/:storeId/mine', requireAuth, async (req, res, next) => {
  try {
    if (!Features.storeReviews?.v1 || !Features.storeReviews?.submissionV1) {
      return failClosed(res, 'submission_disabled');
    }
    const result = await updateMyReview(prisma, {
      userId: userIdFromReq(req),
      storeId: req.params.storeId?.trim(),
      rating: req.body?.rating,
      title: req.body?.title,
      body: req.body?.body,
      languageCode: req.body?.languageCode,
    });
    if (!result.ok) return res.status(result.status ?? 400).json(result);
    return res.json(result);
  } catch (err) {
    next(err);
  }
});

/** DELETE /:storeId/mine */
router.delete('/:storeId/mine', requireAuth, async (req, res, next) => {
  try {
    if (!Features.storeReviews?.v1 || !Features.storeReviews?.submissionV1) {
      return failClosed(res, 'submission_disabled');
    }
    const result = await withdrawMyReview(prisma, {
      userId: userIdFromReq(req),
      storeId: req.params.storeId?.trim(),
    });
    if (!result.ok) return res.status(result.status ?? 400).json(result);
    return res.json(result);
  } catch (err) {
    next(err);
  }
});

/** POST /:storeId/reviews/:reviewId/report */
router.post('/:storeId/reviews/:reviewId/report', requireAuth, async (req, res, next) => {
  try {
    if (!Features.storeReviews?.v1) return failClosed(res);
    const result = await reportReview(prisma, {
      userId: userIdFromReq(req),
      storeId: req.params.storeId?.trim(),
      reviewId: req.params.reviewId?.trim(),
      reason: req.body?.reason,
    });
    if (!result.ok) return res.status(result.status ?? 400).json(result);
    return res.json(result);
  } catch (err) {
    next(err);
  }
});

/** POST /:storeId/reviews/:reviewId/reply — owner reply (flag gated) */
router.post('/:storeId/reviews/:reviewId/reply', requireAuth, async (req, res, next) => {
  try {
    if (!Features.storeReviews?.v1 || !Features.storeReviews?.ownerReplyV1) {
      return failClosed(res, 'owner_reply_disabled');
    }
    const result = await createOrUpdateOwnerReply(prisma, {
      storeId: req.params.storeId?.trim(),
      reviewId: req.params.reviewId?.trim(),
      authorUserId: userIdFromReq(req),
      body: req.body?.body,
    });
    if (!result.ok) return res.status(result.status ?? 400).json(result);
    return res.json(result);
  } catch (err) {
    next(err);
  }
});

/** GET /:storeId — published reviews */
router.get('/:storeId', optionalAuth, async (req, res, next) => {
  try {
    if (!Features.storeReviews?.v1) return failClosed(res);
    const storeId = req.params.storeId?.trim();
    const store = await prisma.business.findUnique({
      where: { id: storeId },
      select: { id: true },
    });
    if (!store) return res.status(404).json({ ok: false, error: 'store_not_found' });
    const result = await listPublished(prisma, {
      storeId,
      sort: typeof req.query.sort === 'string' ? req.query.sort : undefined,
      limit: req.query.limit,
    });
    return res.json({ ok: true, storeId, ...result });
  } catch (err) {
    next(err);
  }
});

/** POST /:storeId — submit review */
router.post('/:storeId', requireAuth, async (req, res, next) => {
  try {
    if (!Features.storeReviews?.v1 || !Features.storeReviews?.submissionV1) {
      return failClosed(res, 'submission_disabled');
    }
    const result = await submitReview(prisma, {
      userId: userIdFromReq(req),
      storeId: req.params.storeId?.trim(),
      rating: req.body?.rating,
      title: req.body?.title,
      body: req.body?.body,
      sourceType: req.body?.sourceType,
      sourceReferenceId: req.body?.sourceReferenceId,
      languageCode: req.body?.languageCode,
      authorDisplayName: req.body?.authorDisplayName,
    });
    if (!result.ok) return res.status(result.status ?? 400).json(result);
    return res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
