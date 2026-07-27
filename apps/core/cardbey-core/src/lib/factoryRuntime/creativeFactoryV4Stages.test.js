import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../artifacts/generatedArtifactAuthority.js', () => ({
  registerGeneratedArtifactV1: vi.fn().mockImplementation(async (input) => ({
    ...input,
    status: 'ready',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  })),
}));

vi.mock('../video/burnSubtitlesIntoVideo.js', () => ({
  burnSubtitlesIntoVideo: vi.fn().mockResolvedValue({ ok: false, error: 'burn_failed' }),
}));

vi.mock('./creativeFactoryV3Stages.js', () => ({
  runMusicSelectionStage: vi.fn().mockResolvedValue({
    ok: true,
    output: { musicSelection: { selectionId: 'm-1', trackName: 'Test', fallback: true } },
  }),
}));

describe('creativeFactoryV4Stages governed publish', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('subtitle burn falls back to sidecar only', async () => {
    const { runCreativeFactoryV4BuiltinStage } = await import('./creativeFactoryV4Stages.js');
    const state = {
      factoryId: 'creative_asset_factory_v4',
      missionId: 'm-v4',
      userId: 'u-1',
      stageOutputs: {
        script: { scriptDraft: { voiceoverCopy: 'Hello world' } },
        video_plan: { videoPlan: { scenes: [{ durationSec: 10 }] } },
        multi_scene_render: { videoUrl: '/uploads/media/v.mp4', localPath: null },
      },
    };
    const result = await runCreativeFactoryV4BuiltinStage(
      { stageId: 'subtitle_burn_optional' },
      state,
      {},
      {},
    );
    expect(result.ok).toBe(true);
    expect(result.output.subtitleArtifact).toBeTruthy();
    expect(result.output.burnWarning).toBeTruthy();
  });

  it('executeGovernedFactoryPublish rejects before final approval', async () => {
    const { executeGovernedFactoryPublish } = await import('./creativeFactoryV4Stages.js');
    const result = await executeGovernedFactoryPublish({
      missionId: 'm-v4',
      userId: 'u-1',
      target: 'store',
      factoryExecution: {
        status: 'awaiting_final_asset_approval',
        stageOutputs: {
          publish_handoff: {
            publishOptions: [{ id: 'store', action: 'publish_to_store', available: true, proposedAction: 'publish' }],
          },
        },
      },
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('final_approval_required');
  });
});
