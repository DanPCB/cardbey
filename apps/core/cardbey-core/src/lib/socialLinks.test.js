import { describe, it, expect } from 'vitest';
import {
  normalizeSocialLinks,
  parseSocialLinks,
  FRONTSCREEN_SOCIAL_PRIORITY,
  collectValidSocialLinksPartial,
  mergeSocialLinksRecords,
} from './socialLinks.js';

describe('socialLinks', () => {
  it('normalizeSocialLinks keeps only valid URLs and trims', () => {
    const result = normalizeSocialLinks({
      instagram: ' https://instagram.com/mchairsalon ',
      facebook: '',
      tiktok: 'not-a-url',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toMatch(/tiktok/i);
    }
  });

  it('normalizeSocialLinks omits empty keys', () => {
    const result = normalizeSocialLinks({
      instagram: 'https://instagram.com/mchairsalon',
      facebook: '   ',
      whatsapp: 'https://wa.me/61400000000',
    });
    expect(result).toEqual({
      ok: true,
      value: {
        instagram: 'https://instagram.com/mchairsalon',
        whatsapp: 'https://wa.me/61400000000',
      },
    });
  });

  it('normalizeSocialLinks null clears all links', () => {
    expect(normalizeSocialLinks(null)).toEqual({ ok: true, value: null });
  });

  it('parseSocialLinks returns null for empty object', () => {
    expect(parseSocialLinks({})).toBeNull();
  });

  it('parseSocialLinks accepts wa.me whatsapp URLs (mc-hair-salon shape)', () => {
    expect(
      parseSocialLinks({
        instagram: 'https://instagram.com/mchairsalon',
        facebook: 'https://facebook.com/mchairsalon',
        whatsapp: 'https://wa.me/61400000000',
      }),
    ).toEqual({
      instagram: 'https://instagram.com/mchairsalon',
      facebook: 'https://facebook.com/mchairsalon',
      whatsapp: 'https://wa.me/61400000000',
    });
  });

  it('parseSocialLinks accepts facebook URLs with dots in the path (mc.hairsalon)', () => {
    const url = 'https://www.facebook.com/mc.hairsalon/';
    expect(parseSocialLinks({ facebook: url })).toEqual({ facebook: url });
    expect(normalizeSocialLinks({ facebook: url })).toEqual({ ok: true, value: { facebook: url } });
  });

  it('FRONTSCREEN_SOCIAL_PRIORITY has four networks', () => {
    expect(FRONTSCREEN_SOCIAL_PRIORITY).toHaveLength(4);
  });

  it('collectValidSocialLinksPartial skips invalid URLs', () => {
    const { written, skipped, keysWritten } = collectValidSocialLinksPartial({
      instagram: 'https://instagram.com/a',
      facebook: 'not-url',
    });
    expect(keysWritten).toEqual(['instagram']);
    expect(written.instagram).toBe('https://instagram.com/a');
    expect(skipped).toHaveLength(1);
  });

  it('mergeSocialLinksRecords preserves unmentioned networks', () => {
    const merged = mergeSocialLinksRecords(
      { facebook: 'https://facebook.com/x' },
      { instagram: 'https://instagram.com/y' },
    );
    expect(merged).toEqual({
      facebook: 'https://facebook.com/x',
      instagram: 'https://instagram.com/y',
    });
  });
});
