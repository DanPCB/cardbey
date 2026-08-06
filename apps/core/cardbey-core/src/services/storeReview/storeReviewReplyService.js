/**
 * Owner reply — one reply per review when ENABLE_STORE_REVIEW_OWNER_REPLY_V1.
 */

import { Features } from '../../config/features.js';
import { PUBLICATION_STATUS } from './storeReviewTypes.js';
import { getStoreReviewPolicy } from './storeReviewPolicy.js';
import { containsBlockedProfanity } from './storeReviewService.js';

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {{
 *   storeId: string,
 *   reviewId: string,
 *   authorUserId: string,
 *   body: string,
 * }} input
 */
export async function createOrUpdateOwnerReply(prisma, input) {
  if (!Features.storeReviews?.v1 || !Features.storeReviews?.ownerReplyV1) {
    return { ok: false, error: 'owner_reply_disabled', status: 404 };
  }

  const storeId = String(input.storeId ?? '').trim();
  const reviewId = String(input.reviewId ?? '').trim();
  const authorUserId = String(input.authorUserId ?? '').trim();
  const body = String(input.body ?? '').trim().slice(0, 2000);

  if (!authorUserId) return { ok: false, error: 'auth_required', status: 401 };
  if (!body || body.length < 1) return { ok: false, error: 'body_required', status: 400 };

  const policy = getStoreReviewPolicy();
  if (containsBlockedProfanity(body, policy.profanityBlocklist)) {
    return { ok: false, error: 'content_blocked', status: 400 };
  }

  const store = await prisma.business.findUnique({
    where: { id: storeId },
    select: { id: true, userId: true },
  });
  if (!store) return { ok: false, error: 'store_not_found', status: 404 };
  if (store.userId !== authorUserId) {
    return { ok: false, error: 'owner_required', status: 403 };
  }

  const review = await prisma.storeReview.findFirst({
    where: { id: reviewId, storeId },
    include: { reply: true },
  });
  if (!review) return { ok: false, error: 'review_not_found', status: 404 };
  if (review.publicationStatus === PUBLICATION_STATUS.REMOVED) {
    return { ok: false, error: 'review_removed', status: 400 };
  }

  let reply;
  if (review.reply) {
    reply = await prisma.storeReviewReply.update({
      where: { id: review.reply.id },
      data: { body, publicationStatus: PUBLICATION_STATUS.PUBLISHED },
    });
  } else {
    reply = await prisma.storeReviewReply.create({
      data: {
        reviewId,
        storeId,
        authorUserId,
        body,
        publicationStatus: PUBLICATION_STATUS.PUBLISHED,
      },
    });
  }

  return { ok: true, reply };
}
