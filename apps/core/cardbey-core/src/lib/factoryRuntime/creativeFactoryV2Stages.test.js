import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  buildDeterministicResearchBrief,
  buildTemplateScriptDraft,
  dedupeAssetCandidates,
  mapMarketReportToResearchBrief,
  normalizeScriptDraft,
} from './creativeFactoryV2Stages.js';
import { isCreativeFactoryV2Enabled, resolveCreativeFactoryId } from './factoryIntentRouter.js';
import { CREATIVE_ASSET_FACTORY_V1_ID, CREATIVE_ASSET_FACTORY_V2_ID } from './factoryConstants.js';

describe('creativeFactoryV2Stages', () => {
  it('research fallback is deterministic when market report missing', () => {
    const brief = buildDeterministicResearchBrief(
      { storeName: 'Bakery Co', category: 'Bakery', products: [{ name: 'Sourdough' }] },
      'summer promo video',
    );
    expect(brief.audience).toBeTruthy();
    expect(brief.offerAngle).toBeTruthy();
    expect(brief.seasonalHook).toMatch(/summer|Summer|seasonal|community/i);
    expect(brief.productServiceFocus).toBe('Sourdough');
    expect(brief.recommendedTone).toBeTruthy();
    expect(brief.visualDirection).toBeTruthy();
  });

  it('maps market report into researchBrief contract', () => {
    const brief = mapMarketReportToResearchBrief(
      {
        targetAudience: 'Young professionals',
        marketContext: { recommendedCampaignAngle: 'Fresh daily bakes', seasonalOpportunity: 'Winter comfort' },
        topProductsToPromote: [{ productName: 'Croissant' }],
      },
      { storeName: 'Cafe', products: [] },
      'promo',
    );
    expect(brief.audience).toBe('Young professionals');
    expect(brief.offerAngle).toBe('Fresh daily bakes');
    expect(brief.productServiceFocus).toBe('Croissant');
  });

  it('script template fallback includes hook, scenes, CTA', () => {
    const draft = buildTemplateScriptDraft(
      { storeName: 'Tea House' },
      { offerAngle: 'Afternoon tea', productServiceFocus: 'Matcha', seasonalHook: 'Cozy autumn' },
      'make a video',
    );
    expect(draft.hook).toContain('Tea House');
    expect(draft.scenes).toHaveLength(3);
    expect(draft.voiceoverCopy).toBeTruthy();
    expect(draft.cta).toContain('Tea House');
    expect(draft.onScreenText.length).toBeGreaterThan(0);
  });

  it('normalizes LLM script draft shape', () => {
    const draft = normalizeScriptDraft(
      {
        hook: 'Hello world',
        scenes: [
          { shot: 'A', durationSec: 3 },
          { shot: 'B', durationSec: 10 },
          { shot: 'C', durationSec: 5 },
        ],
        voiceoverCopy: 'Full voiceover',
        cta: 'Visit now',
        onScreenText: ['Hello'],
      },
      'Store',
    );
    expect(draft.scenes).toHaveLength(3);
    expect(draft.hook).toBe('Hello world');
  });

  it('dedupes asset candidates by url/assetId', () => {
    const out = dedupeAssetCandidates([
      { url: 'https://a/1', assetId: 'a', usageRole: 'hero' },
      { url: 'https://a/1', assetId: 'a', usageRole: 'hero' },
      { url: 'https://b/2', assetId: 'b', usageRole: 'product' },
    ]);
    expect(out).toHaveLength(2);
    expect(out[0].usageRole).toBe('hero');
  });
});

describe('factory V2 routing flags', () => {
  const prevV1 = process.env.ENABLE_CREATIVE_FACTORY_V1;
  const prevV2 = process.env.ENABLE_CREATIVE_FACTORY_V2;
  const prevV3 = process.env.ENABLE_CREATIVE_FACTORY_V3;
  const prevV4 = process.env.ENABLE_CREATIVE_FACTORY_V4;

  beforeEach(() => {
    delete process.env.ENABLE_CREATIVE_FACTORY_V2;
    delete process.env.ENABLE_CREATIVE_FACTORY_V3;
    delete process.env.ENABLE_CREATIVE_FACTORY_V4;
    process.env.ENABLE_CREATIVE_FACTORY_V1 = 'true';
  });

  afterEach(() => {
    if (prevV1 === undefined) delete process.env.ENABLE_CREATIVE_FACTORY_V1;
    else process.env.ENABLE_CREATIVE_FACTORY_V1 = prevV1;
    if (prevV2 === undefined) delete process.env.ENABLE_CREATIVE_FACTORY_V2;
    else process.env.ENABLE_CREATIVE_FACTORY_V2 = prevV2;
    if (prevV3 === undefined) delete process.env.ENABLE_CREATIVE_FACTORY_V3;
    else process.env.ENABLE_CREATIVE_FACTORY_V3 = prevV3;
    if (prevV4 === undefined) delete process.env.ENABLE_CREATIVE_FACTORY_V4;
    else process.env.ENABLE_CREATIVE_FACTORY_V4 = prevV4;
  });

  it('defaults to V1 when V2 flag off', () => {
    expect(isCreativeFactoryV2Enabled()).toBe(false);
    expect(resolveCreativeFactoryId()).toBe(CREATIVE_ASSET_FACTORY_V1_ID);
  });

  it('selects V2 when flag on', () => {
    process.env.ENABLE_CREATIVE_FACTORY_V2 = 'true';
    expect(resolveCreativeFactoryId()).toBe(CREATIVE_ASSET_FACTORY_V2_ID);
  });
});
