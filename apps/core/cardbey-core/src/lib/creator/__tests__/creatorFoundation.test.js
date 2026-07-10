import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  CREATOR_CONTENT_STATUS,
  CREATOR_CONTENT_TYPES,
  QUALIFICATION_MINUTES,
} from '../creatorTypes.js';

const mockPrisma = {
  creator: {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  creatorContent: {
    create: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
  },
  user: {
    findUnique: vi.fn(),
  },
};

vi.mock('../../prisma.js', () => ({
  getPrismaClient: () => mockPrisma,
}));

describe('creator foundation phase 1.5', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates creator profile for user', async () => {
    mockPrisma.creator.findUnique.mockResolvedValue(null);
    mockPrisma.user.findUnique.mockResolvedValue({
      displayName: 'Alex Creator',
      handle: 'alex',
      avatarUrl: null,
      bio: 'Bio',
      country: 'AU',
    });
    mockPrisma.creator.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    mockPrisma.creator.create.mockResolvedValue({
      id: 'cr1',
      userId: 'u1',
      username: 'alex',
      displayName: 'Alex Creator',
      avatar: null,
      banner: null,
      bio: 'Bio',
      languages: [],
      country: 'AU',
      categories: [],
      verifiedStatus: 'unverified',
      joinedAt: new Date(),
      totalPublishedMinutes: 0,
      totalVideos: 0,
      totalArticles: 0,
      totalViews: 0,
      followers: 0,
      following: 0,
      creatorLevel: 1,
      creatorStatus: 'active',
      qualificationProgress: 0,
      isQualified: false,
    });

    const { createCreatorProfileRecord } = await import('../creatorContentService.js');
    const creator = await createCreatorProfileRecord('u1', {});
    expect(creator.username).toBe('alex');
    expect(mockPrisma.creator.create).toHaveBeenCalled();
  });

  it('enforces owner review before publish', async () => {
    mockPrisma.creatorContent.findUnique.mockResolvedValue({
      id: 'c1',
      creatorId: 'cr1',
      status: CREATOR_CONTENT_STATUS.DRAFT,
      runtimeMissionId: null,
    });

    const { publishCreatorContentRecord } = await import('../creatorContentService.js');
    await expect(publishCreatorContentRecord('c1', {})).rejects.toThrow(
      'cannot_publish_from_status_draft',
    );
  });

  it('publishes from owner review and counts published minutes', async () => {
    const publishedAt = new Date();
    mockPrisma.creatorContent.findUnique
      .mockResolvedValueOnce({
        id: 'c1',
        creatorId: 'cr1',
        status: CREATOR_CONTENT_STATUS.OWNER_REVIEW,
        runtimeMissionId: null,
      })
      .mockResolvedValueOnce({
        id: 'c1',
        creatorId: 'cr1',
        type: CREATOR_CONTENT_TYPES.VIDEO,
        title: 'Test',
        status: CREATOR_CONTENT_STATUS.PUBLISHED,
        durationSeconds: 3600,
        publishedAt,
      });

    mockPrisma.creatorContent.update.mockResolvedValue({
      id: 'c1',
      creatorId: 'cr1',
      type: CREATOR_CONTENT_TYPES.VIDEO,
      title: 'Test',
      description: null,
      language: null,
      durationSeconds: 3600,
      publishedAt,
      visibility: 'public',
      thumbnail: null,
      mediaUrl: 'https://example.com/v.mp4',
      status: CREATOR_CONTENT_STATUS.PUBLISHED,
      views: 0,
      likes: 0,
      shares: 0,
      bookmarks: 0,
      runtimeMissionId: null,
      sourceType: 'creator_studio',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    mockPrisma.creatorContent.findMany.mockResolvedValue([
      { type: CREATOR_CONTENT_TYPES.VIDEO, durationSeconds: 3600 },
    ]);

    mockPrisma.creator.update.mockResolvedValue({
      id: 'cr1',
      totalPublishedMinutes: 60,
      isQualified: false,
    });

    const { publishCreatorContentRecord } = await import('../creatorContentService.js');
    const result = await publishCreatorContentRecord('c1', { missionId: 'm1' });
    expect(result.content.status).toBe(CREATOR_CONTENT_STATUS.PUBLISHED);
    expect(result.progress.totalPublishedMinutes).toBe(60);
  });

  it('qualifies at 300 published minutes', async () => {
    mockPrisma.creatorContent.findMany.mockResolvedValue([
      { type: CREATOR_CONTENT_TYPES.VIDEO, durationSeconds: 300 * 60 },
    ]);
    mockPrisma.creator.update.mockImplementation(({ data }) => ({
      id: 'cr1',
      ...data,
    }));

    const { syncCreatorProgress } = await import('../creatorProgressService.js');
    const { progress } = await syncCreatorProgress('cr1');
    expect(progress.totalPublishedMinutes).toBe(QUALIFICATION_MINUTES);
    expect(progress.isQualified).toBe(true);
    expect(progress.qualificationProgress).toBe(100);
  });

  it('submit review moves draft to owner_review', async () => {
    mockPrisma.creatorContent.findUnique.mockReset();
    mockPrisma.creatorContent.update.mockReset();
    mockPrisma.creatorContent.findUnique.mockResolvedValue({
      id: 'c1',
      status: CREATOR_CONTENT_STATUS.DRAFT,
      runtimeMissionId: null,
    });
    mockPrisma.creatorContent.update.mockResolvedValue({
      id: 'c1',
      creatorId: 'cr1',
      type: CREATOR_CONTENT_TYPES.ARTICLE,
      title: 'Article',
      description: 'Body',
      language: null,
      durationSeconds: null,
      publishedAt: null,
      visibility: 'public',
      thumbnail: null,
      mediaUrl: null,
      status: CREATOR_CONTENT_STATUS.OWNER_REVIEW,
      views: 0,
      likes: 0,
      shares: 0,
      bookmarks: 0,
      runtimeMissionId: 'm1',
      sourceType: 'creator_studio',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const { submitCreatorContentForReview } = await import('../creatorContentService.js');
    const content = await submitCreatorContentForReview('c1', { missionId: 'm1' });
    expect(content.status).toBe(CREATOR_CONTENT_STATUS.OWNER_REVIEW);
  });
});
