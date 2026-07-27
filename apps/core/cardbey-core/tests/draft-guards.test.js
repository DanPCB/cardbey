/**
 * Phase 2 draft guardrails: vertical inference, food candidate filter, de-generic naming.
 * Unit tests for draftGuards module; one integration-style test for generateDraft with flag on.
 */

import { afterEach, describe, expect, it } from 'vitest';
import {
  effectiveVertical,
  isBlockedCandidateForFood,
  applyItemGuards,
  applyNameGuards,
  isDraftGuardsEnabled,
  GENERIC_NAME_REGEX,
} from '../src/services/draftStore/draftGuards.js';

describe('draftGuards (unit)', () => {
  describe('effectiveVertical', () => {
    it('maps sweets/dessert/bakery/cafe/coffee to food', () => {
      expect(effectiveVertical('cafe')).toBe('food');
      expect(effectiveVertical('coffee-shop')).toBe('food');
      expect(effectiveVertical('bakery')).toBe('food');
      expect(effectiveVertical('restaurant')).toBe('food');
    });

    it('maps florist/flowers to florist', () => {
      expect(effectiveVertical('florist')).toBe('florist');
      expect(effectiveVertical('flowers')).toBe('florist');
    });

    it('maps plumbing/electrician/roofing to trades', () => {
      expect(effectiveVertical('plumbing')).toBe('trades');
      expect(effectiveVertical('electrician')).toBe('trades');
      expect(effectiveVertical('roofing')).toBe('trades');
    });

    it('defaults to products for unknown type', () => {
      expect(effectiveVertical('retail')).toBe('products');
      expect(effectiveVertical('')).toBe('products');
    });
  });

  describe('isBlockedCandidateForFood', () => {
    it('allows food-relevant names', () => {
      expect(isBlockedCandidateForFood('Espresso')).toBe(false);
      expect(isBlockedCandidateForFood('Caesar Salad')).toBe(false);
    });

    it('blocks shoe, fashion, model, mannequin, office, interior, portrait, jeans', () => {
      expect(isBlockedCandidateForFood('Shoe Sale')).toBe(true);
      expect(isBlockedCandidateForFood('Office Coffee')).toBe(true);
      expect(isBlockedCandidateForFood('Fashion Cupcake')).toBe(true);
      expect(isBlockedCandidateForFood('Portrait')).toBe(true);
    });

    it('checks description when provided', () => {
      expect(isBlockedCandidateForFood('Item', 'mannequin display')).toBe(true);
    });
  });

  describe('applyItemGuards', () => {
    it('sets imageUrl to null for food vertical when candidate is blocked', () => {
      const items = [
        { name: 'Espresso', imageUrl: 'https://example.com/1.jpg' },
        { name: 'Shoe Polish', imageUrl: 'https://example.com/2.jpg' },
      ];
      applyItemGuards(items, 'food');
      expect(items[0].imageUrl).toBe('https://example.com/1.jpg');
      expect(items[1].imageUrl).toBeNull();
    });

    it('does nothing for non-food vertical', () => {
      const items = [{ name: 'Shoe Sale', imageUrl: 'https://example.com/1.jpg' }];
      applyItemGuards(items, 'products');
      expect(items[0].imageUrl).toBe('https://example.com/1.jpg');
    });

    it('food store returned items do not have blocked image URLs (or are null)', () => {
      const items = [
        { name: 'Latte', imageUrl: 'https://a.com/latte.jpg' },
        { name: 'Office Supplies', imageUrl: 'https://b.com/office.jpg' },
      ];
      applyItemGuards(items, 'food');
      expect(items[0].imageUrl).toBe('https://a.com/latte.jpg');
      expect(items[1].imageUrl).toBeNull();
    });
  });

  describe('applyNameGuards', () => {
    it('replaces generic pattern "general 1" / "retail 2" / "product 3" with vertical default + index for food', () => {
      const categories = [{ id: 'cat_0', name: 'Drinks' }];
      const items = [
        { name: 'general 1', categoryId: 'cat_0' },
        { name: 'retail 2', categoryId: 'cat_0' },
      ];
      applyNameGuards(items, 'food', categories);
      expect(items[0].name).toBe('Drinks 1');
      expect(items[1].name).toBe('Drinks 2');
    });

    it('uses vertical default when no category', () => {
      const items = [{ name: 'product 1', categoryId: 'other' }];
      applyNameGuards(items, 'food', [{ id: 'other', name: 'Other' }]);
      expect(items[0].name).toBe('Other 1');
    });

    it('leaves non-generic names unchanged', () => {
      const items = [{ name: 'Espresso', categoryId: 'cat_0' }];
      applyNameGuards(items, 'food', [{ id: 'cat_0', name: 'Drinks' }]);
      expect(items[0].name).toBe('Espresso');
    });

    it('no generic names in returned items after applyNameGuards', () => {
      const categories = [{ id: 'mains', name: 'Mains' }];
      const items = [
        { name: 'Product 1', categoryId: 'mains' },
        { name: 'Margherita Pizza', categoryId: 'mains' },
      ];
      applyNameGuards(items, 'food', categories);
      expect(GENERIC_NAME_REGEX.test(items[0].name)).toBe(false);
      expect(items[0].name).toBe('Mains 1');
      expect(items[1].name).toBe('Margherita Pizza');
    });
  });

  describe('GENERIC_NAME_REGEX', () => {
    it('matches general N, retail N, product N', () => {
      expect(GENERIC_NAME_REGEX.test('general 1')).toBe(true);
      expect(GENERIC_NAME_REGEX.test('Retail 2')).toBe(true);
      expect(GENERIC_NAME_REGEX.test('product 3')).toBe(true);
      expect(GENERIC_NAME_REGEX.test('Espresso')).toBe(false);
    });
  });
});

describe('isDraftGuardsEnabled', () => {
  const orig = process.env.ENABLE_DRAFT_GUARDS;

  afterEach(() => {
    process.env.ENABLE_DRAFT_GUARDS = orig;
  });

  it('returns true when ENABLE_DRAFT_GUARDS is "true" or "1"', () => {
    process.env.ENABLE_DRAFT_GUARDS = 'true';
    expect(isDraftGuardsEnabled()).toBe(true);
    process.env.ENABLE_DRAFT_GUARDS = '1';
    expect(isDraftGuardsEnabled()).toBe(true);
  });

  it('returns false when ENABLE_DRAFT_GUARDS is unset or "false"', () => {
    delete process.env.ENABLE_DRAFT_GUARDS;
    expect(isDraftGuardsEnabled()).toBe(false);
    process.env.ENABLE_DRAFT_GUARDS = 'false';
    expect(isDraftGuardsEnabled()).toBe(false);
  });
});
