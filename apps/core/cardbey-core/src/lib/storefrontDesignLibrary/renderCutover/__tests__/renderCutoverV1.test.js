import { describe, expect, it, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  resolveLiveRenderSource,
  buildLiveRenderPayload,
  assessCriticalSectionSupport,
} from '../index.js';
import { acceptProjectionForDraft } from '../../acceptance/index.js';
import { classifyResearchCatalogProducts } from '../../classification/classifyResearchCatalog.js';
import { applyDesignLibraryCommercePolicy } from '../../policy/index.js';
import { applyDesignLibraryBlueprintRecommendation } from '../../scoring/recommendBlueprintsForDraft.js';
import { applyDesignLibraryStorefrontProjection } from '../../projection/projectStorefrontForDraft.js';
import { MODERN_SECURITY_DOORS_NAV_FIXTURE } from '../../classification/__fixtures__/modernSecurityDoorsNav.js';
import {
  BEAUTY_BOOKING_FIXTURE,
  RESTAURANT_FIXTURE,
  RETAIL_FIXTURE,
  PORTFOLIO_AGENCY_FIXTURE,
  GROUNDED_INCOMPLETE_FIXTURE,
} from '../__fixtures__/renderCutoverBusinesses.js';
import { isDesignLibraryAuthoritative } from '../../flags.js';
import { PROJECTION_CUTOVER_RENDERER_CAPABILITIES } from '../../rendering/renderCompatibility.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CORE_SRC = path.resolve(__dirname, '../../../../');

function buildProjectedCatalog(products, context = {}) {
  const classified = classifyResearchCatalogProducts(
    products.map((p) => ({ contentOrigin: p.contentOrigin ?? 'sourced', ...p })),
    { force: true },
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

function legacyStoreFromCatalog(catalog) {
  return {
    products: catalog.products,
    preview: {
      website: {
        sections: [
          { type: 'catalog', order: 1, items: catalog.products.slice(0, 3) },
        ],
      },
      primaryCTA: catalog.meta?.primaryCTA ?? 'Book',
      meta: catalog.meta,
    },
    meta: catalog.meta,
    primaryCTA: catalog.meta?.primaryCTA ?? 'Book',
  };
}

function acceptCatalog(catalog, context) {
  return acceptProjectionForDraft(
    catalog,
    { confirm: true, actorUserId: 'u1', applyToDraftPreview: true },
    context,
    { force: true },
  );
}

describe('resolveLiveRenderSource', () => {
  const legacyPackage = { source: 'legacy', kind: 'legacy_live_render_package' };
  const projectionPackage = {
    source: 'projection',
    kind: 'projection_live_render_package',
    viewModel: { sections: [{ semanticRole: 'hero', visibility: 'visible' }] },
  };
  const accepted = {
    status: 'accepted',
    applyToDraftPreview: true,
    projectionFingerprint: 'p7:abc',
    acceptedAt: '2026-08-02T00:00:00.000Z',
  };

  it('flag off → legacy + render_cutover_disabled', () => {
    const r = resolveLiveRenderSource({
      renderCutoverEnabled: false,
      acceptanceEnabled: true,
      acceptanceRecord: accepted,
      currentProjectionFingerprint: 'p7:abc',
      projectionValidation: { ok: true, errors: [] },
      criticalUnsupported: false,
      legacyPackage,
      projectionPackage: null,
    });
    expect(r.primarySource).toBe('legacy');
    expect(r.reason).toBe('render_cutover_disabled');
    expect(r.authoritative).toBe(false);
  });

  it('stale acceptance → acceptance_stale', () => {
    const r = resolveLiveRenderSource({
      renderCutoverEnabled: true,
      acceptanceEnabled: true,
      acceptanceRecord: accepted,
      currentProjectionFingerprint: 'p7:other',
      projectionValidation: { ok: true, errors: [] },
      criticalUnsupported: false,
      legacyPackage,
      projectionPackage,
    });
    expect(r.primarySource).toBe('legacy');
    expect(r.reason).toBe('acceptance_stale');
  });

  it('invalid projection → projection_invalid', () => {
    const r = resolveLiveRenderSource({
      renderCutoverEnabled: true,
      acceptanceEnabled: true,
      acceptanceRecord: accepted,
      currentProjectionFingerprint: 'p7:abc',
      projectionValidation: { ok: false, errors: ['bad'] },
      criticalUnsupported: false,
      legacyPackage,
      projectionPackage,
    });
    expect(r.primarySource).toBe('legacy');
    expect(r.reason).toBe('projection_invalid');
  });

  it('unsupported critical → unsupported_critical_section', () => {
    const r = resolveLiveRenderSource({
      renderCutoverEnabled: true,
      acceptanceEnabled: true,
      acceptanceRecord: accepted,
      currentProjectionFingerprint: 'p7:abc',
      projectionValidation: { ok: true, errors: [] },
      criticalUnsupported: true,
      legacyPackage,
      projectionPackage,
    });
    expect(r.primarySource).toBe('legacy');
    expect(r.reason).toBe('unsupported_critical_section');
  });

  it('eligible → accepted_projection_render', () => {
    const r = resolveLiveRenderSource({
      renderCutoverEnabled: true,
      acceptanceEnabled: true,
      acceptanceRecord: accepted,
      currentProjectionFingerprint: 'p7:abc',
      projectionValidation: { ok: true, errors: [] },
      criticalUnsupported: false,
      legacyPackage,
      projectionPackage,
    });
    expect(r.primarySource).toBe('projection');
    expect(r.reason).toBe('accepted_projection_render');
    expect(r.primaryPackage).toBe(projectionPackage);
  });
});

describe('buildLiveRenderPayload — Modern Security Doors', () => {
  const prev = {
    dl: process.env.ENABLE_DESIGN_LIBRARY_V1,
    accept: process.env.ENABLE_STOREFRONT_PROJECTION_ACCEPTANCE_V1,
    cutover: process.env.ENABLE_STOREFRONT_PROJECTION_RENDER_CUTOVER_V1,
  };

  afterEach(() => {
    for (const [k, env] of [
      ['dl', 'ENABLE_DESIGN_LIBRARY_V1'],
      ['accept', 'ENABLE_STOREFRONT_PROJECTION_ACCEPTANCE_V1'],
      ['cutover', 'ENABLE_STOREFRONT_PROJECTION_RENDER_CUTOVER_V1'],
    ]) {
      if (prev[k] === undefined) delete process.env[env];
      else process.env[env] = prev[k];
    }
  });

  it('accepted MSD → projection VM with quote CTA, no Book, no Other, roles preserved', () => {
    process.env.ENABLE_DESIGN_LIBRARY_V1 = 'true';
    process.env.ENABLE_STOREFRONT_PROJECTION_ACCEPTANCE_V1 = 'true';
    process.env.ENABLE_STOREFRONT_PROJECTION_RENDER_CUTOVER_V1 = 'true';

    const context = {
      phone: '03 9000 0000',
      businessName: 'Modern Security Doors',
      legacyPrimaryCTA: 'Book',
    };
    const catalog = buildProjectedCatalog(
      MODERN_SECURITY_DOORS_NAV_FIXTURE.map(({ name, url, type }) => ({ name, url, type })),
      context,
    );
    const accepted = acceptCatalog(catalog, context);
    expect(accepted.ok).toBe(true);

    const metaBefore = JSON.stringify(accepted.catalog.meta);
    const acceptanceBefore = JSON.stringify(
      accepted.catalog.meta.designLibraryProjectionAcceptance,
    );
    const projectionBefore = JSON.stringify(
      accepted.catalog.meta.designLibraryStorefrontProjection,
    );

    const payload = buildLiveRenderPayload({
      catalog: accepted.catalog,
      legacyStore: legacyStoreFromCatalog(accepted.catalog),
      draftStoreId: 'draft-msd-cutover',
      context,
      emit: false,
    });

    expect(payload.primarySource).toBe('projection');
    expect(payload.reason).toBe('accepted_projection_render');
    expect(payload.bypassLegacyNormalize).toBe(true);
    expect(payload.viewModel).toBeTruthy();
    expect(payload.viewModel.primaryAction?.action).toBe('request_quote');
    expect(payload.viewModel.primaryAction?.label).not.toMatch(/book/i);
    expect(payload.rendererId).toBe(PROJECTION_CUTOVER_RENDERER_CAPABILITIES.rendererId);

    const roles = payload.viewModel.sections.map((s) => s.semanticRole);
    expect(roles).toContain('service_categories');
    expect(roles).toContain('services');
    expect(roles).toContain('trust');
    expect(roles).toContain('testimonials');

    const footerish = payload.viewModel.sections.filter(
      (s) =>
        s.visibility === 'footer_only' ||
        s.semanticRole === 'policies' ||
        s.semanticRole === 'footer',
    );
    expect(footerish.length).toBeGreaterThan(0);

    const projects = payload.viewModel.sections.find((s) => s.semanticRole === 'projects');
    if (projects) {
      expect(projects.visibility === 'hidden' || (projects.items?.length ?? 0) === 0).toBe(true);
    }

    for (const section of payload.viewModel.sections) {
      if (['services', 'products', 'menu'].includes(section.semanticRole)) {
        for (const item of section.items ?? []) {
          expect(['policy', 'career', 'testimonial', 'trust_content']).not.toContain(
            item.contentRole,
          );
        }
      }
      expect(String(section.heading || '')).not.toMatch(/^Other\s*\(/i);
    }

    // No mutation
    expect(JSON.stringify(accepted.catalog.meta)).toBe(metaBefore);
    expect(JSON.stringify(accepted.catalog.meta.designLibraryProjectionAcceptance)).toBe(
      acceptanceBefore,
    );
    expect(JSON.stringify(accepted.catalog.meta.designLibraryStorefrontProjection)).toBe(
      projectionBefore,
    );
    expect(isDesignLibraryAuthoritative()).toBe(false);
  });

  it('flag off → legacy unchanged (no projection viewModel)', () => {
    process.env.ENABLE_DESIGN_LIBRARY_V1 = 'true';
    process.env.ENABLE_STOREFRONT_PROJECTION_ACCEPTANCE_V1 = 'true';
    process.env.ENABLE_STOREFRONT_PROJECTION_RENDER_CUTOVER_V1 = 'false';

    const context = { phone: '03 9000 0000', businessName: 'Modern Security Doors' };
    const catalog = buildProjectedCatalog(
      MODERN_SECURITY_DOORS_NAV_FIXTURE.map(({ name, url, type }) => ({ name, url, type })),
      context,
    );
    const accepted = acceptCatalog(catalog, context);
    const payload = buildLiveRenderPayload({
      catalog: accepted.catalog,
      legacyStore: legacyStoreFromCatalog(accepted.catalog),
      context,
      emit: false,
    });
    expect(payload.primarySource).toBe('legacy');
    expect(payload.reason).toBe('render_cutover_disabled');
    expect(payload.viewModel).toBeNull();
    expect(payload.bypassLegacyNormalize).toBe(false);
  });

  it('invalid / missing projection package → safe legacy fallback', () => {
    process.env.ENABLE_DESIGN_LIBRARY_V1 = 'true';
    process.env.ENABLE_STOREFRONT_PROJECTION_ACCEPTANCE_V1 = 'true';
    process.env.ENABLE_STOREFRONT_PROJECTION_RENDER_CUTOVER_V1 = 'true';

    const catalog = {
      products: [],
      meta: {
        designLibraryProjectionAcceptance: {
          status: 'accepted',
          applyToDraftPreview: true,
          projectionFingerprint: 'p7:stale',
        },
      },
    };
    const payload = buildLiveRenderPayload({
      catalog,
      legacyStore: legacyStoreFromCatalog(catalog),
      emit: false,
    });
    expect(payload.primarySource).toBe('legacy');
    expect(['no_acceptance', 'acceptance_stale', 'projection_missing', 'projection_invalid']).toContain(
      payload.reason,
    );
    expect(payload.viewModel).toBeNull();
  });
});

describe('business fixtures cutover', () => {
  const prev = {
    dl: process.env.ENABLE_DESIGN_LIBRARY_V1,
    accept: process.env.ENABLE_STOREFRONT_PROJECTION_ACCEPTANCE_V1,
    cutover: process.env.ENABLE_STOREFRONT_PROJECTION_RENDER_CUTOVER_V1,
  };

  afterEach(() => {
    for (const [k, env] of [
      ['dl', 'ENABLE_DESIGN_LIBRARY_V1'],
      ['accept', 'ENABLE_STOREFRONT_PROJECTION_ACCEPTANCE_V1'],
      ['cutover', 'ENABLE_STOREFRONT_PROJECTION_RENDER_CUTOVER_V1'],
    ]) {
      if (prev[k] === undefined) delete process.env[env];
      else process.env[env] = prev[k];
    }
  });

  function runFixture(products, context, { requireAccept = true } = {}) {
    process.env.ENABLE_DESIGN_LIBRARY_V1 = 'true';
    process.env.ENABLE_STOREFRONT_PROJECTION_ACCEPTANCE_V1 = 'true';
    process.env.ENABLE_STOREFRONT_PROJECTION_RENDER_CUTOVER_V1 = 'true';
    const catalog = buildProjectedCatalog(products, context);
    const accepted = acceptCatalog(catalog, context);
    if (requireAccept) expect(accepted.ok).toBe(true);
    const cat = accepted.ok ? accepted.catalog : catalog;
    return buildLiveRenderPayload({
      catalog: cat,
      legacyStore: legacyStoreFromCatalog(cat),
      context,
      emit: false,
    });
  }

  it('beauty booking → book CTA when booking evidence present', () => {
    const payload = runFixture(BEAUTY_BOOKING_FIXTURE, {
      businessName: 'Glow Salon',
      phone: '0400 000 000',
      bookingUrl: 'https://book.example/glow',
    });
    expect(payload.primarySource).toBe('projection');
    expect(payload.viewModel.primaryAction?.action).toBe('book');
    expect(payload.viewModel.primaryAction?.label).not.toMatch(/quote/i);
  });

  it('restaurant → order/reserve vocabulary (not Book-as-quote)', () => {
    const payload = runFixture(RESTAURANT_FIXTURE, {
      businessName: 'Harbour Kitchen',
      phone: '02 9000 0000',
      reservationUrl: 'https://reserve.example/harbour',
    });
    expect(payload.primarySource).toBe('projection');
    expect(['order', 'reserve', 'enquire', 'book', 'request_quote']).toContain(
      payload.viewModel.primaryAction?.action,
    );
    if (payload.viewModel.primaryAction?.action === 'request_quote') {
      expect(payload.viewModel.primaryAction.label).not.toMatch(/^book$/i);
    }
  });

  it('retail → buy/add_to_cart when purchasable; else safe legacy if acceptance blocked', () => {
    const payload = runFixture(
      RETAIL_FIXTURE.map((p) => ({
        ...p,
        price: p.price ?? 25,
        purchaseEnabled: p.type === 'product' ? true : undefined,
      })),
      {
        businessName: 'Thread Co',
        phone: '03 1111 1111',
      },
      { requireAccept: false },
    );
    if (payload.primarySource === 'projection') {
      expect(['buy', 'add_to_cart', 'view_products', 'enquire']).toContain(
        payload.viewModel.primaryAction?.action,
      );
      expect(payload.viewModel.primaryAction?.action).not.toBe('book');
    } else {
      // Acceptance may reject unsupported primary actions — cutover must fail closed to legacy.
      expect(payload.viewModel).toBeNull();
      expect(payload.bypassLegacyNormalize).toBe(false);
    }
  });

  it('portfolio agency → projects/testimonials not flattened to services-only', () => {
    const payload = runFixture(PORTFOLIO_AGENCY_FIXTURE, {
      businessName: 'North Agency',
      phone: '03 2222 2222',
    });
    expect(payload.primarySource).toBe('projection');
    const roles = new Set(payload.viewModel.sections.map((s) => s.semanticRole));
    expect(
      roles.has('projects') || roles.has('testimonials') || roles.has('gallery') || roles.has('about'),
    ).toBe(true);
  });

  it('grounded incomplete → still projects without inventing Other catalogue', () => {
    const payload = runFixture(GROUNDED_INCOMPLETE_FIXTURE, {
      businessName: 'Sparse Doors',
      phone: '03 3333 3333',
    });
    expect(payload.primarySource).toBe('projection');
    for (const s of payload.viewModel.sections) {
      expect(String(s.heading || '')).not.toMatch(/^Other\s*\(/i);
    }
  });
});

describe('assessCriticalSectionSupport', () => {
  it('missing hero → critical', () => {
    const r = assessCriticalSectionSupport({
      sections: [{ semanticRole: 'services', visibility: 'visible', items: [{ name: 'A' }] }],
    });
    expect(r.criticalUnsupported).toBe(true);
  });
});

describe('import isolation — publish unchanged', () => {
  const NEEDLE = /renderCutover|buildLiveRenderPayload|resolveLiveRenderSource/;

  it('publishCutover modules do not import renderCutover', () => {
    const dir = path.join(CORE_SRC, 'lib/storefrontDesignLibrary/publishCutover');
    for (const name of fs.readdirSync(dir)) {
      if (!name.endsWith('.js') || name.includes('__tests__')) continue;
      const text = fs.readFileSync(path.join(dir, name), 'utf8');
      expect(text).not.toMatch(NEEDLE);
    }
  });

  it('prepareDraftStorePublishOverride still does not reference render cutover flag', () => {
    const text = fs.readFileSync(
      path.join(CORE_SRC, 'lib/storefrontDesignLibrary/publishCutover/prepareDraftStorePublishOverride.js'),
      'utf8',
    );
    expect(text).not.toMatch(/RENDER_CUTOVER/);
  });
});
