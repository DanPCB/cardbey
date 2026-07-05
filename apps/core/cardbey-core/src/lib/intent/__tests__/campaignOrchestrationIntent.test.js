/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import {
  detectCampaignCreationIntent,
  isCampaignOrchestrationIntent,
} from '../campaignOrchestrationIntent.js';

describe('campaignOrchestrationIntent', () => {
  it('detects weekend brunch promotion campaign phrasing', () => {
    const msg = 'create a weekend brunch promotion campaign for my store';
    expect(isCampaignOrchestrationIntent(msg)).toBe(true);
    expect(detectCampaignCreationIntent(msg)).toBe(true);
  });

  it('detects simple create campaign phrasing', () => {
    expect(detectCampaignCreationIntent('Create a campaign')).toBe(true);
    expect(detectCampaignCreationIntent('launch a campaign for my store')).toBe(true);
  });

  it('does not treat unrelated chat as campaign creation', () => {
    expect(detectCampaignCreationIntent('hello')).toBe(false);
    expect(detectCampaignCreationIntent('what is a marketing campaign')).toBe(false);
  });
});
