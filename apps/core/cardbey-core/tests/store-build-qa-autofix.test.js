import { describe, it, expect } from 'vitest';
import {
  detectFixableStoreBuildIssues,
  inferVerticalFromBusinessName,
  humanLabel,
  formatTier2FixesForApproval,
} from '../src/services/qa/storeBuildQaAutoFix.js';
import {
  isAbsoluteHttpUrl,
  resolveUsableDraftItemImageUrl,
} from '../src/services/draftStore/draftStoreService.js';
import {
  applyDraftCatalogQaTier1AutoRepair,
  planDraftCatalogQaTier2Fixes,
} from '../src/services/qa/draftCatalogQa.js';

describe('storeBuildQaAutoFix', () => {
  it('resolveUsableDraftItemImageUrl rejects relative paths and accepts https URLs', () => {
    expect(resolveUsableDraftItemImageUrl({ imageUrl: '/img/x.jpg' })).toBeNull();
    expect(resolveUsableDraftItemImageUrl({ imageUrl: 'fashion' })).toBeNull();
    expect(
      resolveUsableDraftItemImageUrl({ imageUrl: 'https://cdn.example.com/p.jpg' }),
    ).toBe('https://cdn.example.com/p.jpg');
    expect(isAbsoluteHttpUrl('https://a.co/x')).toBe(true);
    expect(isAbsoluteHttpUrl('/x')).toBe(false);
  });

  it('detectFixableStoreBuildIssues flags empty tagline, vertical, and missing images', () => {
    const preview = {
      storeName: 'Sweet Corner',
      items: [
        { id: 'i0', name: 'Brownie', description: 'Rich chocolate.', price: '4' },
        { id: 'i1', name: 'Cookie', description: 'Fresh.', price: '3', imageUrl: null },
        { id: 'i2', name: 'Dress', description: 'Silk midi.', price: '49', imageUrl: '/img/placeholder.jpg' },
      ],
      tagline: '',
      description: '',
    };
    const issues = detectFixableStoreBuildIssues(preview, { businessType: 'bakery' }, {});
    expect(issues.has('tagline')).toBe(true);
    expect(issues.has('description')).toBe(true);
    expect(issues.has('vertical')).toBe(true);
    expect(issues.has('imageUrl')).toBe(true);
  });

  it('inferVerticalFromBusinessName resolves food vertical for cafe name', () => {
    const r = inferVerticalFromBusinessName('Union Road Cafe', 'cafe');
    expect(r.slug).toMatch(/^food\./);
  });

  it('humanLabel maps tier2 fix kinds to plain English', () => {
    expect(
      humanLabel({ kind: 'catalog_regenerate', affectedCount: 8 }),
    ).toContain('8');
    const formatted = formatTier2FixesForApproval([
      { id: 'catalog_regenerate', kind: 'catalog_regenerate', humanDescription: 'x', affectedCount: 8 },
    ]);
    expect(formatted[0].label).toContain('8');
    expect(formatted[0].impact).toBe('Affects 8 products');
  });

  it('tier1 repair fills prices without regenerating fashion placeholders', () => {
    const sweetsInput = {
      businessType: 'sweets_bakery',
      businessName: 'Sweet Corner',
      verticalSlug: 'food.bakery',
    };
    const preview = {
      storeName: 'Sweet Corner',
      items: [
        { id: 'i0', name: 'Brownie', description: 'Rich chocolate.', price: '4.00', categoryId: 'c0' },
        { id: 'i20', name: 'Hoodie', description: null, price: null, categoryId: 'c1' },
      ],
      categories: [{ id: 'c0', name: 'Treats' }, { id: 'c1', name: 'Other' }],
      tagline: '',
      description: '',
    };
    const tier1 = applyDraftCatalogQaTier1AutoRepair(preview, sweetsInput, sweetsInput);
    expect(tier1.preview.items[1].name).toMatch(/hoodie/i);
    expect(tier1.preview.items[1].price).toBeFalsy();
    expect(String(tier1.preview.tagline ?? '').length).toBeGreaterThan(5);
    const tier2 = planDraftCatalogQaTier2Fixes(tier1.preview, sweetsInput, sweetsInput);
    expect(tier2.length).toBeGreaterThan(0);
    expect(tier2.some((f) => f.kind === 'catalog_regenerate' || f.kind === 'bulk_catalog_repair')).toBe(
      true,
    );
  });
});
