import { Features } from '../../config/features.js';
import { emptyAggregate } from './storeReviewAggregateService.js';

/**
 * Attach rating aggregate to public store DTOs (feed, frontscreen).
 * Shape: `{ ratingAggregate }` and alias `{ storeRating }` for consumers.
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {object[]} stores
 * @param {import('express').Request} [_req]
 */
export async function attachStoreReviewsToPublicStores(prisma, stores, _req) {
  const list = Array.isArray(stores) ? stores : [];
  if (!Features.storeReviews?.v1) return list;

  const ids = [...new Set(list.map((s) => String(s?.id ?? '').trim()).filter(Boolean))];
  if (ids.length === 0) return list;

  let rows;
  try {
    rows = await prisma.storeReviewAggregate.findMany({
      where: { storeId: { in: ids } },
    });
  } catch (err) {
    console.warn('[attachStoreReviewsToPublicStores] batch failed:', err?.message ?? err);
    return list;
  }

  const map = new Map(rows.map((r) => [r.storeId, r]));

  return list.map((store) => {
    const agg = map.get(store.id) ?? emptyAggregate(store.id);
    const ratingAggregate = {
      publishedReviewCount: agg.publishedReviewCount ?? 0,
      averageRating: agg.averageRating ?? 0,
      rating1Count: agg.rating1Count ?? 0,
      rating2Count: agg.rating2Count ?? 0,
      rating3Count: agg.rating3Count ?? 0,
      rating4Count: agg.rating4Count ?? 0,
      rating5Count: agg.rating5Count ?? 0,
      verifiedReviewCount: agg.verifiedReviewCount ?? 0,
      latestReviewAt: agg.latestReviewAt ?? null,
    };
    return {
      ...store,
      ratingAggregate,
      storeRating: ratingAggregate,
    };
  });
}
