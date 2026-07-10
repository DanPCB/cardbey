/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import { executeInferRequirements, listMissingOwnerFields } from '../loyaltyStageHandlers.js';
import { computeMissingFields } from '../../../mission/topologyExecutionDraft.js';

describe('loyalty infer_requirements after owner input', () => {
  it('does not re-ask when attachmentAnalysis still lists missing fields but owner answered', async () => {
    const result = await executeInferRequirements(
      {
        storeId: 'store_1',
        storeContext: {
          storeId: 'store_1',
          storeName: 'Demo Café',
          businessCategory: 'Cafe',
        },
        executionDraft: {
          reward: 'Free coffee',
          stampThreshold: 6,
          requiredStamps: 6,
        },
        ownerInput: {
          reward: 'Free coffee',
          stampThreshold: 6,
        },
        attachmentAnalysis: {
          artifactType: 'loyalty_card',
          // Stale OCR/vision miss — must not force needs_input after owner reply.
          missingFields: ['reward', 'requiredStamps', 'stampThreshold'],
          preseededDraft: {},
        },
      },
      { storeId: 'store_1', goal: 'create loyalty campaign from this card' },
    );

    expect(result.status).toBe('ok');
    expect(result.output.loyaltyRequirements.reward).toBe('Free coffee');
    expect(result.output.loyaltyRequirements.stampThreshold).toBe(6);
    expect(result.output.missingFields).toEqual([]);
  });

  it('still needs_input when seed and owner lack reward', async () => {
    const result = await executeInferRequirements(
      {
        storeId: 'store_1',
        storeContext: { storeId: 'store_1', storeName: 'Demo' },
        attachmentAnalysis: {
          artifactType: 'loyalty_card',
          missingFields: ['reward', 'stampThreshold'],
        },
      },
      { storeId: 'store_1' },
    );

    expect(result.status).toBe('needs_input');
    expect(result.missingFields).toEqual(expect.arrayContaining(['reward', 'stampThreshold']));
  });

  it('listMissingOwnerFields treats owned stampThreshold as satisfied', () => {
    expect(
      listMissingOwnerFields({
        reward: 'Free coffee',
        stampThreshold: 6,
      }),
    ).toEqual([]);
  });
});
