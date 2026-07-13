/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import {
  applyCanonicalLoyaltyDraftFields,
  resolveDraftStampThreshold,
} from '../loyaltyProgramDraft.js';

describe('applyCanonicalLoyaltyDraftFields', () => {
  it('prefers owner stampThreshold over OCR requiredStamps on draft', () => {
    const draft = applyCanonicalLoyaltyDraftFields(
      { reward: 'Free coffee', requiredStamps: 5, programName: 'abc Rewards' },
      { reward: 'Free coffee', stampThreshold: 6, requiredStamps: 6 },
    );
    expect(resolveDraftStampThreshold(draft)).toBe(6);
    expect(draft.requiredStamps).toBe(6);
    expect(draft.stampThreshold).toBe(6);
  });

  it('reads stampThreshold from preseeded attachment seed', () => {
    const draft = applyCanonicalLoyaltyDraftFields(
      { reward: 'Free coffee' },
      { stampThreshold: 8 },
    );
    expect(draft.requiredStamps).toBe(8);
  });

  it('preserves structured rule and topology from seed over legacy stamps', () => {
    const rule = {
      programType: 'STAMP_CARD',
      purchaseItem: 'Coffee',
      purchasesRequired: 7,
      rewardQuantity: 1,
      rewardItem: 'free coffee',
      repeatMode: 'INDEFINITE',
    };
    const cardTopology = {
      source: 'VISION_EXTRACTED',
      rows: 4,
      columns: 8,
      cells: [{ row: 0, column: 0, role: 'PURCHASE' }],
      reviewRequired: true,
    };
    const draft = applyCanonicalLoyaltyDraftFields(
      { reward: 'old reward', stampThreshold: 20, requiredStamps: 20 },
      { rule, cardTopology, topologyReviewRequired: true, layoutSource: 'VISION_EXTRACTED' },
    );
    expect(draft.rule).toEqual(rule);
    expect(draft.cardTopology).toEqual(cardTopology);
    expect(draft.topologyReviewRequired).toBe(true);
    expect(resolveDraftStampThreshold(draft)).toBe(7);
    expect(draft.stampThreshold).toBe(7);
    expect(draft.rewardRule).toContain('7');
    expect(draft.rewardRule).not.toContain('Buy 20');
  });
});
