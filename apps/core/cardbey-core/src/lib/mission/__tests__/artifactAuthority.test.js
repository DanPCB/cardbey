/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import { resolveMissionArtifactAuthority } from '../artifactAuthority.js';

describe('artifactAuthority', () => {
  it('requires expected artifact types before completion is satisfied', () => {
    const result = resolveMissionArtifactAuthority({
      contract: { expectedAssetTypes: ['generated_loyalty_program'] },
      metadata: {
        missionDeliveredArtifacts: [
          {
            type: 'generated_loyalty_program',
            artifactType: 'generated_loyalty_program',
            status: 'ready',
            payload: { reward: 'Free coffee' },
            title: 'Loyalty Program',
          },
        ],
      },
    });

    expect(result.satisfied).toBe(true);
    expect(result.matchedArtifacts).toHaveLength(1);
  });

  it('fails authority when no expected artifact is present', () => {
    const result = resolveMissionArtifactAuthority({
      contract: { expectedAssetTypes: ['campaign_package'] },
      metadata: { missionDeliveredArtifacts: [] },
      nodeRun: { status: 'completed', outputs: {} },
    });

    expect(result.satisfied).toBe(false);
  });

  it('accepts campaign package synthesized from topology tool outputs', () => {
    const result = resolveMissionArtifactAuthority({
      contract: { expectedAssetTypes: ['campaign_package'] },
      metadata: {},
      nodeRun: {
        status: 'completed',
        outputs: {},
        toolOutputs: {
          create_campaign_brief: { brief: { objective: 'Weekend promo' } },
          generate_campaign_graphics: {
            graphics: [{ id: 'g1', url: 'https://example.com/g1.jpg' }],
          },
          generate_campaign_copy: { copy: { headline: 'Book brunch', cta: 'Reserve' } },
        },
      },
    });

    expect(result.satisfied).toBe(true);
    expect(result.matchedArtifacts.length).toBeGreaterThan(0);
  });

  it('accepts packaged campaign artifact with type campaign', () => {
    const result = resolveMissionArtifactAuthority({
      contract: { expectedAssetTypes: ['campaign_package'] },
      nodeRun: {
        status: 'completed',
        outputs: {
          campaignPackage: {
            type: 'campaign',
            artifactType: 'campaign_package',
            status: 'ready',
            url: 'https://example.com/g1.jpg',
            brief: { objective: 'Sale' },
            graphics: [{ url: 'https://example.com/g1.jpg' }],
            copy: { headline: 'Sale on now', cta: 'Buy' },
          },
        },
      },
    });

    expect(result.satisfied).toBe(true);
  });
});
