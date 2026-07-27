import { describe, expect, it } from 'vitest';
import { validateCatalogHierarchy } from './validateCatalogHierarchy.js';

describe('validateCatalogHierarchy', () => {
  it('accepts assigned hierarchical catalog', () => {
    const result = validateCatalogHierarchy({
      categories: [
        { id: 'cat_a', name: 'Entrées', level: 0, path: ['Entrées'] },
        { id: 'cat_b', name: 'Mains', level: 0, path: ['Mains'] },
      ],
      items: [
        { id: '1', name: 'Spring Roll', categoryId: 'cat_a' },
        { id: '2', name: 'Pho', categoryId: 'cat_b' },
      ],
    });
    expect(result.ok).toBe(true);
    expect(result.failureCodes).toEqual([]);
  });

  it('flags unassigned items and missing categories', () => {
    const missing = validateCatalogHierarchy({
      categories: [],
      items: [{ id: '1', name: 'X' }],
    });
    expect(missing.ok).toBe(false);
    expect(missing.failureCodes).toContain('CATALOG_CATEGORY_MISSING');

    const unassigned = validateCatalogHierarchy({
      categories: [{ id: 'cat_a', name: 'A' }],
      items: [{ id: '1', name: 'X', categoryId: 'missing' }],
    });
    expect(unassigned.failureCodes).toContain('CATALOG_ITEM_UNASSIGNED');
  });

  it('detects parent cycle', () => {
    const result = validateCatalogHierarchy({
      categories: [
        { id: 'a', name: 'A', parentId: 'b' },
        { id: 'b', name: 'B', parentId: 'a' },
      ],
      items: [],
    });
    expect(result.failureCodes).toContain('CATALOG_CATEGORY_CYCLE');
  });
});
