import { describe, it, expect } from 'vitest';
import { computeSeedCompleteness } from '../computeSeedCompleteness.js';
import { toSeedSnapshot } from '../toSeedSnapshot.js';

function namedItem(i, extras = {}) {
  return {
    name: `Item ${i}`,
    description: extras.description ?? `Description ${i}`,
    price: extras.price ?? 12 + i,
    itemType: extras.itemType ?? 'product',
    provenance: 'test',
  };
}

function publishableBase(overrides = {}) {
  return {
    businessName: 'Test Cafe',
    category: 'cafe',
    businessType: 'hospitality',
    address: '1 High St',
    hours: { monday: '8-15' },
    tagline: 'Coffee',
    about: 'A cafe.',
    hero: {
      url: 'https://cdn.example/hero.jpg',
      width: 1600,
      height: 900,
      provenance: 'website_extraction',
      isLogoSuspect: false,
    },
    gallery: [
      { url: 'https://cdn.example/g1.jpg', width: 800, height: 600, provenance: 'website_extraction' },
      { url: 'https://cdn.example/g2.jpg', width: 800, height: 600, provenance: 'website_extraction' },
    ],
    items: [1, 2, 3, 4, 5, 6].map((i) => namedItem(i)),
    socialLinks: { instagram: 'https://instagram.com/test' },
    ...overrides,
  };
}

describe('computeSeedCompleteness', () => {
  it('empty seed is blocked with identity/hero/item blockers', () => {
    const result = computeSeedCompleteness({});
    expect(result.tier).toBe('blocked');
    expect(result.blockers).toEqual(
      expect.arrayContaining([
        'HERO_MISSING',
        'NAME_MISSING',
        'CATEGORY_MISSING',
        'ADDRESS_OR_HOURS_MISSING',
        'ITEMS_INSUFFICIENT',
      ]),
    );
    expect(result.score).toBe(0);
  });

  it('hero present but 800px is HERO_LOW_RES', () => {
    const result = computeSeedCompleteness(
      publishableBase({
        hero: {
          url: 'https://cdn.example/hero.jpg',
          width: 800,
          height: 600,
          provenance: 'website_extraction',
          isLogoSuspect: false,
        },
      }),
    );
    expect(result.blockers).toContain('HERO_LOW_RES');
    expect(result.tier).toBe('blocked');
  });

  it('logo-suspect hero with admin_curated provenance passes', () => {
    const result = computeSeedCompleteness(
      publishableBase({
        hero: {
          url: 'https://cdn.example/logo.png',
          width: 1600,
          height: 900,
          provenance: 'admin_curated',
          isLogoSuspect: true,
        },
      }),
    );
    expect(result.blockers).not.toContain('HERO_LOGO_SUSPECT');
    expect(result.blockers).not.toContain('HERO_MISSING');
  });

  it('service business with 3 named services and no prices is publishable', () => {
    const result = computeSeedCompleteness(
      publishableBase({
        businessType: 'service',
        category: 'yoga',
        items: [1, 2, 3].map((i) => namedItem(i, { price: null, itemType: 'service', description: null })),
        gallery: [
          { url: 'https://cdn.example/g1.jpg', width: 800, height: 600, provenance: null },
          { url: 'https://cdn.example/g2.jpg', width: 800, height: 600, provenance: null },
        ],
      }),
    );
    expect(result.gaps).not.toContain('ITEMS_UNPRICED');
    expect(result.blockers).not.toContain('ITEMS_INSUFFICIENT');
    expect(result.tier).toBe('publishable');
  });

  it('hospitality stock-fallback hero with 6 described items is good with HERO_STOCK_FALLBACK', () => {
    const result = computeSeedCompleteness(
      publishableBase({
        hero: {
          url: 'https://cdn.example/stock.jpg',
          width: 1600,
          height: 900,
          provenance: 'stock_fallback',
          isLogoSuspect: false,
        },
      }),
    );
    expect(result.tier).toBe('good');
    expect(result.gaps).toContain('HERO_STOCK_FALLBACK');
    expect(result.blockers).toHaveLength(0);
  });

  it('never self-promotes to prestige_ready even when gaps are empty', () => {
    const result = computeSeedCompleteness(publishableBase());
    expect(result.blockers).toHaveLength(0);
    expect(result.gaps).toHaveLength(0);
    expect(result.tier).toBe('good');
    expect(result.tier).not.toBe('prestige_ready');
  });

  it('score arithmetic floors at 0', () => {
    const result = computeSeedCompleteness({});
    expect(result.score).toBe(0);
    const oneBlocker = computeSeedCompleteness(
      publishableBase({
        hero: null,
      }),
    );
    expect(oneBlocker.blockers).toContain('HERO_MISSING');
    expect(oneBlocker.score).toBe(100 - oneBlocker.blockers.length * 15 - oneBlocker.gaps.length * 5);
  });
});

describe('toSeedSnapshot', () => {
  it('handles null relations without throwing', () => {
    expect(() => toSeedSnapshot(null)).not.toThrow();
    expect(() => toSeedSnapshot(undefined)).not.toThrow();
    expect(() => toSeedSnapshot({ normalized: null, enrichmentProfile: null, hero: null })).not.toThrow();
    const snap = toSeedSnapshot({
      normalized: { businessName: 'Brunetti Carlton', category: 'food', address: '380 Lygon' },
    });
    expect(snap.businessName).toBe('Brunetti Carlton');
    expect(snap.businessType).toBe('hospitality');
    expect(snap.hero).toBeNull();
    expect(snap.items).toEqual([]);
    expect(snap.gallery).toEqual([]);
  });

  it('maps logodev visual source to logo-suspect hero', () => {
    const snap = toSeedSnapshot({
      normalized: { businessName: 'Lune', category: 'bakery' },
      enrichmentProfile: {
        heroImageUrl: 'https://img.logo.dev/lune.com',
        visualSource: 'logodev',
        heroWidth: 400,
        heroHeight: 400,
      },
    });
    expect(snap.hero?.isLogoSuspect).toBe(true);
    expect(snap.hero?.url).toContain('logo.dev');
  });
});
