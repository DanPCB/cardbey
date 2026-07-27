import { describe, expect, it } from 'vitest';
import { ENTITY_TYPES, extractEntities } from '../entityExtractor.js';

describe('entityExtractor', () => {
  it('exports ENTITY_TYPES', () => {
    expect(ENTITY_TYPES).toContain('store');
    expect(ENTITY_TYPES).toContain('product');
  });

  it('extracts store and pronoun refs', () => {
    const refs = extractEntities('Update my store hero and retry it');
    expect(refs.some((r) => r.type === 'store')).toBe(true);
    expect(refs.some((r) => r.pronoun === true)).toBe(true);
  });

  it('extracts quoted product names', () => {
    const refs = extractEntities('Change price for "Floral Maxi Dress"');
    expect(refs.some((r) => r.type === 'product' && r.ref.includes('Floral'))).toBe(true);
  });

  it('returns empty array for unrelated text', () => {
    expect(extractEntities('hello there')).toEqual([]);
  });

  it('does not treat structured store-create pill submit as product refs', () => {
    expect(extractEntities('My Beauty · Beauty · Melbourne')).toEqual([]);
    expect(extractEntities('Create store: Test Store · Fashion · Melbourne')).toEqual([]);
  });

  it('does not treat capitalized business names as products without product intent', () => {
    expect(extractEntities('Update pricing for Test Store')).toEqual([]);
  });
});
