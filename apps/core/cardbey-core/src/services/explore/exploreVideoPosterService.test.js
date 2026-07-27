import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../../lib/video/extractVideoPosterFrame.js', () => ({
  extractPosterJpegFromBuffer: vi.fn(async () => Buffer.from('fake-jpeg')),
  extractPosterJpegFromFile: vi.fn(async () => Buffer.from('fake-jpeg')),
}));

vi.mock('../../lib/storage/index.js', () => ({
  uploadBuffer: vi.fn(async () => ({ key: 'media/stores/poster.jpg', url: '/uploads/media/stores/poster.jpg' })),
}));

vi.mock('./exploreVideoUrlValidation.js', () => ({
  validateExploreVideoPublishUrl: vi.fn(async () => ({ ok: true, status: 200, contentType: 'video/mp4' })),
}));

import { extractPosterJpegFromBuffer } from '../../lib/video/extractVideoPosterFrame.js';
import { uploadBuffer } from '../../lib/storage/index.js';
import {
  generateExploreVideoPosterFromBuffer,
  ensureProjectionHeroPoster,
} from './exploreVideoPosterService.js';

describe('exploreVideoPosterService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('publishing upload path produces thumbnailUrl from video buffer', async () => {
    const result = await generateExploreVideoPosterFromBuffer(Buffer.from('video-bytes'), {
      originalName: 'clip.mp4',
      durationSec: 8,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.url).toBe('/uploads/media/stores/poster.jpg');
    }
    expect(extractPosterJpegFromBuffer).toHaveBeenCalledTimes(1);
    expect(uploadBuffer).toHaveBeenCalledWith(
      expect.any(Buffer),
      expect.stringContaining('explore-poster-'),
      'image/jpeg',
      'stores',
    );
  });

  it('poster failure does not throw — returns ok:false', async () => {
    extractPosterJpegFromBuffer.mockRejectedValueOnce(new Error('ffmpeg missing'));
    const result = await generateExploreVideoPosterFromBuffer(Buffer.from('x'), {});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('ffmpeg');
    }
  });

  it('ensureProjectionHeroPoster skips when poster already exists', async () => {
    const projection = {
      hero: { type: 'video', videoUrl: '/uploads/media/videos/a.mp4', posterUrl: '/uploads/x.jpg' },
    };
    const next = await ensureProjectionHeroPoster(projection);
    expect(next.hero.posterUrl).toBe('/uploads/x.jpg');
    expect(extractPosterJpegFromBuffer).not.toHaveBeenCalled();
  });

  it('ensureProjectionHeroPoster is idempotent when poster already on imageUrl', async () => {
    const projection = {
      hero: {
        type: 'video',
        videoUrl: '/uploads/media/videos/a.mp4',
        imageUrl: '/uploads/media/stores/existing-poster.jpg',
      },
    };
    const next = await ensureProjectionHeroPoster(projection);
    expect(next).toBe(projection);
  });
});
