/**
 * get_review_summary — first-party reviews when Review model exists; otherwise honest empty.
 * Phase 5: attach SKP context (name/slug/canonicalUrl) without inventing ratings.
 */

import { getPrismaClient } from '../prisma.js';
import { buildSKP, skpToPublicDto } from '../storeKnowledge/index.js';

async function loadSkpContext(storeId) {
  try {
    const skp = await buildSKP(storeId);
    if (!skp) return null;
    const dto = skpToPublicDto(skp);
    if (!dto) return null;
    return {
      name: dto.name || null,
      slug: dto.slug || null,
      canonicalUrl: dto.canonicalUrl || null,
      suburb: dto.suburb || null,
      category: dto.category || null,
    };
  } catch (err) {
    console.warn('[get_review_summary] SKP context failed', err?.message || err);
    return null;
  }
}

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

  const skpContext = await loadSkpContext(storeId);
  const prisma = getPrismaClient();

  if (prisma?.review?.findMany) {
    const reviews = await prisma.review.findMany({
      where: { storeId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    const ratings = reviews
      .map((r) => Number(r.rating))
      .filter((n) => Number.isFinite(n));
    const averageRating =
      ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null;
    const unrespondedCount = reviews.filter((r) => !r.response && !r.reply).length;
    return {
      status: 'ok',
      output: {
        ok: true,
        status: 'ok',
        source: 'review_model',
        reviews,
        count: reviews.length,
        averageRating,
        unrespondedCount,
        skpContext,
      },
    };
  }

  // Honest empty — no Review Prisma model in schema yet. Do not invent ratings.
  return {
    status: 'ok',
    output: {
      ok: true,
      status: 'not_implemented',
      reason: 'Review model not yet in schema',
      source: 'none',
      reviews: [],
      count: 0,
      averageRating: null,
      unrespondedCount: 0,
      skpContext,
    },
  };
}

export default execute;
