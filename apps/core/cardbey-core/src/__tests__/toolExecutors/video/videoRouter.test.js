import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { execute as generateVideo } from '../../../lib/toolExecutors/video/videoRouter.js';
import { EXECUTION_STATES } from '../../../lib/telemetry/executionStates.js';

vi.mock('../../../lib/video/videoArtifactContract.js', () => ({
  resolveVideoProvider: vi.fn(() => 'mock'),
  isVideoGenerationProviderAvailable: vi.fn(() => true),
  videoProviderUnavailableReason: vi.fn(() => null),
  generateVideoViaProvider: vi.fn(async () => ({
    url: 'https://example.com/video.mp4',
    previewUrl: 'https://example.com/video.mp4',
    thumbnailUrl: 'https://example.com/thumb.jpg',
    message: 'Video is ready',
    metadata: { duration: 5 },
  })),
}));

describe('Video Router', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('generates video with valid prompt', async () => {
    const result = await generateVideo({
      storeId: 'test-store',
      prompt: 'Product showcase',
      duration: 5,
    });

    expect(result.status).toBe('ok');
    expect(result.output?.executionState).toBe(EXECUTION_STATES.EXECUTED);
    expect(result.output?.videoUrl).toBeDefined();
    expect(result.output?.provider).toBe('mock');
  });

  it('blocks without prompt', async () => {
    const result = await generateVideo({
      storeId: 'test-store',
    });

    expect(result.status).toBe('blocked');
    expect(result.output?.executionState).toBe(EXECUTION_STATES.BLOCKED);
    expect(result.blocker?.code).toBe('PROMPT_REQUIRED');
  });

  it('blocks without storeId', async () => {
    const result = await generateVideo({
      prompt: 'Product showcase',
    });

    expect(result.status).toBe('blocked');
    expect(result.blocker?.code).toBe('STORE_ID_REQUIRED');
  });
});
