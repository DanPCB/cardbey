import { describe, expect, it } from 'vitest';
import {
  countServiceCatalogPlaceholderHits,
  isServiceCatalogPlaceholderName,
  repairPublicCatalogServicePlaceholders,
  repairServiceCatalogPlaceholderProducts,
  repairServiceCatalogPlaceholderProductsForDb,
  shouldRepairServiceCatalogLeak,
} from './serviceCatalogPlaceholders.js';
import { normalizeProductName } from '../catalog/productCatalogService.js';
import { buildSeedCatalog } from '../../services/store/seeds/seedCatalogBuilder.js';

describe('serviceCatalogPlaceholders', () => {
  it('detects service template scaffold names and variation suffixes', () => {
    expect(isServiceCatalogPlaceholderName('Business Package')).toBe(true);
    expect(isServiceCatalogPlaceholderName('Call-out Fee - Option 2')).toBe(true);
    expect(isServiceCatalogPlaceholderName('Custom Quote (Variation)')).toBe(true);
    expect(isServiceCatalogPlaceholderName('Avocado toast')).toBe(false);
    expect(isServiceCatalogPlaceholderName('Backpack')).toBe(false);
  });

  it('repairs sparse service placeholder leaks in large food menus (e.g. 2 of 24)', () => {
    const realDishes = [
      'Phở Bò',
      'Gỏi cuốn',
      'Bánh mì thịt',
      'Bún bò Huế',
      'Cơm tấm',
      'Chả giò',
      'Bò lúc lắc',
      'Cá kho tộ',
      'Canh chua',
      'Gà nướng',
      'Mì Quảng',
      'Hủ tiếu',
      'Bánh xèo',
      'Nem nướng',
      'Lẩu thái',
      'Sườn nướng',
      'Cơm chiên',
      'Bánh flan',
      'Trà đá',
      'Cà phê sữa đá',
      'Sinh tố bơ',
      'Nước cam',
    ];
    const products = [
      { id: 'bp1', name: 'Business Package - Option 2', imageUrl: 'https://img/bp2.jpg', price: 450 },
      { id: 'bp2', name: 'Business Package - Option 3', imageUrl: 'https://img/bp3.jpg', price: 450 },
      ...realDishes.map((name, i) => ({
        id: `dish_${i}`,
        name,
        imageUrl: `https://img/${i}.jpg`,
        price: 250,
      })),
    ];
    const profile = {
      businessName: 'Cố Đô Shunshine',
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
    expect(repaired.repairedCount).toBe(2);
    expect(repaired.products.filter((p) => isServiceCatalogPlaceholderName(p.name))).toHaveLength(0);
    expect(repaired.products[0].imageUrl).toBe('https://img/bp2.jpg');
    expect(repaired.products[1].imageUrl).toBe('https://img/bp3.jpg');
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

  it('repairPublicCatalogServicePlaceholders repairs projection-path food menus', () => {
    const products = [
      { id: 'bp1', name: 'Business Package - Option 2', imageUrl: 'https://img/bp2.jpg', price: 450 },
      { id: 'dish_1', name: 'Phở Bò', imageUrl: 'https://img/1.jpg', price: 250 },
    ];
    const repaired = repairPublicCatalogServicePlaceholders(products, {
      businessName: 'Cố Đô Shunshine',
      businessType: 'restaurant',
      catalogLabel: 'Menu',
    });
    expect(repaired.repaired).toBe(true);
    expect(repaired.products.every((p) => !isServiceCatalogPlaceholderName(p.name))).toBe(true);
  });

  it('repairServiceCatalogPlaceholderProductsForDb avoids normalizedName collisions', () => {
    const products = [
      { id: 'bp1', name: 'Business Package - Option 2' },
      { id: 'bp2', name: 'Business Package - Option 3' },
      { id: 'dish_1', name: 'Soup of the Day' },
      { id: 'dish_2', name: 'House Salad' },
    ];
    const profile = {
      businessName: 'Sunshine Kitchen',
      businessType: 'restaurant',
      verticalSlug: 'food.restaurant',
      verticalGroup: 'food',
    };
    const repaired = repairServiceCatalogPlaceholderProductsForDb(
      products,
      profile,
      normalizeProductName,
    );
    expect(repaired.repaired).toBe(true);
    expect(repaired.repairedCount).toBe(2);
    const names = repaired.products.map((p) => normalizeProductName(p.name));
    expect(new Set(names).size).toBe(names.length);
    expect(repaired.products.every((p) => !isServiceCatalogPlaceholderName(p.name))).toBe(true);
  });
});
