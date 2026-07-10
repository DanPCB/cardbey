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
});
