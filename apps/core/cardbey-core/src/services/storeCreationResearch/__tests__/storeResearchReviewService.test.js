// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../realtime/simpleSse.js', () => ({
  broadcastMissionArtifact: vi.fn(),
}));

describe('storeResearchReviewService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('applyStoreResearchReviewDecision accepts services and marks ownerConfirmed', async () => {
    const missionId = 'mission-review-1';
    let savedContext = {
      storeCreationResearch: {
        ownerReviewRequired: true,
        ownerConfirmed: false,
        extractedServices: [{ id: 'svc_0', name: 'Haircut', price: 45 }],
      },
      draftId: 'draft-1',
    };

    const prisma = {
      mission: {
        findUnique: vi.fn(async () => ({ context: savedContext })),
        update: vi.fn(async ({ data }) => {
          savedContext = data.context;
          return { id: missionId };
        }),
      },
      draftStore: {
        findUnique: vi.fn(async () => ({
          preview: { storeName: 'Glamshell' },
          input: { businessName: 'Glamshell', businessType: 'salon' },
        })),
        update: vi.fn(async () => ({ id: 'draft-1' })),
      },
    };

    const { applyStoreResearchReviewDecision } = await import('../storeResearchReviewService.js');
    const result = await applyStoreResearchReviewDecision({
      missionId,
      action: 'accept',
      services: [{ id: 'svc_0', name: 'Haircut', price: 50 }],
      prisma,
    });

    expect(result.ok).toBe(true);
    expect(result.accepted).toBe(true);
    expect(savedContext.storeCreationResearch.ownerConfirmed).toBe(true);
    expect(savedContext.storeCreationResearch.reviewStatus).toBe('accepted');
    expect(savedContext.preloadedCatalogItems?.[0]?.price).toBe(50);
    expect(prisma.draftStore.update).toHaveBeenCalled();
  });

  it('applyStoreResearchReviewDecision reject_fallback rebuilds AI starter catalog', async () => {
    const missionId = 'mission-review-reject-1';
    let savedContext = {
      storeCreationResearch: {
        ownerReviewRequired: true,
        ownerConfirmed: false,
        extractedServices: [
          { id: 'svc_0', name: 'Florist Melbourne CBD, Same Day Flower Delivery', price: 5557 },
        ],
      },
      draftId: 'draft-flower-1',
    };
    let savedPreview = {
      storeName: 'Melbourne Flower',
      storeType: 'Florist',
      items: [{ id: 'bad', name: 'Florist Melbourne CBD', executionAction: 'book', price: 5557 }],
      meta: { catalogSource: 'research' },
    };

    const prisma = {
      mission: {
        findUnique: vi.fn(async () => ({ context: savedContext })),
        update: vi.fn(async ({ data }) => {
          savedContext = data.context;
          return { id: missionId };
        }),
      },
      draftStore: {
        findUnique: vi.fn(async () => ({
          preview: savedPreview,
          input: { businessName: 'Melbourne Flower', businessType: 'Other', category: 'Other' },
        })),
        update: vi.fn(async ({ data }) => {
          if (data.preview) savedPreview = data.preview;
          return { id: 'draft-flower-1' };
        }),
      },
    };

    const { applyStoreResearchReviewDecision } = await import('../storeResearchReviewService.js');
    const result = await applyStoreResearchReviewDecision({
      missionId,
      action: 'reject_fallback',
      prisma,
    });

    expect(result.ok).toBe(true);
    expect(result.rejected).toBe(true);
    expect(result.rebuiltWithAiStarter).toBe(true);
    expect(savedPreview.meta?.catalogSource).toBe('ai_generated_starter');
    expect(savedPreview.items?.length).toBeGreaterThan(0);
    expect(savedPreview.items.every((i) => i.executionAction !== 'book')).toBe(true);
    expect(savedPreview.items.some((i) => /Florist Melbourne CBD/i.test(String(i.name)))).toBe(false);
    expect(savedPreview.storeName).toBe('Melbourne Flower');
  });
});
