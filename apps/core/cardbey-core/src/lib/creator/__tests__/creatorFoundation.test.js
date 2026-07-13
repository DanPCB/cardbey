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
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1' });
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
    const creator = await createCreatorProfileRecord('u1', {
      displayName: 'Alex Creator',
      username: 'alex',
      bio: 'Bio',
      country: 'AU',
    });
    expect(creator.username).toBe('alex');
    expect(mockPrisma.creator.create).toHaveBeenCalled();
  });

  it('rejects missing displayName with field validation', async () => {
    mockPrisma.creator.findUnique.mockResolvedValue(null);
    const { createCreatorProfileRecord } = await import('../creatorContentService.js');
    await expect(
      createCreatorProfileRecord('u1', { username: 'alex' }),
    ).rejects.toMatchObject({
      code: 'CREATOR_PROFILE_VALIDATION_FAILED',
      fields: { displayName: expect.any(String) },
    });
  });

  it('rejects duplicate username', async () => {
    mockPrisma.creator.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'other', userId: 'u2' });
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1' });

    const { createCreatorProfileRecord } = await import('../creatorContentService.js');
    await expect(
      createCreatorProfileRecord('u1', { displayName: 'Alex', username: 'taken' }),
    ).rejects.toMatchObject({
      code: 'CREATOR_USERNAME_TAKEN',
      fields: { username: expect.any(String) },
    });
  });

  it('returns existing profile for same user without creating twice', async () => {
    mockPrisma.creator.findUnique.mockResolvedValue({
      id: 'cr1',
      userId: 'u1',
      username: 'alex',
      displayName: 'Alex',
      avatar: null,
      banner: null,
      bio: null,
      languages: [],
      country: null,
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
    const creator = await createCreatorProfileRecord('u1', {
      displayName: 'Other',
      username: 'other',
    });
    expect(creator.username).toBe('alex');
    expect(mockPrisma.creator.create).not.toHaveBeenCalled();
  });

  it('enforces owner review before publish', async () => {
    mockPrisma.creatorContent.findUnique.mockResolvedValue({
      id: 'c1',
      creatorId: 'cr1',
      status: CREATOR_CONTENT_STATUS.DRAFT,
      runtimeMissionId: null,
      type: CREATOR_CONTENT_TYPES.VIDEO,
      mediaUrl: 'https://example.com/v.mp4',
      durationSeconds: 10.042,
    });

    const { publishCreatorContentRecord } = await import('../creatorContentService.js');
    await expect(publishCreatorContentRecord('c1', {})).rejects.toMatchObject({
      code: 'INVALID_CREATOR_CONTENT_TRANSITION',
      currentStatus: CREATOR_CONTENT_STATUS.DRAFT,
      requestedStatus: CREATOR_CONTENT_STATUS.PUBLISHED,
    });
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

  it('qualifies at 300 published minutes using seconds threshold', async () => {
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
    expect(progress.totalPublishedSeconds).toBe(QUALIFICATION_MINUTES * 60);
    expect(progress.isQualified).toBe(true);
    expect(progress.qualificationProgress).toBe(100);
  });

  it('drafts do not count toward progress', async () => {
    mockPrisma.creatorContent.findMany.mockResolvedValue([]);
    const { calculateCreatorProgress } = await import('../creatorProgressService.js');
    const progress = await calculateCreatorProgress('cr1');
    expect(progress.totalPublishedMinutes).toBe(0);
    expect(progress.isQualified).toBe(false);
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

  it('returns owner review content to draft', async () => {
    mockPrisma.creatorContent.findUnique.mockResolvedValue({
      id: 'c1',
      status: CREATOR_CONTENT_STATUS.OWNER_REVIEW,
      runtimeMissionId: null,
      creatorId: 'cr1',
      type: CREATOR_CONTENT_TYPES.VIDEO,
    });
    mockPrisma.creatorContent.update.mockResolvedValue({
      id: 'c1',
      creatorId: 'cr1',
      type: CREATOR_CONTENT_TYPES.VIDEO,
      title: 'Test',
      description: null,
      language: null,
      durationSeconds: 10.042,
      publishedAt: null,
      visibility: 'public',
      thumbnail: null,
      mediaUrl: 'https://example.com/v.mp4',
      status: CREATOR_CONTENT_STATUS.DRAFT,
      views: 0,
      likes: 0,
      shares: 0,
      bookmarks: 0,
      runtimeMissionId: 'm1',
      sourceType: 'creator_studio',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const { returnCreatorContentToDraft } = await import('../creatorContentService.js');
    const content = await returnCreatorContentToDraft('c1', { missionId: 'm1' });
    expect(content.status).toBe(CREATOR_CONTENT_STATUS.DRAFT);
  });

  it('publish is idempotent when already published', async () => {
    const publishedAt = new Date('2026-01-01T00:00:00.000Z');
    mockPrisma.creatorContent.findUnique.mockResolvedValue({
      id: 'c1',
      creatorId: 'cr1',
      type: CREATOR_CONTENT_TYPES.VIDEO,
      title: 'Test',
      description: null,
      language: null,
      durationSeconds: 10.042,
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
      { type: CREATOR_CONTENT_TYPES.VIDEO, durationSeconds: 10.042 },
    ]);
    mockPrisma.creator.update.mockResolvedValue({ id: 'cr1' });

    const { publishCreatorContentRecord } = await import('../creatorContentService.js');
    const result = await publishCreatorContentRecord('c1', {});
    expect(result.alreadyPublished).toBe(true);
    expect(mockPrisma.creatorContent.update).not.toHaveBeenCalled();
    expect(result.progress.totalPublishedSeconds).toBeCloseTo(10.042, 3);
  });

  it('rejects video draft without trusted duration', async () => {
    const { createCreatorContentDraft } = await import('../creatorContentService.js');
    await expect(
      createCreatorContentDraft(
        {
          creatorId: 'cr1',
          type: CREATOR_CONTENT_TYPES.VIDEO,
          title: 'Clip',
          mediaUrl: 'https://example.com/v.mp4',
        },
        {},
      ),
    ).rejects.toMatchObject({ code: 'MISSING_TRUSTED_DURATION' });
  });
});
