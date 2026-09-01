import { describe, expect, it } from 'vitest';
import { evaluateReciprocalMatchPair } from '../evaluateReciprocalMatch.js';
import { buildOperatorMatchPresentation } from '../operatorMatchPresentation.js';
import { projectInvestorToMarketGraphNode } from '../capital/projectInvestorToMarketGraphNode.js';
import { buildCardbeySeed2026MarketGraphNode } from '../capital/cardbeySeed2026Mission.js';
import { CAPITAL_INVESTOR_RESEARCH_COHORT } from '../capital/capitalInvestorResearchCohort.js';

describe('operatorMatchPresentation', () => {
  it('places Cardbey capital need on demand-needs side when investor is nodeA', () => {
    const company = buildCardbeySeed2026MarketGraphNode();
    const org = CAPITAL_INVESTOR_RESEARCH_COHORT.find((c) => c.catalogId === 'inv_brinc_global')!;
    const { node: investor } = projectInvestorToMarketGraphNode(org);

    const match = evaluateReciprocalMatchPair(investor, company);
    const view = buildOperatorMatchPresentation(match);

    expect(view.demandLabel).toMatch(/Cardbey/i);
    expect(view.supplyLabel).toMatch(/Brinc/i);
    expect(view.capitalNeedDirection.leftLabel).toMatch(/Cardbey/i);
    expect(view.capitalNeedDirection.rightLabel).toMatch(/Brinc/i);
    expect(view.capitalNeedDirection.overlaps.length).toBeGreaterThan(0);
    expect(view.capitalNeedDirection.overlaps[0]?.want).toMatch(/seed capital/i);
    expect(view.capitalNeedDirection.overlaps[0]?.has).toMatch(/investment capital/i);
    expect(view.thesisFitDirection.overlaps).toHaveLength(0);
    expect(view.thesisFitDirection.emptyNote).toMatch(/investable-company/i);
    expect(view.bandSummary).toMatch(/Capital need ✓/);
    expect(view.bandSummary).toMatch(/Investor thesis fit \?/);
  });

  it('orients correctly when company is nodeA', () => {
    const company = buildCardbeySeed2026MarketGraphNode();
    const org = CAPITAL_INVESTOR_RESEARCH_COHORT.find((c) => c.catalogId === 'inv_antler_au')!;
    const { node: investor } = projectInvestorToMarketGraphNode(org);
    const match = evaluateReciprocalMatchPair(company, investor);
    const view = buildOperatorMatchPresentation(match);

    expect(view.capitalNeedDirection.overlaps.length).toBeGreaterThan(0);
    expect(view.capitalNeedDirection.heading).toMatch(/Cardbey needs/);
    expect(view.capitalNeedDirection.heading).toMatch(/Antler Australia provides/i);
  });
});
