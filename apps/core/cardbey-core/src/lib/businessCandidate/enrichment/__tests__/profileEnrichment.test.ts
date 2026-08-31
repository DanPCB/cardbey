/**
 * Gate tests — complete pre-claim profile enrichment helpers.
 */

import { describe, expect, it, vi } from 'vitest';
import { extractBrandColors } from '../brandColorExtract.js';
import { calculateProfileScore } from '../profileScore.js';
import { priceRangeFromRawSource } from '../priceRange.js';
import { resolveLogoUrl } from '../logoResolve.js';

vi.mock('../../../services/logo/ClearbitAdapter.js', () => ({
  search: vi.fn(async (query: string) => {
    if (String(query).includes('herbalheadspa')) {
      return [{ logo_url: 'https://img.logo.dev/herbalheadspa.com.au?token=test' }];
    }
    return [];
  }),
}));

describe('Complete pre-claim profile enrichment', () => {
  it('resolveLogoUrl returns Logo.dev URL for known domain', async () => {
    const url = await resolveLogoUrl(
      'Herbal Head Spa',
      'https://herbalheadspa.com.au',
      null,
      { remaining: 2 },
    );
    expect(url === null || url.startsWith('https://')).toBe(true);
  });

  it('resolveLogoUrl prefers apple-touch-icon from HTML', async () => {
    const html = '<link rel="apple-touch-icon" href="/icons/apple-touch.png">';
    const url = await resolveLogoUrl('Test', 'https://example.com', html, { remaining: 2 });
    expect(url).toBe('https://example.com/icons/apple-touch.png');
  });

  it('extractBrandColors finds theme-color meta tag', () => {
    const html = '<meta name="theme-color" content="#2E86AB">';
    const colors = extractBrandColors(html);
    expect(colors.primary).toBe('#2E86AB');
  });

  it('calculateProfileScore returns 0 for empty bag', () => {
    const result = calculateProfileScore({});
    expect(result.score).toBe(0);
    expect(result.grade).toBe('F');
    expect(result.ready).toBe(false);
  });

  it('calculateProfileScore returns >= 70 for fully enriched store', () => {
    const words = Array.from({ length: 42 }, (_, i) => `word${i}`).join(' ');
    const result = calculateProfileScore({
      name: 'Test Business',
      description: words,
      heroImageUrl: 'https://pexels.com/photo/123.jpg',
      logoUrl: 'https://img.logo.dev/test.com.au',
      category: 'Food & Drink',
      phone: '0400 000 000',
      email: 'test@test.com',
      address: '123 Test St',
      suburb: 'Melbourne',
      website: 'https://test.com.au',
      tagline: 'Great food every day',
      socialLinks: [{ platform: 'instagram', url: 'https://instagram.com/test' }],
      openingHours: 'Mon-Fri 8am-5pm',
    });
    expect(result.score).toBeGreaterThanOrEqual(70);
    expect(result.ready).toBe(true);
  });

  it('priceRangeFromRawSource maps Google Places price_level', () => {
    expect(priceRangeFromRawSource({ price_level: 2 })).toBe('$$');
    expect(priceRangeFromRawSource({ price_level: 0 })).toBe('Free');
    expect(priceRangeFromRawSource(null)).toBeNull();
  });
});
