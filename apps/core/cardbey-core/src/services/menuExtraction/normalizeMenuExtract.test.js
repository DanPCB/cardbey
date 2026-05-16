import { describe, it, expect } from 'vitest';
import {
  normalizeMenuExtractItems,
  inferCurrencyFromPrices,
  applyCurrencyInference,
  MAX_MENU_ITEMS,
} from './normalizeMenuExtract.js';

describe('normalizeMenuExtractItems', () => {
  it('keeps items with null price when confidence is sufficient', () => {
    const items = normalizeMenuExtractItems([
      { name: 'Eggs Benedict', price: null, confidence: 0.85 },
    ]);
    expect(items).toHaveLength(1);
    expect(items[0].price).toBeNull();
    expect(items[0].name).toBe('Eggs Benedict');
  });

  it('drops items with confidence below 0.4', () => {
    const items = normalizeMenuExtractItems([
      { name: 'Keep', price: 5, confidence: 0.41 },
      { name: 'Drop', price: 5, confidence: 0.39 },
    ]);
    expect(items.map((i) => i.name)).toEqual(['Keep']);
  });

  it('caps at 50 items and keeps highest confidence first', () => {
    const raw = Array.from({ length: 60 }, (_, i) => ({
      name: `Item ${i}`,
      price: 1,
      confidence: 0.4 + i * 0.01,
    }));
    const items = normalizeMenuExtractItems(raw);
    expect(items).toHaveLength(MAX_MENU_ITEMS);
    expect(items[0].name).toBe('Item 59');
    expect(items[MAX_MENU_ITEMS - 1].name).toBe('Item 10');
  });

  it('preserves Vietnamese dish names', () => {
    const items = normalizeMenuExtractItems(
      [{ name: 'Phở bò tái', price: 65000, currency: 'VND', confidence: 0.9 }],
      { language: 'vi' },
    );
    expect(items[0].name).toBe('Phở bò tái');
  });
});

describe('inferCurrencyFromPrices', () => {
  it('treats thousands-scale whole prices as VND', () => {
    expect(inferCurrencyFromPrices([{ price: 45000 }, { price: 50000 }], 'en')).toBe('VND');
  });

  it('treats small decimal prices as AUD-ish (under 100 with decimals)', () => {
    expect(inferCurrencyFromPrices([{ price: 5.5 }, { price: 4.5 }], 'en')).toBe('AUD');
  });

  it('uses VND when language is Vietnamese even without prices', () => {
    expect(inferCurrencyFromPrices([{ price: null }], 'vi')).toBe('VND');
  });
});

describe('applyCurrencyInference', () => {
  it('overwrites unknown currency codes with inferred value', () => {
    const items = [
      { price: 120, currency: 'XXX', confidence: 0.9 },
      { price: 130, currency: 'XXX', confidence: 0.8 },
    ];
    applyCurrencyInference(items, 'en');
    expect(items.every((i) => i.currency === 'USD')).toBe(true);
  });
});
