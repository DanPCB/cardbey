import { describe, it, expect } from 'vitest';
import { resolveHeroMediaFromBusiness, isVideoMediaUrl } from '../src/utils/heroMediaResolve.js';

describe('heroMediaResolve', () => {
  it('prefers heroVideo from stylePreferences for playback URL', () => {
    const media = resolveHeroMediaFromBusiness({
      id: '1',
      slug: 'mc-hair-salon',
      heroImageUrl: 'https://cdn.example.com/poster.jpg',
      stylePreferences: { heroVideo: 'https://cdn.example.com/hero.mp4', heroImage: 'https://cdn.example.com/poster.jpg' },
    });
    expect(media.heroVideo).toBe('https://cdn.example.com/hero.mp4');
    expect(media.heroUrl).toBe('https://cdn.example.com/hero.mp4');
  });

  it('isVideoMediaUrl detects mp4', () => {
    expect(isVideoMediaUrl('https://x.com/a.mp4')).toBe(true);
    expect(isVideoMediaUrl('https://x.com/a.jpg')).toBe(false);
  });

  it('treats extensionless upload column hero as video when heroMediaType is video', () => {
    const media = resolveHeroMediaFromBusiness({
      id: '2',
      slug: 'my-nails',
      heroImageUrl: '/uploads/media/store-2/hero',
      stylePreferences: {
        heroMediaType: 'video',
        heroImage: 'https://cdn.example.com/poster.jpg',
      },
    });
    expect(media.heroVideo).toBe('/uploads/media/store-2/hero');
    expect(media.heroUrl).toBe('/uploads/media/store-2/hero');
    expect(media.heroImage).toBe('https://cdn.example.com/poster.jpg');
  });
});
