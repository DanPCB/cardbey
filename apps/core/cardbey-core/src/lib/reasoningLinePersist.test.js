import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('reasoningLinePersist', () => {
  const origUrl = process.env.DATABASE_URL;
  const origNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    vi.resetModules();
    process.env.DATABASE_URL = 'file:./dev.db';
    process.env.NODE_ENV = 'development';
    delete process.env.REASONING_PERSIST_MODE;
  });

  afterEach(() => {
    process.env.DATABASE_URL = origUrl;
    process.env.NODE_ENV = origNodeEnv;
    vi.restoreAllMocks();
  });

  it('shouldUseLightweightReasoningPersist is true for sqlite dev', async () => {
    const { shouldUseLightweightReasoningPersist } = await import('./reasoningLinePersist.js');
    expect(shouldUseLightweightReasoningPersist()).toBe(true);
  });

  it('shouldSkipDuplicateReasoningLine skips consecutive duplicates', async () => {
    const { shouldSkipDuplicateReasoningLine, resetReasoningLineDedupe } = await import('./reasoningLinePersist.js');
    resetReasoningLineDedupe('m-dedupe');
    expect(shouldSkipDuplicateReasoningLine('m-dedupe', 'Analysing store input...')).toBe(false);
    expect(shouldSkipDuplicateReasoningLine('m-dedupe', 'Analysing store input...')).toBe(true);
    expect(shouldSkipDuplicateReasoningLine('m-dedupe', '✓ Store input reviewed')).toBe(false);
  });

  it('scheduleReasoningLinePersist broadcasts without awaiting mission.update', async () => {
    vi.useFakeTimers();
    const sse = await import('../realtime/simpleSse.js');
    const bb = await import('./missionBlackboard.js');
    const broadcastSpy = vi.spyOn(sse, 'broadcastMissionReasoningLine').mockImplementation(() => {});
    vi.spyOn(bb, 'appendEvent').mockResolvedValue({ seq: 1 });

    const mergeMissionContext = vi.fn().mockResolvedValue(undefined);
    const prisma = {
      mission: {
        findUnique: vi.fn().mockResolvedValue({ context: { reasoning_log: ['a'] } }),
      },
    };

    const { scheduleReasoningLinePersist, resetReasoningLineDedupe } = await import('./reasoningLinePersist.js');
    resetReasoningLineDedupe('m1');
    scheduleReasoningLinePersist('m1', 'line-b', { prisma, mergeMissionContext });
    await vi.advanceTimersByTimeAsync(500);

    expect(broadcastSpy).toHaveBeenCalledWith(
      'm1',
      expect.objectContaining({ line: 'line-b' }),
    );
    expect(mergeMissionContext).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
