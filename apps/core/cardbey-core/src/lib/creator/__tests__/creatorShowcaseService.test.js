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

  it('listCreatorShowcase maps services filter to CREATOR_SERVICE (not bare SERVICE)', async () => {
    mockFindMany.mockResolvedValue([]);

    const { listCreatorShowcase } = await import('../creatorShowcaseService.js');
    await listCreatorShowcase({ type: 'services' });

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          type: { in: ['CREATOR_SERVICE', 'SERVICE'] },
        }),
      }),
    );
  });

  it('listCreatorShowcase topic category filters in memory (Json categories)', async () => {
    mockFindMany.mockResolvedValue([
      {
        id: 'c1',
        creatorId: 'cr1',
        type: 'ARTICLE',
        title: 'Biz tip',
        description: null,
        language: 'en',
        durationSeconds: null,
        publishedAt: new Date('2026-07-02'),
        visibility: 'public',
        thumbnail: null,
        mediaUrl: null,
        status: 'published',
        views: 1,
        likes: 0,
        shares: 0,
        bookmarks: 0,
        runtimeMissionId: null,
        sourceType: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        creator: {
          id: 'cr1',
          username: 'biz',
          displayName: 'Biz',
          avatar: null,
          country: 'AU',
          categories: ['business'],
          isQualified: true,
        },
      },
      {
        id: 'c2',
        creatorId: 'cr2',
        type: 'ARTICLE',
        title: 'Food tip',
        description: null,
        language: 'en',
        durationSeconds: null,
        publishedAt: new Date('2026-07-01'),
        visibility: 'public',
        thumbnail: null,
        mediaUrl: null,
        status: 'published',
        views: 1,
        likes: 0,
        shares: 0,
        bookmarks: 0,
        runtimeMissionId: null,
        sourceType: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        creator: {
          id: 'cr2',
          username: 'foodie',
          displayName: 'Foodie',
          avatar: null,
          country: 'AU',
          categories: ['food'],
          isQualified: false,
        },
      },
    ]);

    const { listCreatorShowcase } = await import('../creatorShowcaseService.js');
    const result = await listCreatorShowcase({ category: 'business', limit: 12 });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].title).toBe('Biz tip');
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'published',
          visibility: 'public',
          creator: { creatorStatus: 'active' },
        }),
      }),
    );
    expect(mockFindMany.mock.calls[0][0].where.creator.categories).toBeUndefined();
  });

  it('getPublicCreatorContent returns null for missing content', async () => {
    mockFindFirst.mockResolvedValue(null);

    const { getPublicCreatorContent } = await import('../creatorShowcaseService.js');
    const result = await getPublicCreatorContent('missing');

    expect(result).toBeNull();
  });
});
