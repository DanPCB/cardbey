import { describe, expect, it, beforeEach, vi } from 'vitest';

const state = {
  pubs: [],
};

vi.mock('../repository.js', () => ({
  marketingRepo: {
    publication: {
      findMany: async () => state.pubs.filter((p) => p.status === 'SCHEDULED'),
      updateMany: async ({ where, data }) => {
        const pub = state.pubs.find((p) => p.id === where.id);
        if (!pub || pub.status !== 'SCHEDULED') return { count: 0 };
        const unlocked =
          pub.claimedAt == null ||
          pub.lockExpiresAt == null ||
          new Date(pub.lockExpiresAt) <= new Date();
        if (!unlocked) return { count: 0 };
        Object.assign(pub, data);
        return { count: 1 };
      },
      update: async ({ where, data }) => {
        const pub = state.pubs.find((p) => p.id === where.id);
        Object.assign(pub, data);
        return pub;
      },
    },
    content: {
      update: async () => ({}),
    },
  },
}));

vi.mock('../audit.js', () => ({ appendMarketingAudit: async () => {} }));

const publishMock = vi.fn(async ({ idempotencyKey }) => ({
  ok: true,
  externalPostId: `mock_${idempotencyKey}`,
  publishedUrl: 'https://facebook.com/mock/1',
  meta: { mock: true },
}));

vi.mock('../publishing/index.js', () => ({
  getPublishingProvider: () => ({ name: 'mock', publish: publishMock }),
}));

import { processDueMarketingPublications } from '../schedulingWorker.js';
import { resetMockPublishingStore } from '../publishing/MockSocialPublishingProvider.js';

describe('marketingOperator/schedulingWorker', () => {
  beforeEach(() => {
    process.env.ENABLE_MARKETING_OPERATOR_V1 = 'true';
    process.env.ENABLE_MARKETING_AUTO_SCHEDULE_V1 = 'true';
    process.env.ENABLE_FACEBOOK_LIVE_PUBLISHING_V1 = 'false';
    publishMock.mockClear();
    resetMockPublishingStore();
    state.pubs = [
      {
        id: 'pub1',
        campaignId: 'camp1',
        contentId: 'c1',
        status: 'SCHEDULED',
        scheduledAt: new Date(Date.now() - 1000),
        idempotencyKey: 'key1',
        retryCount: 0,
        claimedAt: null,
        lockExpiresAt: null,
        campaign: { status: 'DRAFT' },
        content: { body: 'hello under development' },
        pageId: null,
      },
    ];
  });

  it('claims and publishes once (idempotent key)', async () => {
    const first = await processDueMarketingPublications({ force: false });
    expect(first.processed).toBe(1);
    expect(publishMock).toHaveBeenCalledTimes(1);
    expect(state.pubs[0].status).toBe('PUBLISHED');

    // Second cycle: no SCHEDULED rows
    const second = await processDueMarketingPublications({ force: false });
    expect(second.processed).toBe(0);
    expect(publishMock).toHaveBeenCalledTimes(1);
  });

  it('second claim fails while lock held', async () => {
    state.pubs[0].claimedAt = new Date();
    state.pubs[0].lockExpiresAt = new Date(Date.now() + 60_000);
    const result = await processDueMarketingPublications({ force: true });
    expect(result.results[0].reason).toBe('claim_failed');
    expect(publishMock).not.toHaveBeenCalled();
  });
});
