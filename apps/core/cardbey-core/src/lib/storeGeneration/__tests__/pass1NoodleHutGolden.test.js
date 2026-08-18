/**
 * Pass 1 golden journey — NOODLE hut authority stabilization.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { resolveVerticalSlug } from '../../../services/draftStore/verticalResolver.js';
import { inferCurrencyFromLocationText } from '../../../services/draftStore/currencyInfer.js';
import { textSuggestsFoodVertical } from '../foodVerticalLexicon.js';
import { displayBusinessTypeForCopy } from '../../../services/draftStore/storeCreationAuthorityTrace.js';
import { buildCuisineMenuCatalog } from '../../../services/draftStore/foodCuisineCatalog.js';

describe('Pass1 NOODLE hut golden journey', () => {
  const prevFlag = process.env.ENABLE_GROUNDED_STORE_CREATION_V1;

  beforeEach(() => {
    vi.resetModules();
    process.env.ENABLE_GROUNDED_STORE_CREATION_V1 = 'true';
  });

  afterEach(() => {
    if (prevFlag === undefined) delete process.env.ENABLE_GROUNDED_STORE_CREATION_V1;
    else process.env.ENABLE_GROUNDED_STORE_CREATION_V1 = prevFlag;
  });

  it('identity + food vertical + AUD from VIC evidence', () => {
    expect(textSuggestsFoodVertical('NOODLE hut')).toBe(true);
    expect(resolveVerticalSlug('NOODLE hut', null)).toBe('food');
    expect(inferCurrencyFromLocationText('120 Station Street, Fairfield VIC 3078')).toBe('AUD');
  });

  it('never interpolates Other into customer-facing copy', () => {
    expect(displayBusinessTypeForCopy('Other', 'FOOD_TAKEAWAY')).toBe('food business');
    expect(displayBusinessTypeForCopy('Other', null)).toBe('local business');
    const leak = `Welcome to NOODLE hut — quality ${displayBusinessTypeForCopy('Other', 'FOOD_TAKEAWAY')} you can trust.`;
    expect(leak).not.toMatch(/\bOther\b/);
  });

  it('cuisine bank invent is forbidden under grounded', () => {
    const blocked = buildCuisineMenuCatalog(
      { verticalSlug: 'food.asian', businessName: 'NOODLE hut', businessType: 'Food & drink' },
      12,
      { grounded: true },
    );
    expect(blocked).toBeNull();
  });

  it('cuisine bank stamps GENERATED_FALLBACK when allowed (flag-off path)', () => {
    const catalog = buildCuisineMenuCatalog(
      { verticalSlug: 'food.asian', businessName: 'NOODLE hut' },
      6,
      { grounded: false },
    );
    expect(catalog?.items?.some((i) => i.name === 'Edamame')).toBe(true);
    expect(catalog.items[0].provenanceStatus).toBe('GENERATED_FALLBACK');
    expect(catalog.meta.catalogSource).toBe('cuisine_template');
  });

  it('invent-stop: card OCR alone does not authorize AI/template invent', async () => {
    const { shouldSkipAiInventForGrounded, hasAuthoritativeOfferings } = await import(
      '../../../services/draftStore/groundedStoreCreation.js'
    );
    expect(
      hasAuthoritativeOfferings({
        ocrRawText: 'NOODLE hut\n120 Station Street\nFairfield VIC 3078\n(03) 9481 3442',
        mode: 'ai',
      }),
    ).toBe(false);
    expect(
      shouldSkipAiInventForGrounded({
        mode: 'ai',
        ocrRawText: 'NOODLE hut\n120 Station Street Fairfield VIC',
        photoDataUrl: 'data:image/png;base64,xxx',
      }),
    ).toBe(true);
    expect(
      shouldSkipAiInventForGrounded({
        mode: 'template',
        businessName: 'NOODLE hut',
      }),
    ).toBe(true);
  });

  it('Edamame cuisine invent is stripped by grounded catalog policy', async () => {
    const { applyGroundedCatalogPolicy, isCuisineBankProductName } = await import(
      '../../../services/draftStore/groundedStoreCreation.js'
    );
    expect(isCuisineBankProductName('Edamame')).toBe(true);
    const { result } = applyGroundedCatalogPolicy(
      {
        profile: { name: 'NOODLE hut' },
        categories: [{ id: 'c1', name: 'Starters' }],
        products: [
          {
            id: '1',
            name: 'Edamame',
            description: 'Steamed soybeans with sea salt.',
            price: '$8.00',
            origin: 'cuisine_bank',
            provenanceStatus: 'GENERATED_FALLBACK',
          },
          { id: '2', name: 'Gift Voucher' },
        ],
        meta: { catalogSource: 'cuisine_template' },
      },
      { draftId: 'noodle_golden', mode: 'template' },
    );
    expect(result.products).toEqual([]);
    expect(result.meta?.offeringIncomplete).toBeTruthy();
  });

  it('finalize invent-stop boundary: empty stays empty after policy', async () => {
    const { applyGroundedCatalogPolicy, buildGroundedEmptyCatalogResult } = await import(
      '../../../services/draftStore/groundedStoreCreation.js'
    );
    const empty = buildGroundedEmptyCatalogResult({ draftId: 'n1', businessName: 'NOODLE hut' });
    const { result } = applyGroundedCatalogPolicy(empty, { draftId: 'n1', mode: 'ai' });
    expect(result.products).toEqual([]);
    // Simulate finalize NOT calling cuisine repair — products remain empty.
    expect(Array.isArray(result.products) && result.products.length === 0).toBe(true);
  });

  it('item media mismatches fail semantic gate', async () => {
    const { scoreSemanticMediaMatch, shouldAcceptMediaMatch } = await import(
      '../../../services/draftStore/groundedStoreCreation.js'
    );
    const edamameNoodle = scoreSemanticMediaMatch({
      itemName: 'Edamame',
      businessType: 'Food & drink',
      altText: 'noodle takeaway box stir fried',
      filename: 'pad-thai-box.jpg',
      query: 'Edamame',
      providerConfidence: 0.8,
      source: 'pexels',
    });
    expect(shouldAcceptMediaMatch(edamameNoodle)).toBe(false);

    const plumbSalon = scoreSemanticMediaMatch({
      itemName: 'Blocked drain repair',
      businessType: 'plumbing',
      altText: 'beauty salon nail manicure',
      query: 'plumbing',
      providerConfidence: 0.8,
      source: 'pexels',
    });
    expect(shouldAcceptMediaMatch(plumbSalon)).toBe(false);

    const hairBurger = scoreSemanticMediaMatch({
      itemName: 'Haircut',
      businessType: 'salon',
      altText: 'hamburger fries fast food',
      query: 'haircut',
      providerConfidence: 0.8,
      source: 'pexels',
    });
    expect(shouldAcceptMediaMatch(hairBurger)).toBe(false);

    const coffeeOffice = scoreSemanticMediaMatch({
      itemName: 'Flat White',
      businessType: 'cafe',
      altText: 'corporate office meeting desk',
      query: 'coffee',
      providerConfidence: 0.8,
      source: 'pexels',
    });
    expect(shouldAcceptMediaMatch(coffeeOffice)).toBe(false);
  });

  it('authority trace + grounding status', async () => {
    const { buildAuthorityTraceFromPreview, evaluateStoreCreationGrounding } = await import(
      '../../../services/draftStore/storeCreationAuthorityTrace.js'
    );
    const preview = {
      storeName: 'NOODLE hut',
      storeType: 'Food & drink',
      primaryCTA: 'Order Now',
      items: [],
      meta: {
        currencyCode: 'AUD',
        catalogSource: 'none',
        offeringIncomplete: { status: 'needs_input' },
        groundedComposition: { archetype: 'FOOD_TAKEAWAY', primaryCTA: 'Order Now' },
      },
      slogan: 'Welcome to NOODLE hut — quality & flavor you can trust.',
    };
    const g = evaluateStoreCreationGrounding({
      preview,
      products: [],
      location: 'Fairfield VIC 3078',
      currencyCode: 'AUD',
      groundedComposition: preview.meta.groundedComposition,
      catalogMeta: preview.meta,
    });
    expect(g.groundingStatus).toBe('PASS_WITH_GAPS');
    expect(g.blockers).not.toContain('identity_other_leak');

    const blocked = evaluateStoreCreationGrounding({
      preview: {
        ...preview,
        storeType: 'Other',
        slogan: 'Welcome to NOODLE hut — quality Other you can trust.',
        website: { sections: [{ type: 'hero', content: { subheadline: 'quality Other you can trust' } }] },
        items: [
          {
            name: 'Edamame',
            provenanceStatus: 'SOURCED',
            origin: 'cuisine_bank',
          },
        ],
      },
      products: [
        { name: 'Edamame', provenanceStatus: 'SOURCED', origin: 'cuisine_bank' },
      ],
      location: 'Fairfield VIC',
      currencyCode: 'USD',
      groundedComposition: { archetype: 'FOOD_TAKEAWAY' },
    });
    expect(blocked.groundingStatus).toBe('BLOCKED');
    expect(blocked.blockers.length).toBeGreaterThan(0);

    const trace = buildAuthorityTraceFromPreview({
      preview,
      location: 'Fairfield VIC 3078',
      currencyCode: 'AUD',
    });
    expect(trace.fields.businessName.value).toBe('NOODLE hut');
    expect(trace.fields.CTA.value).toBe('Order Now');
    expect(trace.version).toBe(1);
  });
});
