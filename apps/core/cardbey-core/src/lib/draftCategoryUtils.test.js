import { describe, expect, it } from 'vitest';
import {
  isPlaceholderCategoryName,
  recomputeDraftCategoriesFromItems,
  sanitizeDraftCategoryList,
  validateCategoriesForPublish,
} from './draftCategoryUtils.js';

describe('draftCategoryUtils', () => {
  it('detects placeholder category names', () => {
    expect(isPlaceholderCategoryName('cat_0')).toBe(true);
    expect(isPlaceholderCategoryName('cat_12')).toBe(true);
    expect(isPlaceholderCategoryName('Manicures')).toBe(false);
  });

  it('recomputeDraftCategoriesFromItems uses real names and merges unknown into Other', () => {
    const { categories, items } = recomputeDraftCategoriesFromItems([
      { id: 'a', name: 'Gel Mani', category: 'Manicures' },
      { id: 'b', name: 'Pedi', categoryName: 'Pedicures' },
      { id: 'c', name: 'Mystery', categoryId: 'cat_0' },
    ]);
    expect(categories.map((c) => c.name).sort()).toEqual(['Manicures', 'Other', 'Pedicures']);
    expect(items.find((i) => i.id === 'c')?.categoryId).toBe('other');
    expect(categories.some((c) => /^cat_\d+$/.test(c.name))).toBe(false);
  });

  it('sanitizeDraftCategoryList remaps cat_N names to Other', () => {
    const out = sanitizeDraftCategoryList([
      { id: 'cat_0', name: 'cat_0' },
      { id: 'cat_1', name: 'cat_1' },
    ]);
    expect(out.every((c) => !/^cat_\d+$/.test(c.name))).toBe(true);
    expect(out.some((c) => c.name === 'Other')).toBe(true);
  });

  it('validateCategoriesForPublish rejects cat_N labels', () => {
    expect(validateCategoriesForPublish([{ id: 'x', name: 'Golf Tours' }]).ok).toBe(true);
    const bad = validateCategoriesForPublish([{ id: 'cat_0', name: 'cat_0' }]);
    expect(bad.ok).toBe(false);
    expect(bad.invalidNames).toContain('cat_0');
  });
});
