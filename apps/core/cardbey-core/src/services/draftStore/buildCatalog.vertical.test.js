import { describe, expect, it } from 'vitest';
import { resolveVertical } from '../../lib/verticals/verticalTaxonomy.js';
import { classifyBusinessType } from '../../lib/catalog/classifyBusinessType.js';

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
});
