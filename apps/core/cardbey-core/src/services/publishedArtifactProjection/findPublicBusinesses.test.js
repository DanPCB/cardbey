import { describe, it, expect, vi, beforeEach } from 'vitest';

const columnState = new Set([
  'heroImageUrl',
  'avatarImageUrl',
  'publishedAt',
  'storefrontSettings',
  'socialLinks',
  'showOwnerProfile',
]);

vi.mock('../../lib/businessColumnCapabilities.js', () => ({
  getBusinessColumnSupport: () => ({
    heroImageUrl: columnState.has('heroImageUrl'),
    avatarImageUrl: columnState.has('avatarImageUrl'),
    publishedAt: columnState.has('publishedAt'),
    storefrontSettings: columnState.has('storefrontSettings'),
    socialLinks: columnState.has('socialLinks'),
    showOwnerProfile: columnState.has('showOwnerProfile'),
  }),
  hasBusinessColumn: (name) => columnState.has(name),
  resetBusinessColumnSupportCache: vi.fn(),
}));

import {
  findPublicBusinesses,
  parseMissingBusinessColumn,
  publicStoreListWhere,
} from './findPublicBusinesses.js';

describe('parseMissingBusinessColumn', () => {
  it('reads Prisma meta.column', () => {
    expect(
      parseMissingBusinessColumn({
        code: 'P2022',
        meta: { column: 'main.Business.storefrontSettings' },
      }),
    ).toBe('storefrontSettings');
  });
});

describe('findPublicBusinesses', () => {
  beforeEach(() => {
    columnState.clear();
    columnState.add('heroImageUrl');
    columnState.add('avatarImageUrl');
    columnState.add('publishedAt');
    columnState.add('storefrontSettings');
    columnState.add('socialLinks');
    columnState.add('showOwnerProfile');
  });

  it('publicStoreListWhere omits publishedAt filter when column is missing', () => {
    columnState.delete('publishedAt');
    const where = publicStoreListWhere();
    expect(where).toEqual({ isActive: true });
  });

  it('retries by stripping any missing column reported in P2022', async () => {
    const findMany = vi
      .fn()
      .mockRejectedValueOnce({
        code: 'P2022',
        meta: { column: 'main.Business.storefrontSettings' },
      })
      .mockResolvedValueOnce([{ id: 's1', name: 'Store', slug: 'store', isActive: true }]);

    const rows = await findPublicBusinesses({ business: { findMany } }, {
      where: { isActive: true },
      take: 5,
    });

    expect(rows).toHaveLength(1);
    expect(findMany).toHaveBeenCalledTimes(2);
    expect(findMany.mock.calls[1][0].select.storefrontSettings).toBeUndefined();
  });
});
