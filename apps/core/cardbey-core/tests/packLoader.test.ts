/**
 * Pack loader tests – parsing and validation only; no DB or runtime flow.
 */

import { describe, it, expect } from 'vitest';
import { loadPackFromJson, validateRawPack, PackLoadError } from '../src/lib/catalog/packLoader.js';

describe('packLoader', () => {
  const validPack = {
    businessType: 'cafe',
    region: 'AU',
    version: '1.0',
    name: 'Test Pack',
    categories: [
      { key: 'drinks', label: 'Drinks', sortOrder: 0 },
    ],
    items: [
      {
        type: 'FOOD',
        canonicalName: 'Coffee',
        shortDescription: 'Hot coffee',
        tags: ['coffee'],
        categoryKey: 'drinks',
      },
    ],
  };

  describe('validateRawPack', () => {
    it('accepts valid pack', () => {
      expect(() => validateRawPack(validPack)).not.toThrow();
    });

    it('throws on missing businessType', () => {
      expect(() => validateRawPack({ ...validPack, businessType: '' })).toThrow(PackLoadError);
      expect(() => validateRawPack({ ...validPack, businessType: undefined })).toThrow();
    });

    it('throws on missing name', () => {
      expect(() => validateRawPack({ ...validPack, name: '' })).toThrow(PackLoadError);
    });

    it('throws on invalid item type', () => {
      const bad = {
        ...validPack,
        items: [{ ...validPack.items[0], type: 'INVALID' }],
      };
      expect(() => validateRawPack(bad)).toThrow(PackLoadError);
    });

    it('throws when item categoryKey does not exist', () => {
      const bad = {
        ...validPack,
        items: [{ ...validPack.items[0], categoryKey: 'nonexistent' }],
      };
      expect(() => validateRawPack(bad)).toThrow(PackLoadError);
    });

    it('throws when category parentKey does not exist', () => {
      const bad = {
        ...validPack,
        categories: [
          { key: 'child', label: 'Child', parentKey: 'missing_parent', sortOrder: 0 },
        ],
        items: [{ ...validPack.items[0], categoryKey: 'child' }],
      };
      expect(() => validateRawPack(bad)).toThrow(PackLoadError);
    });
  });

  describe('loadPackFromJson', () => {
    it('returns packMeta, categoriesNormalized, itemsNormalized, starterPackItemJoin', () => {
      const loaded = loadPackFromJson(validPack);
      expect(loaded.packMeta.businessType).toBe('cafe');
      expect(loaded.packMeta.region).toBe('AU');
      expect(loaded.packMeta.version).toBe('1.0');
      expect(loaded.packMeta.name).toBe('Test Pack');
      expect(loaded.categoriesNormalized).toHaveLength(1);
      expect(loaded.categoriesNormalized[0].key).toBe('drinks');
      expect(loaded.itemsNormalized).toHaveLength(1);
      expect(loaded.itemsNormalized[0].canonicalName).toBe('Coffee');
      expect(loaded.itemsNormalized[0].type).toBe('FOOD');
      expect(loaded.starterPackItemJoin).toHaveLength(1);
      expect(loaded.starterPackItemJoin[0].categoryKey).toBe('drinks');
    });

    it('normalizes category parentKey', () => {
      const withParent = {
        ...validPack,
        categories: [
          { key: 'parent', label: 'Parent', sortOrder: 0 },
          { key: 'child', label: 'Child', parentKey: 'parent', sortOrder: 1 },
        ],
        items: [{ ...validPack.items[0], categoryKey: 'child' }],
      };
      const loaded = loadPackFromJson(withParent);
      expect(loaded.categoriesNormalized).toHaveLength(2);
      const child = loaded.categoriesNormalized.find((c) => c.key === 'child');
      expect(child?.parentKey).toBe('parent');
    });

    it('defaults businessTypeHints and localeHints from pack', () => {
      const loaded = loadPackFromJson(validPack);
      expect(loaded.itemsNormalized[0].businessTypeHints).toContain('cafe');
      expect(loaded.itemsNormalized[0].localeHints).toContain('AU');
    });
  });
});
