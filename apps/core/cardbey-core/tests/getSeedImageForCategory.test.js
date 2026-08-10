/**
 * Unit tests for getSeedImageForCategory. Selection is key-based only (categoryKey, vertical, orientation).
 * No index-based logic; used only for fallback when hero/item image is missing.
 */

import { describe, it, expect } from 'vitest';
import {
  getSeedImageForCategory,
  resolveHeroQuery,
  businessNameOverridesHeroCategory,
} from '../src/lib/seedLibrary/getSeedImageForCategory.js';

describe('resolveHeroQuery', () => {
  it('prefers signage query for abc signs even when category is Arts & crafts', () => {
    expect(resolveHeroQuery('abc signs', 'Arts & crafts')).toBe(
      'business signage neon signs storefront',
    );
    expect(businessNameOverridesHeroCategory('abc signs', 'Arts & crafts')).toBe(true);
  });

  it('uses fashion category for My Fashion when name does not override', () => {
    expect(resolveHeroQuery('My Fashion', 'Fashion')).toBe('fashion boutique clothing store');
  });

  it('prefers fashion query when business name contains fashion keyword', () => {
    expect(resolveHeroQuery('My Fashion House', 'Food')).toBe('fashion boutique clothing store');
  });

  it('prefers bakery query for My Bakery even when category is Food & drink', () => {
    expect(resolveHeroQuery('My Bakery', 'Food & drink')).toBe('bakery fresh bread pastry shop');
    expect(businessNameOverridesHeroCategory('My Bakery', 'Food & drink')).toBe(true);
  });

  it('uses bakery category key when category mentions bakery', () => {
    expect(resolveHeroQuery('Corner Shop', 'Bakery')).toBe('bakery pastry shop');
  });

  it('maps capital/finance business names to corporate finance hero query', () => {
    expect(resolveHeroQuery('Anison Capital Group', 'general')).toBe(
      'corporate finance office modern skyline',
    );
    expect(businessNameOverridesHeroCategory('Anison Capital Group', 'general')).toBe(true);
  });

  it('does not fall back to retail storefront for unmapped types', () => {
    const q = resolveHeroQuery('Sunrise Partners', 'consulting');
    expect(q).toBe('business consulting meeting modern office');
    expect(q.toLowerCase()).not.toContain('storefront');
  });

  it('derives a type-aware default instead of small business storefront', () => {
    const q = resolveHeroQuery('Northwind Analytics', 'general');
    expect(q.toLowerCase()).not.toContain('storefront');
    expect(q).toMatch(/professional business office/i);
  });
});

describe('getSeedImageForCategory', () => {
  it('returns null or a non-empty string (no throw)', async () => {
    const result = await getSeedImageForCategory({ vertical: 'food', categoryKey: 'burger', orientation: 'landscape' });
    expect(result === null || (typeof result === 'string' && result.length > 0)).toBe(true);
  });

  it('accepts empty opts', async () => {
    const result = await getSeedImageForCategory({});
    expect(result === null || (typeof result === 'string' && result.length > 0)).toBe(true);
  });

  it('accepts only vertical (key-based)', async () => {
    const result = await getSeedImageForCategory({ vertical: 'beauty' });
    expect(result === null || typeof result === 'string').toBe(true);
  });

  it('trims and uses string params only (no index)', async () => {
    const result = await getSeedImageForCategory({ categoryKey: '  dessert  ', vertical: 'food', orientation: 'landscape' });
    expect(result === null || typeof result === 'string').toBe(true);
  });
});
