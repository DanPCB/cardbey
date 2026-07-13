/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import { computeTopologyHash } from '../topologyHash.js';

describe('computeTopologyHash', () => {
  const structural = {
    rows: 3,
    columns: 8,
    cells: [
      { row: 0, column: 0, role: 'PURCHASE' },
      { row: 0, column: 7, role: 'REWARD' },
    ],
    cycles: [{ purchasesRequired: 7, rewardLabel: 'Free' }],
  };

  it('ignores lifecycle source when hashing structural topology', () => {
    const inferred = { ...structural, source: 'VISION_EXTRACTED' };
    const approved = { ...structural, source: 'APPROVED' };
    expect(computeTopologyHash(inferred)).toBe(computeTopologyHash(approved));
  });

  it('changes when grid structure changes', () => {
    const a = computeTopologyHash(structural);
    const b = computeTopologyHash({ ...structural, rows: 2 });
    expect(a).not.toBe(b);
  });
});
