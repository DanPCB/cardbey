import { describe, expect, it } from 'vitest';
import { scoreDraftPackageCompleteness } from './scoreDraftPackageCompleteness.js';

describe('scoreDraftPackageCompleteness', () => {
  it('scores empty preview low', () => {
    const result = scoreDraftPackageCompleteness({});
    expect(result.score).toBeLessThan(50);
    expect(result.missing.length).toBeGreaterThan(0);
  });

  it('scores rich preview above minimum threshold', () => {
    const result = scoreDraftPackageCompleteness({
      storeName: 'Brunetti Carlton',
      storeType: 'cafe',
      heroImageUrl: 'https://example.com/hero.jpg',
      tagline: 'Authentic Italian cafe',
      phone: '+61393495200',
      categories: [{ id: '1', name: 'Pastries' }],
      items: [{ id: 'o1', name: 'Welcome coffee offer' }],
      website: {
        sections: [
          { type: 'hero', content: { headline: 'Brunetti Carlton' } },
          { type: 'about', content: { body: 'Family bakery since 1985' } },
          { type: 'contact', content: { phone: '+61393495200' } },
        ],
      },
    });
    expect(result.score).toBeGreaterThanOrEqual(50);
    expect(result.checks.businessProfile).toBe(true);
    expect(result.checks.hero).toBe(true);
  });
});
