// DANH: skill-round4-loyalty
import { describe, it, expect } from 'vitest';
import { skillRegistry } from '../../lib/skills/SkillRegistry.js';
import { LoyaltyCampaignSkill } from '../../lib/skills/definitions/LoyaltyCampaignSkill.js';
import { CampaignSkill } from '../../lib/skills/definitions/CampaignSkill.js';
import { execute as segmentLoyalCustomers } from '../../lib/toolExecutors/loyalty/segment_loyal_customers.js';

function matchesTrigger(intent) {
  return skillRegistry.findByTrigger(intent)?.name === 'loyalty_campaign';
}

describe('LoyaltyCampaignSkill', () => {
  it('matches primary trigger setup_loyalty_program', () => {
    expect(matchesTrigger('setup_loyalty_program')).toBe(true);
  });

  it('does not match unrelated intent', () => {
    expect(matchesTrigger('book_appointment')).toBe(false);
  });

  it('triggers do not overlap CampaignSkill triggers', () => {
    const loyalty = new Set(LoyaltyCampaignSkill.triggers);
    const campaign = CampaignSkill.triggers ?? [];
    const overlap = campaign.filter((t) => loyalty.has(t));
    expect(overlap).toEqual([]);
  });

  it('step list is non-empty and ordered', () => {
    expect(LoyaltyCampaignSkill.steps.map((s) => s.tool)).toEqual([
      'segment_loyal_customers',
      'define_loyalty_tiers',
      'create_loyalty_offer',
      'schedule_loyalty_campaign',
    ]);
  });

  it('execute returns valid tool result shape on segment step', async () => {
    const result = await segmentLoyalCustomers({ storeId: 'store-1' });
    expect(result.status).toBe('ok');
    expect(result.output).toBeDefined();
    expect(typeof result.output.customerCount).toBe('number');
  });

  it('missing storeId handled gracefully on segment executor', async () => {
    const result = await segmentLoyalCustomers({});
    expect(result.status).toBe('failed');
    expect(result.output?.error).toBe('storeId is required');
  });
});
