import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../downloadVideo.js', () => ({
  downloadAndStoreVideo: vi.fn(async () => ({
    publicPath: '/uploads/media/minimax-stored.mp4',
    iosSafePublicPath: '/uploads/media/minimax-stored.mp4',
  })),
}));

import { downloadAndStoreVideo } from '../../downloadVideo.js';
import { generateVideoViaMiniMax } from '../../generateVideoViaMiniMax.js';

describe('generateVideoViaMiniMax', () => {
  const backup = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ENABLE_MINIMAX_H3_VIDEO_V1 = 'true';
    process.env.MINIMAX_API_KEY = 'mm-test-key';
    process.env.MINIMAX_VIDEO_MODEL = 'MiniMax-H3';
    process.env.MINIMAX_VIDEO_RESOLUTION = '768P';
    process.env.MINIMAX_VIDEO_DURATION_SECONDS = '6';
  });

  afterEach(() => {
    process.env = { ...backup };
  });

  it('downloads provider output into Cardbey custody and does not claim narration', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        text: async () => JSON.stringify({ task_id: 'task-1' }),
      })
      .mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers(),
        text: async () =>
          JSON.stringify({
            task: {
              id: 'task-1',
              status: 'succeeded',
              content: { url: 'https://cdn.minimax.example/tmp.mp4' },
              duration: 6,
              resolution: '768P',
              ratio: '9:16',
            },
          }),
      });

    const result = await generateVideoViaMiniMax({
      prompt: 'Cafe morning rush, vertical promo',
      fetchImpl,
      selectionReason: 'unit_test',
    });

    expect(downloadAndStoreVideo).toHaveBeenCalledWith(
      'https://cdn.minimax.example/tmp.mp4',
      expect.objectContaining({ prefix: 'minimax', requireVideo: true }),
    );
    expect(result.videoUrl).toBe('/uploads/media/minimax-stored.mp4');
    expect(result.providerTaskId).toBe('task-1');
    expect(result.audioIncluded).toBe(false);
    expect(result.nativeProviderAudioNotAuthoritative).toBe(true);
    expect(result.costEstimateUsd).toBe(0.48);
    expect(JSON.stringify(result)).not.toContain('mm-test-key');
  });

  it('resumes an existing task id instead of submitting again', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      text: async () =>
        JSON.stringify({
          task: {
            id: 'existing-task',
            status: 'succeeded',
            content: { url: 'https://cdn.minimax.example/tmp.mp4' },
          },
        }),
    });

    await generateVideoViaMiniMax({
      prompt: 'Resume',
      providerTaskId: 'existing-task',
      fetchImpl,
    });

    expect(fetchImpl.mock.calls.some((c) => c[1]?.method === 'POST')).toBe(false);
    expect(fetchImpl.mock.calls[0][0]).toContain('/query/video_generation/existing-task');
  });

  it('fails closed when the stored file is missing', async () => {
    downloadAndStoreVideo.mockRejectedValueOnce(new Error('Download failed: invalid media (HTML/JSON provider error response)'));
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        text: async () => JSON.stringify({ task_id: 'task-bad' }),
      })
      .mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers(),
        text: async () =>
          JSON.stringify({
            task: {
              id: 'task-bad',
              status: 'succeeded',
              content: { url: 'https://cdn.minimax.example/error.html' },
            },
          }),
      });

    await expect(
      generateVideoViaMiniMax({ prompt: 'Bad file', fetchImpl }),
    ).rejects.toMatchObject({ code: 'MINIMAX_INVALID_MEDIA' });
  });
});
