// AUDIT: CampaignSkill at definitions/CampaignSkill.js — one-off campaigns; loyalty triggers are disjoint
// DANH: skill-round4-loyalty
/**
 * Loyalty campaign — segment repeat customers, define tiers, create offers, schedule delivery.
 */

import { skillRegistry } from '../SkillRegistry.js';

/** @type {import('../types.js').SkillDefinition} */
export const LoyaltyCampaignSkill = {
  name: 'loyalty_campaign',
  version: '1.0',
  description:
    'Set up a repeat-customer loyalty program: segment loyal buyers, define tiers, generate reward offers, and schedule a loyalty campaign draft.',
  triggers: [
    'loyalty_program',
    'setup_loyalty',
    'loyalty_campaign',
    'points_program',
    'rewards_program',
    'member_program',
    'setup_loyalty_program',
    'loyalty_tiers',
    'repeat_customers',
    'loyalty_rewards',
    'customer_loyalty',
  ],
  requiredContext: ['storeId', 'userId'],
  observable: true,
  composes: ['campaign'],
  steps: [
    {
      id: 'segment_loyal_customers',
      name: 'Segment loyal customers',
      tool: 'segment_loyal_customers',
      required: true,
      buildInput: (ctx) => ({ storeId: ctx.storeId }),
    },
    {
      id: 'define_loyalty_tiers',
      name: 'Define loyalty tiers',
      tool: 'define_loyalty_tiers',
      required: true,
      buildInput: (ctx, stepResults) => ({
        storeId: ctx.storeId,
        customerCount:
          stepResults.segment_loyal_customers?.output?.customerCount ??
          stepResults.segment_loyal_customers?.output?.output?.customerCount ??
          0,
      }),
    },
    {
      id: 'create_loyalty_offer',
      name: 'Create loyalty offers',
      tool: 'create_loyalty_offer',
      required: true,
      buildInput: (ctx, stepResults) => ({
        storeId: ctx.storeId,
        tiers:
          stepResults.define_loyalty_tiers?.output?.tiers ??
          stepResults.define_loyalty_tiers?.output?.output?.tiers ??
          [],
        businessCategory:
          ctx.hydratedContext?.brandKit?.category ??
          ctx.toolInput?.businessCategory ??
          ctx.hydratedContext?.entities?.store?.type ??
          'General',
      }),
    },
    {
      id: 'schedule_loyalty_campaign',
      name: 'Schedule loyalty campaign',
      tool: 'schedule_loyalty_campaign',
      required: true,
      buildInput: (ctx, stepResults) => ({
        storeId: ctx.storeId,
        offers:
          stepResults.create_loyalty_offer?.output?.offers ??
          stepResults.create_loyalty_offer?.output?.output?.offers ??
          [],
      }),
    },
  ],
  retryPolicy: {
    maxAttempts: 2,
    backoffMs: 1500,
    shouldRetry: (error) =>
      error?.code !== 'VALIDATION_ERROR' && error?.code !== 'PERMISSION_DENIED',
  },
};

if (!skillRegistry.has(LoyaltyCampaignSkill.name)) {
  skillRegistry.register(LoyaltyCampaignSkill);
}
