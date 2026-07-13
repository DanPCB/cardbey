import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockUpdate = vi.fn();
const mockFindUnique = vi.fn();
const mockCreate = vi.fn();
const mockFindMany = vi.fn();
const mockGroupBy = vi.fn();
const mockCount = vi.fn();

vi.mock('../../prisma.js', () => ({
  getPrismaClient: () => ({
    creatorContent: {
      findUnique: mockFindUnique,
      update: mockUpdate,
      findMany: mockFindMany,
      count: mockCount,
      groupBy: mockGroupBy,
    },
    creatorClassification: { create: mockCreate, findMany: vi.fn(), findFirst: vi.fn() },
    creatorPublishingEvent: { create: vi.fn() },
    creatorPublishingDecision: { create: vi.fn() },
  }),
}));

vi.mock('../creatorContentService.js', () => ({
  publishCreatorContentRecord: vi.fn().mockResolvedValue({
    content: { contentId: 'c1', status: 'published', creatorId: 'cr1', type: 'VIDEO' },
    progress: { totalPublishedSeconds: 120, totalPublishedMinutes: 2, isQualified: false },
    alreadyPublished: false,
  }),
}));

describe('creatorPublishingTypes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects draft to published transition', async () => {
    const { canTransitionPublishingStatus } = await import('../publishing/creatorPublishingTypes.js');
    expect(canTransitionPublishingStatus('draft', 'published')).toBe(false);
  });

  it('allows draft to owner_review', async () => {
    const { canTransitionPublishingStatus } = await import('../publishing/creatorPublishingTypes.js');
    expect(canTransitionPublishingStatus('draft', 'owner_review')).toBe(true);
  });

  it('normalizes failed to rejected', async () => {
    const { normalizePublishingStatus } = await import('../publishing/creatorPublishingTypes.js');
    expect(normalizePublishingStatus('failed')).toBe('rejected');
  });
});

describe('creatorAutoApprovalPolicy', () => {
  it('keeps auto publish disabled in release one', async () => {
    const { evaluateAutoApprovalEligibility, AUTO_PUBLISH_ENABLED } = await import(
      '../publishing/creatorAutoApprovalPolicy.js'
    );
    expect(AUTO_PUBLISH_ENABLED).toBe(false);
    const evalResult = evaluateAutoApprovalEligibility({
      resultJson: {
        confidence: 0.99,
        risk: { overall: 'LOW', copyright: 0.1 },
        creatorContext: { trustScore: 0.9 },
      },
      confidence: 0.99,
    });
    expect(evalResult.autoPublishEnabled).toBe(false);
    expect(evalResult.wouldQualifyForFutureAutoApproval).toBe(true);
  });
});
