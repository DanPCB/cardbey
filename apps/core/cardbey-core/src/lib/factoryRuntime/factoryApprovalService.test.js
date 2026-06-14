import { describe, it, expect, vi, beforeEach } from 'vitest';

const runFactoryExecution = vi.fn();
const pendingState = {
  executionId: 'exec-1',
  factoryId: 'creative_asset_factory_v4',
  missionId: 'm-1',
  userId: 'u-1',
  status: 'awaiting_final_asset_approval',
  pendingApprovalKind: 'final_asset',
  currentStageId: 'final_asset_review',
  stageIndex: 9,
  stageOutputs: {
    multi_scene_render: { videoUrl: 'https://cdn.example.com/v.mp4', sceneClips: [] },
    subtitle_burn_optional: { subtitleArtifact: { artifactId: 'sub-1' } },
  },
  intent: 'promo',
  context: {},
};

vi.mock('./factoryRuntimeExecutor.js', () => ({
  runFactoryExecution: (...args) => runFactoryExecution(...args),
}));

vi.mock('./factoryRegistry.js', () => ({
  getFactory: () => ({
    factoryId: 'creative_asset_factory_v4',
    stages: [
      { stageId: 'plan_approval' },
      { stageId: 'multi_scene_render' },
      { stageId: 'subtitle_burn_optional' },
      { stageId: 'final_asset_review' },
    ],
    approvalPolicy: { planOutputPath: 'stageOutputs.video_plan.videoPlan', approvalStageId: 'plan_approval' },
  }),
}));

vi.mock('../mission.js', () => ({ mergeMissionContext: vi.fn() }));
vi.mock('../missionBlackboard.js', () => ({
  appendEvent: vi.fn(),
  setBlackboardKey: vi.fn(),
  getEvents: vi.fn().mockResolvedValue({ events: [] }),
}));
vi.mock('../prisma.js', () => ({
  getPrismaClient: () => ({
    mission: {
      findUnique: vi.fn().mockResolvedValue({
        context: { factoryRuntimeExecution: pendingState },
      }),
    },
  }),
}));

describe('factoryApprovalService multi-checkpoint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runFactoryExecution.mockResolvedValue({ ok: true, status: 'running' });
  });

  it('regenerate rewinds to multi_scene_render stage', async () => {
    const { handleFactoryApprovalDecision } = await import('./factoryApprovalService.js');

    await handleFactoryApprovalDecision({
      missionId: 'm-1',
      userId: 'u-1',
      decision: 'regenerate',
    });

    expect(runFactoryExecution).toHaveBeenCalledWith(
      expect.objectContaining({
        resumeState: expect.objectContaining({
          stageIndex: 1,
          currentStageId: 'multi_scene_render',
          resumeFromApproval: false,
        }),
      }),
    );
  });
});
