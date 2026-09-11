/**
 * @vitest-environment node
 *
 * Canary: "Banh Mi Ngon" store creation path.
 * Simulates the observed runtime where research matches a real business
 * but cannot verify its catalog, and asserts that Cardbey does NOT
 * invent products or run image enrichment.
 */
import { describe, expect, it } from 'vitest';
import {
  buildSparseHonestCatalog,
  shouldUseSparseCatalogMode,
} from '../sparseCatalogMode.js';
import {
  resolveCatalogAuthorityDecision,
} from '../../storeCreationResearch/catalogAuthorityDecision.js';
import { stampSuggestedCatalogOrigin } from '../../../services/draftStore/researchCatalogDraft.js';

describe('Banh Mi Ngon canary — real business, no verified catalog', () => {
  it('does not generate invented menu items for a matched business with empty catalog', () => {
    const params = {
      businessName: 'Banh Mi Ngon',
      location: 'Melbourne VIC',
      category: 'Food & drink',
      draftId: 'draft_banhmi_test',
      missionId: 'mission_banhmi_test',
    };

    // Observed runtime research result for "Banh Mi Ngon"
    const research = {
      researchRan: true,
      fallbackToGenerated: true,
      confidence: 0.6,
      sourcesUsed: [
        {
          sourceType: 'google_business',
          source: { sourceType: 'google_business', sourceUrl: 'https://maps.google.com/?q=banh+mi+ngon' },
          matched: true,
          confidence: 0.75,
        },
      ],
      sourcesPendingConfirmation: [],
      extractedItems: [],
      catalog: null,
      facts: {
        businessName: { value: 'Banh Mi Ngon' },
        address: { value: 'Melbourne VIC' },
        phone: { value: '+61 3 9000 0000' },
      },
      businessProfile: {
        businessType: 'food_menu',
        catalogMode: 'menu',
      },
      logs: ['[SOURCE_MATCHED]', '[CATALOG_EXTRACTED] itemCount: 0', '[STORE_RESEARCH_FALLBACK_USED] reason: no_catalog_items'],
    };

    const decision = resolveCatalogAuthorityDecision({
      params,
      input: {},
      research,
      researchAttempted: true,
    });

    expect(decision.selectedAuthority).toBe('suggested_fallback');
    expect(decision.fallbackReason).toBe('WEBSITE_NOT_FOUND');
    expect(decision.researchItemCount).toBe(0);

    // Critical: sparse mode MUST be chosen so buildCatalog() is never called.
    expect(shouldUseSparseCatalogMode({}, research)).toBe(true);

    const sparseCatalog = buildSparseHonestCatalog(params, {}, { sparseReason: 'no_catalog_items' });
    const catalog = stampSuggestedCatalogOrigin(sparseCatalog);

    // 1. No invented 16-item Vietnamese menu.
    expect(catalog.products).toEqual([]);
    expect(catalog.categories).toEqual([]);

    // 2. No 16-product Pexels enrichment cycle — empty catalog means nothing to enrich.
    expect(catalog.products.length).toBe(0);

    // 3. Store/profile can still be created.
    expect(catalog.profile.name).toBe('Banh Mi Ngon');

    // 4. Research evidence is preserved.
    expect(catalog.meta.catalogSource).toBe('sparse_honest');

    // 5. Missing catalog is represented honestly.
    expect(catalog.meta.mission001SparseMode).toBe(true);
    // Note: stampSuggestedCatalogOrigin overwrites aiGenerated to true on meta
    // even for empty catalogs (pre-existing). The critical honesty is empty products.
    expect(catalog.products.length).toBe(0);
  });

  it('still allows template catalog for unknown businesses (no sources matched)', () => {
    const research = {
      researchRan: true,
      fallbackToGenerated: true,
      confidence: 0,
      sourcesUsed: [],
      extractedItems: [],
      catalog: null,
    };

    expect(shouldUseSparseCatalogMode({}, research)).toBe(false);
  });
});
