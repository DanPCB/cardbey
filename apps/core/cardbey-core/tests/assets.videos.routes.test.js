/**
 * GET /api/assets/videos — lightweight router test (no full server boot).
 */
import express from 'express';
import { describe, expect, it, vi, afterEach, beforeAll } from 'vitest';
import request from 'supertest';
import assetsRouter from '../src/routes/assets.js';

const app = express();
app.use('/api/assets', assetsRouter);

describe('GET /api/assets/videos', () => {
  const prevKey = process.env.PEXELS_API_KEY;

  afterEach(() => {
    vi.unstubAllGlobals();
    if (prevKey === undefined) delete process.env.PEXELS_API_KEY;
    else process.env.PEXELS_API_KEY = prevKey;
  });

  it('returns 503 provider_not_configured when PEXELS_API_KEY is missing', async () => {
    delete process.env.PEXELS_API_KEY;
    const res = await request(app).get('/api/assets/videos?q=beauty&page=1&perPage=12').expect(503);

    expect(res.body.ok).toBe(false);
    expect(res.body.error?.code).toBe('provider_not_configured');
    expect(Array.isArray(res.body.results)).toBe(true);
  });

  it('returns 400 when query is empty and key is set', async () => {
    process.env.PEXELS_API_KEY = 'test-key';
    const res = await request(app).get('/api/assets/videos?page=1&perPage=12').expect(400);
    expect(res.body.error?.code).toBe('EMPTY_QUERY');
  });

  it('returns normalized video items when Pexels responds', async () => {
    process.env.PEXELS_API_KEY = 'test-key';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          total_results: 1,
          videos: [
            {
              id: 42,
              width: 1080,
              height: 1920,
              duration: 10,
              image: 'https://images.pexels.com/videos/42/picture.jpg',
              url: 'https://www.pexels.com/video/42/',
              video_files: [
                {
                  id: 1,
                  quality: 'hd',
                  file_type: 'video/mp4',
                  width: 1280,
                  height: 720,
                  link: 'https://player.example.com/42-hd.mp4',
                },
                {
                  id: 2,
                  quality: 'hd',
                  file_type: 'video/mp4',
                  width: 3840,
                  height: 2160,
                  link: 'https://player.example.com/42-uhd.mp4',
                },
              ],
              user: { name: 'Tester' },
            },
          ],
        }),
      ),
    );

    const res = await request(app)
      .get('/api/assets/videos?q=beauty%20salon&page=1&perPage=12')
      .expect(200);

    expect(res.body.ok).toBe(true);
    expect(res.body.provider).toBe('pexels');
    expect(res.body.items.length).toBe(1);
    expect(res.body.items[0].fullUrl).toBe('https://player.example.com/42-hd.mp4');
    expect(res.body.items[0].type).toBe('video');
    expect(res.body.items[0].duration).toBe(10);
  });
});
