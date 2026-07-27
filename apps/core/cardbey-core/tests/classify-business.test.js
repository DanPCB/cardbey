/**
 * Classify business: verticalSlug + businessDescriptionShort.
 * Test cases: Seafood → food.seafood, Nails & Beauty → beauty.nails, Fashion → fashion.boutique (or fashion.mens/womens).
 */
import { describe, expect, it } from 'vitest';
import { classifyBusiness } from '../src/services/mi/classifyBusinessService.js';

describe('classifyBusiness', () => {
  it('Seafood → verticalSlug = food.seafood', async () => {
    const result = await classifyBusiness({
      businessName: 'Harbour Seafood',
      businessType: 'Seafood restaurant',
      location: 'Sydney',
    });
    expect(result).toBeDefined();
    expect(result.verticalSlug).toBe('food.seafood');
    expect(result.verticalGroup).toBe('food');
    expect(typeof result.confidence).toBe('number');
    expect(typeof result.businessDescriptionShort).toBe('string');
    expect(Array.isArray(result.keywords)).toBe(true);
  });

  it('Nails & Beauty → verticalSlug = beauty.nails', async () => {
    const result = await classifyBusiness({
      businessName: 'Glam Nails',
      businessType: 'Nails & Beauty',
      location: '',
    });
    expect(result).toBeDefined();
    expect(result.verticalSlug).toBe('beauty.nails');
    expect(result.verticalGroup).toBe('beauty');
    expect(typeof result.businessDescriptionShort).toBe('string');
  });

  it('Fashion → verticalSlug = fashion.boutique (or fashion.mens/womens when indicated)', async () => {
    const result = await classifyBusiness({
      businessName: 'Street Style Co',
      businessType: 'Fashion boutique',
      location: '',
    });
    expect(result).toBeDefined();
    expect(result.verticalSlug).toMatch(/^fashion\./);
    expect(['fashion.boutique', 'fashion.mens', 'fashion.womens']).toContain(result.verticalSlug);
    expect(result.verticalGroup).toBe('fashion');
    expect(typeof result.businessDescriptionShort).toBe('string');
  });

  it('Children Clothing → verticalSlug = fashion.kids', async () => {
    const result = await classifyBusiness({
      businessName: 'Any Store Name',
      businessType: 'Children Clothing',
      location: '',
    });
    expect(result).toBeDefined();
    expect(result.verticalSlug).toBe('fashion.kids');
    expect(result.verticalGroup).toBe('fashion');
    expect(Array.isArray(result.keywords)).toBe(true);
  });

  it('returns heuristic result when AI unavailable (fallback)', async () => {
    const result = await classifyBusiness({
      businessName: 'Joe\'s Fish & Chips',
      businessType: 'Seafood',
    });
    expect(result).toBeDefined();
    expect(result.verticalSlug).toBe('food.seafood');
    expect(result.verticalGroup).toBe('food');
    expect(result.businessDescriptionShort.length).toBeLessThanOrEqual(140);
  });
});
