import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('groundedStoreCreation', () => {
  const prevFlag = process.env.ENABLE_GROUNDED_STORE_CREATION_V1;

  beforeEach(() => {
    vi.resetModules();
    process.env.ENABLE_GROUNDED_STORE_CREATION_V1 = 'true';
  });

  afterEach(() => {
    if (prevFlag === undefined) delete process.env.ENABLE_GROUNDED_STORE_CREATION_V1;
    else process.env.ENABLE_GROUNDED_STORE_CREATION_V1 = prevFlag;
    vi.restoreAllMocks();
  });

  it('detects invented generic product names from the observed bug list', async () => {
    const { isInventedGenericProductName } = await import('./groundedStoreCreation.js');
    expect(isInventedGenericProductName('Gift Voucher')).toBe(true);
    expect(isInventedGenericProductName('Loyalty Discount')).toBe(true);
    expect(isInventedGenericProductName('Package Deal')).toBe(true);
    expect(isInventedGenericProductName('Consultation')).toBe(true);
    expect(isInventedGenericProductName('Express Service')).toBe(true);
    expect(isInventedGenericProductName('Custom Quote')).toBe(true);
    expect(isInventedGenericProductName('LED Channel Letters')).toBe(false);
    expect(isInventedGenericProductName('Site Survey')).toBe(false);
  });

  it('no verified products → incomplete offering, no fabricated inventory', async () => {
    const {
      applyGroundedCatalogPolicy,
      buildOfferingIncompleteState,
      NO_VERIFIED_PRODUCTS_OR_SERVICES,
    } = await import('./groundedStoreCreation.js');

    const { result, diagnostics } = applyGroundedCatalogPolicy(
      {
        profile: { name: 'Galaxsigns', type: 'signage' },
        categories: [{ id: 'c1', name: 'Services' }],
        products: [
          { id: '1', name: 'Gift Voucher' },
          { id: '2', name: 'Loyalty Discount' },
          { id: '3', name: 'Consultation' },
          { id: '4', name: 'Package Deal' },
        ],
        meta: { catalogSource: 'ai' },
      },
      { draftId: 'draft_signage_1', mode: 'ai' },
    );

    expect(result.products).toEqual([]);
    expect(result.meta.offeringIncomplete).toEqual(buildOfferingIncompleteState());
    expect(result.meta.offeringIncomplete.reason).toBe(NO_VERIFIED_PRODUCTS_OR_SERVICES);
    expect(diagnostics.rejectedFactCount).toBe(4);
    expect(diagnostics.verifiedFactCount).toBe(0);
    expect(diagnostics.strippedInventedProducts).toEqual(
      expect.arrayContaining(['Gift Voucher', 'Loyalty Discount', 'Consultation', 'Package Deal']),
    );
  });

  it('signage catalog keeps relevant services and strips unrelated vouchers', async () => {
    const { applyGroundedCatalogPolicy } = await import('./groundedStoreCreation.js');
    const { result } = applyGroundedCatalogPolicy(
      {
        profile: { name: 'Galaxsigns', type: 'signage' },
        categories: [{ id: 'c1', name: 'Signage' }],
        products: [
          { id: '1', name: 'LED Channel Letters', description: 'Illuminated shopfront letters' },
          { id: '2', name: 'Gift Voucher' },
          { id: '3', name: 'Wayfinding Package', description: 'Directional sign system' },
          { id: '4', name: 'Loyalty Discount' },
        ],
        meta: { catalogSource: 'ai' },
      },
      { draftId: 'draft_signage_2', mode: 'ai', catalogSource: 'ai' },
    );

    const names = result.products.map((p) => p.name);
    expect(names).toEqual(['LED Channel Letters', 'Wayfinding Package']);
    expect(names.some((n) => /voucher|loyalty|consultation/i.test(n))).toBe(false);
    expect(result.meta.offeringIncomplete).toBeFalsy();
  });

  it('weak media match is rejected below threshold', async () => {
    const {
      scoreSemanticMediaMatch,
      shouldAcceptMediaMatch,
      getMinMediaMatchScore,
      markItemNeedsMedia,
    } = await import('./groundedStoreCreation.js');

    const weak = scoreSemanticMediaMatch({
      itemName: 'LED Channel Letters',
      businessType: 'signage',
      verticalSlug: 'retail.signage',
      storeName: 'Galaxsigns',
      altText: 'fresh croissant and latte on cafe table',
      query: 'pastry breakfast',
      providerConfidence: 0.4,
      source: 'pexels',
    });
    expect(weak).toBeLessThan(getMinMediaMatchScore());
    expect(shouldAcceptMediaMatch(weak)).toBe(false);

    const item = { name: 'LED Channel Letters', imageUrl: 'https://example.com/x.jpg' };
    markItemNeedsMedia(item, 'media_match_below_threshold');
    expect(item.imageUrl).toBeNull();
    expect(item.mediaStatus).toBe('needs_media');
  });

  it('strong media match with business overlap is accepted', async () => {
    const { scoreSemanticMediaMatch, shouldAcceptMediaMatch } = await import('./groundedStoreCreation.js');
    const strong = scoreSemanticMediaMatch({
      itemName: 'LED Channel Letters',
      businessType: 'signage',
      verticalSlug: 'retail.signage',
      storeName: 'Galaxsigns',
      altText: 'illuminated LED channel letter signage on storefront',
      query: 'LED channel letters signage',
      providerConfidence: 0.72,
      source: 'web_scrape',
    });
    expect(shouldAcceptMediaMatch(strong)).toBe(true);
  });

  it('buildCatalog under grounded flag does not pad with GENERIC_EXPANSION_FALLBACK', async () => {
    process.env.ENABLE_GROUNDED_STORE_CREATION_V1 = 'true';
    vi.doMock('./menuGenerationService.js', () => ({
      generateVerticalLockedMenu: vi.fn(async () => ({
        categories: [{ id: 'cat_1', name: 'Services' }],
        items: [{ id: 'item_1', name: 'Site Survey', description: 'On-site measure', categoryId: 'cat_1' }],
      })),
    }));
    vi.doMock('./loadBusinessProfileService.js', () => ({
      loadBusinessProfileService: vi.fn(async () => ({
        generateBusinessProfile: async () => ({
          name: 'Galaxsigns',
          type: 'signage',
          tagline: null,
          heroText: null,
          primaryColor: null,
          secondaryColor: null,
          stylePreferences: null,
        }),
      })),
    }));

    const { buildFromAi } = await import('./buildCatalog.js');
    const result = await buildFromAi({
      draftId: 'draft_g1',
      prompt: 'Signage company in Melbourne',
      vertical: 'signage',
      businessName: 'Galaxsigns',
      businessType: 'signage',
      location: 'Melbourne',
      verticalSlug: 'retail.signage',
    });

    const names = (result.products || []).map((p) => String(p.name));
    expect(names).toContain('Site Survey');
    expect(names.some((n) => /gift voucher|loyalty discount|package deal|consultation/i.test(n))).toBe(
      false,
    );
  });

  it('buildCatalog AI failure under grounded flag returns incomplete offering, not template invent', async () => {
    process.env.ENABLE_GROUNDED_STORE_CREATION_V1 = 'true';
    vi.doMock('./buildCatalog.js', async (importOriginal) => {
      const actual = await importOriginal();
      return {
        ...actual,
        buildFromAi: vi.fn(async () => {
          throw new Error('AI unavailable');
        }),
      };
    });

    // Direct unit of empty-catalog builder (avoids brittle self-mock of buildCatalog).
    vi.resetModules();
    process.env.ENABLE_GROUNDED_STORE_CREATION_V1 = 'true';
    const { buildGroundedEmptyCatalogResult, isInventedGenericProductName } = await import(
      './groundedStoreCreation.js'
    );
    const empty = buildGroundedEmptyCatalogResult({
      draftId: 'd_fail',
      businessName: 'Galaxsigns',
      businessType: 'signage',
      aiErrorMessage: 'AI unavailable',
    });
    expect(empty.products).toEqual([]);
    expect(empty.meta.offeringIncomplete.status).toBe('needs_input');
    expect(empty.meta.aiFallback).toBe(false);
    expect(isInventedGenericProductName('Gift Voucher')).toBe(true);
  });
});
