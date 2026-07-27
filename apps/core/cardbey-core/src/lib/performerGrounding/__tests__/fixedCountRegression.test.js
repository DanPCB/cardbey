/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import { compileSourceGroundedCatalog } from '../sourceGroundedCatalogCompiler.js';
import { buildSeedCatalog } from '../../../services/store/seeds/seedCatalogBuilder.js';
import { resolveCatalogGenerationTarget, CATALOG_DISPLAY_PAGE_SIZE } from '../../../config/catalogLimits.js';

function makeEvidence(itemCount, sectionName = 'Services') {
  const items = Array.from({ length: itemCount }, (_, i) => ({
    sourceItemId: `item_${i}`,
    sourceOrder: i,
    name: `Service ${i + 1}`,
    itemType: 'SERVICE',
    sourceRef: 'owner_upload',
    confidence: 0.9,
    evidenceStatus: 'EXACT',
  }));
  return {
    businessIdentity: { canonicalName: 'Demo Salon', sourceConfidence: 0.9 },
    sourceDocuments: [],
    catalogEvidence: {
      detectedCatalogType: 'SERVICES',
      sections: [{ sectionName, sourceOrder: 0, items }],
      totalDetectedItems: itemCount,
      sourceCoverage: 1,
      confidence: 0.9,
    },
    mediaEvidence: { logos: [], heroCandidates: [], productImages: [], serviceImages: [], videos: [] },
    unresolvedFields: [],
    conflicts: [],
  };
}

describe('fixed-count regression', () => {
  it('8-source-item catalog compiles to 8 items (not padded to 24)', () => {
    const draft = compileSourceGroundedCatalog(makeEvidence(8));
    expect(draft.counts.total).toBe(8);
    expect(draft.sections.reduce((n, s) => n + s.items.length, 0)).toBe(8);
  });

  it('53-source-item menu preserves all 53 canonical items', () => {
    const draft = compileSourceGroundedCatalog(makeEvidence(53, 'Menu'));
    expect(draft.counts.total).toBe(53);
    expect(draft.catalogType).toBe('SERVICES');
  });

  it('3 verified services remain 3 with no generated padding', () => {
    const evidence = makeEvidence(3);
    const draft = compileSourceGroundedCatalog(evidence, {
      fallbackPolicy: { allowGeneratedItems: false, maxGeneratedItemCount: 0 },
    });
    expect(draft.counts.total).toBe(3);
    expect(draft.counts.fallback).toBe(0);
  });

  it('evidenceAuthoritative seed catalog returns exact count without min padding', () => {
    const seed = buildSeedCatalog(
      { verticalGroup: 'services', verticalSlug: 'services.generic' },
      { evidenceAuthoritative: true, evidenceItemCount: 8 },
    );
    expect(seed.items.length).toBe(8);
  });

  it('display page size is separate from generation target', () => {
    expect(CATALOG_DISPLAY_PAGE_SIZE).toBe(24);
    expect(resolveCatalogGenerationTarget({ evidenceAuthoritative: true, evidenceItemCount: 53 })).toBe(53);
    const page1 = 24;
    expect(page1).toBeLessThan(53);
  });
});
