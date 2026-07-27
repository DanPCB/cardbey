import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenAiVideoUnavailableError, OpenAiVideoFailedError } from './openaiVideoErrors.js';

vi.mock('../../services/storeContext.js', () => ({
  getStoreContext: vi.fn(async () => ({
    id: 'store-1',
    name: 'PTH Furniture',
    type: 'furniture',
    location: 'Sydney',
    products: [{ name: 'Sofa', description: 'Comfortable' }],
  })),
}));

vi.mock('./saveGeneratedVideo.js', () => ({
  saveGeneratedVideoToUploads: vi.fn(async () => ({
    relativeUrl: '/uploads/test-video.mp4',
    publicUrl: 'https://example.com/uploads/test-video.mp4',
    filePath: '/tmp/test-video.mp4',
    sizeBytes: 1024,
  })),
}));

import { generateOpenAiPromoVideo } from './openaiVideoProvider.js';

describe('openaiVideoProvider', () => {
  const envBackup = { ...process.env };
  /** @type {import('vitest').Mock} */
  let fetchMock;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OPENAI_API_KEY = 'sk-test';
    process.env.OPENAI_VIDEO_POLL_INTERVAL_MS = '10';
    process.env.OPENAI_VIDEO_POLL_TIMEOUT_MS = '5000';
    fetchMock = vi.fn();
    global.fetch = fetchMock;
  });

  afterEach(() => {
    process.env = { ...envBackup };
    vi.restoreAllMocks();
  });

  function mockJobFlow({ statuses, failOnRetrieve = false }) {
    let retrieveCount = 0;
    fetchMock.mockImplementation(async (url, init) => {
      const u = String(url);
      if (u.endsWith('/videos') && init?.method === 'POST') {
        return {
          ok: true,
          text: async () =>
            JSON.stringify({ id: 'video_job_1', status: statuses[0] ?? 'queued', progress: 0 }),
        };
      }
      if (u.includes('/videos/video_job_1') && u.includes('/content')) {
        return {
          ok: true,
          arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
        };
      }
      if (u.includes('/videos/video_job_1')) {
        if (failOnRetrieve) {
          return {
            ok: false,
            status: 403,
            text: async () => JSON.stringify({ error: { message: 'Forbidden' } }),
          };
        }
        retrieveCount += 1;
        const status = statuses[Math.min(retrieveCount, statuses.length - 1)] ?? 'completed';
        return {
          ok: true,
          text: async () =>
            JSON.stringify({
              id: 'video_job_1',
              status,
              progress: status === 'in_progress' ? 50 : 100,
            }),
        };
      }
      return { ok: false, status: 404, text: async () => '{}' };
    });
  }

  it('job queued → processing hooks then ready artifact with URL', async () => {
    mockJobFlow({ statuses: ['queued', 'in_progress', 'completed'] });
    const onJobCreated = vi.fn();
    const onPoll = vi.fn();

    const result = await generateOpenAiPromoVideo(
      { prompt: 'Promo', storeId: 'store-1' },
      {},
      { onJobCreated, onPoll },
    );

    expect(onJobCreated).toHaveBeenCalledWith(expect.objectContaining({ providerJobId: 'video_job_1' }));
    expect(result.url).toBe('https://example.com/uploads/test-video.mp4');
    expect(result.provider).toBe('openai');
    expect(result.providerJobId).toBe('video_job_1');
  });

  it('failed job → OpenAiVideoFailedError', async () => {
    mockJobFlow({ statuses: ['failed'] });
    await expect(generateOpenAiPromoVideo({ prompt: 'x', storeId: 'store-1' }, {})).rejects.toBeInstanceOf(
      OpenAiVideoFailedError,
    );
  });

  it('401 on create → OpenAiVideoUnavailableError', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => JSON.stringify({ error: { message: 'Invalid API key' } }),
    });

    await expect(generateOpenAiPromoVideo({ prompt: 'x' }, {})).rejects.toBeInstanceOf(
      OpenAiVideoUnavailableError,
    );
  });

  it('timeout → failed retryable', async () => {
    process.env.OPENAI_VIDEO_POLL_TIMEOUT_MS = '50';
    mockJobFlow({ statuses: ['in_progress', 'in_progress', 'in_progress'] });

    await expect(generateOpenAiPromoVideo({ prompt: 'x', storeId: 'store-1' }, {})).rejects.toMatchObject({
      name: 'OpenAiVideoFailedError',
      retryable: true,
    });
  });
});
