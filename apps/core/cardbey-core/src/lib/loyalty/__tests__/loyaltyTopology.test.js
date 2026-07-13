import { describe, expect, it } from 'vitest';
import { buildLoyaltyCardTopologyFromDetected } from '../loyaltyTopologyBuild.js';
import { inferRuleFromTopology } from '../loyaltyRuleInference.js';
import { validateLoyaltyCardTopology } from '../loyaltyTopologyValidation.js';

/** Fixture A — 4×8 coffee card with 7+1 row pattern */
function coffeeCardDetectedFixture() {
  const cells = [];
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 8; col++) {
      cells.push({
        row,
        column: col,
        role: col < 7 ? 'PURCHASE' : 'REWARD',
        text: col < 7 ? 'Coffee' : 'Free',
        confidence: 0.95,
      });
    }
  }
  return {
    rows: 4,
    columns: 8,
    cells,
    repeatedPattern: {
      direction: 'ROW',
      roles: [...Array(7).fill('PURCHASE'), 'REWARD'],
      repetitions: 4,
      confidence: 0.95,
    },
    footerText: 'Catering Available',
    overallConfidence: 0.95,
  };
}

/** Fixture B — simple 1×10 card */
function simpleOneRowFixture() {
  const cells = [];
  for (let col = 0; col < 10; col++) {
    cells.push({
      row: 0,
      column: col,
      role: col < 9 ? 'PURCHASE' : 'REWARD',
      confidence: 0.9,
    });
  }
  return {
    rows: 1,
    columns: 10,
    cells,
    overallConfidence: 0.9,
  };
}

describe('loyalty card topology', () => {
  it('Fixture A — coffee card 4×8 with 7+1 rows', () => {
    const topology = buildLoyaltyCardTopologyFromDetected(coffeeCardDetectedFixture());
    expect(topology).toBeTruthy();
    expect(topology.rows).toBe(4);
    expect(topology.columns).toBe(8);
    expect(topology.cells.filter((c) => c.role === 'PURCHASE')).toHaveLength(28);
    expect(topology.cells.filter((c) => c.role === 'REWARD')).toHaveLength(4);
    expect(topology.footerText).toBe('Catering Available');
    expect(topology.cycles).toHaveLength(4);
    for (const cycle of topology.cycles) {
      expect(cycle.purchaseCellCount).toBe(7);
      expect(cycle.rewardCellIndexes).toEqual([7]);
    }

    const rule = inferRuleFromTopology(topology, {
      purchaseItem: 'Coffee',
      rewardItem: 'Free Coffee',
    });
    expect(rule?.purchasesRequired).toBe(7);
    expect(rule?.rewardQuantity).toBe(1);
    expect(rule?.purchasesRequired).not.toBe(10);
    expect(rule?.purchasesRequired).not.toBe(28);
    expect(rule?.rewardItem).toBe('Free Coffee');

    const validation = validateLoyaltyCardTopology(topology);
    expect(validation.valid).toBe(true);
  });

  it('Fixture B — simple 1×10 threshold 9', () => {
    const topology = buildLoyaltyCardTopologyFromDetected(simpleOneRowFixture());
    const rule = inferRuleFromTopology(topology);
    expect(rule?.purchasesRequired).toBe(9);
    expect(topology.rows).toBe(1);
    expect(topology.columns).toBe(10);
  });

  it('Fixture C — uncertain grid requires review', () => {
    const topology = buildLoyaltyCardTopologyFromDetected({
      rows: 2,
      columns: 3,
      cells: [
        { row: 0, column: 0, role: 'PURCHASE', confidence: 0.4 },
        { row: 0, column: 1, role: 'UNKNOWN', confidence: 0.3 },
        { row: 1, column: 0, role: 'REWARD', confidence: 0.5 },
      ],
      overallConfidence: 0.45,
    });
    expect(topology.reviewRequired).toBe(true);
    const validation = validateLoyaltyCardTopology(topology);
    expect(validation.valid).toBe(false);
  });

  it('rejects duplicate cell coordinates', () => {
    const topology = buildLoyaltyCardTopologyFromDetected({
      rows: 1,
      columns: 2,
      cells: [
        { row: 0, column: 0, role: 'PURCHASE', confidence: 0.9 },
        { row: 0, column: 0, role: 'REWARD', confidence: 0.9 },
      ],
      overallConfidence: 0.9,
    });
    const validation = validateLoyaltyCardTopology(topology);
    expect(validation.valid).toBe(false);
    expect(validation.errors.some((e) => e.startsWith('duplicate_cell'))).toBe(true);
  });
});
