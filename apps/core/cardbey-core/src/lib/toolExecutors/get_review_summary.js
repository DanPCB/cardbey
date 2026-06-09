/**
 * get_review_summary — honest stub until Review model exists (Round 3).
 * DANH: skill-round3-reviews
 *
 * AUDIT:
 * - get_review_summary: not found
 * - draft_review_response / respond_review: not found
 * - Review Prisma model: not found (no schema change in Round 3)
 * - confirm_booking_customer: found — booking messages, not public reviews
 */

import { getPrismaClient } from '../prisma.js';

/**
 * @param {object} [input]
 * @param {object} [context]
 */
export async function execute(input = {}, context = {}) {
  const storeId =
    (typeof input?.storeId === 'string' && input.storeId.trim()) ||
    (typeof context?.storeId === 'string' && context.storeId.trim()) ||
    null;

  if (!storeId) {
    return {
      status: 'failed',
      error: { code: 'VALIDATION_ERROR', message: 'storeId is required' },
      output: { ok: false, error: 'storeId is required' },
    };
  }

  const prisma = getPrismaClient();

  if (prisma?.review?.findMany) {
    const reviews = await prisma.review.findMany({
      where: { storeId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    // Side effect: read-only Review query when model exists.
    return {
      status: 'ok',
      output: {
        ok: true,
        status: 'ok',
        reviews,
        count: reviews.length,
      },
    };
  }

  // Side effect: read-only or honest stub — Review model not yet in schema.
  return {
    status: 'ok',
    output: {
      ok: true,
      status: 'not_implemented',
      reason: 'Review model not yet in schema',
      reviews: [],
      count: 0,
      averageRating: null,
      unrespondedCount: 0,
    },
  };
}

export default execute;
