import { viewerKeyFromReq } from './storeEngagementActor.js';
import { batchStoreEngagementSummaries } from './storeEngagementActionService.js';

/**
 * Attach canonical engagement + viewer state to public store DTOs (feed, frontscreen).
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {object[]} stores
 * @param {import('express').Request} [req]
 */
export async function attachStoreEngagementToPublicStores(prisma, stores, req) {
  const list = Array.isArray(stores) ? stores : [];
  const ids = [...new Set(list.map((s) => String(s?.id ?? '').trim()).filter(Boolean))];
  if (ids.length === 0) return list;

  const viewer = {
    userId: req?.user?.id ?? req?.userId ?? null,
    viewerKey: viewerKeyFromReq(req ?? {}),
  };

  let map;
  try {
    map = await batchStoreEngagementSummaries(prisma, ids, viewer);
  } catch (err) {
    console.warn('[attachStoreEngagementToPublicStores] batch failed:', err?.message ?? err);
    return list;
  }

  return list.map((store) => {
    const row = map.get(store.id);
    if (!row) return store;
    return {
      ...store,
      engagement: row.engagement,
      viewer: row.viewer,
    };
  });
}
