import { describe, it, expect, vi, beforeEach } from 'vitest';

const dispatchTool = vi.fn();
const registerGeneratedArtifactV1 = vi.fn();
const persistFactoryPending = vi.fn();
const mergeMissionContext = vi.fn();
const runCreativeFactoryV2BuiltinStage = vi.fn();

vi.mock('../toolDispatcher.js', () => ({
  dispatchTool: (...args) => dispatchTool(...args),
}));

vi.mock('../artifacts/generatedArtifactAuthority.js', () => ({
  registerGeneratedArtifactV1: (...args) => registerGeneratedArtifactV1(...args),
  registerGeneratedArtifactFromOperational: vi.fn().mockResolvedValue(null),
}));

vi.mock('../mission.js', () => ({
  mergeMissionContext: (...args) => mergeMissionContext(...args),
}));

vi.mock('../missionBlackboard.js', () => ({
  appendEvent: vi.fn().mockResolvedValue({ ok: true }),
  setBlackboardKey: vi.fn().mockResolvedValue({ ok: true }),
  getEvents: vi.fn().mockResolvedValue({ events: [] }),
}));

vi.mock('./creativeFactoryV2Stages.js', () => ({
  runCreativeFactoryV2BuiltinStage: (...args) => runCreativeFactoryV2BuiltinStage(...args),
}));

vi.mock('./factoryApprovalService.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    persistFactoryPending: (...args) => persistFactoryPending(...args),
  };
});

describe('factoryRuntimeExecutor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    registerGeneratedArtifactV1.mockResolvedValue({
      artifactId: 'gart-test-1',
      status: 'ready',
      url: 'https://cdn.example.com/v.mp4',
      artifactType: 'generated_video',
      missionId: 'm-1',
      ownerUserId: 'u-1',
    });
    dispatchTool.mockImplementation(async (toolName) => {
      /* @pure-transform test mock — no IO */
      if (toolName === 'video_plan') {
        return {
          status: 'ok',
          output: { plan: { script: 'Hello', storeId: 'store-1' }, planSchema: 'video_plan_v1' },
        };
      }
      if (toolName === 'video_generate_multimodal') {
        return {
          status: 'ok',
          output: {
            videoUrl: 'https://cdn.example.com/v.mp4',
            artifact: {
              id: 'art-1',
              missionId: 'm-1',
              type: 'video',
              status: 'ready',
              url: 'https://cdn.example.com/v.mp4',
            },
          },
        };
      }
      if (toolName === 'video_post_production') {
        return {
          status: 'ok',
          output: {
            videoUrl: 'https://cdn.example.com/v-audio.mp4',
            captionUrl: '/uploads/media/captions.vtt',
            hasAudio: true,
            captionMode: 'sidecar',
            outcomeReport: { audio: 'TTS muxed', captions: 'WebVTT', warnings: [] },
            artifact: {
              id: 'art-1',
              missionId: 'm-1',
              type: 'video',
              status: 'ready',
              url: 'https://cdn.example.com/v-audio.mp4',
              metadata: { hasAudio: true, captionUrl: '/uploads/media/captions.vtt' },
            },
          },
        };
      }
      if (toolName === 'video_media_validation') {
        return {
          status: 'ok',
          output: {
            videoUrl: 'https://cdn.example.com/v-audio.mp4',
            hasAudio: true,
            audioStreamCount: 1,
            videoStreamCount: 1,
            captionUrl: '/uploads/media/captions.vtt',
            captionMode: 'sidecar',
            validationStatus: 'passed',
            artifact: {
              id: 'art-1',
              missionId: 'm-1',
              type: 'video',
              status: 'ready',
              url: 'https://cdn.example.com/v-audio.mp4',
              metadata: {
                hasAudio: true,
                audioStreamCount: 1,
                videoStreamCount: 1,
                captionMode: 'sidecar',
                captionUrl: '/uploads/media/captions.vtt',
                validationStatus: 'passed',
              },
            },
          },
        };
      }
      return { status: 'failed', error: { message: 'unknown tool' } };
    });
  });

  it('pauses at approval after creative_plan', async () => {
    const { runFactoryExecution } = await import('./factoryRuntimeExecutor.js');
    const result = await runFactoryExecution({
      factoryId: 'creative_asset_factory_v1',
      missionId: 'm-1',
      userId: 'u-1',
      intent: 'Create a promo video',
      context: { storeId: 'store-1' },
    });

    expect(result.ok).toBe(true);
    expect(result.status).toBe('awaiting_factory_approval');
    expect(result.plan?.script).toBe('Hello');
    expect(dispatchTool).toHaveBeenCalledWith(
      'video_plan',
      expect.objectContaining({ storeId: 'store-1' }),
      expect.objectContaining({ runtimeOwned: true }),
    );
    expect(persistFactoryPending).toHaveBeenCalled();
  });

  it('resumes after approval and completes with artifact', async () => {
    const { runFactoryExecution } = await import('./factoryRuntimeExecutor.js');
    const resumeState = {
      executionId: 'exec-1',
      factoryId: 'creative_asset_factory_v1',
      missionId: 'm-1',
      userId: 'u-1',
      intent: 'Create a promo video',
      context: { storeId: 'store-1', missionId: 'm-1' },
      stageIndex: 1,
      stageOutputs: {
        creative_plan: { plan: { script: 'Hello', storeId: 'store-1' } },
      },
      artifactRefs: [],
      status: 'running',
      resumeFromApproval: true,
      resumedApprovalStageId: 'approval',
    };

    const result = await runFactoryExecution({
      factoryId: 'creative_asset_factory_v1',
      missionId: 'm-1',
      userId: 'u-1',
      intent: 'Create a promo video',
      context: { storeId: 'store-1' },
      resumeState,
    });

    expect(result.ok).toBe(true);
    expect(result.status).toBe('completed');
    expect(result.artifact?.artifactId).toBe('gart-test-1');
    expect(dispatchTool).toHaveBeenCalledWith(
      'video_generate_multimodal',
      expect.any(Object),
      expect.objectContaining({ runtimeOwned: true }),
    );
    expect(dispatchTool).toHaveBeenCalledWith(
      'video_post_production',
      expect.objectContaining({
        approvedPlan: expect.objectContaining({ script: 'Hello' }),
      }),
      expect.objectContaining({ runtimeOwned: true }),
    );
    expect(dispatchTool).toHaveBeenCalledWith(
      'video_media_validation',
      expect.any(Object),
      expect.objectContaining({ runtimeOwned: true }),
    );
    expect(registerGeneratedArtifactV1).toHaveBeenCalled();
  });

  it('V2 pauses at approval with videoPlan and resumes without restarting research', async () => {
    const researchBrief = {
      audience: 'Locals',
      offerAngle: 'Promo',
      seasonalHook: 'Summer',
      productServiceFocus: 'Bread',
      recommendedTone: 'warm',
      visualDirection: 'Bright',
      summary: 'Summer bread promo',
    };
    const scriptDraft = {
      hook: 'Fresh bread',
      scenes: [
        { id: 1, shot: 'A', durationSec: 4 },
        { id: 2, shot: 'B', durationSec: 10 },
        { id: 3, shot: 'C', durationSec: 5 },
      ],
      voiceoverCopy: 'Fresh bread daily',
      cta: 'Visit',
      onScreenText: ['Fresh'],
    };
    const videoPlan = {
      approvalSummary: '3 scenes',
      script: 'Fresh bread daily',
      scenes: scriptDraft.scenes,
      style: 'promotional',
    };

    runCreativeFactoryV2BuiltinStage.mockImplementation(async (stage) => {
      if (stage.stageId === 'research') return { ok: true, output: { researchBrief } };
      if (stage.stageId === 'script') return { ok: true, output: { scriptDraft } };
      if (stage.stageId === 'asset_search') return { ok: true, output: { assetCandidates: [] } };
      if (stage.stageId === 'video_plan') return { ok: true, output: { videoPlan, plan: videoPlan } };
      return { ok: false, error: { message: 'unexpected' } };
    });

    const { runFactoryExecution } = await import('./factoryRuntimeExecutor.js');
    const paused = await runFactoryExecution({
      factoryId: 'creative_asset_factory_v2',
      missionId: 'm-v2',
      userId: 'u-1',
      intent: 'promo video',
      context: { storeId: 'store-1' },
    });

    expect(paused.status).toBe('awaiting_factory_approval');
    expect(paused.plan?.approvalSummary).toBe('3 scenes');
    expect(runCreativeFactoryV2BuiltinStage).toHaveBeenCalledTimes(4);

    const resumeState = {
      executionId: 'exec-v2',
      factoryId: 'creative_asset_factory_v2',
      missionId: 'm-v2',
      userId: 'u-1',
      intent: 'promo video',
      context: { storeId: 'store-1', missionId: 'm-v2' },
      stageIndex: 4,
      stageOutputs: paused.stageOutputs,
      artifactRefs: [],
      status: 'running',
      resumeFromApproval: true,
      resumedApprovalStageId: 'approval',
    };

    const completed = await runFactoryExecution({
      factoryId: 'creative_asset_factory_v2',
      missionId: 'm-v2',
      userId: 'u-1',
      intent: 'promo video',
      context: { storeId: 'store-1' },
      resumeState,
    });

    expect(completed.status).toBe('completed');
    expect(dispatchTool).toHaveBeenCalledWith(
      'video_generate_multimodal',
      expect.objectContaining({ approvedPlan: videoPlan }),
      expect.any(Object),
    );
    expect(runCreativeFactoryV2BuiltinStage).toHaveBeenCalledTimes(4);
  });

  it('fails when required artifact missing before approval', async () => {
    const { runFactoryExecution } = await import('./factoryRuntimeExecutor.js');
    const result = await runFactoryExecution({
      factoryId: 'campaign_package_factory_v1',
      missionId: 'm-camp',
      userId: 'u-1',
      intent: 'package campaign',
      context: { storeId: 'store-1' },
      resumeState: {
        executionId: 'exec-camp',
        factoryId: 'campaign_package_factory_v1',
        missionId: 'm-camp',
        userId: 'u-1',
        intent: 'package campaign',
        context: { storeId: 'store-1', missionId: 'm-camp' },
        stageIndex: 2,
        stageOutputs: {
          market_research: { marketReport: { marketContext: { recommendedCampaignAngle: 'Promo' } } },
          create_offer_draft: {},
        },
        artifactRefs: [],
        status: 'running',
      },
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe('failed');
    expect(result.error?.code).toBe('required_artifact_missing');
    expect(result.error?.message).toMatch(/offerDraft/);
  });

  it('campaign_package_factory_v1 completes through approval with artifact', async () => {
    dispatchTool.mockImplementation(async (toolName) => {
      /* @pure-transform test mock — no IO */
      if (toolName === 'market_research') {
        return {
          status: 'ok',
          output: {
            marketReport: { marketContext: { recommendedCampaignAngle: 'Summer promo' } },
          },
        };
      }
      if (toolName === 'create_offer_draft') {
        return {
          status: 'ok',
          output: {
            offerDraft: { title: 'Summer Offer', offerCopy: 'Fresh deals', cta: 'Visit' },
          },
        };
      }
      if (toolName === 'package_campaign_artifact') {
        return {
          status: 'ok',
          output: {
            artifact: {
              type: 'campaign',
              artifactType: 'campaign_package',
              status: 'ready',
              url: 'https://cdn.example.com/campaign.pkg',
            },
          },
        };
      }
      return { status: 'failed', error: { message: 'unknown tool' } };
    });

    const { runFactoryExecution } = await import('./factoryRuntimeExecutor.js');
    const paused = await runFactoryExecution({
      factoryId: 'campaign_package_factory_v1',
      missionId: 'm-camp-full',
      userId: 'u-1',
      intent: 'create campaign package',
      context: { storeId: 'store-1' },
    });

    expect(paused.status).toBe('awaiting_factory_approval');
    expect(paused.plan?.title).toBe('Summer Offer');

    const completed = await runFactoryExecution({
      factoryId: 'campaign_package_factory_v1',
      missionId: 'm-camp-full',
      userId: 'u-1',
      intent: 'create campaign package',
      context: { storeId: 'store-1' },
      resumeState: {
        ...paused,
        executionId: paused.executionId ?? 'exec-camp-full',
        stageIndex: 2,
        status: 'running',
        resumeFromApproval: true,
        resumedApprovalStageId: 'approval',
        context: { storeId: 'store-1', missionId: 'm-camp-full' },
      },
    });

    expect(completed.status).toBe('completed');
    expect(completed.artifact?.artifactId).toBeTruthy();
    expect(registerGeneratedArtifactV1).toHaveBeenCalledWith(
      expect.objectContaining({ artifactType: 'campaign_package' }),
    );
  });

  it('fails closed when required narration post-production fails', async () => {
    dispatchTool.mockImplementation(async (toolName) => {
      /* @pure-transform test mock — no IO */
      if (toolName === 'video_generate_multimodal') {
        return { status: 'ok', output: { videoUrl: 'https://cdn.example.com/silent.mp4' } };
      }
      if (toolName === 'video_post_production') {
        return {
          status: 'failed',
          error: { code: 'VIDEO_REQUIRED_AUDIO_MISSING', message: 'Required narration could not be added' },
        };
      }
      return { status: 'failed', error: { message: 'unknown tool' } };
    });

    const { runFactoryExecution } = await import('./factoryRuntimeExecutor.js');
    const result = await runFactoryExecution({
      factoryId: 'creative_asset_factory_v1',
      missionId: 'm-audio-fail',
      userId: 'u-1',
      intent: 'Create a promo video',
      context: { storeId: 'store-1' },
      resumeState: {
        executionId: 'exec-audio-fail',
        factoryId: 'creative_asset_factory_v1',
        missionId: 'm-audio-fail',
        userId: 'u-1',
        intent: 'Create a promo video',
        context: { storeId: 'store-1', missionId: 'm-audio-fail' },
        stageIndex: 1,
        stageOutputs: {
          creative_plan: { plan: { script: 'Welcome to our store', audio: { voiceoverEnabled: true } } },
        },
        artifactRefs: [],
        status: 'running',
        resumeFromApproval: true,
        resumedApprovalStageId: 'approval',
      },
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe('failed');
    expect(result.error?.code).toBe('VIDEO_REQUIRED_AUDIO_MISSING');
    expect(result.stageId).toBe('video_post_production');
  });
});
