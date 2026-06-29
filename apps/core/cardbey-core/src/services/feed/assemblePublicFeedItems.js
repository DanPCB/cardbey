/**
 * Canonical public feed assembly — one organic entry per storeId.
 */
import { ORGANIC_PLACEMENT } from './feedItemTypes.js';

/**
 * @param {import('./feedItemTypes.js').FeedItem[]} candidates
 * @returns {import('./feedItemTypes.js').FeedItem[]}
 */
export function assemblePublicFeedItems(candidates) {
  if (!Array.isArray(candidates) || candidates.length === 0) return [];

  const seenOrganicStoreIds = new Set();
  const output = [];

  for (const item of candidates) {
    if (!item || typeof item !== 'object') continue;
    const storeId = String(item.storeId ?? item.store?.id ?? '').trim();
    if (!storeId) continue;

    const placementType = item.placementType ?? ORGANIC_PLACEMENT;

    if (placementType === ORGANIC_PLACEMENT) {
      if (seenOrganicStoreIds.has(storeId)) continue;
      seenOrganicStoreIds.add(storeId);
    }

    output.push({
      ...item,
      storeId,
      placementType,
      id: item.id ?? `${placementType}:${storeId}`,
    });
  }

  return output;
}

/**
 * @param {{ store: object, projection?: unknown, usedFallback?: boolean }} row
 * @param {{ placementType?: string, source?: string, rank?: number }} [opts]
 * @returns {import('./feedItemTypes.js').FeedItem}
 */
export function publicStoreResultToFeedItem(row, opts = {}) {
  const store = row?.store ?? {};
  const storeId = String(store.id ?? '').trim();
  const placementType = opts.placementType ?? ORGANIC_PLACEMENT;
  const createdAt =
    store.createdAt instanceof Date
      ? store.createdAt.toISOString()
      : typeof store.createdAt === 'string'
        ? store.createdAt
        : store.publishedAt instanceof Date
          ? store.publishedAt.toISOString()
          : typeof store.publishedAt === 'string'
            ? store.publishedAt
            : undefined;
  const updatedAt =
    store.updatedAt instanceof Date
      ? store.updatedAt.toISOString()
      : typeof store.updatedAt === 'string'
        ? store.updatedAt
        : createdAt;

  return {
    id: `${placementType}:${storeId}`,
    storeId,
    placementType,
    source: opts.source ?? 'published_store',
    rank: opts.rank,
    createdAt,
    updatedAt,
    store,
  };
}

/**
 * Dev/ops audit log for feed assembly.
 * @param {import('./feedItemTypes.js').FeedItem[]} items
 * @param {{ route?: string }} [meta]
 */
export function logPublicFeedAssembly(items, meta = {}) {
  if (process.env.NODE_ENV === 'test') return;
  const route = meta.route ?? 'unknown';
  for (const item of items) {
    console.log('[PUBLIC_FEED_ITEM]', {
      route,
      storeId: item.storeId,
      feedEntryId: item.id,
      placementType: item.placementType,
      source: item.source ?? null,
      rank: item.rank ?? null,
      createdAt: item.createdAt ?? null,
      updatedAt: item.updatedAt ?? null,
    });
  }
}
