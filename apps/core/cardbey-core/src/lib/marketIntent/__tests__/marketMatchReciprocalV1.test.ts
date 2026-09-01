import { describe, expect, it } from 'vitest';
import { evaluateReciprocalMatchPair } from '../evaluateReciprocalMatch.js';
import { computeDirectedOverlaps } from '../wantHasCompatibility.js';
import {
  MATCH_PAIR_COHORT,
  CRITICAL_MATCH_PAIRS,
  ANCHOR_PAINT,
} from './fixtures/matchPairCohort.js';
import { buildGraphNodeFromSpec } from './matchTestHelpers.js';
import type { ReciprocalBand } from '../marketMatchTypes.js';

function bandMatches(actual: ReciprocalBand, expected: ReciprocalBand, acceptable?: ReciprocalBand[]): boolean {
  if (actual === expected) return true;
  return acceptable?.includes(actual) ?? false;
}

describe('marketMatchReciprocalV1', () => {
  it('computes directed overlap A.WANTS ∩ B.HAS', () => {
    const paint = buildGraphNodeFromSpec(ANCHOR_PAINT);
    const retailer = buildGraphNodeFromSpec({
      kind: 'demand',
      signalId: 'demand-005',
      label: 'Paint retailer',
    });

    const aFromB = computeDirectedOverlaps(paint.has, paint.wants, retailer.has);
    const bFromA = computeDirectedOverlaps(retailer.has, retailer.wants, paint.has);

    expect(aFromB.length).toBeGreaterThan(0);
    expect(bFromA.length).toBeGreaterThan(0);
    expect(bFromA.some((o) => o.strength === 'STRONG')).toBe(true);
  });

  it('returns explainable MarketMatch without probability fields', () => {
    const paint = buildGraphNodeFromSpec(ANCHOR_PAINT);
    const retailer = buildGraphNodeFromSpec({
      kind: 'demand',
      signalId: 'demand-005',
      label: 'Paint retailer',
    });
    const match = evaluateReciprocalMatchPair(paint, retailer);

    expect(match.reciprocalBand).toBe('STRONG_RECIPROCAL');
    expect(match.matchReasons.length).toBeGreaterThan(0);
    expect(match.unknowns.length).toBeGreaterThan(0);
    expect(match.matcherVersion).toMatch(/market-match-reciprocal/);
    expect(match).not.toHaveProperty('matchProbability');
    expect(match).not.toHaveProperty('conversionScore');
  });

  it('does not invert buyer/seller in match reasons for paint ↔ retailer', () => {
    const paint = buildGraphNodeFromSpec(ANCHOR_PAINT);
    const retailer = buildGraphNodeFromSpec({
      kind: 'demand',
      signalId: 'demand-005',
      label: 'Paint retailer',
    });
    const match = evaluateReciprocalMatchPair(paint, retailer);
    const reasons = match.matchReasons.join(' ').toLowerCase();

    expect(reasons).toMatch(/b wants.*a has|supplier|paint/);
    expect(reasons).toMatch(/a wants.*b has|distributor|retail/);
  });

  describe('match pair cohort', () => {
    const results = MATCH_PAIR_COHORT.map((pairCase) => {
      const nodeA = buildGraphNodeFromSpec(pairCase.nodeA);
      const nodeB = buildGraphNodeFromSpec(pairCase.nodeB);
      const match = evaluateReciprocalMatchPair(nodeA, nodeB);
      const ok = bandMatches(match.reciprocalBand, pairCase.expectedBand, pairCase.acceptableBands);
      return { pairCase, match, ok };
    });

    it.each(MATCH_PAIR_COHORT.map((p) => [p.pairId, p.expectedBand] as const))(
      '%s expects band %s',
      (pairId, expectedBand) => {
        const row = results.find((r) => r.pairCase.pairId === pairId)!;
        expect(
          row.ok,
          `got ${row.match.reciprocalBand} — reasons: ${row.match.matchReasons.join('; ')}; conflicts: ${row.match.conflicts.join('; ')}`,
        ).toBe(true);
        expect(row.match.reciprocalBand).toBeDefined();
        if (row.pairCase.critical) {
          expect(['STRONG_RECIPROCAL', 'ONE_WAY_STRONG', 'POSSIBLE', 'INSUFFICIENT_EVIDENCE', 'CONTRADICTED']).toContain(
            row.match.reciprocalBand,
          );
        }
        void expectedBand;
      },
    );

    it('has zero false STRONG_RECIPROCAL on negative critical pairs', () => {
      const negatives = CRITICAL_MATCH_PAIRS.filter((p) =>
        ['INSUFFICIENT_EVIDENCE', 'CONTRADICTED'].includes(p.expectedBand),
      );
      for (const pairCase of negatives) {
        const row = results.find((r) => r.pairCase.pairId === pairCase.pairId)!;
        expect(row.match.reciprocalBand).not.toBe('STRONG_RECIPROCAL');
      }
    });

    it('meets ≥90% critical pair band accuracy', () => {
      const criticalResults = results.filter((r) => r.pairCase.critical);
      const hits = criticalResults.filter((r) => r.ok).length;
      const accuracy = hits / criticalResults.length;
      expect(accuracy).toBeGreaterThanOrEqual(0.9);
    });
  });
});
