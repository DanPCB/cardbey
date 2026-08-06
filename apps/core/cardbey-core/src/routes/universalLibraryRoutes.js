/**
 * Universal Library API — population, taxonomy, discovery.
 * Mount: /api/universal-library
 */

import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { optionalAuth, requireAuth, requireAdmin } from '../middleware/auth.js';
import { isPlatformAdmin } from '../lib/authorization.js';
import { Features } from '../config/features.js';
import {
  createUniversalAsset,
  getUniversalAsset,
  listUniversalAssets,
  publishUniversalAsset,
} from '../services/universalLibrary/universalAssetService.js';
import { runAndPersistPipelineStage, getPipelineSummary } from '../services/universalLibrary/populationPipeline.js';
import {
  enqueuePopulationJob,
  listPopulationJobs,
  retryPopulationJob,
  runNextPopulationJob,
} from '../services/universalLibrary/populationJobService.js';
import {
  listTaxonomyCategories,
  listTaxonomyEntities,
  createEntityRelation,
} from '../services/universalLibrary/taxonomyService.js';
import {
  getDiscoveryFeed,
  recalculateDiscoveryScore,
} from '../services/universalLibrary/discoveryScoreService.js';
import { seedCuratedCatalog } from '../services/universalLibrary/seedProvider.js';
import { toPublicAssetList, toPublicAssetView } from '../services/universalLibrary/publicAssetView.js';
import { PIPELINE_STAGE } from '../services/universalLibrary/universalAssetTypes.js';

const router = Router();

const FULL_PIPELINE = [
  PIPELINE_STAGE.DISCOVER,
  PIPELINE_STAGE.NORMALIZE,
  PIPELINE_STAGE.CLASSIFY,
  PIPELINE_STAGE.RIGHTS,
  PIPELINE_STAGE.DEDUPE,
  PIPELINE_STAGE.MODERATION,
  PIPELINE_STAGE.PUBLISH,
];

function failClosed(res, code = 'feature_disabled') {
  return res.status(404).json({ ok: false, error: code });
}

function userIdFromReq(req) {
  return req.user?.id ?? req.userId ?? null;
}

function requireUniversalLibraryV1(_req, res, next) {
  if (!Features.universalLibrary?.v1) return failClosed(res);
  return next();
}

function requirePopulationV1(_req, res, next) {
  if (!Features.universalLibrary?.populationV1) return failClosed(res, 'population_disabled');
  return next();
}

function requireTaxonomyV1(_req, res, next) {
  if (!Features.universalLibrary?.taxonomyV1) return failClosed(res, 'taxonomy_disabled');
  return next();
}

function requireDiscoveryV1(_req, res, next) {
  if (!Features.universalLibrary?.discoveryV1) return failClosed(res, 'discovery_disabled');
  return next();
}

function requireWriteAccess(req, res, next) {
  if (isPlatformAdmin(req.user)) return next();
  if (Features.universalLibrary?.populationV1) return next();
  return res.status(403).json({ ok: false, error: 'forbidden' });
}

router.use(requireUniversalLibraryV1);

/** GET /assets */
router.get('/assets', optionalAuth, async (req, res, next) => {
  try {
    const isAdmin = isPlatformAdmin(req.user);
    const result = await listUniversalAssets(prisma, {
      status: req.query.status,
      provider: req.query.provider,
      type: req.query.type,
      limit: req.query.limit,
      offset: req.query.offset,
      publishedOnly: !isAdmin,
    });
    const items = toPublicAssetList(result.items, { admin: isAdmin });
    return res.json({
      ...result,
      items,
      assets: items, // dashboard alias
    });
  } catch (err) {
    next(err);
  }
});

/** GET /assets/:id */
router.get('/assets/:id', optionalAuth, async (req, res, next) => {
  try {
    const result = await getUniversalAsset(prisma, req.params.id);
    if (!result.ok) return res.status(result.status ?? 404).json(result);
    const isAdmin = isPlatformAdmin(req.user);
    if (!isAdmin && result.asset.status !== 'PUBLISHED') {
      return res.status(404).json({ ok: false, error: 'not_found' });
    }
    return res.json({
      ...result,
      asset: toPublicAssetView(result.asset, { admin: isAdmin }),
    });
  } catch (err) {
    next(err);
  }
});

/** POST /assets */
router.post('/assets', requireAuth, requireWriteAccess, requirePopulationV1, async (req, res, next) => {
  try {
    const result = await createUniversalAsset(prisma, {
      ...req.body,
      ownerId: req.body?.ownerId ?? userIdFromReq(req),
    });
    if (!result.ok) return res.status(result.status ?? 400).json(result);
    return res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

/** POST /assets/:id/pipeline/:stage */
router.post(
  '/assets/:id/pipeline/:stage',
  requireAuth,
  requireWriteAccess,
  requirePopulationV1,
  async (req, res, next) => {
    try {
      const result = await runAndPersistPipelineStage(
        prisma,
        req.params.id,
        req.params.stage,
        req.body ?? {},
      );
      if (!result.ok) return res.status(result.status ?? 400).json(result);
      return res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

/** POST /assets/:id/publish */
router.post(
  '/assets/:id/publish',
  requireAuth,
  requireWriteAccess,
  requirePopulationV1,
  async (req, res, next) => {
    try {
      const result = await publishUniversalAsset(prisma, req.params.id);
      if (!result.ok) return res.status(result.status ?? 400).json(result);
      return res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

/** GET /jobs */
router.get('/jobs', requireAuth, requireWriteAccess, requirePopulationV1, async (req, res, next) => {
  try {
    const result = await listPopulationJobs(prisma, {
      status: req.query.status,
      kind: req.query.kind,
      limit: req.query.limit,
      offset: req.query.offset,
    });
    return res.json(result);
  } catch (err) {
    next(err);
  }
});

/** POST /jobs */
router.post('/jobs', requireAuth, requireWriteAccess, requirePopulationV1, async (req, res, next) => {
  try {
    const result = await enqueuePopulationJob(prisma, req.body ?? {});
    return res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

/** POST /jobs/:id/retry */
router.post(
  '/jobs/:id/retry',
  requireAuth,
  requireWriteAccess,
  requirePopulationV1,
  async (req, res, next) => {
    try {
      const result = await retryPopulationJob(prisma, req.params.id);
      if (!result.ok) return res.status(result.status ?? 400).json(result);
      return res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

/** POST /jobs/run-next */
router.post(
  '/jobs/run-next',
  requireAuth,
  requireWriteAccess,
  requirePopulationV1,
  async (req, res, next) => {
    try {
      const result = await runNextPopulationJob(prisma);
      return res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

/** GET /taxonomy/categories */
router.get('/taxonomy/categories', optionalAuth, requireTaxonomyV1, async (req, res, next) => {
  try {
    const result = await listTaxonomyCategories(prisma);
    return res.json(result);
  } catch (err) {
    next(err);
  }
});

/** GET /taxonomy/entities */
router.get('/taxonomy/entities', optionalAuth, requireTaxonomyV1, async (req, res, next) => {
  try {
    const result = await listTaxonomyEntities(prisma, {
      kind: req.query.kind,
      slug: req.query.slug,
      limit: req.query.limit,
      offset: req.query.offset,
    });
    return res.json(result);
  } catch (err) {
    next(err);
  }
});

/** POST /taxonomy/relations */
router.post(
  '/taxonomy/relations',
  requireAuth,
  requireWriteAccess,
  requireTaxonomyV1,
  async (req, res, next) => {
    try {
      const result = await createEntityRelation(prisma, req.body ?? {});
      if (!result.ok) return res.status(result.status ?? 400).json(result);
      return res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  },
);

/** GET /discovery/feed */
router.get('/discovery/feed', optionalAuth, requireDiscoveryV1, async (req, res, next) => {
  try {
    const result = await getDiscoveryFeed(prisma, {
      section: req.query.section,
      limit: req.query.limit,
    });
    return res.json(result);
  } catch (err) {
    next(err);
  }
});

/** POST /discovery/recalculate/:assetId */
router.post(
  '/discovery/recalculate/:assetId',
  requireAuth,
  requireWriteAccess,
  requireDiscoveryV1,
  async (req, res, next) => {
    try {
      const result = await recalculateDiscoveryScore(prisma, req.params.assetId, req.body ?? {});
      if (!result.ok) return res.status(result.status ?? 400).json(result);
      return res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

/** GET /admin/pipeline-summary */
router.get('/admin/pipeline-summary', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const result = await getPipelineSummary(prisma);
    const by = result.assetsByStatus || {};
    const jobs = result.jobsByStatus || {};
    const rightsIssues = await prisma.universalAsset.count({
      where: { rightsStatus: { in: ['UNKNOWN', 'RESTRICTED'] } },
    });
    return res.json({
      ...result,
      summary: {
        totalAssets: Object.values(by).reduce((a, b) => a + Number(b || 0), 0),
        published: Number(by.PUBLISHED || 0),
        failed: Number(by.FAILED || 0),
        duplicates: Number(by.DUPLICATE || 0),
        rightsIssues,
        jobsQueued: Number(jobs.QUEUED || 0),
        jobsFailed: Number(jobs.FAILED || 0),
        jobsCompleted: Number(jobs.COMPLETED || 0),
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /admin/seed-run — Core-authoritative seed + pipeline + publish.
 * Dashboard may request this; Core owns rights, dedupe, and publication.
 */
router.post(
  '/admin/seed-run',
  requireAuth,
  requireAdmin,
  requirePopulationV1,
  async (req, res, next) => {
    try {
      const seeded = await seedCuratedCatalog(prisma, {
        ownerId: req.body?.ownerId || 'cardbey_platform',
        skipExisting: req.body?.skipExisting !== false,
      });

      const pipelineResults = [];
      for (const row of seeded.results || []) {
        if (!row.created || !row.assetId) {
          pipelineResults.push({ assetId: row.assetId, skipped: true, reason: row.skipped ? 'exists' : row.error });
          continue;
        }
        let last = null;
        for (const stage of FULL_PIPELINE) {
          last = await runAndPersistPipelineStage(prisma, row.assetId, stage, {});
          if (!last?.ok && stage !== PIPELINE_STAGE.RIGHTS) break;
        }
        pipelineResults.push({
          assetId: row.assetId,
          ok: Boolean(last?.ok),
          status: last?.asset?.status,
          error: last?.error,
        });
      }

      const summary = await getPipelineSummary(prisma);
      return res.json({
        ok: true,
        seeded,
        pipelineResults,
        summary,
        authority: 'core',
      });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
