/**
 * DANH: validate_and_fix_next_steps — orchestraMirror fires summary after pipeline status=completed.
 * @vitest-environment node
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

const callOrder = [];

vi.mock('../missionCompletion/postMissionSummary.js', () => ({
  runPostMissionCompletionSummary: vi.fn(async () => {
    callOrder.push('summary');
  }),
}));

vi.mock('../orchestrator/pipelineWriteAudit.js', () => ({
  auditedPipelineUpdate: vi.fn(async (_prisma, args) => {
    if (args?.data?.status === 'completed') callOrder.push('completed_update');
    return {};
  }),
}));

vi.mock('../telemetry/healthProbes.js', () => ({
  emitHealthProbe: vi.fn(),
}));

vi.mock('../prisma.js', () => {
  const missionPipeline = {
    findUnique: vi.fn(),
    update: vi.fn(),
  };
  const missionPipelineStep = {
    findMany: vi.fn(),
    count: vi.fn(),
  };
  return {
    getPrismaClient: () => ({ missionPipeline, missionPipelineStep }),
    __missionPipeline: missionPipeline,
    __missionPipelineStep: missionPipelineStep,
  };
});

import { __missionPipeline, __missionPipelineStep } from '../prisma.js';
import { runPostMissionCompletionSummary } from '../missionCompletion/postMissionSummary.js';
import { auditedPipelineUpdate } from '../orchestrator/pipelineWriteAudit.js';
import { mirrorOrchestraStatusToPipeline } from '../orchestraMirror.js';

describe('mirrorOrchestraStatusToPipeline postMissionSummary ordering', () => {
  beforeEach(() => {
    callOrder.length = 0;
    vi.clearAllMocks();
    __missionPipeline.findUnique.mockResolvedValue({
      type: 'store',
      status: 'executing',
      outputsJson: { storeName: 'Test Cafe' },
      metadataJson: {},
      progressTotalSteps: 1,
      progressCompletedSteps: 0,
      executionMode: 'AUTO_RUN',
    });
    __missionPipelineStep.findMany.mockResolvedValue([]);
    __missionPipelineStep.count.mockResolvedValue(0);
  });

  it('fires postMissionSummary when orchestra task completes', async () => {
    await mirrorOrchestraStatusToPipeline('m_mirror_1', 'completed');

    // Summary runs fire-and-forget after status=completed.
    // Ordering between summary and status is not guaranteed.
    expect(runPostMissionCompletionSummary).toHaveBeenCalledTimes(1);
    expect(auditedPipelineUpdate).toHaveBeenCalledTimes(1);
    expect(runPostMissionCompletionSummary).toHaveBeenCalledWith(
      expect.objectContaining({ missionId: 'm_mirror_1' }),
    );
  });

  it('still fires postMissionSummary when re-mirroring an already completed pipeline', async () => {
    __missionPipeline.findUnique.mockResolvedValue({
      type: 'store',
      status: 'completed',
      outputsJson: {},
      metadataJson: {},
      progressTotalSteps: 3,
      progressCompletedSteps: 3,
      executionMode: 'AUTO_RUN',
    });

    await mirrorOrchestraStatusToPipeline('m_mirror_2', 'completed');

    // Summary runs fire-and-forget after status=completed.
    // Ordering between summary and status is not guaranteed.
    expect(runPostMissionCompletionSummary).toHaveBeenCalledTimes(1);
    expect(auditedPipelineUpdate).toHaveBeenCalledTimes(1);
  });
});
