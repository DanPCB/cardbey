import { describe, expect, it } from 'vitest';
import { resolveVertical } from '../../lib/verticals/verticalTaxonomy.js';
import { classifyBusinessType } from '../../lib/catalog/classifyBusinessType.js';
import { repairServiceCatalogPlaceholderProducts } from '../../lib/catalog/serviceCatalogPlaceholders.js';
import { buildSeedCatalog } from '../store/seeds/seedCatalogBuilder.js';

describe('buildCatalog vertical + category binding', () => {
  it('resolves fashion stores to fashion vertical (not services.generic)', () => {
    const vertical = resolveVertical({
      businessType: 'Fashion',
      businessName: 'Another Fashion',
    });
    expect(vertical.group).toBe('fashion');
    expect(vertical.slug).toMatch(/^fashion\./);
  });

  it('classifies fashion intake as product retail even when BSL profile lacks verticalSlug', () => {
    const bslProfile = {
      businessType: 'product_retail',
      catalogMode: 'products',
      catalogLabel: 'Products',
      primaryCTA: 'Add to cart',
    };
    expect(bslProfile.verticalSlug).toBeUndefined();
    const classified = classifyBusinessType({
      businessName: 'Another Fashion',
      storeType: 'Fashion',
      category: 'Fashion',
    });
    expect(classified.businessType).toBe('product_retail');
    expect(bslProfile.businessType).toBe(classified.businessType);
  });

  it('classifies food stores as food_menu even when items are service placeholders', () => {
    const classified = classifyBusinessType({
      businessName: 'Sunshine Cafe',
      storeType: 'cafe',
      catalogLabel: 'Menu',
      items: [
        { name: 'Business Package', itemType: 'service' },
        { name: 'Call-out Fee - Option 2', itemType: 'service' },
      ],
    });
    expect(classified.businessType).toBe('food_menu');
  });

  it('repairs service placeholder leak for fashion retail catalogs', () => {
    const products = Array.from({ length: 6 }, (_, i) => ({
      id: `item_${i}`,
      name: i % 2 === 0 ? 'Business Package' : 'Call-out Fee',
      imageUrl: `https://img/${i}.jpg`,
    }));
    const profile = {
      businessName: 'Another Fashion',
      businessType: 'Fashion',
      verticalSlug: 'fashion.boutique',
      verticalGroup: 'fashion',
    };
    const repaired = repairServiceCatalogPlaceholderProducts(products, profile, () =>
      buildSeedCatalog(profile, { targetCount: 24 }),
    );
    expect(repaired.repaired).toBe(true);
    expect(repaired.products.some((p) => p.name === 'Backpack' || p.name === 'Featured Item')).toBe(true);
  });
});
