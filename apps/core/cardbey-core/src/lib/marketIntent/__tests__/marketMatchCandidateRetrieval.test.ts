import { describe, expect, it } from 'vitest';
import {
  buildExchangeRoleContext,
  isEligibleCapitalMatchPair,
  isEligibleMatchPair,
  resolveCapitalExchangeRole,
} from '../marketMatchCandidateRetrieval.js';
import { projectInvestorToMarketGraphNode } from '../capital/projectInvestorToMarketGraphNode.js';
import {
  buildCardbeySeed2026MarketGraphNode,
  CARDBEY_SEED_2026_NODE_ID,
} from '../capital/cardbeySeed2026Mission.js';
import { CAPITAL_INVESTOR_RESEARCH_COHORT } from '../capital/capitalInvestorResearchCohort.js';
import { PersistentMarketGraphStore } from '../capital/persistentMarketGraphStore.js';

function investorNode(catalogId: string) {
  const org = CAPITAL_INVESTOR_RESEARCH_COHORT.find((c) => c.catalogId === catalogId)!;
  const { node, capitalProfile } = projectInvestorToMarketGraphNode(org);
  return {
    ...node,
    domain: 'CAPITAL',
    resourceType: 'capital_provider',
    capitalProfile,
  };
}

describe('marketMatchCandidateRetrieval V1', () => {
  it('assigns capital supply to investors and capital demand to Cardbey seeker', () => {
    const company = {
      ...buildCardbeySeed2026MarketGraphNode(),
      domain: 'CAPITAL',
      resourceType: 'capital_seeker',
    };
    const investor = investorNode('inv_blackbird_au');

    expect(resolveCapitalExchangeRole(company)).toBe('DEMAND');
    expect(resolveCapitalExchangeRole(investor)).toBe('SUPPLY');

    const companyCtx = buildExchangeRoleContext(company);
    const investorCtx = buildExchangeRoleContext(investor);
    expect(companyCtx.roleLabel).toBe('Capital demand');
    expect(investorCtx.roleLabel).toBe('Capital supply');
    expect(investorCtx.nodeFacets.contextualRole).toMatch(/DUAL|SUPPLY/);
  });

  it('excludes investor↔investor pairs from capital candidate retrieval', () => {
    const a = investorNode('inv_antler_au');
    const b = investorNode('inv_brinc_global');
    const decision = isEligibleCapitalMatchPair(a, b);
    expect(decision.eligible).toBe(false);
    expect(decision.reason).toBe('same_exchange_role');
  });

  it('includes Cardbey↔investor pairs', () => {
    const company = {
      ...buildCardbeySeed2026MarketGraphNode(),
      domain: 'CAPITAL',
      resourceType: 'capital_seeker',
    };
    const investor = investorNode('inv_wavemaker_sea');
    const decision = isEligibleMatchPair(company, investor);
    expect(decision.eligible).toBe(true);
    expect(decision.reason).toBe('capital_supply_demand_counterparty');
  });

  it('allows co-investment pairs only when explicitly requested', () => {
    const a = investorNode('inv_airtree_au');
    const b = investorNode('inv_squarepeg_au');
    expect(isEligibleCapitalMatchPair(a, b).eligible).toBe(false);
    expect(isEligibleCapitalMatchPair(a, b, { allowCoInvestment: true }).eligible).toBe(true);
  });

  it('persistent store surfaces only eligible pairs in listMatches', async () => {
    const store = new PersistentMarketGraphStore();
    await store.clearMemory();

    const company = {
      ...buildCardbeySeed2026MarketGraphNode(),
      domain: 'CAPITAL',
      resourceType: 'capital_seeker',
    };
    await store.admit(company);

    const ids = ['inv_antler_au', 'inv_brinc_global', 'inv_blackbird_au'] as const;
    for (const id of ids) {
      const inv = investorNode(id);
      await store.admit(inv);
    }

    const matches = await store.listMatches({ eligibleOnly: true });
    expect(matches.total).toBeGreaterThanOrEqual(3);
    for (const m of matches.items) {
      const hasCompany = m.nodeAId === CARDBEY_SEED_2026_NODE_ID || m.nodeBId === CARDBEY_SEED_2026_NODE_ID;
      expect(hasCompany).toBe(true);
    }

    const investorOnly = matches.items.filter(
      (m) =>
        m.nodeAId !== CARDBEY_SEED_2026_NODE_ID && m.nodeBId !== CARDBEY_SEED_2026_NODE_ID,
    );
    expect(investorOnly).toHaveLength(0);
  });

  it('listNodes exchangeRole filters supply vs demand', async () => {
    const store = new PersistentMarketGraphStore();
    await store.clearMemory();
    await store.admit({
      ...buildCardbeySeed2026MarketGraphNode(),
      domain: 'CAPITAL',
      resourceType: 'capital_seeker',
    });
    await store.admit(investorNode('inv_antler_au'));

    const supply = await store.listNodes({ exchange: 'CAPITAL', exchangeRole: 'SUPPLY' });
    const demand = await store.listNodes({ exchange: 'CAPITAL', exchangeRole: 'DEMAND' });

    expect(supply.items.every((n) => n.nodeId.includes('investor'))).toBe(true);
    expect(demand.items.some((n) => n.nodeId === CARDBEY_SEED_2026_NODE_ID)).toBe(true);
    expect(demand.items.every((n) => n.nodeId.includes('investor'))).toBe(false);
  });
});
