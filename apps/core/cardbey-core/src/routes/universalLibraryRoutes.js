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
import { runRichLibrarySeed } from '../services/universalLibrary/seedProvider.js';
import { toPublicAssetList, toPublicAssetView } from '../services/universalLibrary/publicAssetView.js';
import { getJobMetrics } from '../services/universalLibrary/jobMetricsService.js';
import { browseDiscovery } from '../services/universalLibrary/discoveryBrowseService.js';
import { getRelatedAssets, listCollections } from '../services/universalLibrary/collectionService.js';
import { importCardbeyOriginals } from '../services/universalLibrary/cardbeyOriginalsImport.js';
import {
  projectCreatorContentToLibrary,
  withdrawCreatorLibraryProjection,
} from '../services/universalLibrary/creatorLibraryProjection.js';
import {
  auditRealContentReadiness,
  reconcileDevelopmentFixtures,
} from '../services/universalLibrary/reconcileFixtures.js';
import { fixturesEnabled, isDevelopmentFixture, getContentOrigin } from '../services/universalLibrary/contentOrigin.js';
import { JOB_KIND, JOB_STATUS, ASSET_PROVIDER, HOSTING_MODE } from '../services/universalLibrary/universalAssetTypes.js';
import {
  runPexelsLibrarySync,
  isPexelsLibraryConfigured,
  pexelsLibraryEnabled,
} from '../services/universalLibrary/pexelsLibrarySync.js';
import { publishRealCollections } from '../services/universalLibrary/realCollections.js';
import { useUniversalLibraryAsset } from '../services/universalLibrary/libraryUseBridge.js';
import { findResources } from '../services/universalLibrary/findResources.js';
import {
  listFederationProviderStatus,
  testFederationProvider,
} from '../services/universalResourceIntelligence/federationProviderStatus.js';
import { runFederationOpsIntake } from '../services/universalResourceIntelligence/opsIntake.js';

const router = Router();

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
    const includeFixtures =
      isAdmin &&
      (req.query.includeFixtures === 'true' || fixturesEnabled());
    const result = await listUniversalAssets(prisma, {
      status: req.query.status,
      provider: req.query.provider,
      type: req.query.type,
      limit: req.query.limit,
      offset: req.query.offset,
      publishedOnly: !isAdmin,
    });
    const filtered = (result.items || []).filter((a) => {
      if (includeFixtures) return true;
      return !isDevelopmentFixture(a);
    });
    const items = toPublicAssetList(filtered, { admin: isAdmin });
    return res.json({
      ...result,
      total: filtered.length,
      items,
      assets: items,
      fixturesExcluded: !includeFixtures,
    });
  } catch (err) {
    next(err);
  }
});

/** GET /assets/:id/related — must register before /assets/:id */
router.get('/assets/:id/related', optionalAuth, async (req, res, next) => {
  try {
    const result = await getRelatedAssets(prisma, req.params.id);
    const admin = isPlatformAdmin(req.user);
    return res.json({
      ok: true,
      assets: toPublicAssetList(result.assets || [], { admin }),
      relations: result.relations,
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

/**
 * POST /assets/:id/use
 * Library “Use this” → URI reuse gate → draft destination (confirm required).
 * Never publishes live playlists/campaigns/stores.
 */
router.post('/assets/:id/use', optionalAuth, async (req, res, next) => {
  try {
    const result = await useUniversalLibraryAsset(prisma, {
      assetId: req.params.id,
      destination: req.body?.destination,
      confirm: req.body?.confirm === true,
      userId: userIdFromReq(req),
      storeId: req.body?.storeId || null,
      tenantId: req.body?.tenantId || null,
      draftStoreId: req.body?.draftStoreId || null,
      playlistName: req.body?.playlistName || null,
      websitePlacement: req.body?.websitePlacement || null,
    });
    if (!result.ok) {
      const status = result.awaitingConfirmation
        ? 409
        : result.blocked
          ? 403
          : result.error === 'uri_reuse_unavailable'
            ? 503
            : 400;
      return res.status(status).json(result);
    }
    return res.json(result);
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

/** GET /discovery/browse — industry × type discovery (Phase 2F) */
router.get('/discovery/browse', optionalAuth, requireDiscoveryV1, async (req, res, next) => {
  try {
    const result = await browseDiscovery(prisma, {
      industry: req.query.industry,
      subCategory: req.query.subCategory,
      type: req.query.type,
      role: req.query.role,
      openLicense: req.query.openLicense,
      premium: req.query.premium,
      creator: req.query.creator,
      q: req.query.q,
      limit: req.query.limit,
      admin: isPlatformAdmin(req.user),
    });
    return res.json(result);
  } catch (err) {
    next(err);
  }
});

/** GET /collections */
router.get('/collections', optionalAuth, requireDiscoveryV1, async (req, res, next) => {
  try {
    const result = await listCollections(prisma);
    const admin = isPlatformAdmin(req.user);
    return res.json({
      ok: true,
      collections: (result.collections || []).map((c) => ({
        ...c,
        assets: toPublicAssetList(c.assets || [], { admin }),
      })),
    });
  } catch (err) {
    next(err);
  }
});

/** GET /admin/job-metrics */
router.get('/admin/job-metrics', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const result = await getJobMetrics(prisma);
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
 * POST /admin/seed-run — DEVELOPMENT FIXTURES ONLY.
 * Does not populate the public real catalogue. Requires fixtures flag.
 */
router.post(
  '/admin/seed-run',
  requireAuth,
  requireAdmin,
  requirePopulationV1,
  async (req, res, next) => {
    try {
      if (!fixturesEnabled() && req.body?.forceFixtures !== true) {
        return res.status(400).json({
          ok: false,
          error: 'fixtures_disabled',
          message:
            'Rich seed creates DEVELOPMENT_FIXTURE records only. Set ENABLE_UNIVERSAL_LIBRARY_FIXTURES_V1=true or use Import Cardbey Originals.',
        });
      }
      const startedAt = new Date();
      const richResult = await runRichLibrarySeed(prisma, {
        ownerId: req.body?.ownerId || 'cardbey_platform',
        skipExisting: req.body?.skipExisting !== false,
        rich: req.body?.rich !== false,
        targetMin: req.body?.targetMin,
        targetMax: req.body?.targetMax,
        runPipeline: req.body?.runPipeline !== false,
        maxPipeline: req.body?.maxPipeline,
      });
      await reconcileDevelopmentFixtures(prisma, {});

      const createdCount = (richResult.seeded?.results || []).filter((r) => r.created).length;
      const skippedCount = (richResult.seeded?.results || []).filter((r) => r.skipped).length;
      const completedAt = new Date();

      const job = await prisma.contentPopulationJob.create({
        data: {
          kind: JOB_KIND.DISCOVERY,
          provider: 'development_fixture',
          status: JOB_STATUS.COMPLETED,
          attempt: 1,
          maxAttempts: 1,
          payload: { source: 'admin_fixture_seed', phase: '3' },
          result: {
            seeded: createdCount,
            skipped: skippedCount,
            contentOrigin: 'DEVELOPMENT_FIXTURE',
            note: 'Fixtures excluded from public Library unless fixtures flag is on.',
          },
          startedAt,
          completedAt,
        },
      });

      return res.json({
        ok: true,
        ...richResult,
        job,
        authority: 'core',
        fixtureMode: true,
        message: 'Development fixtures seeded — excluded from public Library by default.',
      });
    } catch (err) {
      next(err);
    }
  },
);

/** POST /admin/reconcile-fixtures */
router.post('/admin/reconcile-fixtures', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const result = await reconcileDevelopmentFixtures(prisma, req.body || {});
    return res.json(result);
  } catch (err) {
    next(err);
  }
});

/** GET /admin/content-audit */
router.get('/admin/content-audit', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const result = await auditRealContentReadiness(prisma);
    return res.json(result);
  } catch (err) {
    next(err);
  }
});

/** POST /admin/import-originals — Cardbey Originals from approved manifest */
router.post('/admin/import-originals', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    if (!Features.universalLibrary?.cardbeyOriginalsV1 && !Features.universalLibrary?.realPopulationV1) {
      return failClosed(res, 'originals_disabled');
    }
    const startedAt = new Date();
    const imported = await importCardbeyOriginals(prisma, {
      skipExisting: req.body?.skipExisting !== false,
    });
    const job = await prisma.contentPopulationJob.create({
      data: {
        kind: JOB_KIND.DISCOVERY,
        provider: 'cardbey.originals',
        status: JOB_STATUS.COMPLETED,
        attempt: 1,
        maxAttempts: 1,
        payload: { source: 'cardbey.originals', phase: '3' },
        result: imported,
        startedAt,
        completedAt: new Date(),
      },
    });
    return res.json({ ok: true, ...imported, job, authority: 'core' });
  } catch (err) {
    next(err);
  }
});

/** POST /admin/project-creator-asset — explicit Creator Studio → Library projection */
router.post('/admin/project-creator-asset', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    if (!Features.universalLibrary?.creatorLibraryPublicationV1 && req.body?.allowPilot !== true) {
      return failClosed(res, 'creator_library_publication_disabled');
    }
    const result = await projectCreatorContentToLibrary(prisma, req.body || {});
    if (!result.ok) return res.status(result.status || 400).json(result);
    return res.status(201).json({ ...result, authority: 'core' });
  } catch (err) {
    next(err);
  }
});

/** POST /admin/withdraw-creator-asset — remove Library projection; preserve audit */
router.post('/admin/withdraw-creator-asset', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    if (!Features.universalLibrary?.creatorLibraryPublicationV1 && req.body?.allowPilot !== true) {
      return failClosed(res, 'creator_library_publication_disabled');
    }
    const result = await withdrawCreatorLibraryProjection(prisma, req.body || {});
    if (!result.ok) return res.status(result.status || 400).json(result);
    return res.json({ ...result, authority: 'core' });
  } catch (err) {
    next(err);
  }
});

/** POST /admin/sync-pexels — curated Pexels open-content sync (REFERENCE hosting) */
router.post('/admin/sync-pexels', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    if (!Features.universalLibrary?.externalOpenProviderV1 && req.body?.force !== true) {
      return failClosed(res, 'external_provider_disabled');
    }
    const result = await runPexelsLibrarySync(prisma, {
      maxPublish: req.body?.maxPublish,
      force: req.body?.force === true,
      queries: req.body?.queries,
    });
    if (!result.ok) return res.status(result.status === 'DISABLED' ? 403 : 502).json(result);
    return res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /admin/federation-providers — authoritative external provider status
 * (URI Provider SDK — not dashboard Content Acquisition stubs).
 */
router.get('/admin/federation-providers', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const result = await listFederationProviderStatus(prisma);
    return res.json(result);
  } catch (err) {
    next(err);
  }
});

/** POST /admin/federation-providers/:sourceId/test — lightweight health probe */
router.post('/admin/federation-providers/:sourceId/test', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const sourceId = String(req.params.sourceId || '');
    const result = await testFederationProvider(sourceId);
    return res.status(result.ok ? 200 : 502).json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /admin/federation-providers/:sourceId/sync — governed ops intake → UL index
 * sourceId: src_pexels | src_openverse | src_wikimedia
 */
router.post('/admin/federation-providers/:sourceId/sync', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    if (!Features.universalLibrary?.externalOpenProviderV1 && req.body?.force !== true) {
      return failClosed(res, 'external_provider_disabled');
    }
    const sourceId = String(req.params.sourceId || '');
    const result = await runFederationOpsIntake(prisma, {
      sourceId,
      force: req.body?.force === true,
      maxPublish: req.body?.maxPublish,
      queries: req.body?.queries,
    });
    if (!result.ok) {
      const syncStatus = result.sync?.status;
      return res.status(syncStatus === 'DISABLED' ? 403 : 502).json(result);
    }
    return res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /find-resources — Performer/index-first resource discovery (proposals only)
 */
router.post('/find-resources', requireAuth, async (req, res, next) => {
  try {
    const result = await findResources(prisma, {
      query: req.body?.query,
      type: req.body?.type,
      limit: req.body?.limit,
      purpose: req.body?.purpose,
      allowFederation: req.body?.allowFederation !== false,
    });
    return res.json(result);
  } catch (err) {
    next(err);
  }
});

/** POST /admin/publish-real-collections — curated real-only collections */
router.post('/admin/publish-real-collections', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    if (
      !Features.universalLibrary?.realLibraryCollectionsV1 &&
      !Features.universalLibrary?.realPopulationV1
    ) {
      return failClosed(res, 'real_collections_disabled');
    }
    const result = await publishRealCollections(prisma);
    return res.json({ ...result, authority: 'core' });
  } catch (err) {
    next(err);
  }
});

/** GET /admin/library-ops-summary — real vs fixture split + source health */
router.get('/admin/library-ops-summary', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const assets = await prisma.universalAsset.findMany({ take: 5000 });
    /** @type {Record<string, number>} */
    const byOrigin = {};
    /** @type {Record<string, number>} */
    const byIndustry = {};
    /** @type {Record<string, number>} */
    const byType = {};
    /** @type {Record<string, number>} */
    const byProvider = {};
    let fixtures = 0;
    let realPublished = 0;
    let underReview = 0;
    let rightsIssues = 0;
    let referenceOnly = 0;
    for (const a of assets) {
      const origin = getContentOrigin(a);
      const meta = a.metadata && typeof a.metadata === 'object' ? a.metadata : {};
      byOrigin[origin] = (byOrigin[origin] || 0) + 1;
      byProvider[a.provider || 'unknown'] = (byProvider[a.provider || 'unknown'] || 0) + 1;
      byType[a.type || 'unknown'] = (byType[a.type || 'unknown'] || 0) + 1;
      const industry = String(meta.industry || (Array.isArray(a.categories) ? a.categories[0] : '') || 'unset');
      if (!isDevelopmentFixture(a) && a.status === 'PUBLISHED') {
        byIndustry[industry] = (byIndustry[industry] || 0) + 1;
      }
      if (isDevelopmentFixture(a)) fixtures += 1;
      else if (a.status === 'PUBLISHED') realPublished += 1;
      if (String(meta.catalogueQualityStatus || '') === 'NEEDS_REVIEW') underReview += 1;
      if (['UNKNOWN', 'RESTRICTED'].includes(String(a.rightsStatus || '').toUpperCase())) {
        rightsIssues += 1;
      }
      if (a.hostingMode === HOSTING_MODE.REFERENCE || origin === 'REFERENCE_ONLY') referenceOnly += 1;
    }
    const collections = await prisma.universalEntity.count({ where: { kind: 'Collection' } });
    const lastSync = await prisma.contentPopulationJob.findFirst({
      where: { kind: JOB_KIND.PROVIDER_SYNC, provider: ASSET_PROVIDER.PEXELS },
      orderBy: { completedAt: 'desc' },
    });
    return res.json({
      ok: true,
      fixturesEnabled: fixturesEnabled(),
      overview: {
        realPublishedAssets: realPublished,
        developmentFixtures: fixtures,
        assetsUnderReview: underReview,
        rightsIssues,
        cardbeyOriginals: byOrigin.REAL_FIRST_PARTY || 0,
        creatorAssets: byOrigin.REAL_CREATOR || 0,
        businessDerived: byOrigin.REAL_BUSINESS || 0,
        providerAssets: byOrigin.REAL_PROVIDER || 0,
        referenceOnly,
        collections,
        byOrigin,
        byIndustry,
        byType,
        byProvider,
      },
      sources: [
        {
          id: 'cardbey.originals',
          status: 'ACTIVE',
          termsReviewStatus: 'N/A_FIRST_PARTY',
          hostingMode: 'HOSTED',
          published: byOrigin.REAL_FIRST_PARTY || 0,
        },
        {
          id: 'creator_studio',
          status: Features.universalLibrary?.creatorLibraryPublicationV1 ? 'ACTIVE' : 'PAUSED',
          termsReviewStatus: 'CREATOR_DECLARATION',
          hostingMode: 'HOSTED',
          published: byOrigin.REAL_CREATOR || 0,
        },
        {
          id: 'pexels',
          status: !isPexelsLibraryConfigured()
            ? 'DISABLED'
            : pexelsLibraryEnabled()
              ? 'ACTIVE'
              : 'PAUSED',
          termsReviewStatus: 'APPROVED_FOR_PILOT',
          hostingMode: 'REFERENCE',
          lastSync: lastSync?.completedAt || null,
          lastSyncResult: lastSync?.result || null,
          published: byProvider[ASSET_PROVIDER.PEXELS] || 0,
          configured: isPexelsLibraryConfigured(),
          flagEnabled: Boolean(Features.universalLibrary?.externalOpenProviderV1),
        },
      ],
      lastSuccessfulSync: lastSync?.status === JOB_STATUS.COMPLETED ? lastSync.completedAt : null,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
