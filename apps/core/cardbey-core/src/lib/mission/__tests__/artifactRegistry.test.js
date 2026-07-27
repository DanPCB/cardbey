/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import { ARTIFACT_REGISTRY, matchesArtifactFamily, resolveCanonicalArtifactType } from '../artifactRegistry.js';

describe('artifactRegistry', () => {
  it('resolves loyalty aliases to canonical generated_loyalty_program', () => {
    expect(resolveCanonicalArtifactType('loyalty')).toBe('generated_loyalty_program');
    expect(resolveCanonicalArtifactType('loyalty_program_draft')).toBe('generated_loyalty_program');
  });

  it('matches loyalty artifact with subtype loyalty against expected generated_loyalty_program', () => {
    expect(
      matchesArtifactFamily(
        { type: 'text_asset', subtype: 'generated_loyalty_program', artifactType: 'generated_loyalty_program' },
        'generated_loyalty_program',
      ),
    ).toBe(true);
    expect(
      matchesArtifactFamily(
        { type: 'generated_loyalty_program', subtype: 'loyalty' },
        'generated_loyalty_program',
      ),
    ).toBe(true);
  });

  it('exposes registry entries for core mission families', () => {
    expect(ARTIFACT_REGISTRY.loyalty.canonical).toBe('generated_loyalty_program');
    expect(ARTIFACT_REGISTRY.campaign.canonical).toBe('campaign_package');
  });
});
