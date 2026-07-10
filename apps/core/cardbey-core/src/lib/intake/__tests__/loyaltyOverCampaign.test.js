/**
 * @vitest-environment node
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  isLoyaltyIntent,
  isExplicitLoyaltyMarketingCampaign,
  shouldPreferLoyaltyOverCampaign,
} from '../intentDetectors.js';
import { detectCampaignCreationIntent } from '../../intent/campaignOrchestrationIntent.js';
import { IntentReasoner } from '../../intent/intentReasoner.js';

const LOYALTY_SETUP_PHRASES = [
  'create a loyalty campaign for my store with this card',
  'create a loyalty program from this card',
  'turn this stamp card into a digital loyalty campaign',
  'make a loyalty reward campaign from the uploaded card',
];

const MARKETING_KEEP_CAMPAIGN = [
  'create a poster campaign advertising my loyalty program',
  'create social media posts to promote my loyalty card',
  'launch a marketing campaign for this loyalty offer',
];

function makeReasoner(activeStoreId = 'store_1') {
  return new IntentReasoner({
    contextProvider: {
      getContext: vi.fn(async () => ({
        activeStoreId,
        stores: activeStoreId ? [{ id: activeStoreId }] : [],
        memorySummary: null,
      })),
    },
    config: {},
  });
}

describe('loyalty over campaign routing', () => {
  it('isLoyaltyIntent matches loyalty campaign / stamp card phrases', () => {
    for (const phrase of LOYALTY_SETUP_PHRASES) {
      expect(isLoyaltyIntent(phrase), phrase).toBe(true);
      expect(shouldPreferLoyaltyOverCampaign(phrase), phrase).toBe(true);
    }
  });

  it('detectCampaignCreationIntent still matches raw phrases (reasoner must suppress)', () => {
    expect(detectCampaignCreationIntent('create a loyalty campaign for my store with this card')).toBe(
      true,
    );
  });

  it('explicit marketing of loyalty keeps create_campaign preference', () => {
    for (const phrase of MARKETING_KEEP_CAMPAIGN) {
      expect(isExplicitLoyaltyMarketingCampaign(phrase), phrase).toBe(true);
      expect(shouldPreferLoyaltyOverCampaign(phrase), phrase).toBe(false);
    }
  });

  it('loyalty_card attachment tie-breaks to loyalty unless explicit marketing', () => {
    expect(
      shouldPreferLoyaltyOverCampaign('set this up for my store', {
        artifactType: 'loyalty_card',
      }),
    ).toBe(true);
    expect(
      shouldPreferLoyaltyOverCampaign('create a poster campaign advertising my loyalty program', {
        artifactType: 'loyalty_card',
      }),
    ).toBe(false);
  });
});

describe('IntentReasoner loyalty campaign override', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(LOYALTY_SETUP_PHRASES)('routes to setup_loyalty_program: %s', async (text) => {
    const reasoner = makeReasoner('store_1');
    const result = await reasoner.reason('user_1', 'session_1', { text });
    expect(result.intent).toBe('setup_loyalty');
    expect(result.tool).toBe('setup_loyalty_program');
  });

  it.each(MARKETING_KEEP_CAMPAIGN)('does not route loyalty setup for marketing: %s', async (text) => {
    const reasoner = makeReasoner('store_1');
    const result = await reasoner.reason('user_1', 'session_1', { text });
    expect(result.tool).not.toBe('setup_loyalty_program');
    expect(result.intent).not.toBe('setup_loyalty');
    if (detectCampaignCreationIntent(text)) {
      expect(result.tool).toBe('create_campaign');
    }
  });
});
