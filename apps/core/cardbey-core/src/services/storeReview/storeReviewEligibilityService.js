/**
 * Eligibility checks for submitting / updating a store review.
 */

import { Features } from '../../config/features.js';
import { PUBLICATION_STATUS, SOURCE_TYPE } from './storeReviewTypes.js';

/**
 * Pure self-review check.
 * @param {{ userId?: string|null, storeOwnerUserId?: string|null }} input
 */
export function isSelfReview(input) {
  const userId = String(input?.userId ?? '').trim();
  const ownerId = String(input?.storeOwnerUserId ?? '').trim();
  return Boolean(userId && ownerId && userId === ownerId);
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {{ userId?: string|null, storeId: string, sourceType?: string, sourceReferenceId?: string|null }} input
 */
export async function checkStoreReviewEligibility(prisma, input) {
  const storeId = String(input?.storeId ?? '').trim();
  const userId = input?.userId != null ? String(input.userId).trim() : '';
  const sourceType = String(input?.sourceType ?? SOURCE_TYPE.STORE_VISIT).trim() || SOURCE_TYPE.STORE_VISIT;
  const sourceReferenceId =
    input?.sourceReferenceId != null && String(input.sourceReferenceId).trim()
      ? String(input.sourceReferenceId).trim()
      : null;

  if (!storeId) {
    return { ok: false, eligible: false, error: 'store_id_required', reason: 'store_id_required' };
  }
  if (!userId) {
    return {
      ok: false,
      eligible: false,
      error: 'auth_required',
      reason: 'anonymous_blocked',
    };
  }

  if (!Features.storeReviews?.submissionV1) {
    return {
      ok: false,
      eligible: false,
      error: 'submission_disabled',
      reason: 'submission_disabled',
    };
  }

  const store = await prisma.business.findUnique({
    where: { id: storeId },
    select: { id: true, userId: true, name: true },
  });
  if (!store) {
    return { ok: false, eligible: false, error: 'store_not_found', reason: 'store_not_found' };
  }

  if (isSelfReview({ userId, storeOwnerUserId: store.userId })) {
    return {
      ok: false,
      eligible: false,
      error: 'self_review_forbidden',
      reason: 'store_owner_cannot_review',
    };
  }

  if (sourceType === SOURCE_TYPE.STORE_VISIT || sourceType === SOURCE_TYPE.MANUAL_UNVERIFIED) {
    if (!Features.storeReviews?.submissionV1) {
      return {
        ok: false,
        eligible: false,
        error: 'submission_disabled',
        reason: 'store_visit_requires_submission_flag',
      };
    }
  }

  if (sourceType === SOURCE_TYPE.LEGACY_TESTIMONIAL) {
    return {
      ok: false,
      eligible: false,
      error: 'source_not_allowed',
      reason: 'legacy_testimonial_not_submittable',
    };
  }

  let existing = null;

  if (
    (sourceType === SOURCE_TYPE.BOOKING || sourceType === SOURCE_TYPE.ORDER) &&
    sourceReferenceId
  ) {
    const txCheck = await assertTransactionEligible(prisma, {
      storeId,
      userId,
      sourceType,
      sourceReferenceId,
    });
    if (!txCheck.ok) return { ...txCheck, eligible: false };

    existing = await prisma.storeReview.findFirst({
      where: {
        storeId,
        sourceType,
        sourceReferenceId,
        publicationStatus: { not: PUBLICATION_STATUS.REMOVED },
      },
    });
    if (existing && existing.authorUserId !== userId) {
      return {
        ok: false,
        eligible: false,
        error: 'transaction_already_reviewed',
        reason: 'one_review_per_transaction',
        existingReviewId: existing.id,
      };
    }
  } else if (
    sourceType === SOURCE_TYPE.STORE_VISIT ||
    sourceType === SOURCE_TYPE.MANUAL_UNVERIFIED
  ) {
    existing = await prisma.storeReview.findFirst({
      where: {
        storeId,
        authorUserId: userId,
        sourceType: { in: [SOURCE_TYPE.STORE_VISIT, SOURCE_TYPE.MANUAL_UNVERIFIED] },
        publicationStatus: { not: PUBLICATION_STATUS.REMOVED },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  const canUpdate = Boolean(existing && existing.authorUserId === userId);

  return {
    ok: true,
    eligible: !existing || canUpdate,
    canCreate: !existing,
    canUpdate,
    existingReviewId: existing?.id ?? null,
    sourceType,
    storeId: store.id,
    reason: existing
      ? canUpdate
        ? 'update_existing'
        : 'already_reviewed'
      : 'eligible',
  };
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 */
async function assertTransactionEligible(prisma, { storeId, userId, sourceType, sourceReferenceId }) {
  if (sourceType === SOURCE_TYPE.BOOKING) {
    const booking = await prisma.booking.findUnique({
      where: { id: sourceReferenceId },
      select: { id: true, storeId: true, status: true, customerId: true },
    });
    if (!booking) {
      return { ok: false, error: 'booking_not_found', reason: 'booking_not_found' };
    }
    if (booking.storeId !== storeId) {
      return { ok: false, error: 'booking_store_mismatch', reason: 'booking_store_mismatch' };
    }
    if (String(booking.status).toLowerCase() !== 'completed') {
      return { ok: false, error: 'booking_not_completed', reason: 'booking_not_completed' };
    }
    if (booking.customerId && booking.customerId !== userId) {
      return { ok: false, error: 'booking_customer_mismatch', reason: 'booking_customer_mismatch' };
    }
    return { ok: true };
  }

  if (sourceType === SOURCE_TYPE.ORDER) {
    const order = await prisma.posOrder.findUnique({
      where: { id: sourceReferenceId },
      select: {
        id: true,
        storeId: true,
        status: true,
        completedAt: true,
        customerId: true,
        customer: { select: { email: true } },
      },
    });
    if (!order) {
      return { ok: false, error: 'order_not_found', reason: 'order_not_found' };
    }
    if (order.storeId !== storeId) {
      return { ok: false, error: 'order_store_mismatch', reason: 'order_store_mismatch' };
    }
    const status = String(order.status).toLowerCase();
    const completed = Boolean(order.completedAt) || status === 'completed' || status === 'paid';
    if (!completed) {
      return { ok: false, error: 'order_not_completed', reason: 'order_not_completed' };
    }
    // CommerceCustomer has no userId — best-effort email match when customer linked.
    if (order.customerId && order.customer?.email) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true },
      });
      const userEmail = String(user?.email ?? '').trim().toLowerCase();
      const custEmail = String(order.customer.email).trim().toLowerCase();
      if (userEmail && custEmail && userEmail !== custEmail) {
        return { ok: false, error: 'order_customer_mismatch', reason: 'order_customer_mismatch' };
      }
    }
    return { ok: true };
  }

  return { ok: false, error: 'invalid_source_type', reason: 'invalid_source_type' };
}
