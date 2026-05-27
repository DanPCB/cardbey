import { describe, it, expect, vi, beforeEach } from 'vitest';

const createMock = vi.fn().mockResolvedValue({ id: 'probe-1' });

vi.mock('../prisma.js', () => ({
  prisma: {
    telemetryProbe: {
      create: (...args) => createMock(...args),
    },
  },
}));

import { emitHealthProbe, resetHealthProbeQueueForTests } from './healthProbes.js';

describe('emitHealthProbe', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetHealthProbeQueueForTests();
  });

  it('debounces diagnostic probes', async () => {
    emitHealthProbe('reasoning_line_written', { missionId: 'm1', line: 'a' });
    emitHealthProbe('reasoning_line_written', { missionId: 'm1', line: 'b' });
    await new Promise((r) => setImmediate(r));
    expect(createMock).toHaveBeenCalledTimes(1);
  });

  it('never throws when prisma create rejects', async () => {
    createMock.mockRejectedValueOnce(new Error('Socket timeout'));
    expect(() => emitHealthProbe('reasoning_line_written', { missionId: 'm1' })).not.toThrow();
    await new Promise((r) => setImmediate(r));
  });
});
