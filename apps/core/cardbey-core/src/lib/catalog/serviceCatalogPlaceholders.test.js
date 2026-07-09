import { describe, expect, it } from 'vitest';
import {
  countServiceCatalogPlaceholderHits,
  isServiceCatalogPlaceholderName,
  repairServiceCatalogPlaceholderProducts,
  shouldRepairServiceCatalogLeak,
} from './serviceCatalogPlaceholders.js';
import { buildSeedCatalog } from '../../services/store/seeds/seedCatalogBuilder.js';

describe('serviceCatalogPlaceholders', () => {
  it('detects service template scaffold names and variation suffixes', () => {
    expect(isServiceCatalogPlaceholderName('Business Package')).toBe(true);
    expect(isServiceCatalogPlaceholderName('Call-out Fee - Option 2')).toBe(true);
    expect(isServiceCatalogPlaceholderName('Custom Quote (Variation)')).toBe(true);
    expect(isServiceCatalogPlaceholderName('Avocado toast')).toBe(false);
    expect(isServiceCatalogPlaceholderName('Backpack')).toBe(false);
  });

  it('repairs leaked service placeholders for food stores while keeping images', () => {
    const products = [
      { id: '1', name: 'Business Package', imageUrl: 'https://img/1.jpg', price: 480 },
      { id: '2', name: 'Call-out Fee - Style B', imageUrl: 'https://img/2.jpg', price: 80 },
      { id: '3', name: 'Custom Quote', imageUrl: 'https://img/3.jpg', price: 80 },
      { id: '4', name: 'Business Package (Variation)', imageUrl: 'https://img/4.jpg', price: 480 },
    ];
    const profile = {
      businessName: 'Sunshine Kitchen',
      businessType: 'restaurant',
      verticalSlug: 'food.restaurant',
      verticalGroup: 'food',
      catalogLabel: 'Menu',
    };
    expect(shouldRepairServiceCatalogLeak(products, profile)).toBe(true);
    const repaired = repairServiceCatalogPlaceholderProducts(products, profile, () =>
      buildSeedCatalog(profile, { targetCount: 24 }),
    );
    expect(repaired.repaired).toBe(true);
    expect(repaired.repairedCount).toBe(4);
    expect(repaired.products.every((p) => !isServiceCatalogPlaceholderName(p.name))).toBe(true);
    expect(repaired.products.some((p) => /soup|salad|special|chef|house/i.test(p.name))).toBe(true);
    expect(repaired.products[0].imageUrl).toBe('https://img/1.jpg');
    expect(countServiceCatalogPlaceholderHits(repaired.products)).toBe(0);
  });

  it('does not repair true service businesses', () => {
    const products = [
      { id: '1', name: 'Business Package' },
      { id: '2', name: 'Call-out Fee' },
    ];
    const profile = {
      businessName: 'AAA Plumbing',
      businessType: 'plumber',
      verticalSlug: 'services.plumbing',
      verticalGroup: 'services',
    };
    expect(shouldRepairServiceCatalogLeak(products, profile)).toBe(false);
  });
});
