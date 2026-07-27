import { describe, expect, it } from 'vitest';
import { categoryNameToId, parseProductPagination } from './listStoreProducts.js';
import { API_PRODUCTS_DEFAULT_LIMIT, API_PRODUCTS_MAX_LIMIT } from '../config/catalogLimits.js';

describe('listStoreProducts helpers', () => {
  it('categoryNameToId slugifies category labels', () => {
    expect(categoryNameToId('Drinks')).toBe('drinks');
    expect(categoryNameToId(null)).toBe('other');
    expect(categoryNameToId('')).toBe('other');
  });

  it('parseProductPagination defaults and caps limit', () => {
    expect(parseProductPagination(undefined, undefined)).toEqual({
      limit: API_PRODUCTS_DEFAULT_LIMIT,
      offset: 0,
    });
    expect(parseProductPagination('999', '10')).toEqual({
      limit: API_PRODUCTS_MAX_LIMIT,
      offset: 10,
    });
  });
});
