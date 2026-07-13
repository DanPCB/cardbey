/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import { scoreBusinessIdentityMatch } from '../businessIdentityMatcher.js';
import { compileSourceGroundedCatalog } from '../sourceGroundedCatalogCompiler.js';
import { PROVENANCE_SOURCE } from '../performerGroundingTypes.js';

describe('businessIdentityMatcher', () => {
  it('rejects similar name with different address', () => {
    const match = scoreBusinessIdentityMatch(
      { businessName: 'Bellamy Cafe', address: '12 King St Sydney', phone: '0299990000' },
      { businessName: 'Bellamy Cafe', address: '88 Queen St Melbourne', phone: '0388881111' },
    );
    expect(['AMBIGUOUS', 'NO_MATCH']).toContain(match.status);
    expect(match.conflictingSignals).toContain('address_mismatch');
  });

  it('accepts exact phone + address + domain as exact match', () => {
    const match = scoreBusinessIdentityMatch(
      { businessName: 'Luxe Nails', phone: '0291112222', address: '5 George St', website: 'https://luxenails.com.au' },
      { businessName: 'Luxe Nails', phone: '0291112222', address: '5 George St', website: 'https://www.luxenails.com.au' },
    );
    expect(match.status).toBe('EXACT_MATCH');
    expect(match.score).toBeGreaterThanOrEqual(0.82);
  });

  it('flags name-only match as ambiguous', () => {
    const match = scoreBusinessIdentityMatch(
      { businessName: 'City Hair' },
      { businessName: 'City Hair Studio' },
    );
    expect(['AMBIGUOUS', 'PROBABLE_MATCH']).toContain(match.status);
  });
});

describe('provenance assignment', () => {
  it('marks exact source items as OWNER_PROVIDED provenance', () => {
    const draft = compileSourceGroundedCatalog({
      businessIdentity: { sourceConfidence: 0.9 },
      sourceDocuments: [],
      catalogEvidence: {
        detectedCatalogType: 'SERVICES',
        sections: [
          {
            sectionName: 'Haircuts',
            sourceOrder: 0,
            items: [
              {
                sourceItemId: 'a1',
                name: 'Classic Cut',
                itemType: 'SERVICE',
                sourceRef: 'owner_menu',
                confidence: 0.95,
                evidenceStatus: 'EXACT',
              },
            ],
          },
        ],
        totalDetectedItems: 1,
        sourceCoverage: 1,
        confidence: 0.95,
      },
      mediaEvidence: { logos: [], heroCandidates: [], productImages: [], serviceImages: [], videos: [] },
      unresolvedFields: [],
      conflicts: [],
    });
    expect(draft.sections[0].items[0].provenance.source).toBe(PROVENANCE_SOURCE.OWNER_PROVIDED);
  });
});
