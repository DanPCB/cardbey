import { describe, expect, it, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  resolvePublishSnapshotSource,
  buildProjectionPublishPackage,
  validatePublishSnapshot,
  buildPublishProvenance,
  prepareDraftStorePublishOverride,
  emitStorefrontPublishCompleted,
} from '../index.js';
import { acceptProjectionForDraft } from '../../acceptance/index.js';
import { classifyResearchCatalogProducts } from '../../classification/classifyResearchCatalog.js';
import { applyDesignLibraryCommercePolicy } from '../../policy/index.js';
import { applyDesignLibraryBlueprintRecommendation } from '../../scoring/recommendBlueprintsForDraft.js';
import { applyDesignLibraryStorefrontProjection } from '../../projection/projectStorefrontForDraft.js';
import { MODERN_SECURITY_DOORS_NAV_FIXTURE } from '../../classification/__fixtures__/modernSecurityDoorsNav.js';
import { isDesignLibraryAuthoritative } from '../../flags.js';

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

function legacyPreviewFromCatalog(catalog) {
  return {
    items: catalog.products,
    storeName: catalog.profile?.name || 'Test',
    primaryCTA: catalog.meta?.primaryCTA || 'Book',
    meta: { ...catalog.meta },
    website: {
      sections: [
        {
          id: 'legacy_services',
          type: 'service-list',
          order: 1,
          visibility: 'visible',
          items: catalog.products.slice(0, 3).map((p) => ({ id: p.id, name: p.name })),
        },
      ],
      theme: { templateId: 'legacy-theme' },
    },
    hero: { type: 'image', imageUrl: 'https://example.com/hero.jpg' },
    heroImageUrl: 'https://example.com/hero.jpg',
    heroMediaType: 'image',
  };
}

describe('resolvePublishSnapshotSource', () => {
  const legacyPreview = { website: { sections: [{ id: 'a' }] } };
  const projectionPreview = { website: { sections: [{ id: 'b' }] } };
  const accepted = {
    status: 'accepted',
    applyToDraftPreview: true,
    projectionFingerprint: 'p7:abc',
  };

  it('flag off → legacy', () => {
    const r = resolvePublishSnapshotSource({
      publishCutoverEnabled: false,
      acceptanceEnabled: true,
      acceptanceRecord: accepted,
      currentProjectionFingerprint: 'p7:abc',
      projectionPackageOk: true,
      legacyPreview,
      projectionPreview,
    });
    expect(r.primarySource).toBe('legacy');
    expect(r.reason).toBe('publish_cutover_disabled');
  });

  it('no acceptance → legacy', () => {
    const r = resolvePublishSnapshotSource({
      publishCutoverEnabled: true,
      acceptanceEnabled: true,
      acceptanceRecord: null,
      currentProjectionFingerprint: 'p7:abc',
      projectionPackageOk: true,
      legacyPreview,
      projectionPreview,
    });
    expect(r.primarySource).toBe('legacy');
    expect(r.reason).toBe('no_acceptance');
  });

  it('stale fingerprint → legacy', () => {
    const r = resolvePublishSnapshotSource({
      publishCutoverEnabled: true,
      acceptanceEnabled: true,
      acceptanceRecord: accepted,
      currentProjectionFingerprint: 'p7:other',
      projectionPackageOk: true,
      legacyPreview,
      projectionPreview,
    });
    expect(r.primarySource).toBe('legacy');
    expect(r.reason).toBe('acceptance_stale');
  });

  it('invalid package → legacy', () => {
    const r = resolvePublishSnapshotSource({
      publishCutoverEnabled: true,
      acceptanceEnabled: true,
      acceptanceRecord: accepted,
      currentProjectionFingerprint: 'p7:abc',
      projectionPackageOk: false,
      legacyPreview,
      projectionPreview: null,
    });
    expect(r.primarySource).toBe('legacy');
    expect(r.reason).toBe('projection_package_invalid');
  });

  it('accepted + valid → projection', () => {
    const r = resolvePublishSnapshotSource({
      publishCutoverEnabled: true,
      acceptanceEnabled: true,
      acceptanceRecord: accepted,
      currentProjectionFingerprint: 'p7:abc',
      projectionPackageOk: true,
      legacyPreview,
      projectionPreview,
    });
    expect(r.primarySource).toBe('projection');
    expect(r.reason).toBe('accepted_projection_publish');
    expect(r.previewOverride).toBe(projectionPreview);
    expect(r.authoritative).toBe(false);
    expect(isDesignLibraryAuthoritative()).toBe(false);
  });
});

describe('validatePublishSnapshot', () => {
  it('rejects empty sections and duplicate ids', () => {
    expect(validatePublishSnapshot({ website: { sections: [] } }).ok).toBe(false);
    const dup = validatePublishSnapshot({
      website: {
        sections: [
          { id: 's1', type: 'hero', visibility: 'visible', items: [] },
          { id: 's1', type: 'services', visibility: 'visible', items: [] },
        ],
      },
    });
    expect(dup.ok).toBe(false);
    expect(dup.errors.some((e) => e.startsWith('duplicate_section_id'))).toBe(true);
  });

  it('accepts a minimal valid snapshot', () => {
    const v = validatePublishSnapshot({
      heroImageUrl: 'https://example.com/h.jpg',
      heroMediaType: 'image',
      website: {
        sections: [
          {
            id: 'hero',
            type: 'hero',
            visibility: 'visible',
            items: [],
            actions: [{ action: 'request_quote', label: 'Request a quote' }],
          },
          {
            id: 'policies',
            type: 'policy-links',
            visibility: 'footer_only',
            placement: 'footer',
            items: [],
          },
        ],
      },
    });
    expect(v.ok).toBe(true);
  });
});

describe('prepareDraftStorePublishOverride', () => {
  const prev = {
    dl: process.env.ENABLE_DESIGN_LIBRARY_V1,
    accept: process.env.ENABLE_STOREFRONT_PROJECTION_ACCEPTANCE_V1,
    publish: process.env.ENABLE_STOREFRONT_PROJECTION_PUBLISH_V1,
  };

  afterEach(() => {
    for (const [k, env] of [
      ['dl', 'ENABLE_DESIGN_LIBRARY_V1'],
      ['accept', 'ENABLE_STOREFRONT_PROJECTION_ACCEPTANCE_V1'],
      ['publish', 'ENABLE_STOREFRONT_PROJECTION_PUBLISH_V1'],
    ]) {
      if (prev[k] === undefined) delete process.env[env];
      else process.env[env] = prev[k];
    }
  });

  it('accepted trade draft → projection publish with provenance; no draft mutation', () => {
    process.env.ENABLE_DESIGN_LIBRARY_V1 = 'true';
    process.env.ENABLE_STOREFRONT_PROJECTION_ACCEPTANCE_V1 = 'true';
    process.env.ENABLE_STOREFRONT_PROJECTION_PUBLISH_V1 = 'true';

    const catalog = buildProjectedCatalog(
      MODERN_SECURITY_DOORS_NAV_FIXTURE.map(({ name, url, type }) => ({ name, url, type })),
      { phone: '03 9000 0000', businessName: 'AAA Plumbing', legacyPrimaryCTA: 'Book' },
    );
    const accepted = acceptProjectionForDraft(
      catalog,
      { confirm: true, actorUserId: 'u1', applyToDraftPreview: true },
      { phone: '03 9000 0000', businessName: 'AAA Plumbing' },
      { force: true },
    );
    expect(accepted.ok).toBe(true);

    const draft = {
      id: 'draft-8b',
      input: { businessName: 'AAA Plumbing', phone: '03 9000 0000' },
      preview: {
        ...legacyPreviewFromCatalog(accepted.catalog),
        meta: accepted.catalog.meta,
      },
      catalog: { products: accepted.catalog.products, meta: accepted.catalog.meta },
    };
    const legacyPreview = legacyPreviewFromCatalog(accepted.catalog);
    const legacySectionsBefore = JSON.stringify(legacyPreview.website.sections);
    const acceptanceBefore = JSON.stringify(accepted.catalog.meta.designLibraryProjectionAcceptance);

    const prepared = prepareDraftStorePublishOverride({
      draft,
      legacyPreview,
      startedAtMs: Date.now() - 5,
    });

    expect(prepared.primarySource).toBe('projection');
    expect(prepared.reason).toBe('accepted_projection_publish');
    expect(prepared.provenance.source).toBe('projection');
    expect(prepared.provenance.projectionFingerprint).toMatch(/^p7:/);
    expect(prepared.provenance.blueprintId).toBeTruthy();
    expect(prepared.provenance.authoritative).toBe(false);
    expect(prepared.previewOverride.meta.designLibraryPublish.source).toBe('projection');
    expect(prepared.previewOverride.website.sections.length).toBeGreaterThan(0);
    expect(JSON.stringify(legacyPreview.website.sections)).toBe(legacySectionsBefore);
    expect(JSON.stringify(accepted.catalog.meta.designLibraryProjectionAcceptance)).toBe(
      acceptanceBefore,
    );
    expect(isDesignLibraryAuthoritative()).toBe(false);
  });

  it('flag off → legacy provenance with fallback reason', () => {
    process.env.ENABLE_DESIGN_LIBRARY_V1 = 'true';
    process.env.ENABLE_STOREFRONT_PROJECTION_ACCEPTANCE_V1 = 'true';
    process.env.ENABLE_STOREFRONT_PROJECTION_PUBLISH_V1 = 'false';

    const catalog = buildProjectedCatalog(
      MODERN_SECURITY_DOORS_NAV_FIXTURE.map(({ name, url, type }) => ({ name, url, type })),
      { phone: '03 9000 0000', businessName: 'AAA Plumbing', legacyPrimaryCTA: 'Book' },
    );
    const accepted = acceptProjectionForDraft(
      catalog,
      { confirm: true, actorUserId: 'u1', applyToDraftPreview: true },
      { phone: '03 9000 0000', businessName: 'AAA Plumbing' },
      { force: true },
    );
    const draft = {
      id: 'draft-8b-off',
      input: { businessName: 'AAA Plumbing' },
      preview: { meta: accepted.catalog.meta, items: accepted.catalog.products },
    };
    const prepared = prepareDraftStorePublishOverride({
      draft,
      legacyPreview: legacyPreviewFromCatalog(accepted.catalog),
    });
    expect(prepared.primarySource).toBe('legacy');
    expect(prepared.reason).toBe('publish_cutover_disabled');
    expect(prepared.provenance.source).toBe('legacy');
    expect(prepared.provenance.fallbackReason).toBe('publish_cutover_disabled');
  });
});

describe('provenance + event', () => {
  it('legacy provenance omits projection fields', () => {
    const p = buildPublishProvenance({ source: 'legacy', fallbackReason: 'no_acceptance' });
    expect(p.source).toBe('legacy');
    expect(p.projectionFingerprint).toBeNull();
    expect(p.authoritative).toBe(false);
  });

  it('emits storefront.publish.completed shape', () => {
    const e = emitStorefrontPublishCompleted({
      source: 'projection',
      draftId: 'd1',
      storeId: 's1',
      blueprintId: 'trade-lead-generation',
      projectionFingerprint: 'p7:x',
      acceptanceFingerprint: 'p7:x',
      publishDurationMs: 12,
    });
    expect(e.event).toBe('storefront.publish.completed');
    expect(e.source).toBe('projection');
    expect(e.authoritative).toBe(false);
  });
});

describe('import isolation', () => {
  const NEEDLE = /publishCutover|prepareDraftStorePublishOverride|resolvePublishSnapshotSource/;

  function walkJs(dir, acc = []) {
    if (!fs.existsSync(dir)) return acc;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '__tests__') continue;
        walkJs(full, acc);
      } else if (entry.isFile() && /\.js$/.test(entry.name)) {
        acc.push(full);
      }
    }
    return acc;
  }

  it('publishCutover only imported from draftStore publish route among routes', () => {
    const offenders = [];
    for (const file of walkJs(path.join(CORE_SRC, 'routes'))) {
      const rel = path.relative(CORE_SRC, file).replace(/\\/g, '/');
      const text = fs.readFileSync(file, 'utf8');
      if (!NEEDLE.test(text)) continue;
      if (rel === 'routes/draftStore.js') continue;
      offenders.push(rel);
    }
    expect(offenders).toEqual([]);
  });

  it('publishDraftService does not import publishCutover', () => {
    const file = path.join(CORE_SRC, 'services', 'draftStore', 'publishDraftService.js');
    const text = fs.readFileSync(file, 'utf8');
    expect(NEEDLE.test(text)).toBe(false);
  });
});

describe('package builder smoke', () => {
  it('builds projection publish package with sections from MSD fixture', () => {
    const catalog = buildProjectedCatalog(
      MODERN_SECURITY_DOORS_NAV_FIXTURE.map(({ name, url, type }) => ({ name, url, type })),
      { phone: '03 9000 0000', businessName: 'Trade Co', legacyPrimaryCTA: 'Book' },
    );
    const built = buildProjectionPublishPackage({
      catalog,
      legacyPreview: legacyPreviewFromCatalog(catalog),
      context: { phone: '03 9000 0000', businessName: 'Trade Co' },
    });
    expect(built.ok).toBe(true);
    expect(built.preview.website.sections.some((s) => s.visibility === 'footer_only' || s.role)).toBe(
      true,
    );
  });
});
