import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../orchestration/orchestrationStabilityMetrics.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    sleep: vi.fn(async () => {}),
  };
});

import { safeDraftStoreCreate } from '../safeDraftStoreCreate.js';
import { resetSqliteWriteLaneForTests } from '../sqliteWriteLane.js';

describe('safeDraftStoreCreate', () => {
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
    const create = vi
      .fn()
      .mockRejectedValueOnce(p1008)
      .mockRejectedValueOnce(p1008)
      .mockResolvedValueOnce({ id: 'draft-1', ownerUserId: null, input: {} });

    const prismaClient = { draftStore: { create } };
    const draft = await safeDraftStoreCreate(prismaClient, { data: { mode: 'ai' } });

    expect(draft.id).toBe('draft-1');
    expect(create).toHaveBeenCalledTimes(3);
  });

  it('throws after retries exhausted', async () => {
    const p1008 = Object.assign(new Error('Socket timeout'), { code: 'P1008' });
    const create = vi.fn().mockRejectedValue(p1008);
    const prismaClient = { draftStore: { create } };

    await expect(safeDraftStoreCreate(prismaClient, { data: {} })).rejects.toMatchObject({
      code: 'P1008',
    });
    expect(create).toHaveBeenCalledTimes(3);
  });
});
