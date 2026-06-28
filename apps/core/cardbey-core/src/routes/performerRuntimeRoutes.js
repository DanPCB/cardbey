/**
 * Performer Runtime — read API (Phase 1.5).
 */

import { Router } from 'express';
import { optionalAuth, requireAuth } from '../middleware/auth.js';
import { executeUiRuntimeAction } from '../lib/runtime/performerRuntime/uiRuntimeActionService.js';
import { executeRuntimeAction } from '../lib/runtime/performerRuntime/executeRuntimeAction.js';
import { recordRuntimeAuthorityPathUsed } from '../lib/runtime/performerRuntime/runtimeAuthorityGuard.js';
import {
  executeStoreHeroMediaUpload,
  heroMediaUploadSingle,
  resolveDraftForHeroUpload,
} from '../services/draftStore/heroMediaUploadService.js';
import {
  executeStoreLogoOrAvatarUpload,
} from '../services/draftStore/storeAssetUploadService.js';
import { UPLOAD_ACTIONS } from '../lib/runtime/runtimeActionTypes.js';
import { buildRuntimeUploadEnvelope } from '../lib/runtime/runtimeUploadEnvelope.js';
import { emitBrandAssetsUpdated } from '../lib/brandAssetsMissionEvents.js';
import { getPrismaClient } from '../lib/prisma.js';
import {
  exploreVideoUploadFields,
  executeExploreVideoUpload,
} from '../services/explore/exploreVideoUploadService.js';
import { handleFactoryApprovalDecision } from '../lib/factoryRuntime/factoryApprovalService.js';
import {
  getRuntimeByMissionId,
  getRuntimeById,
  getUnifiedRuntimeStream,
  runtimeContextSnapshot,
} from '../lib/runtime/performerRuntime/index.js';
import { dryRunExecutionPlan } from '../lib/runtime/performerRuntime/dryRunExecutionPlan.js';
import { executeAnalyzeStoreCapability } from '../lib/runtime/performerRuntime/executeAnalyzeStoreCapability.js';
import { executeCreateOfferDraftCapability } from '../lib/runtime/performerRuntime/executeCreateOfferDraftCapability.js';
import { ensureQuickActionMission } from '../lib/mission/quickActionMission.js';
import { checkRuntimeAuthority } from '../lib/mode/checkRuntimeAuthority.js';
import { resolvePerformerMode } from '../lib/mode/modeTypes.js';
import { executeReviseOfferDraftCapability } from '../lib/runtime/performerRuntime/executeReviseOfferDraftCapability.js';
import { executeActivateBusinessSpaceCapability } from '../lib/runtime/performerRuntime/executeActivateBusinessSpaceCapability.js';
import { executeAcceptEnrichmentCapability } from '../lib/runtime/performerRuntime/executeAcceptEnrichmentCapability.js';
import { executeGenerateFullStoreFromSeedCapability } from '../lib/runtime/performerRuntime/executeGenerateFullStoreFromSeedCapability.js';
import {
  listMissionExecutionRecords,
  persistMissionExecutionRecord,
  normalizeExecutionRecord,
} from '../lib/runtime/performerRuntime/executionRecords.js';
import { getSkillContract, SKILL_CONTRACTS } from '../lib/runtime/performerRuntime/skillContracts.js';

const router = Router();

/**
 * POST /api/performer/runtime/ui-action — Sprint 2 UI write authority gateway.
 * Body: { action, missionId?, storeId?, payload?, source? }
 */
router.post('/ui-action', requireAuth, async (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const action = typeof body.action === 'string' ? body.action.trim() : '';
  if (!action) {
    return res.status(400).json({ ok: false, error: 'action_required' });
  }
  try {
    const payloadRaw = body.payload && typeof body.payload === 'object' ? body.payload : {};
    const mergedPayload = {
      ...payloadRaw,
      ...(body._preferAgent !== undefined ? { _preferAgent: body._preferAgent } : {}),
      ...(body.confirmed !== undefined ? { confirmed: body.confirmed } : {}),
      ...(body._executeAfterReview !== undefined ? { _executeAfterReview: body._executeAfterReview } : {}),
    };
    const result = await executeUiRuntimeAction({
      action,
      missionId: body.missionId ?? null,
      storeId: body.storeId ?? null,
      tenantId: req.user?.tenantId ?? req.userId ?? null,
      userId: req.userId ?? req.user?.id ?? null,
      source: typeof body.source === 'string' ? body.source.trim() : 'ui_publish',
      payload: mergedPayload,
    });
    const httpStatus =
      result.status === 'blocked' ? 409 : result.ok ? 200 : result.error?.code === 'draft_not_found' ? 404 : 400;
    return res.status(httpStatus).json(result);
  } catch (err) {
    console.error('[performer/runtime/ui-action]', err);
    return res.status(500).json({
      ok: false,
      error: err?.code ?? 'ui_action_failed',
      message: err?.message ?? 'UI action failed',
    });
  }
});

/**
 * POST /api/performer/runtime/ui-action/upload-hero — multipart hero upload via runtime authority.
 * Query: storeId (required unless draftId resolves store), draftId?, generationRunId?
 * Form: file, missionId?, generationRunId?, type=hero
 */
router.post('/ui-action/upload-hero', requireAuth, heroMediaUploadSingle, async (req, res) => {
  const userId = req.userId ?? req.user?.id ?? null;
  const storeId =
    (typeof req.query.storeId === 'string' ? req.query.storeId.trim() : null) ||
    (typeof req.body?.storeId === 'string' ? req.body.storeId.trim() : null) ||
    req.params?.storeId ||
    '';
  const draftId =
    (typeof req.query.draftId === 'string' ? req.query.draftId.trim() : null) ||
    (typeof req.body?.draftId === 'string' ? req.body.draftId.trim() : null) ||
    null;
  const generationRunId =
    (typeof req.query.generationRunId === 'string' ? req.query.generationRunId.trim() : null) ||
    (typeof req.body?.generationRunId === 'string' ? req.body.generationRunId.trim() : null) ||
    null;
  const missionId =
    (typeof req.query.missionId === 'string' ? req.query.missionId.trim() : null) ||
    (typeof req.body?.missionId === 'string' ? req.body.missionId.trim() : null) ||
    null;
  const source =
    (typeof req.body?.source === 'string' ? req.body.source.trim() : null) || 'ui_hero_upload';

  recordRuntimeAuthorityPathUsed({
    route: '/api/performer/runtime/ui-action/upload-hero',
    toolName: 'upload_hero_media',
    userId,
    missionId,
    source,
  });

  try {
    const resolved = await resolveDraftForHeroUpload({
      storeId: storeId || 'temp',
      draftId,
      generationRunId,
      userId,
      userRole: req.user?.role ?? null,
    });
    if (resolved.errorResponse) {
      return res.status(resolved.errorResponse.status).json(resolved.errorResponse.body);
    }
    const output = await executeStoreHeroMediaUpload({
      userId,
      storeId: resolved.storeId,
      draft: resolved.draft,
      file: req.file,
      generationRunId,
      missionId,
      req,
    });
    return res.status(200).json(
      buildRuntimeUploadEnvelope(UPLOAD_ACTIONS.UPLOAD_HERO_MEDIA, output, { missionId, source }),
    );
  } catch (err) {
    if (err?.statusCode === 400) {
      return res.status(400).json({
        ok: false,
        error: err.code ?? 'invalid_file',
        message: err.message ?? 'Invalid upload',
      });
    }
    if (err?.code === 'draft_already_committed' || String(err?.message || '').includes('already been committed')) {
      return res.status(409).json({
        ok: false,
        error: 'draft_already_committed',
        message:
          'This draft is locked for full edits. Use Preview changes to update the hero, then Republish.',
      });
    }
    console.error('[performer/runtime/ui-action/upload-hero]', err);
    return res.status(500).json({
      ok: false,
      error: err?.code ?? 'upload_hero_failed',
      message: err?.message ?? 'Hero upload failed',
    });
  }
});

async function handleRuntimeStoreAssetUpload(req, res, kind) {
  const userId = req.userId ?? req.user?.id ?? null;
  const storeId =
    (typeof req.query.storeId === 'string' ? req.query.storeId.trim() : null) ||
    (typeof req.body?.storeId === 'string' ? req.body.storeId.trim() : null) ||
    '';
  const draftId =
    (typeof req.query.draftId === 'string' ? req.query.draftId.trim() : null) ||
    (typeof req.body?.draftId === 'string' ? req.body.draftId.trim() : null) ||
    null;
  const generationRunId =
    (typeof req.query.generationRunId === 'string' ? req.query.generationRunId.trim() : null) ||
    (typeof req.body?.generationRunId === 'string' ? req.body.generationRunId.trim() : null) ||
    null;
  const missionId =
    (typeof req.query.missionId === 'string' ? req.query.missionId.trim() : null) ||
    (typeof req.body?.missionId === 'string' ? req.body.missionId.trim() : null) ||
    null;
  const action = kind === 'logo' ? UPLOAD_ACTIONS.UPLOAD_LOGO : UPLOAD_ACTIONS.UPLOAD_AVATAR;
  const source =
    (typeof req.body?.source === 'string' ? req.body.source.trim() : null) ||
    (kind === 'logo' ? 'ui_logo_upload' : 'ui_avatar_upload');

  recordRuntimeAuthorityPathUsed({
    route: `/api/performer/runtime/ui-action/upload-${kind}`,
    toolName: action,
    userId,
    missionId,
    source,
  });

  try {
    const resolved = await resolveDraftForHeroUpload({
      storeId: storeId || 'temp',
      draftId,
      generationRunId,
      userId,
      userRole: req.user?.role ?? null,
    });
    if (resolved.errorResponse) {
      return res.status(resolved.errorResponse.status).json(resolved.errorResponse.body);
    }
    const output = await executeStoreLogoOrAvatarUpload({
      userId,
      storeId: resolved.storeId,
      draft: resolved.draft,
      file: req.file,
      generationRunId,
      kind,
      req,
    });
    if (missionId && kind === 'logo') {
      try {
        await emitBrandAssetsUpdated(getPrismaClient(), {
          missionId,
          draftId: resolved.draft?.id ?? draftId,
          logoUrl: output.logoUrl ?? output.url ?? null,
          artifacts: ['uploaded_logo'],
          source,
        });
      } catch (emitErr) {
        console.warn('[performer/runtime/upload-logo] brand_assets_updated failed (non-fatal):', emitErr?.message || emitErr);
      }
    }
    return res.status(200).json(buildRuntimeUploadEnvelope(action, output, { missionId, source }));
  } catch (err) {
    if (err?.statusCode === 400) {
      return res.status(400).json({
        ok: false,
        error: err.code ?? 'invalid_file',
        message: err.message ?? 'Invalid upload',
      });
    }
    console.error(`[performer/runtime/ui-action/upload-${kind}]`, err);
    return res.status(500).json({
      ok: false,
      error: err?.code ?? `upload_${kind}_failed`,
      message: err?.message ?? `${kind} upload failed`,
    });
  }
}

router.post('/ui-action/upload-logo', requireAuth, heroMediaUploadSingle, (req, res) =>
  handleRuntimeStoreAssetUpload(req, res, 'logo'),
);

router.post('/ui-action/upload-avatar', requireAuth, heroMediaUploadSingle, (req, res) =>
  handleRuntimeStoreAssetUpload(req, res, 'avatar'),
);

router.post(
  '/ui-action/upload-explore-video',
  requireAuth,
  exploreVideoUploadFields(),
  async (req, res) => {
    const userId = req.userId ?? req.user?.id ?? null;
    const missionId =
      (typeof req.body?.missionId === 'string' ? req.body.missionId.trim() : null) || null;
    recordRuntimeAuthorityPathUsed({
      route: '/api/performer/runtime/ui-action/upload-explore-video',
      toolName: UPLOAD_ACTIONS.UPLOAD_EXPLORE_VIDEO,
      userId,
      missionId,
      source: 'ui_explore_upload',
    });
    try {
      const result = await executeExploreVideoUpload(req);
      if (result.status >= 400) {
        return res.status(result.status).json(result.body);
      }
      return res
        .status(result.status)
        .json(
          buildRuntimeUploadEnvelope(UPLOAD_ACTIONS.UPLOAD_EXPLORE_VIDEO, result.body, {
            missionId,
            source: 'ui_explore_upload',
          }),
        );
    } catch (err) {
      if (err?.message === 'title_and_video_required') {
        return res.status(400).json({
          ok: false,
          error: 'validation_error',
          message: 'Title and video are required',
        });
      }
      console.error('[performer/runtime/ui-action/upload-explore-video]', err);
      return res.status(500).json({
        ok: false,
        error: 'upload_failed',
        message: err?.message || 'Video upload failed',
      });
    }
  },
);

/**
 * POST /api/performer/runtime/run-factory — Factory Runtime V1 (no direct UI; API gateway only).
 * Body: { factoryId, missionId, intent, context?, resumeState? }
 */
router.post('/run-factory', requireAuth, async (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const factoryId = typeof body.factoryId === 'string' ? body.factoryId.trim() : '';
  const missionId = typeof body.missionId === 'string' ? body.missionId.trim() : '';
  if (!factoryId || !missionId) {
    return res.status(400).json({ ok: false, error: 'factory_id_and_mission_id_required' });
  }
  try {
    const { unifiedDispatch } = await import('../lib/intake/unifiedDispatch.js');
    const dispatchResult = await unifiedDispatch(
      {
        type: 'run_factory',
        payload: {
          factoryId,
          intent: body.intent ?? body.goal ?? '',
          missionId,
          userId: req.userId ?? req.user?.id ?? null,
          storeId: body.storeId ?? body.context?.storeId ?? null,
          context: body.context ?? {},
          resumeState: body.resumeState ?? null,
        },
      },
      { source: 'intake_v2_unified' },
    );
    const result = dispatchResult?.toolResult ?? dispatchResult;
    const factoryExecution =
      dispatchResult?.factoryExecution ?? result?.output?.factoryExecution ?? result?.output ?? result;
    const httpStatus =
      result.status === 'blocked' ? 409 : factoryExecution?.status === 'failed' ? 500 : 200;
    return res.status(httpStatus).json({
      ok: result.status !== 'failed' && result.status !== 'blocked',
      ...factoryExecution,
      metadata: result.metadata,
    });
  } catch (err) {
    console.error('[performer/runtime/run-factory]', err);
    return res.status(500).json({
      ok: false,
      error: err?.code ?? 'run_factory_failed',
      message: err?.message ?? 'Factory execution failed',
    });
  }
});

/**
 * POST /api/performer/runtime/factory-approval — resume factory after approval checkpoint.
 * Body: { missionId, decision: 'approve'|'cancel', editedPlan? }
 */
router.post('/factory-approval', requireAuth, async (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const missionId = typeof body.missionId === 'string' ? body.missionId.trim() : '';
  const decision =
    body.decision === 'cancel'
      ? 'cancel'
      : body.decision === 'regenerate'
        ? 'regenerate'
        : body.decision === 'regenerate_scene'
          ? 'regenerate_scene'
          : body.decision === 'regenerate_plan'
            ? 'regenerate_plan'
            : 'approve';
  if (!missionId) {
    return res.status(400).json({ ok: false, error: 'mission_id_required' });
  }
  try {
    const result = await handleFactoryApprovalDecision({
      missionId,
      userId: req.userId ?? req.user?.id ?? null,
      decision,
      editedPlan: body.editedPlan ?? null,
      sceneId: body.sceneId ?? null,
    });
    const httpStatus = result.ok !== false && result.status !== 'failed' ? 200 : result.error === 'not_found' ? 404 : 400;
    const { loadFactoryExecutionFromMission } = await import('../lib/factoryRuntime/factoryIntentRouter.js');
    const factoryExecution = await loadFactoryExecutionFromMission(missionId);
    let generatedArtifacts = [];
    try {
      const { getPrismaClient } = await import('../lib/prisma.js');
      const prisma = getPrismaClient();
      const mission = await prisma.mission.findUnique({
        where: { id: missionId },
        select: { context: true },
      });
      const ctx = mission?.context;
      if (ctx && typeof ctx === 'object' && !Array.isArray(ctx) && Array.isArray(ctx.generatedArtifacts)) {
        generatedArtifacts = ctx.generatedArtifacts;
      }
    } catch {
      /* non-fatal */
    }
    return res.status(httpStatus).json({
      ok: result.ok !== false && result.status !== 'failed',
      status: result.status ?? factoryExecution?.status ?? null,
      factoryExecution: factoryExecution ?? result,
      artifact: result.artifact ?? factoryExecution?.stageOutputs?.artifact_finalize ?? null,
      generatedArtifacts,
      ...result,
    });
  } catch (err) {
    console.error('[performer/runtime/factory-approval]', err);
    return res.status(500).json({
      ok: false,
      error: 'factory_approval_failed',
      message: err?.message ?? 'Factory approval failed',
    });
  }
});

/**
 * POST /api/performer/runtime/factory-publish — governed publish handoff (after final approval).
 * Body: { missionId, target, storeId? }
 */
router.post('/factory-publish', requireAuth, async (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const missionId = typeof body.missionId === 'string' ? body.missionId.trim() : '';
  const target = typeof body.target === 'string' ? body.target.trim() : '';
  if (!missionId || !target) {
    return res.status(400).json({ ok: false, error: 'mission_id_and_target_required' });
  }
  try {
    const { loadFactoryExecutionFromMission } = await import('../lib/factoryRuntime/factoryIntentRouter.js');
    const { executeGovernedFactoryPublish } = await import('../lib/factoryRuntime/creativeFactoryV4Stages.js');
    const factoryExecution = await loadFactoryExecutionFromMission(missionId);
    if (!factoryExecution) {
      return res.status(404).json({ ok: false, error: 'factory_execution_not_found' });
    }
    const result = await executeGovernedFactoryPublish({
      missionId,
      userId: req.userId ?? req.user?.id ?? null,
      target,
      storeId: body.storeId ?? null,
      factoryExecution,
    });
    const httpStatus = result.ok ? 200 : result.error === 'final_approval_required' ? 403 : 400;
    return res.status(httpStatus).json(result);
  } catch (err) {
    console.error('[performer/runtime/factory-publish]', err);
    return res.status(500).json({
      ok: false,
      error: 'factory_publish_failed',
      message: err?.message ?? 'Factory publish failed',
    });
  }
});

/**
 * POST /api/performer/runtime/dry-run — validate plan against broker registry (no execution).
 */
router.post('/dry-run', optionalAuth, async (req, res) => {
  try {
    const result = await dryRunExecutionPlan(req.body ?? {});
    if (!result.ok) {
      const status = result.error === 'mission_id_required' ? 400 : 400;
      return res.status(status).json(result);
    }
    return res.json(result);
  } catch (err) {
    console.error('[performer/runtime/dry-run]', err);
    return res.status(500).json({ ok: false, error: 'dry_run_failed' });
  }
});

/**
 * POST /api/performer/runtime/capabilities/analyze-store — read-only store analysis.
 */
router.post('/capabilities/analyze-store', optionalAuth, async (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const missionId = typeof body.missionId === 'string' ? body.missionId.trim() : '';
  const storeId = typeof body.storeId === 'string' ? body.storeId.trim() : '';
  if (!missionId) {
    return res.status(400).json({ ok: false, error: 'mission_id_required' });
  }
  if (!storeId) {
    return res.status(400).json({ ok: false, error: 'store_id_required', status: 'blocked' });
  }
  try {
    const result = await executeAnalyzeStoreCapability({
      missionId,
      storeId,
      draftId: body.draftId ?? null,
      generationRunId: body.generationRunId ?? null,
      focus: body.focus ?? 'performance',
      userId: req.user?.id ?? null,
      tenantId: req.user?.tenantId ?? null,
    });
    const httpStatus = result.status === 'blocked' ? 409 : result.ok ? 200 : 502;
    return res.status(httpStatus).json({
      ok: result.ok,
      status: result.status,
      output: result.output,
      error: result.error,
      code: result.code,
      missionId,
      storeId,
    });
  } catch (err) {
    console.error('[performer/runtime/analyze-store]', err);
    return res.status(500).json({ ok: false, error: 'analyze_store_failed' });
  }
});

/**
 * POST /api/performer/runtime/capabilities/create-offer-draft — draft offer artifact only (no publish).
 */
router.post('/capabilities/create-offer-draft', optionalAuth, async (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  let missionId = typeof body.missionId === 'string' ? body.missionId.trim() : '';
  const storeId = typeof body.storeId === 'string' ? body.storeId.trim() : '';
  if (!storeId) {
    return res.status(400).json({ ok: false, error: 'store_id_required', status: 'blocked' });
  }

  const performerMode = resolvePerformerMode(req, body);
  const authority = await checkRuntimeAuthority({
    action: {
      tool: 'create_offer',
      parameters: { storeId, missionId: missionId || undefined },
    },
    userId: req.user?.id ?? null,
    isGuest: !req.user?.id,
    context: { activeStoreId: storeId },
    mode: performerMode,
    source: performerMode === 'manual' ? 'manual' : 'automation',
  });
  if (!authority.allowed) {
    return res.status(403).json({
      ok: false,
      error: 'authorization_denied',
      reason: authority.reason,
      status: 'blocked',
    });
  }

  let missionAutoCreated = false;
  try {
    if (!missionId) {
      const sessionId =
        (typeof req.headers['x-session-id'] === 'string' && req.headers['x-session-id'].trim()) ||
        (typeof body.sessionId === 'string' && body.sessionId.trim()) ||
        null;

      const ensured = await ensureQuickActionMission({
        storeId,
        actionType:
          (typeof body.actionType === 'string' && body.actionType.trim()) ||
          'create_offer_draft',
        source:
          (typeof body.source === 'string' && body.source.trim()) || 'quick_action_pill',
        intentText: typeof body.intentText === 'string' ? body.intentText : undefined,
        label: typeof body.label === 'string' ? body.label : undefined,
        userId: req.user?.id ?? null,
        sessionId,
        tenantId: req.user?.tenantId ?? null,
      });

      if (ensured.missionId) {
        missionId = ensured.missionId;
        missionAutoCreated = ensured.created === true;
        if (missionAutoCreated) {
          console.log(
            `[create-offer-draft] Auto-created mission ${missionId} for quick action`,
          );
        }
      }
    }

    if (!missionId) {
      return res.status(400).json({ ok: false, error: 'mission_id_required' });
    }

    const result = await executeCreateOfferDraftCapability({
      missionId,
      storeId,
      draftId: body.draftId ?? null,
      generationRunId: body.generationRunId ?? null,
      selectedProducts: Array.isArray(body.selectedProducts) ? body.selectedProducts : null,
      userId: req.user?.id ?? null,
      tenantId: req.user?.tenantId ?? null,
    });
    const httpStatus = result.status === 'blocked' ? 409 : result.ok ? 200 : 502;
    return res.status(httpStatus).json({
      ok: result.ok,
      status: result.status,
      output: result.output,
      error: result.error,
      code: result.code,
      missionId,
      storeId,
      ...(missionAutoCreated ? { missionAutoCreated: true } : {}),
    });
  } catch (err) {
    console.error('[performer/runtime/create-offer-draft]', err);
    return res.status(500).json({ ok: false, error: 'create_offer_draft_failed' });
  }
});

/**
 * POST /api/performer/runtime/capabilities/activate-business-space
 * Business Activation Runway V2 — governed Business Space creation.
 */
router.post('/capabilities/activate-business-space', requireAuth, async (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const seedId = typeof body.seedId === 'string' ? body.seedId.trim() : '';
  if (!seedId) {
    return res.status(400).json({ ok: false, error: 'seed_id_required', status: 'blocked' });
  }
  const userId = req.userId ?? req.user?.id ?? null;
  if (!userId) {
    return res.status(401).json({ ok: false, error: 'auth_required', status: 'blocked' });
  }
  try {
    const result = await executeActivateBusinessSpaceCapability({
      missionId: body.missionId ?? null,
      seedId,
      userId,
      confirmed: body.confirmed === true,
      tenantId: req.user?.tenantId ?? null,
    });
    const httpStatus =
      result.status === 'blocked' ? 409 : result.ok ? 200 : result.error?.code === 'not_found' ? 404 : 400;
    return res.status(httpStatus).json({
      ok: result.ok,
      status: result.status,
      output: result.output,
      error: result.error,
      code: result.code,
      message: result.message,
      missionId: result.missionId,
      storeId: result.storeId,
    });
  } catch (err) {
    console.error('[performer/runtime/activate-business-space]', err);
    return res.status(500).json({ ok: false, error: 'activate_business_space_failed' });
  }
});

/**
 * POST /api/performer/runtime/capabilities/accept-enrichment-suggestion
 * Business Enrichment V2.2 — accepts suggestions via runtime authority only.
 * Never writes seed/store/profile/media fields directly.
 */
router.post('/capabilities/accept-enrichment-suggestion', requireAuth, async (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const seedId = typeof body.seedId === 'string' ? body.seedId.trim() : '';
  if (!seedId) {
    return res.status(400).json({ ok: false, error: 'seed_id_required', status: 'blocked' });
  }
  const userId = req.userId ?? req.user?.id ?? null;
  if (!userId) {
    return res.status(401).json({ ok: false, error: 'auth_required', status: 'blocked' });
  }
  try {
    const candidateIds = Array.isArray(body.candidateIds)
      ? body.candidateIds.map((id) => String(id ?? '').trim()).filter(Boolean)
      : [];
    const result = await executeAcceptEnrichmentCapability({
      missionId: body.missionId ?? null,
      seedId,
      userId,
      candidateIds,
      confirmed: body.confirmed === true,
    });
    const httpStatus =
      result.status === 'blocked'
        ? 409
        : result.ok
          ? 200
          : result.error?.code === 'not_found'
            ? 404
            : 400;
    return res.status(httpStatus).json({
      ok: result.ok,
      status: result.status,
      output: result.output,
      error: result.error,
      code: result.code,
      message: result.message,
      missionId: result.missionId,
    });
  } catch (err) {
    console.error('[performer/runtime/accept-enrichment-suggestion]', err);
    return res.status(500).json({ ok: false, error: 'accept_enrichment_failed' });
  }
});

/**
 * POST /api/performer/runtime/capabilities/generate-full-store-from-seed
 * Activation page — governed draft store generation (no publish / activate / claim).
 */
router.post('/capabilities/generate-full-store-from-seed', optionalAuth, async (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const seedId = typeof body.seedId === 'string' ? body.seedId.trim() : '';
  if (!seedId) {
    return res.status(400).json({ ok: false, error: 'seed_id_required', status: 'blocked' });
  }
  const userId = req.userId ?? req.user?.id ?? null;
  console.log('[STORE_BUILD_RUNTIME_CALL]', {
    seedId,
    userId,
    batchId: body.batchId ?? null,
    source: body.source ?? 'activation_page',
    at: new Date().toISOString(),
  });
  try {
    const result = await executeGenerateFullStoreFromSeedCapability({
      missionId: body.missionId ?? null,
      seedId,
      userId,
      batchId: body.batchId ?? null,
      source: body.source ?? 'activation_page',
    });
    const httpStatus = result.ok
      ? 200
      : result.error?.code === 'not_found'
        ? 404
        : result.error?.code === 'AUTH_REQUIRED_FOR_AI'
          ? 401
          : result.status === 'blocked'
            ? 409
            : 400;
    return res.status(httpStatus).json({
      ok: result.ok,
      status: result.status,
      output: result.output,
      error: result.error,
      code: result.code,
      message: result.message,
      failureStage: result.failureStage ?? result.error?.stage ?? null,
      missionId: result.missionId,
      draftStoreId: result.draftStoreId,
      draftId: result.draftId,
      generationRunId: result.generationRunId,
      seedId: result.seedId,
      nextRoute: result.nextRoute,
      completenessScore: result.completenessScore ?? result.output?.completenessScore ?? null,
    });
  } catch (err) {
    console.error('[STORE_BUILD_FAILED]', { seedId, userId, stage: 'runtime_exception', err });
    return res.status(500).json({
      ok: false,
      error: 'performer_store_generation_failed',
      failureStage: 'draft_generation_failed',
      message: 'Store generation failed.',
    });
  }
});

/**
 * POST /api/performer/runtime/capabilities/revise-offer-draft — new offer draft version (no publish).
 */
router.post('/capabilities/revise-offer-draft', optionalAuth, async (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const missionId = typeof body.missionId === 'string' ? body.missionId.trim() : '';
  const storeId = typeof body.storeId === 'string' ? body.storeId.trim() : '';
  const revisionNotes = typeof body.revisionNotes === 'string' ? body.revisionNotes.trim() : '';
  const previousOfferDraft = body.previousOfferDraft;
  if (!missionId) {
    return res.status(400).json({ ok: false, error: 'mission_id_required' });
  }
  if (!storeId) {
    return res.status(400).json({ ok: false, error: 'store_id_required', status: 'blocked' });
  }
  if (!revisionNotes) {
    return res.status(400).json({ ok: false, error: 'revision_notes_required', status: 'blocked' });
  }
  if (!previousOfferDraft || typeof previousOfferDraft !== 'object') {
    return res.status(400).json({ ok: false, error: 'previous_offer_draft_required', status: 'blocked' });
  }
  try {
    const result = await executeReviseOfferDraftCapability({
      missionId,
      storeId,
      previousOfferDraft,
      revisionNotes,
      createdFromExecutionId: body.createdFromExecutionId ?? null,
      draftId: body.draftId ?? null,
      generationRunId: body.generationRunId ?? null,
      userId: req.user?.id ?? null,
      tenantId: req.user?.tenantId ?? null,
    });
    const httpStatus =
      result.status === 'blocked' ? 409 : result.ok ? 200 : 502;
    return res.status(httpStatus).json({
      ok: result.ok,
      status: result.status,
      output: result.output,
      error: result.error,
      code: result.code,
      missionId,
      storeId,
    });
  } catch (err) {
    console.error('[performer/runtime/revise-offer-draft]', err);
    return res.status(500).json({ ok: false, error: 'revise_offer_draft_failed' });
  }
});

/**
 * GET /api/performer/runtime/skills/contracts — skill contract catalog (read-only).
 */
router.get('/skills/contracts', optionalAuth, (_req, res) => {
  return res.json({ ok: true, version: 1, contracts: SKILL_CONTRACTS });
});

/**
 * GET /api/performer/runtime/skills/:skillId/contract
 */
router.get('/skills/:skillId/contract', optionalAuth, (req, res) => {
  const skillId = typeof req.params.skillId === 'string' ? req.params.skillId.trim() : '';
  const contract = getSkillContract(skillId);
  if (!contract) {
    return res.status(404).json({ ok: false, error: 'skill_contract_not_found' });
  }
  return res.json({ ok: true, contract });
});

/**
 * GET /api/performer/runtime/:missionId/executions — persisted execution records.
 */
router.get('/:missionId/executions', optionalAuth, async (req, res) => {
  const missionId = typeof req.params.missionId === 'string' ? req.params.missionId.trim() : '';
  if (!missionId) {
    return res.status(400).json({ ok: false, error: 'mission_id_required' });
  }
  try {
    const records = await listMissionExecutionRecords(missionId);
    return res.json({ ok: true, missionId, records });
  } catch (err) {
    console.error('[performer/runtime/executions GET]', err);
    return res.status(500).json({ ok: false, error: 'executions_list_failed' });
  }
});

/**
 * POST /api/performer/runtime/:missionId/executions — upsert one execution record.
 */
router.post('/:missionId/executions', optionalAuth, async (req, res) => {
  const missionId = typeof req.params.missionId === 'string' ? req.params.missionId.trim() : '';
  if (!missionId) {
    return res.status(400).json({ ok: false, error: 'mission_id_required' });
  }
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const record = normalizeExecutionRecord({ ...body.record, missionId: body.record?.missionId ?? missionId });
  if (!record) {
    return res.status(400).json({ ok: false, error: 'invalid_execution_record' });
  }
  try {
    const bundle = await persistMissionExecutionRecord(missionId, record);
    return res.json({ ok: true, missionId, bundle });
  } catch (err) {
    console.error('[performer/runtime/executions POST]', err);
    return res.status(500).json({ ok: false, error: 'executions_persist_failed' });
  }
});

/**
 * GET /api/performer/runtime/:missionId/stream — unified operational timeline.
 */
router.get('/:missionId/stream', optionalAuth, async (req, res) => {
  const missionId = typeof req.params.missionId === 'string' ? req.params.missionId.trim() : '';
  if (!missionId) {
    return res.status(400).json({ ok: false, error: 'mission_id_required' });
  }
  const afterSeq = req.query.afterSeq != null ? parseInt(String(req.query.afterSeq), 10) : undefined;
  const limit = req.query.limit != null ? parseInt(String(req.query.limit), 10) : undefined;
  const { events, error } = await getUnifiedRuntimeStream(missionId, {
    ...(Number.isFinite(afterSeq) ? { afterSeq } : {}),
    ...(Number.isFinite(limit) ? { limit } : {}),
  });
  if (error) {
    return res.status(400).json({ ok: false, error });
  }
  return res.json({ ok: true, missionId, events });
});

/**
 * GET /api/performer/runtime/:missionId/state — authoritative runtime snapshot.
 */
router.get('/:missionId/state', optionalAuth, async (req, res) => {
  const missionId = typeof req.params.missionId === 'string' ? req.params.missionId.trim() : '';
  if (!missionId) {
    return res.status(400).json({ ok: false, error: 'mission_id_required' });
  }
  const ctx = getRuntimeByMissionId(missionId);
  if (!ctx) {
    return res.json({ ok: true, missionId, runtime: null });
  }
  return res.json({
    ok: true,
    missionId,
    runtime: runtimeContextSnapshot(ctx),
    graph: ctx.actionGraph,
  });
});

/**
 * GET /api/performer/runtime/by-id/:runtimeId — runtime by runtimeId.
 */
router.get('/by-id/:runtimeId', optionalAuth, async (req, res) => {
  const runtimeId = typeof req.params.runtimeId === 'string' ? req.params.runtimeId.trim() : '';
  if (!runtimeId) {
    return res.status(400).json({ ok: false, error: 'runtime_id_required' });
  }
  const ctx = getRuntimeById(runtimeId);
  if (!ctx) {
    return res.json({ ok: true, runtimeId, runtime: null });
  }
  return res.json({
    ok: true,
    runtimeId,
    runtime: runtimeContextSnapshot(ctx),
    graph: ctx.actionGraph,
  });
});

export default router;
