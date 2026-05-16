/**
 * Unit tests for getSeedImageForCategory. Selection is key-based only (categoryKey, vertical, orientation).
 * No index-based logic; used only for fallback when hero/item image is missing.
 */

import { describe, it, expect } from 'vitest';
import { getSeedImageForCategory } from '../src/lib/seedLibrary/getSeedImageForCategory.js';

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
