/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import {
  loyaltyTopologyNeedsOcrReconcile,
  ocrTopologyDisagreesWithCard,
  tryReconcileLoyaltyFromOcr,
} from '../loyaltyTopologyOcrReconcile.js';
import { buildLoyaltyCardTopologyFromDetected } from '../loyaltyTopologyBuild.js';

function coffeeCardOcrText() {
  return [
    ...Array.from({ length: 28 }, () => 'Coffee'),
    ...Array.from({ length: 4 }, () => 'Free'),
    'Catering Available',
  ].join('\n');
}

describe('loyaltyTopologyOcrReconcile', () => {
  it('detects disagreement between OCR 4x8 and cached 2x5', () => {
    const wrong = buildLoyaltyCardTopologyFromDetected(
      {
        rows: 2,
        columns: 5,
        cells: Array.from({ length: 10 }, (_, i) => ({
          row: Math.floor(i / 5),
          column: i % 5,
          role: i % 5 === 4 ? 'REWARD' : 'PURCHASE',
        })),
        overallConfidence: 0.8,
      },
      { source: 'VISION_EXTRACTED' },
    );
    expect(ocrTopologyDisagreesWithCard(coffeeCardOcrText(), wrong)).toBe(true);
    expect(loyaltyTopologyNeedsOcrReconcile(wrong, coffeeCardOcrText())).toBe(true);
  });

  it('reconciles stale 2x5 draft to OCR 4x8 with 7 purchases per row', () => {
    const reconciled = tryReconcileLoyaltyFromOcr(coffeeCardOcrText(), {
      requiredStamps: 8,
      reward: "I'm sorry, I can't assist with that.",
    });
    expect(reconciled?.preseededDraft?.cardTopology?.rows).toBe(4);
    expect(reconciled?.preseededDraft?.cardTopology?.columns).toBe(8);
    expect(reconciled?.preseededDraft?.rule?.purchasesRequired).toBe(7);
    expect(reconciled?.preseededDraft?.reward).not.toMatch(/can't assist/i);
  });
});
