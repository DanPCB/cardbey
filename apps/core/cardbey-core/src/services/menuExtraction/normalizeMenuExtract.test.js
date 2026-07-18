import { describe, it, expect } from 'vitest';
import {
  normalizeMenuExtractItems,
  inferCurrencyFromPrices,
  applyCurrencyInference,
  detectSuspiciousUniformPrices,
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

  it('keeps all items under import safety ceiling, highest confidence first', () => {
    const raw = Array.from({ length: 80 }, (_, i) => ({
      name: `Item ${i}`,
      price: 1,
      confidence: 0.4 + (i % 50) * 0.01,
    }));
    const items = normalizeMenuExtractItems(raw);
    expect(items).toHaveLength(80);
    expect(items.length).toBeLessThanOrEqual(MAX_MENU_ITEMS);
    expect(items[0].confidence).toBeGreaterThanOrEqual(items[items.length - 1].confidence);
  });

  it('caps only at import safety ceiling when over limit', () => {
    const n = MAX_MENU_ITEMS + 25;
    const raw = Array.from({ length: n }, (_, i) => ({
      name: `Item ${i}`,
      price: 1,
      confidence: 0.5,
    }));
    const items = normalizeMenuExtractItems(raw);
    expect(items).toHaveLength(MAX_MENU_ITEMS);
  });

  it('parses price from priceDisplay when price is missing', () => {
    const items = normalizeMenuExtractItems([
      { name: 'Cafe Latte', price: null, priceDisplay: '$4.50', confidence: 0.9 },
    ]);
    expect(items[0].price).toBe(4.5);
  });

  it('normalizes duration options and fills parent price from cheapest option', () => {
    const items = normalizeMenuExtractItems([
      {
        name: 'Relaxation',
        category: 'Relaxation',
        price: null,
        confidence: 0.9,
        options: [
          { label: '30 Mins', durationMinutes: 30, priceText: '$60' },
          { label: '45 Mins', durationMinutes: 45, price: '75' },
          { label: '60 Mins', durationMinutes: 60, priceDisplay: '$90' },
        ],
      },
    ]);
    expect(items).toHaveLength(1);
    expect(items[0].price).toBe(60);
    expect(items[0].options).toHaveLength(3);
    expect(items[0].options.map((o) => o.price)).toEqual([60, 75, 90]);
  });

  it('preserves Vietnamese dish names', () => {
    const items = normalizeMenuExtractItems(
      [{ name: 'Phở bò tái', price: 65000, currency: 'VND', confidence: 0.9 }],
      { language: 'vi' },
    );
    expect(items[0].name).toBe('Phở bò tái');
  });
});

describe('detectSuspiciousUniformPrices', () => {
  it('flags many items with identical price 15', () => {
    const items = Array.from({ length: 10 }, () => ({ price: 15 }));
    const r = detectSuspiciousUniformPrices(items);
    expect(r.priceWarning).toBe(true);
    expect(r.uniformPrice).toBe(15);
  });

  it('does not flag varied prices', () => {
    const items = [
      { price: 4.5 },
      { price: 5.5 },
      { price: 6 },
      { price: 4 },
    ];
    expect(detectSuspiciousUniformPrices(items).priceWarning).toBe(false);
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
