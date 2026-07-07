import { describe, expect, it } from 'vitest';
import { buildResearchBackedStore } from '../../lib/storeCreationResearch/researchBackedStoreBuilder.js';
import { buildBusinessProfile } from '../../lib/businessSemantic/BusinessProfileBuilder.js';
import {
  applyResearchProfileToPreview,
  enrichResearchCatalogProducts,
  finalizeResearchCatalogForDraft,
  mergeResearchBusinessProfileIntoParams,
} from './researchCatalogDraft.js';
import { applyCommerceFieldsToPreview } from './draftStoreService.js';
import { applyDraftCatalogQaTier2Fixes } from '../qa/draftCatalogQa.js';

describe('researchCatalogDraft — Glamshell Beauty acceptance', () => {
  const glamshellItems = [
    { name: 'SNS', price: 65, description: 'Signature nail system', category: 'Nails', serviceMode: 'fixed_booking', executionAction: 'book', sourceType: 'bookwell' },
    { name: 'Pedicure with Shellac', price: 75, description: 'Relaxing pedicure', category: 'Nails', serviceMode: 'fixed_booking', executionAction: 'book', sourceType: 'bookwell' },
    { name: 'Manicure', price: 45, description: 'Classic manicure', category: 'Nails', serviceMode: 'fixed_booking', executionAction: 'book', sourceType: 'bookwell' },
  ];

  const built = buildResearchBackedStore({
    facts: { businessName: { value: 'Glamshell Beauty' } },
    items: glamshellItems,
    businessKind: 'service_fixed_booking',
    input: { businessName: 'Glamshell Beauty', location: 'Melbourne', category: 'Beauty' },
    confidence: 0.92,
  });

  it('builds service_fixed_booking BSL profile with Book Services label', () => {
    expect(built.businessProfile.businessType).toBe('service_fixed_booking');
    expect(built.businessProfile.catalogMode).toBe('services');
    expect(built.businessProfile.presentation?.catalogLabel).toMatch(/book services/i);
    expect(built.businessProfile.presentation?.primaryCTA).toMatch(/book/i);
  });

  it('finalizes research catalog with service items and research metadata', () => {
    const finalized = finalizeResearchCatalogForDraft(built.catalog, { businessProfile: built.businessProfile, confidence: 0.92 }, {
      businessName: 'Glamshell Beauty',
    });
    expect(finalized.meta.catalogSource).toBe('research');
    expect(finalized.products.length).toBe(3);
    expect(finalized.products[0].itemType).toBe('service');
    expect(finalized.products[0].serviceMode).toBe('fixed_booking');
    expect(finalized.products[0].executionAction).toBe('book');
    expect(finalized.products[0].catalogSource).toBe('research');
    expect(finalized.products.map((p) => p.name)).toEqual(['SNS', 'Pedicure with Shellac', 'Manicure']);
    expect(finalized.products.some((p) => /featured item|best seller|popular pick/i.test(p.name ?? ''))).toBe(false);
  });

  it('overwrites pre-research product_retail params when research confidence is higher', () => {
    const preResearch = {
      canonicalBusinessType: 'product_retail',
      catalogMode: 'products',
      catalogLabel: 'Products',
      classificationConfidence: 0.4,
    };
    const merged = mergeResearchBusinessProfileIntoParams(preResearch, { businessProfile: built.businessProfile, confidence: 0.92 }, built.catalog);
    expect(merged.canonicalBusinessType).toBe('service_fixed_booking');
    expect(merged.catalogMode).toBe('services');
    expect(merged.catalogLabel).toMatch(/book services/i);
    expect(merged.primaryCTA).toMatch(/book/i);
  });

  it('applyCommerceFieldsToPreview preserves research services (no product_retail conversion)', () => {
    const finalized = finalizeResearchCatalogForDraft(built.catalog, { businessProfile: built.businessProfile, confidence: 0.92 }, {
      businessName: 'Glamshell Beauty',
    });
    const preview = {
      storeName: 'Glamshell Beauty',
      storeType: 'product_retail',
      items: finalized.products,
      meta: finalized.meta,
      businessProfile: built.businessProfile,
    };
    const patched = applyCommerceFieldsToPreview(preview);
    expect(patched.businessType).toBe('service_fixed_booking');
    expect(patched.catalogMode).toBe('services');
    expect(patched.items[0].itemType).toBe('service');
    expect(patched.items[0].name).toBe('SNS');
    expect(patched.meta.catalogSource).toBe('research');
  });

  it('skips QA catalog_regenerate for research-backed preview', () => {
    const preview = applyResearchProfileToPreview({
      storeName: 'Glamshell Beauty',
      items: enrichResearchCatalogProducts(glamshellItems, { businessProfile: built.businessProfile, businessName: 'Glamshell Beauty' }),
      meta: { catalogSource: 'research', businessProfile: built.businessProfile },
    });
    const { preview: repaired, autoFixed } = applyDraftCatalogQaTier2Fixes(preview, {}, { businessType: 'service_fixed_booking' });
    expect(autoFixed).toEqual([]);
    expect(repaired.items[0].name).toBe('SNS');
  });

  it('BSL from researched service items is service_fixed_booking not product_retail', () => {
    const profile = buildBusinessProfile({
      businessName: 'Glamshell Beauty',
      businessType: 'Beauty',
      items: glamshellItems.map((i) => ({ name: i.name, itemType: 'service', serviceMode: 'fixed_booking', executionAction: 'book' })),
      location: 'Melbourne',
    });
    expect(profile.profile.businessType).toBe('service_fixed_booking');
    expect(profile.profile.businessType).not.toBe('product_retail');
  });
});
