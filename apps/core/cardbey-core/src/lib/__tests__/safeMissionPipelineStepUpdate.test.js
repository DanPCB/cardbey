import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../missionBlackboard.js', () => ({
  appendEvent: vi.fn(async () => ({ ok: true })),
}));

vi.mock('../orchestration/orchestrationStabilityMetrics.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    sleep: vi.fn(async () => {}),
  };
});

import { appendEvent } from '../missionBlackboard.js';
import { safeMissionPipelineStepUpdate } from '../safePipelineUpdate.js';
import { resetSqliteWriteLaneForTests } from '../sqliteWriteLane.js';

describe('safeMissionPipelineStepUpdate', () => {
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

  it('retries P1008 up to 3 attempts then succeeds', async () => {
    const p1008 = Object.assign(new Error('Socket timeout'), { code: 'P1008' });
    const update = vi
      .fn()
      .mockRejectedValueOnce(p1008)
      .mockRejectedValueOnce(p1008)
      .mockResolvedValueOnce({ id: 'step-1', status: 'running' });

    const prisma = { missionPipelineStep: { update } };
    const row = await safeMissionPipelineStepUpdate(
      prisma,
      { where: { id: 'step-1' }, data: { status: 'running' } },
      { missionId: 'mission-1' },
    );

    expect(row.status).toBe('running');
    expect(update).toHaveBeenCalledTimes(3);
    expect(appendEvent).not.toHaveBeenCalled();
  });

  it('appends blackboard error after retries exhausted', async () => {
    const p1008 = Object.assign(new Error('Socket timeout'), { code: 'P1008' });
    const update = vi.fn().mockRejectedValue(p1008);
    const prisma = { missionPipelineStep: { update } };

    await expect(
      safeMissionPipelineStepUpdate(
        prisma,
        { where: { id: 'step-2' }, data: { status: 'running' } },
        { missionId: 'mission-2' },
      ),
    ).rejects.toMatchObject({ code: 'P1008' });

    expect(update).toHaveBeenCalledTimes(3);
    expect(appendEvent).toHaveBeenCalledWith(
      'mission-2',
      'pipeline.step.update_failed',
      expect.objectContaining({ stepId: 'step-2', code: 'P1008' }),
    );
  });

  it('does not retry non-P1008 errors', async () => {
    const update = vi.fn().mockRejectedValue(Object.assign(new Error('database is locked'), {}));
    const prisma = { missionPipelineStep: { update } };

    await expect(
      safeMissionPipelineStepUpdate(prisma, { where: { id: 's' }, data: {} }),
    ).rejects.toThrow('database is locked');

    expect(update).toHaveBeenCalledTimes(1);
  });
});
