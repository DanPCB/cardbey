/**
 * Canonical store review service — list, submit, update, withdraw, report.
 */

import { Features } from '../../config/features.js';
import { recordStoreEngagementEvent } from '../storeEngagement/storeEngagementEventService.js';
import {
  MODERATION_ACTION,
  MODERATION_STATUS,
  PUBLICATION_STATUS,
  SORT_OPTIONS,
  SOURCE_TYPE,
  VERIFICATION_STATUS,
  isValidRating,
  isKnownSourceType,
} from './storeReviewTypes.js';
import { buildDisplayPolicy, getStoreReviewPolicy } from './storeReviewPolicy.js';
import {
  emptyAggregate,
  recalculateAggregate,
} from './storeReviewAggregateService.js';
import { checkStoreReviewEligibility } from './storeReviewEligibilityService.js';

/** @type {Map<string, number[]>} */
const rateLimitBuckets = new Map();

function checkRateLimit(userId) {
  const policy = getStoreReviewPolicy();
  const limit = policy.rateLimitPerHour;
  const key = String(userId);
  const now = Date.now();
  const windowMs = 60 * 60 * 1000;
  const stamps = (rateLimitBuckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (stamps.length >= limit) {
    rateLimitBuckets.set(key, stamps);
    return false;
  }
  stamps.push(now);
  rateLimitBuckets.set(key, stamps);
  return true;
}

/**
 * @param {string} text
 * @param {string[]} blocklist
 */
export function containsBlockedProfanity(text, blocklist) {
  const hay = String(text ?? '').toLowerCase();
  if (!hay || !Array.isArray(blocklist) || blocklist.length === 0) return false;
  return blocklist.some((w) => w && hay.includes(w));
}

/**
 * Server-derived verification from source type (client cannot set).
 * @param {string} sourceType
 */
export function deriveVerificationStatus(sourceType) {
  if (sourceType === SOURCE_TYPE.BOOKING || sourceType === SOURCE_TYPE.ORDER) {
    return VERIFICATION_STATUS.VERIFIED;
  }
  if (sourceType === SOURCE_TYPE.LEGACY_TESTIMONIAL) {
    return VERIFICATION_STATUS.UNVERIFIED;
  }
  return VERIFICATION_STATUS.UNVERIFIED;
}

function publishStatusesForAuto() {
  const policy = getStoreReviewPolicy();
  if (policy.autoPublish) {
    return {
      publicationStatus: PUBLICATION_STATUS.PUBLISHED,
      moderationStatus: MODERATION_STATUS.APPROVED,
      publishedAt: new Date(),
    };
  }
  return {
    publicationStatus: PUBLICATION_STATUS.SUBMITTED,
    moderationStatus: MODERATION_STATUS.PENDING,
    publishedAt: null,
  };
}

function publicReviewSelect() {
  return {
    id: true,
    storeId: true,
    businessId: true,
    authorUserId: true,
    authorDisplayNameSnapshot: true,
    rating: true,
    title: true,
    body: true,
    sourceType: true,
    verificationStatus: true,
    publicationStatus: true,
    moderationStatus: true,
    languageCode: true,
    createdAt: true,
    updatedAt: true,
    publishedAt: true,
    reply: {
      select: {
        id: true,
        body: true,
        authorUserId: true,
        publicationStatus: true,
        createdAt: true,
        updatedAt: true,
      },
    },
  };
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} storeId
 */
export async function getAggregate(prisma, storeId) {
  const id = String(storeId ?? '').trim();
  if (!id) return null;
  const row = await prisma.storeReviewAggregate.findUnique({ where: { storeId: id } });
  return row ?? emptyAggregate(id);
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} storeId
 */
export async function getSummary(prisma, storeId) {
  const aggregate = await getAggregate(prisma, storeId);
  return {
    aggregate,
    displayPolicy: buildDisplayPolicy(aggregate),
  };
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {{ storeId: string, sort?: string, limit?: number, cursor?: string }} opts
 */
export async function listPublished(prisma, opts) {
  const storeId = String(opts.storeId ?? '').trim();
  const sort = String(opts.sort ?? SORT_OPTIONS.NEWEST).toLowerCase();
  const limit = Math.min(Math.max(Number(opts.limit) || 20, 1), 50);

  /** @type {any} */
  let orderBy = { publishedAt: 'desc' };
  if (sort === SORT_OPTIONS.HIGHEST) orderBy = [{ rating: 'desc' }, { publishedAt: 'desc' }];
  else if (sort === SORT_OPTIONS.LOWEST) orderBy = [{ rating: 'asc' }, { publishedAt: 'desc' }];
  else if (sort === SORT_OPTIONS.RELEVANT) {
    // Verified first, then newest — not discovery ranking.
    orderBy = [{ verificationStatus: 'desc' }, { publishedAt: 'desc' }];
  }

  const where = {
    storeId,
    publicationStatus: PUBLICATION_STATUS.PUBLISHED,
    moderationStatus: {
      in: [MODERATION_STATUS.APPROVED, MODERATION_STATUS.FLAGGED],
    },
  };

  const reviews = await prisma.storeReview.findMany({
    where,
    orderBy,
    take: limit,
    select: publicReviewSelect(),
  });

  const aggregate = await getAggregate(prisma, storeId);
  return { reviews, aggregate, sort, limit };
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {{ userId: string, storeId: string, sourceType?: string, sourceReferenceId?: string|null }} input
 */
export async function getEligibility(prisma, input) {
  return checkStoreReviewEligibility(prisma, input);
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {{ userId: string, storeId: string }} input
 */
export async function getMyReview(prisma, input) {
  const storeId = String(input.storeId ?? '').trim();
  const userId = String(input.userId ?? '').trim();
  if (!storeId || !userId) return null;
  return prisma.storeReview.findFirst({
    where: {
      storeId,
      authorUserId: userId,
      publicationStatus: { not: PUBLICATION_STATUS.REMOVED },
    },
    orderBy: { createdAt: 'desc' },
    select: publicReviewSelect(),
  });
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {object} input
 */
export async function submitReview(prisma, input) {
  if (!Features.storeReviews?.v1) {
    return { ok: false, error: 'feature_disabled', status: 404 };
  }
  if (!Features.storeReviews?.submissionV1) {
    return { ok: false, error: 'submission_disabled', status: 404 };
  }

  const storeId = String(input.storeId ?? '').trim();
  const userId = String(input.userId ?? '').trim();
  const sourceType = isKnownSourceType(input.sourceType)
    ? String(input.sourceType)
    : SOURCE_TYPE.STORE_VISIT;
  const sourceReferenceId =
    input.sourceReferenceId != null && String(input.sourceReferenceId).trim()
      ? String(input.sourceReferenceId).trim()
      : null;
  const rating = Number(input.rating);
  const title = input.title != null ? String(input.title).trim().slice(0, 120) : null;
  const body = String(input.body ?? '').trim().slice(0, 4000);
  const languageCode = input.languageCode != null ? String(input.languageCode).trim().slice(0, 16) : null;

  if (!userId) return { ok: false, error: 'auth_required', status: 401 };
  if (!isValidRating(rating)) return { ok: false, error: 'invalid_rating', status: 400 };
  if (!body || body.length < 2) return { ok: false, error: 'body_required', status: 400 };

  const policy = getStoreReviewPolicy();
  if (containsBlockedProfanity(`${title ?? ''} ${body}`, policy.profanityBlocklist)) {
    return { ok: false, error: 'content_blocked', status: 400 };
  }

  if (!checkRateLimit(userId)) {
    return { ok: false, error: 'rate_limited', status: 429 };
  }

  const eligibility = await checkStoreReviewEligibility(prisma, {
    userId,
    storeId,
    sourceType,
    sourceReferenceId,
  });
  if (!eligibility.ok || !eligibility.eligible) {
    if (eligibility.canUpdate && eligibility.existingReviewId) {
      return updateMyReview(prisma, {
        userId,
        storeId,
        rating,
        title,
        body,
        languageCode,
      });
    }
    return {
      ok: false,
      error: eligibility.error ?? 'not_eligible',
      reason: eligibility.reason,
      status: eligibility.error === 'store_not_found' ? 404 : 403,
    };
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, displayName: true, fullName: true, email: true },
  });
  const displayName =
    String(input.authorDisplayName ?? user?.displayName ?? user?.fullName ?? '').trim() ||
    (user?.email ? String(user.email).split('@')[0] : 'Customer');

  const statuses = publishStatusesForAuto();
  const verificationStatus = deriveVerificationStatus(sourceType);

  const review = await prisma.storeReview.create({
    data: {
      storeId,
      businessId: storeId,
      authorUserId: userId,
      authorDisplayNameSnapshot: displayName.slice(0, 120),
      rating,
      title: title || null,
      body,
      sourceType,
      sourceReferenceId,
      verificationStatus,
      publicationStatus: statuses.publicationStatus,
      moderationStatus: statuses.moderationStatus,
      languageCode,
      originalLanguage: languageCode,
      originalText: body,
      publishedAt: statuses.publishedAt,
    },
    select: publicReviewSelect(),
  });

  if (review.publicationStatus === PUBLICATION_STATUS.PUBLISHED) {
    await recalculateAggregate(prisma, storeId);
    await emitStoreReviewedSafe(prisma, { storeId, userId, reviewId: review.id, rating });
  }

  return { ok: true, review };
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {object} input
 */
export async function updateMyReview(prisma, input) {
  if (!Features.storeReviews?.v1 || !Features.storeReviews?.submissionV1) {
    return { ok: false, error: 'feature_disabled', status: 404 };
  }

  const storeId = String(input.storeId ?? '').trim();
  const userId = String(input.userId ?? '').trim();
  if (!userId) return { ok: false, error: 'auth_required', status: 401 };

  const existing = await prisma.storeReview.findFirst({
    where: {
      storeId,
      authorUserId: userId,
      publicationStatus: { not: PUBLICATION_STATUS.REMOVED },
    },
    orderBy: { createdAt: 'desc' },
  });
  if (!existing) return { ok: false, error: 'review_not_found', status: 404 };

  const data = {};
  if (input.rating != null) {
    if (!isValidRating(input.rating)) return { ok: false, error: 'invalid_rating', status: 400 };
    data.rating = Number(input.rating);
  }
  if (input.title !== undefined) {
    data.title = input.title != null ? String(input.title).trim().slice(0, 120) : null;
  }
  if (input.body != null) {
    const body = String(input.body).trim().slice(0, 4000);
    if (body.length < 2) return { ok: false, error: 'body_required', status: 400 };
    data.body = body;
    data.originalText = body;
  }
  if (input.languageCode !== undefined) {
    data.languageCode =
      input.languageCode != null ? String(input.languageCode).trim().slice(0, 16) : null;
  }

  const policy = getStoreReviewPolicy();
  const checkText = `${data.title ?? existing.title ?? ''} ${data.body ?? existing.body}`;
  if (containsBlockedProfanity(checkText, policy.profanityBlocklist)) {
    return { ok: false, error: 'content_blocked', status: 400 };
  }

  // Client cannot change verification; re-derive from source.
  data.verificationStatus = deriveVerificationStatus(existing.sourceType);

  if (!policy.autoPublish && Features.storeReviews.moderationV1) {
    data.publicationStatus = PUBLICATION_STATUS.SUBMITTED;
    data.moderationStatus = MODERATION_STATUS.PENDING;
    data.publishedAt = null;
  } else if (existing.publicationStatus !== PUBLICATION_STATUS.PUBLISHED) {
    data.publicationStatus = PUBLICATION_STATUS.PUBLISHED;
    data.moderationStatus = MODERATION_STATUS.APPROVED;
    data.publishedAt = existing.publishedAt ?? new Date();
  }

  const review = await prisma.storeReview.update({
    where: { id: existing.id },
    data,
    select: publicReviewSelect(),
  });

  await recalculateAggregate(prisma, storeId);
  if (review.publicationStatus === PUBLICATION_STATUS.PUBLISHED) {
    await emitStoreReviewedSafe(prisma, {
      storeId,
      userId,
      reviewId: review.id,
      rating: review.rating,
    });
  }

  return { ok: true, review };
}

/**
 * Soft-withdraw: mark REMOVED and recalc aggregate.
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {{ userId: string, storeId: string }} input
 */
export async function withdrawMyReview(prisma, input) {
  if (!Features.storeReviews?.v1 || !Features.storeReviews?.submissionV1) {
    return { ok: false, error: 'feature_disabled', status: 404 };
  }

  const storeId = String(input.storeId ?? '').trim();
  const userId = String(input.userId ?? '').trim();
  if (!userId) return { ok: false, error: 'auth_required', status: 401 };

  const existing = await prisma.storeReview.findFirst({
    where: {
      storeId,
      authorUserId: userId,
      publicationStatus: { not: PUBLICATION_STATUS.REMOVED },
    },
    orderBy: { createdAt: 'desc' },
  });
  if (!existing) return { ok: false, error: 'review_not_found', status: 404 };

  const review = await prisma.storeReview.update({
    where: { id: existing.id },
    data: {
      publicationStatus: PUBLICATION_STATUS.REMOVED,
      removedAt: new Date(),
    },
    select: publicReviewSelect(),
  });

  await recalculateAggregate(prisma, storeId);
  return { ok: true, review };
}

/**
 * Anyone signed-in can report; creates moderation audit row (flag).
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {{ userId: string, storeId: string, reviewId: string, reason?: string }} input
 */
export async function reportReview(prisma, input) {
  if (!Features.storeReviews?.v1) {
    return { ok: false, error: 'feature_disabled', status: 404 };
  }

  const storeId = String(input.storeId ?? '').trim();
  const reviewId = String(input.reviewId ?? '').trim();
  const userId = String(input.userId ?? '').trim();
  if (!userId) return { ok: false, error: 'auth_required', status: 401 };

  const review = await prisma.storeReview.findFirst({
    where: { id: reviewId, storeId },
  });
  if (!review) return { ok: false, error: 'review_not_found', status: 404 };

  const previous = `${review.publicationStatus}:${review.moderationStatus}`;
  await prisma.storeReviewModeration.create({
    data: {
      reviewId,
      actorUserId: userId,
      action: MODERATION_ACTION.REPORT,
      reason: input.reason != null ? String(input.reason).trim().slice(0, 500) : null,
      previousStatus: previous,
      newStatus: `${review.publicationStatus}:${MODERATION_STATUS.FLAGGED}`,
    },
  });

  if (review.moderationStatus !== MODERATION_STATUS.REJECTED) {
    await prisma.storeReview.update({
      where: { id: reviewId },
      data: { moderationStatus: MODERATION_STATUS.FLAGGED },
    });
  }

  return { ok: true };
}

async function emitStoreReviewedSafe(prisma, { storeId, userId, reviewId, rating }) {
  try {
    await recordStoreEngagementEvent(prisma, {
      storeId,
      eventType: 'STORE_REVIEWED',
      actorUserId: userId,
      source: 'store_review',
      metadata: { reviewId, rating },
      entityType: 'store_review',
      entityId: reviewId,
    });
  } catch (err) {
    console.warn('[storeReview] STORE_REVIEWED emit failed:', err?.message ?? err);
  }
}
