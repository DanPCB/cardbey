import { describe, expect, it } from 'vitest';
import {
  discoverInvestorCatalog,
  getInvestorCatalogOrg,
  scoreInvestorFit,
} from './investorOrganizationCatalog.js';
import { isGrowthInvestorModeEnabled } from './growthInvestorGovernanceConfig.js';

describe('investorOrganizationCatalog', () => {
  it('returns Blackbird for Australia seed filters', () => {
    const rows = discoverInvestorCatalog({
      targetCount: 10,
      geographies: ['au'],
      stages: ['seed'],
      themes: [],
      types: [],
      canLead: 'any',
    });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some((row) => row.org.catalogId === 'inv_blackbird_au')).toBe(true);
  });

  it('scores higher when themes align', () => {
    const org = getInvestorCatalogOrg('inv_blackbird_au');
    expect(org).toBeTruthy();
    const aligned = scoreInvestorFit(org, { themes: ['ai', 'saas'] });
    const weak = scoreInvestorFit(org, { themes: [] });
    expect(aligned.score).toBeGreaterThanOrEqual(weak.score);
  });
});

describe('growthInvestorGovernanceConfig', () => {
  it('enables investor mode in test env by default', () => {
    expect(isGrowthInvestorModeEnabled()).toBe(true);
  });
});
