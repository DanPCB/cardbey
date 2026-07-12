import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockFindMany = vi.fn();
const mockFindFirst = vi.fn();
const mockFindUnique = vi.fn();

vi.mock('../../prisma.js', () => ({
  getPrismaClient: () => ({
    creatorContent: {
      findMany: mockFindMany,
      findFirst: mockFindFirst,
      findUnique: mockFindUnique,
    },
    creator: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  }),
}));

describe('creatorShowcaseService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindUnique.mockResolvedValue(null);
  });

  it('listCreatorShowcase returns published items with creator', async () => {
    mockFindMany.mockResolvedValue([
      {
        id: 'c1',
        creatorId: 'cr1',
        type: 'VIDEO',
        title: 'My Video',
        description: null,
        language: 'en',
        durationSeconds: 60,
        publishedAt: new Date('2026-07-01'),
        visibility: 'public',
        thumbnail: '/t.jpg',
        mediaUrl: '/v.mp4',
        status: 'published',
        views: 10,
        likes: 2,
        shares: 1,
        bookmarks: 0,
        runtimeMissionId: null,
        sourceType: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        creator: {
          id: 'cr1',
          username: 'jane',
          displayName: 'Jane',
          avatar: null,
          country: 'AU',
          categories: ['technology'],
          isQualified: true,
        },
      },
    ]);

    const { listCreatorShowcase } = await import('../creatorShowcaseService.js');
    const result = await listCreatorShowcase({ limit: 12 });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].title).toBe('My Video');
    expect(result.items[0].creator.username).toBe('jane');
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'published', visibility: 'public' }),
      }),
    );
  });

  it('listCreatorShowcase maps video filter to VIDEO type', async () => {
    mockFindMany.mockResolvedValue([]);

    const { listCreatorShowcase } = await import('../creatorShowcaseService.js');
    await listCreatorShowcase({ type: 'videos' });

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ type: 'VIDEO' }),
      }),
    );
  });

  it('getPublicCreatorContent returns null for missing content', async () => {
    mockFindFirst.mockResolvedValue(null);

    const { getPublicCreatorContent } = await import('../creatorShowcaseService.js');
    const result = await getPublicCreatorContent('missing');

    expect(result).toBeNull();
  });
});
