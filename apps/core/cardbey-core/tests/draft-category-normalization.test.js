/**
 * Unit tests for draft preview category normalization.
 * Ensures "Other" category exists and every item has a valid categoryId (deterministic breadcrumb contract).
 */
import { describe, expect, it } from 'vitest';
import { normalizePreviewCategories } from '../src/services/draftStore/draftStoreService.js';

describe('normalizePreviewCategories', () => {
  it('ensures categories array includes { id: "other", name: "Other" }', () => {
    const preview = {
      storeName: 'Test',
      categories: [{ id: 'mains', name: 'Mains' }],
      items: [{ id: 'i1', name: 'Burger', categoryId: 'mains' }],
    };
    normalizePreviewCategories(preview);
    const otherCat = preview.categories.find((c) => c && String(c.id).toLowerCase() === 'other');
    expect(otherCat).toBeDefined();
    expect(otherCat.name).toBe('Other');
  });

  it('reassigns items with invalid categoryId to "other"', () => {
    const preview = {
      storeName: 'Test',
      categories: [{ id: 'other', name: 'Other' }, { id: 'mains', name: 'Mains' }],
      items: [
        { id: 'i1', name: 'Burger', categoryId: 'mains' },
        { id: 'i2', name: 'Unknown', categoryId: 'invalid-id' },
        { id: 'i3', name: 'NoCat' },
      ],
    };
    normalizePreviewCategories(preview);
    const validIds = new Set(preview.categories.map((c) => c.id));
    expect(validIds.has('other')).toBe(true);
    expect(validIds.has('mains')).toBe(true);
    const i1 = preview.items.find((x) => x.id === 'i1');
    const i2 = preview.items.find((x) => x.id === 'i2');
    const i3 = preview.items.find((x) => x.id === 'i3');
    expect(i1.categoryId).toBe('mains');
    expect(i2.categoryId).toBe('other');
    expect(i3.categoryId).toBe('other');
    expect(validIds.has(i2.categoryId)).toBe(true);
    expect(validIds.has(i3.categoryId)).toBe(true);
  });

  it('coerces category named "Other" with different id to id "other"', () => {
    const preview = {
      storeName: 'Test',
      categories: [{ id: 'uncategorized', name: 'Other' }],
      items: [{ id: 'i1', name: 'Item', categoryId: 'uncategorized' }],
    };
    normalizePreviewCategories(preview);
    const otherCat = preview.categories.find((c) => c && String(c.name).toLowerCase() === 'other');
    expect(otherCat).toBeDefined();
    expect(otherCat.id).toBe('other');
    expect(preview.items[0].categoryId).toBe('other');
  });

  it('does nothing when preview is null or not an object', () => {
    expect(normalizePreviewCategories(null)).toBe(null);
    expect(normalizePreviewCategories(undefined)).toBe(undefined);
    expect(normalizePreviewCategories('string')).toBe('string');
  });

  it('leaves valid categoryIds unchanged', () => {
    const preview = {
      storeName: 'Test',
      categories: [{ id: 'starters', name: 'Entrees' }, { id: 'other', name: 'Other' }],
      items: [
        { id: 'i1', name: 'Salad', categoryId: 'starters' },
        { id: 'i2', name: 'Misc', categoryId: 'other' },
      ],
    };
    normalizePreviewCategories(preview);
    expect(preview.items[0].categoryId).toBe('starters');
    expect(preview.items[1].categoryId).toBe('other');
    expect(preview.categories.some((c) => c.id === 'other')).toBe(true);
  });
});
