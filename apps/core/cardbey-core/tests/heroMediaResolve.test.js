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
});
