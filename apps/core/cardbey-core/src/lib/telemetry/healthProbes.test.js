import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const createMock = vi.fn().mockResolvedValue({ id: 'probe-1' });

vi.mock('../prisma.js', () => ({
  prisma: {
    telemetryProbe: {
      create: (...args) => createMock(...args),
    },
  },
}));

import {
  markMissionPipelineExecuting,
  clearMissionPipelineExecuting,
  resetMissionExecutionGuardForTests,
} from '../missionExecutionGuard.js';
import { emitHealthProbe, resetHealthProbeQueueForTests } from './healthProbes.js';
import { flushWriteQueue } from '../sqliteWriteQueue.js';

describe('emitHealthProbe', () => {
  const prevNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    vi.clearAllMocks();
    resetHealthProbeQueueForTests();
    resetMissionExecutionGuardForTests();
    process.env.NODE_ENV = 'test';
  });

  afterEach(() => {
    process.env.NODE_ENV = prevNodeEnv;
    resetMissionExecutionGuardForTests();
  });

  it('debounces diagnostic probes', async () => {
    emitHealthProbe('reasoning_line_written', { missionId: 'm1', line: 'a' });
    emitHealthProbe('reasoning_line_written', { missionId: 'm1', line: 'b' });
    await flushWriteQueue();
    await new Promise((r) => setImmediate(r));
    expect(createMock.mock.calls.length).toBeLessThanOrEqual(1);
  });

  it('never throws when prisma create rejects', async () => {
    createMock.mockRejectedValueOnce(Object.assign(new Error('Socket timeout'), { code: 'P1008' }));
    expect(() => emitHealthProbe('reasoning_line_written', { missionId: 'm1' })).not.toThrow();
    await flushWriteQueue();
    await new Promise((r) => setImmediate(r));
  });

  it('suppresses telemetry while mission pipeline is executing in non-production', async () => {
    markMissionPipelineExecuting('mission-active');
    emitHealthProbe('reasoning_line_written', { missionId: 'mission-active' });
    await flushWriteQueue();
    await new Promise((r) => setImmediate(r));
    expect(createMock).not.toHaveBeenCalled();
    clearMissionPipelineExecuting('mission-active');
  });
});
