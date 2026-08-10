import { afterEach, describe, it, expect } from 'vitest';
import {
  absolutizeHostedMediaUrl,
  computePreviewReadiness,
  getCoreMediaPublicBase,
  resolvePublicStreamUrl,
  safePublicMediaUrl,
  toPublicAssetView,
} from '../publicAssetView.js';

describe('publicAssetView video playback fields', () => {
  afterEach(() => {
    delete process.env.CORE_PUBLIC_URL;
    delete process.env.PUBLIC_API_BASE_URL;
    delete process.env.PUBLIC_BASE_URL;
    delete process.env.RENDER_EXTERNAL_URL;
  });

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
    expect(view.previewReadiness).toBe('PREVIEW_READY');
  });

  it('absolutizes HOSTED Originals relative preview against Core public base', () => {
    process.env.CORE_PUBLIC_URL = 'https://api.cardbey.com';
    const view = toPublicAssetView({
      id: 'o1',
      title: 'Cardbey AI Atmosphere 20',
      type: 'image',
      provider: 'cardbey_internal',
      thumbnail: '/assets/ai-backgrounds/bg-1.png',
      preview: '/assets/ai-backgrounds/bg-1.png',
      hostingMode: 'HOSTED',
      status: 'PUBLISHED',
      metadata: { creatorLabel: 'Cardbey Originals' },
    });
    expect(view.preview).toBe('https://api.cardbey.com/assets/ai-backgrounds/bg-1.png');
    expect(view.thumbnail).toBe('https://api.cardbey.com/assets/ai-backgrounds/bg-1.png');
    expect(view.previewReadiness).toBe('PREVIEW_READY');
    expect(getCoreMediaPublicBase()).toBe('https://api.cardbey.com');
    expect(absolutizeHostedMediaUrl('/videos/cardbey-bg.mp4')).toBe(
      'https://api.cardbey.com/videos/cardbey-bg.mp4',
    );
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

  it('marks localhost preview as MEDIA_UNREACHABLE', () => {
    expect(
      computePreviewReadiness(
        { type: 'image' },
        { preview: 'http://localhost:3001/assets/x.png' },
      ),
    ).toBe('MEDIA_UNREACHABLE');
  });

  it('treats article without cover as PREVIEW_OPTIONAL', () => {
    expect(computePreviewReadiness({ type: 'article' }, {})).toBe('PREVIEW_OPTIONAL');
  });
});
