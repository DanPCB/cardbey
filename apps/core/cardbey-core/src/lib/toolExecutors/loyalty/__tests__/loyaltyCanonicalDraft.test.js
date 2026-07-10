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
});
