/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import {
  buildMatrixStampCardTopology,
  enrichLoyaltyDraftWithMatrixTopology,
  formatStampMatrixSpec,
  parseStampMatrixSpec,
} from '../loyaltyMatrixTopology.js';
import { inferRuleFromTopology } from '../loyaltyRuleInference.js';

describe('loyaltyMatrixTopology', () => {
  it('parses explicit matrix specs', () => {
    expect(parseStampMatrixSpec('4x(7+1)')).toEqual({
      rows: 4,
      purchasesPerRow: 7,
      freePerRow: 1,
      source: 'MATRIX_SPEC',
    });
    expect(parseStampMatrixSpec('rows=4 purchases=7 rewards=1')).toEqual({
      rows: 4,
      purchasesPerRow: 7,
      freePerRow: 1,
      source: 'MATRIX_SPEC',
    });
    expect(parseStampMatrixSpec('4 rows, 7 purchases + 1 reward')).toEqual({
      rows: 4,
      purchasesPerRow: 7,
      freePerRow: 1,
      source: 'MATRIX_SPEC',
    });
    expect(parseStampMatrixSpec('4x8')).toEqual({
      rows: 4,
      purchasesPerRow: 7,
      freePerRow: 1,
      source: 'MATRIX_SPEC',
    });
    expect(parseStampMatrixSpec('4x5+1free')).toBeNull();
  });

  it('builds 4x(7+1) matrix with 32 cells and 4 row cycles', () => {
    const topology = buildMatrixStampCardTopology({
      rows: 4,
      purchasesPerRow: 7,
      freePerRow: 1,
      source: 'MATRIX_SPEC',
    });
    expect(topology.rows).toBe(4);
    expect(topology.columns).toBe(8);
    expect(topology.cells).toHaveLength(32);
    expect(topology.cells.filter((c) => c.role === 'PURCHASE')).toHaveLength(28);
    expect(topology.cells.filter((c) => c.role === 'REWARD')).toHaveLength(4);

    const rule = inferRuleFromTopology(topology, {
      purchaseItem: 'Coffee',
      rewardItem: 'Free coffee',
    });
    expect(rule?.purchasesRequired).toBe(7);
    expect(rule?.fixedCardCycles).toBe(4);
    expect(formatStampMatrixSpec({ rows: 4, purchasesPerRow: 7, freePerRow: 1 })).toBe('4x(7+1)');
  });

  it('enriches draft from matrix spec in user message', () => {
    const enriched = enrichLoyaltyDraftWithMatrixTopology(
      { reward: 'Free coffee', requiredStamps: 20 },
      { userMessage: 'Please use 4x(7+1) for this card' },
    );
    expect(enriched.cardTopology?.rows).toBe(4);
    expect(enriched.cardTopology?.columns).toBe(8);
    expect(enriched.rule?.purchasesRequired).toBe(7);
    expect(enriched.requiredStamps).toBe(7);
    expect(enriched.stampMatrix).toBe('4x(7+1)');
  });
});
