/**
 * @vitest-environment node
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/prisma.js', () => {
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

vi.mock('../../realtime/simpleSse.js', () => ({
  broadcastMissionCheckpoint: vi.fn(),
}));

import { __prisma } from '../../lib/prisma.js';
import { broadcastMissionCheckpoint } from '../../realtime/simpleSse.js';
import { runNextMissionPipelineStep } from '../missionPipelineRunner.js';

describe('missionPipelineRunner checkpoint SSE smoke', () => {
  it('does not throw and emits mission.checkpoint when entering awaiting_input', async () => {
    const missionId = 'm_test_checkpoint_sse';
    const stepId = 's_test_checkpoint_sse';

    __prisma.missionPipeline.findUnique.mockResolvedValue({
      id: missionId,
      status: 'executing',
      runState: 'running',
      startedAt: new Date(),
      targetType: 'store',
      targetId: 'store-1',
      metadataJson: {},
      steps: [
        {
          id: stepId,
          toolName: 'mission.checkpoint',
          stepKind: 'checkpoint',
          label: 'Logo',
          status: 'pending',
          orderIndex: 0,
          configJson: { prompt: 'Pick one', options: ['A', 'B'], outputKey: 'choice' },
        },
      ],
    });

    __prisma.missionPipeline.update.mockResolvedValue({});
    __prisma.missionPipelineStep.update.mockResolvedValue({});

    await expect(runNextMissionPipelineStep(missionId)).resolves.toBeTruthy();

    expect(broadcastMissionCheckpoint).toHaveBeenCalledTimes(1);
    expect(broadcastMissionCheckpoint).toHaveBeenCalledWith(missionId, {
      stepId,
      prompt: 'Pick one',
      options: ['A', 'B'],
      outputKey: 'choice',
    });
  });
});

