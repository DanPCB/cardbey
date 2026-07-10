/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import {
  buildExecutionDraft,
  computeMissingFields,
  assertNoStaleMissingFields,
  buildAndValidateExecutionDraft,
  attachmentAnalysisAsEvidence,
} from '../topologyExecutionDraft.js';

describe('topologyExecutionDraft', () => {
  it('computeMissingFields is empty after owner merge despite stale attachment missingFields', () => {
    const { executionDraft, missingFields } = buildAndValidateExecutionDraft({
      attachmentAnalysis: {
        artifactType: 'loyalty_card',
        missingFields: ['reward', 'stampThreshold'],
        preseededDraft: {},
      },
      ownerInput: { reward: 'Free coffee', stampThreshold: 6 },
    });
    expect(executionDraft.reward).toBe('Free coffee');
    expect(executionDraft.stampThreshold).toBe(6);
    expect(missingFields).toEqual([]);
  });

  it('throws STALE_MISSING_FIELDS when draft has reward but missing lists reward', () => {
    expect(() =>
      assertNoStaleMissingFields({ reward: 'Free coffee', stampThreshold: 6 }, ['reward']),
    ).toThrow(/STALE_MISSING_FIELDS/);
  });

  it('attachmentAnalysisAsEvidence strips missingFields', () => {
    const evidence = attachmentAnalysisAsEvidence({
      artifactType: 'loyalty_card',
      missingFields: ['reward'],
      ocrText: 'stamp card',
    });
    expect(evidence?.missingFields).toBeUndefined();
    expect(evidence?.artifactType).toBe('loyalty_card');
  });

  it('buildExecutionDraft layers attachment seed, preseeded, owner, runtime', () => {
    const draft = buildExecutionDraft({
      attachmentAnalysis: { preseededDraft: { programName: 'Card rewards' } },
      preseededDraft: { requiredStamps: 8 },
      ownerInput: { reward: 'Free coffee', stampThreshold: 6 },
      runtimeUpdates: { storeId: 'store_1' },
    });
    expect(draft.reward).toBe('Free coffee');
    expect(draft.stampThreshold).toBe(6);
    expect(draft.programName).toBe('Card rewards');
    expect(draft.storeId).toBe('store_1');
  });
});
