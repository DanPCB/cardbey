import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../artifacts/artifactSse.js', () => ({
  emitMissionArtifact: vi.fn(),
}));

vi.mock('../video/openaiVideoProvider.js', () => ({
  generateOpenAiPromoVideo: vi.fn(),
}));

import { emitMissionArtifact } from '../artifacts/artifactSse.js';
import { generateOpenAiPromoVideo } from '../video/openaiVideoProvider.js';
import { execute } from './videoGenerate.js';
import { OpenAiVideoUnavailableError, OpenAiVideoFailedError } from '../video/openaiVideoErrors.js';

describe('video_generate_multimodal openai provider', () => {
  const env = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.VIDEO_GENERATION_PROVIDER = 'openai';
    process.env.OPENAI_API_KEY = 'sk-test';
  });

  afterEach(() => {
    process.env = { ...env };
  });

  it('emits processing then ready when OpenAI returns URL', async () => {
    generateOpenAiPromoVideo.mockImplementation(async (_input, _ctx, hooks) => {
      await hooks?.onJobCreated?.({ providerJobId: 'job-1', status: 'queued' });
      return {
        url: 'https://cdn.example.com/v.mp4',
        previewUrl: 'https://cdn.example.com/v.mp4',
        provider: 'openai',
        providerJobId: 'job-1',
        message: 'Your promotional video is ready.',
        metadata: { providerJobId: 'job-1' },
      };
    });

    const result = await execute({ prompt: 'Promo' }, { missionId: 'm-openai', storeId: 's1' });
    expect(result.status).toBe('ok');
    expect(result.output?.artifact?.status).toBe('ready');
    expect(result.output?.artifact?.url).toBe('https://cdn.example.com/v.mp4');
    expect(result.output?.artifact?.metadata?.providerJobId).toBe('job-1');

    const statuses = emitMissionArtifact.mock.calls.map((c) => c[1].status);
    expect(statuses[0]).toBe('processing');
    expect(statuses).toContain('ready');
  });

  it('401 path → unavailable artifact', async () => {
    generateOpenAiPromoVideo.mockRejectedValue(
      new OpenAiVideoUnavailableError('OpenAI video access is not authorized.', {
        code: 'OPENAI_VIDEO_UNAUTHORIZED',
      }),
    );

    const result = await execute({ prompt: 'Promo' }, { missionId: 'm-401' });
    expect(result.status).toBe('failed');
    expect(result.output?.artifact?.status).toBe('unavailable');
    expect(result.output?.artifact?.provider).toBe('openai');
  });

  it('timeout path → failed retryable artifact', async () => {
    generateOpenAiPromoVideo.mockRejectedValue(
      new OpenAiVideoFailedError('Video generation timed out.', { retryable: true, providerJobId: 'job-t' }),
    );

    const result = await execute({ prompt: 'Promo' }, { missionId: 'm-timeout' });
    expect(result.status).toBe('failed');
    expect(result.output?.artifact?.status).toBe('failed');
    expect(result.output?.artifact?.retryable).toBe(true);
  });
});
