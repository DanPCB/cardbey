import { describe, expect, it, afterEach } from 'vitest';
import {
  adaptProjectionToRenderViewModel,
  buildRenderAction,
  extractLegacyStorefrontStructure,
  compareLegacyAndProjectedStorefront,
  applyDesignLibraryRenderShadow,
  buildProjectionPreviewPayload,
  canAccessProjectionPreview,
  CURRENT_RENDERER_CAPABILITIES,
  RENDER_ACTION_LABELS,
  ADAPTER_VERSION,
} from '../index.js';
import { classifyResearchCatalogProducts } from '../../classification/classifyResearchCatalog.js';
import { applyDesignLibraryCommercePolicy } from '../../policy/index.js';
import { applyDesignLibraryBlueprintRecommendation } from '../../scoring/recommendBlueprintsForDraft.js';
import { applyDesignLibraryStorefrontProjection } from '../../projection/projectStorefrontForDraft.js';
import { MODERN_SECURITY_DOORS_NAV_FIXTURE } from '../../classification/__fixtures__/modernSecurityDoorsNav.js';
import { isDesignLibraryAuthoritative } from '../../flags.js';

function buildProjectedCatalog(products, context = {}, classifyContext = {}) {
  const classified = classifyResearchCatalogProducts(
    products.map((p) => ({ contentOrigin: 'sourced', ...p })),
    { force: true, ...classifyContext },
  );
  let catalog = {
    products: classified.products,
    profile: { name: context.businessName ?? 'Test Biz' },
    meta: {
      contentClassification: classified.summary,
      contentOrigin: 'sourced',
      primaryCTA: context.legacyPrimaryCTA ?? 'Book',
    },
  };
  catalog = applyDesignLibraryCommercePolicy(catalog, context, { force: true, emit: false }).catalog;
  catalog = applyDesignLibraryBlueprintRecommendation(catalog, context, {
    force: true,
    emit: false,
  }).catalog;
  catalog = applyDesignLibraryStorefrontProjection(catalog, context, {
    force: true,
    emit: false,
  }).catalog;
  return catalog;
}

describe('projection render adapter', () => {
  it('maps projection sections to renderer types; hides hidden; keeps footer-only', () => {
    const catalog = buildProjectedCatalog(
      MODERN_SECURITY_DOORS_NAV_FIXTURE.map(({ name, url, type }) => ({ name, url, type })),
      { phone: '03 9000 0000', businessName: 'Trade Co' },
    );
    const vm = adaptProjectionToRenderViewModel({
      projection: catalog.meta.designLibraryStorefrontProjection,
      catalogItems: catalog.products,
      businessData: {
        phone: '03 9000 0000',
        commercePolicy: catalog.meta.designLibraryCommercePolicy,
      },
    });
    expect(vm.source).toBe('design_library_projection');
    expect(vm.authoritative).toBe(false);
    expect(vm.adapterVersion).toBe(ADAPTER_VERSION);
    expect(vm.sections.every((s) => s.visibility !== 'hidden')).toBe(true);
    const policies = vm.sections.find((s) => s.semanticRole === 'policies');
    expect(policies?.visibility).toBe('footer_only');
    const services = vm.sections.find((s) => s.semanticRole === 'services');
    expect(services?.rendererType).toBe('service-list');
    expect(services?.items.every((i) => i.contentRole === 'service')).toBe(true);
    expect(vm.sections.some((s) => s.semanticRole === 'projects')).toBe(false);
  });

  it('preserves content origin and owner-review on items', () => {
    const catalog = buildProjectedCatalog(
      [
        {
          name: 'Roller Shutters',
          type: 'service_category',
          needsOwnerReview: true,
        },
      ],
      { phone: '03', businessName: 'Trade Co' },
    );
    const vm = adaptProjectionToRenderViewModel({
      projection: catalog.meta.designLibraryStorefrontProjection,
      catalogItems: catalog.products,
      businessData: { phone: '03', commercePolicy: catalog.meta.designLibraryCommercePolicy },
    });
    const cats = vm.sections.find((s) => s.semanticRole === 'service_categories');
    expect(cats.items[0].contentOrigin).toBe('sourced');
    expect(cats.items[0].requiresOwnerReview || cats.requiresOwnerReview).toBe(true);
  });
});

describe('CTA adapter', () => {
  it('service_quote → Request a quote; never Book', () => {
    const action = buildRenderAction('request_quote', {
      businessData: { phone: '03' },
      policy: { evidenceSummary: { hasPhone: true } },
    });
    expect(action.label).toBe('Request a quote');
    expect(action.action).toBe('request_quote');
    expect(action.label).not.toMatch(/book/i);
  });

  it('booking evidence → Book now; missing phone disables Call', () => {
    const book = buildRenderAction('book', {
      businessData: { bookingUrl: 'https://fresha.com/x' },
      policy: { evidenceSummary: { hasBookingUrl: true } },
    });
    expect(book.enabled).toBe(true);
    expect(book.label).toBe(RENDER_ACTION_LABELS.book);

    const call = buildRenderAction('call', {
      businessData: {},
      policy: { evidenceSummary: { hasPhone: false } },
    });
    expect(call.enabled).toBe(false);
  });

  it('priced product → Buy now; restaurant reserve label', () => {
    expect(
      buildRenderAction('buy', {
        businessData: {},
        policy: { evidenceSummary: { hasPricedPurchasableProduct: true } },
      }).label,
    ).toBe('Buy now');
    expect(
      buildRenderAction('reserve', {
        businessData: { reservationUrl: 'https://opentable.com/x' },
        policy: {},
      }).label,
    ).toBe('Reserve a table');
  });
});

describe('compatibility fallbacks + forbidden mappings', () => {
  it('trust uses content-block fallback; policies footer fallback recorded', () => {
    const catalog = buildProjectedCatalog(
      [
        { name: 'Why Choose Us', url: '/why' },
        { name: 'Terms & Conditions', url: '/terms' },
        { name: 'Career', url: '/career' },
      ],
      { phone: '03', businessName: 'Trade Co' },
    );
    const vm = adaptProjectionToRenderViewModel({
      projection: catalog.meta.designLibraryStorefrontProjection,
      catalogItems: catalog.products,
      businessData: { phone: '03', commercePolicy: catalog.meta.designLibraryCommercePolicy },
      rendererCapabilities: {
        ...CURRENT_RENDERER_CAPABILITIES,
        supportsFooterOnly: false,
      },
    });
    const trust = vm.sections.find((s) => s.semanticRole === 'trust');
    expect(trust?.rendererType).toBe('content-block');
    expect(trust?.compatibilityFallback?.used).toBe(true);
    const policies = vm.sections.find((s) => s.semanticRole === 'policies');
    expect(policies?.rendererType).toBe('footer-links');
    expect(policies?.visibility).toBe('footer_only');
  });

  it('forbids testimonial/policy/career as service commerce items', () => {
    const catalog = buildProjectedCatalog(
      MODERN_SECURITY_DOORS_NAV_FIXTURE.map(({ name, url, type }) => ({ name, url, type })),
      { phone: '03 9000 0000', businessName: 'Trade Co' },
    );
    const vm = adaptProjectionToRenderViewModel({
      projection: catalog.meta.designLibraryStorefrontProjection,
      catalogItems: catalog.products,
      businessData: {
        phone: '03 9000 0000',
        commercePolicy: catalog.meta.designLibraryCommercePolicy,
      },
    });
    const services = vm.sections.find((s) => s.semanticRole === 'services');
    for (const item of services.items) {
      expect(['testimonial', 'policy', 'career', 'trust_content']).not.toContain(item.contentRole);
      expect(item.purchaseEnabled).toBe(false);
    }
    expect(vm.primaryAction.action).toBe('request_quote');
    expect(vm.primaryAction.action).not.toBe('book');
  });
});

describe('legacy extractor', () => {
  it('extracts flat catalog as services with Book; separates template ids; no mutation', () => {
    const products = MODERN_SECURITY_DOORS_NAV_FIXTURE.map(({ name, url, type, expectedRole }) => ({
      name,
      url,
      type,
      contentRole: expectedRole,
    }));
    const store = {
      products,
      primaryCTA: 'Book',
      websiteTemplateId: 'content-tpl-1',
      contentTemplateId: 'content-tpl-1',
      theme: { templateId: 'legacy-theme-9' },
      preview: { website: { theme: { templateId: 'legacy-theme-9' } } },
    };
    const snapshot = extractLegacyStorefrontStructure(store);
    expect(snapshot.sections[0].inferredSemanticRole).toBe('services');
    expect(snapshot.sections[0].itemCount).toBe(products.length);
    expect(snapshot.sections[0].actions).toContain('book');
    expect(snapshot.websiteTemplateId).toBe('content-tpl-1');
    expect(snapshot.legacyThemeTemplateId).toBe('legacy-theme-9');
    expect(snapshot.contentTemplateId).toBe('content-tpl-1');
    expect(store.products).toHaveLength(products.length);
  });
});

describe('shadow comparison + MSD', () => {
  it('detects Book→quote and catalog semantic corrections; safeForPreview', () => {
    const catalog = buildProjectedCatalog(
      MODERN_SECURITY_DOORS_NAV_FIXTURE.map(({ name, url, type }) => ({ name, url, type })),
      { phone: '03 9000 0000', businessName: 'Local Trade Services', legacyPrimaryCTA: 'Book' },
    );
    const vm = adaptProjectionToRenderViewModel({
      projection: catalog.meta.designLibraryStorefrontProjection,
      catalogItems: catalog.products,
      businessData: {
        phone: '03 9000 0000',
        commercePolicy: catalog.meta.designLibraryCommercePolicy,
      },
    });
    const legacy = extractLegacyStorefrontStructure({
      products: catalog.products,
      primaryCTA: 'Book',
      meta: { primaryCTA: 'Book' },
    });
    const comparison = compareLegacyAndProjectedStorefront({
      legacySnapshot: legacy,
      projectedViewModel: vm,
      catalogItems: catalog.products,
    });

    expect(catalog.meta.designLibraryBlueprintRecommendation.selectedBlueprintId).toBe(
      'trade-lead-generation',
    );
    expect(vm.primaryAction.action).toBe('request_quote');
    expect(comparison.criticalFindings.some((f) => f.code === 'BOOK_CHANGED_TO_REQUEST_QUOTE')).toBe(
      true,
    );
    expect(
      comparison.criticalFindings.some((f) => f.code === 'TESTIMONIAL_REMOVED_FROM_SERVICES'),
    ).toBe(true);
    expect(comparison.criticalFindings.some((f) => f.code === 'POLICY_REMOVED_FROM_CATALOG')).toBe(
      true,
    );
    expect(comparison.criticalFindings.some((f) => f.code === 'CAREER_REMOVED_FROM_CATALOG')).toBe(
      true,
    );
    expect(comparison.criticalFindings.some((f) => f.code === 'SECTION_ADDED' && f.sectionRole === 'trust')).toBe(
      true,
    );
    expect(comparison.readiness.safeForPreview).toBe(true);
    expect(comparison.authoritative).toBe(false);
    expect(isDesignLibraryAuthoritative()).toBe(false);

    const services = vm.sections.find((s) => s.semanticRole === 'services');
    expect(services.items.every((i) => i.contentRole === 'service')).toBe(true);
    const policies = vm.sections.find((s) => s.semanticRole === 'policies');
    expect(policies.visibility).toBe('footer_only');
  });
});

describe('other fixtures', () => {
  it('beauty booking keeps Book CTA and booking section', () => {
    const catalog = buildProjectedCatalog(
      [
        { name: 'Cut', type: 'service' },
        { name: 'Colour', type: 'service' },
        { name: 'Testimonials', url: '/testimonials' },
      ],
      {
        bookingUrl: 'https://fresha.com/a/x',
        bookingProvider: 'fresha',
        phone: '0400',
        businessName: 'Glow',
      },
    );
    const vm = adaptProjectionToRenderViewModel({
      projection: catalog.meta.designLibraryStorefrontProjection,
      catalogItems: catalog.products,
      businessData: {
        bookingUrl: 'https://fresha.com/a/x',
        bookingProvider: 'fresha',
        phone: '0400',
        commercePolicy: catalog.meta.designLibraryCommercePolicy,
      },
    });
    expect(vm.blueprintId).toBe('service-booking');
    expect(vm.primaryAction.action).toBe('book');
    expect(vm.sections.some((s) => s.semanticRole === 'booking' && s.visibility === 'visible')).toBe(
      true,
    );
  });

  it('retail keeps buy; agency keeps projects without booking', () => {
    const retail = buildProjectedCatalog(
      [
        {
          name: 'Widget',
          url: '/products/w',
          price: 12,
          sku: 'W',
          purchaseEnabled: true,
        },
      ],
      { businessName: 'Shop' },
    );
    const retailVm = adaptProjectionToRenderViewModel({
      projection: retail.meta.designLibraryStorefrontProjection,
      catalogItems: retail.products,
      businessData: { commercePolicy: retail.meta.designLibraryCommercePolicy },
    });
    expect(retailVm.blueprintId).toBe('retail-commerce');
    expect(retailVm.primaryAction.action).toBe('buy');

    const agency = buildProjectedCatalog(
      [
        { name: 'Acme Brand', url: '/work/acme', type: 'project' },
        { name: 'Gallery', url: '/gallery' },
      ],
      { businessName: 'Agency', phone: '03' },
    );
    const agencyVm = adaptProjectionToRenderViewModel({
      projection: agency.meta.designLibraryStorefrontProjection,
      catalogItems: agency.products,
      businessData: { phone: '03', commercePolicy: agency.meta.designLibraryCommercePolicy },
    });
    expect(agencyVm.blueprintId).toBe('portfolio-showcase');
    expect(agencyVm.primaryAction.action).not.toBe('book');
    expect(agencyVm.sections.some((s) => s.semanticRole === 'projects')).toBe(true);
  });
});

describe('flag + preview access', () => {
  const prevLib = process.env.ENABLE_DESIGN_LIBRARY_V1;
  const prevShadow = process.env.ENABLE_STOREFRONT_PROJECTION_SHADOW_V1;
  const prevPreview = process.env.ENABLE_STOREFRONT_PROJECTION_PREVIEW_V1;

  afterEach(() => {
    if (prevLib === undefined) delete process.env.ENABLE_DESIGN_LIBRARY_V1;
    else process.env.ENABLE_DESIGN_LIBRARY_V1 = prevLib;
    if (prevShadow === undefined) delete process.env.ENABLE_STOREFRONT_PROJECTION_SHADOW_V1;
    else process.env.ENABLE_STOREFRONT_PROJECTION_SHADOW_V1 = prevShadow;
    if (prevPreview === undefined) delete process.env.ENABLE_STOREFRONT_PROJECTION_PREVIEW_V1;
    else process.env.ENABLE_STOREFRONT_PROJECTION_PREVIEW_V1 = prevPreview;
  });

  it('shadow flag off → no shadow metadata', () => {
    process.env.ENABLE_DESIGN_LIBRARY_V1 = 'true';
    process.env.ENABLE_STOREFRONT_PROJECTION_SHADOW_V1 = 'false';
    const catalog = buildProjectedCatalog(
      [{ name: 'Cut', type: 'service' }],
      { bookingUrl: 'https://fresha.com/x', businessName: 'Salon', phone: '04' },
    );
    const { attached, catalog: next } = applyDesignLibraryRenderShadow(catalog, {
      bookingUrl: 'https://fresha.com/x',
      phone: '04',
      businessName: 'Salon',
    });
    expect(attached).toBe(false);
    expect(next.meta.designLibraryRenderShadow).toBeUndefined();
  });

  it('shadow flag on → comparison attached; preview access gated', () => {
    process.env.ENABLE_DESIGN_LIBRARY_V1 = 'true';
    process.env.ENABLE_STOREFRONT_PROJECTION_SHADOW_V1 = 'true';
    process.env.ENABLE_STOREFRONT_PROJECTION_PREVIEW_V1 = 'true';
    const catalog = buildProjectedCatalog(
      MODERN_SECURITY_DOORS_NAV_FIXTURE.map(({ name, url, type }) => ({ name, url, type })),
      { phone: '03 9000 0000', businessName: 'Trade Co', legacyPrimaryCTA: 'Book' },
    );
    const { attached, catalog: next, viewModel } = applyDesignLibraryRenderShadow(
      catalog,
      { phone: '03 9000 0000', businessName: 'Trade Co' },
      { force: true },
    );
    expect(attached).toBe(true);
    expect(next.meta.designLibraryRenderShadow).toMatchObject({
      authoritative: false,
      adapterVersion: ADAPTER_VERSION,
    });
    expect(next.meta.designLibraryRenderShadow.readiness.safeForPreview).toBe(true);
    expect(viewModel.primaryAction.action).toBe('request_quote');

    expect(canAccessProjectionPreview(null)).toBe(false);
    expect(canAccessProjectionPreview({ role: 'customer' })).toBe(false);
    expect(canAccessProjectionPreview({ role: 'platform_admin' })).toBe(true);
    expect(
      canAccessProjectionPreview({ userId: 'u1', isOwner: true }, { ownerUserId: 'u1' }),
    ).toBe(true);

    process.env.ENABLE_STOREFRONT_PROJECTION_PREVIEW_V1 = 'false';
    expect(canAccessProjectionPreview({ role: 'platform_admin' })).toBe(false);

    const preview = buildProjectionPreviewPayload(catalog, {
      phone: '03 9000 0000',
      businessName: 'Trade Co',
    });
    expect(preview.ok).toBe(true);
    expect(preview.previewLabel).toMatch(/not live/i);
  });
});
