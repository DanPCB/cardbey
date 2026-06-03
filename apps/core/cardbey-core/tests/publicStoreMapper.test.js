/**
 * Unit tests for toPublicStore: heroUrl/avatarUrl from first-class fields or logo fallback
 */
import { describe, it, expect } from 'vitest';
import { toPublicStore } from '../src/utils/publicStoreMapper.js';

describe('toPublicStore', () => {
  const baseBusiness = {
    id: 'biz-1',
    name: 'Test Store',
    slug: 'test-store',
    description: null,
    tagline: null,
    logo: null,
    region: null,
    products: [],
  };

  it('includes heroUrl and avatarUrl from first-class heroImageUrl/avatarImageUrl', () => {
    const business = {
      ...baseBusiness,
      heroImageUrl: 'https://example.com/hero.jpg',
      avatarImageUrl: 'https://example.com/avatar.jpg',
    };
    const result = toPublicStore(business);
    expect(result.heroUrl).toBe('https://example.com/hero.jpg');
    expect(result.bannerUrl).toBe('https://example.com/hero.jpg');
    expect(result.avatarUrl).toBe('https://example.com/avatar.jpg');
  });

  it('falls back to logo-derived avatar and banner when first-class fields are null', () => {
    const business = {
      ...baseBusiness,
      heroImageUrl: null,
      avatarImageUrl: null,
      logo: JSON.stringify({ url: 'https://example.com/logo.png', heroUrl: 'https://example.com/banner.png' }),
    };
    const result = toPublicStore(business);
    expect(result.avatarUrl).toBe('https://example.com/logo.png');
    expect(result.bannerUrl).toBe('https://example.com/banner.png');
    expect(result.heroUrl).toBe('https://example.com/banner.png');
  });

  it('prefers first-class over logo when both present', () => {
    const business = {
      ...baseBusiness,
      heroImageUrl: 'https://example.com/hero-first-class.jpg',
      avatarImageUrl: 'https://example.com/avatar-first-class.jpg',
      logo: JSON.stringify({ url: 'https://example.com/logo-old.png' }),
    };
    const result = toPublicStore(business);
    expect(result.avatarUrl).toBe('https://example.com/avatar-first-class.jpg');
    expect(result.heroUrl).toBe('https://example.com/hero-first-class.jpg');
  });

  it('includes tagline', () => {
    const business = { ...baseBusiness, tagline: 'Best coffee in town' };
    const result = toPublicStore(business);
    expect(result.tagline).toBe('Best coffee in town');
  });

  it('includes socialLinks when set on business', () => {
    const business = {
      ...baseBusiness,
      socialLinks: {
        instagram: 'https://instagram.com/test',
        facebook: 'https://facebook.com/test',
      },
    };
    const result = toPublicStore(business);
    expect(result.socialLinks).toEqual({
      instagram: 'https://instagram.com/test',
      facebook: 'https://facebook.com/test',
    });
  });

  it('returns null socialLinks when unset', () => {
    const result = toPublicStore(baseBusiness);
    expect(result.socialLinks).toBeNull();
  });

  it('exposes heroVideo and video bannerUrl from stylePreferences.heroVideo', () => {
    const business = {
      ...baseBusiness,
      heroImageUrl: 'https://example.com/poster.jpg',
      stylePreferences: JSON.stringify({
        heroVideo: 'https://example.com/hero.mp4',
        heroImage: 'https://example.com/poster.jpg',
      }),
    };
    const result = toPublicStore(business);
    expect(result.heroVideo).toBe('https://example.com/hero.mp4');
    expect(result.bannerUrl).toBe('https://example.com/hero.mp4');
    expect(result.heroUrl).toBe('https://example.com/hero.mp4');
  });
});
