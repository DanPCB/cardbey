import { describe, expect, it } from 'vitest';
import {
  isProviderTempVideoUrl,
  isVideoContentTypeHeader,
  validateExploreVideoPublishUrl,
} from './exploreVideoUrlValidation.js';

describe('exploreVideoUrlValidation', () => {
  it('detects provider temp delivery hosts', () => {
    expect(isProviderTempVideoUrl('https://cdn.klingai.com/out/video.mp4')).toBe(true);
    expect(isProviderTempVideoUrl('/uploads/media/videos/local.mp4')).toBe(false);
    expect(isProviderTempVideoUrl('https://media.cardbey.com/videos/x.mp4')).toBe(false);
  });

  it('recognizes video content types', () => {
    expect(isVideoContentTypeHeader('video/mp4')).toBe(true);
    expect(isVideoContentTypeHeader('text/html; charset=utf-8')).toBe(false);
  });

  it('rejects provider temp URLs on publish', async () => {
    const result = await validateExploreVideoPublishUrl('https://api.klingai.com/tmp/abc.mp4');
    expect(result.ok).toBe(false);
    expect(result.code).toBe('provider_temp_url');
  });
});
