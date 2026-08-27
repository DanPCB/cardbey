import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildMinimaxCreateBody } from '../minimaxClient.js';

describe('minimaxClient', () => {
  const backup = { ...process.env };

  beforeEach(() => {
    process.env.ENABLE_MINIMAX_H3_VIDEO_V1 = 'true';
    process.env.MINIMAX_API_KEY = 'mm-test-key';
    process.env.MINIMAX_VIDEO_MODEL = 'MiniMax-H3';
    process.env.MINIMAX_VIDEO_RESOLUTION = '768P';
    process.env.MINIMAX_VIDEO_DURATION_SECONDS = '6';
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...backup };
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('builds official H3 768P/6s 9:16 text-to-video body', async () => {
    const { resolveMinimaxGenerationSettings } = await import('../minimaxConfig.js');
    const settings = resolveMinimaxGenerationSettings({ aspectRatio: '9:16', duration: 6 });
    const body = buildMinimaxCreateBody(settings, 'Approved Cardbey video prompt');
    expect(body).toEqual({
      model: 'MiniMax-H3',
      content: [{ type: 'text', text: 'Approved Cardbey video prompt' }],
      resolution: '768P',
      duration: 6,
      ratio: '9:16',
    });
  });

  it('persists task id from create and maps queued/running/succeeded', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        text: async () => JSON.stringify({ task_id: '424010985738629' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        text: async () =>
          JSON.stringify({
            task: { id: '424010985738629', status: 'queued', model: 'MiniMax-H3' },
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        text: async () =>
          JSON.stringify({
            task: { id: '424010985738629', status: 'running', model: 'MiniMax-H3' },
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        text: async () =>
          JSON.stringify({
            task: {
              id: '424010985738629',
              status: 'succeeded',
              model: 'MiniMax-H3',
              content: { url: 'https://cdn.example.com/out.mp4' },
              duration: 6,
              resolution: '768P',
              ratio: '9:16',
            },
          }),
      });

    const { createMinimaxVideoTask, getMinimaxVideoTask, waitForMinimaxVideo } = await import(
      '../minimaxClient.js'
    );
    const created = await createMinimaxVideoTask({
      body: { model: 'MiniMax-H3', content: [{ type: 'text', text: 'x' }], resolution: '768P', duration: 6, ratio: '9:16' },
      fetchImpl,
    });
    expect(created.taskId).toBe('424010985738629');

    const queued = await getMinimaxVideoTask('424010985738629', { fetchImpl });
    expect(queued.status).toBe('QUEUED');
    const running = await getMinimaxVideoTask('424010985738629', { fetchImpl });
    expect(running.status).toBe('PROCESSING');
    const done = await waitForMinimaxVideo('424010985738629', {
      fetchImpl,
      intervalMs: 1,
      maxWaitMs: 50,
    });
    expect(done.status).toBe('SUCCEEDED');
    expect(done.outputUrl).toContain('out.mp4');
  });

  it('maps insufficient balance and sensitive content', async () => {
    const { createMinimaxVideoTask, waitForMinimaxVideo } = await import('../minimaxClient.js');

    await expect(
      createMinimaxVideoTask({
        body: {},
        fetchImpl: vi.fn().mockResolvedValue({
          ok: false,
          status: 402,
          headers: new Headers(),
          text: async () =>
            JSON.stringify({
              type: 'error',
              error: { type: 'insufficient_balance_error', message: 'top up (402)' },
            }),
        }),
      }),
    ).rejects.toMatchObject({ code: 'MINIMAX_INSUFFICIENT_BALANCE' });

    await expect(
      waitForMinimaxVideo('task-fail', {
        intervalMs: 1,
        maxWaitMs: 20,
        fetchImpl: vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          headers: new Headers(),
          text: async () =>
            JSON.stringify({
              task: {
                id: 'task-fail',
                status: 'failed',
                error: { code: '1026', message: 'video description contains sensitive content' },
              },
            }),
        }),
      }),
    ).rejects.toMatchObject({ code: 'MINIMAX_SENSITIVE_CONTENT', providerCode: '1026' });
  });

  it('retries rate-limited polls without creating a second paid task', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: new Headers({ 'retry-after': '0' }),
        text: async () =>
          JSON.stringify({ error: { type: 'rate_limit_error', message: 'rate limit (1002)' } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        text: async () =>
          JSON.stringify({
            task: {
              id: 'task-rl',
              status: 'succeeded',
              content: { url: 'https://cdn.example.com/out.mp4' },
            },
          }),
      });

    const { waitForMinimaxVideo } = await import('../minimaxClient.js');
    const result = await waitForMinimaxVideo('task-rl', {
      fetchImpl,
      intervalMs: 1,
      maxWaitMs: 200,
    });
    expect(result.completed).toBe(true);
    const methods = fetchImpl.mock.calls.map((c) => c[1]?.method || 'GET');
    expect(methods.every((m) => m === 'GET')).toBe(true);
    expect(fetchImpl.mock.calls.every((c) => String(c[0]).includes('/query/'))).toBe(true);
  });

  it('timeout does not POST a second generation', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      text: async () => JSON.stringify({ task: { id: 'task-slow', status: 'running' } }),
    });
    const { waitForMinimaxVideo } = await import('../minimaxClient.js');
    await expect(
      waitForMinimaxVideo('task-slow', { fetchImpl, intervalMs: 5, maxWaitMs: 20 }),
    ).rejects.toMatchObject({ code: 'MINIMAX_TIMEOUT', status: 'TIMED_OUT' });
    expect(fetchImpl.mock.calls.every((c) => String(c[0]).includes('/query/'))).toBe(true);
  });
});
