/**
 * DANH: validate_and_fix_next_steps — orchestraMirror awaits summary before pipeline status=completed.
 * @vitest-environment node
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

const callOrder = [];
const appendEventMock = vi.fn();

vi.mock('../missionCompletion/awaitPostMissionSummary.js', () => ({
  awaitPostMissionCompletionSummaryWithTimeout: vi.fn(async (opts) => {
    callOrder.push('summary');
    await appendEventMock(opts.missionId, 'next_action_hints', {
      hints: [{ label: 'Add menu →', prompt: 'menu', suggestedTool: 'replace_store_catalog' }],
    });
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
import { awaitPostMissionCompletionSummaryWithTimeout } from '../missionCompletion/awaitPostMissionSummary.js';
import { auditedPipelineUpdate } from '../orchestrator/pipelineWriteAudit.js';
import { mirrorOrchestraStatusToPipeline } from '../orchestraMirror.js';

describe('mirrorOrchestraStatusToPipeline postMissionSummary ordering', () => {
  beforeEach(() => {
    callOrder.length = 0;
    appendEventMock.mockClear();
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

  it('awaits summary (next_action_hints) before auditedPipelineUpdate sets completed', async () => {
    await mirrorOrchestraStatusToPipeline('m_mirror_1', 'completed');

    expect(awaitPostMissionCompletionSummaryWithTimeout).toHaveBeenCalledTimes(1);
    expect(auditedPipelineUpdate).toHaveBeenCalledTimes(1);
    expect(callOrder).toEqual(['summary', 'completed_update']);
    expect(appendEventMock).toHaveBeenCalledWith(
      'm_mirror_1',
      'next_action_hints',
      expect.objectContaining({ hints: expect.any(Array) }),
    );
    const hintsIdx = callOrder.indexOf('summary');
    const completedIdx = callOrder.indexOf('completed_update');
    expect(hintsIdx).toBeLessThan(completedIdx);
  });

  it('skips summary when pipeline was already completed (runner primary path)', async () => {
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

    expect(awaitPostMissionCompletionSummaryWithTimeout).not.toHaveBeenCalled();
    expect(callOrder).toEqual(['completed_update']);
  });
});
