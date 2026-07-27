import { describe, it, expect, vi, beforeEach } from 'vitest';

const registerGeneratedArtifactV1 = vi.fn();

vi.mock('../artifacts/generatedArtifactAuthority.js', () => ({
  registerGeneratedArtifactV1: (...args) => registerGeneratedArtifactV1(...args),
}));

vi.mock('../video/concatVideoClips.js', () => ({
  concatVideoClips: vi.fn().mockResolvedValue({
    ok: false,
    error: 'concat_failed',
    recoverable: true,
  }),
}));

describe('creativeFactoryV4MultiSceneRender', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    let n = 0;
    registerGeneratedArtifactV1.mockImplementation(async (input) => ({
      ...input,
      status: input.status ?? 'ready',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      artifactId: input.artifactId ?? `gart-${++n}`,
    }));
  });

  it('persists scene clips and recovers when concat fails', async () => {
    const { runMultiSceneRender } = await import('./creativeFactoryV4MultiSceneRender.js');
    const state = {
      factoryId: 'creative_asset_factory_v4',
      missionId: 'm-v4',
      userId: 'u-1',
      stageOutputs: {
        scene_binding: {
          sceneBindings: [
            { sceneId: '1', visualPrompt: 'Scene one', durationTarget: 5, purpose: 'Hook' },
            { sceneId: '2', visualPrompt: 'Scene two', durationTarget: 5, purpose: 'CTA' },
          ],
        },
      },
    };

    const result = await runMultiSceneRender(state, {}, {
      renderSceneClip: async (binding) => ({
        url: `https://cdn.example.com/${binding.sceneId}.mp4`,
        localPath: `C:/tmp/${binding.sceneId}.mp4`,
        status: 'ready',
      }),
    });

    expect(result.ok).toBe(true);
    expect(result.output.sceneClips).toHaveLength(2);
    expect(result.output.sceneClipRefs).toHaveLength(2);
    expect(result.output.recoverable).toBe(true);
    expect(registerGeneratedArtifactV1).toHaveBeenCalledWith(
      expect.objectContaining({ artifactType: 'generated_scene_clip' }),
    );
  });
});
