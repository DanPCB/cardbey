import { describe, expect, it } from 'vitest';
import { mergeMenuImportExtractions, toCatalogMenuItems } from './menuImportMerge.js';

describe('mergeMenuImportExtractions', () => {
  it('merges spa packages and waxing across front/back pages without duplicating', () => {
    const merged = mergeMenuImportExtractions([
      {
        assetId: 'a1',
        sourceOrder: 1,
        contact: {
          businessName: 'Herbal Head Spa & Beauty Salon',
          phone: '0423 096 989',
          email: 'contact@herbalheadspa.com.au',
          address: '139 Puckle Street, Moonee Ponds VIC 3039',
          socialHandles: ['@herbal.headspa'],
        },
        openingHours: [{ days: ['Mon', 'Tue', 'Wed'], opens: '10:00', closes: '18:00', rawText: 'Mon-Wed 10-6' }],
        items: [],
      },
      {
        assetId: 'a2',
        sourceOrder: 2,
        items: [
          {
            name: 'Refresh',
            price: 69,
            category: 'Spa Packages',
            durationMinutes: 30,
            inclusions: ['Herbal shampoo hair wash', 'Conditioning treatment', 'Head massage'],
            confidence: 0.95,
          },
          {
            name: 'Recharge',
            price: 89,
            category: 'Spa Packages',
            durationMinutes: 45,
            inclusions: ['Herbal shampoo hair wash', 'Herbal conditioning treatment'],
            confidence: 0.9,
          },
          {
            name: 'Relaxation or Deep Tissue',
            price: 70,
            category: 'Massage',
            options: [
              { label: '30 mins', durationMinutes: 30, price: 70 },
              { label: '45 mins', durationMinutes: 45, price: 80 },
            ],
            addOns: [{ name: 'hot stone', price: 10 }],
            confidence: 0.9,
          },
          { name: 'Eyebrow', price: 15, category: 'Waxing', confidence: 0.9 },
          { name: 'Brazilian', price: 59, category: 'Waxing', confidence: 0.9 },
        ],
      },
    ]);

    const catalog = toCatalogMenuItems(merged.items);
    expect(merged.contact?.phone).toBe('0423 096 989');
    expect(merged.openingHours?.length).toBe(1);
    expect(catalog.find((i) => i.name === 'Refresh')?.price).toBe(69);
    expect(catalog.find((i) => i.name === 'Refresh')?.description).toMatch(/Includes:/);
    expect(catalog.some((i) => /hot stone/i.test(i.description || ''))).toBe(true);
    expect(catalog.filter((i) => i.category === 'Waxing')).toHaveLength(2);
    const massageRows = catalog.filter((i) => /relaxation/i.test(i.name) || /deep tissue/i.test(i.name));
    expect(massageRows.length).toBeGreaterThanOrEqual(2);
    expect(massageRows.every((r) => r.price != null)).toBe(true);
  });

  it('expands duration options that only have priceText', () => {
    const catalog = toCatalogMenuItems([
      {
        name: 'Deep Tissue Full Body',
        category: 'Deep Tissue Full Body',
        price: null,
        confidence: 0.9,
        options: [
          { label: '30 Mins', durationMinutes: 30, priceText: '$70' },
          { label: '60 Mins', durationMinutes: 60, priceText: '$120' },
        ],
      },
    ]);
    expect(catalog).toHaveLength(2);
    expect(catalog.map((c) => c.price).sort((a, b) => a - b)).toEqual([70, 120]);
    expect(catalog.every((c) => /Deep Tissue/i.test(c.name))).toBe(true);
  });

  it('keeps same item name in different category paths distinct', () => {
    const merged = mergeMenuImportExtractions([
      {
        assetId: 'p1',
        sourceOrder: 1,
        items: [
          { name: 'Spring Roll', price: 10, category: 'Entrées', categoryPath: ['Food', 'Entrées'], confidence: 0.9 },
          {
            name: 'Spring Roll',
            price: 45,
            category: 'Catering',
            categoryPath: ['Food', 'Catering'],
            confidence: 0.9,
          },
        ],
      },
    ]);
    expect(merged.items).toHaveLength(2);
    const catalog = toCatalogMenuItems(merged.items);
    expect(catalog.map((i) => i.categoryPath?.join('>')).sort()).toEqual([
      'Food>Catering',
      'Food>Entrées',
    ]);
  });
});
