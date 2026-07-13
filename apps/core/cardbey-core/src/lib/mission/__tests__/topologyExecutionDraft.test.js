/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import {
  buildExecutionDraft,
  computeMissingFields,
  computeLoyaltyPauseFields,
  requiresTopologyOwnerReview,
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

  it('computeMissingFields uses structured rule when legacy stamp fields absent', () => {
    const missing = computeMissingFields({
      rule: {
        programType: 'STAMP_CARD',
        purchaseItem: 'Coffee',
        purchasesRequired: 7,
        rewardQuantity: 1,
        rewardItem: 'Free Coffee',
        repeatMode: 'INDEFINITE',
      },
      cardTopology: { source: 'VISION_EXTRACTED', rows: 4, columns: 8, cells: [{ row: 0, column: 0, role: 'PURCHASE' }] },
    });
    expect(missing).toEqual([]);
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

  it('computeLoyaltyPauseFields requires topology_review for vision-extracted topology', () => {
    const draft = {
      reward: 'free coffee',
      stampThreshold: 7,
      rule: {
        programType: 'STAMP_CARD',
        purchaseItem: 'Coffee',
        purchasesRequired: 7,
        rewardQuantity: 1,
        rewardItem: 'free coffee',
        repeatMode: 'INDEFINITE',
      },
      cardTopology: {
        source: 'VISION_EXTRACTED',
        rows: 4,
        columns: 8,
        reviewRequired: true,
        cells: [{ row: 0, column: 0, role: 'PURCHASE' }],
      },
      topologyReviewRequired: true,
    };
    expect(requiresTopologyOwnerReview(draft)).toBe(true);
    expect(computeLoyaltyPauseFields(draft)).toEqual(['topology_review']);
  });

  it('computeLoyaltyPauseFields requires topology_review for FUSION_VISUAL_OCR topology', () => {
    const draft = {
      reward: 'free coffee',
      stampThreshold: 19,
      rule: {
        programType: 'STAMP_CARD',
        purchaseItem: 'Coffee',
        purchasesRequired: 19,
        rewardQuantity: 1,
        rewardItem: 'free coffee',
        repeatMode: 'INDEFINITE',
      },
      cardTopology: {
        source: 'FUSION_VISUAL_OCR',
        rows: 4,
        columns: 5,
        cells: [{ row: 0, column: 0, role: 'PURCHASE' }],
      },
      extractedFromImage: true,
    };
    expect(requiresTopologyOwnerReview(draft)).toBe(true);
    expect(computeLoyaltyPauseFields(draft)).toEqual(['topology_review']);
  });

  it('buildAndValidateExecutionDraft keeps approved topology when client approve payload still carries vision topology', () => {
    const visionTopology = {
      source: 'VISION_EXTRACTED',
      rows: 4,
      columns: 6,
      reviewRequired: true,
      cells: [{ row: 0, column: 0, role: 'PURCHASE' }],
    };
    const approvedTopology = {
      source: 'APPROVED',
      rows: 4,
      columns: 6,
      reviewRequired: false,
      cells: [{ row: 0, column: 0, role: 'PURCHASE' }],
    };
    const { executionDraft, missingFields } = buildAndValidateExecutionDraft({
      preseededDraft: {
        reward: 'Free',
        stampThreshold: 5,
        cardTopology: approvedTopology,
        layoutSource: 'APPROVED',
        topologyReviewRequired: false,
      },
      ownerInput: {
        topologyAction: 'approve',
        reward: 'Free',
        stampThreshold: 5,
        cardTopology: visionTopology,
        topologyReviewRequired: true,
      },
    });
    expect(executionDraft.cardTopology?.source).toBe('APPROVED');
    expect(missingFields).toEqual([]);
  });

  it('computeLoyaltyPauseFields skips topology_review after owner approval', () => {
    const draft = {
      reward: 'free coffee',
      stampThreshold: 7,
      rule: {
        programType: 'STAMP_CARD',
        purchaseItem: 'Coffee',
        purchasesRequired: 7,
        rewardQuantity: 1,
        rewardItem: 'free coffee',
        repeatMode: 'INDEFINITE',
      },
      cardTopology: {
        source: 'APPROVED',
        rows: 4,
        columns: 8,
        cells: [{ row: 0, column: 0, role: 'PURCHASE' }],
      },
    };
    expect(requiresTopologyOwnerReview(draft)).toBe(false);
    expect(computeLoyaltyPauseFields(draft)).toEqual([]);
  });
});
