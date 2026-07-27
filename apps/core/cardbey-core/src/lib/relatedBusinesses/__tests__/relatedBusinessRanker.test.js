/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import {
  TAXONOMY_VERSION,
  buildRelatedCacheKey,
  normalizeBusinessCategory,
  normalizeBusinessSubcategory,
  areCategoriesIncompatible,
} from '../businessCategoryTaxonomy.js';
import { rankRelatedCandidates } from '../relatedBusinessRanker.js';

describe('businessCategoryTaxonomy', () => {
  it('normalises legacy food labels', () => {
    expect(normalizeBusinessCategory('Food & drink')).toBe('FOOD_AND_DRINK');
    expect(normalizeBusinessCategory('Restaurant')).toBe('FOOD_AND_DRINK');
    expect(normalizeBusinessCategory('Takeaway')).toBe('FOOD_AND_DRINK');
    expect(normalizeBusinessCategory('Hot Chicken')).toBe('FOOD_AND_DRINK');
  });

  it('normalises barber and massage to beauty/wellness', () => {
    expect(normalizeBusinessCategory('Barber')).toBe('BEAUTY_AND_WELLNESS');
    expect(normalizeBusinessCategory('Thai Massage')).toBe('BEAUTY_AND_WELLNESS');
    expect(normalizeBusinessSubcategory('barber', 'BEAUTY_AND_WELLNESS')).toBe('BARBER');
    expect(normalizeBusinessSubcategory('massage', 'BEAUTY_AND_WELLNESS')).toBe('MASSAGE');
  });

  it('marks food vs barber incompatible', () => {
    expect(areCategoriesIncompatible('FOOD_AND_DRINK', 'BEAUTY_AND_WELLNESS')).toBe(true);
  });

  it('cache key includes taxonomy + ranking versions', () => {
    const key = buildRelatedCacheKey({
      storeId: 's1',
      category: 'FOOD_AND_DRINK',
      subcategory: 'RESTAURANT',
      location: { suburb: 'Braybrook', city: 'Melbourne' },
    });
    expect(key).toContain(TAXONOMY_VERSION);
    expect(key).toContain('FOOD_AND_DRINK');
    expect(key).toContain('s1');
  });
});

describe('rankRelatedCandidates', () => {
  const hotChicken = {
    id: 'src',
    slug: 'hot-chicken',
    name: 'Hot Chicken',
    type: 'Restaurant',
    suburb: 'Braybrook',
    city: 'Melbourne',
    isActive: true,
    publishedAt: new Date(),
    hasPublicStorefront: true,
  };

  const foodA = {
    id: 'f1',
    slug: 'chingu-korean-bbq',
    name: 'Chingu Korean BBQ',
    type: 'Restaurant',
    suburb: 'Footscray',
    city: 'Melbourne',
    isActive: true,
    publishedAt: new Date(),
    hasPublicStorefront: true,
  };
  const foodB = {
    id: 'f2',
    slug: 'pho-ngon-footscray',
    name: 'Pho Ngon Footscray',
    type: 'Vietnamese Restaurant',
    suburb: 'Footscray',
    city: 'Melbourne',
    isActive: true,
    publishedAt: new Date(),
    hasPublicStorefront: true,
  };
  const barber = {
    id: 'b1',
    slug: 'promax-barber',
    name: 'Promax Barber',
    type: 'Barber',
    suburb: 'Melbourne',
    city: 'Melbourne',
    isActive: true,
    publishedAt: new Date(),
    hasPublicStorefront: true,
  };
  const massage = {
    id: 'm1',
    slug: 'pink-lotus-thai-massage',
    name: 'Pink Lotus Thai Massage',
    type: 'Massage',
    suburb: 'Melbourne',
    city: 'Melbourne',
    isActive: true,
    publishedAt: new Date(),
    hasPublicStorefront: true,
  };
  const inactiveFood = {
    id: 'f3',
    slug: 'closed-kitchen',
    name: 'Closed Kitchen',
    type: 'Restaurant',
    isActive: false,
    publishedAt: new Date(),
    hasPublicStorefront: true,
  };

  it('only returns food candidates for a food store when food inventory exists', () => {
    const result = rankRelatedCandidates(hotChicken, [foodA, foodB, barber, massage], {
      limit: 8,
      diagnostics: true,
    });
    expect(result.related.map((r) => r.slug)).toEqual(['chingu-korean-bbq', 'pho-ngon-footscray']);
    expect(result.related.some((r) => r.slug === 'promax-barber')).toBe(false);
    expect(result.related.some((r) => r.slug === 'pink-lotus-thai-massage')).toBe(false);
    expect(result.context.fallbackLevel).toBe('same_category');
  });

  it('never ranks barber/massage above available restaurants', () => {
    const result = rankRelatedCandidates(hotChicken, [barber, foodA, massage, foodB], {
      diagnostics: true,
    });
    const slugs = result.related.map((r) => r.slug);
    expect(slugs[0]).toBe('chingu-korean-bbq');
    expect(slugs).not.toContain('promax-barber');
    expect(slugs).not.toContain('pink-lotus-thai-massage');
    const foodScore = result.diagnostics.find((d) => d.slug === 'chingu-korean-bbq')?.score ?? 0;
    const barberScore = result.diagnostics.find((d) => d.slug === 'promax-barber')?.score ?? 0;
    expect(foodScore).toBeGreaterThan(barberScore);
  });

  it('excludes current store and inactive candidates', () => {
    const result = rankRelatedCandidates(hotChicken, [hotChicken, inactiveFood, foodA]);
    expect(result.related.map((r) => r.slug)).toEqual(['chingu-korean-bbq']);
  });

  it('returns fewer related cards rather than filling with incompatible', () => {
    const result = rankRelatedCandidates(hotChicken, [foodA, barber, massage], { limit: 8 });
    expect(result.related).toHaveLength(1);
    expect(result.generalFallback.length).toBeGreaterThanOrEqual(0);
    expect(result.related[0].slug).toBe('chingu-korean-bbq');
  });

  it('uses general fallback only when no related inventory', () => {
    const result = rankRelatedCandidates(hotChicken, [barber, massage], { limit: 4 });
    expect(result.related).toHaveLength(0);
    expect(result.context.fallbackLevel).toBe('general');
    expect(result.generalFallback.length).toBeGreaterThan(0);
  });

  it('is deterministic', () => {
    const a = rankRelatedCandidates(hotChicken, [massage, foodB, barber, foodA]);
    const b = rankRelatedCandidates(hotChicken, [foodA, foodB, barber, massage]);
    expect(a.related.map((r) => r.slug)).toEqual(b.related.map((r) => r.slug));
  });

  it('cache keys differ by category', () => {
    const foodKey = buildRelatedCacheKey({
      storeId: 's1',
      category: 'FOOD_AND_DRINK',
      subcategory: null,
      location: {},
    });
    const beautyKey = buildRelatedCacheKey({
      storeId: 's1',
      category: 'BEAUTY_AND_WELLNESS',
      subcategory: null,
      location: {},
    });
    expect(foodKey).not.toBe(beautyKey);
  });
});
