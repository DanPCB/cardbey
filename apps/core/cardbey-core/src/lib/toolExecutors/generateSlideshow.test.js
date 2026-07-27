import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../artifacts/artifactSse.js', () => ({
  emitMissionArtifact: vi.fn(),
}));

import { emitMissionArtifact } from '../artifacts/artifactSse.js';
import { execute } from './generateSlideshow.js';

describe('generate_slideshow executor', () => {
  const env = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.SLIDESHOW_GENERATION_PROVIDER;
    delete process.env.SLIDESHOW_ARTIFACT_MOCK_URL;
  });

  afterEach(() => {
    process.env = { ...env };
  });

  it('fails without missionId', async () => {
    const result = await execute({}, {});
    expect(result.status).toBe('failed');
    expect(emitMissionArtifact).not.toHaveBeenCalled();
  });

  it('returns unavailable when no provider', async () => {
    const result = await execute({ promotionId: 'p1' }, { missionId: 'm-1' });
    expect(result.status).toBe('failed');
    expect(result.output?.artifact?.status).toBe('unavailable');
    expect(emitMissionArtifact).toHaveBeenCalledTimes(1);
    expect(emitMissionArtifact.mock.calls[0][1].status).toBe('unavailable');
  });

  it('returns ready when mock provider configured', async () => {
    process.env.SLIDESHOW_GENERATION_PROVIDER = 'mock';
    process.env.SLIDESHOW_ARTIFACT_MOCK_URL = 'https://example.com/slide.gif';
    const result = await execute({ promotionId: 'p1' }, { missionId: 'm-2' });
    expect(result.status).toBe('ok');
    expect(result.output?.artifact?.status).toBe('ready');
    expect(result.output?.artifact?.url).toBe('https://example.com/slide.gif');
    expect(emitMissionArtifact.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});
