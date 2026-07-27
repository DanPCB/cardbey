// DANH: kling-video-wiring

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import jwt from 'jsonwebtoken';

describe('klingAuth + klingClient', () => {
  const envBackup = { ...process.env };
  /** @type {import('vitest').Mock} */
  let fetchMock;

  beforeEach(async () => {
    vi.clearAllMocks();
    fetchMock = vi.fn();
    global.fetch = fetchMock;
    process.env.KLING_ACCESS_KEY = 'test-ak';
    process.env.KLING_SECRET_KEY = 'test-sk';
    process.env.KLING_API_BASE_URL = 'https://api.klingai.com';
    process.env.KLING_MODEL = 'kling-v2.1';
    const { _resetKlingAuthCacheForTests } = await import('../../lib/video/klingAuth.js');
    _resetKlingAuthCacheForTests();
  });

  afterEach(() => {
    process.env = { ...envBackup };
    vi.restoreAllMocks();
  });

  it('getKlingToken returns a JWT string', async () => {
    const { getKlingToken } = await import('../../lib/video/klingAuth.js');
    const token = getKlingToken();
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(0);
    expect(token.split('.').length).toBe(3);
  });

  it('getKlingToken caches — same token returned', async () => {
    const signSpy = vi.spyOn(jwt, 'sign');
    const { getKlingToken, _resetKlingAuthCacheForTests } = await import('../../lib/video/klingAuth.js');
    _resetKlingAuthCacheForTests();

    const t1 = getKlingToken();
    const t2 = getKlingToken();

    expect(t1).toBe(t2);
    expect(signSpy).toHaveBeenCalledTimes(1);
    signSpy.mockRestore();
  });

  it('createVideoTask builds correct request', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        code: 0,
        message: 'ok',
        data: { task_id: 'task-1', task_status: 'submitted' },
      }),
    });

    const { createVideoTask } = await import('../../lib/video/klingClient.js');
    const result = await createVideoTask({ prompt: 'test' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/v1/videos/text2video');
    expect(init.method).toBe('POST');
    const body = JSON.parse(String(init.body));
    expect(body.model_name).toBe('kling-v2.1');
    expect(body.prompt).toBe('test');
    expect(body.duration).toBe('5');
    expect(body.aspect_ratio).toBe('16:9');
    expect(result.taskId).toBe('task-1');
  });

  it('getVideoTask returns videoUrl on succeed', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        code: 0,
        message: 'ok',
        data: {
          task_id: 'abc',
          task_status: 'succeed',
          task_result: {
            videos: [
              {
                url: 'https://cdn.kling.ai/video.mp4',
                cover_image_url: 'https://cdn/thumb.jpg',
              },
            ],
          },
        },
      }),
    });

    const { getVideoTask } = await import('../../lib/video/klingClient.js');
    const result = await getVideoTask('abc');

    expect(result.videoUrl).toBe('https://cdn.kling.ai/video.mp4');
    expect(result.thumbnailUrl).toBe('https://cdn/thumb.jpg');
    expect(result.completed).toBeUndefined();
  });

  it('waitForVideo returns completed true on succeed', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        code: 0,
        message: 'ok',
        data: {
          task_id: 'abc',
          task_status: 'succeed',
          task_result: {
            videos: [{ url: 'https://cdn.kling.ai/video.mp4' }],
          },
        },
      }),
    });

    const { waitForVideo } = await import('../../lib/video/klingClient.js');
    const result = await waitForVideo('abc', { intervalMs: 1, maxWaitMs: 100 });

    expect(result.completed).toBe(true);
    expect(result.videoUrl).toBe('https://cdn.kling.ai/video.mp4');
  });

  it('execute returns honest result when env missing', async () => {
    const videoProvider = await import('../../lib/video/videoProvider.js');
    const resolveSpy = vi.spyOn(videoProvider, 'resolveVideoProvider').mockReturnValue(null);

    const { execute } = await import('../../lib/toolExecutors/video/queue_video_generation.js');
    const result = await execute({ script: 'Hello' });

    resolveSpy.mockRestore();

    expect(result.status).toBe('ok');
    expect(result.output?.queued).toBe(false);
    expect(String(result.output?.reason ?? result.output?.message ?? '')).toMatch(
      /credentials|not configured|provider/i,
    );
  });
});
