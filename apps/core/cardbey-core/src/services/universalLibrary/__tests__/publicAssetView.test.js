import { describe, it, expect } from 'vitest';
import {
  resolvePublicStreamUrl,
  safePublicMediaUrl,
  toPublicAssetView,
} from '../publicAssetView.js';

describe('publicAssetView video playback fields', () => {
  it('exposes https streamUrl and canonicalUrl for Pexels REFERENCE video', () => {
    const view = toPublicAssetView({
      id: 'a1',
      title: 'Beauty video',
      type: 'video',
      provider: 'pexels',
      license: 'Pexels License',
      sourceUrl: 'https://www.pexels.com/video/123/',
      thumbnail: 'https://images.pexels.com/videos/123/thumb.jpg',
      preview: 'https://images.pexels.com/videos/123/thumb.jpg',
      hostingMode: 'REFERENCE',
      status: 'PUBLISHED',
      metadata: {
        videoUrl: 'https://player.vimeo.com/external/abc.hd.mp4',
        creatorLabel: 'Pexels',
        openLicense: true,
      },
    });
    expect(view.streamUrl).toBe('https://player.vimeo.com/external/abc.hd.mp4');
    expect(view.canonicalUrl).toBe('https://www.pexels.com/video/123/');
    expect(view.sourceUrl).toBe('https://www.pexels.com/video/123/');
    expect(view.metadata).toBeUndefined();
    expect(view.rightsStatus).toBeUndefined();
  });

  it('does not treat still preview as streamUrl when videoUrl missing', () => {
    expect(
      resolvePublicStreamUrl(
        { type: 'video', preview: 'https://images.pexels.com/photos/1.jpeg' },
        {},
      ),
    ).toBeNull();
  });

  it('rejects non-http stream candidates', () => {
    expect(safePublicMediaUrl('javascript:alert(1)')).toBeNull();
    expect(safePublicMediaUrl('/videos/cardbey-bg.mp4')).toBe('/videos/cardbey-bg.mp4');
  });
});
