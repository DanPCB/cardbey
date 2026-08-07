import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockListingFindMany = vi.fn();
const mockListingFindFirst = vi.fn();

vi.mock('../../prisma.js', () => ({
  getPrismaClient: () => ({
    marketplaceListing: {
      findMany: mockListingFindMany,
      findFirst: mockListingFindFirst,
    },
  }),
}));

describe('marketplace libraryProjectionService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns only safe public listing projection fields', async () => {
    mockListingFindMany.mockResolvedValue([
      {
        id: 'listing-1',
        sellerId: 'seller-1',
        creatorId: 'creator-1',
        sourceContentId: 'content-1',
        sourceContentType: 'VIDEO',
        title: 'Marketplace Video',
        description: 'Public description',
        language: 'en',
        thumbnailUrl: '/thumb.png',
        accessType: 'FREE',
        priceAmount: 0,
        currencyCode: 'AUD',
        licenceCode: 'personal_use',
        publishedAt: new Date('2026-08-05T00:00:00.000Z'),
        seller: {
          id: 'seller-1',
          status: 'APPROVED',
          creatorId: 'creator-1',
        },
        creator: {
          id: 'creator-1',
          username: 'creator-one',
          displayName: 'Creator One',
        },
        sourceContent: {
          id: 'content-1',
          durationSeconds: 120,
          thumbnail: '/thumb.png',
          mediaUrl: '/video.mp4',
          status: 'published',
          visibility: 'public',
        },
      },
    ]);

    const { listPublicMarketplaceLibraryAssets } = await import(
      '../projection/libraryProjectionService.js'
    );
    const items = await listPublicMarketplaceLibraryAssets();

    expect(items).toHaveLength(1);
    expect(items[0].purchaseAvailable).toBe(false);
    expect(items[0].thumbnailUrl).toBe('/thumb.png');
    expect(items[0]).not.toHaveProperty('mediaUrl');
    expect(items[0]).not.toHaveProperty('sourceUrl');
  });
});
