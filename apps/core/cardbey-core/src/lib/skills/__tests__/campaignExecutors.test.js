import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../services/media/VideoSearchService.js', () => ({
  default: {
    searchAllSources: vi.fn(),
  },
}));

import VideoSearchService from '../../../services/media/VideoSearchService.js';
import { execute as createCampaignBrief } from '../../toolExecutors/campaign/create_campaign_brief.js';
import { execute as generateCampaignCopy } from '../../toolExecutors/campaign/generate_campaign_copy.js';
import { execute as qaCampaignPackage } from '../../toolExecutors/campaign/qa_campaign_package.js';
import { execute as packageCampaignArtifact } from '../../toolExecutors/campaign/package_campaign_artifact.js';
import { execute as generateCampaignGraphics } from '../../toolExecutors/campaign/generate_campaign_graphics.js';

describe('campaign executors', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('create_campaign_brief returns brief with all fields', async () => {
    const result = await createCampaignBrief({
      storeId: 'store-1',
      objective: '20% off pastries',
      targetAudience: 'morning commuters',
      offer: '20% off',
      duration: '14 days',
      tone: 'warm',
    });

    expect(result.status).toBe('ok');
    expect(result.output?.ok).toBe(true);
    expect(result.output?.brief).toMatchObject({
      storeId: 'store-1',
      objective: '20% off pastries',
      targetAudience: 'morning commuters',
      offer: '20% off',
      duration: '14 days',
      tone: 'warm',
    });
    expect(result.output?.brief?.id).toBeTruthy();
    expect(result.output?.brief?.createdAt).toBeTruthy();
  });

  it('generate_campaign_copy returns headline, cta, and platform variants', async () => {
    const result = await generateCampaignCopy({
      storeId: 'store-1',
      brief: {
        objective: 'Summer sale',
        offer: '20% off',
        targetAudience: 'locals',
        tone: 'friendly',
      },
      platforms: ['instagram', 'facebook'],
    });

    expect(result.status).toBe('ok');
    expect(result.output?.copy?.headline).toContain('Summer sale');
    expect(result.output?.copy?.cta).toBeTruthy();
    expect(result.output?.copy?.platformVariants?.instagram).toBeTruthy();
    expect(result.output?.copy?.platformVariants?.facebook).toBeTruthy();
  });

  it('qa_campaign_package passes when brief and copy are complete', async () => {
    const result = await qaCampaignPackage({
      brief: { objective: 'Launch sale' },
      graphics: [{ id: 'g1', url: 'https://example.com/a.jpg' }],
      copy: { headline: 'Big sale', cta: 'Shop now' },
    });

    expect(result.status).toBe('ok');
    expect(result.output?.passed).toBe(true);
    expect(result.output?.issues).toEqual([]);
  });

  it('qa_campaign_package fails when headline is empty', async () => {
    const result = await qaCampaignPackage({
      brief: { objective: 'Launch sale' },
      graphics: [{ id: 'g1' }],
      copy: { headline: '', cta: 'Shop now' },
    });

    expect(result.status).toBe('ok');
    expect(result.output?.passed).toBe(false);
    expect(result.output?.issues).toContain('copy.headline is empty');
  });

  it('package_campaign_artifact bundles all inputs into artifact', async () => {
    const brief = { id: 'b1', objective: 'Sale' };
    const graphics = [{ id: 'g1' }];
    const copy = { headline: 'Sale on now', cta: 'Buy' };

    const result = await packageCampaignArtifact({
      storeId: 'store-1',
      brief,
      graphics,
      copy,
      slideshowId: 'slide-1',
    });

    expect(result.status).toBe('ok');
    expect(result.output?.artifact).toMatchObject({
      storeId: 'store-1',
      type: 'campaign',
      brief,
      graphics,
      copy,
      slideshowId: 'slide-1',
      status: 'ready',
    });
    expect(result.output?.artifact?.id).toBeTruthy();
    expect(result.output?.artifact?.createdAt).toBeTruthy();
  });

  it('generate_campaign_graphics uses VideoSearchService results', async () => {
    VideoSearchService.searchAllSources.mockResolvedValue({
      results: [
        { id: 'v1', url: 'https://cdn.example.com/1.mp4', source: 'mixkit' },
      ],
      bySource: { mixkit: 1 },
      skipped: [],
      errors: {},
    });

    const result = await generateCampaignGraphics({
      storeId: 'store-1',
      brief: { objective: 'coffee promo' },
      mediaType: 'photo',
    });

    expect(VideoSearchService.searchAllSources).toHaveBeenCalledWith('coffee promo', {
      perPage: 8,
    });
    expect(result.status).toBe('ok');
    expect(result.output?.graphics).toHaveLength(1);
    expect(result.output?.graphics[0]).toMatchObject({
      id: 'v1',
      type: 'photo',
      url: 'https://cdn.example.com/1.mp4',
      source: 'mixkit',
    });
  });
});
