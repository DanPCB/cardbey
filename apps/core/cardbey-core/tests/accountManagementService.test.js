import { describe, expect, it } from 'vitest';
import {
  listDuplicateStoreGroups,
} from '../src/lib/admin/accountManagementService.js';

function mockPrisma(businesses) {
  return {
    business: {
      findMany: async () => businesses,
    },
  };
}

describe('accountManagementService', () => {
  it('groups near-duplicate AA Travel stores', async () => {
    const businesses = [
      {
        id: 'store-and',
        name: 'AA Travel and Golf Tour',
        slug: 'aa-travel-and-golf-tour',
        userId: 'user-a',
        isActive: true,
        publishedAt: new Date('2026-01-01'),
        isGuestDraft: false,
        expiresAt: null,
        createdAt: new Date('2026-01-01'),
        user: { id: 'user-a', email: 'a@test.com', displayName: 'A', role: 'owner', emailVerified: true },
      },
      {
        id: 'store-amp',
        name: 'AA Travel & Golf Tour',
        slug: 'aa-travel-golf-tour',
        userId: 'user-b',
        isActive: true,
        publishedAt: new Date('2026-02-01'),
        isGuestDraft: false,
        expiresAt: null,
        createdAt: new Date('2026-02-01'),
        user: { id: 'user-b', email: 'b@test.com', displayName: 'B', role: 'owner', emailVerified: true },
      },
    ];

    const result = await listDuplicateStoreGroups(mockPrisma(businesses));
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].recommendedKeepId).toBe('store-amp');
    expect(result.groups[0].stores.find((s) => s.recommendedKeep)?.id).toBe('store-amp');
  });
});
