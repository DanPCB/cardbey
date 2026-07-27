/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const findUniqueMock = vi.fn();
const upsertMock = vi.fn();
const findManyMock = vi.fn();
const updateMock = vi.fn();

vi.mock('../../prisma.js', () => ({
  getPrismaClient: () => ({
    patternWeight: {
      findUnique: findUniqueMock,
      upsert: upsertMock,
    },
    selfHealingProposal: {
      findMany: findManyMock,
      update: updateMock,
    },
  }),
}));

import { AdaptiveWeightService } from '../adaptiveWeights.js';

describe('AdaptiveWeightService', () => {
  beforeEach(() => {
    AdaptiveWeightService.resetCacheForTests();
    findUniqueMock.mockReset();
    upsertMock.mockReset();
    findManyMock.mockReset();
    updateMock.mockReset();
    findUniqueMock.mockResolvedValue(null);
  });

  it('returns default weight when no record exists', async () => {
    const svc = AdaptiveWeightService.getInstance();
    const weight = await svc.getWeight('create_promotion:create_promotion');
    expect(weight).toBe(1.0);
  });

  it('adjustWeight clamps and persists', async () => {
    findUniqueMock.mockResolvedValue(null);
    upsertMock.mockResolvedValue({ weight: 0.7 });

    const svc = AdaptiveWeightService.getInstance();
    const newWeight = await svc.adjustWeight(
      'create_promotion:create_promotion',
      -0.3,
      'test adjustment',
    );

    expect(newWeight).toBe(0.7);
    expect(upsertMock).toHaveBeenCalled();
  });

  it('batchAdjustFromProposals applies approved proposals', async () => {
    findManyMock.mockResolvedValue([
      {
        id: 'prop-1',
        suggestedFix: { intent: 'store.edit', currentSkill: 'analyze_store', adjustment: -0.2 },
        metadata: {},
      },
    ]);
    findUniqueMock.mockResolvedValue(null);
    upsertMock.mockResolvedValue({});
    updateMock.mockResolvedValue({});

    const svc = AdaptiveWeightService.getInstance();
    const result = await svc.batchAdjustFromProposals();
    expect(result.applied).toBe(1);
    expect(updateMock).toHaveBeenCalled();
  });
});
