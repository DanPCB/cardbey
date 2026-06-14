import { describe, it, expect } from 'vitest';
import { buildSceneBindings } from './creativeFactoryV4SceneBinding.js';

describe('creativeFactoryV4SceneBinding', () => {
  it('binds scenes from plan with asset refs', () => {
    const bindings = buildSceneBindings({
      scriptDraft: { voiceoverCopy: 'Hello. World.', hook: 'Hi' },
      videoPlan: {
        style: 'promotional',
        scenes: [
          { id: 1, shot: 'Storefront', durationSec: 5 },
          { id: 2, shot: 'Product', durationSec: 8 },
        ],
      },
      researchBrief: { recommendedTone: 'warm', offerAngle: 'Summer promo' },
      assetCandidates: [{ assetId: 'hero-1', url: 'https://example.com/h.jpg', usageRole: 'hero' }],
    });
    expect(bindings).toHaveLength(2);
    expect(bindings[0].sceneId).toBe('1');
    expect(bindings[0].visualPrompt).toMatch(/promotional/);
    expect(bindings[0].selectedAssetRefs.length).toBeGreaterThan(0);
  });

  it('falls back to prompt-only binding when no assets', () => {
    const bindings = buildSceneBindings({
      scriptDraft: { hook: 'Fresh bread daily' },
      researchBrief: { offerAngle: 'Daily bakes' },
      assetCandidates: [],
    });
    expect(bindings).toHaveLength(1);
    expect(bindings[0].selectedAssetRefs).toEqual([]);
    expect(bindings[0].visualPrompt).toBeTruthy();
  });
});
