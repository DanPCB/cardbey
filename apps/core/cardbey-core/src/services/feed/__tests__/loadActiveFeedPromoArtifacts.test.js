import { describe, expect, it } from 'vitest';
import {
  loadActiveFeedPromoArtifacts,
  mapStorePromoTypeToFeedType,
} from '../loadActiveFeedPromoArtifacts.js';

describe('mapStorePromoTypeToFeedType', () => {
  it('maps performer promo types to feed artifact types', () => {
    expect(mapStorePromoTypeToFeedType('campaign')).toBe('campaign');
    expect(mapStorePromoTypeToFeedType('event')).toBe('event');
    expect(mapStorePromoTypeToFeedType('loyalty')).toBe('loyalty');
    expect(mapStorePromoTypeToFeedType('announcement')).toBe('announcement');
    expect(mapStorePromoTypeToFeedType('discount')).toBe('offer');
    expect(mapStorePromoTypeToFeedType('general')).toBeNull();
  });
});

describe('loadActiveFeedPromoArtifacts', () => {
  it('returns one artifact per type per store ordered by query recency', async () => {
    const prisma = {
      storeOffer: {
        findMany: async () => [
          { storeId: 's1', title: '20% Off Today' },
          { storeId: 's1', title: 'Older offer' },
        ],
      },
      storePromo: {
        findMany: async () => [
          { storeId: 's1', title: 'Winter Promotion', promoType: 'campaign' },
          { storeId: 's1', title: 'Golf Weekend', promoType: 'event' },
        ],
      },
      campaignV2: {
        findMany: async () => [],
      },
      loyaltyProgram: {
        findMany: async () => [{ storeId: 's1', name: 'Rewards Available' }],
      },
    };

    const map = await loadActiveFeedPromoArtifacts(prisma, ['s1']);
    expect(map.get('s1')).toEqual([
      { type: 'offer', title: '20% Off Today' },
      { type: 'campaign', title: 'Winter Promotion' },
      { type: 'event', title: 'Golf Weekend' },
      { type: 'loyalty', title: 'Rewards Available' },
    ]);
  });

  it('returns empty map for no store ids', async () => {
    const map = await loadActiveFeedPromoArtifacts({}, []);
    expect(map.size).toBe(0);
  });
});
