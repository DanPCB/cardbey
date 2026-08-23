import { describe, expect, it } from 'vitest';
import { buildHeroSearchQueries, inferHeroSubCategory } from '../enrichment/heroSearchQueries.js';

describe('heroSearchQueries', () => {
  it('infers pub sub-category for hotel/bar names', () => {
    expect(
      inferHeroSubCategory({
        businessName: 'Braybrook Hotel',
        placesTypes: ['bar', 'pub', 'hotel'],
      }),
    ).toBe('pub');
  });

  it('builds fallback ladder category-first so name search does not burn fetch budget', () => {
    const queries = buildHeroSearchQueries({
      businessName: 'Braybrook Hotel',
      suburb: 'Braybrook',
      category: 'Food & Drink',
      placesTypes: ['bar', 'pub', 'hotel'],
      metro: 'Melbourne',
    });
    expect(queries[0]).toBe('pub Braybrook');
    expect(queries).toContain('pub Melbourne');
    expect(queries.some((q) => q.includes('bar restaurant food drink'))).toBe(true);
    expect(queries.at(-1)).toBe('Braybrook Hotel Braybrook');
  });
});
