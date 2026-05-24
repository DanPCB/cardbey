/**
 * DANH: validate_and_fix_next_steps — runner awaits summary before status=completed.
 * @vitest-environment node
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

const callOrder = [];

vi.mock('../missionCompletion/awaitPostMissionSummary.js', () => ({
  awaitPostMissionCompletionSummaryWithTimeout: vi.fn(async () => {
    callOrder.push('summary');
  }),
}));

vi.mock('../prisma.js', () => {
  const prisma = {
    missionPipeline: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    missionPipelineStep: {
      update: vi.fn(),
    },
  };
  return {
    getPrismaClient: () => prisma,
    __prisma: prisma,
  };
});

vi.mock('../agentPlanning/agentOrchestrator.js', () => ({
  dispatchTaskWithAgentHint: vi.fn(async () => ({
    status: 'ok',
    output: { ok: true },
  })),
}));

vi.mock('../agentPlanning/artifactInputEnrichment.js', () => ({
  enrichStepInputFromPriorOutputs: vi.fn((input) => input),
}));

vi.mock('../orchestrator/pipelineCanonicalResults.js', () => ({
  buildRunnerDualWriteMetadataJson: vi.fn(async () => null),
}));

import { __prisma } from '../prisma.js';
import { runNextMissionPipelineStep } from '../missionPipelineRunner.js';

describe('missionPipelineRunner postMissionSummary ordering', () => {
  beforeEach(() => {
    callOrder.length = 0;
    vi.clearAllMocks();
    __prisma.missionPipeline.update.mockImplementation(async (args) => {
      if (args?.data?.status === 'completed') callOrder.push('completed_update');
      return {};
    });
    __prisma.missionPipelineStep.update.mockResolvedValue({});
  });

  it('awaits postMissionSummary before prisma sets status completed', async () => {
    const missionId = 'm_runner_order';
    const stepId = 's_last';

    __prisma.missionPipeline.findUnique.mockResolvedValue({
      id: missionId,
      status: 'executing',
      runState: 'running',
      type: 'store',
      targetType: 'store',
      targetId: 'store-1',
      metadataJson: {},
      outputsJson: {},
      progressCompletedSteps: 0,
      progressTotalSteps: 1,
      steps: [
        {
          id: stepId,
          toolName: 'analyze_store',
          status: 'pending',
          orderIndex: 0,
          configJson: {},
        },
      ],
    });

    await runNextMissionPipelineStep(missionId);

    expect(callOrder).toEqual(['summary', 'completed_update']);
  });
});
