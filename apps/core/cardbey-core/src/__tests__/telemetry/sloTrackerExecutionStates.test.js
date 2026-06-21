/**
 * SLO tracker execution-state filtering tests.
 * @vitest-environment node
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const prismaMock = {
  observation: {
    findMany: vi.fn(),
  },
  missionPipeline: {
    count: vi.fn(),
  },
};

vi.mock('../../lib/prisma.js', () => ({
  getPrismaClient: vi.fn(() => prismaMock),
}));

import sloTracker from '../../services/reliability/sloTracker.js';
import { EXECUTION_STATES } from '../../lib/telemetry/executionStates.js';

describe('SLO Tracker with Execution States', () => {
  beforeEach(() => {
    sloTracker.resetForTests();
    prismaMock.observation.findMany.mockReset();
  });

  it('counts only real executions for success rate', async () => {
    prismaMock.observation.findMany.mockResolvedValue([
      {
        outcome: 'success',
        error: null,
        actionType: 'analyze_store',
        intentType: 'dispatch_tool',
        contextSnapshot: {},
        executionState: EXECUTION_STATES.EXECUTED,
        isRealExecution: true,
      },
      {
        outcome: 'success',
        error: null,
        actionType: 'deploy_to_cnet',
        intentType: 'dispatch_tool',
        contextSnapshot: {},
        executionState: EXECUTION_STATES.STUBBED,
        isRealExecution: false,
      },
      {
        outcome: 'failure',
        error: 'boom',
        actionType: 'orders_report',
        intentType: 'dispatch_tool',
        contextSnapshot: {},
        executionState: EXECUTION_STATES.FAILED,
        isRealExecution: true,
      },
    ]);

    const stats = await sloTracker.getSuccessRateStats();
    expect(stats.eligible).toBe(2);
    expect(stats.success).toBe(1);
    expect(stats.rate).toBe(50);
  });

  it('separates real and stub failure patterns', async () => {
    prismaMock.observation.findMany.mockResolvedValue([
      {
        actionType: 'deploy_to_cnet',
        intentType: 'dispatch_tool',
        error: 'stub fail',
        contextSnapshot: {},
        executionState: EXECUTION_STATES.STUBBED,
        isRealExecution: false,
      },
      {
        actionType: 'orders_report',
        intentType: 'dispatch_tool',
        error: 'real fail',
        contextSnapshot: {},
        executionState: EXECUTION_STATES.FAILED,
        isRealExecution: true,
      },
    ]);

    const patterns = await sloTracker.getFailurePatterns(5);
    expect(patterns.totalRealFailures).toBe(1);
    expect(patterns.totalStubFailures).toBe(1);
    expect(patterns.realFailures[0]?.action).toBe('orders_report');
    expect(patterns.stubFailures[0]?.action).toBe('deploy_to_cnet');
  });

  it('reports execution state stats for control center', async () => {
    prismaMock.observation.findMany.mockResolvedValue([
      {
        outcome: 'success',
        executionState: EXECUTION_STATES.EXECUTED,
        isRealExecution: true,
      },
      {
        outcome: 'success',
        executionState: EXECUTION_STATES.STUBBED,
        isRealExecution: false,
      },
      {
        outcome: 'failure',
        executionState: EXECUTION_STATES.FAILED,
        isRealExecution: true,
      },
    ]);

    const stats = await sloTracker.getExecutionStateStats();
    expect(stats.realExecutions).toBe(2);
    expect(stats.stubExecutions).toBe(1);
    expect(stats.realFailures).toBe(1);
    expect(stats.realSuccessRate).toBe(50);
  });
});
