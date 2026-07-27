import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const deleteManyMock = vi.fn();

vi.mock('../../prisma.js', () => ({
  getPrismaClient: () => ({
    frontendError: { deleteMany: deleteManyMock },
  }),
}));

import { cleanupOldDiagnostics } from '../diagnosticsCleanup.js';

describe('diagnosticsCleanup', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-26T12:00:00.000Z'));
    deleteManyMock.mockReset();
    deleteManyMock.mockResolvedValue({ count: 42 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('deletes frontend errors older than retention window', async () => {
    const result = await cleanupOldDiagnostics({ retentionHours: 24 });

    expect(deleteManyMock).toHaveBeenCalledWith({
      where: {
        timestamp: { lt: new Date('2026-06-25T12:00:00.000Z') },
      },
    });
    expect(result.deleted).toBe(42);
    expect(result.retentionHours).toBe(24);
  });

  it('honors custom retention hours from options', async () => {
    await cleanupOldDiagnostics({ retentionHours: 1 });

    expect(deleteManyMock).toHaveBeenCalledWith({
      where: {
        timestamp: { lt: new Date('2026-06-26T11:00:00.000Z') },
      },
    });
  });
});
