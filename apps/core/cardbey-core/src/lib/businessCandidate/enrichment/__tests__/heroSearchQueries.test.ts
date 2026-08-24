import { describe, expect, it } from 'vitest';
import { buildHeroQueries, buildHeroSearchQueries } from '../heroSearchQueries.js';

describe('Hero query builder', () => {
  it('builds professional service queries', () => {
    const queries = buildHeroQueries(
      'Anison Capital Group',
      'Melbourne',
      'professional',
      'ma-advisory',
      'Professional',
      'M&A Advisory',
    );
    expect(queries[0]).toBe('Anison Capital Group Melbourne');
    expect(queries.some((q) => /corporate advisory/i.test(q))).toBe(true);
  });

  it('does not fall back to Other suburb storefront for Professional', () => {
    const queries = buildHeroSearchQueries({
      businessName: 'Anison Capital Group',
      suburb: 'Melbourne',
      category: 'Professional',
      tags: ['ma-advisory'],
    });
    expect(queries.join(' ')).not.toMatch(/Other Melbourne storefront/i);
    expect(queries.some((q) => /corporate|advisory|office|Anison/i.test(q))).toBe(true);
  });
});
