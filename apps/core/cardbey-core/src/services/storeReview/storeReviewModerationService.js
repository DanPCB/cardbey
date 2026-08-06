/**
 * Admin moderation actions for store reviews (+ audit rows).
 */

import { Features } from '../../config/features.js';
import {
  MODERATION_ACTION,
  MODERATION_STATUS,
  PUBLICATION_STATUS,
} from './storeReviewTypes.js';
import { recalculateAggregate } from './storeReviewAggregateService.js';
import { recordStoreEngagementEvent } from '../storeEngagement/storeEngagementEventService.js';

const ADMIN_ACTIONS = new Set([
  MODERATION_ACTION.APPROVE,
  MODERATION_ACTION.REJECT,
  MODERATION_ACTION.HIDE,
  MODERATION_ACTION.RESTORE,
  MODERATION_ACTION.REMOVE,
  MODERATION_ACTION.FLAG,
]);

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {{
 *   reviewId: string,
 *   actorUserId: string,
 *   action: string,
 *   reason?: string|null,
 *   isAdmin?: boolean,
 * }} input
 */
export async function moderateReview(prisma, input) {
  if (!Features.storeReviews?.v1 || !Features.storeReviews?.moderationV1) {
    return { ok: false, error: 'moderation_disabled', status: 404 };
  }

  const reviewId = String(input.reviewId ?? '').trim();
  const actorUserId = String(input.actorUserId ?? '').trim();
  const action = String(input.action ?? '').trim().toLowerCase();

  if (!reviewId || !actorUserId) {
    return { ok: false, error: 'invalid_input', status: 400 };
  }
  if (!ADMIN_ACTIONS.has(action)) {
    return { ok: false, error: 'invalid_action', status: 400 };
  }
  if (!input.isAdmin) {
    return { ok: false, error: 'admin_required', status: 403 };
  }

  const review = await prisma.storeReview.findUnique({ where: { id: reviewId } });
  if (!review) return { ok: false, error: 'review_not_found', status: 404 };

  const previousStatus = `${review.publicationStatus}:${review.moderationStatus}`;
  /** @type {Record<string, unknown>} */
  const data = {};
  let becamePublished = false;

  switch (action) {
    case MODERATION_ACTION.APPROVE:
      data.moderationStatus = MODERATION_STATUS.APPROVED;
      data.publicationStatus = PUBLICATION_STATUS.PUBLISHED;
      data.publishedAt = review.publishedAt ?? new Date();
      data.removedAt = null;
      becamePublished = review.publicationStatus !== PUBLICATION_STATUS.PUBLISHED;
      break;
    case MODERATION_ACTION.REJECT:
      data.moderationStatus = MODERATION_STATUS.REJECTED;
      data.publicationStatus = PUBLICATION_STATUS.HIDDEN;
      break;
    case MODERATION_ACTION.HIDE:
      data.publicationStatus = PUBLICATION_STATUS.HIDDEN;
      break;
    case MODERATION_ACTION.RESTORE:
      data.publicationStatus = PUBLICATION_STATUS.PUBLISHED;
      data.moderationStatus = MODERATION_STATUS.APPROVED;
      data.publishedAt = review.publishedAt ?? new Date();
      data.removedAt = null;
      becamePublished = true;
      break;
    case MODERATION_ACTION.REMOVE:
      data.publicationStatus = PUBLICATION_STATUS.REMOVED;
      data.removedAt = new Date();
      break;
    case MODERATION_ACTION.FLAG:
      data.moderationStatus = MODERATION_STATUS.FLAGGED;
      break;
    default:
      return { ok: false, error: 'invalid_action', status: 400 };
  }

  const updated = await prisma.storeReview.update({
    where: { id: reviewId },
    data,
  });

  await prisma.storeReviewModeration.create({
    data: {
      reviewId,
      actorUserId,
      action,
      reason: input.reason != null ? String(input.reason).trim().slice(0, 500) : null,
      previousStatus,
      newStatus: `${updated.publicationStatus}:${updated.moderationStatus}`,
    },
  });

  await recalculateAggregate(prisma, updated.storeId);

  if (becamePublished && updated.publicationStatus === PUBLICATION_STATUS.PUBLISHED) {
    try {
      await recordStoreEngagementEvent(prisma, {
        storeId: updated.storeId,
        eventType: 'STORE_REVIEWED',
        actorUserId: updated.authorUserId,
        source: 'store_review_moderation',
        metadata: { reviewId: updated.id, rating: updated.rating, action },
        entityType: 'store_review',
        entityId: updated.id,
      });
    } catch (err) {
      console.warn('[storeReviewModeration] STORE_REVIEWED emit failed:', err?.message ?? err);
    }
  }

  return { ok: true, review: updated };
}
