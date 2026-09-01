import { describe, expect, it, beforeEach } from 'vitest';
import { InMemoryMarketGraphRegistry } from '../marketGraphRegistry.js';
import { evaluateReciprocalMatchPair } from '../evaluateReciprocalMatch.js';
import { deriveContextualRole } from '../marketGraphNode.js';
import { buildGraphNodeFromSpec } from './matchTestHelpers.js';
import { ANCHOR_CARDBEY_SEED_AU3M } from './fixtures/matchPairCohort.js';

describe('marketGraphAdmission', () => {
  let registry: InMemoryMarketGraphRegistry;

  beforeEach(() => {
    registry = new InMemoryMarketGraphRegistry();
  });

  it('derives contextual DUAL role for nodes with both HAS and WANTS', () => {
    const startup = buildGraphNodeFromSpec(ANCHOR_CARDBEY_SEED_AU3M);
    expect(startup.contextualRole).toBe('DUAL');
    expect(deriveContextualRole(startup)).toBe('DUAL');
  });

  it('triggers reciprocal search when a new node is admitted', () => {
    const investor = buildGraphNodeFromSpec({
      kind: 'demand',
      signalId: 'demand-022',
      label: 'Angel investor seeking SaaS startups Australia',
    });
    const startup = buildGraphNodeFromSpec(ANCHOR_CARDBEY_SEED_AU3M);

    const first = registry.admit(investor);
    expect(first.matches).toHaveLength(0);

    const second = registry.admit(startup);
    expect(second.matches.length).toBeGreaterThan(0);
    expect(second.matches[0]!.reciprocalBand).not.toBe('CONTRADICTED');
    expect(['STRONG_RECIPROCAL', 'ONE_WAY_STRONG', 'POSSIBLE', 'INSUFFICIENT_EVIDENCE']).toContain(
      second.matches[0]!.reciprocalBand,
    );
    expect(second.matches[0]).not.toHaveProperty('matchProbability');
  });

  it('admitting supply-only then demand-only discovers compatible existing node', () => {
    const paint = buildGraphNodeFromSpec({
      kind: 'anchor',
      nodeId: 'anchor-paint-admit',
      label: 'Paint manufacturer',
      rawText: 'Paint factory seeking distributors nationwide Vietnam.',
      g1Override: {
        classification: 'COMMERCIAL',
        classificationConfidence: 0.9,
        intents: [{ family: 'DISTRIBUTE', confidence: 0.9, basis: 'EXPLICIT', evidence: [] }],
        has: [{ type: 'PRODUCT', label: 'paint', confidence: 0.9, basis: 'EXPLICIT', evidence: [] }],
        wants: [{ type: 'DISTRIBUTOR', label: 'distributors', confidence: 0.9, basis: 'EXPLICIT', evidence: [] }],
      },
    });
    const retailer = buildGraphNodeFromSpec({
      kind: 'demand',
      signalId: 'demand-005',
      label: 'Paint retailer seeking supplier',
    });

    registry.admit(paint);
    const { matches } = registry.admit(retailer);
    expect(matches.some((m) => ['STRONG_RECIPROCAL', 'ONE_WAY_STRONG'].includes(m.reciprocalBand))).toBe(true);
  });

  it('Cardbey A$3M seed regression — evidence-driven, not forced HIGH_FIT', () => {
    const startup = buildGraphNodeFromSpec(ANCHOR_CARDBEY_SEED_AU3M);
    const investor = buildGraphNodeFromSpec({
      kind: 'demand',
      signalId: 'demand-022',
      label: 'Angel investor Australia SaaS',
    });

    const match = evaluateReciprocalMatchPair(startup, investor);
    expect(match.reciprocalBand).not.toBe('CONTRADICTED');
    expect(['STRONG_RECIPROCAL', 'ONE_WAY_STRONG', 'POSSIBLE', 'INSUFFICIENT_EVIDENCE']).toContain(
      match.reciprocalBand,
    );
    expect(match.matchReasons.length).toBeGreaterThan(0);
    expect(match).not.toHaveProperty('conversionScore');
    expect(match).not.toHaveProperty('matchProbability');
  });
});
