/**
 * Population pipeline domain tests (no DB).
 */

import { describe, it, expect } from 'vitest';
import {
  ASSET_STATUS,
  RIGHTS_STATUS,
  canPublishAsset,
  PIPELINE_STAGE,
} from '../universalAssetTypes.js';
import {
  runPipelineStage,
  stagePublish,
  stageRights,
  STAGE_HANDLERS,
} from '../populationPipeline.js';
import { publishUniversalAsset } from '../universalAssetService.js';
import { computeDiscoverySignals, SIGNAL_WEIGHTS } from '../discoveryScoreService.js';

describe('populationPipeline', () => {
  const baseAsset = {
    id: 'asset_1',
    title: 'Test Asset',
    type: 'image',
    provider: 'seed',
    ownerId: 'owner_1',
    rightsStatus: RIGHTS_STATUS.CLEARED,
    status: ASSET_STATUS.MODERATION,
    qualityScore: 80,
    createdAt: new Date(),
  };

  it('unknown rights never publish', async () => {
    const blocked = { ...baseAsset, rightsStatus: RIGHTS_STATUS.UNKNOWN, ownerId: 'owner_1' };
    expect(canPublishAsset(blocked)).toBe(false);

    const result = await stagePublish(blocked);
    expect(result.ok).toBe(false);
    expect(result.error).toBe('rights_not_cleared');

    const prisma = {
      universalAsset: {
        findUnique: async () => blocked,
        update: async () => {
          throw new Error('should not publish');
        },
      },
    };
    const pub = await publishUniversalAsset(prisma, blocked.id);
    expect(pub.ok).toBe(false);
    expect(pub.error).toBe('publish_blocked');
    expect(pub.reason).toBe('rights_not_cleared');
  });

  it('unknown ownership never publish', async () => {
    const blocked = { ...baseAsset, rightsStatus: RIGHTS_STATUS.CLEARED, ownerId: null };
    expect(canPublishAsset(blocked)).toBe(false);

    const result = await stagePublish(blocked);
    expect(result.ok).toBe(false);
    expect(result.error).toBe('owner_missing');

    const prisma = {
      universalAsset: {
        findUnique: async () => blocked,
        update: async () => {
          throw new Error('should not publish');
        },
      },
    };
    const pub = await publishUniversalAsset(prisma, blocked.id);
    expect(pub.ok).toBe(false);
    expect(pub.reason).toBe('owner_missing');
  });

  it('allows publish when rights cleared and owner present', async () => {
    const allowed = { ...baseAsset, rightsStatus: RIGHTS_STATUS.CLEARED, ownerId: 'owner_1' };
    const result = await stagePublish(allowed);
    expect(result.ok).toBe(true);
    expect(result.asset.status).toBe(ASSET_STATUS.PUBLISHED);
  });

  it('pipeline stages are isolated handlers', async () => {
    expect(Object.keys(STAGE_HANDLERS).sort()).toEqual(
      Object.values(PIPELINE_STAGE).sort(),
    );

    const discovered = await runPipelineStage(PIPELINE_STAGE.DISCOVER, { title: 'A' });
    expect(discovered.ok).toBe(true);
    expect(discovered.asset.status).toBe(ASSET_STATUS.DISCOVERED);

    const normalized = await runPipelineStage(PIPELINE_STAGE.NORMALIZE, discovered.asset);
    expect(normalized.ok).toBe(true);
    expect(normalized.asset.status).toBe(ASSET_STATUS.NORMALIZED);

    const classified = await runPipelineStage(PIPELINE_STAGE.CLASSIFY, normalized.asset);
    expect(classified.ok).toBe(true);
    expect(classified.asset.status).toBe(ASSET_STATUS.CLASSIFIED);

    const rights = await stageRights({ ...classified.asset, rightsStatus: RIGHTS_STATUS.UNKNOWN });
    expect(rights.ok).toBe(true);
    expect(rights.asset.status).toBe(ASSET_STATUS.RIGHTS_PENDING);
  });

  it('score uses multiple signals not views-only', () => {
    const viewsOnly = computeDiscoverySignals(baseAsset, { viewCount: 10000 });
    const balanced = computeDiscoverySignals(baseAsset, {
      viewCount: 10,
      saveCount: 50,
      shareCount: 20,
      relationCount: 15,
      purchaseCount: 5,
    });

    expect(viewsOnly.signals.note).toBe('multi_signal_not_views_only');
    expect(Object.keys(SIGNAL_WEIGHTS).length).toBeGreaterThan(1);

    const viewContribution = viewsOnly.discoveryScore;
    const noViews = computeDiscoverySignals(baseAsset, { viewCount: 0, saveCount: 50, shareCount: 20 });
    expect(noViews.discoveryScore).toBeGreaterThan(0);
    expect(balanced.discoveryScore).not.toBe(viewContribution);
    expect(balanced.trustScore).toBeGreaterThan(0);
    expect(balanced.qualityScore).toBeGreaterThan(0);
  });
});
