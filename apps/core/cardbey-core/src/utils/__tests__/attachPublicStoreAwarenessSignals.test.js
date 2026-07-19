/**
 * attachPublicStoreAwarenessSignals — unit tests (mocked prisma).
 */
import { describe, it, expect, vi } from 'vitest';
import { attachPublicStoreAwarenessSignals } from '../attachPublicStoreAwarenessSignals.js';

describe('attachPublicStoreAwarenessSignals', () => {
  it('returns dto unchanged when store id missing', async () => {
    const dto = { name: 'X' };
    const out = await attachPublicStoreAwarenessSignals({}, dto);
    expect(out).toEqual(dto);
  });

  it('attaches active loyalty, live campaigns, and promotions', async () => {
    const prisma = {
      loyaltyProgram: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'loy-1',
            name: 'Coffee Club',
            stampsRequired: 10,
            reward: 'Free drink',
            expiresAt: null,
            createdAt: new Date('2026-07-01'),
          },
        ]),
      },
      campaignV2: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'camp-1',
            title: 'Summer renovation package',
            objective: 'Book now',
            status: 'RUNNING',
            createdAt: new Date('2026-07-10'),
            updatedAt: new Date('2026-07-15'),
          },
        ]),
      },
      promotion: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'promo-1',
            title: '10% off',
            message: 'This week',
            ctaLabel: 'See deal',
            status: 'active',
            endAt: null,
            priority: 1,
            createdAt: new Date('2026-07-12'),
            updatedAt: new Date('2026-07-12'),
          },
        ]),
      },
    };

    const out = await attachPublicStoreAwarenessSignals(prisma, {
      id: 'store-1',
      name: 'CA Handyman',
    });

    expect(out.loyaltyPrograms).toHaveLength(1);
    expect(out.loyaltyPrograms[0].name).toBe('Coffee Club');
    expect(out.campaigns[0].title).toBe('Summer renovation package');
    expect(out.promotions[0].title).toBe('10% off');
  });
});
