import { describe, it, expect } from 'vitest';
import {
  getStoreResearchPublishBlockReason,
  resolveMissionIdFromDraftInput,
} from '../storeResearchPublishGate.js';

describe('storeResearchPublishGate', () => {
  it('resolves mission id from draft input or generationRunId', () => {
    expect(resolveMissionIdFromDraftInput({ missionId: 'm-1' })).toBe('m-1');
    expect(resolveMissionIdFromDraftInput({ generationRunId: 'run-1' })).toBe('run-1');
    expect(resolveMissionIdFromDraftInput({})).toBeNull();
  });

  it('blocks publish when owner review is required and not confirmed', async () => {
    const prisma = {
      mission: {
        findUnique: async () => ({
          context: {
            storeCreationResearch: {
              ownerReviewRequired: true,
              ownerConfirmed: false,
              extractedServices: [{ name: 'Sourdough', price: 9.5 }],
            },
          },
        }),
      },
    };
    const result = await getStoreResearchPublishBlockReason(prisma, {
      generationRunId: 'mission-abc',
      input: { generationRunId: 'mission-abc' },
    });
    expect(result.blocked).toBe(true);
    expect(result.reason).toBe('store_research_owner_review_required');
  });

  it('allows publish after owner confirmation', async () => {
    const prisma = {
      mission: {
        findUnique: async () => ({
          context: {
            storeCreationResearch: {
              ownerReviewRequired: true,
              ownerConfirmed: true,
            },
          },
        }),
      },
    };
    const result = await getStoreResearchPublishBlockReason(prisma, {
      input: { missionId: 'mission-abc' },
    });
    expect(result.blocked).toBe(false);
  });
});
