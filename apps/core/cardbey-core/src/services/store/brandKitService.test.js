import { describe, expect, it } from 'vitest';
import {
  brandKitFromRecord,
  parseBrandColorsField,
  serializeBrandColors,
  validateBrandKitPatch,
} from './brandKitService.js';

describe('brandKitService', () => {
  it('parses brandColors JSON string', () => {
    expect(parseBrandColorsField('["pink","gold"]')).toEqual(['pink', 'gold']);
  });

  it('returns empty array on invalid JSON', () => {
    expect(parseBrandColorsField('not-json')).toEqual([]);
  });

  it('validates allowed tone', () => {
    const ok = validateBrandKitPatch({ tone: 'luxury', colors: ['pink'] });
    expect(ok.ok).toBe(true);
    expect(ok.data.tone).toBe('luxury');
  });

  it('rejects invalid tone', () => {
    const bad = validateBrandKitPatch({ tone: 'neon' });
    expect(bad.ok).toBe(false);
    expect(bad.code).toBe('INVALID_TONE');
  });

  it('serializes colors to JSON string', () => {
    expect(serializeBrandColors(['pink', 'gold'])).toBe('["pink","gold"]');
  });

  it('reads brandKit from DB record with industry fallback tone', () => {
    const kit = brandKitFromRecord(
      { brandTone: null, brandStyle: 'modern', brandColors: '["pink","gold"]', type: 'beauty salon' },
      'beauty salon',
    );
    expect(kit.tone).toBe('luxury');
    expect(kit.style).toBe('modern');
    expect(kit.colors).toEqual(['pink', 'gold']);
  });
});
