import { describe, expect, it, afterEach } from 'vitest';
import {
  classifyBusinessContent,
  classifyResearchCatalog,
  CLASSIFIER_VERSION,
} from '../index.js';
import { MODERN_SECURITY_DOORS_NAV_FIXTURE } from '../__fixtures__/modernSecurityDoorsNav.js';
import { finalizeResearchCatalogForDraft, stampSuggestedCatalogOrigin } from '../../../../services/draftStore/researchCatalogDraft.js';

describe('business content classification — deterministic', () => {
  it('Terms & Conditions → policy', () => {
    const r = classifyBusinessContent({ name: 'Terms & Conditions', url: '/terms' });
    expect(r.role).toBe('policy');
    expect(r.confidence).toBeGreaterThanOrEqual(0.85);
    expect(r.confidence).toBeLessThanOrEqual(1);
    expect(r.classifierVersion).toBe(CLASSIFIER_VERSION);
  });

  it('Career → career', () => {
    expect(classifyBusinessContent({ name: 'Career' }).role).toBe('career');
  });

  it('Why Choose Us → trust_content', () => {
    expect(classifyBusinessContent({ name: 'Why Choose Us' }).role).toBe('trust_content');
  });

  it('Testimonials → testimonial', () => {
    expect(classifyBusinessContent({ name: 'Testimonials' }).role).toBe('testimonial');
  });

  it('Home → navigation', () => {
    expect(classifyBusinessContent({ name: 'Home' }).role).toBe('navigation');
  });

  it('Contact Us → contact', () => {
    expect(classifyBusinessContent({ name: 'Contact Us' }).role).toBe('contact');
  });
});

describe('business content classification — offerings', () => {
  it('Roller Shutters category page → service_category', () => {
    const r = classifyBusinessContent({
      name: 'Roller Shutters',
      url: '/roller-shutters',
      type: 'service_category',
    });
    expect(r.role).toBe('service_category');
  });

  it('Roller shutter motor replacement → service', () => {
    const r = classifyBusinessContent({ name: 'Roller shutter motor replacement' });
    expect(r.role).toBe('service');
  });

  it('priced SKU page → product', () => {
    const r = classifyBusinessContent({
      name: 'Blue Widget XL',
      url: '/products/blue-widget-xl',
      price: 49.99,
      sku: 'BW-XL',
      purchaseEnabled: true,
      primaryAction: 'buy',
    });
    expect(r.role).toBe('product');
  });

  it('product collection → product_category', () => {
    const r = classifyBusinessContent(
      { name: 'Summer Collection', url: '/collections/summer' },
      { hasPurchasableChildren: true },
    );
    expect(r.role).toBe('product_category');
  });

  it('restaurant dish → menu_item', () => {
    const r = classifyBusinessContent(
      { name: 'Avocado Toast', price: 16, url: '/menu/avocado-toast' },
      { businessType: 'food_menu' },
    );
    expect(r.role).toBe('menu_item');
  });

  it('menu section → menu_category', () => {
    const r = classifyBusinessContent({ name: 'Mains' }, { businessType: 'restaurant' });
    expect(r.role).toBe('menu_category');
  });
});

describe('business content classification — ambiguity', () => {
  it('Warranty Repairs → service, not policy', () => {
    const r = classifyBusinessContent({ name: 'Warranty Repairs' });
    expect(r.role).toBe('service');
    expect(r.role).not.toBe('policy');
  });

  it('Customer Reviews in product listing context stays product-adjacent', () => {
    const r = classifyBusinessContent(
      { name: 'Customer Reviews', navigationParent: 'products' },
      { hasPurchasableChildren: true },
    );
    expect(['product', 'product_category', 'unknown', 'testimonial']).toContain(r.role);
    // Must not force policy
    expect(r.role).not.toBe('policy');
  });

  it('vague page → unknown', () => {
    const r = classifyBusinessContent({ name: 'Misc' });
    expect(r.role).toBe('unknown');
    expect(r.reason).toBe('fallback_unknown');
  });
});

describe('Modern Security Doors nav fixture (generic rules)', () => {
  it('maps all 17 rows to expected roles', () => {
    expect(MODERN_SECURITY_DOORS_NAV_FIXTURE).toHaveLength(17);
    for (const row of MODERN_SECURITY_DOORS_NAV_FIXTURE) {
      const result = classifyBusinessContent({
        name: row.name,
        url: row.url,
        type: row.type,
        contentOrigin: 'sourced',
      });
      expect(result.role, `${row.name} → ${row.expectedRole}`).toBe(row.expectedRole);
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    }
  });
});

describe('classification integration + provenance', () => {
  const prev = process.env.ENABLE_DESIGN_LIBRARY_V1;

  afterEach(() => {
    if (prev === undefined) delete process.env.ENABLE_DESIGN_LIBRARY_V1;
    else process.env.ENABLE_DESIGN_LIBRARY_V1 = prev;
  });

  it('flag on attaches roles without altering contentOrigin / review / price', () => {
    process.env.ENABLE_DESIGN_LIBRARY_V1 = 'true';
    const catalog = {
      products: [
        {
          name: 'Roller Shutters',
          type: 'service_category',
          contentOrigin: 'sourced',
          needsOwnerReview: true,
          price: null,
          sourceUrl: 'https://example.com/roller-shutters',
        },
      ],
      meta: {},
    };
    const { catalog: next, attached } = classifyResearchCatalog(catalog, {}, { emit: false });
    expect(attached).toBe(true);
    expect(next.products[0].contentRole).toBe('service_category');
    expect(next.products[0].contentOrigin).toBe('sourced');
    expect(next.products[0].needsOwnerReview).toBe(true);
    expect(next.products[0].price).toBeNull();
    expect(next.products[0].sourceUrl).toBe('https://example.com/roller-shutters');
  });

  it('flag off leaves rows unchanged via classifyResearchCatalog', () => {
    process.env.ENABLE_DESIGN_LIBRARY_V1 = 'false';
    const catalog = { products: [{ name: 'Terms & Conditions' }], meta: {} };
    const { catalog: next, attached } = classifyResearchCatalog(catalog, {}, { emit: false });
    expect(attached).toBe(false);
    expect(next.products[0].contentRole).toBeUndefined();
  });

  it('finalizeResearchCatalogForDraft preserves provenance when classifying', () => {
    process.env.ENABLE_DESIGN_LIBRARY_V1 = 'true';
    const finalized = finalizeResearchCatalogForDraft(
      {
        products: [
          {
            name: 'Payment Policy',
            url: '/payment-policy',
            contentOrigin: 'sourced',
            needsOwnerReview: false,
          },
        ],
        profile: { name: 'Demo Trade Co' },
        meta: {},
      },
      { researchRan: true, ownerConfirmed: true, confidence: 0.8, fallbackToGenerated: false },
      { businessName: 'Demo Trade Co' },
    );
    expect(finalized.products[0].contentRole).toBe('policy');
    expect(finalized.products[0].contentOrigin).toBe('sourced');
    expect(finalized.meta.contentOrigin).toBe('sourced');
  });

  it('suggested catalog keeps contentOrigin suggested after classify', () => {
    process.env.ENABLE_DESIGN_LIBRARY_V1 = 'true';
    const stamped = stampSuggestedCatalogOrigin({
      products: [{ name: 'Hair colour consultation', price: 99 }],
      meta: {},
    });
    expect(stamped.products[0].contentOrigin).toBe('suggested');
    expect(stamped.products[0].contentRole).toBe('service');
    expect(stamped.meta.contentOrigin).toBe('suggested');
  });
});
