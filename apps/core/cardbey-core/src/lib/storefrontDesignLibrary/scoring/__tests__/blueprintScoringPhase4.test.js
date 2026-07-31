import { describe, expect, it, afterEach } from 'vitest';
import {
  SCORING_WEIGHTS,
  SCORER_VERSION,
  scoreBlueprint,
  scoreRegisteredBlueprints,
  scoreBlueprintById,
  recommendBlueprintsForDraft,
  applyDesignLibraryBlueprintRecommendation,
  gatherBlueprintScoringEvidence,
} from '../index.js';
import { applyDesignLibraryCommercePolicy } from '../../policy/index.js';
import { classifyResearchCatalogProducts } from '../../classification/classifyResearchCatalog.js';
import { MODERN_SECURITY_DOORS_NAV_FIXTURE } from '../../classification/__fixtures__/modernSecurityDoorsNav.js';
import { isDesignLibraryAuthoritative } from '../../flags.js';
import { listBlueprints, getBlueprint } from '../../registries/index.js';
import { finalizeResearchCatalogForDraft } from '../../../../services/draftStore/researchCatalogDraft.js';

function withPolicy(products, context = {}) {
  const classified = classifyResearchCatalogProducts(products, { force: true });
  const { catalog } = applyDesignLibraryCommercePolicy(
    { products: classified.products, meta: { contentClassification: classified.summary }, profile: { name: context.businessName ?? 'Test Biz' } },
    context,
    { force: true, emit: false },
  );
  return catalog;
}

describe('scoring weights', () => {
  it('weights are explicit and sum to 1', () => {
    const sum = Object.values(SCORING_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 9);
    expect(SCORING_WEIGHTS.businessModelFit).toBe(0.3);
    expect(SCORING_WEIGHTS.ownerPreference).toBe(0.05);
  });
});

describe('scoring dimensions', () => {
  it('business-model fit contributes strongly for preferred model', () => {
    const catalog = withPolicy(
      [{ name: 'Cut', contentRole: 'service', type: 'service' }],
      { bookingUrl: 'https://fresha.com/x', phone: '0400000000', businessName: 'Salon' },
    );
    const { scores } = scoreRegisteredBlueprints(catalog, {
      bookingUrl: 'https://fresha.com/x',
      phone: '0400000000',
      businessName: 'Salon',
    });
    const booking = scores.find((s) => s.blueprintId === 'service-booking');
    const restaurant = scores.find((s) => s.blueprintId === 'restaurant-menu');
    expect(booking.dimensions.businessModelFit).toBeGreaterThan(0.9);
    expect(restaurant.dimensions.businessModelFit).toBeLessThan(0.3);
  });

  it('content coverage contributes for matching roles', () => {
    const catalog = withPolicy(
      [
        { name: 'Roller Shutters', type: 'service_category' },
        { name: 'Fly Doors', type: 'service_category' },
        { name: 'Testimonials', url: '/testimonials' },
      ],
      { phone: '03 9000 0000', businessName: 'Trade Co' },
    );
    const trade = scoreBlueprintById('trade-lead-generation', catalog, {
      phone: '03 9000 0000',
      businessName: 'Trade Co',
    });
    expect(trade.matchedContentRoles).toEqual(
      expect.arrayContaining(['service_category', 'testimonial']),
    );
    expect(trade.dimensions.contentCoverage).toBeGreaterThan(0.5);
  });

  it('primary CTA fit outweighs secondary CTA fit', () => {
    const catalog = withPolicy(
      [{ name: 'Widget', contentRole: 'product', price: 20, purchaseEnabled: true, sku: 'W1' }],
      { businessName: 'Shop' },
    );
    const retail = getBlueprint('retail-commerce');
    const evidence = gatherBlueprintScoringEvidence(catalog, { businessName: 'Shop' });
    // Force primary buy (supported) vs hypothetically unsupported secondary already handled
    expect(evidence.primaryAction).toBe('buy');
    const scored = scoreBlueprint(retail, evidence);
    const primaryReason = scored.reasons.find((r) => r.code === 'primary_action_supported');
    const secondaryReason = scored.reasons.find((r) => r.code === 'secondary_action_supported');
    expect(primaryReason.contribution).toBeGreaterThan(secondaryReason?.contribution ?? 0);
  });

  it('missing optional data has limited penalty vs required', () => {
    const catalog = withPolicy(
      [{ name: 'Cut', type: 'service' }],
      { bookingUrl: 'https://bookwell.com/x', businessName: 'Salon' },
    );
    const withName = scoreBlueprintById('service-booking', catalog, {
      bookingUrl: 'https://bookwell.com/x',
      businessName: 'Salon',
    });
    const withoutName = scoreBlueprintById('service-booking', {
      ...catalog,
      profile: {},
      meta: { ...catalog.meta },
    }, {
      bookingUrl: 'https://bookwell.com/x',
      // no businessName
    });
    expect(withName.missingRequiredData).toHaveLength(0);
    expect(withoutName.missingRequiredData).toContain('businessName');
    expect(withName.score).toBeGreaterThan(withoutName.score);
    // Optional gap alone should not crater score when required present
    expect(withName.dimensions.requiredDataReadiness).toBeGreaterThan(0.7);
  });
});

describe('determinism', () => {
  it('same evidence → same ordering', () => {
    const catalog = withPolicy(
      MODERN_SECURITY_DOORS_NAV_FIXTURE.map(({ name, url, type }) => ({ name, url, type })),
      { phone: '03 9000 0000', businessName: 'Trade Co' },
    );
    const a = scoreRegisteredBlueprints(catalog, { phone: '03 9000 0000', businessName: 'Trade Co' });
    const b = scoreRegisteredBlueprints(catalog, { phone: '03 9000 0000', businessName: 'Trade Co' });
    expect(a.scores.map((s) => s.blueprintId)).toEqual(b.scores.map((s) => s.blueprintId));
    expect(a.scores.map((s) => s.score)).toEqual(b.scores.map((s) => s.score));
  });

  it('ties resolve by blueprintId ascending', async () => {
    const { compareBlueprintScores } = await import('../blueprintScoreResult.js');
    const tied = [
      { blueprintId: 'retail-commerce', score: 0.5 },
      { blueprintId: 'portfolio-showcase', score: 0.5 },
      { blueprintId: 'trade-lead-generation', score: 0.5 },
    ];
    const sorted = [...tied].sort(compareBlueprintScores);
    expect(sorted.map((s) => s.blueprintId)).toEqual([
      'portfolio-showcase',
      'retail-commerce',
      'trade-lead-generation',
    ]);
  });
});

describe('registry integration', () => {
  it('scores all registered blueprints', () => {
    const catalog = withPolicy([{ name: 'A', type: 'service' }], { businessName: 'X' });
    const { scores } = scoreRegisteredBlueprints(catalog, { businessName: 'X' });
    expect(scores).toHaveLength(listBlueprints().length);
    expect(scores.map((s) => s.blueprintId).sort()).toEqual(
      listBlueprints().map((b) => b.id).sort(),
    );
  });

  it('rejects unknown blueprint id', () => {
    const catalog = withPolicy([{ name: 'A', type: 'service' }], { businessName: 'X' });
    expect(() => scoreBlueprintById('not-a-real-blueprint', catalog, { businessName: 'X' })).toThrow(
      /Unknown blueprint/,
    );
  });
});

describe('owner preference', () => {
  it('adds bounded boost when compatible', () => {
    const catalog = withPolicy(
      [{ name: 'Cut', type: 'service' }],
      { bookingUrl: 'https://fresha.com/x', phone: '04', businessName: 'Salon' },
    );
    const base = recommendBlueprintsForDraft(catalog, {
      bookingUrl: 'https://fresha.com/x',
      phone: '04',
      businessName: 'Salon',
    });
    const boosted = recommendBlueprintsForDraft(catalog, {
      bookingUrl: 'https://fresha.com/x',
      phone: '04',
      businessName: 'Salon',
      preferredBlueprintId: 'service-booking',
    });
    expect(boosted.selected.blueprintId).toBe('service-booking');
    const baseScore = base.allScores.find((s) => s.blueprintId === 'service-booking').score;
    const boostScore = boosted.allScores.find((s) => s.blueprintId === 'service-booking').score;
    expect(boostScore).toBeGreaterThanOrEqual(baseScore);
    expect(boostScore - baseScore).toBeLessThanOrEqual(SCORING_WEIGHTS.ownerPreference + 0.001);
  });

  it('cannot overcome strong retail incompatibility (beauty preview)', () => {
    const catalog = withPolicy(
      [
        {
          name: 'Widget',
          contentRole: 'product',
          price: 49,
          purchaseEnabled: true,
          sku: 'W-1',
        },
      ],
      { businessName: 'Retail Shop' },
    );
    const rec = recommendBlueprintsForDraft(catalog, {
      businessName: 'Retail Shop',
      preferredPreviewSampleId: 'beauty-and-wellness', // → service-booking
    });
    expect(rec.selected.blueprintId).toBe('retail-commerce');
    expect(rec.selected.blueprintId).not.toBe('service-booking');
    const booking = rec.allScores.find((s) => s.blueprintId === 'service-booking');
    expect(booking.penalties.some((p) => p.code === 'owner_preference_blocked_incompatible' || p.code.startsWith('ineligible') || p.code.includes('mismatch'))).toBe(true);
  });
});

describe('Modern Security Doors regression', () => {
  it('selects trade-lead-generation with portfolio alternative; booking penalized', () => {
    const catalog = withPolicy(
      MODERN_SECURITY_DOORS_NAV_FIXTURE.map(({ name, url, type }) => ({ name, url, type })),
      { phone: '03 9000 0000', businessName: 'Local Trade Services' },
    );
    const rec = recommendBlueprintsForDraft(catalog, {
      phone: '03 9000 0000',
      businessName: 'Local Trade Services',
    });

    expect(rec.authoritative).toBe(false);
    expect(rec.selected.blueprintId).toBe('trade-lead-generation');
    expect(rec.alternatives.map((a) => a.blueprintId)).toContain('portfolio-showcase');
    expect(rec.alternatives.map((a) => a.blueprintId)).not.toContain('service-booking');

    const booking = rec.allScores.find((s) => s.blueprintId === 'service-booking');
    expect(booking.eligible).toBe(false);
    expect(booking.penalties.some((p) => /booking|quote/i.test(p.code + (p.detail ?? '')))).toBe(true);

    const restaurant = rec.allScores.find((s) => s.blueprintId === 'restaurant-menu');
    expect(restaurant.eligible).toBe(false);

    expect(catalog.meta.designLibraryCommercePolicy.businessModel).toBe('service_quote');
    expect(catalog.meta.designLibraryCommercePolicy.primaryAction).toBe('request_quote');
    expect(rec.selected.actionFit.primaryActionSupported).toBe(true);
  });
});

describe('fixture selections', () => {
  it('beauty salon with Fresha → service-booking', () => {
    const catalog = withPolicy(
      [
        { name: 'Cut & Blow Dry', type: 'service' },
        { name: 'Colour', type: 'service' },
        { name: 'Gallery', url: '/gallery' },
      ],
      {
        bookingUrl: 'https://www.fresha.com/a/salon',
        bookingProvider: 'fresha',
        phone: '0400111222',
        businessName: 'Glow Studio',
      },
    );
    const rec = recommendBlueprintsForDraft(catalog, {
      bookingUrl: 'https://www.fresha.com/a/salon',
      bookingProvider: 'fresha',
      phone: '0400111222',
      businessName: 'Glow Studio',
    });
    expect(rec.selected.blueprintId).toBe('service-booking');
    expect(rec.alternatives.map((a) => a.blueprintId)).toContain('portfolio-showcase');
    const trade = rec.allScores.find((s) => s.blueprintId === 'trade-lead-generation');
    expect(trade.score).toBeLessThan(rec.selected.score);
  });

  it('restaurant with menu + reservation → restaurant-menu', () => {
    const catalog = withPolicy(
      [
        { name: 'Starters', type: 'menu_category' },
        { name: 'Pad Thai', price: 18, url: '/menu/pad-thai' },
        { name: 'Location', url: '/location' },
      ],
      {
        businessName: 'Thai Kitchen',
        reservationUrl: 'https://www.opentable.com/r/x',
        businessType: 'food_menu',
        facts: { reservationUrl: 'https://www.opentable.com/r/x' },
      },
    );
    // ensure classification gets menu_item
    const classified = classifyResearchCatalogProducts(
      [
        { name: 'Starters', type: 'menu_category' },
        { name: 'Pad Thai', price: 18, url: '/menu/pad-thai' },
        { name: 'Find Us', url: '/location' },
      ],
      { force: true, businessType: 'food_menu' },
    );
    const { catalog: cat } = applyDesignLibraryCommercePolicy(
      {
        products: classified.products,
        meta: { contentClassification: classified.summary },
        profile: { name: 'Thai Kitchen' },
      },
      {
        businessName: 'Thai Kitchen',
        reservationUrl: 'https://www.opentable.com/r/x',
        facts: { reservationUrl: 'https://www.opentable.com/r/x' },
        businessType: 'food_menu',
      },
      { force: true, emit: false },
    );
    const rec = recommendBlueprintsForDraft(cat, {
      businessName: 'Thai Kitchen',
      reservationUrl: 'https://www.opentable.com/r/x',
      facts: { reservationUrl: 'https://www.opentable.com/r/x' },
    });
    expect(rec.selected.blueprintId).toBe('restaurant-menu');
    void catalog;
  });

  it('retail with priced products → retail-commerce', () => {
    const catalog = withPolicy(
      [
        {
          name: 'Blue Widget',
          url: '/products/blue',
          price: 29.99,
          sku: 'BW',
          purchaseEnabled: true,
        },
        { name: 'Accessories', url: '/collections/accessories' },
      ],
      { businessName: 'Widget Store' },
    );
    const rec = recommendBlueprintsForDraft(catalog, { businessName: 'Widget Store' });
    expect(rec.selected.blueprintId).toBe('retail-commerce');
  });

  it('creative agency with projects → portfolio-showcase', () => {
    const catalog = withPolicy(
      [
        { name: 'Brand Refresh — Acme', url: '/work/acme', type: 'project' },
        { name: 'Campaign — Beta', url: '/work/beta', type: 'project' },
        { name: 'Gallery', url: '/gallery' },
        { name: 'About', url: '/about' },
      ],
      { businessName: 'North Agency', phone: '0399998888' },
    );
    const rec = recommendBlueprintsForDraft(catalog, {
      businessName: 'North Agency',
      phone: '0399998888',
    });
    expect(rec.selected.blueprintId).toBe('portfolio-showcase');
    expect(rec.alternatives.map((a) => a.blueprintId)).toContain('trade-lead-generation');
  });

  it('minimal new business still recommends with lower confidence', () => {
    const catalog = withPolicy([{ name: 'Home', url: '/' }], { businessName: 'New Co' });
    const rec = recommendBlueprintsForDraft(catalog, {
      businessName: 'New Co',
      preferredPreviewSampleId: 'trades-and-services',
    });
    expect(rec.selected.blueprintId).toBeTruthy();
    expect(rec.authoritative).toBe(false);
    expect(rec.confidence).toBeLessThan(0.85);
  });
});

describe('apply + flag + provenance', () => {
  const prev = process.env.ENABLE_DESIGN_LIBRARY_V1;

  afterEach(() => {
    if (prev === undefined) delete process.env.ENABLE_DESIGN_LIBRARY_V1;
    else process.env.ENABLE_DESIGN_LIBRARY_V1 = prev;
  });

  it('flag off → no recommendation metadata', () => {
    process.env.ENABLE_DESIGN_LIBRARY_V1 = 'false';
    const { catalog, attached } = applyDesignLibraryBlueprintRecommendation({
      products: [{ name: 'X', contentRole: 'service' }],
      meta: {},
    });
    expect(attached).toBe(false);
    expect(catalog.meta?.designLibraryBlueprintRecommendation).toBeUndefined();
  });

  it('flag on → advisory recommendation; authority false', () => {
    process.env.ENABLE_DESIGN_LIBRARY_V1 = 'true';
    expect(isDesignLibraryAuthoritative()).toBe(false);
    const base = withPolicy(
      MODERN_SECURITY_DOORS_NAV_FIXTURE.map(({ name, url, type }) => ({ name, url, type })),
      { phone: '03 9000 0000', businessName: 'Trade Co' },
    );
    const origin = base.meta.contentOrigin;
    const commerce = { ...base.meta.designLibraryCommercePolicy };
    const { catalog, attached } = applyDesignLibraryBlueprintRecommendation(
      base,
      { phone: '03 9000 0000', businessName: 'Trade Co' },
      { force: true },
    );
    expect(attached).toBe(true);
    expect(catalog.meta.designLibraryBlueprintRecommendation).toMatchObject({
      selectedBlueprintId: 'trade-lead-generation',
      authoritative: false,
      scorerVersion: SCORER_VERSION,
    });
    expect(catalog.meta.contentOrigin).toBe(origin);
    expect(catalog.meta.designLibraryCommercePolicy).toEqual(commerce);
  });

  it('finalizeResearchCatalogForDraft attaches blueprint recommendation when flag on', () => {
    process.env.ENABLE_DESIGN_LIBRARY_V1 = 'true';
    const finalized = finalizeResearchCatalogForDraft(
      {
        products: MODERN_SECURITY_DOORS_NAV_FIXTURE.map(({ name, url, type }) => ({
          name,
          url,
          type,
          priceWasNotExplicitlyProvided: true,
          price: null,
        })),
        profile: { name: 'Local Trade Services' },
      },
      {
        confidence: 0.9,
        businessProfile: {
          businessType: 'service_quote_required',
          catalogMode: 'services',
          presentation: { primaryCTA: 'Book' },
        },
        facts: { phone: '03 9000 0000' },
        ownerConfirmed: true,
      },
      { businessName: 'Local Trade Services' },
    );

    expect(finalized.meta.primaryCTA).toBe('Book');
    expect(finalized.meta.designLibraryBlueprintRecommendation).toMatchObject({
      selectedBlueprintId: 'trade-lead-generation',
      authoritative: false,
    });
    expect(finalized.meta.designLibraryCommercePolicy.primaryAction).toBe('request_quote');
  });
});
