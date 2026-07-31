import { describe, expect, it, afterEach } from 'vitest';
import {
  mapContentRoleToSection,
  selectSectionVariant,
  applyDesignLibraryStorefrontProjection,
  projectStorefrontForDraft,
  validateStorefrontProjection,
  PROJECTOR_VERSION,
} from '../index.js';
import { classifyResearchCatalogProducts } from '../../classification/classifyResearchCatalog.js';
import { applyDesignLibraryCommercePolicy } from '../../policy/index.js';
import { applyDesignLibraryBlueprintRecommendation } from '../../scoring/recommendBlueprintsForDraft.js';
import { MODERN_SECURITY_DOORS_NAV_FIXTURE } from '../../classification/__fixtures__/modernSecurityDoorsNav.js';
import { isDesignLibraryAuthoritative } from '../../flags.js';
import { finalizeResearchCatalogForDraft } from '../../../../services/draftStore/researchCatalogDraft.js';

function buildAdvisoryCatalog(products, context = {}, classifyContext = {}) {
  const classified = classifyResearchCatalogProducts(
    products.map((p) => ({
      contentOrigin: 'sourced',
      ...p,
    })),
    { force: true, ...classifyContext },
  );
  let catalog = {
    products: classified.products,
    profile: { name: context.businessName ?? 'Test Biz' },
    meta: {
      contentClassification: classified.summary,
      contentOrigin: 'sourced',
    },
  };
  catalog = applyDesignLibraryCommercePolicy(catalog, context, { force: true, emit: false }).catalog;
  catalog = applyDesignLibraryBlueprintRecommendation(catalog, context, {
    force: true,
    emit: false,
  }).catalog;
  return catalog;
}

function sectionByRole(projection, role) {
  return projection.sections.find((s) => s.role === role);
}

describe('content-role mapping', () => {
  it('maps semantic roles to correct sections', () => {
    expect(mapContentRoleToSection('service_category')).toBe('service_categories');
    expect(mapContentRoleToSection('service')).toBe('services');
    expect(mapContentRoleToSection('testimonial')).toBe('testimonials');
    expect(mapContentRoleToSection('trust_content')).toBe('trust');
    expect(mapContentRoleToSection('policy')).toBe('policies');
    expect(mapContentRoleToSection('career')).toBe('footer');
    expect(mapContentRoleToSection('navigation')).toBeNull();
    expect(mapContentRoleToSection('unknown')).toBe('_unknown_review');
  });

  it('maps location to service_area when blueprint uses service_area', () => {
    expect(
      mapContentRoleToSection('location', {
        hasServiceAreaSection: true,
        hasLocationSection: false,
      }),
    ).toBe('service_area');
  });
});

describe('section variants', () => {
  it('selects deterministic service-category variants by count', () => {
    expect(selectSectionVariant('service_categories', { itemCount: 2 }).variant).toBe('compact-cards');
    expect(selectSectionVariant('service_categories', { itemCount: 6 }).variant).toBe('card-grid');
    expect(selectSectionVariant('service_categories', { itemCount: 10 }).variant).toBe('grouped-list');
  });

  it('selects deterministic testimonial variants by count', () => {
    expect(selectSectionVariant('testimonials', { itemCount: 1 }).variant).toBe('featured-quote');
    expect(selectSectionVariant('testimonials', { itemCount: 3 }).variant).toBe('cards');
    expect(selectSectionVariant('testimonials', { itemCount: 8 }).variant).toBe('carousel');
  });

  it('gallery without media prefers empty/default path for hide', () => {
    const pick = selectSectionVariant('gallery', { itemCount: 0, hasMedia: false });
    expect(pick.reason).toMatch(/no_media|empty/);
  });
});

describe('section visibility + origins', () => {
  it('blueprint section with data → visible; optional empty → hidden', () => {
    const catalog = buildAdvisoryCatalog(
      [
        { name: 'Roller Shutters', type: 'service_category', url: '/roller' },
        { name: 'Why Choose Us', url: '/why' },
      ],
      { phone: '03 9000 0000', businessName: 'Trade Co' },
    );
    const projection = projectStorefrontForDraft(catalog, {
      phone: '03 9000 0000',
      businessName: 'Trade Co',
    });
    expect(sectionByRole(projection, 'service_categories').visibility).toBe('visible');
    expect(sectionByRole(projection, 'trust').visibility).toBe('visible');
    expect(sectionByRole(projection, 'projects').visibility).toBe('hidden');
    expect(sectionByRole(projection, 'projects').itemRefs).toEqual([]);
  });

  it('tracks sourced / suggested / mixed / review origins', () => {
    const classified = classifyResearchCatalogProducts(
      [
        {
          name: 'Roller Shutters',
          type: 'service_category',
          contentOrigin: 'sourced',
        },
        {
          name: 'Suggested Tune-up',
          type: 'service',
          contentOrigin: 'suggested',
        },
      ],
      { force: true },
    );
    // Force an unknown row after classify (short labels may otherwise resolve elsewhere).
    const products = [
      ...classified.products,
      {
        name: 'Zz',
        contentOrigin: 'sourced',
        contentRole: 'unknown',
        roleConfidence: 0.2,
        needsOwnerReview: true,
      },
    ];
    let catalog = {
      products,
      profile: { name: 'Trade Co' },
      meta: {
        contentClassification: {
          ...classified.summary,
          counts: { ...classified.summary.counts, unknown: 1 },
        },
        contentOrigin: 'sourced',
      },
    };
    catalog = applyDesignLibraryCommercePolicy(
      catalog,
      { phone: '03', businessName: 'Trade Co' },
      { force: true, emit: false },
    ).catalog;
    catalog = applyDesignLibraryBlueprintRecommendation(
      catalog,
      { phone: '03', businessName: 'Trade Co' },
      { force: true, emit: false },
    ).catalog;
    const projection = projectStorefrontForDraft(catalog, {
      phone: '03',
      businessName: 'Trade Co',
    });
    expect(projection.sourceSummary.sourcedCount).toBeGreaterThan(0);
    expect(projection.sourceSummary.suggestedCount).toBeGreaterThan(0);
    expect(projection.sourceSummary.pendingReviewCount).toBeGreaterThan(0);
    const cats = sectionByRole(projection, 'service_categories');
    expect(cats.visibility).toBe('visible');
    expect(['sourced', 'mixed']).toContain(cats.contentOrigin);
    const withSuggested = projection.sections.filter(
      (s) => s.contentOrigin === 'suggested' || s.contentOrigin === 'mixed',
    );
    expect(withSuggested.length).toBeGreaterThan(0);
    expect(projection.warnings.some((w) => w.code === 'SUGGESTED_CONTENT_USED')).toBe(true);
    expect(projection.metadata.unknownReviewBucket?.requiresOwnerReview).toBe(true);
    expect(projection.metadata.unknownReviewBucket?.visibility).toBe('collapsed');
  });
});

describe('Modern Security Doors projection', () => {
  it('projects trade-lead-generation without policies/careers/testimonials in services', () => {
    const catalog = buildAdvisoryCatalog(
      MODERN_SECURITY_DOORS_NAV_FIXTURE.map(({ name, url, type }) => ({ name, url, type })),
      { phone: '03 9000 0000', businessName: 'Local Trade Services' },
    );
    const { catalog: next, attached, projection } = applyDesignLibraryStorefrontProjection(
      catalog,
      { phone: '03 9000 0000', businessName: 'Local Trade Services' },
      { force: true },
    );
    expect(attached).toBe(true);
    expect(projection.blueprintId).toBe('trade-lead-generation');
    expect(projection.businessModel).toBe('service_quote');
    expect(projection.primaryAction).toBe('request_quote');
    expect(projection.secondaryActions).toContain('call');
    expect(projection.authoritative).toBe(false);

    const cats = sectionByRole(projection, 'service_categories');
    expect(cats.visibility).toBe('visible');
    expect(cats.itemRefs.length).toBeGreaterThanOrEqual(5);
    expect(cats.variant).toBe('grouped-list');

    const services = sectionByRole(projection, 'services');
    expect(services.visibility).toBe('visible');
    // Only the specific service row — not testimonials/policies/career
    const serviceNames = services.itemRefs.map(
      (ref) => catalog.products.find((_, i) => {
        const r = catalog.products[i];
        return r && (r.id === ref || `url:${r.url}` === ref || String(r.name).toLowerCase());
      }),
    );
    void serviceNames;
    for (const ref of services.itemRefs) {
      const item = catalog.products.find((p, idx) => {
        const url = p.url ? `url:${p.url}` : null;
        const nameRef = `name:${String(p.name).trim().toLowerCase().replace(/\s+/g, '-')}:${idx}`;
        return ref === url || ref === nameRef || ref === p.id;
      });
      expect(item?.contentRole).toBe('service');
      expect(['testimonial', 'policy', 'career', 'trust_content']).not.toContain(item?.contentRole);
    }

    expect(sectionByRole(projection, 'trust').visibility).toBe('visible');
    expect(sectionByRole(projection, 'testimonials').visibility).toBe('visible');
    expect(sectionByRole(projection, 'projects').visibility).toBe('hidden');
    expect(sectionByRole(projection, 'quote').visibility).toBe('visible');
    expect(sectionByRole(projection, 'contact').visibility).toBe('visible');

    const policies = sectionByRole(projection, 'policies');
    expect(policies.visibility).toBe('footer_only');
    expect(policies.itemRefs.length).toBeGreaterThanOrEqual(3);

    const footer = sectionByRole(projection, 'footer');
    expect(footer.itemRefs.length).toBeGreaterThanOrEqual(1);
    expect(footer.metadata?.careerPlacement).toBe('footer_only');

    expect(next.meta.designLibraryStorefrontProjection.authoritative).toBe(false);
    expect(next.meta.designLibraryCommercePolicy).toBeTruthy();
    expect(next.meta.designLibraryBlueprintRecommendation.selectedBlueprintId).toBe(
      'trade-lead-generation',
    );
  });
});

describe('fixture projections', () => {
  it('beauty booking → service-booking with services + booking', () => {
    const catalog = buildAdvisoryCatalog(
      [
        { name: 'Cut & Style', type: 'service' },
        { name: 'Colour', type: 'service' },
        { name: 'Testimonials', url: '/testimonials' },
        { name: 'Find Us', url: '/location' },
      ],
      {
        bookingUrl: 'https://www.fresha.com/a/salon',
        bookingProvider: 'fresha',
        phone: '0400111222',
        businessName: 'Glow Studio',
        facts: { address: '1 Main St' },
      },
    );
    const projection = projectStorefrontForDraft(catalog, {
      bookingUrl: 'https://www.fresha.com/a/salon',
      bookingProvider: 'fresha',
      phone: '0400111222',
      businessName: 'Glow Studio',
      facts: { address: '1 Main St' },
    });
    expect(projection.blueprintId).toBe('service-booking');
    expect(sectionByRole(projection, 'services').visibility).toBe('visible');
    expect(sectionByRole(projection, 'booking').visibility).toBe('visible');
    expect(sectionByRole(projection, 'testimonials').visibility).toBe('visible');
    expect(sectionByRole(projection, 'location').visibility).toBe('visible');
    expect(projection.primaryAction).toBe('book');
  });

  it('restaurant → restaurant-menu with menu section', () => {
    const catalog = buildAdvisoryCatalog(
      [
        { name: 'Starters', type: 'menu_category' },
        { name: 'Pad Thai', price: 18, url: '/menu/pad-thai' },
        { name: 'Find Us', url: '/location' },
      ],
      {
        businessName: 'Thai Kitchen',
        reservationUrl: 'https://opentable.com/r/x',
        facts: { reservationUrl: 'https://opentable.com/r/x', hours: '11-10', address: '2 Food St' },
      },
      { businessType: 'food_menu' },
    );
    const projection = projectStorefrontForDraft(catalog, {
      businessName: 'Thai Kitchen',
      reservationUrl: 'https://opentable.com/r/x',
      facts: { reservationUrl: 'https://opentable.com/r/x', hours: '11-10', address: '2 Food St' },
    });
    expect(projection.blueprintId).toBe('restaurant-menu');
    expect(sectionByRole(projection, 'menu').visibility).toBe('visible');
    expect(['order', 'reserve', 'enquire', 'call']).toContain(projection.primaryAction);
  });

  it('retail → retail-commerce with products', () => {
    const catalog = buildAdvisoryCatalog(
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
    const projection = projectStorefrontForDraft(catalog, { businessName: 'Widget Store' });
    expect(projection.blueprintId).toBe('retail-commerce');
    expect(sectionByRole(projection, 'products').visibility).toBe('visible');
    expect(projection.primaryAction).toBe('buy');
  });

  it('portfolio agency → portfolio-showcase with projects', () => {
    const catalog = buildAdvisoryCatalog(
      [
        { name: 'Brand Refresh — Acme', url: '/work/acme', type: 'project' },
        { name: 'Campaign — Beta', url: '/work/beta', type: 'project' },
        { name: 'Gallery', url: '/gallery' },
        { name: 'About', url: '/about' },
      ],
      { businessName: 'North Agency', phone: '0399998888' },
    );
    const projection = projectStorefrontForDraft(catalog, {
      businessName: 'North Agency',
      phone: '0399998888',
    });
    expect(projection.blueprintId).toBe('portfolio-showcase');
    expect(sectionByRole(projection, 'projects').visibility).toBe('visible');
    expect(sectionByRole(projection, 'contact').visibility).toBe('visible');
  });
});

describe('preservation, flag, validation', () => {
  const prev = process.env.ENABLE_DESIGN_LIBRARY_V1;

  afterEach(() => {
    if (prev === undefined) delete process.env.ENABLE_DESIGN_LIBRARY_V1;
    else process.env.ENABLE_DESIGN_LIBRARY_V1 = prev;
  });

  it('flag off → no projection metadata', () => {
    process.env.ENABLE_DESIGN_LIBRARY_V1 = 'false';
    const { attached, catalog } = applyDesignLibraryStorefrontProjection({
      products: [],
      meta: {
        designLibraryBlueprintRecommendation: { selectedBlueprintId: 'trade-lead-generation' },
      },
    });
    expect(attached).toBe(false);
    expect(catalog.meta.designLibraryStorefrontProjection).toBeUndefined();
  });

  it('does not mutate prior advisory metadata or provenance', () => {
    process.env.ENABLE_DESIGN_LIBRARY_V1 = 'true';
    expect(isDesignLibraryAuthoritative()).toBe(false);
    const catalog = buildAdvisoryCatalog(
      MODERN_SECURITY_DOORS_NAV_FIXTURE.map(({ name, url, type }) => ({ name, url, type })),
      { phone: '03 9000 0000', businessName: 'Trade Co' },
    );
    const beforeCommerce = { ...catalog.meta.designLibraryCommercePolicy };
    const beforeRec = { ...catalog.meta.designLibraryBlueprintRecommendation };
    const origins = catalog.products.map((p) => p.contentOrigin);
    const { catalog: next } = applyDesignLibraryStorefrontProjection(
      catalog,
      { phone: '03 9000 0000', businessName: 'Trade Co' },
      { force: true },
    );
    expect(next.meta.designLibraryCommercePolicy).toEqual(beforeCommerce);
    expect(next.meta.designLibraryBlueprintRecommendation).toEqual(beforeRec);
    expect(next.products.map((p) => p.contentOrigin)).toEqual(origins);
    expect(next.meta.designLibraryStorefrontProjection.projectorVersion).toBe(PROJECTOR_VERSION);
  });

  it('invalid projection is rejected and live path preserved', () => {
    const bad = {
      version: 1,
      projectorVersion: 1,
      blueprintId: 'trade-lead-generation',
      blueprintVersion: 1,
      businessModel: 'service_quote',
      primaryAction: 'request_quote',
      secondaryActions: [],
      sections: [
        {
          id: 'dup',
          role: 'services',
          variant: 'default',
          priority: 1,
          itemRefs: [],
          visibility: 'visible',
          contentOrigin: 'none',
          requiresOwnerReview: false,
          fallbackUsed: false,
        },
        {
          id: 'dup',
          role: 'services',
          variant: 'not-a-real-variant-xyz',
          priority: 1,
          itemRefs: [],
          visibility: 'visible',
          contentOrigin: 'none',
          requiresOwnerReview: false,
          fallbackUsed: false,
        },
      ],
      sourceSummary: { sourcedCount: 0, suggestedCount: 0, pendingReviewCount: 0 },
      classificationSummary: {},
      warnings: [],
      authoritative: false,
    };
    const result = validateStorefrontProjection(bad);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('duplicate_section_id'))).toBe(true);
  });

  it('finalizeResearchCatalogForDraft attaches projection when flag on', () => {
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
    expect(finalized.meta.designLibraryStorefrontProjection).toMatchObject({
      blueprintId: 'trade-lead-generation',
      primaryAction: 'request_quote',
      authoritative: false,
    });
    const services = finalized.meta.designLibraryStorefrontProjection.sections.find(
      (s) => s.role === 'services',
    );
    const policies = finalized.meta.designLibraryStorefrontProjection.sections.find(
      (s) => s.role === 'policies',
    );
    expect(policies.visibility).toBe('footer_only');
    expect(services.visibility).toBe('visible');
  });
});
