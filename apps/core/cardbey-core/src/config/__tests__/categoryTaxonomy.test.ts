import { describe, expect, it } from 'vitest';
import {
  CATEGORY_TAXONOMY,
  resolveCategoryFromSignals,
  resolveSubCategory,
} from '../categoryTaxonomy.js';

describe('categoryTaxonomy', () => {
  it('exposes all Cardbey category labels', () => {
    expect(CATEGORY_TAXONOMY.map((entry) => entry.label)).toContain('Food & Drink');
    expect(CATEGORY_TAXONOMY.map((entry) => entry.label)).toContain('Other');
  });

  it('maps pub/hotel Google types to Food & Drink', () => {
    expect(
      resolveCategoryFromSignals({
        businessName: 'Braybrook Hotel',
        placesTypes: ['bar', 'pub', 'hotel', 'establishment'],
      }),
    ).toBe('Food & Drink');
  });

  it('maps legacy raw category string via placesTypes inference path', () => {
    expect(
      resolveCategoryFromSignals({
        businessName: 'Masarap Bakery',
        businessType: 'bakery',
      }),
    ).toBe('Food & Drink');
  });

  it('resolves food sub-category for cafe signals', () => {
    expect(
      resolveSubCategory({
        category: 'Food & Drink',
        businessName: 'Petit Cafe',
        businessType: 'cafe',
      }),
    ).toBe('Cafe');
  });

  it('returns Other when no signals match', () => {
    expect(resolveCategoryFromSignals({ businessName: 'XYZ Holdings Pty Ltd' })).toBe('Other');
  });

  it('resolves M&A advisory correctly', () => {
    expect(resolveCategoryFromSignals({ businessName: 'Anison Capital Group' })).toBe('Professional');
    expect(resolveCategoryFromSignals({ businessName: 'Capital Advisory Firm' })).toBe('Professional');
    expect(resolveCategoryFromSignals({ businessName: 'M&A Advisory Services' })).toBe('Professional');
  });

  it('resolves pub/bar/hotel and cellars correctly', () => {
    expect(
      resolveCategoryFromSignals({
        businessName: 'Braybrook Hotel',
        placesTypes: ['bar', 'pub', 'hotel'],
      }),
    ).toBe('Food & Drink');
    expect(
      resolveCategoryFromSignals({ businessName: 'Churchill Cellars Licensed Bar' }),
    ).toBe('Food & Drink');
  });

  it('resolves professional and pub sub-categories', () => {
    expect(
      resolveSubCategory({
        category: 'Professional',
        businessName: 'Anison Capital Group',
        businessType: 'capital advisory',
      }),
    ).toBe('M&A Advisory');
    expect(
      resolveSubCategory({
        category: 'Food & Drink',
        businessName: 'Braybrook Hotel',
        placesTypes: ['bar', 'pub', 'hotel'],
      }),
    ).toBe('Pub & bar');
    expect(
      resolveSubCategory({
        category: 'Food & Drink',
        businessName: 'Churchill Cellars',
        businessType: 'licensed bar',
      }),
    ).toBe('Pub & bar');
  });
});
