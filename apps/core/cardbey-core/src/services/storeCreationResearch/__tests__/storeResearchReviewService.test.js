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

  it('buildStoreResearchReviewArtifactPayload includes extracted services', async () => {
    const { buildStoreResearchReviewArtifactPayload } = await import('../storeResearchReviewService.js');
    const payload = buildStoreResearchReviewArtifactPayload(
      'm1',
      {
        ownerReviewRequired: true,
        confidence: 0.82,
        sourcesUsed: [{ sourceType: 'official_website', sourceUrl: 'https://example.com' }],
        extractedServices: [{ id: 'svc_0', name: 'Tiling quote', price: null }],
      },
      { draftId: 'd1' },
    );
    expect(payload.extractedServices).toHaveLength(1);
    expect(payload.draftId).toBe('d1');
  });
});
