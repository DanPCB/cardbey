/**
 * Recalculate StoreReviewAggregate from eligible published reviews.
 */

import {
  MODERATION_STATUS,
  PUBLICATION_STATUS,
  SOURCE_TYPE,
  VERIFICATION_STATUS,
  roundDisplayRating,
} from './storeReviewTypes.js';
import { getStoreReviewPolicy } from './storeReviewPolicy.js';

/**
 * Whether a review row counts toward public rating aggregate.
 * Pure — used by tests and recalculateAggregate.
 *
 * @param {object} review
 * @param {{ includeLegacyInRating?: boolean, allowPendingInAggregate?: boolean }} [policy]
 */
export function reviewCountsTowardAggregate(review, policy = {}) {
  if (!review) return false;
  const publication = String(review.publicationStatus ?? '');
  const moderation = String(review.moderationStatus ?? '');
  const verification = String(review.verificationStatus ?? '');
  const sourceType = String(review.sourceType ?? '');

  if (publication !== PUBLICATION_STATUS.PUBLISHED) return false;
  if (publication === PUBLICATION_STATUS.REMOVED || publication === PUBLICATION_STATUS.HIDDEN) {
    return false;
  }
  if (verification === VERIFICATION_STATUS.REJECTED) return false;

  const allowPending = Boolean(policy.allowPendingInAggregate);
  if (moderation === MODERATION_STATUS.APPROVED) {
    // ok
  } else if (allowPending && moderation === MODERATION_STATUS.PENDING) {
    // ok
  } else {
    return false;
  }

  if (sourceType === SOURCE_TYPE.LEGACY_TESTIMONIAL) {
    if (!policy.includeLegacyInRating) return false;
    if (moderation !== MODERATION_STATUS.APPROVED) return false;
  }

  const rating = Number(review.rating);
  return Number.isInteger(rating) && rating >= 1 && rating <= 5;
}

/**
 * Pure aggregate computation from a list of reviews (already filtered or not).
 * @param {object[]} reviews
 * @param {{ includeLegacyInRating?: boolean, allowPendingInAggregate?: boolean }} [policy]
 */
export function computeAggregateFromReviews(reviews, policy = {}) {
  const eligible = (Array.isArray(reviews) ? reviews : []).filter((r) =>
    reviewCountsTowardAggregate(r, policy),
  );

  const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let sum = 0;
  let verified = 0;
  let latest = null;

  for (const r of eligible) {
    const rating = Number(r.rating);
    counts[rating] = (counts[rating] ?? 0) + 1;
    sum += rating;
    if (String(r.verificationStatus) === VERIFICATION_STATUS.VERIFIED) verified += 1;
    const at = r.publishedAt ? new Date(r.publishedAt) : r.createdAt ? new Date(r.createdAt) : null;
    if (at && !Number.isNaN(at.getTime())) {
      if (!latest || at > latest) latest = at;
    }
  }

  const n = eligible.length;
  const internal = n > 0 ? sum / n : 0;

  return {
    publishedReviewCount: n,
    averageRating: roundDisplayRating(internal),
    averageRatingInternal: internal,
    rating1Count: counts[1],
    rating2Count: counts[2],
    rating3Count: counts[3],
    rating4Count: counts[4],
    rating5Count: counts[5],
    verifiedReviewCount: verified,
    latestReviewAt: latest,
  };
}

/**
 * Load eligible reviews and upsert StoreReviewAggregate for a store.
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} storeId
 */
export async function recalculateAggregate(prisma, storeId) {
  const id = String(storeId ?? '').trim();
  if (!id) return null;

  const policy = getStoreReviewPolicy();
  const reviews = await prisma.storeReview.findMany({
    where: {
      storeId: id,
      publicationStatus: PUBLICATION_STATUS.PUBLISHED,
    },
    select: {
      rating: true,
      publicationStatus: true,
      moderationStatus: true,
      verificationStatus: true,
      sourceType: true,
      publishedAt: true,
      createdAt: true,
    },
  });

  const agg = computeAggregateFromReviews(reviews, {
    includeLegacyInRating: policy.includeLegacyInRating,
    allowPendingInAggregate: policy.allowPendingInAggregate,
  });

  const now = new Date();
  return prisma.storeReviewAggregate.upsert({
    where: { storeId: id },
    create: {
      storeId: id,
      ...agg,
      lastCalculatedAt: now,
    },
    update: {
      ...agg,
      lastCalculatedAt: now,
    },
  });
}

/**
 * Empty aggregate DTO when none exists.
 * @param {string} storeId
 */
export function emptyAggregate(storeId) {
  return {
    storeId: String(storeId ?? ''),
    publishedReviewCount: 0,
    averageRating: 0,
    averageRatingInternal: 0,
    rating1Count: 0,
    rating2Count: 0,
    rating3Count: 0,
    rating4Count: 0,
    rating5Count: 0,
    verifiedReviewCount: 0,
    latestReviewAt: null,
    lastCalculatedAt: null,
  };
}
