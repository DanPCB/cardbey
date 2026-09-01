import { describe, expect, it, beforeEach } from 'vitest';
import { buildExecutiveMarketOpportunitiesProjection } from '../marketOpportunitiesExecutiveProjection.js';
import { launchpadPersistentMarketGraph } from '../capital/persistentMarketGraphStore.js';
import { buildCardbeySeed2026MarketGraphNode } from '../capital/cardbeySeed2026Mission.js';
import { projectInvestorToMarketGraphNode } from '../capital/projectInvestorToMarketGraphNode.js';
import { CAPITAL_INVESTOR_RESEARCH_COHORT } from '../capital/capitalInvestorResearchCohort.js';
import { submitMatchReview, __resetMatchReviewMemory } from '../matchReviewService.js';

describe('marketOpportunitiesExecutiveProjection', () => {
  beforeEach(() => {
    __resetMatchReviewMemory();
  });

  it('returns capital domain summary from existing store and pilot stats', async () => {
    await launchpadPersistentMarketGraph.clearMemory();
    await launchpadPersistentMarketGraph.admit({
      ...buildCardbeySeed2026MarketGraphNode(),
      domain: 'CAPITAL',
      resourceType: 'capital_seeker',
    });
    const org = CAPITAL_INVESTOR_RESEARCH_COHORT.find((c) => c.catalogId === 'inv_blackbird_au')!;
    const { node, capitalProfile } = projectInvestorToMarketGraphNode(org);
    const admitted = await launchpadPersistentMarketGraph.admit({
      ...node,
      domain: 'CAPITAL',
      resourceType: 'capital_provider',
      capitalProfile,
    });
    const pairKey = admitted.matches[0]?.pairKey;
    if (pairKey) {
      await submitMatchReview({
        pairKey,
        decision: 'PURSUE',
        reason: 'GOOD_RECIPROCAL_FIT',
        note: null,
        reviewerId: 'test',
        confirmed: true,
      });
    }

    const projection = await buildExecutiveMarketOpportunitiesProjection();
    expect(projection.version).toBe('MARKET_OPPORTUNITIES_EXECUTIVE_V1');
    expect(projection.totals.reviewedCount).toBeGreaterThanOrEqual(1);
    expect(projection.totals.pursueCount).toBeGreaterThanOrEqual(1);
    const capital = projection.domains.find((d) => d.id === 'CAPITAL');
    expect(capital?.active).toBe(true);
    expect(capital?.demandLabel).toMatch(/A\$3M Seed 2026/);
    expect(capital?.candidateMatchCount).toBeGreaterThanOrEqual(1);
    expect(projection.headline).toMatch(/Pursue/);
    expect(projection.launchpadPath).toBe('/control-center/launchpad');
  });
});
