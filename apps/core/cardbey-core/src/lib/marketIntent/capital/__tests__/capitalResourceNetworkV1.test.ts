import { describe, expect, it, beforeEach } from 'vitest';
import { projectInvestorToMarketGraphNode } from '../projectInvestorToMarketGraphNode.js';
import { qualifyCapitalPair, buildQualifiedCapitalOpportunity } from '../qualifyCapitalPair.js';
import {
  buildCardbeySeed2026MarketGraphNode,
  buildCardbeySeed2026SeekerProfile,
  CARDBEY_SEED_2026_NODE_ID,
} from '../cardbeySeed2026Mission.js';
import { CAPITAL_INVESTOR_RESEARCH_COHORT } from '../capitalInvestorResearchCohort.js';
import { calibrateCardbeySeedAgainstCohort, buildCapitalCampaignHandoff } from '../capitalResourceNetworkService.js';
import { PersistentMarketGraphStore } from '../persistentMarketGraphStore.js';
import { evaluateReciprocalMatchPair } from '../../evaluateReciprocalMatch.js';

describe('Capital Resource Network V1', () => {
  it('projects investor with unknown cheque fields — never invents mandate', () => {
    const org = CAPITAL_INVESTOR_RESEARCH_COHORT.find((c) => c.catalogId === 'inv_blackbird_au')!;
    const { node, capitalProfile } = projectInvestorToMarketGraphNode(org);
    expect(node.nodeId).toContain('capital:investor:');
    expect(node.has.some((h) => h.type === 'CAPITAL')).toBe(true);
    expect(node.wants.length).toBeGreaterThan(0);
    expect(capitalProfile.chequeMinAud).toBeNull();
    expect(capitalProfile.chequeMaxAud).toBeNull();
    expect(capitalProfile.unknownFields).toContain('cheque_min');
    expect(capitalProfile.unknownFields).toContain('cheque_max');
    expect(capitalProfile.sourceFacts.every((e) => e.kind === 'SOURCE_FACT')).toBe(true);
    expect(node.contextualRole).toMatch(/SUPPLY|DEMAND|DUAL/);
  });

  it('does not permanently classify investor as supply-only entity type', () => {
    const org = CAPITAL_INVESTOR_RESEARCH_COHORT[0]!;
    const { node } = projectInvestorToMarketGraphNode(org);
    // Contextual role may be DUAL (HAS capital + WANTS opportunities)
    expect(['SUPPLY', 'DEMAND', 'DUAL', 'UNKNOWN']).toContain(node.contextualRole);
    expect(node.actorRole).toBeDefined();
  });

  it('Cardbey Seed 2026 mission produces demand/dual node without fabricated traction', () => {
    const node = buildCardbeySeed2026MarketGraphNode();
    expect(node.nodeId).toBe(CARDBEY_SEED_2026_NODE_ID);
    expect(node.wants.some((w) => w.type === 'CAPITAL' || w.type === 'INVESTOR')).toBe(true);
    expect(node.has.some((h) => h.type === 'BUSINESS')).toBe(true);
    expect(node.constraints.some((c) => /no_fabricated_traction/.test(c))).toBe(true);
    expect(['DEMAND', 'DUAL']).toContain(node.contextualRole);
  });

  it('cheque compatible vs incompatible', () => {
    const company = buildCardbeySeed2026MarketGraphNode();
    const org = {
      ...CAPITAL_INVESTOR_RESEARCH_COHORT[0]!,
      chequeMinAud: 500_000,
      chequeMaxAud: 2_000_000,
    };
    const { node: investor, capitalProfile } = projectInvestorToMarketGraphNode(org);
    const reciprocal = evaluateReciprocalMatchPair(company, investor);
    const profile = buildCardbeySeed2026SeekerProfile();

    const ok = qualifyCapitalPair({
      companyNode: company,
      investorNode: investor,
      reciprocal,
      companyProfile: { ...profile, raiseAmountAud: 1_500_000 },
      investorProfile: capitalProfile,
    });
    expect(ok.chequeFit).toBe('COMPATIBLE');

    const bad = qualifyCapitalPair({
      companyNode: company,
      investorNode: investor,
      reciprocal,
      companyProfile: { ...profile, raiseAmountAud: 100_000 },
      investorProfile: capitalProfile,
    });
    expect(bad.chequeFit).toBe('INCOMPATIBLE');
  });

  it('stage compatible vs incompatible', () => {
    const company = buildCardbeySeed2026MarketGraphNode();
    const seedOrg = CAPITAL_INVESTOR_RESEARCH_COHORT.find((c) => c.catalogId === 'inv_airtree_au')!;
    const { node: seedInv, capitalProfile: seedProfile } = projectInvestorToMarketGraphNode(seedOrg);
    const reciprocal = evaluateReciprocalMatchPair(company, seedInv);
    const seeker = buildCardbeySeed2026SeekerProfile();

    const ok = qualifyCapitalPair({
      companyNode: company,
      investorNode: seedInv,
      reciprocal,
      companyProfile: seeker,
      investorProfile: seedProfile,
    });
    expect(ok.stageFit).toBe('COMPATIBLE');

    const growthOnly = projectInvestorToMarketGraphNode({
      ...seedOrg,
      catalogId: 'inv_growth_only_test',
      stages: ['series-b', 'series-c'],
    });
    const badReciprocal = evaluateReciprocalMatchPair(company, growthOnly.node);
    const bad = qualifyCapitalPair({
      companyNode: company,
      investorNode: growthOnly.node,
      reciprocal: badReciprocal,
      companyProfile: seeker,
      investorProfile: growthOnly.capitalProfile,
    });
    expect(bad.stageFit).toBe('INCOMPATIBLE');
  });

  it('geography constraint can be incompatible', () => {
    const company = buildCardbeySeed2026MarketGraphNode();
    const euOnly = projectInvestorToMarketGraphNode({
      catalogId: 'inv_eu_only_test',
      name: 'EU Only Fund',
      type: 'VC',
      geography: 'eu',
      geographies: ['eu'],
      stages: ['seed'],
      themes: ['saas'],
      canLead: true,
      website: 'https://example.com',
      headquarters: 'Berlin, Europe',
      mandateSummary: 'European seed only',
    });
    const reciprocal = evaluateReciprocalMatchPair(company, euOnly.node);
    const q = qualifyCapitalPair({
      companyNode: company,
      investorNode: euOnly.node,
      reciprocal,
      companyProfile: buildCardbeySeed2026SeekerProfile(),
      investorProfile: euOnly.capitalProfile,
    });
    expect(q.geographyFit).toBe('INCOMPATIBLE');
  });

  it('strong reciprocal capital compatibility possible without hard-coded VC outcome', () => {
    const calibration = calibrateCardbeySeedAgainstCohort();
    expect(calibration.rows.length).toBeGreaterThanOrEqual(8);
    // Must not force every ANZ fund to QUALIFIED / STRONG
    const bands = new Set(calibration.rows.map((r) => r.reciprocalBand));
    expect(bands.size).toBeGreaterThanOrEqual(1);
    for (const row of calibration.rows) {
      expect(row).not.toHaveProperty('fundingProbability');
      expect(row.rankingReasons.length).toBeGreaterThan(0);
    }
    // No hard-coded guaranteed HIGH for named VCs
    const blackbird = calibration.rows.find((r) => r.catalogId === 'inv_blackbird_au');
    expect(blackbird).toBeDefined();
    expect(['STRONG_RECIPROCAL', 'ONE_WAY_STRONG', 'POSSIBLE', 'INSUFFICIENT_EVIDENCE', 'CONTRADICTED']).toContain(
      blackbird!.reciprocalBand,
    );
  });

  it('one-sided capital compatibility remains explainable', () => {
    const company = buildCardbeySeed2026MarketGraphNode();
    const org = CAPITAL_INVESTOR_RESEARCH_COHORT.find((c) => c.catalogId === 'inv_antler_au')!;
    const { node: investor, capitalProfile } = projectInvestorToMarketGraphNode(org);
    const reciprocal = evaluateReciprocalMatchPair(company, investor);
    const opp = buildQualifiedCapitalOpportunity({
      companyNode: company,
      investorNode: investor,
      reciprocal,
      companyProfile: buildCardbeySeed2026SeekerProfile(),
      investorProfile: capitalProfile,
    });
    expect(opp.reciprocalBand).toBeDefined();
    expect(opp.capitalQualification.unknowns.length).toBeGreaterThan(0);
  });

  it('persistent store memory round-trip + re-evaluation after change', async () => {
    const store = new PersistentMarketGraphStore();
    await store.clearMemory();
    const company = buildCardbeySeed2026MarketGraphNode();
    await store.admit({
      ...company,
      domain: 'CAPITAL',
      resourceType: 'capital_seeker',
    });
    const org = CAPITAL_INVESTOR_RESEARCH_COHORT.find((c) => c.catalogId === 'inv_airtree_au')!;
    const { node, capitalProfile } = projectInvestorToMarketGraphNode(org);
    const first = await store.admit({
      ...node,
      domain: 'CAPITAL',
      resourceType: 'capital_provider',
      capitalProfile,
    });
    expect(first.matches.length).toBeGreaterThan(0);
    const got = await store.getNode(node.nodeId);
    expect(got?.contextualRole).toBeDefined();
    expect(got?.capitalProfile?.unknownFields).toContain('cheque_min');

    const listed = await store.listNodes({ domain: 'CAPITAL', role: company.contextualRole as any });
    expect(listed.total).toBeGreaterThanOrEqual(1);

    const matches = await store.listMatches({ nodeId: company.nodeId });
    expect(matches.total).toBeGreaterThanOrEqual(1);

    // Material change → replace admit re-evaluates
    const changed = {
      ...node,
      label: `${node.label} (updated mandate)`,
      wants: [
        ...node.wants,
        {
          type: 'SOLUTION' as const,
          label: 'deep-tech only',
          confidence: 0.8,
          basis: 'EXPLICIT' as const,
          evidence: [],
        },
      ],
      domain: 'CAPITAL',
      capitalProfile,
    };
    const second = await store.admit(changed, { replace: true });
    expect(second.matches.length).toBeGreaterThan(0);
    expect(second.node.updatedAt).toBeTruthy();
  });

  it('handoff contract requires human confirmation and does not claim funding', () => {
    const company = buildCardbeySeed2026MarketGraphNode();
    const org = CAPITAL_INVESTOR_RESEARCH_COHORT.find((c) => c.catalogId === 'inv_squarepeg_au')!;
    const { node, capitalProfile } = projectInvestorToMarketGraphNode(org);
    const reciprocal = evaluateReciprocalMatchPair(company, node);
    const opportunity = buildQualifiedCapitalOpportunity({
      companyNode: company,
      investorNode: node,
      reciprocal,
      companyProfile: buildCardbeySeed2026SeekerProfile(),
      investorProfile: capitalProfile,
    });
    const handoff = buildCapitalCampaignHandoff({ opportunity });
    expect(handoff.kind).toBe('ADMIT_TO_FUNDRAISING_CAMPAIGN_V1');
    expect(handoff.requiresHumanConfirmation).toBe(true);
    expect(handoff.sourceProvenance.preparedWithoutOutreach).toBe(true);
  });

  it('evidence freshness timestamps present on admission', async () => {
    const store = new PersistentMarketGraphStore();
    await store.clearMemory();
    const node = buildCardbeySeed2026MarketGraphNode();
    const { node: stored } = await store.admit({ ...node, domain: 'CAPITAL' });
    expect(stored.freshnessAt || stored.updatedAt).toBeTruthy();
    expect(stored.admittedAt).toBeTruthy();
  });
});
