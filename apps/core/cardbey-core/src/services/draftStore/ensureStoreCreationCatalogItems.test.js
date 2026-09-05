import { describe, expect, it } from 'vitest';
import { ensureStoreCreationCatalogItems } from './ensureStoreCreationCatalogItems.js';

describe('ensureStoreCreationCatalogItems', () => {
  it('recovers Vietnamese food menu for Banh mi form-only store creation', () => {
    const recovered = ensureStoreCreationCatalogItems(
      { profile: { name: 'Banh mi Nhu lan' }, products: [], categories: [] },
      {
        draftId: 'draft_banhmi',
        businessName: 'Banh mi Nhu lan',
        storeType: 'Food & drink',
        businessType: 'Food & drink',
        location: 'Melbourne',
      },
      {},
    );

    expect(recovered.products?.length).toBeGreaterThan(0);
    const names = (recovered.products ?? []).map((p) => p.name);
    expect(names.some((n) => /banh mì|phở|chả giò/i.test(String(n)))).toBe(true);
    expect(recovered.meta?.emptyCatalogRecovered).toBe(true);
  });

  it('leaves non-empty catalogs unchanged', () => {
    const catalog = {
      products: [{ id: 'p1', name: 'Existing item', categoryId: 'c1' }],
      categories: [{ id: 'c1', name: 'Menu' }],
    };
    const out = ensureStoreCreationCatalogItems(
      catalog,
      { businessName: 'Test', storeType: 'Food & drink' },
      {},
    );
    expect(out).toBe(catalog);
    expect(out.products).toHaveLength(1);
  });

  it('normalizes items-only NEW_BUSINESS florist starter into products for preview persist', () => {
    const starter = {
      categories: [
        { id: 'cat_starter_bouquets', name: 'Bouquets' },
        { id: 'cat_starter_plants', name: 'Plants' },
      ],
      items: [
        { id: 'item_starter_0', name: 'Classic Rose Bouquet', categoryId: 'cat_starter_bouquets', price: null },
        { id: 'item_starter_1', name: 'Seasonal Mixed Bouquet', categoryId: 'cat_starter_bouquets', price: null },
        { id: 'item_starter_2', name: 'Orchid Plant', categoryId: 'cat_starter_plants', price: null },
      ],
      meta: { catalogSource: 'ai_generated_starter', neverGenericService: true },
    };
    const out = ensureStoreCreationCatalogItems(
      starter,
      {
        businessName: 'My Flower',
        storeType: 'Home & Garden',
        creationMode: 'NEW_BUSINESS',
        verticalSlug: 'retail.flower',
      },
      {},
    );
    expect(out.products?.length).toBe(3);
    expect(out.products.map((p) => p.name)).toContain('Classic Rose Bouquet');
    expect(out.meta?.emptyCatalogRecovered).not.toBe(true);
  });
});
