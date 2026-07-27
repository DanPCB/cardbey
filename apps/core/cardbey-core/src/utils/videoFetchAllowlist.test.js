import { describe, expect, it } from 'vitest';
import {
  isAllowedVideoFetchUrl,
  videoFetchMaxProxyBytes,
} from './videoFetchAllowlist.js';

describe('isAllowedVideoFetchUrl', () => {
  it('allows Pexels video CDN URLs', () => {
    expect(
      isAllowedVideoFetchUrl(
        'https://videos.pexels.com/video-files/3195397/13224923/3195397-hd_2560_1440_25fps.mp4',
        'pexels',
      ),
    ).toBe(true);
  });

  it('allows extensionless Pexels video-files paths', () => {
    expect(
      isAllowedVideoFetchUrl('https://videos.pexels.com/video-files/1/2', 'pexels'),
    ).toBe(true);
  });

  it('rejects arbitrary external hosts', () => {
    expect(isAllowedVideoFetchUrl('https://evil.example.com/video.mp4', 'pexels')).toBe(false);
  });
});

describe('videoFetchMaxProxyBytes', () => {
  it('defaults to 50MB', () => {
    const prev = process.env.VIDEO_FETCH_MAX_MB;
    delete process.env.VIDEO_FETCH_MAX_MB;
    expect(videoFetchMaxProxyBytes()).toBe(50 * 1024 * 1024);
    if (prev !== undefined) process.env.VIDEO_FETCH_MAX_MB = prev;
  });
});
