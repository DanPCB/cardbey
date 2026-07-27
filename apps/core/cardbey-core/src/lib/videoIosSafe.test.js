import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  deriveIosSafeVideoPublicPath,
  enrichStoreHeroVideoUrls,
  iosSafeSiblingExists,
  normalizeHeroVideoToPublicPath,
  preferTvSafeVideoPublicPath,
} from './videoIosSafe.js';

describe('videoIosSafe', () => {
  it('deriveIosSafeVideoPublicPath maps .mp4 to .ios.mp4', () => {
    expect(deriveIosSafeVideoPublicPath('/uploads/media/kling.mp4')).toBe(
      '/uploads/media/kling.ios.mp4',
    );
    expect(deriveIosSafeVideoPublicPath('/uploads/media/kling.mp4?v=1')).toBe(
      '/uploads/media/kling.ios.mp4?v=1',
    );
    expect(deriveIosSafeVideoPublicPath('/uploads/media/kling.ios.mp4')).toBe(
      '/uploads/media/kling.ios.mp4',
    );
    expect(deriveIosSafeVideoPublicPath('https://cdn.example.com/x.webm')).toBeNull();
  });

  it('normalizeHeroVideoToPublicPath strips host and query', () => {
    expect(normalizeHeroVideoToPublicPath('http://localhost:3001/uploads/media/a.mp4?v=1')).toBe(
      '/uploads/media/a.mp4',
    );
    expect(normalizeHeroVideoToPublicPath('/uploads/media/a.ios.mp4')).toBeNull();
  });

  it('enrichStoreHeroVideoUrls attaches ios-safe only when sibling file exists', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cardbey-ios-safe-'));
    fs.writeFileSync(path.join(tmp, 'hero.ios.mp4'), 'x');

    const enriched = enrichStoreHeroVideoUrls(
      { slug: 'bakery', heroVideoUrl: '/uploads/media/hero.mp4' },
      { uploadsDir: tmp },
    );
    expect(enriched.heroVideoUrlOriginal).toBe('/uploads/media/hero.mp4');
    expect(enriched.heroVideoUrlIosSafe).toBe('/uploads/media/hero.ios.mp4');
    expect(enriched.heroVideoUrl).toBe('/uploads/media/hero.mp4');
    expect(iosSafeSiblingExists('/uploads/media/hero.mp4', tmp)).toBe(true);
  });

  it('enrichStoreHeroVideoUrls omits ios-safe when sibling missing', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cardbey-ios-safe-'));
    const enriched = enrichStoreHeroVideoUrls(
      { heroVideoUrl: '/uploads/media/hero.mp4' },
      { uploadsDir: tmp },
    );
    expect(enriched.heroVideoUrlOriginal).toBe('/uploads/media/hero.mp4');
    expect(enriched.heroVideoUrlIosSafe).toBeUndefined();
  });

  it('enrichStoreHeroVideoUrls keeps explicit ios-safe URL', () => {
    const enriched = enrichStoreHeroVideoUrls({
      heroVideoUrl: '/uploads/media/hero.mp4',
      heroVideoUrlIosSafe: '/uploads/media/hero.ios.mp4',
    });
    expect(enriched.heroVideoUrlIosSafe).toBe('/uploads/media/hero.ios.mp4');
  });

  it('preferTvSafeVideoPublicPath swaps to sibling when present', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cardbey-tv-safe-'));
    fs.writeFileSync(path.join(tmp, 'clip.ios.mp4'), 'x');
    expect(preferTvSafeVideoPublicPath('/uploads/media/clip.mp4', tmp)).toBe(
      '/uploads/media/clip.ios.mp4',
    );
    expect(
      preferTvSafeVideoPublicPath('http://192.168.1.5:3001/uploads/media/clip.mp4', tmp),
    ).toBe('http://192.168.1.5:3001/uploads/media/clip.ios.mp4');
    expect(preferTvSafeVideoPublicPath('/uploads/media/missing.mp4', tmp)).toBe(
      '/uploads/media/missing.mp4',
    );
  });
});
