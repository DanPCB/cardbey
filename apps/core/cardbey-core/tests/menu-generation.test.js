/**
 * Unit tests for vertical-locked menu generation (MenuFirst path).
 * Tests validator and flatten; no LLM calls. Imports from validation module only.
 */

import {
  validateMenuOutput,
  flattenToPreviewShape,
  SYSTEM_PROMPT,
  USER_PROMPT_TEMPLATE,
} from '../src/services/draftStore/menuGenerationValidation.js';
import { describe, it, expect } from 'vitest';

describe('menuGenerationService (validation + prompts)', () => {
  describe('validateMenuOutput', () => {
    it('rejects when categories count is outside 4-10', () => {
      const parsed = { categories: [{ name: 'A', subcategories: [{ name: 'A1', items: [{ name: 'Item 1', description: 'd' }] }] }] };
      const r = validateMenuOutput(parsed, 'sweets_bakery');
      expect(r.valid).toBe(false);
      expect(r.errors.some((e) => e.includes('4-10'))).toBe(true);
    });

    it('rejects generic item names (Product 1, Retail 2)', () => {
      const categories = Array.from({ length: 6 }, (_, ci) => ({
        name: `Cat ${ci}`,
        subcategories: [
          { name: `Sub ${ci}-0`, items: Array.from({ length: 4 }, (_, i) => ({ name: `Product ${i + 1}`, description: 'desc' })) },
          { name: `Sub ${ci}-1`, items: Array.from({ length: 4 }, (_, i) => ({ name: `Real Item ${i}`, description: 'desc' })) },
        ],
      }));
      const r = validateMenuOutput({ categories }, 'sweets_bakery');
      expect(r.valid).toBe(false);
      expect(r.errors.some((e) => e.includes('Generic item name'))).toBe(true);
    });

    it('rejects off-vertical keyword (shoe) for sweets_bakery', () => {
      const categories = Array.from({ length: 6 }, (_, ci) => ({
        name: `Category ${ci}`,
        subcategories: [
          { name: `Sub ${ci}`, items: Array.from({ length: 4 }, (_, i) => ({ name: `Cake ${i}`, description: 'sweet dessert' })) },
        ],
      }));
      categories[0].subcategories[0].items[0] = { name: 'Shoe Sale', description: 'nice shoes' };
      const r = validateMenuOutput({ categories }, 'sweets_bakery');
      expect(r.valid).toBe(false);
      expect(r.errors.some((e) => e.includes('off-vertical') || e.includes('shoe'))).toBe(true);
    });

    it('accepts valid sweets_bakery menu (real names, no banned keywords)', () => {
      const categories = Array.from({ length: 6 }, (_, ci) => ({
        name: `Category ${ci}`,
        subcategories: [
          { name: `Sub ${ci}-0`, items: Array.from({ length: 4 }, (_, i) => ({ name: `Croissant ${i}`, description: 'buttery pastry' })) },
          { name: `Sub ${ci}-1`, items: Array.from({ length: 4 }, (_, i) => ({ name: `Cake Slice ${i}`, description: 'sweet dessert' })) },
        ],
      }));
      const r = validateMenuOutput({ categories }, 'sweets_bakery');
      expect(r.valid).toBe(true);
      expect(r.errors).toHaveLength(0);
    });
  });

  describe('flattenToPreviewShape', () => {
    it('produces flat categories and items with categoryId and null imageUrl', () => {
      const parsed = {
        categories: [
          { name: 'Cakes', subcategories: [{ name: 'Slices', items: [{ name: 'Chocolate Cake', description: 'Rich', price: '$5' }] }] },
        ],
      };
      const { categories, items } = flattenToPreviewShape(parsed, 'draft-1');
      expect(categories).toHaveLength(1);
      expect(categories[0].id).toBe('cat_0_0');
      expect(categories[0].name).toBe('Slices');
      expect(items).toHaveLength(1);
      expect(items[0].name).toBe('Chocolate Cake');
      expect(items[0].categoryId).toBe('cat_0_0');
      expect(items[0].imageUrl).toBeNull();
      expect(items[0].priceV1).toEqual({ amount: 5 });
    });

    it('sweets_bakery style: categories and items, no Product 1, null imageUrl', () => {
      const parsed = {
        categories: [
          { name: 'Cakes', subcategories: [{ name: 'Slices', items: [{ name: 'Victoria Sponge', description: 'd', price: '$4' }, { name: 'Brownie', description: 'd', price: '$3' }, { name: 'Muffin', description: 'd', price: '$2' }, { name: 'Cupcake', description: 'd', price: '$2.50' }] }] },
          { name: 'Pastries', subcategories: [{ name: 'Baked', items: [{ name: 'Croissant', description: 'd', price: '$3' }, { name: 'Danish', description: 'd', price: '$4' }, { name: 'Scone', description: 'd', price: '$2' }, { name: 'Chocolate Roll', description: 'd', price: '$3.50' }] }] },
        ],
      };
      const { categories, items } = flattenToPreviewShape(parsed, 't');
      expect(categories.length).toBeGreaterThanOrEqual(2);
      expect(items.every((i) => i.imageUrl === null)).toBe(true);
      const names = items.map((i) => i.name);
      expect(names).not.toContain('Product 1');
      expect(names.some((n) => n.toLowerCase().includes('cake') || n.toLowerCase().includes('croissant'))).toBe(true);
    });
  });

  describe('prompt constants', () => {
    it('SYSTEM_PROMPT instructs JSON only and no image URLs', () => {
      expect(SYSTEM_PROMPT).toContain('valid JSON');
      expect(SYSTEM_PROMPT).toContain('No markdown');
      expect(SYSTEM_PROMPT).toContain('image');
    });

    it('USER_PROMPT_TEMPLATE has placeholders for BUSINESS_NAME, VERTICAL, etc.', () => {
      expect(USER_PROMPT_TEMPLATE).toContain('{BUSINESS_NAME}');
      expect(USER_PROMPT_TEMPLATE).toContain('{VERTICAL}');
      expect(USER_PROMPT_TEMPLATE).toContain('categories');
      expect(USER_PROMPT_TEMPLATE).toContain('subcategories');
      expect(USER_PROMPT_TEMPLATE).toContain('items');
    });
  });
});
