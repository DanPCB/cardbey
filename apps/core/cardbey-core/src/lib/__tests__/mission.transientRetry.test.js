/**
 * Mission helper transient-retry integration tests.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.hoisted(() => {
  process.env.CARDBEY_TEST_DB_RETRY_DELAYS_MS = '1,1,1,1,1';
});

const prismaMock = vi.hoisted(() => ({
  mission: { findUnique: vi.fn(), create: vi.fn() },
  user: { upsert: vi.fn() },
}));

vi.mock('../prisma.js', () => ({
  getPrismaClient: () => prismaMock,
}));

vi.mock('../safeMissionUpdate.js', () => ({
  safeMissionUpdate: vi.fn(),
}));

vi.mock('../missionContextMergeQueue.js', () => ({
  enqueueMissionContextMerge: vi.fn(),
}));

import { getOrCreateMission } from '../mission.js';

describe('getOrCreateMission transient retry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.user.upsert.mockResolvedValue({ id: 'user-1' });
  });

  it('retries a Postgres recovery error during mission lookup then creates the mission', async () => {
    const missionId = 'mission-retry-1';
    prismaMock.mission.findUnique
      .mockRejectedValueOnce(new Error('FATAL: the database system is in recovery mode'))
      .mockRejectedValueOnce(new Error('FATAL: the database system is in recovery mode'))
      .mockResolvedValueOnce(null);

    prismaMock.mission.create.mockResolvedValue({
      id: missionId,
      tenantId: 'user-1',
      createdByUserId: 'user-1',
      title: null,
      status: 'active',
    });

    const user = { id: 'user-1' };
    const result = await getOrCreateMission(missionId, user);

    expect(result.id).toBe(missionId);
    expect(prismaMock.mission.findUnique).toHaveBeenCalledTimes(3);
    expect(prismaMock.mission.create).toHaveBeenCalledTimes(1);
  });

  it('returns an existing mission after retries succeed on the lookup', async () => {
    const missionId = 'mission-existing-1';
    prismaMock.mission.findUnique
      .mockRejectedValueOnce(new Error('server closed the connection unexpectedly'))
      .mockResolvedValueOnce({ id: missionId, status: 'active' });

    const result = await getOrCreateMission(missionId, { id: 'user-1' });

    expect(result).toEqual({ id: missionId, status: 'active' });
    expect(prismaMock.mission.findUnique).toHaveBeenCalledTimes(2);
    expect(prismaMock.mission.create).not.toHaveBeenCalled();
  });

  it('does not retry non-transient errors', async () => {
    const missionId = 'mission-bad-1';
    prismaMock.mission.findUnique.mockRejectedValue(new Error('Some unexpected schema error'));

    await expect(getOrCreateMission(missionId, { id: 'user-1' })).rejects.toThrow('Some unexpected schema error');
    expect(prismaMock.mission.findUnique).toHaveBeenCalledTimes(1);
  });

  it('throws DatabaseTemporarilyUnavailableError when retry budget is exhausted', async () => {
    const missionId = 'mission-exhausted-1';
    prismaMock.mission.findUnique.mockRejectedValue(new Error('database system is in recovery mode'));

    await expect(getOrCreateMission(missionId, { id: 'user-1' })).rejects.toMatchObject({
      code: 'DATABASE_TEMPORARILY_UNAVAILABLE',
      status: 503,
      retryable: true,
    });
  });
});
