import { describe, expect, it } from 'vitest';
import { buildBusinessEnrichmentPatch } from '../enrichment/buildBusinessEnrichmentPatch.js';

describe('buildBusinessEnrichmentPatch', () => {
  it('fills empty Business fields and skips placeholder description', () => {
    const patch = buildBusinessEnrichmentPatch(
      {
        phone: null,
        email: null,
        websiteUrl: null,
        address: null,
        suburb: null,
        description: null,
        socialLinks: null,
        tradingHours: null,
        heroImageUrl: null,
        avatarImageUrl: null,
        tagline: null,
        state: null,
        postcode: null,
      },
      {
        phone: '03 9312 0000',
        email: 'a@b.com',
        website: 'https://example.com',
        address: '1 High St',
        suburb: 'Footscray',
        description: 'Glamshell Beauty is listed as a Beauty business in Footscray.',
        openingHours: 'Mon–Fri 9–5',
        socialLinks: [{ platform: 'instagram', url: 'https://instagram.com/x' }],
        heroImageUrl: null,
        logoUrl: null,
        tagline: null,
        state: null,
        postcode: null,
      },
    );

    expect(patch.phone).toBe('03 9312 0000');
    expect(patch.description).toBeUndefined();
    expect(patch.tradingHours).toEqual({ summary: 'Mon–Fri 9–5' });
    expect((patch.socialLinks as { instagram: string }).instagram).toBe('https://instagram.com/x');
  });

  it('does not overwrite existing phone', () => {
    const patch = buildBusinessEnrichmentPatch(
      { phone: '03 1111 1111' },
      { phone: '03 2222 2222' } as never,
    );
    expect(patch.phone).toBeUndefined();
  });
});
