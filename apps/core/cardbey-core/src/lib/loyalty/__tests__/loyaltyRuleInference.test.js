/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import { inferRuleFromTopology } from '../loyaltyRuleInference.js';
import { buildLoyaltyCardTopologyFromDetected } from '../loyaltyTopologyBuild.js';

function fourByEightCoffeeFixture() {
  const cells = [];
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 8; col++) {
      cells.push({
        row,
        column: col,
        role: col < 7 ? 'PURCHASE' : 'REWARD',
        text: col < 7 ? 'Coffee' : 'Free',
      });
    }
  }
  return buildLoyaltyCardTopologyFromDetected(
    {
      rows: 4,
      columns: 8,
      cells,
      repeatedPattern: {
        direction: 'ROW',
        roles: [...Array(7).fill('PURCHASE'), 'REWARD'],
        repetitions: 4,
      },
    },
    { source: 'VISION_EXTRACTED' },
  );
}

describe('loyaltyRuleInference — repeated row consistency', () => {
  it('uses purchases before reward per row (7), not total rewards or purchase cells', () => {
    const topology = fourByEightCoffeeFixture();
    const rule = inferRuleFromTopology(topology, {
      purchaseItem: 'Coffee',
      rewardItem: 'Free Coffee',
    });
    expect(rule?.purchasesRequired).toBe(7);
    expect(rule?.purchasesRequired).not.toBe(1);
    expect(rule?.fixedCardCycles).toBe(4);
  });

  it('flags review when repeated rows disagree', () => {
    const cells = [];
    for (let row = 0; row < 3; row++) {
      const purchasesInRow = row === 0 ? 7 : 5;
      for (let col = 0; col < purchasesInRow; col++) {
        cells.push({ row, column: col, role: 'PURCHASE' });
      }
      cells.push({ row, column: purchasesInRow, role: 'REWARD' });
    }
    const topology = buildLoyaltyCardTopologyFromDetected(
      { rows: 3, columns: 8, cells },
      { source: 'VISION_EXTRACTED' },
    );
    const rule = inferRuleFromTopology(topology);
    expect(rule?.reviewRequired).toBe(true);
    expect(rule?.purchasesRequired).toBeGreaterThan(1);
  });
});
