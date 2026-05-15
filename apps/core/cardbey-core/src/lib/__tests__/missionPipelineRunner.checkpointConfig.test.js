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
import { runNextMissionPipelineStep } from '../missionPipelineRunner.js';

describe('missionPipelineRunner checkpoint configJson', () => {
  it('writes only prompt/options (no checkpointPrompt/options aliases) for new awaiting_input checkpoint step', async () => {
    const missionId = 'm_test_checkpoint_cfg';
    const stepId = 's_test_checkpoint_cfg';

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
          orderIndex: 1,
          configJson: { prompt: 'Pick one', options: ['A', 'B'], outputKey: 'choice' },
        },
      ],
    });

    __prisma.missionPipeline.update.mockResolvedValue({});
    __prisma.missionPipelineStep.update.mockResolvedValue({});

    await runNextMissionPipelineStep(missionId);

    const calls = __prisma.missionPipelineStep.update.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    const lastUpdate = calls[calls.length - 1]?.[0];
    expect(lastUpdate.where).toEqual({ id: stepId });
    expect(lastUpdate.data.status).toBe('awaiting_input');
    const cfg = lastUpdate.data.configJson;
    expect(cfg).toBeTruthy();
    expect(cfg.prompt).toBe('Pick one');
    expect(cfg.options).toEqual(['A', 'B']);
    expect(cfg.checkpointPrompt).toBeUndefined();
    expect(cfg.checkpointOptions).toBeUndefined();
  });
});

