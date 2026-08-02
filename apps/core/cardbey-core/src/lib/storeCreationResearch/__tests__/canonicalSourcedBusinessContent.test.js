/**
 * Truth → Projection integration: canonical envelope, role split, category bypass.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  assertNoNonOfferingRolesInCatalog,
  buildCanonicalSourcedBusinessContent,
  isOfferingContentRole,
  shouldBypassLegacyCategoryNormalization,
  splitSourcedProductsByRole,
  syncCategoriesFromSourcedItems,
} from '../canonicalSourcedBusinessContent.js';
import {
  buildModernSecurityDoorsClassifiedProducts,
  MSD_EXPECTED_NON_OFFERING,
  MSD_EXPECTED_OFFERING_NAMES,
  MODERN_SECURITY_DOORS_IDENTITY,
} from '../__fixtures__/modernSecurityDoorsSourcedContent.js';
import { classifyBusinessContent } from '../../storefrontDesignLibrary/classification/businessContentClassifier.js';
import { normalizePreviewCategories } from '../../../services/draftStore/draftStoreService.js';
import { enrichResearchCatalogProducts } from '../../../services/draftStore/researchCatalogDraft.js';

describe('canonicalSourcedBusinessContent — semantic routing', () => {
  it('routes MSD non-offerings out of catalog roles', () => {
    for (const [name, expectedRole] of Object.entries(MSD_EXPECTED_NON_OFFERING)) {
      const r = classifyBusinessContent({ name });
      expect(r.role).toBe(expectedRole);
      expect(isOfferingContentRole(r.role)).toBe(false);
    }
  });

  it('builds envelope with offerings vs sections for Modern Security Doors', () => {
    const products = buildModernSecurityDoorsClassifiedProducts();
    const { envelope, offerings, nonOfferings, diagnostics } = splitSourcedProductsByRole(products, {
      facts: {
        businessName: { value: MODERN_SECURITY_DOORS_IDENTITY.name },
        address: { value: MODERN_SECURITY_DOORS_IDENTITY.location },
        website: { value: MODERN_SECURITY_DOORS_IDENTITY.website },
      },
      catalogAuthority: 'sourced_pending_review',
    });

    expect(diagnostics.offeringCount).toBe(MSD_EXPECTED_OFFERING_NAMES.length);
    expect(diagnostics.nonOfferingCount).toBe(Object.keys(MSD_EXPECTED_NON_OFFERING).length);
    expect(offerings.map((o) => o.name).sort()).toEqual([...MSD_EXPECTED_OFFERING_NAMES].sort());
    expect(envelope.sections.testimonial.some((r) => r.name === 'Testimonials')).toBe(true);
    expect(envelope.sections.trust_content.some((r) => r.name === 'Why Choose Us')).toBe(true);
    expect(envelope.sections.career.some((r) => r.name === 'Career')).toBe(true);
    expect(envelope.sections.policy.length).toBeGreaterThanOrEqual(4);
    expect(envelope.identity.name).toBe(MODERN_SECURITY_DOORS_IDENTITY.name);
    expect(nonOfferings.every((n) => !isOfferingContentRole(n.contentRole))).toBe(true);
  });

  it('assertNoNonOfferingRolesInCatalog excludes policy/career/testimonial', () => {
    const products = buildModernSecurityDoorsClassifiedProducts();
    const { ok, items, offenders } = assertNoNonOfferingRolesInCatalog(products);
    expect(ok).toBe(false);
    expect(offenders.length).toBe(Object.keys(MSD_EXPECTED_NON_OFFERING).length);
    expect(items.every((i) => isOfferingContentRole(i.contentRole))).toBe(true);
    expect(items).toHaveLength(MSD_EXPECTED_OFFERING_NAMES.length);
  });
});

describe('normalizePreviewCategories — projection/sourced bypass', () => {
  it('does not reassign projection-backed rows to Other', () => {
    const products = buildModernSecurityDoorsClassifiedProducts();
    const offeringIds = products
      .filter((p) => isOfferingContentRole(p.contentRole))
      .map((p) => ({ ...p, categoryId: `src_cat_${p.id}` }));
    const preview = {
      items: offeringIds,
      categories: [{ id: 'unrelated', name: 'Unrelated' }],
      meta: {
        designLibraryStorefrontProjection: { sections: [{ role: 'services' }] },
        contentOrigin: 'sourced',
        catalogSource: 'research',
      },
    };
    normalizePreviewCategories(preview);
    expect(preview.meta.legacyCategoryNormalizerBypassed).toBe(true);
    expect(preview.items.every((it) => it.categoryId !== 'other')).toBe(true);
    expect(preview.categories.every((c) => String(c.id).toLowerCase() !== 'other' || c.name !== 'Other')).toBe(
      true,
    );
    // All items have matching category ids
    const ids = new Set(preview.categories.map((c) => c.id));
    expect(preview.items.every((it) => ids.has(it.categoryId))).toBe(true);
  });

  it('legacy path still reassigns invalid categoryId when flags/meta absent', () => {
    const preview = {
      items: [{ id: '1', name: 'Widget', categoryId: 'missing-cat' }],
      categories: [{ id: 'widgets', name: 'Widgets' }],
    };
    normalizePreviewCategories(preview);
    expect(preview.items[0].categoryId).toBe('other');
  });
});

describe('enrichResearchCatalogProducts — CTA / non-offering', () => {
  it('does not force Book on quote businesses or non-offerings', () => {
    const products = buildModernSecurityDoorsClassifiedProducts();
    const enriched = enrichResearchCatalogProducts(products, {
      businessType: 'service_quote_required',
      businessName: MODERN_SECURITY_DOORS_IDENTITY.name,
      primaryAction: 'request_quote',
    });
    const testimonials = enriched.find((p) => p.name === 'Testimonials');
    expect(testimonials.bookingEnabled).toBe(false);
    expect(testimonials.catalogEligible).toBe(false);
    expect(testimonials.primaryAction).toBeNull();

    const shutter = enriched.find((p) => p.name === 'Roller Shutters');
    expect(shutter.executionAction).toBe('request_quote');
    expect(shutter.bookingEnabled).toBe(false);
    expect(shutter.primaryAction).toBe('request_quote');
  });
});

describe('syncCategoriesFromSourcedItems', () => {
  it('rebuilds categories from sourced hierarchy names', () => {
    const preview = {
      items: [
        {
          id: 'a',
          name: 'Fly Doors',
          contentRole: 'service_category',
          categoryId: 'broken',
          category: 'Fly Doors',
        },
      ],
    };
    syncCategoriesFromSourcedItems(preview);
    expect(preview.categories[0].name).toBe('Fly Doors');
    expect(preview.items[0].categoryId).toBe(preview.categories[0].id);
  });
});

describe('shouldBypassLegacyCategoryNormalization', () => {
  it('detects sourced + projection meta', () => {
    expect(
      shouldBypassLegacyCategoryNormalization({
        meta: { catalogAuthority: 'sourced' },
      }),
    ).toBe(true);
    expect(
      shouldBypassLegacyCategoryNormalization({
        meta: { designLibraryStorefrontProjection: { sections: [] } },
      }),
    ).toBe(true);
    expect(shouldBypassLegacyCategoryNormalization({ meta: {} })).toBe(false);
  });
});

describe('buildCanonicalSourcedBusinessContent identity', () => {
  it('propagates accepted BusinessFacts into identity', () => {
    const envelope = buildCanonicalSourcedBusinessContent({
      products: buildModernSecurityDoorsClassifiedProducts(),
      facts: {
        businessName: { value: MODERN_SECURITY_DOORS_IDENTITY.name },
        phone: { value: '1300 000 000' },
        website: { value: MODERN_SECURITY_DOORS_IDENTITY.website },
        address: { value: MODERN_SECURITY_DOORS_IDENTITY.location },
      },
    });
    expect(envelope.identity.phone).toBe('1300 000 000');
    expect(envelope.identity.website).toContain('modernsecuritydoors');
  });
});
