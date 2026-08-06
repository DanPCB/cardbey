/**
 * Pure domain tests for canonical store reviews (no DB).
 */

import { describe, it, expect } from 'vitest';
import {
  isValidRating,
  SOURCE_TYPE,
  PUBLICATION_STATUS,
  MODERATION_STATUS,
  VERIFICATION_STATUS,
  roundDisplayRating,
} from '../storeReviewTypes.js';
import {
  reviewCountsTowardAggregate,
  computeAggregateFromReviews,
} from '../storeReviewAggregateService.js';
import { isSelfReview } from '../storeReviewEligibilityService.js';
import { deriveVerificationStatus, containsBlockedProfanity } from '../storeReviewService.js';

describe('storeReviewDomain', () => {
  it('accepts ratings 1–5 only', () => {
    expect(isValidRating(1)).toBe(true);
    expect(isValidRating(5)).toBe(true);
    expect(isValidRating(3)).toBe(true);
    expect(isValidRating(0)).toBe(false);
    expect(isValidRating(6)).toBe(false);
    expect(isValidRating(3.5)).toBe(false);
    expect(isValidRating('4')).toBe(true);
    expect(isValidRating(null)).toBe(false);
  });

  it('rejects self-review when user owns the store', () => {
    expect(isSelfReview({ userId: 'u1', storeOwnerUserId: 'u1' })).toBe(true);
    expect(isSelfReview({ userId: 'u1', storeOwnerUserId: 'u2' })).toBe(false);
    expect(isSelfReview({ userId: null, storeOwnerUserId: 'u1' })).toBe(false);
  });

  it('aggregate excludes hidden, rejected verification, and legacy by default', () => {
    const reviews = [
      {
        rating: 5,
        publicationStatus: PUBLICATION_STATUS.PUBLISHED,
        moderationStatus: MODERATION_STATUS.APPROVED,
        verificationStatus: VERIFICATION_STATUS.VERIFIED,
        sourceType: SOURCE_TYPE.STORE_VISIT,
        publishedAt: new Date('2026-01-01'),
      },
      {
        rating: 1,
        publicationStatus: PUBLICATION_STATUS.HIDDEN,
        moderationStatus: MODERATION_STATUS.APPROVED,
        verificationStatus: VERIFICATION_STATUS.UNVERIFIED,
        sourceType: SOURCE_TYPE.STORE_VISIT,
      },
      {
        rating: 2,
        publicationStatus: PUBLICATION_STATUS.PUBLISHED,
        moderationStatus: MODERATION_STATUS.REJECTED,
        verificationStatus: VERIFICATION_STATUS.UNVERIFIED,
        sourceType: SOURCE_TYPE.STORE_VISIT,
      },
      {
        rating: 4,
        publicationStatus: PUBLICATION_STATUS.PUBLISHED,
        moderationStatus: MODERATION_STATUS.APPROVED,
        verificationStatus: VERIFICATION_STATUS.REJECTED,
        sourceType: SOURCE_TYPE.BOOKING,
      },
      {
        rating: 5,
        publicationStatus: PUBLICATION_STATUS.PUBLISHED,
        moderationStatus: MODERATION_STATUS.APPROVED,
        verificationStatus: VERIFICATION_STATUS.UNVERIFIED,
        sourceType: SOURCE_TYPE.LEGACY_TESTIMONIAL,
      },
    ];

    const policy = { includeLegacyInRating: false, allowPendingInAggregate: false };
    expect(reviewCountsTowardAggregate(reviews[0], policy)).toBe(true);
    expect(reviewCountsTowardAggregate(reviews[1], policy)).toBe(false);
    expect(reviewCountsTowardAggregate(reviews[2], policy)).toBe(false);
    expect(reviewCountsTowardAggregate(reviews[3], policy)).toBe(false);
    expect(reviewCountsTowardAggregate(reviews[4], policy)).toBe(false);

    const agg = computeAggregateFromReviews(reviews, policy);
    expect(agg.publishedReviewCount).toBe(1);
    expect(agg.averageRating).toBe(5);
    expect(agg.rating5Count).toBe(1);
  });

  it('includes approved legacy only when policy flag allows', () => {
    const legacy = {
      rating: 4,
      publicationStatus: PUBLICATION_STATUS.PUBLISHED,
      moderationStatus: MODERATION_STATUS.APPROVED,
      verificationStatus: VERIFICATION_STATUS.UNVERIFIED,
      sourceType: SOURCE_TYPE.LEGACY_TESTIMONIAL,
    };
    expect(reviewCountsTowardAggregate(legacy, { includeLegacyInRating: false })).toBe(false);
    expect(reviewCountsTowardAggregate(legacy, { includeLegacyInRating: true })).toBe(true);
  });

  it('update path does not double-count — aggregate from list, not deltas', () => {
    const before = [
      {
        id: 'r1',
        rating: 3,
        publicationStatus: PUBLICATION_STATUS.PUBLISHED,
        moderationStatus: MODERATION_STATUS.APPROVED,
        verificationStatus: VERIFICATION_STATUS.UNVERIFIED,
        sourceType: SOURCE_TYPE.STORE_VISIT,
      },
      {
        id: 'r2',
        rating: 5,
        publicationStatus: PUBLICATION_STATUS.PUBLISHED,
        moderationStatus: MODERATION_STATUS.APPROVED,
        verificationStatus: VERIFICATION_STATUS.VERIFIED,
        sourceType: SOURCE_TYPE.BOOKING,
      },
    ];
    const afterUpdate = [
      { ...before[0], rating: 4 },
      before[1],
    ];

    const a1 = computeAggregateFromReviews(before, {});
    const a2 = computeAggregateFromReviews(afterUpdate, {});
    expect(a1.publishedReviewCount).toBe(2);
    expect(a2.publishedReviewCount).toBe(2);
    expect(a1.averageRatingInternal).toBe(4);
    expect(a2.averageRatingInternal).toBe(4.5);
    expect(a2.averageRating).toBe(roundDisplayRating(4.5));
  });

  it('derives verification from source type (client cannot set)', () => {
    expect(deriveVerificationStatus(SOURCE_TYPE.BOOKING)).toBe(VERIFICATION_STATUS.VERIFIED);
    expect(deriveVerificationStatus(SOURCE_TYPE.ORDER)).toBe(VERIFICATION_STATUS.VERIFIED);
    expect(deriveVerificationStatus(SOURCE_TYPE.STORE_VISIT)).toBe(VERIFICATION_STATUS.UNVERIFIED);
  });

  it('light profanity blocklist matches substrings', () => {
    expect(containsBlockedProfanity('nice place', ['fuck'])).toBe(false);
    expect(containsBlockedProfanity('what the fuck', ['fuck'])).toBe(true);
  });
});
