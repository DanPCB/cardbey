/**
 * Content population pipeline — isolated stages.
 * discover → normalize → classify → rights → dedupe → moderation → publish
 */

import {
  ASSET_STATUS,
  PIPELINE_STAGE,
  RIGHTS_STATUS,
  canPublishAsset,
  isKnownPipelineStage,
  normalizeStringArray,
} from './universalAssetTypes.js';
import { publishUniversalAsset } from './universalAssetService.js';

/**
 * @param {object} asset
 * @param {object} [input]
 */
export async function stageDiscover(asset, input = {}) {
  if (!asset?.title) {
    return { ok: false, asset, error: 'title_required' };
  }
  return {
    ok: true,
    asset: {
      ...asset,
      status: ASSET_STATUS.DISCOVERED,
      provider: asset.provider || input.provider || 'seed',
    },
  };
}

/**
 * @param {object} asset
 */
export async function stageNormalize(asset) {
  if (!asset?.title) {
    return { ok: false, asset, error: 'title_required' };
  }
  const title = String(asset.title).trim();
  const type = String(asset.type ?? 'other').toLowerCase();
  return {
    ok: true,
    asset: {
      ...asset,
      title,
      type,
      description: asset.description ? String(asset.description).trim() : null,
      categories: normalizeStringArray(asset.categories),
      tags: normalizeStringArray(asset.tags),
      status: ASSET_STATUS.NORMALIZED,
    },
  };
}

/**
 * @param {object} asset
 */
export async function stageClassify(asset) {
  const categories = normalizeStringArray(asset.categories);
  const tags = normalizeStringArray(asset.tags);
  if (categories.length === 0 && tags.length === 0) {
    return {
      ok: true,
      asset: {
        ...asset,
        categories: ['uncategorized'],
        status: ASSET_STATUS.CLASSIFIED,
      },
    };
  }
  return {
    ok: true,
    asset: {
      ...asset,
      categories,
      tags,
      status: ASSET_STATUS.CLASSIFIED,
    },
  };
}

/**
 * @param {object} asset
 */
export async function stageRights(asset) {
  const rights = String(asset.rightsStatus ?? RIGHTS_STATUS.UNKNOWN).toUpperCase();
  if (rights === RIGHTS_STATUS.UNKNOWN) {
    return {
      ok: true,
      asset: { ...asset, rightsStatus: RIGHTS_STATUS.UNKNOWN, status: ASSET_STATUS.RIGHTS_PENDING },
    };
  }
  if (rights === RIGHTS_STATUS.REJECTED || rights === RIGHTS_STATUS.RESTRICTED) {
    return {
      ok: false,
      asset: { ...asset, status: ASSET_STATUS.REJECTED },
      error: 'rights_blocked',
    };
  }
  return {
    ok: true,
    asset: {
      ...asset,
      rightsStatus: rights,
      status: rights === RIGHTS_STATUS.CLEARED ? asset.status : ASSET_STATUS.RIGHTS_PENDING,
    },
  };
}

/**
 * @param {object} asset
 * @param {object} [context]
 */
export async function stageDedupe(asset, context = {}) {
  const duplicateOfId = context.duplicateOfId ?? asset.duplicateOfId ?? null;
  if (duplicateOfId) {
    return {
      ok: false,
      asset: { ...asset, duplicateOfId, status: ASSET_STATUS.DUPLICATE },
      error: 'duplicate_detected',
    };
  }
  return { ok: true, asset: { ...asset, duplicateOfId: null } };
}

/**
 * @param {object} asset
 * @param {object} [context]
 */
export async function stageModeration(asset, context = {}) {
  const approved = context.approved !== false;
  if (!approved) {
    return {
      ok: false,
      asset: { ...asset, status: ASSET_STATUS.REJECTED },
      error: 'moderation_rejected',
    };
  }
  return { ok: true, asset: { ...asset, status: ASSET_STATUS.MODERATION } };
}

/**
 * @param {object} asset
 */
export async function stagePublish(asset) {
  if (!canPublishAsset(asset)) {
    const reason =
      String(asset.rightsStatus ?? '').toUpperCase() !== RIGHTS_STATUS.CLEARED
        ? 'rights_not_cleared'
        : 'owner_missing';
    return { ok: false, asset, error: reason };
  }
  return {
    ok: true,
    asset: { ...asset, status: ASSET_STATUS.PUBLISHED },
  };
}

const STAGE_HANDLERS = Object.freeze({
  [PIPELINE_STAGE.DISCOVER]: stageDiscover,
  [PIPELINE_STAGE.NORMALIZE]: stageNormalize,
  [PIPELINE_STAGE.CLASSIFY]: stageClassify,
  [PIPELINE_STAGE.RIGHTS]: stageRights,
  [PIPELINE_STAGE.DEDUPE]: stageDedupe,
  [PIPELINE_STAGE.MODERATION]: stageModeration,
  [PIPELINE_STAGE.PUBLISH]: stagePublish,
});

/**
 * Run a single pipeline stage (pure/isolated).
 * @param {string} stage
 * @param {object} asset
 * @param {object} [context]
 */
export async function runPipelineStage(stage, asset, context = {}) {
  const key = String(stage ?? '').toLowerCase();
  if (!isKnownPipelineStage(key)) {
    return { ok: false, asset, error: 'unknown_stage' };
  }
  const handler = STAGE_HANDLERS[key];
  return handler(asset, context);
}

/**
 * Persist stage result to DB.
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} assetId
 * @param {string} stage
 * @param {object} [context]
 */
export async function runAndPersistPipelineStage(prisma, assetId, stage, context = {}) {
  const existing = await prisma.universalAsset.findUnique({ where: { id: assetId } });
  if (!existing) return { ok: false, error: 'not_found', status: 404 };

  const result = await runPipelineStage(stage, existing, context);
  if (!result.ok) {
    if (result.asset?.status && result.asset.status !== existing.status) {
      await prisma.universalAsset.update({
        where: { id: assetId },
        data: {
          status: result.asset.status,
          duplicateOfId: result.asset.duplicateOfId ?? undefined,
          rightsStatus: result.asset.rightsStatus ?? undefined,
        },
      });
    }
    return { ...result, status: 400 };
  }

  if (String(stage).toLowerCase() === PIPELINE_STAGE.PUBLISH) {
    return publishUniversalAsset(prisma, assetId);
  }

  const updated = await prisma.universalAsset.update({
    where: { id: assetId },
    data: {
      title: result.asset.title,
      description: result.asset.description,
      type: result.asset.type,
      categories: result.asset.categories,
      tags: result.asset.tags,
      rightsStatus: result.asset.rightsStatus,
      status: result.asset.status,
      duplicateOfId: result.asset.duplicateOfId,
      provider: result.asset.provider,
    },
  });

  return { ok: true, asset: updated };
}

/**
 * Pipeline summary counts by status (admin).
 * @param {import('@prisma/client').PrismaClient} prisma
 */
export async function getPipelineSummary(prisma) {
  const rows = await prisma.universalAsset.groupBy({
    by: ['status'],
    _count: { _all: true },
  });
  const byStatus = Object.fromEntries(rows.map((r) => [r.status, r._count._all]));
  const jobRows = await prisma.contentPopulationJob.groupBy({
    by: ['status'],
    _count: { _all: true },
  });
  const jobsByStatus = Object.fromEntries(jobRows.map((r) => [r.status, r._count._all]));
  return { ok: true, assetsByStatus: byStatus, jobsByStatus };
}

export { STAGE_HANDLERS, PIPELINE_STAGE };
