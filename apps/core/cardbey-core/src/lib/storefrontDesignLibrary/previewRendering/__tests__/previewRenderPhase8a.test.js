import { describe, expect, it, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  resolvePreviewRenderSource,
  buildLegacyPreviewPackage,
  buildProjectionPreviewPackage,
  buildPreviewRenderPayload,
} from '../index.js';
import { acceptProjectionForDraft } from '../../acceptance/index.js';
import { classifyResearchCatalogProducts } from '../../classification/classifyResearchCatalog.js';
import { applyDesignLibraryCommercePolicy } from '../../policy/index.js';
import { applyDesignLibraryBlueprintRecommendation } from '../../scoring/recommendBlueprintsForDraft.js';
import { applyDesignLibraryStorefrontProjection } from '../../projection/projectStorefrontForDraft.js';
import { MODERN_SECURITY_DOORS_NAV_FIXTURE } from '../../classification/__fixtures__/modernSecurityDoorsNav.js';
import { canAccessProjectionPreview } from '../../rendering/projectionPreviewAccess.js';
import { isDesignLibraryAuthoritative } from '../../flags.js';
import { canAccessDraftStore } from '../../../draftOwnership.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CORE_SRC = path.resolve(__dirname, '../../../../');

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

function legacyStoreFromCatalog(catalog, extras = {}) {
  return {
    products: catalog.products,
    preview: {
      website: {
        sections: [
          { type: 'service-list', order: 1, items: catalog.products.slice(0, 3) },
        ],
        theme: { templateId: 'legacy-theme-a' },
      },
      primaryCTA: catalog.meta?.primaryCTA ?? 'Book',
      meta: catalog.meta,
    },
    meta: catalog.meta,
    primaryCTA: catalog.meta?.primaryCTA ?? 'Book',
    websiteTemplateId: 'website-tpl-1',
    contentTemplateId: 'content-tpl-1',
    ...extras,
  };
}

describe('resolvePreviewRenderSource', () => {
  const legacyPackage = { source: 'legacy', kind: 'legacy_preview_package' };
  const projectionPackage = {
    source: 'projection',
    kind: 'projection_preview_package',
    viewModel: { sections: [] },
  };
  const accepted = {
    status: 'accepted',
    applyToDraftPreview: true,
    projectionFingerprint: 'p7:abc',
    acceptedAt: '2026-07-22T00:00:00.000Z',
  };

  it('flag off → legacy + preview_render_disabled', () => {
    const r = resolvePreviewRenderSource({
      previewMode: true,
      previewRenderEnabled: false,
      acceptanceEnabled: true,
      acceptanceRecord: accepted,
      currentProjectionFingerprint: 'p7:abc',
      projectionValidation: { ok: true, errors: [] },
      legacyPackage,
      projectionPackage: null,
    });
    expect(r.primarySource).toBe('legacy');
    expect(r.reason).toBe('preview_render_disabled');
    expect(r.primaryPackage).toBe(legacyPackage);
    expect(r.authoritative).toBe(false);
  });

  it('no acceptance → legacy', () => {
    const r = resolvePreviewRenderSource({
      previewMode: true,
      previewRenderEnabled: true,
      acceptanceEnabled: true,
      acceptanceRecord: null,
      currentProjectionFingerprint: 'p7:abc',
      projectionValidation: { ok: true, errors: [] },
      legacyPackage,
      projectionPackage,
    });
    expect(r.primarySource).toBe('legacy');
    expect(r.reason).toBe('no_acceptance');
  });

  it('rejected acceptance → legacy', () => {
    const r = resolvePreviewRenderSource({
      previewMode: true,
      previewRenderEnabled: true,
      acceptanceEnabled: true,
      acceptanceRecord: { ...accepted, status: 'rejected', applyToDraftPreview: false },
      currentProjectionFingerprint: 'p7:abc',
      projectionValidation: { ok: true, errors: [] },
      legacyPackage,
      projectionPackage,
    });
    expect(r.primarySource).toBe('legacy');
    expect(r.reason).toBe('no_acceptance');
  });

  it('stale fingerprint → legacy (no throw)', () => {
    const r = resolvePreviewRenderSource({
      previewMode: true,
      previewRenderEnabled: true,
      acceptanceEnabled: true,
      acceptanceRecord: accepted,
      currentProjectionFingerprint: 'p7:other',
      projectionValidation: { ok: true, errors: [] },
      legacyPackage,
      projectionPackage,
    });
    expect(r.primarySource).toBe('legacy');
    expect(r.reason).toBe('acceptance_stale');
    expect(r.acceptance.fingerprintMatches).toBe(false);
  });

  it('missing projection package → legacy', () => {
    const r = resolvePreviewRenderSource({
      previewMode: true,
      previewRenderEnabled: true,
      acceptanceEnabled: true,
      acceptanceRecord: accepted,
      currentProjectionFingerprint: 'p7:abc',
      projectionValidation: { ok: true, errors: [] },
      legacyPackage,
      projectionPackage: null,
    });
    expect(r.primarySource).toBe('legacy');
    expect(r.reason).toBe('projection_missing');
  });

  it('invalid projection package → legacy', () => {
    const r = resolvePreviewRenderSource({
      previewMode: true,
      previewRenderEnabled: true,
      acceptanceEnabled: true,
      acceptanceRecord: accepted,
      currentProjectionFingerprint: 'p7:abc',
      projectionValidation: { ok: false, errors: ['bad'] },
      legacyPackage,
      projectionPackage,
    });
    expect(r.primarySource).toBe('legacy');
    expect(r.reason).toBe('projection_invalid');
  });

  it('valid accepted projection → projection', () => {
    const r = resolvePreviewRenderSource({
      previewMode: true,
      previewRenderEnabled: true,
      acceptanceEnabled: true,
      acceptanceRecord: accepted,
      currentProjectionFingerprint: 'p7:abc',
      projectionValidation: { ok: true, errors: [] },
      legacyPackage,
      projectionPackage,
    });
    expect(r.primarySource).toBe('projection');
    expect(r.reason).toBe('accepted_projection');
    expect(r.primaryPackage).toBe(projectionPackage);
    expect(r.packages.legacy).toBe(legacyPackage);
    expect(r.packages.projection).toBe(projectionPackage);
    expect(isDesignLibraryAuthoritative()).toBe(false);
  });
});

describe('response honesty + dual packages', () => {
  const prevFlags = {
    dl: process.env.ENABLE_DESIGN_LIBRARY_V1,
    accept: process.env.ENABLE_STOREFRONT_PROJECTION_ACCEPTANCE_V1,
    render: process.env.ENABLE_STOREFRONT_PROJECTION_PREVIEW_RENDER_V1,
    preview: process.env.ENABLE_STOREFRONT_PROJECTION_PREVIEW_V1,
  };

  afterEach(() => {
    for (const [k, envKey] of [
      ['dl', 'ENABLE_DESIGN_LIBRARY_V1'],
      ['accept', 'ENABLE_STOREFRONT_PROJECTION_ACCEPTANCE_V1'],
      ['render', 'ENABLE_STOREFRONT_PROJECTION_PREVIEW_RENDER_V1'],
      ['preview', 'ENABLE_STOREFRONT_PROJECTION_PREVIEW_V1'],
    ]) {
      if (prevFlags[k] === undefined) delete process.env[envKey];
      else process.env[envKey] = prevFlags[k];
    }
  });

  function enableAll() {
    process.env.ENABLE_DESIGN_LIBRARY_V1 = 'true';
    process.env.ENABLE_STOREFRONT_PROJECTION_ACCEPTANCE_V1 = 'true';
    process.env.ENABLE_STOREFRONT_PROJECTION_PREVIEW_RENDER_V1 = 'true';
    process.env.ENABLE_STOREFRONT_PROJECTION_PREVIEW_V1 = 'true';
  }

  it('primarySource legacy → primary equals packages.legacy; viewModel not projection-only', () => {
    enableAll();
    const catalog = buildProjectedCatalog(
      MODERN_SECURITY_DOORS_NAV_FIXTURE.map(({ name, url, type }) => ({ name, url, type })),
      { phone: '03 9000 0000', businessName: 'Trade Co', legacyPrimaryCTA: 'Book' },
    );
    const legacyStore = legacyStoreFromCatalog(catalog);
    const before = JSON.stringify(catalog);

    const payload = buildPreviewRenderPayload({
      catalog,
      legacyStore,
      context: { phone: '03 9000 0000', businessName: 'Trade Co' },
      previewMode: true,
    });

    expect(payload.primarySource).toBe('legacy');
    expect(payload.reason).toBe('no_acceptance');
    expect(payload.primaryPackage).toBe(payload.packages.legacy);
    expect(payload.packages.legacy?.source).toBe('legacy');
    expect(payload.packages.projection?.source).toBe('projection');
    expect(payload.viewModel).toBeNull();
    expect(JSON.stringify(catalog)).toBe(before);
  });

  it('valid accepted → primary projection; both packages independently renderable', () => {
    enableAll();
    const catalog = buildProjectedCatalog(
      MODERN_SECURITY_DOORS_NAV_FIXTURE.map(({ name, url, type }) => ({ name, url, type })),
      { phone: '03 9000 0000', businessName: 'Trade Co', legacyPrimaryCTA: 'Book' },
    );
    const accepted = acceptProjectionForDraft(
      catalog,
      { confirm: true, actorUserId: 'u1', applyToDraftPreview: true },
      { phone: '03 9000 0000', businessName: 'Trade Co' },
      { force: true },
    );
    expect(accepted.ok).toBe(true);
    const catalogAccepted = accepted.catalog;
    const acceptanceSnap = JSON.stringify(catalogAccepted.meta.designLibraryProjectionAcceptance);
    const projectionSnap = JSON.stringify(catalogAccepted.meta.designLibraryStorefrontProjection);
    const legacyStore = legacyStoreFromCatalog(catalogAccepted);

    const payload = buildPreviewRenderPayload({
      catalog: catalogAccepted,
      legacyStore,
      context: { phone: '03 9000 0000', businessName: 'Trade Co' },
      previewMode: true,
    });

    expect(payload.primarySource).toBe('projection');
    expect(payload.reason).toBe('accepted_projection');
    expect(payload.primaryPackage).toBe(payload.packages.projection);
    expect(payload.packages.legacy?.render?.sections).toBeDefined();
    expect(payload.packages.projection?.viewModel?.sections?.length).toBeGreaterThan(0);
    expect(payload.packages.projection?.fingerprint).toMatch(/^p7:/);
    expect(payload.packages.projection?.authoritative).toBe(false);
    expect(payload.viewModel).toBe(payload.packages.projection.viewModel);
    expect(JSON.stringify(catalogAccepted.meta.designLibraryProjectionAcceptance)).toBe(
      acceptanceSnap,
    );
    expect(JSON.stringify(catalogAccepted.meta.designLibraryStorefrontProjection)).toBe(
      projectionSnap,
    );
  });

  it('flag off omits projection package; primary legacy', () => {
    process.env.ENABLE_DESIGN_LIBRARY_V1 = 'true';
    process.env.ENABLE_STOREFRONT_PROJECTION_ACCEPTANCE_V1 = 'true';
    process.env.ENABLE_STOREFRONT_PROJECTION_PREVIEW_RENDER_V1 = 'false';
    process.env.ENABLE_STOREFRONT_PROJECTION_PREVIEW_V1 = 'true';

    const catalog = buildProjectedCatalog(
      MODERN_SECURITY_DOORS_NAV_FIXTURE.map(({ name, url, type }) => ({ name, url, type })),
      { phone: '03 9000 0000', businessName: 'Trade Co', legacyPrimaryCTA: 'Book' },
    );
    const accepted = acceptProjectionForDraft(
      catalog,
      { confirm: true, actorUserId: 'u1', applyToDraftPreview: true },
      { phone: '03 9000 0000', businessName: 'Trade Co' },
      { force: true },
    );
    const payload = buildPreviewRenderPayload({
      catalog: accepted.catalog,
      legacyStore: legacyStoreFromCatalog(accepted.catalog),
      context: { phone: '03 9000 0000', businessName: 'Trade Co' },
      previewMode: true,
    });

    expect(payload.primarySource).toBe('legacy');
    expect(payload.reason).toBe('preview_render_disabled');
    expect(payload.packages.projection).toBeNull();
    expect(payload.packages.legacy).toBeTruthy();
    expect(payload.viewModel).toBeNull();
  });

  it('stale acceptance after projection change → legacy with reason', () => {
    enableAll();
    const catalog = buildProjectedCatalog(
      MODERN_SECURITY_DOORS_NAV_FIXTURE.map(({ name, url, type }) => ({ name, url, type })),
      { phone: '03 9000 0000', businessName: 'Trade Co', legacyPrimaryCTA: 'Book' },
    );
    const accepted = acceptProjectionForDraft(
      catalog,
      { confirm: true, actorUserId: 'u1', applyToDraftPreview: true },
      { phone: '03 9000 0000', businessName: 'Trade Co' },
      { force: true },
    );
    const stale = {
      ...accepted.catalog,
      meta: {
        ...accepted.catalog.meta,
        designLibraryProjectionAcceptance: {
          ...accepted.catalog.meta.designLibraryProjectionAcceptance,
          projectionFingerprint: 'p7:stale',
        },
      },
    };
    const payload = buildPreviewRenderPayload({
      catalog: stale,
      legacyStore: legacyStoreFromCatalog(stale),
      context: { phone: '03 9000 0000', businessName: 'Trade Co' },
      previewMode: true,
    });
    expect(payload.primarySource).toBe('legacy');
    expect(payload.reason).toBe('acceptance_stale');
    expect(payload.packages.projection).toBeTruthy();
  });

  it('legacy package build does not mutate stylePreferences / sections', () => {
    const sections = [{ type: 'hero', order: 1, items: [] }];
    const stylePreferences = { miniWebsite: { sections, theme: { templateId: 't1' } } };
    const store = {
      stylePreferences,
      preview: { website: { sections, theme: { templateId: 't1' } }, primaryCTA: 'Book' },
      products: [{ name: 'Svc' }],
    };
    const before = JSON.stringify(store);
    const pkg = buildLegacyPreviewPackage(store);
    expect(pkg.source).toBe('legacy');
    expect(pkg.render.sections).not.toBe(sections);
    expect(JSON.stringify(store)).toBe(before);
  });
});

describe('security — preview access', () => {
  const prevDl = process.env.ENABLE_DESIGN_LIBRARY_V1;
  const prevPreview = process.env.ENABLE_STOREFRONT_PROJECTION_PREVIEW_V1;

  afterEach(() => {
    if (prevDl === undefined) delete process.env.ENABLE_DESIGN_LIBRARY_V1;
    else process.env.ENABLE_DESIGN_LIBRARY_V1 = prevDl;
    if (prevPreview === undefined) delete process.env.ENABLE_STOREFRONT_PROJECTION_PREVIEW_V1;
    else process.env.ENABLE_STOREFRONT_PROJECTION_PREVIEW_V1 = prevPreview;
  });

  it('owner and admin allowed; unauthorised denied', () => {
    process.env.ENABLE_DESIGN_LIBRARY_V1 = 'true';
    process.env.ENABLE_STOREFRONT_PROJECTION_PREVIEW_V1 = 'true';

    expect(
      canAccessProjectionPreview(
        { userId: 'owner-1', isOwner: true },
        { ownerUserId: 'owner-1' },
      ),
    ).toBe(true);
    expect(
      canAccessProjectionPreview({ userId: 'a1', role: 'platform_admin' }, { ownerUserId: 'owner-1' }),
    ).toBe(true);
    expect(
      canAccessProjectionPreview({ userId: 'stranger', role: 'customer' }, { ownerUserId: 'owner-1' }),
    ).toBe(false);
  });

  it('cross-tenant draft access denied', async () => {
    const draft = {
      id: 'draft-a',
      ownerUserId: 'owner-a',
      tenantId: 'tenant-a',
    };
    const allowed = await canAccessDraftStore(draft, {
      userId: 'owner-b',
      tenantKey: 'tenant-b',
      isSuperAdmin: false,
    });
    expect(allowed).toBe(false);
  });
});

describe('import isolation — previewRendering not used by public/publish', () => {
  const FORBIDDEN_DIRS = [
    path.join(CORE_SRC, 'services', 'draftStore'),
    path.join(CORE_SRC, 'services', 'publishedArtifactProjection'),
  ];
  const FORBIDDEN_FILES = [
    path.join(CORE_SRC, 'services', 'draftStore', 'publishDraftService.js'),
    path.join(CORE_SRC, 'services', 'draftStore', 'publishSnapshotService.js'),
  ];
  const NEEDLE = /previewRendering|resolvePreviewRenderSource|buildPreviewRenderPayload/;

  function walkJsFiles(dir, acc = []) {
    if (!fs.existsSync(dir)) return acc;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '__tests__') continue;
        walkJsFiles(full, acc);
      } else if (entry.isFile() && /\.(js|mjs|cjs|ts)$/.test(entry.name)) {
        acc.push(full);
      }
    }
    return acc;
  }

  it('publish + public projection services do not import preview resolver', () => {
    const files = new Set(FORBIDDEN_FILES);
    for (const dir of FORBIDDEN_DIRS) {
      for (const f of walkJsFiles(dir)) files.add(f);
    }
    /** @type {string[]} */
    const offenders = [];
    for (const file of files) {
      if (!fs.existsSync(file)) continue;
      const base = path.basename(file);
      const rel = path.relative(CORE_SRC, file).replace(/\\/g, '/');
      const isPublishRelated =
        /publish/i.test(base) ||
        rel.includes('publishedArtifactProjection/') ||
        rel.includes('services/draftStore/publish');
      if (!isPublishRelated && !rel.includes('publishedArtifactProjection/')) continue;
      const text = fs.readFileSync(file, 'utf8');
      if (NEEDLE.test(text)) offenders.push(rel);
    }
    expect(offenders).toEqual([]);
  });

  it('only draftStore projection-preview route may import previewRendering', () => {
    const routesDir = path.join(CORE_SRC, 'routes');
    const offenders = [];
    for (const file of walkJsFiles(routesDir)) {
      const rel = path.relative(CORE_SRC, file).replace(/\\/g, '/');
      const text = fs.readFileSync(file, 'utf8');
      if (!NEEDLE.test(text)) continue;
      if (rel === 'routes/draftStore.js') continue;
      offenders.push(rel);
    }
    expect(offenders).toEqual([]);
    const draftStore = fs.readFileSync(path.join(routesDir, 'draftStore.js'), 'utf8');
    expect(draftStore).toMatch(/previewRendering/);
  });

  it('dependency guard: previewRendering must not import publish services', () => {
    const previewDir = path.resolve(__dirname, '..');
    const files = walkJsFiles(previewDir);
    const publishNeedle = /publishDraftService|publishSnapshotService|publishedArtifactProjection|stylePreferences/;
    const offenders = [];
    for (const file of files) {
      if (file.includes(`${path.sep}__tests__${path.sep}`)) continue;
      const text = fs.readFileSync(file, 'utf8');
      // stylePreferences may appear in comments / legacy extract path via rendering — ban direct publish imports
      if (/from ['"].*publishDraftService|from ['"].*publishSnapshotService|from ['"].*publishedArtifactProjection/.test(text)) {
        offenders.push(path.relative(CORE_SRC, file));
      }
      void publishNeedle;
    }
    expect(offenders).toEqual([]);
  });
});

describe('package builders', () => {
  it('projection package includes required identity fields', () => {
    process.env.ENABLE_DESIGN_LIBRARY_V1 = 'true';
    const catalog = buildProjectedCatalog(
      MODERN_SECURITY_DOORS_NAV_FIXTURE.map(({ name, url, type }) => ({ name, url, type })),
      { phone: '03 9000 0000', businessName: 'Trade Co', legacyPrimaryCTA: 'Book' },
    );
    const built = buildProjectionPreviewPackage(catalog, {
      phone: '03 9000 0000',
      businessName: 'Trade Co',
    });
    expect(built.validation.ok).toBe(true);
    expect(built.package.fingerprint).toMatch(/^p7:/);
    expect(built.package.blueprintId).toBeTruthy();
    expect(built.package.viewModel).toBeTruthy();
    expect(built.package.commercePolicySummary.primaryAction).toBeTruthy();
    expect(built.package.adapterVersion).toBeGreaterThan(0);
    expect(built.package.authoritative).toBe(false);
  });
});
