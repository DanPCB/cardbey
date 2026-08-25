/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import {
  detectCampaignCreationIntent,
  isCampaignOrchestrationIntent,
  isMultiAgentIntent,
  resolveIntakeOrchestrationDispatch,
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

describe('resolveIntakeOrchestrationDispatch (Phase 1)', () => {
  it('honors explicit missionType over NL', () => {
    expect(
      resolveIntakeOrchestrationDispatch({
        missionType: 'multi_agent',
        userMessage: 'create a summer campaign',
      }),
    ).toBe('multi_agent');
    expect(
      resolveIntakeOrchestrationDispatch({
        missionType: 'campaign_orchestration',
        userMessage: 'hello',
      }),
    ).toBe('campaign_orchestration');
  });

  it('routes orchestration-grade NL to campaign_orchestration', () => {
    expect(
      resolveIntakeOrchestrationDispatch({
        missionType: null,
        userMessage: 'Create a summer campaign for my store',
      }),
    ).toBe('campaign_orchestration');
    expect(
      resolveIntakeOrchestrationDispatch({
        userMessage: 'run a full campaign for brunch',
      }),
    ).toBe('campaign_orchestration');
  });

  it('routes multi-agent NL to multi_agent', () => {
    expect(isMultiAgentIntent('run a multi-agent plan')).toBe(true);
    expect(
      resolveIntakeOrchestrationDispatch({
        userMessage: 'Please run multi-agent research for my store',
      }),
    ).toBe('multi_agent');
  });

  it('routes invoice month-end NL to multi_agent', () => {
    expect(
      resolveIntakeOrchestrationDispatch({
        userMessage: 'Do the end of month invoice close',
      }),
    ).toBe('multi_agent');
  });

  it('leaves simple create_campaign phrasing to legacy checkpoint path', () => {
    expect(detectCampaignCreationIntent('Create a campaign')).toBe(true);
    expect(
      resolveIntakeOrchestrationDispatch({
        userMessage: 'Create a campaign',
      }),
    ).toBeNull();
  });

  it('ignores informational questions', () => {
    expect(
      resolveIntakeOrchestrationDispatch({
        userMessage: 'what is a marketing campaign',
      }),
    ).toBeNull();
  });
});
