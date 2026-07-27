import { describe, it, expect, vi, beforeEach } from 'vitest';

const registerGeneratedArtifactV1 = vi.fn();

vi.mock('../artifacts/generatedArtifactAuthority.js', () => ({
  registerGeneratedArtifactV1: (...args) => registerGeneratedArtifactV1(...args),
}));

vi.mock('../prisma.js', () => ({
  getPrismaClient: () => ({
    miMusicTrack: {
      findMany: vi.fn().mockResolvedValue([
        {
          key: 'cozy_piano',
          name: 'Cozy Piano',
          category: 'warm',
          audioUrl: 'https://cdn.example.com/warm.mp3',
          duration: 120,
        },
      ]),
    },
  }),
}));

vi.mock('../video/audio/musicBed.js', () => ({
  fetchMusicBedIfConfigured: vi.fn().mockResolvedValue({ ok: false, error: 'music_not_configured' }),
}));

describe('creativeFactoryV3Stages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    registerGeneratedArtifactV1.mockImplementation(async (input) => ({
      ...input,
      status: input.status ?? 'ready',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
  });

  it('persists subtitle artifact and skips duplicate generation', async () => {
    const { runSubtitleStage } = await import('./creativeFactoryV3Stages.js');
    const state = {
      factoryId: 'creative_asset_factory_v3',
      missionId: 'm-v3',
      userId: 'u-1',
      stageOutputs: {
        script: { scriptDraft: { voiceoverCopy: 'Hello there.' } },
        video_plan: { videoPlan: { script: 'Hello there.', scenes: [{ durationSec: 10 }] } },
        execute: { videoUrl: 'https://cdn.example.com/v.mp4' },
      },
    };

    const first = await runSubtitleStage(state, {});
    expect(first.ok).toBe(true);
    expect(registerGeneratedArtifactV1).toHaveBeenCalledWith(
      expect.objectContaining({ artifactType: 'generated_subtitle' }),
    );

    const withExisting = {
      ...state,
      stageOutputs: {
        ...state.stageOutputs,
        subtitle: first.output,
      },
    };
    const second = await runSubtitleStage(withExisting, {});
    expect(second.ok).toBe(true);
    expect(registerGeneratedArtifactV1).toHaveBeenCalledTimes(1);
  });

  it('selects music with silence fallback when catalog empty', async () => {
    const { runMusicSelectionStage } = await import('./creativeFactoryV3Stages.js');
    const state = {
      factoryId: 'creative_asset_factory_v3',
      missionId: 'm-v3',
      userId: 'u-1',
      stageOutputs: {
        research: { researchBrief: { recommendedTone: 'warm' } },
        video_plan: { videoPlan: { style: 'promotional' } },
      },
    };
    const result = await runMusicSelectionStage(state, {});
    expect(result.ok).toBe(true);
    expect(result.output.musicSelection.trackUrl).toBeTruthy();
  });

  it('builds publish handoff options without auto-publish', async () => {
    const { runPublishHandoffStage } = await import('./creativeFactoryV3Stages.js');
    const state = {
      factoryId: 'creative_asset_factory_v3',
      missionId: 'm-v3',
      userId: 'u-1',
      context: { storeId: 'store-1' },
      stageOutputs: {
        execute: { videoUrl: 'https://cdn.example.com/v.mp4', artifact: { artifactId: 'v-1' } },
        subtitle: { subtitleArtifact: { artifactId: 'sub-1' } },
        music_selection: { musicSelection: { selectionId: 'm-1' } },
      },
    };
    const result = await runPublishHandoffStage(state, {});
    expect(result.output.publishOptions.length).toBeGreaterThanOrEqual(4);
    expect(result.output.handoffNote).toMatch(/no automatic/i);
  });
});
