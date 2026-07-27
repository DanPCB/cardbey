/**
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const ensureMock = vi.hoisted(() => vi.fn(async () => {}));
const runMock = vi.hoisted(() =>
  vi.fn(async () => ({
    ok: true,
    missionId: 'm-campaign-exec',
    status: 'awaiting_input',
    mode: 'checkpoint_pipeline',
    orchestration: { stepsRun: 1, stoppedReason: 'awaiting_checkpoint' },
  })),
);

vi.mock('../../campaignMission/ensureStructuredCampaignCheckpointSteps.js', () => ({
  ensureStructuredCampaignCheckpointSteps: (...args) => ensureMock(...args),
}));

vi.mock('../../campaignMission/executeCampaignMissionPipelineRun.js', () => ({
  executeCampaignMissionPipelineRun: (...args) => runMock(...args),
}));

vi.mock('../../prisma.js', () => ({
  getPrismaClient: vi.fn(() => ({
    missionPipeline: {
      findUnique: vi.fn(async () => ({ id: 'm-campaign-exec', type: 'launch_campaign', targetId: 'store-1' })),
      update: vi.fn(async () => ({})),
    },
  })),
}));

import { execute } from './create_campaign.js';

describe('create_campaign tool executor', () => {
  beforeEach(() => {
    ensureMock.mockClear();
    runMock.mockClear();
  });

  it('requires missionId', async () => {
    const out = await execute({}, {});
    expect(out.status).toBe('blocked');
    expect(out.blocker?.code).toBe('MISSION_REQUIRED');
  });

  it('ensures structured steps and runs campaign pipeline', async () => {
    const out = await execute(
      { storeId: 'store-1', campaignContext: 'Valentine promo' },
      { missionId: 'm-campaign-exec', userId: 'user-1', locale: 'en' },
    );
    expect(ensureMock).toHaveBeenCalled();
    expect(runMock).toHaveBeenCalledWith(
      expect.objectContaining({
        missionId: 'm-campaign-exec',
        body: expect.objectContaining({ storeId: 'store-1', campaignContext: 'Valentine promo' }),
      }),
    );
    expect(out.status).toBe('ok');
    expect(out.output?.mode).toBe('checkpoint_pipeline');
    expect(out.output?.dispatchedVia).toBe('runtime_kernel');
  });
});
