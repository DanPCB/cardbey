/**
 * Batched Live Market summaries for public store lists / global feed.
 * Avoids N+1 per-card live-session GETs. Flag-gated (globalFeedV1).
 */

import { Features } from '../../config/features.js';
import {
  STOREFRONT_PUBLICATION_STATUS,
  selectPrimaryPublishedSession,
  toPublicFeedLiveMarketSummary,
} from './domain.js';

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string[]} storeIds
 * @param {{ now?: Date, force?: boolean }} [opts]
 * @returns {Promise<Map<string, object>>} storeId → compact liveMarket summary
 */
export async function loadPrimaryLiveMarketSummariesByStoreIds(prisma, storeIds, opts = {}) {
  const map = new Map();
  if (!opts.force && !Features.liveMarket.globalFeedV1) return map;
  const ids = [...new Set((storeIds || []).map((id) => String(id || '').trim()).filter(Boolean))];
  if (ids.length === 0 || !prisma?.liveMarketSession?.findMany) return map;

  const now = opts.now instanceof Date ? opts.now : new Date();

  const [enrollments, sessions] = await Promise.all([
    prisma.liveMarketPilotEnrollment.findMany({
      where: { storeId: { in: ids }, state: 'ACTIVE' },
      select: { storeId: true },
    }),
    prisma.liveMarketSession.findMany({
      where: {
        storeId: { in: ids },
        storefrontPublicationStatus: STOREFRONT_PUBLICATION_STATUS.PUBLISHED,
        state: { in: ['SCHEDULED', 'READY', 'LIVE', 'ENDED', 'PROCESSING', 'REPLAY_READY'] },
      },
      select: {
        id: true,
        storeId: true,
        title: true,
        state: true,
        scheduledStartAt: true,
        storefrontPublicationStatus: true,
      },
      orderBy: [{ scheduledStartAt: 'asc' }, { updatedAt: 'desc' }],
    }),
  ]);

  const activeStores = new Set(enrollments.map((e) => e.storeId));
  /** @type {Map<string, object[]>} */
  const byStore = new Map();
  for (const session of sessions) {
    if (!activeStores.has(session.storeId)) continue;
    const list = byStore.get(session.storeId) || [];
    list.push(session);
    byStore.set(session.storeId, list);
  }

  for (const [storeId, list] of byStore) {
    const primary = selectPrimaryPublishedSession(list, {
      now,
      providerConfirmedLive: false,
      enrollmentState: 'ACTIVE',
    });
    let timezone = null;
    try {
      timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || null;
    } catch {
      timezone = null;
    }
    const summary = toPublicFeedLiveMarketSummary(primary, {
      now,
      providerConfirmedLive: false,
      displayTimezone: timezone,
    });
    if (summary) map.set(storeId, summary);
  }

  return map;
}

/**
 * Attach compact `liveMarket` onto each public store result from resolvePublicStoresForList.
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {Array<{ store: object }>} results
 * @param {{ now?: Date }} [opts]
 */
export async function attachLiveMarketSummariesToPublicStoreResults(prisma, results, opts = {}) {
  if (!Features.liveMarket.globalFeedV1) return results;
  if (!Array.isArray(results) || results.length === 0) return results;
  const storeIds = results.map((r) => r?.store?.id).filter(Boolean);
  const summaryByStore = await loadPrimaryLiveMarketSummariesByStoreIds(prisma, storeIds, opts);
  for (const row of results) {
    const summary = summaryByStore.get(row?.store?.id);
    if (summary) {
      row.store = { ...row.store, liveMarket: summary };
    }
  }
  return results;
}
