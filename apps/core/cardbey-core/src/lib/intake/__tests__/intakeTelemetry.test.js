import { describe, expect, it, vi, beforeEach } from 'vitest';
import { emitIntakeV2Telemetry } from '../intakeTelemetry.js';

const createMock = vi.fn().mockResolvedValue({ id: 'dispatch_123' });

vi.mock('../../prisma.js', () => ({
  getPrismaClient: () => ({
    skillDispatchLog: { create: createMock },
  }),
}));

describe('emitIntakeV2Telemetry', () => {
  beforeEach(() => {
    createMock.mockClear();
  });

  it('persists dispatch log and returns id', async () => {
    const id = await emitIntakeV2Telemetry({
      traceId: 'trace-abc',
      message: 'Launch a campaign for my bakery',
      userId: 'user_1',
      sessionId: 'sess_1',
      tool: 'launch_campaign',
      confidence: 0.91,
      executionPath: 'direct_action',
      intentFamily: 'campaign',
      intentSubtype: 'launch',
      result: 'success',
      latencyMs: 120,
    });

    expect(id).toBe('dispatch_123');
    expect(createMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        traceId: 'trace-abc',
        userId: 'user_1',
        sessionId: 'sess_1',
        query: 'Launch a campaign for my bakery',
        matchedSkill: 'launch_campaign',
        confidence: 0.91,
        executionPath: 'direct_action',
        outcome: 'success',
        latencyMs: 120,
      }),
    });
  });

  it('returns null when query is empty', async () => {
    const id = await emitIntakeV2Telemetry({ traceId: 't1', tool: 'general_chat' });
    expect(id).toBeNull();
    expect(createMock).not.toHaveBeenCalled();
  });
});
