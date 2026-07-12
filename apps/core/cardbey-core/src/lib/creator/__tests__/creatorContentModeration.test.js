import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../publishing/creatorPublishingService.js', () => ({
  listCreatorPublishingQueue: vi.fn().mockResolvedValue([
    {
      contentId: 'c1',
      status: 'human_review_required',
      creator: { username: 'alex' },
    },
  ]),
  approveCreatorPublishing: vi.fn().mockResolvedValue({
    content: { contentId: 'c1', status: 'published', creatorId: 'cr1', type: 'VIDEO' },
    progress: {},
  }),
  rejectCreatorPublishing: vi.fn().mockResolvedValue({
    contentId: 'c1',
    status: 'rejected',
    creatorId: 'cr1',
    type: 'VIDEO',
  }),
}));

vi.mock('../../prisma.js', () => ({
  getPrismaClient: () => ({
    creatorContent: {
      count: vi.fn().mockResolvedValue(2),
    },
  }),
}));

describe('creatorContentModerationService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists human review queue via publishing service', async () => {
    const { listCreatorContentPendingModeration } = await import('../creatorContentModerationService.js');
    const items = await listCreatorContentPendingModeration();
    expect(items).toHaveLength(1);
    expect(items[0].creator?.username).toBe('alex');
  });

  it('rejects via publishing service to rejected status', async () => {
    const { rejectCreatorContentModeration } = await import('../creatorContentModerationService.js');
    const content = await rejectCreatorContentModeration('c1', 'Policy issue', { adminUserId: 'admin1' });
    expect(content.status).toBe('rejected');
  });
});
