import { describe, expect, it } from 'vitest';
import {
  classifyBusinessType,
  recommendedCatalogLabelForType,
  shouldOverrideStoredCatalogLabel,
} from './classifyBusinessType.js';
import { buildCatalogGenerationProfile, applyCatalogProfileToItems } from './buildCatalogGenerationProfile.js';
import { getStoreCatalogPresentation, repairCatalogPresentation } from './catalogPresentation.js';

describe('classifyBusinessType', () => {
  it('classifies nails/spa as service_fixed_booking', () => {
    const result = classifyBusinessType({
      businessName: 'Luxe Nails & Spa',
      businessType: 'nail salon',
      description: 'Manicure, pedicure, massage and facial treatments',
    });
    expect(result.businessType).toBe('service_fixed_booking');
    expect(result.recommendedCatalogLabel).toMatch(/Services|Book Services/);
    expect(result.primaryCTA).toBe('Book');
    expect(result.suggestedSubcategories).toEqual(
      expect.arrayContaining(['Manicure', 'Pedicure', 'Nail Art']),
    );
  });

  it('classifies tiling/flooring as service_quote_required', () => {
    const result = classifyBusinessType({
      businessName: 'Melbourne Flooring & Tiling',
      businessType: 'tiling contractor',
    });
    expect(result.businessType).toBe('service_quote_required');
    expect(result.recommendedCatalogLabel).toMatch(/Services/);
    expect(result.primaryCTA).toBe('Request quote');
    expect(result.suggestedSubcategories).toEqual(
      expect.arrayContaining(['Bathroom Tiling', 'Floor Tiling']),
    );
  });

  it('classifies restaurant as food_menu', () => {
    const result = classifyBusinessType({
      businessName: 'Saigon Kitchen',
      businessType: 'restaurant',
    });
    expect(result.businessType).toBe('food_menu');
    expect(result.recommendedCatalogLabel).toBe('Menu');
    expect(result.primaryCTA).toBe('Order');
  });

  it('classifies fashion boutique as product_retail', () => {
    const result = classifyBusinessType({
      businessName: 'Another Fashion',
      businessType: 'Fashion',
      category: 'Fashion',
    });
    expect(result.businessType).toBe('product_retail');
    expect(result.recommendedCatalogLabel).toBe('Products');
    expect(result.primaryCTA).toBe('Add to cart');
  });

  it('classifies retail boutique as product_retail', () => {
    const result = classifyBusinessType({
      businessName: 'Urban Boutique',
      businessType: 'retail clothing shop',
    });
    expect(result.businessType).toBe('product_retail');
    expect(result.recommendedCatalogLabel).toBe('Products');
    expect(result.primaryCTA).toBe('Add to cart');
  });

  it('classifies mixed retail + services as hybrid', () => {
    const result = classifyBusinessType({
      businessName: 'Style Studio Shop',
      businessType: 'salon and retail shop',
      items: [
        { name: 'Gel Manicure', type: 'service' },
        { name: 'Nail Polish Bottle', type: 'product' },
      ],
    });
    expect(result.businessType).toBe('hybrid');
    expect(result.recommendedCatalogLabel).toBe('Catalog');
  });
});

describe('catalog generation profile + items', () => {
  it('applies book CTA and no cart for nail services', () => {
    const profile = buildCatalogGenerationProfile({ businessType: 'nail salon', businessName: 'Nails Co' });
    const items = applyCatalogProfileToItems(
      [{ name: 'Classic Manicure', price: 35 }],
      profile,
      { businessType: 'nail salon' },
    );
    expect(items[0].executionAction).toBe('book');
    expect(items[0].purchaseEnabled).toBe(false);
    expect(items[0].primaryAction).toBe('book');
  });

  it('applies request quote for tiling services', () => {
    const profile = buildCatalogGenerationProfile({
      businessName: 'Pro Tiling',
      businessType: 'bathroom tiling',
    });
    const items = applyCatalogProfileToItems(
      [{ name: 'Bathroom Tiling', price: 35 }],
      profile,
      { businessType: 'tiling' },
    );
    expect(items[0].executionAction).toBe('request_quote');
    expect(items[0].fromPrice).toBe(35);
  });
});

describe('catalog presentation repair', () => {
  it('overrides default Products label for spa stores', () => {
    expect(shouldOverrideStoredCatalogLabel('Products', 'Book Services')).toBe(true);
    const presentation = getStoreCatalogPresentation(
      { name: 'Glow Spa', type: 'spa', catalogLabel: 'Products' },
      [{ name: 'Swedish Massage', itemType: 'service' }],
    );
    expect(presentation.catalogLabel).not.toBe('Products');
    expect(presentation.sectionTitle).toMatch(/Services|Book Services/);
  });

  it('repairs legacy food stores showing Products', () => {
    const repaired = repairCatalogPresentation(
      { id: 's1', name: 'Corner Cafe', type: 'cafe', catalogLabel: 'Products' },
      [{ name: 'Latte', itemType: 'service' }],
    );
    expect(repaired.catalogLabel).toBe('Menu');
    expect(repaired.repaired).toBe(true);
  });

  it('keeps owner-edited non-default labels', () => {
    expect(shouldOverrideStoredCatalogLabel('Signature Treatments', 'Services')).toBe(false);
  });
});

describe('recommendedCatalogLabelForType', () => {
  it('uses Book Services for nails/spa corpus', () => {
    expect(
      recommendedCatalogLabelForType('service_fixed_booking', 'luxury nail spa salon'),
    ).toBe('Book Services');
  });
});
