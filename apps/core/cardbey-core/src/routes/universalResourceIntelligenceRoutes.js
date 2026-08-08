/**
 * Universal Resource Intelligence API
 * Mount: /api/resource-intelligence
 */

import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { optionalAuth, requireAuth, requireAdmin } from '../middleware/auth.js';
import { Features } from '../config/features.js';
import {
  runResourceIntelligenceSearch,
  runResourceIntelligencePlan,
  runResourceIntelligenceDiscover,
  runResourceIntelligenceReuse,
  explainResourceIntelligence,
  confirmReusePlan,
  listSourceNodes,
  federationHealth,
  ensureFederationReady,
  setSourceStatus,
  runFederationOpsIntake,
  listAdapters,
  listResourceIndex,
  resourceIndexStats,
  getJob,
  listJobs,
  askOperationsCopilot,
  uriHealth,
  proposeCollections,
  selectResourceCandidate,
  confirmAndExecuteReuse,
  cancelReuseDecision,
  getReuseUseRecord,
  runReuseOpsProofs,
  getResourceRecord,
  openResourceWorkspace,
  resumeResourceWorkspace,
  listResourceWorkspaces,
  mutateWorkspaceShortlist,
  placeWorkspaceResources,
  workspaceSubstitutions,
  workspaceEvaluation,
  listDestinationAdapters,
  runBusinessTask,
  runCandidateAction,
  listBusinessTasks,
  saveResourceKit,
  listResourceKits,
  getResourceKit,
  duplicateResourceKit,
  shareResourceKit,
  publishResourceKit,
  reuseResourceKit,
  buildResourceGraph,
  recommendResources,
  suggestCapabilitiesFromPatterns,
  approveCapabilitySuggestion,
} from '../services/universalResourceIntelligence/index.js';
import {
  getSession,
  listCandidateSnapshots,
} from '../services/universalResourceIntelligence/reuseRepository.js';

const router = Router();

function failClosed(res, code = 'uri_disabled') {
  return res.status(404).json({ ok: false, error: code });
}

function enabled() {
  return Boolean(Features.universalResourceIntelligence?.v1);
}

function reusePilot() {
  return Boolean(Features.universalResourceIntelligence?.reusePilotV1);
}

function workspacePilot() {
  return Boolean(Features.universalResourceIntelligence?.workspaceV1);
}

function productIntegration() {
  return Boolean(Features.universalResourceIntelligence?.productIntegrationV1);
}

/** GET /health */
router.get('/health', optionalAuth, (req, res) => {
  if (!enabled()) return failClosed(res);
  return res.json({
    ...uriHealth(),
    reusePilotV1: reusePilot(),
    workspaceV1: workspacePilot(),
    productIntegrationV1: productIntegration(),
    authority: 'core',
  });
});

/** POST /search */
router.post('/search', optionalAuth, async (req, res, next) => {
  try {
    if (!enabled()) return failClosed(res);
    const body = { ...(req.body || {}), userId: req.user?.id || req.body?.userId };
    const result = await runResourceIntelligenceSearch(prisma, body);
    return res.status(result.ok ? 200 : 400).json(result);
  } catch (err) {
    next(err);
  }
});

/** POST /plan */
router.post('/plan', optionalAuth, async (req, res, next) => {
  try {
    if (!enabled()) return failClosed(res);
    const result = await runResourceIntelligencePlan(req.body || {});
    return res.status(result.ok ? 200 : 400).json(result);
  } catch (err) {
    next(err);
  }
});

/** POST /discover */
router.post('/discover', optionalAuth, async (req, res, next) => {
  try {
    if (!enabled()) return failClosed(res);
    const result = await runResourceIntelligenceDiscover(prisma, req.body || {});
    return res.json(result);
  } catch (err) {
    next(err);
  }
});

/** POST /select — Phase 2 candidate selection */
router.post('/select', requireAuth, async (req, res, next) => {
  try {
    if (!enabled() || !reusePilot()) return failClosed(res, 'uri_reuse_pilot_disabled');
    const result = await selectResourceCandidate(prisma, {
      ...(req.body || {}),
      userId: req.user?.id || req.body?.userId,
    });
    return res.status(result.ok ? 200 : 400).json(result);
  } catch (err) {
    next(err);
  }
});

/** POST /reuse — build plan or legacy confirm of plan object */
router.post('/reuse', requireAuth, async (req, res, next) => {
  try {
    if (!enabled()) return failClosed(res);
    if (req.body?.confirm === true && req.body?.reusePlan) {
      return res.json(confirmReusePlan(req.body.reusePlan, { confirm: true }));
    }
    const result = await runResourceIntelligenceReuse(req.body || {});
    return res.status(result.ok ? 200 : 400).json(result);
  } catch (err) {
    next(err);
  }
});

/** POST /reuse/confirm — Phase 2 confirm + execute into draft */
router.post('/reuse/confirm', requireAuth, async (req, res, next) => {
  try {
    if (!enabled() || !reusePilot()) return failClosed(res, 'uri_reuse_pilot_disabled');
    const result = await confirmAndExecuteReuse(prisma, {
      ...(req.body || {}),
      confirm: true,
      userId: req.user?.id || req.body?.userId,
    });
    return res.status(result.ok ? 200 : 400).json(result);
  } catch (err) {
    next(err);
  }
});

/** POST /reuse/cancel */
router.post('/reuse/cancel', requireAuth, async (req, res, next) => {
  try {
    if (!enabled() || !reusePilot()) return failClosed(res, 'uri_reuse_pilot_disabled');
    const result = await cancelReuseDecision(prisma, req.body || {});
    return res.status(result.ok ? 200 : 400).json(result);
  } catch (err) {
    next(err);
  }
});

/** GET /reuse/use/:id — ExternalResourceUse audit record */
router.get('/reuse/use/:id', requireAuth, async (req, res, next) => {
  try {
    if (!enabled() || !reusePilot()) return failClosed(res, 'uri_reuse_pilot_disabled');
    const use = await getReuseUseRecord(prisma, req.params.id);
    if (!use) return res.status(404).json({ ok: false, error: 'not_found' });
    return res.json({ ok: true, externalResourceUse: use });
  } catch (err) {
    next(err);
  }
});

/** GET /sessions/:id */
router.get('/sessions/:id', requireAuth, async (req, res, next) => {
  try {
    if (!enabled()) return failClosed(res);
    const session = await getSession(prisma, req.params.id);
    if (!session) return res.status(404).json({ ok: false, error: 'not_found' });
    const candidates = await listCandidateSnapshots(prisma, session.id);
    return res.json({ ok: true, session, candidates });
  } catch (err) {
    next(err);
  }
});

/** POST /explain */
router.post('/explain', optionalAuth, async (req, res, next) => {
  try {
    if (!enabled()) return failClosed(res);
    const result = await explainResourceIntelligence(req.body || {});
    return res.json(result);
  } catch (err) {
    next(err);
  }
});

/** GET /jobs */
router.get('/jobs', requireAuth, (req, res) => {
  if (!enabled()) return failClosed(res);
  if (req.query.id) {
    const job = getJob(String(req.query.id));
    if (!job) return res.status(404).json({ ok: false, error: 'not_found' });
    return res.json({ ok: true, job });
  }
  return res.json({
    ok: true,
    jobs: listJobs({
      limit: req.query.limit,
      kind: req.query.kind,
      status: req.query.status,
    }),
  });
});

/** GET /sources */
router.get('/sources', optionalAuth, async (req, res) => {
  if (!enabled()) return failClosed(res);
  await ensureFederationReady();
  return res.json({
    ok: true,
    sources: listSourceNodes({
      status: req.query.status,
      kind: req.query.kind,
      resourceClass: req.query.resourceClass,
      consumerDiscoverable:
        req.query.consumerDiscoverable === 'true'
          ? true
          : req.query.consumerDiscoverable === 'false'
            ? false
            : undefined,
    }),
    adapters: listAdapters(),
    health: federationHealth(),
  });
});

/** PATCH /sources/:id/status — ops pause/resume without code deploy */
router.patch('/sources/:id/status', requireAuth, requireAdmin, async (req, res) => {
  if (!enabled()) return failClosed(res);
  await ensureFederationReady();
  const status = String(req.body?.status || '').toUpperCase();
  if (!['ACTIVE', 'PAUSED', 'DEGRADED', 'DISABLED'].includes(status)) {
    return res.status(400).json({ ok: false, error: 'invalid_status' });
  }
  const node = setSourceStatus(req.params.id, status);
  if (!node) return res.status(404).json({ ok: false, error: 'source_not_found' });
  return res.json({ ok: true, source: node });
});

/** POST /federation/ops-intake — Path A: curated provider intake (ops only) */
router.post('/federation/ops-intake', requireAuth, requireAdmin, async (req, res) => {
  if (!enabled()) return failClosed(res);
  const result = await runFederationOpsIntake(prisma, req.body || {});
  return res.status(result.ok ? 200 : 400).json(result);
});

/** GET /index */
router.get('/index', optionalAuth, (req, res) => {
  if (!enabled()) return failClosed(res);
  return res.json({
    ok: true,
    stats: resourceIndexStats(),
    resources: listResourceIndex({
      sourceId: req.query.sourceId,
      industry: req.query.industry,
      mediaType: req.query.mediaType,
      limit: req.query.limit,
    }),
  });
});

/** POST /collections/propose — editor candidates */
router.post('/collections/propose', requireAuth, requireAdmin, (req, res) => {
  if (!enabled()) return failClosed(res);
  return res.json(proposeCollections(req.body || {}));
});

/** POST /ops/copilot — advisory only */
router.post('/ops/copilot', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    if (!enabled() || !Features.universalResourceIntelligence?.opsCopilotV1) {
      return failClosed(res, 'uri_copilot_disabled');
    }
    const result = await askOperationsCopilot(req.body?.question, req.body?.context);
    return res.json(result);
  } catch (err) {
    next(err);
  }
});

/** POST /ops/reuse-proofs — Phase 2 ops scenario proof (admin) */
router.post('/ops/reuse-proofs', requireAuth, requireAdmin, (req, res) => {
  if (!enabled() || !reusePilot()) return failClosed(res, 'uri_reuse_pilot_disabled');
  const resourceId = req.body?.resourceId;
  const resource = resourceId ? getResourceRecord(resourceId) : req.body?.resource;
  if (!resource) return res.status(400).json({ ok: false, error: 'resource_required' });
  return res.json(runReuseOpsProofs(resource));
});

/** Phase 3 workspace */
router.post('/workspace/search', optionalAuth, async (req, res, next) => {
  try {
    if (!enabled() || !workspacePilot()) return failClosed(res, 'uri_workspace_disabled');
    const result = await openResourceWorkspace(prisma, {
      ...(req.body || {}),
      userId: req.user?.id || req.body?.userId,
    });
    return res.status(result.ok ? 200 : 400).json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/workspace', requireAuth, async (req, res, next) => {
  try {
    if (!enabled() || !workspacePilot()) return failClosed(res, 'uri_workspace_disabled');
    const result = await listResourceWorkspaces(prisma, {
      userId: req.user?.id,
      limit: req.query.limit,
    });
    return res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/workspace/:id', optionalAuth, async (req, res, next) => {
  try {
    if (!enabled() || !workspacePilot()) return failClosed(res, 'uri_workspace_disabled');
    const result = await resumeResourceWorkspace(prisma, req.params.id);
    return res.status(result.ok ? 200 : 404).json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/workspace/shortlist', requireAuth, async (req, res, next) => {
  try {
    if (!enabled() || !workspacePilot()) return failClosed(res, 'uri_workspace_disabled');
    const result = await mutateWorkspaceShortlist(prisma, req.body || {});
    return res.status(result.ok ? 200 : 400).json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/workspace/place', requireAuth, async (req, res, next) => {
  try {
    if (!enabled() || !workspacePilot()) return failClosed(res, 'uri_workspace_disabled');
    const result = await placeWorkspaceResources(prisma, {
      ...(req.body || {}),
      userId: req.user?.id || req.body?.userId,
      confirm: true,
    });
    return res.status(result.ok ? 200 : 400).json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/workspace/substitutions', optionalAuth, async (req, res, next) => {
  try {
    if (!enabled() || !workspacePilot()) return failClosed(res, 'uri_workspace_disabled');
    const result = await workspaceSubstitutions(prisma, req.body || {});
    return res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/workspace/:id/evaluation', optionalAuth, async (req, res, next) => {
  try {
    if (!enabled() || !workspacePilot()) return failClosed(res, 'uri_workspace_disabled');
    const result = await workspaceEvaluation(prisma, req.params.id);
    return res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/destinations', optionalAuth, (req, res) => {
  if (!enabled()) return failClosed(res);
  return res.json({ ok: true, destinations: listDestinationAdapters(), draftOnly: true });
});

/** Phase 4 — business tasks (invisible intelligence; no Resource Workspace required) */
router.get('/tasks', optionalAuth, (req, res) => {
  if (!enabled() || !productIntegration()) return failClosed(res, 'uri_product_integration_disabled');
  return res.json({ ok: true, tasks: listBusinessTasks() });
});

router.post('/tasks/run', optionalAuth, async (req, res, next) => {
  try {
    if (!enabled() || !productIntegration()) return failClosed(res, 'uri_product_integration_disabled');
    const result = await runBusinessTask(prisma, {
      ...(req.body || {}),
      userId: req.user?.id || req.body?.userId,
    });
    return res.status(result.ok ? 200 : 400).json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/tasks/action', requireAuth, async (req, res, next) => {
  try {
    if (!enabled() || !productIntegration()) return failClosed(res, 'uri_product_integration_disabled');
    const result = await runCandidateAction(prisma, {
      ...(req.body || {}),
      userId: req.user?.id || req.body?.userId,
      confirm: true,
    });
    return res.status(result.ok ? 200 : 400).json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/kits', optionalAuth, (req, res) => {
  if (!enabled() || !productIntegration()) return failClosed(res, 'uri_product_integration_disabled');
  return res.json({
    ok: true,
    kits: listResourceKits({
      userId: req.user?.id || req.query.userId,
      industry: req.query.industry,
      limit: req.query.limit,
    }),
  });
});

router.post('/kits', requireAuth, (req, res) => {
  if (!enabled() || !productIntegration()) return failClosed(res, 'uri_product_integration_disabled');
  return res.json(
    saveResourceKit({
      ...(req.body || {}),
      userId: req.user?.id || req.body?.userId,
    }),
  );
});

router.get('/kits/:id', optionalAuth, (req, res) => {
  if (!enabled() || !productIntegration()) return failClosed(res, 'uri_product_integration_disabled');
  const kit = getResourceKit(req.params.id);
  if (!kit) return res.status(404).json({ ok: false, error: 'not_found' });
  return res.json({ ok: true, kit });
});

router.post('/kits/:id/duplicate', requireAuth, (req, res) => {
  if (!enabled() || !productIntegration()) return failClosed(res, 'uri_product_integration_disabled');
  return res.json(
    duplicateResourceKit(req.params.id, {
      userId: req.user?.id,
      name: req.body?.name,
    }),
  );
});

router.post('/kits/:id/share', requireAuth, (req, res) => {
  if (!enabled() || !productIntegration()) return failClosed(res, 'uri_product_integration_disabled');
  return res.json(shareResourceKit(req.params.id));
});

router.post('/kits/:id/publish', requireAuth, requireAdmin, (req, res) => {
  if (!enabled() || !productIntegration()) return failClosed(res, 'uri_product_integration_disabled');
  return res.json(publishResourceKit(req.params.id, { confirm: true }));
});

router.post('/kits/:id/reuse', optionalAuth, (req, res) => {
  if (!enabled() || !productIntegration()) return failClosed(res, 'uri_product_integration_disabled');
  return res.json(reuseResourceKit(req.params.id));
});

router.get('/graph', optionalAuth, (req, res) => {
  if (!enabled() || !productIntegration()) return failClosed(res, 'uri_product_integration_disabled');
  return res.json(
    buildResourceGraph({
      resourceId: req.query.resourceId,
      industry: req.query.industry,
      businessId: req.query.businessId || req.query.storeId,
      campaignId: req.query.campaignId,
      capabilityId: req.query.capabilityId,
      displayPlaylistId: req.query.displayPlaylistId,
    }),
  );
});

router.post('/recommendations', optionalAuth, (req, res) => {
  if (!enabled() || !productIntegration()) return failClosed(res, 'uri_product_integration_disabled');
  return res.json(recommendResources(req.body || {}));
});

router.get('/capability-suggestions', optionalAuth, (req, res) => {
  if (!enabled() || !productIntegration()) return failClosed(res, 'uri_product_integration_disabled');
  return res.json(suggestCapabilitiesFromPatterns({ industry: req.query.industry }));
});

router.post('/capability-suggestions/:id/approve', requireAuth, requireAdmin, (req, res) => {
  if (!enabled() || !productIntegration()) return failClosed(res, 'uri_product_integration_disabled');
  return res.json(
    approveCapabilitySuggestion(req.params.id, {
      confirm: true,
      approverUserId: req.user?.id,
    }),
  );
});

export default router;
