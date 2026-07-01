/**
 * @vitest-environment node
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

const posterSpy = vi.fn();
const validateSpy = vi.fn();
const createSpy = vi.fn();
const uploadSpy = vi.fn();

vi.mock('../services/explore/exploreVideoPosterService.js', () => ({
  generateExploreVideoPosterFromBuffer: (...args) => posterSpy(...args),
}));

vi.mock('../services/explore/exploreVideoUrlValidation.js', () => ({
  validateExploreVideoPublishUrl: (...args) => validateSpy(...args),
}));

vi.mock('../lib/s3Client.js', () => ({
  uploadBufferToS3: (...args) => uploadSpy(...args),
}));

vi.mock('../lib/videoCompat.js', () => ({
  ensureWebCompatibleVideoBuffer: vi.fn(async (buf) => ({
    buffer: buf,
    mime: 'video/mp4',
    durationS: 6,
  })),
}));

vi.mock('../services/explore/exploreVideoService.js', () => ({
  canManageExploreVideos: vi.fn(async () => true),
  createExploreVideo: (...args) => createSpy(...args),
  getExploreVideoMaxBytes: () => 50 * 1024 * 1024,
  validateVideoMime: () => true,
}));

vi.mock('../utils/publicUrl.js', () => ({
  normalizeMediaUrlForStorage: (url) => url,
}));

vi.mock('../middleware/auth.js', () => ({
  requireAuth: (req, _res, next) => next(),
  optionalAuth: (_req, _res, next) => next(),
}));

import express from 'express';
import request from 'supertest';
import exploreRoutes from './exploreRoutes.js';

describe('exploreRoutes poster ingest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    uploadSpy.mockResolvedValue({ url: '/uploads/media/videos/test.mp4', key: 'media/videos/test.mp4' });
    posterSpy.mockResolvedValue({ ok: true, url: '/uploads/media/stores/auto-poster.jpg' });
    validateSpy.mockResolvedValue({ ok: true, contentType: 'video/mp4' });
    createSpy.mockImplementation(async (payload) => ({ id: 'ev_1', ...payload }));
  });

  function makeApp() {
    const app = express();
    app.use((req, _res, next) => {
      req.user = { id: 'u1', role: 'admin', isDevAdmin: true };
      next();
    });
    app.use('/api/explore', exploreRoutes);
    return app;
  }

  it('auto-generates thumbnailUrl when no manual thumbnail is uploaded', async () => {
    const app = makeApp();

    const res = await request(app)
      .post('/api/explore/videos/upload')
      .field('title', 'Guide')
      .field('description', 'Desc')
      .field('category', 'Guide')
      .field('status', 'published')
      .attach('video', Buffer.from('fake-video'), {
        filename: 'guide.mp4',
        contentType: 'video/mp4',
      });

    expect(res.status).toBe(201);
    expect(posterSpy).toHaveBeenCalledTimes(1);
    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        videoUrl: '/uploads/media/videos/test.mp4',
        thumbnailUrl: '/uploads/media/stores/auto-poster.jpg',
        status: 'published',
      }),
    );
  });

  it('publish still succeeds when poster generation fails', async () => {
    posterSpy.mockResolvedValueOnce({ ok: false, error: 'ffmpeg_not_available' });

    const res = await request(makeApp())
      .post('/api/explore/videos/upload')
      .field('title', 'Guide')
      .field('description', 'Desc')
      .field('category', 'Guide')
      .field('status', 'published')
      .attach('video', Buffer.from('fake-video'), {
        filename: 'guide.mp4',
        contentType: 'video/mp4',
      });

    expect(res.status).toBe(201);
    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        thumbnailUrl: null,
      }),
    );
  });
});
