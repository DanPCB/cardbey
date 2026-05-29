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
import { getStructuredMissionSteps } from '../missionPipelineStructured.js';

describe('missionPipelineRunner locale', () => {
  it('normalizes locale in checkpoint SSE and passes vi displayOptions', async () => {
    const missionId = 'm_locale_checkpoint';
    const stepId = 's_locale_checkpoint';
    const storeSteps = getStructuredMissionSteps('store', 'vi-VN');
    const logoStep = storeSteps[0];

    __prisma.missionPipeline.findUnique.mockResolvedValue({
      id: missionId,
      status: 'executing',
      runState: 'running',
      startedAt: new Date(),
      targetType: 'store',
      targetId: 'store-1',
      metadataJson: { locale: 'vi-VN', preferredLocale: 'en' },
      steps: [
        {
          id: stepId,
          toolName: 'mission.checkpoint',
          stepKind: 'checkpoint',
          label: logoStep.label,
          status: 'pending',
          orderIndex: 0,
          configJson: logoStep.configJson,
        },
      ],
    });

    __prisma.missionPipeline.update.mockResolvedValue({});
    __prisma.missionPipelineStep.update.mockResolvedValue({});

    await runNextMissionPipelineStep(missionId);

    expect(broadcastMissionCheckpoint).toHaveBeenCalledTimes(1);
    const payload = broadcastMissionCheckpoint.mock.calls[0][1];
    expect(payload.options).toEqual(['Upload now', 'Skip', 'Choose from library']);
    expect(payload.displayOptions?.[0]).toEqual({ value: 'Upload now', label: 'Tải lên ngay' });
    expect(payload.optionItems?.[0]?.value).toBe('Upload now');
  });
});
