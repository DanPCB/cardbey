import { describe, expect, it } from 'vitest';
import {
  decodeHeroPlaybackToken,
  hashExternalHeroVideoUrl,
  isAllowlistedExternalHeroVideoUrl,
  needsDurableHeroVideoIngest,
  rewriteHotlinkHeroVideoForPlayback,
} from './externalHeroVideoPlayback.js';

describe('externalHeroVideoPlayback', () => {
  it('allowlists Pexels video files and rejects arbitrary hosts', () => {
    expect(
      isAllowlistedExternalHeroVideoUrl(
        'https://videos.pexels.com/video-files/4729560/4729560-hd_1280_720_60fps.mp4',
      ),
    ).toBe(true);
    expect(needsDurableHeroVideoIngest('https://evil.example/x.mp4')).toBe(false);
    expect(needsDurableHeroVideoIngest('/uploads/media/hero.mp4')).toBe(false);
  });

  it('rewrites hotlinks to Cardbey hero-playback proxy paths', () => {
    const src = 'https://videos.pexels.com/video-files/1/a.mp4';
    const rewritten = rewriteHotlinkHeroVideoForPlayback(src, (p) => `https://core.test${p}`);
    expect(rewritten).toMatch(/^https:\/\/core\.test\/api\/public\/media\/hero-playback\//);
    const token = rewritten.split('/').pop();
    expect(decodeHeroPlaybackToken(token)).toBe(src);
  });

  it('hashes stably for cache keys', () => {
    const a = hashExternalHeroVideoUrl('https://videos.pexels.com/video-files/1/a.mp4');
    const b = hashExternalHeroVideoUrl('https://videos.pexels.com/video-files/1/a.mp4');
    expect(a).toBe(b);
    expect(a.length).toBe(24);
  });
});
