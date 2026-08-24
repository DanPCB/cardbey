/**
 * @vitest-environment node
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { executeTargetedRepair } from '../targetedRepair.js';
import { shouldSkipResearchReviewCheckpoint } from '../reduceFriction.js';

describe('Mission001 Gate 6 — targeted repair execution', () => {
  const prevMaster = process.env.ENABLE_MISSION_001_STORE_FIDELITY_V1;
  const prevRepair = process.env.ENABLE_MISSION_001_TARGETED_REPAIR_V1;

  beforeEach(() => {
    process.env.ENABLE_MISSION_001_STORE_FIDELITY_V1 = '1';
    process.env.ENABLE_MISSION_001_TARGETED_REPAIR_V1 = '1';
  });

  afterEach(() => {
    if (prevMaster === undefined) delete process.env.ENABLE_MISSION_001_STORE_FIDELITY_V1;
    else process.env.ENABLE_MISSION_001_STORE_FIDELITY_V1 = prevMaster;
    if (prevRepair === undefined) delete process.env.ENABLE_MISSION_001_TARGETED_REPAIR_V1;
    else process.env.ENABLE_MISSION_001_TARGETED_REPAIR_V1 = prevRepair;
  });

  it('strips generic catalog scaffolds during catalog repair', async () => {
    const preview = {
      storeName: 'Anison Capital',
      storeType: 'financial planner',
      items: [
        { name: 'Core Service', contentOrigin: 'category_fallback' },
        { name: 'Wealth Review', contentOrigin: 'sourced', confidence: 0.9 },
      ],
      categories: [],
      website: { sections: [] },
    };
    const result = await executeTargetedRepair(preview, ['catalog'], {});
    expect(result.applied.catalog).toBe(true);
    expect(preview.items.some((it) => it.name === 'Core Service')).toBe(false);
    expect(preview.items.some((it) => it.name === 'Wealth Review')).toBe(true);
  });

  it('removes fabricated social proof during composition repair', async () => {
    const preview = {
      storeName: 'Demo Cafe',
      storeType: 'cafe',
      items: [],
      website: {
        sections: [
          {
            type: 'social_proof',
            content: {
              reviews: [{ text: 'Great', author: 'Alex M.', rating: 5 }],
            },
          },
        ],
      },
    };
    const result = await executeTargetedRepair(preview, ['composition'], { draftInput: {} });
    expect(result.applied.composition).toBe(true);
    expect(preview.website.sections.some((s) => s.type === 'social_proof')).toBe(false);
  });
});

describe('Mission001 Gate 9 — friction reduction', () => {
  const prevMaster = process.env.ENABLE_MISSION_001_STORE_FIDELITY_V1;
  const prevFriction = process.env.ENABLE_MISSION_001_REDUCE_FRICTION_V1;

  beforeEach(() => {
    process.env.ENABLE_MISSION_001_STORE_FIDELITY_V1 = '1';
    process.env.ENABLE_MISSION_001_REDUCE_FRICTION_V1 = '1';
  });

  afterEach(() => {
    if (prevMaster === undefined) delete process.env.ENABLE_MISSION_001_STORE_FIDELITY_V1;
    else process.env.ENABLE_MISSION_001_STORE_FIDELITY_V1 = prevMaster;
    if (prevFriction === undefined) delete process.env.ENABLE_MISSION_001_REDUCE_FRICTION_V1;
    else process.env.ENABLE_MISSION_001_REDUCE_FRICTION_V1 = prevFriction;
  });

  it('skips review checkpoint for confident research', () => {
    expect(
      shouldSkipResearchReviewCheckpoint({
        fromResearch: true,
        research: { researchRan: true, confidence: 0.91, ownerReviewRequired: false },
        mission001: { fidelityScore: { overall: 82 } },
      }),
    ).toBe(true);
  });

  it('does not skip review for sparse name-only intake', () => {
    expect(
      shouldSkipResearchReviewCheckpoint({
        fromResearch: true,
        research: { researchRan: true, confidence: 0.91 },
        mission001: { sparseMode: true },
      }),
    ).toBe(false);
  });
});
