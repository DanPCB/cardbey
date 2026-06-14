import { describe, expect, it } from 'vitest';
import {
  resolveCommerceMode,
  resolveItemCommerceMode,
  resolveStoreCommerce,
} from './storeTransactionMode.js';
import { recomputeDraftCategoriesFromItems } from './draftCategoryUtils.js';

describe('resolveCommerceMode', () => {
  it('classifies nail salon and travel agency as booking', () => {
    expect(resolveCommerceMode('nail salon')).toBe('booking');
    expect(resolveCommerceMode('travel agency')).toBe('booking');
    expect(resolveCommerceMode('golf tour')).toBe('booking');
  });

  it('classifies restaurant as order', () => {
    expect(resolveCommerceMode('restaurant')).toBe('order');
  });

  it('mixed salon retail infers per-item modes', () => {
    const commerce = resolveStoreCommerce({
      storeType: 'nail salon',
      items: [
        { name: 'Gel Mani', kind: 'service' },
        { name: 'Polish', kind: 'product' },
      ],
    });
    expect(commerce.transactionMode).toBe('booking');
    const ctx = { businessType: 'nail salon' };
    expect(resolveItemCommerceMode({ kind: 'product' }, commerce.commerceMode, ctx)).toBe('order');
    expect(resolveItemCommerceMode({ kind: 'service' }, commerce.commerceMode, ctx)).toBe('booking');
  });
});

describe('recomputeDraftCategoriesFromItems integration', () => {
  it('never publishes cat_N category chips', () => {
    const { categories } = recomputeDraftCategoriesFromItems([
      { id: '1', name: 'Tour A', categoryId: 'cat_0' },
      { id: '2', name: 'Tour B', category: 'Golf Tours' },
    ]);
    expect(categories.map((c) => c.name).sort()).toEqual(['Golf Tours', 'Other']);
  });
});
