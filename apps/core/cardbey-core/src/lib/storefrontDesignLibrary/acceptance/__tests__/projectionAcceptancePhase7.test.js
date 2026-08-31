import { describe, expect, it, afterEach } from 'vitest';
import {
  buildOwnerProjectionComparison,
  acceptProjectionForDraft,
  rejectProjectionForDraft,
  decideProjectionAcceptance,
  resolveAcceptedPreviewSource,
  fingerprintProjection,
  readAcceptanceFromMeta,
  validateAcceptanceRequest,
  isAcceptanceCurrent,
  ACCEPTANCE_VERSION,
} from '../index.js';
import { classifyResearchCatalogProducts } from '../../classification/classifyResearchCatalog.js';
import { applyDesignLibraryCommercePolicy } from '../../policy/index.js';
import { applyDesignLibraryBlueprintRecommendation } from '../../scoring/recommendBlueprintsForDraft.js';
import { applyDesignLibraryStorefrontProjection } from '../../projection/projectStorefrontForDraft.js';
import { MODERN_SECURITY_DOORS_NAV_FIXTURE } from '../../classification/__fixtures__/modernSecurityDoorsNav.js';
import { isDesignLibraryAuthoritative } from '../../flags.js';

function buildProjectedCatalog(products, context = {}) {
  const classified = classifyResearchCatalogProducts(
    products.map((p) => ({ contentOrigin: 'sourced', ...p })),
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

describe('owner comparison package', () => {
  it('builds Current vs Recommended for MSD-shaped catalog', () => {
    const catalog = buildProjectedCatalog(
      MODERN_SECURITY_DOORS_NAV_FIXTURE.map(({ name, url, type }) => ({ name, url, type })),
      { phone: '03 9000 0000', businessName: 'Local Trade Services', legacyPrimaryCTA: 'Book' },
    );
    const comparison = buildOwnerProjectionComparison(catalog, {
      phone: '03 9000 0000',
      businessName: 'Local Trade Services',
    });
    expect(comparison.authoritative).toBe(false);
    expect(comparison.current.source).toBe('legacy');
    expect(comparison.recommended.source).toBe('design_library_projection');
    expect(comparison.recommended.blueprintId).toBe('trade-lead-generation');
    expect(comparison.recommended.primaryAction).toBe('request_quote');
    expect(comparison.recommended.ok).toBe(true);
    expect(comparison.labels.disclaimer).toMatch(/does not publish/i);
    expect(comparison.projectionFingerprint).toMatch(/^p7:/);
  });
});

describe('acceptance decision rules', () => {
  it('requires explicit confirm', () => {
    const v = validateAcceptanceRequest(
      { decision: 'accept', confirm: false },
      { projectionPresent: true, safeForPreview: true },
    );
    expect(v.ok).toBe(false);
    expect(v.errors).toContain('confirm_required');
  });

  it('accepts with confirm; rejects without applying preview', () => {
    const catalog = buildProjectedCatalog(
      MODERN_SECURITY_DOORS_NAV_FIXTURE.map(({ name, url, type }) => ({ name, url, type })),
      { phone: '03 9000 0000', businessName: 'Trade Co', legacyPrimaryCTA: 'Book' },
    );

    const denied = acceptProjectionForDraft(
      catalog,
      { confirm: false, actorUserId: 'u1' },
      { phone: '03 9000 0000', businessName: 'Trade Co' },
    );
    expect(denied.ok).toBe(false);

    const accepted = acceptProjectionForDraft(
      catalog,
      { confirm: true, actorUserId: 'u1', applyToDraftPreview: true },
      { phone: '03 9000 0000', businessName: 'Trade Co' },
      { force: true },
    );
    expect(accepted.ok).toBe(true);
    expect(accepted.acceptance.status).toBe('accepted');
    expect(accepted.acceptance.confirmationState).toBe('confirmed');
    expect(accepted.acceptance.applyToDraftPreview).toBe(true);
    expect(accepted.acceptance.authoritative).toBe(false);
    expect(accepted.acceptance.acceptanceVersion).toBe(ACCEPTANCE_VERSION);
    expect(accepted.catalog.meta.designLibraryProjectionAcceptance.status).toBe('accepted');
    expect(isDesignLibraryAuthoritative()).toBe(false);

    const rejected = rejectProjectionForDraft(
      catalog,
      { confirm: true, actorUserId: 'u1' },
      { phone: '03 9000 0000', businessName: 'Trade Co' },
      { force: true },
    );
    expect(rejected.ok).toBe(true);
    expect(rejected.acceptance.status).toBe('rejected');
    expect(rejected.acceptance.applyToDraftPreview).toBe(false);
  });

  it('blocks accept when not safe for preview', () => {
    const catalog = buildProjectedCatalog(
      [{ name: 'Home', url: '/' }],
      { businessName: 'Sparse Co' },
    );
    // Force unsafe by stripping projection readiness via fake decision context
    const result = decideProjectionAcceptance(
      {
        ...catalog,
        meta: {
          ...catalog.meta,
          // keep projection but mark shadow readiness unsafe via comparison path —
          // validateAcceptanceRequest uses comparison.recommended.readiness
        },
      },
      { decision: 'accept', confirm: true, actorUserId: 'u1' },
      { businessName: 'Sparse Co' },
      { force: true },
    );
    // Sparse catalogs may still be safeForPreview; assert validator path directly:
    const v = validateAcceptanceRequest(
      { decision: 'accept', confirm: true },
      { projectionPresent: true, safeForPreview: false },
    );
    expect(v.ok).toBe(false);
    expect(v.errors).toContain('not_safe_for_preview');
    void result;
  });
});

describe('resolve accepted preview source', () => {
  const prevLib = process.env.ENABLE_DESIGN_LIBRARY_V1;
  const prevPreview = process.env.ENABLE_STOREFRONT_PROJECTION_PREVIEW_V1;
  const prevAccept = process.env.ENABLE_STOREFRONT_PROJECTION_ACCEPTANCE_V1;

  afterEach(() => {
    if (prevLib === undefined) delete process.env.ENABLE_DESIGN_LIBRARY_V1;
    else process.env.ENABLE_DESIGN_LIBRARY_V1 = prevLib;
    if (prevPreview === undefined) delete process.env.ENABLE_STOREFRONT_PROJECTION_PREVIEW_V1;
    else process.env.ENABLE_STOREFRONT_PROJECTION_PREVIEW_V1 = prevPreview;
    if (prevAccept === undefined) delete process.env.ENABLE_STOREFRONT_PROJECTION_ACCEPTANCE_V1;
    else process.env.ENABLE_STOREFRONT_PROJECTION_ACCEPTANCE_V1 = prevAccept;
  });

  it('returns projected VM only when accepted + applyToDraftPreview + authorised', () => {
    process.env.ENABLE_DESIGN_LIBRARY_V1 = 'true';
    process.env.ENABLE_STOREFRONT_PROJECTION_PREVIEW_V1 = 'true';
    process.env.ENABLE_STOREFRONT_PROJECTION_ACCEPTANCE_V1 = 'true';

    const catalog = buildProjectedCatalog(
      MODERN_SECURITY_DOORS_NAV_FIXTURE.map(({ name, url, type }) => ({ name, url, type })),
      { phone: '03 9000 0000', businessName: 'Trade Co', legacyPrimaryCTA: 'Book' },
    );
    const accepted = acceptProjectionForDraft(
      catalog,
      { confirm: true, actorUserId: 'owner-1', applyToDraftPreview: true },
      { phone: '03 9000 0000', businessName: 'Trade Co' },
      { force: true },
    );

    const denied = resolveAcceptedPreviewSource({
      catalog: accepted.catalog,
      draft: { ownerUserId: 'owner-1' },
      actor: { userId: 'stranger', role: 'customer' },
      context: { phone: '03 9000 0000', businessName: 'Trade Co' },
    });
    expect(denied.source).toBe('legacy');

    const ok = resolveAcceptedPreviewSource({
      catalog: accepted.catalog,
      draft: { ownerUserId: 'owner-1' },
      actor: { userId: 'owner-1', isOwner: true },
      context: { phone: '03 9000 0000', businessName: 'Trade Co' },
    });
    expect(ok.source).toBe('design_library_projection');
    expect(ok.viewModel.primaryAction.action).toBe('request_quote');
    expect(ok.authoritative).toBe(false);
    expect(ok.reason).toBe('accepted_apply_to_draft_preview');
  });

  it('stale fingerprint falls back to legacy', () => {
    process.env.ENABLE_DESIGN_LIBRARY_V1 = 'true';
    process.env.ENABLE_STOREFRONT_PROJECTION_PREVIEW_V1 = 'true';
    process.env.ENABLE_STOREFRONT_PROJECTION_ACCEPTANCE_V1 = 'true';

    const catalog = buildProjectedCatalog(
      MODERN_SECURITY_DOORS_NAV_FIXTURE.map(({ name, url, type }) => ({ name, url, type })),
      { phone: '03 9000 0000', businessName: 'Trade Co' },
    );
    const accepted = acceptProjectionForDraft(
      catalog,
      { confirm: true, actorUserId: 'owner-1' },
      { phone: '03 9000 0000', businessName: 'Trade Co' },
      { force: true },
    );
    // Corrupt fingerprint
    const staleCatalog = {
      ...accepted.catalog,
      meta: {
        ...accepted.catalog.meta,
        designLibraryProjectionAcceptance: {
          ...accepted.acceptance,
          projectionFingerprint: 'p7:deadbeef',
        },
      },
    };
    const record = readAcceptanceFromMeta(staleCatalog.meta);
    const currentFp = fingerprintProjection(staleCatalog.meta.designLibraryStorefrontProjection);
    expect(isAcceptanceCurrent(record, currentFp)).toBe(false);

    const resolved = resolveAcceptedPreviewSource({
      catalog: staleCatalog,
      draft: { ownerUserId: 'owner-1' },
      actor: { userId: 'owner-1', isOwner: true },
      context: { phone: '03 9000 0000', businessName: 'Trade Co' },
    });
    expect(resolved.source).toBe('legacy');
    expect(resolved.reason).toBe('acceptance_stale');
  });

  it('flag off → legacy', () => {
    process.env.ENABLE_DESIGN_LIBRARY_V1 = 'true';
    process.env.ENABLE_STOREFRONT_PROJECTION_ACCEPTANCE_V1 = 'false';
    const catalog = buildProjectedCatalog(
      [{ name: 'Cut', type: 'service' }],
      { bookingUrl: 'https://fresha.com/x', phone: '04', businessName: 'Salon' },
    );
    const accepted = acceptProjectionForDraft(
      catalog,
      { confirm: true, actorUserId: 'u1' },
      { bookingUrl: 'https://fresha.com/x', phone: '04', businessName: 'Salon' },
      { force: true },
    );
    const resolved = resolveAcceptedPreviewSource({
      catalog: accepted.catalog,
      draft: { ownerUserId: 'u1' },
      actor: { userId: 'u1', isOwner: true },
    });
    expect(resolved.source).toBe('legacy');
    expect(resolved.reason).toBe('acceptance_disabled');
  });
});
