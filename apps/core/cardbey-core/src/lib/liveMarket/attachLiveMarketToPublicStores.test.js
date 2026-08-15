/**
 * Batched Live Market feed summary attachment.
 */

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { Features } from '../../config/features.js';
import { loadPrimaryLiveMarketSummariesByStoreIds } from './attachLiveMarketToPublicStores.js';

const FLAG_KEYS = [
  'ENABLE_LIVE_MARKET_V1',
  'ENABLE_LIVE_MARKET_GLOBAL_FEED_V1',
];

describe('attachLiveMarketToPublicStores', () => {
  const prev = {};

  beforeEach(() => {
    for (const k of FLAG_KEYS) {
      prev[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const k of FLAG_KEYS) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
  });

  it('returns empty map when global feed flag is off', async () => {
    process.env.ENABLE_LIVE_MARKET_V1 = 'true';
    expect(Features.liveMarket.globalFeedV1).toBe(false);
    const prisma = {
      liveMarketPilotEnrollment: { findMany: vi.fn() },
      liveMarketSession: { findMany: vi.fn() },
    };
    const map = await loadPrimaryLiveMarketSummariesByStoreIds(prisma, ['s1']);
    expect(map.size).toBe(0);
    expect(prisma.liveMarketSession.findMany).not.toHaveBeenCalled();
  });

  it('batches one primary upcoming summary per enrolled store', async () => {
    process.env.ENABLE_LIVE_MARKET_V1 = 'true';
    process.env.ENABLE_LIVE_MARKET_GLOBAL_FEED_V1 = 'true';
    expect(Features.liveMarket.globalFeedV1).toBe(true);

    const future = new Date(Date.now() + 86400000).toISOString();
    const past = new Date(Date.now() - 3600000).toISOString();
    const prisma = {
      liveMarketPilotEnrollment: {
        findMany: vi.fn(async () => [{ storeId: 's1' }, { storeId: 's2' }]),
      },
      liveMarketSession: {
        findMany: vi.fn(async () => [
          {
            id: 'later',
            storeId: 's1',
            title: 'Later',
            state: 'SCHEDULED',
            scheduledStartAt: new Date(Date.now() + 2 * 86400000).toISOString(),
            storefrontPublicationStatus: 'PUBLISHED',
          },
          {
            id: 'soon',
            storeId: 's1',
            title: 'Soon',
            state: 'SCHEDULED',
            scheduledStartAt: future,
            storefrontPublicationStatus: 'PUBLISHED',
          },
          {
            id: 'waiting',
            storeId: 's2',
            title: 'Waiting',
            state: 'SCHEDULED',
            scheduledStartAt: past,
            storefrontPublicationStatus: 'PUBLISHED',
          },
          {
            id: 'hidden',
            storeId: 's3',
            title: 'Not enrolled store session',
            state: 'SCHEDULED',
            scheduledStartAt: future,
            storefrontPublicationStatus: 'PUBLISHED',
          },
        ]),
      },
    };

    const map = await loadPrimaryLiveMarketSummariesByStoreIds(prisma, ['s1', 's2', 's3']);
    expect(prisma.liveMarketSession.findMany).toHaveBeenCalledTimes(1);
    const s1 = map.get('s1');
    expect(Object.keys(s1).sort()).toEqual([
      'publicState',
      'scheduledAt',
      'sessionId',
      'timezone',
      'title',
    ]);
    expect(s1).toEqual({
      sessionId: 'soon',
      title: 'Soon',
      scheduledAt: future,
      timezone: s1.timezone,
      publicState: 'upcoming',
    });
    expect(map.get('s2')).toMatchObject({
      sessionId: 'waiting',
      publicState: 'waiting_for_host',
    });
    expect(map.has('s3')).toBe(false);
    expect(map.get('s1').description).toBeUndefined();
    expect(map.get('s1').providerExternalRef).toBeUndefined();
  });
});
