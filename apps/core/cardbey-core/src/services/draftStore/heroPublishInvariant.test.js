import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  detectHeroCanonicalMismatch,
  enforcePublishHeroCanonical,
} from './heroPublishInvariant.js';

describe('heroPublishInvariant', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('detects video URL with image media type', () => {
    expect(
      detectHeroCanonicalMismatch({
        heroVideoUrl: 'https://cdn.example.com/hero.mp4',
        heroMediaType: 'image',
        heroImageUrl: 'https://cdn.example.com/stale.jpg',
      }),
    ).toMatchObject({ code: 'video_url_with_image_media_type' });
  });

  it('enforcePublishHeroCanonical fixes mismatch to video-first contract', () => {
    const preview = {
      heroVideoUrl: 'https://cdn.example.com/hero.mp4',
      heroMediaType: 'image',
      heroImageUrl: 'https://cdn.example.com/stale.jpg',
      hero: { type: 'image', imageUrl: 'https://cdn.example.com/stale.jpg' },
    };
    enforcePublishHeroCanonical(preview, { source: 'test', silent: true });
    expect(preview.heroMediaType).toBe('video');
    expect(preview.heroVideoUrl).toBe('https://cdn.example.com/hero.mp4');
    expect(preview.heroVideo).toBe('https://cdn.example.com/hero.mp4');
    expect(preview.hero?.type).toBe('video');
    expect(preview.hero?.videoUrl).toBe('https://cdn.example.com/hero.mp4');
    expect(preview.heroImageUrl).toBe('https://cdn.example.com/stale.jpg');
  });

  it('image-only preview unchanged', () => {
    const preview = {
      heroMediaType: 'image',
      heroImageUrl: 'https://cdn.example.com/hero.jpg',
    };
    enforcePublishHeroCanonical(preview, { silent: true });
    expect(preview.heroMediaType).toBe('image');
    expect(preview.heroVideoUrl).toBeNull();
    expect(preview.heroImageUrl).toBe('https://cdn.example.com/hero.jpg');
  });

  it('warns on mismatch in non-test env', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    enforcePublishHeroCanonical(
      { heroVideoUrl: 'https://cdn.example.com/v.mp4', heroMediaType: 'image' },
      { source: 'unit_test' },
    );
    expect(warn).toHaveBeenCalledWith(
      '[hero-canonical-mismatch]',
      expect.objectContaining({ source: 'unit_test', code: 'video_url_with_image_media_type' }),
    );
    process.env.NODE_ENV = prev;
  });
});
