/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import {
  normalizeCampaignPackageArtifact,
  synthesizeCampaignPackageFromToolOutputs,
} from '../campaignPackageArtifact.js';

describe('campaignPackageArtifact', () => {
  it('normalizes campaign package with preview url and inline payload', () => {
    const normalized = normalizeCampaignPackageArtifact({
      type: 'campaign',
      status: 'ready',
      brief: { objective: 'Promo' },
      graphics: [{ url: 'https://example.com/g1.jpg' }],
      copy: { headline: 'Promo now', cta: 'Book' },
    });

    expect(normalized?.artifactType).toBe('campaign_package');
    expect(normalized?.url).toBe('https://example.com/g1.jpg');
    expect(normalized?.metadata?.inlinePayload).toMatchObject({
      brief: { objective: 'Promo' },
    });
  });

  it('synthesizes package from completed campaign tool outputs', () => {
    const artifact = synthesizeCampaignPackageFromToolOutputs({
      create_campaign_brief: { brief: { objective: 'Brunch' } },
      generate_campaign_graphics: { graphics: [{ url: 'https://example.com/a.jpg' }] },
      generate_campaign_copy: { copy: { headline: 'Brunch time', cta: 'Book now' } },
    });

    expect(artifact?.artifactType).toBe('campaign_package');
    expect(artifact?.url).toBe('https://example.com/a.jpg');
  });
});
