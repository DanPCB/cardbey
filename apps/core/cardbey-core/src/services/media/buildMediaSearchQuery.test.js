import { describe, expect, it } from 'vitest';
import { buildMediaSearchQuery } from './buildMediaSearchQuery.js';

const fullStoreContext = {
  industry: 'beauty salon',
  brandKit: { tone: 'luxury', colors: ['pink', 'gold'], style: 'modern' },
  website: 'blossombeauty.com',
  name: 'Blossom Beauty',
};

describe('buildMediaSearchQuery', () => {
  it('enriches video with full storeContext', () => {
    const q = buildMediaSearchQuery({
      userIntent: 'hero video',
      mediaType: 'video',
      storeContext: fullStoreContext,
    });
    expect(q).toBe('hero video beauty salon luxury pink gold aesthetic');
  });

  it('enriches photo with missing brandKit colors/tone', () => {
    const q = buildMediaSearchQuery({
      userIntent: 'store photo',
      mediaType: 'photo',
      storeContext: {
        industry: 'cafe',
        brandKit: { tone: 'minimal', colors: ['white', 'brown'], style: 'modern' },
        website: '',
        name: 'Corner Cafe',
      },
    });
    expect(q).toBe('cafe interior minimal white brown');
  });

  it('returns domain for logo when website is set (own store)', () => {
    const q = buildMediaSearchQuery({
      userIntent: 'logo',
      mediaType: 'logo',
      storeContext: {
        industry: 'beauty salon',
        brandKit: { tone: 'luxury', colors: [], style: 'modern' },
        website: 'blossombeauty.com',
        name: 'Blossom Beauty',
      },
    });
    expect(q).toBe('blossombeauty.com');
  });

  it('returns nike.com for explicit brand logo intent', () => {
    const q = buildMediaSearchQuery({
      userIntent: 'find nike logo',
      mediaType: 'logo',
      storeContext: fullStoreContext,
    });
    expect(q).toBe('nike.com');
  });

  it('returns userIntent unchanged when storeContext is null', () => {
    expect(
      buildMediaSearchQuery({
        userIntent: 'skincare spa',
        mediaType: 'video',
        storeContext: null,
      }),
    ).toBe('skincare spa');
  });

  it('truncates enriched query at 80 characters', () => {
    const q = buildMediaSearchQuery({
      userIntent: 'hero video promotional campaign showcase',
      mediaType: 'video',
      storeContext: {
        industry: 'international luxury beauty wellness spa resort',
        brandKit: { tone: 'luxury', colors: ['rose gold', 'champagne'], style: 'elegant' },
        website: '',
        name: 'Very Long Store Name International',
      },
    });
    expect(q.length).toBeLessThanOrEqual(80);
    expect(q.startsWith('hero video promotional')).toBe(true);
  });

  it('does not duplicate industry when already in userIntent', () => {
    const q = buildMediaSearchQuery({
      userIntent: 'beauty salon video',
      mediaType: 'video',
      storeContext: {
        industry: 'beauty salon',
        brandKit: { tone: 'luxury', colors: ['pink'], style: 'modern' },
        website: '',
        name: '',
      },
    });
    expect(q).not.toMatch(/beauty salon beauty salon/i);
    expect(q).toContain('beauty salon');
    expect(q).toContain('luxury');
  });

  it('appends aesthetic for luxury tone on video', () => {
    const q = buildMediaSearchQuery({
      userIntent: 'promo clip',
      mediaType: 'video',
      storeContext: {
        industry: 'spa',
        brandKit: { tone: 'luxury', colors: [], style: 'modern' },
        website: '',
        name: '',
      },
    });
    expect(q).toContain('aesthetic');
    expect(q).toContain('luxury');
  });

  it('builds logo fallback from store name and industry without website', () => {
    const q = buildMediaSearchQuery({
      userIntent: '',
      mediaType: 'logo',
      storeContext: {
        industry: 'beauty salon',
        brandKit: { tone: 'luxury', colors: [], style: 'modern' },
        website: '',
        name: 'Blossom Beauty',
      },
    });
    expect(q).toBe('blossom beauty beauty salon');
  });

  it('enriches background with texture pattern language', () => {
    const q = buildMediaSearchQuery({
      userIntent: 'background',
      mediaType: 'background',
      storeContext: {
        industry: 'nail salon',
        brandKit: { tone: 'playful', colors: ['purple'], style: 'modern' },
        website: '',
        name: '',
      },
    });
    expect(q).toContain('texture');
    expect(q).toContain('pattern');
    expect(q).toContain('background');
    expect(q).toContain('playful');
    expect(q).toContain('purple');
  });
});
