import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../orchestration/orchestrationStabilityMetrics.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    sleep: vi.fn(async () => {}),
  };
});

import {
  MissionCreateBusyError,
  MissionCreateTimeoutError,
  buildStoreMissionIdempotencyKey,
  findRecentStoreMissionByIdempotencyKey,
  isMissionCreateBusyError,
  isMissionCreateTimeoutError,
  missionCreateBusyHttpBody,
  missionCreateTimeoutHttpBody,
  runMissionCreateWrite,
} from '../missionCreateWrite.js';
import { resetSqliteWriteLaneForTests } from '../../sqliteWriteLane.js';

describe('missionCreateWrite', () => {
  const prevSerialization = process.env.PERFORMER_SQLITE_RUNTIME_WRITE_SERIALIZATION;

  beforeEach(() => {
    vi.clearAllMocks();
    resetSqliteWriteLaneForTests();
    process.env.PERFORMER_SQLITE_RUNTIME_WRITE_SERIALIZATION = 'false';
  });

  afterEach(() => {
    resetSqliteWriteLaneForTests();
    if (prevSerialization === undefined) {
      delete process.env.PERFORMER_SQLITE_RUNTIME_WRITE_SERIALIZATION;
    } else {
      process.env.PERFORMER_SQLITE_RUNTIME_WRITE_SERIALIZATION = prevSerialization;
    }
  });

  it('buildStoreMissionIdempotencyKey is stable for same inputs', () => {
    const params = {
      createdBy: 'user-1',
      title: 'Create store: My Cafe',
      metadata: {
        businessName: 'My Cafe',
        businessType: 'Food & drink',
        location: 'Melbourne',
        intentMode: 'website',
      },
    };
    expect(buildStoreMissionIdempotencyKey(params)).toBe(buildStoreMissionIdempotencyKey(params));
  });

  it('queued mission resolves successfully', async () => {
    const fn = vi.fn(async () => ({ id: 'mission-1' }));
    const result = await runMissionCreateWrite(fn, { label: 'test.create', timeoutMs: 5000 });
    expect(result).toEqual({ id: 'mission-1' });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries transient P1008 then succeeds', async () => {
    const p1008 = Object.assign(new Error('Socket timeout'), { code: 'P1008' });
    const fn = vi
      .fn()
      .mockRejectedValueOnce(p1008)
      .mockRejectedValueOnce(p1008)
      .mockResolvedValueOnce({ id: 'mission-1' });

    const result = await runMissionCreateWrite(fn, { label: 'test.create' });
    expect(result).toEqual({ id: 'mission-1' });
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('throws MissionCreateBusyError after retry exhaustion', async () => {
    const p1008 = Object.assign(new Error('Socket timeout'), { code: 'P1008' });
    const fn = vi.fn().mockRejectedValue(p1008);

    await expect(runMissionCreateWrite(fn, { label: 'test.create' })).rejects.toBeInstanceOf(
      MissionCreateBusyError,
    );
    expect(fn).toHaveBeenCalledTimes(3);
    expect(isMissionCreateBusyError(new MissionCreateBusyError())).toBe(true);
  });

  it('never-resolving write returns MissionCreateTimeoutError', async () => {
    vi.useFakeTimers();
    const fn = vi.fn(
      () =>
        new Promise(() => {
          /* never settles */
        }),
    );
    const pending = runMissionCreateWrite(fn, { label: 'test.stall', timeoutMs: 100 });
    const assertion = expect(pending).rejects.toBeInstanceOf(MissionCreateTimeoutError);
    await vi.advanceTimersByTimeAsync(150);
    await assertion;
    expect(isMissionCreateTimeoutError(new MissionCreateTimeoutError())).toBe(true);
    vi.useRealTimers();
  });

  it('queue task throwing releases lock for a follow-up write', async () => {
    process.env.PERFORMER_SQLITE_RUNTIME_WRITE_SERIALIZATION = 'true';
    const fail = runMissionCreateWrite(async () => {
      throw new Error('write_failed');
    }, { label: 'test.fail', timeoutMs: 5000 });
    await expect(fail).rejects.toThrow('write_failed');

    const ok = runMissionCreateWrite(async () => ({ id: 'mission-2' }), {
      label: 'test.ok',
      timeoutMs: 5000,
    });
    await expect(ok).resolves.toEqual({ id: 'mission-2' });
  });

  it('findRecentStoreMissionByIdempotencyKey matches metadata idempotencyKey', async () => {
    const key = buildStoreMissionIdempotencyKey({
      createdBy: 'user-1',
      metadata: { businessName: 'Cafe', businessType: 'food', location: 'Melbourne', intentMode: 'store' },
    });
    const prisma = {
      missionPipeline: {
        findMany: vi.fn(async () => [
          {
            id: 'm-recent',
            status: 'requested',
            title: 'Create store: Cafe',
            metadataJson: { idempotencyKey: key },
            createdAt: new Date(),
          },
        ]),
      },
    };
    const row = await findRecentStoreMissionByIdempotencyKey(prisma, key, 'user-1');
    expect(row?.id).toBe('m-recent');
  });

  it('missionCreateBusyHttpBody matches contract', () => {
    expect(missionCreateBusyHttpBody()).toEqual({
      ok: false,
      error: 'mission_create_busy',
      message: 'Cardbey is preparing your mission. Please try again in a moment.',
    });
  });

  it('missionCreateTimeoutHttpBody matches contract', () => {
    expect(missionCreateTimeoutHttpBody()).toEqual({
      ok: false,
      error: 'mission_create_timeout',
      message: 'Cardbey is still preparing your mission. Please try again.',
    });
  });
});
