import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../artifacts/artifactSse.js', () => ({
  emitMissionArtifact: vi.fn(),
}));

import { emitMissionArtifact } from '../artifacts/artifactSse.js';
import { execute } from './videoGenerate.js';

describe('video_generate_multimodal executor', () => {
  const env = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.VIDEO_GENERATION_PROVIDER;
    delete process.env.VIDEO_ARTIFACT_MOCK_URL;
    delete process.env.KLING_ACCESS_KEY;
    delete process.env.KLING_SECRET_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.ENABLE_MINIMAX_H3_VIDEO_V1;
    delete process.env.MINIMAX_API_KEY;
  });

  afterEach(() => {
    process.env = { ...env };
  });

  it('fails without missionId and does not emit SSE', async () => {
    const result = await execute({}, {});
    expect(result.status).toBe('failed');
    expect(result.error?.code).toBe('MISSING_MISSION_ID');
    expect(emitMissionArtifact).not.toHaveBeenCalled();
  });

  it('returns unavailable (not ok) when no provider configured', async () => {
    const result = await execute({}, { missionId: 'm-1' });
    expect(result.status).toBe('failed');
    expect(result.error?.code).toBe('VIDEO_GENERATION_UNAVAILABLE');
    expect(result.output?.artifact?.status).toBe('unavailable');
    expect(emitMissionArtifact).toHaveBeenCalledTimes(1);
    expect(emitMissionArtifact.mock.calls[0][0]).toBe('m-1');
    expect(emitMissionArtifact.mock.calls[0][1].status).toBe('unavailable');
  });

  it('returns ready with url when mock provider configured', async () => {
    process.env.VIDEO_GENERATION_PROVIDER = 'mock';
    process.env.VIDEO_ARTIFACT_MOCK_URL = 'https://example.com/promo.mp4';
    const result = await execute({ prompt: 'Promo' }, { missionId: 'm-2' });
    expect(result.status).toBe('ok');
    expect(result.output?.artifact?.status).toBe('ready');
    expect(result.output?.artifact?.url).toBe('https://example.com/promo.mp4');
    expect(emitMissionArtifact.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('does not select MiniMax when the feature flag is off', async () => {
    process.env.VIDEO_GENERATION_PROVIDER = 'minimax';
    process.env.MINIMAX_API_KEY = 'mm-test-key';
    delete process.env.ENABLE_MINIMAX_H3_VIDEO_V1;
    const result = await execute({ prompt: 'Promo' }, { missionId: 'm-flag-off' });
    expect(result.status).toBe('failed');
    expect(result.error?.code).toBe('VIDEO_GENERATION_UNAVAILABLE');
  });
});
