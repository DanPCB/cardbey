/**
 * Missions API: GET /api/missions/recent-for-threads, POST /api/missions/:missionId/dispatch.
 * Permission-safe (reuse canAccessMission); does not change /api/agent-messages.
 */

import { Router } from 'express';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import { requireUserOrGuest } from '../middleware/guestAuth.js';
import { guestSessionId } from '../middleware/guestSession.js';
import { getPrismaClient } from '../lib/prisma.js';
import { canAccessMission } from './agentMessagesRoutes.js';
import { getOrCreateMission, mergeMissionContext } from '../lib/mission.js';
import { createAgentRun } from '../lib/agentRun.js';
import { executeAgentRunInProcess } from '../lib/agentRunExecutor.js';
import { getChainPlan, advanceChainCursor } from '../lib/chainPlan.js';
import { getUnifiedExecutionPlans } from '../lib/missionPlan/unifiedPlan.js';
import { createAgentMessage } from '../orchestrator/lib/agentMessage.js';
import { updateMissionTaskStatus, findMissionTaskById, setMissionTaskRunning } from '../lib/missionTask.js';
import { recordInteractionFeedback, recomputeRewardForAssignment } from '../lib/assignmentReward.js';
import { resolveMissionState } from '../lib/missionPipelineResolver.js';
import { resolveMissionRecoveryState } from '../lib/missionRecoveryState.js';
import {
  createMissionPipeline,
  approveMissionPipeline,
  cancelMissionPipeline,
  retryMissionPipeline,
  resumeMissionPipeline,
  completeMissionWhenNoSteps,
} from '../lib/missionPipelineService.js';
import { executeMissionAction } from '../lib/execution/executeMissionAction.js';
import { runMissionUntilBlocked } from '../lib/missionPipelineOrchestrator.js';
import { planMissionFromIntent } from '../lib/agentPlanner.js';
import { resolveAccessibleMission, getTenantId } from '../lib/missionAccess.js';
import { ensureMissionRowForBlackboard } from '../lib/missionBlackboard.js';
import {
  applyDeprecatedCheckpointHeaders,
  handleExecutionCheckpoint,
  parseExecutionCheckpointBody,
  toExecutionCheckpointHttpResponse,
} from '../lib/execution/handleExecutionCheckpoint.js';
import { executeMission } from '../lib/execution/missionExecutionEngine.js';
import { getOrCreateCardbeyTraceId, CARDBEY_TRACE_HEADER } from '../lib/trace/cardbeyTraceId.js';
import { shouldOfferLlmTaskGraph } from '../lib/missionPlan/intentPipelineRegistry.js';
import { getEvents } from '../lib/missionBlackboard.js';
import { handleAgentsV1MissionSpawn } from './agentsV1Routes.js';
import { extractTextWithFallback } from '../lib/ocr/ocrFallback.js';
import { parseBusinessCardOCR } from '../lib/businessCardParser.js';
import { businessCardLooksLikeOcrText, isRefusalResponse } from '../modules/vision/runOcr.js';

const router = Router();

/** Guest performer console: mission reads without JWT when X-Guest-Session / guest cookie is present. */
const requireMissionReadAuth = [guestSessionId, requireUserOrGuest];

const MAX_CARD_IMAGE_DATA_URL_LENGTH = 8 * 1024 * 1024;

/** Best-effort vertical slug for create-store UI when parser has no category field. */
function inferVerticalFromCardText(businessName, ocrText) {
  const blob = `${businessName || ''} ${ocrText || ''}`.toLowerCase();
  if (/\b(furniture|furnishings|sofa|cabinet|interior\s+design)\b/.test(blob)) return 'furniture';
  if (/\b(hair|salon|beauty|spa|nails|barber)\b/.test(blob)) return 'beauty';
  if (/\b(restaurant|cafe|coffee|food|catering)\b/.test(blob)) return 'food_beverage';
  if (/\b(car\s*wash|automotive|mechanic|tyre|tire)\b/.test(blob)) return 'automotive';
  if (/\b(garden|landscap|nursery|hardware)\b/.test(blob)) return 'home_garden';
  return null;
}

// ---------- Mission Pipeline v1 (skeleton): POST / create must be before /:missionId ----------
// Gate 1: store creation (type === 'store') allowed without sign-in; all other types require auth.
router.post('/', optionalAuth, async (req, res, next) => {
  try {
    const body = req.body ?? {};
    const type = typeof body.type === 'string' ? body.type.trim() : '';
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const targetType = typeof body.targetType === 'string' ? body.targetType.trim() : 'generic';
    if (!type || !title) {
      return res.status(400).json({
        ok: false,
        error: 'validation',
        message: 'type and title are required',
      });
    }
    const guestAllowedMissionTypes = new Set(['store', 'create_personal_profile']);
    if (!req.user?.id && !guestAllowedMissionTypes.has(type)) {
      return res.status(401).json({ ok: false, error: 'unauthorized', message: 'Not authenticated' });
    }
    const requiresConfirmation = Boolean(body.requiresConfirmation);
    const result = await createMissionPipeline({
      type,
      title,
      targetType,
      targetId: body.targetId,
      targetLabel: body.targetLabel,
      metadata: body.context ?? body.metadata ?? {},
      requiresConfirmation,
      executionMode: 'AUTO_RUN',
      tenantId: req.user ? getTenantId(req.user) : null,
      createdBy: req.user?.id ?? null,
    });
    console.log('[MISSION_DEBUG] POST /api/missions', {
      type: body.type ?? body.intentType,
      title: body.title,
      requiresConfirmation: Boolean(body.requiresConfirmation),
      resultId: result?.id,
      resultStatus: result?.status,
    });
    // Auto-start is handled by runMissionUntilBlocked (avoids concurrent runners).
    console.log('[MISSION_DEBUG] auto-start guard:', {
      requiresConfirmation: Boolean(body.requiresConfirmation),
      willAutoStart: !Boolean(body.requiresConfirmation),
    });
    if (process.env.NODE_ENV !== 'production') console.log('[MissionAPI] create');
    const { createMissionRun } = await import('../lib/missionRouter.js');
    const run = await createMissionRun({
      userId: req.user?.id ?? 'temp',
      storeId: body.targetId ?? body.storeId ?? null,
      intentType: body.type ?? body.intentType ?? type,
      title: body.title ?? title,
      mode: 'fast',
      requiresConfirmation: body.requiresConfirmation ?? false,
      context: body.context ?? {},
    });
    if (result.status === 'queued') {
      const orchestration = await runMissionUntilBlocked(result.id);
      return res.status(201).json({
        ok: true,
        missionId: result.id,
        status: orchestration.status,
        stepsCreated: result.stepsCreated,
        orchestration: { stepsRun: orchestration.stepsRun, stoppedReason: orchestration.stoppedReason },
        missionRunId: run?.id,
      });
    }
    return res.status(201).json({
      ok: true,
      missionId: result.id,
      status: result.status,
      stepsCreated: result.stepsCreated,
      missionRunId: run?.id,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/missions/active
 * One-shot recovery helper for clients when a mission-start signal arrives without missionId.
 * Returns the most recently updated "active-ish" MissionPipeline row scoped to the authenticated user/tenant.
 */
router.get('/active', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'unauthorized', message: 'Not authenticated' });
    }
    const tenantId = getTenantId(req.user) || userId;
    const prisma = getPrismaClient();
    const row = await prisma.missionPipeline.findFirst({
      where: {
        status: { in: ['requested', 'planned', 'awaiting_confirmation', 'queued', 'executing', 'paused'] },
        OR: [{ tenantId }, { createdBy: userId }],
      },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        type: true,
        title: true,
        status: true,
        runState: true,
        executionMode: true,
        updatedAt: true,
      },
    });
    return res.status(200).json({
      ok: true,
      mission: row
        ? {
            missionId: row.id,
            type: row.type,
            title: row.title,
            status: row.status,
            runState: row.runState,
            executionMode: row.executionMode,
            updatedAt: row.updatedAt,
          }
        : null,
    });
  } catch (err) {
    next(err);
  }
});

// ---------- Agent Planner v1: POST /plan (must be before /:missionId) ----------
// Gate 1: store-creation intent allowed without sign-in; all other intents require auth.
router.post('/plan', optionalAuth, async (req, res, next) => {
  try {
    const body = req.body ?? {};
    const intent = typeof body.intent === 'string' ? body.intent.trim() : '';
    const context = body.context && typeof body.context === 'object' ? body.context : {};
    const result = planMissionFromIntent({ intent, context });
    if (!result.ok) {
      const status = (result.reason === 'MISSING_STORE_CONTEXT' || result.reason === 'MISSING_PROMOTION_CONTEXT') ? 400 : 404;
      return res.status(status).json({ ok: false, reason: result.reason });
    }
    const guestPlanTypes = new Set(['store', 'create_personal_profile']);
    if (!req.user?.id && !guestPlanTypes.has(result.missionPlan?.missionType)) {
      return res.status(401).json({ ok: false, error: 'unauthorized', message: 'Not authenticated' });
    }

    /** @type {{ ok: true, missionPlan: object, taskGraph?: object, taskGraphSource?: string }} */
    const payload = { ok: true, missionPlan: result.missionPlan };
    if (result.missionPlan && shouldOfferLlmTaskGraph(result.missionPlan.missionType)) {
      const { planTaskGraphForIntent } = await import('../lib/agentPlanning/llmTaskPlanner.js');
      const tenantKey = req.user ? getTenantId(req.user) : 'guest_mission_plan';
      const graphRes = await planTaskGraphForIntent({
        intentType: result.missionPlan.missionType,
        context: { ...context, storeId: result.missionPlan.targetId },
        tenantKey,
      });
      if (graphRes.ok && graphRes.taskGraph) {
        payload.taskGraph = graphRes.taskGraph;
        payload.taskGraphSource = graphRes.source;
        payload.missionPlan = {
          ...result.missionPlan,
          metadata: {
            ...(result.missionPlan.metadata && typeof result.missionPlan.metadata === 'object'
              ? result.missionPlan.metadata
              : {}),
            taskGraph: graphRes.taskGraph,
            taskGraphSource: graphRes.source,
          },
        };
      }
    }

    if (process.env.EXECUTE_INTENT_SHADOW === 'true') {
      const { scheduleExecuteIntentShadow } = await import('../lib/intake/intakeConsolidationFlags.js');
      const intentForShadow = intent;
      const ctxForShadow = { ...context };
      scheduleExecuteIntentShadow({
        source: 'api',
        rawInput: intentForShadow,
        context: ctxForShadow,
        correlationId: null,
      });
    }

    return res.json(payload);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/missions/extract-card
 * Vision OCR + business-card parser; same pipeline as POST /api/agent-chat/attachments/ocr (without mission row).
 * Body: { cardImageDataUrl: string } — base64 data URL (data:image/...).
 */
router.post('/extract-card', requireAuth, async (req, res) => {
  try {
    const { cardImageDataUrl } = req.body ?? {};
    if (!cardImageDataUrl || typeof cardImageDataUrl !== 'string' || !cardImageDataUrl.startsWith('data:image/')) {
      return res.status(400).json({
        ok: false,
        error: 'cardImageDataUrl is required (data:image/...)',
      });
    }
    if (cardImageDataUrl.length > MAX_CARD_IMAGE_DATA_URL_LENGTH) {
      return res.status(413).json({
        ok: false,
        error: 'IMAGE_TOO_LARGE',
        message: 'Image is too large for OCR. Please use a smaller image.',
      });
    }

    const mimeMatch =
      typeof cardImageDataUrl === 'string' ? cardImageDataUrl.match(/^data:(image\/[^;]+)/) : null;
    console.log('[extract-card] processing...', {
      inputMime: mimeMatch?.[1] ?? 'unknown',
      dataUrlLength: cardImageDataUrl.length,
    });

    let ocrResult;
    try {
      ocrResult = await extractTextWithFallback({
        imageDataUrl: cardImageDataUrl,
        purpose: 'business_card',
      });
    } catch (ocrErr) {
      console.error('[extract-card] OCR error:', ocrErr?.message || ocrErr);
      return res.status(502).json({
        ok: false,
        error: 'Card extraction failed',
        detail: ocrErr?.message || 'OCR failed',
      });
    }

    const extractedText = ocrResult?.text ?? '';
    const rawTextLog =
      typeof extractedText === 'string' && extractedText.length > 6000
        ? `${extractedText.slice(0, 6000)}\n… [truncated ${extractedText.length} chars]`
        : extractedText;
    console.log('[extract-card] vision raw response:', rawTextLog);
    if (isRefusalResponse(extractedText) || !businessCardLooksLikeOcrText(extractedText)) {
      console.warn('[extract-card] OCR refusal or unreadable card text');
      return res.status(502).json({
        ok: false,
        error: 'OCR_FAILED',
        message: 'OCR did not return usable business card text.',
      });
    }

    const parsed = parseBusinessCardOCR(extractedText, { country: 'AU' });
    console.log('[extract-card] parsed result:', {
      extractedEntities: parsed.extractedEntities,
      rawLines: parsed.meta?.rawLines,
      confidence: parsed.confidence,
    });
    const entities = parsed.extractedEntities && typeof parsed.extractedEntities === 'object'
      ? parsed.extractedEntities
      : {};
    const rawLines = Array.isArray(parsed.meta?.rawLines) ? parsed.meta.rawLines : [];
    let businessName =
      typeof entities.businessName === 'string' && entities.businessName.trim()
        ? entities.businessName.trim()
        : typeof entities.name === 'string' && entities.name.trim()
          ? entities.name.trim()
          : null;
    if (!businessName && rawLines.length > 0) {
      const first = String(rawLines[0] ?? '').trim();
      if (
        first.length >= 3 &&
        first.length < 100 &&
        !/@/.test(first) &&
        !/^https?:\/\//i.test(first) &&
        !/^\s*(?:\+?61|0)\s*\d/.test(first)
      ) {
        businessName = first;
      }
    }
    if (!businessName) {
      const debugOcr =
        process.env.DEBUG_OCR === 'true' ||
        process.env.DEBUG_OCR === '1' ||
        process.env.DEBUG_VISION === 'true' ||
        process.env.DEBUG_VISION === '1';
      console.warn('[extract-card] businessName extraction failed', {
        providerUsed: ocrResult?.providerUsed ?? null,
        didFallback: Boolean(ocrResult?.didFallback),
        extractedTextLength: typeof extractedText === 'string' ? extractedText.length : 0,
        ...(debugOcr
          ? {
              rawLinesTop: rawLines.slice(0, 6),
              extractedTextPreview: extractedText.slice(0, 400),
            }
          : {}),
      });
    }
    const location =
      typeof entities.address === 'string' && entities.address.trim()
        ? entities.address.trim()
        : typeof entities.suburb === 'string' && entities.suburb.trim()
          ? entities.suburb.trim()
          : typeof entities.city === 'string' && entities.city.trim()
            ? entities.city.trim()
            : null;
    const vertical =
      (typeof entities.vertical === 'string' && entities.vertical.trim() && entities.vertical.trim()) ||
      (typeof entities.category === 'string' && entities.category.trim() && entities.category.trim()) ||
      (typeof entities.storeType === 'string' && entities.storeType.trim() && entities.storeType.trim()) ||
      inferVerticalFromCardText(businessName, extractedText);

    const nameConf = parsed.confidence && typeof parsed.confidence.businessName === 'number'
      ? parsed.confidence.businessName
      : null;
    const confidence =
      typeof nameConf === 'number' && Number.isFinite(nameConf)
        ? nameConf
        : businessName
          ? 0.8
          : 0.5;

    return res.json({
      ok: true,
      businessName,
      location,
      vertical,
      confidence,
    });
  } catch (err) {
    console.error('[extract-card] failed:', err?.message || err);
    return res.status(500).json({
      ok: false,
      error: 'Card extraction failed',
      detail: err?.message || String(err),
    });
  }
});

// OpenClaw child spawn — same handler as POST /api/agents/v1/:missionId/spawn (frontend aliases).
router.post('/:missionId/openclaw/spawn-child', requireAuth, handleAgentsV1MissionSpawn);
router.post('/:missionId/spawn-child', requireAuth, handleAgentsV1MissionSpawn);

/**
 * GET /api/missions/:missionId/recovery-state
 * Store / website missions: workflowState, draft ids, review readiness, CTAs.
 * When USE_OUTPUT_VALIDATION is off and all steps completed, returns workflowState=ready (no needsAttention).
 */
router.get('/:missionId/recovery-state', ...requireMissionReadAuth, async (req, res, next) => {
  try {
    const missionId = typeof req.params.missionId === 'string' ? req.params.missionId.trim() : '';
    if (!missionId) {
      return res.status(400).json({ ok: false, error: 'mission_id_required', message: 'missionId is required' });
    }
    const access = await resolveAccessibleMission(req.user, missionId);
    if (!access.ok || access.kind !== 'mission_pipeline') {
      return res.status(404).json({ ok: false, error: 'not_found', message: 'Mission pipeline not found or access denied' });
    }
    const recovery = await resolveMissionRecoveryState(missionId);
    if (!recovery) {
      return res.status(404).json({ ok: false, error: 'not_found', message: 'Mission pipeline not found' });
    }
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ ok: true, ...recovery });
  } catch (err) {
    next(err);
  }
});

router.get('/:missionId/state', ...requireMissionReadAuth, async (req, res, next) => {
  try {
    const missionId = typeof req.params.missionId === 'string' ? req.params.missionId.trim() : '';
    if (process.env.NODE_ENV !== 'production') {
      console.log('[MissionAPI] state route hit missionId=', missionId);
    }
    if (!missionId) {
      return res.status(400).json({ ok: false, error: 'mission_id_required', message: 'missionId is required' });
    }
    const access = await resolveAccessibleMission(req.user, missionId);
    if (access.ok && access.kind === 'mission_pipeline') {
      const state = await resolveMissionState(missionId);
      if (state) {
        if (process.env.NODE_ENV !== 'production') {
          console.log(`[Mission] resolver: mission=${missionId} status=${state.status} runState=${state.runState}`);
        }
        res.setHeader('Cache-Control', 'no-store');
        return res.json({ ok: true, state });
      }
    }

    // Try MissionRun (new unified model)
    const { getMissionRunState } = await import('../lib/missionRouter.js');
    const runState = await getMissionRunState(missionId);
    if (runState) {
      const prisma = getPrismaClient();
      const run = await prisma.missionRun.findUnique({
        where: { id: missionId },
        select: { userId: true },
      });
      if (run && run.userId === req.user?.id) {
        res.setHeader('Cache-Control', 'no-store');
        return res.json({ ok: true, state: runState });
      }
    }

    if (process.env.NODE_ENV !== 'production') {
      console.log('[MissionAPI] state 404 missionId=', missionId, 'reason=access_denied_or_not_found', 'accessOk=', access?.ok, 'kind=', access?.kind);
    }
    return res.status(404).json({ ok: false, error: 'not_found', message: 'Mission pipeline not found or access denied' });
  } catch (err) {
    next(err);
  }
});

router.post('/:missionId/approve', requireAuth, async (req, res, next) => {
  try {
    const missionId = typeof req.params.missionId === 'string' ? req.params.missionId.trim() : '';
    if (!missionId) {
      return res.status(400).json({ ok: false, error: 'mission_id_required', message: 'missionId is required' });
    }
    const access = await resolveAccessibleMission(req.user, missionId);
    if (!access.ok || access.kind !== 'mission_pipeline') {
      return res.status(404).json({ ok: false, error: 'not_found', message: 'Mission pipeline not found or access denied' });
    }
    const result = await approveMissionPipeline(missionId);
    if (!result.ok) {
      const code = result.error === 'invalid_state' ? 409 : 404;
      return res.status(code).json({ ok: false, error: result.error, status: result.status });
    }
    // Orchestration handles sequential execution (avoid concurrent runners).
    const orchestration = await runMissionUntilBlocked(missionId);
    if (orchestration.stoppedReason === 'no_pending_steps' && orchestration.status === 'queued') {
      await completeMissionWhenNoSteps(missionId);
    }
    const finalStatus = orchestration.stoppedReason === 'no_pending_steps' && orchestration.status === 'queued'
      ? 'completed'
      : orchestration.status;
    return res.json({
      ok: true,
      status: finalStatus,
      orchestration: { stepsRun: orchestration.stepsRun, stoppedReason: orchestration.stoppedReason },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/missions/:missionId/run
 * Confirm & run a store MissionPipeline by starting the real build_store orchestration.
 * Body: { businessName, businessType, location }
 * requireAuth; mission owner only.
 *
 * Notes:
 * - MissionPipeline statuses are strict; we transition to `queued` (if awaiting_confirmation) then `executing`.
 * - We persist { jobId, generationRunId, draftId } to MissionPipeline.outputsJson so GET /state exposes them.
 * - We run the orchestration job in the background and mirror completion back onto MissionPipeline.
 */
router.post('/:missionId/run', requireAuth, async (req, res, next) => {
  try {
    const missionId = typeof req.params.missionId === 'string' ? req.params.missionId.trim() : '';
    if (!missionId) {
      return res.status(400).json({ ok: false, error: 'mission_id_required', message: 'missionId is required' });
    }

    const cardbeyTraceId = getOrCreateCardbeyTraceId(req);
    res.setHeader(CARDBEY_TRACE_HEADER, cardbeyTraceId);

    const prisma = getPrismaClient();
    const runResult = await executeMission({
      mode: 'checkpoint_pipeline',
      prisma,
      user: req.user,
      missionId,
      body: { ...(req.body ?? {}), cardbeyTraceId },
      auditSource: 'missions_store_run',
      source: 'missions_store_run',
    });

    if (!runResult.ok) {
      const errBody = {
        ok: false,
        error: runResult.error,
        message: runResult.message,
        ...(runResult.pipelineStatus != null ? { status: runResult.pipelineStatus } : {}),
      };
      return res.status(runResult.statusCode).json(errBody);
    }

    return res.status(200).json({
      ok: true,
      missionId: runResult.missionId,
      jobId: runResult.jobId,
      generationRunId: runResult.generationRunId,
      draftId: runResult.draftId,
      status: runResult.status,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/missions/:missionId/regenerate-catalog
 * Re-run catalog generation for a store mission draft. Completed missions no longer have an
 * in-memory ReAct blackboard — full regeneration is queued for a future worker hook.
 */
router.post('/:missionId/regenerate-catalog', requireAuth, async (req, res, next) => {
  try {
    const missionId = typeof req.params.missionId === 'string' ? req.params.missionId.trim() : '';
    if (!missionId) {
      return res.status(400).json({ ok: false, error: 'mission_id_required', message: 'missionId is required' });
    }
    const access = await resolveAccessibleMission(req.user, missionId);
    if (!access.ok || access.kind !== 'mission_pipeline') {
      return res.status(404).json({ ok: false, error: 'not_found', message: 'Mission pipeline not found or access denied' });
    }
    // TODO: When a durable job exists to re-invoke executeWithReAct catalog + finalizeDraft for this draftId,
    // enqueue it here. executeBusinessCatalogForReact / MissionReactBlackboard are not available post-completion.
    return res.status(202).json({
      ok: true,
      queued: true,
      message: 'Regeneration queued',
      missionId,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/:missionId/cancel', requireAuth, async (req, res, next) => {
  try {
    const missionId = typeof req.params.missionId === 'string' ? req.params.missionId.trim() : '';
    if (!missionId) {
      return res.status(400).json({ ok: false, error: 'mission_id_required', message: 'missionId is required' });
    }
    const access = await resolveAccessibleMission(req.user, missionId);
    if (!access.ok) {
      return res.status(404).json({ ok: false, error: 'not_found', message: 'Mission not found or access denied' });
    }

    const userId = req.user?.id ?? null;
    const reason =
      typeof req.body?.reason === 'string' && req.body.reason.trim() ? req.body.reason.trim() : null;

    if (access.kind === 'mission_pipeline') {
      const result = await cancelMissionPipeline(missionId, { userId, reason });
      if (!result.ok) {
        const code = result.error === 'already_terminal' ? 409 : 404;
        return res.status(code).json({ ok: false, error: result.error, status: result.status });
      }
      return res.json({ ok: true, status: result.status, runState: 'done' });
    }

    if (access.kind === 'mission') {
      const pipelineCancel = await cancelMissionPipeline(missionId, { userId, reason });
      if (pipelineCancel.ok) {
        return res.json({ ok: true, status: pipelineCancel.status ?? 'cancelled', runState: 'done' });
      }
      const prisma = getPrismaClient();
      try {
        const row = await prisma.mission.findUnique({ where: { id: missionId }, select: { status: true } });
        if (!row) {
          return res.status(404).json({ ok: false, error: 'not_found', message: 'Mission not found' });
        }
        const st = String(row.status || '').toLowerCase();
        if (st === 'cancelled' || st === 'canceled') {
          return res.json({ ok: true, status: 'cancelled', runState: 'done' });
        }
        if (st === 'completed') {
          return res.status(409).json({ ok: false, error: 'already_terminal', status: row.status });
        }
        await prisma.mission.update({
          where: { id: missionId },
          data: { status: 'cancelled', updatedAt: new Date() },
        });
        return res.json({ ok: true, status: 'cancelled', runState: 'done' });
      } catch (e) {
        if (e?.code === 'P2025') {
          return res.status(404).json({ ok: false, error: 'not_found', message: 'Mission not found' });
        }
        throw e;
      }
    }

    return res.status(404).json({ ok: false, error: 'not_found', message: 'Mission not found' });
  } catch (err) {
    next(err);
  }
});

router.post('/:missionId/retry', requireAuth, async (req, res, next) => {
  try {
    const missionId = typeof req.params.missionId === 'string' ? req.params.missionId.trim() : '';
    if (!missionId) {
      return res.status(400).json({ ok: false, error: 'mission_id_required', message: 'missionId is required' });
    }
    const access = await resolveAccessibleMission(req.user, missionId);
    if (!access.ok) {
      return res.status(404).json({ ok: false, error: 'not_found', message: 'Mission not found or access denied' });
    }

    if (access.kind === 'mission_pipeline') {
      const result = await retryMissionPipeline(missionId);
      if (!result.ok) {
        const code = result.error === 'invalid_state' ? 409 : 404;
        return res.status(code).json({ ok: false, error: result.error, status: result.status });
      }
      return res.json({ ok: true, status: result.status });
    }

    if (access.kind === 'mission') {
      const prisma = getPrismaClient();
      try {
        const row = await prisma.mission.findUnique({ where: { id: missionId }, select: { status: true } });
        if (!row) {
          return res.status(404).json({ ok: false, error: 'not_found', message: 'Mission not found' });
        }
        if (String(row.status || '').toLowerCase() !== 'failed') {
          return res.status(409).json({ ok: false, error: 'invalid_state', status: row.status });
        }
        await prisma.mission.update({
          where: { id: missionId },
          data: { status: 'active', updatedAt: new Date() },
        });
        return res.json({ ok: true, status: 'active' });
      } catch (e) {
        if (e?.code === 'P2025') {
          return res.status(404).json({ ok: false, error: 'not_found', message: 'Mission not found' });
        }
        throw e;
      }
    }

    return res.status(404).json({ ok: false, error: 'not_found', message: 'Mission not found' });
  } catch (err) {
    next(err);
  }
});

router.post('/:missionId/store-research/confirm', requireAuth, async (req, res, next) => {
  try {
    const missionId = typeof req.params.missionId === 'string' ? req.params.missionId.trim() : '';
    if (!missionId) {
      return res.status(400).json({ ok: false, error: 'mission_id_required', message: 'missionId is required' });
    }
    const access = await resolveAccessibleMission(req.user, missionId);
    if (!access.ok) {
      return res.status(404).json({ ok: false, error: 'not_found', message: 'Mission not found or access denied' });
    }
    const actionRaw = typeof req.body?.action === 'string' ? req.body.action.trim().toLowerCase() : '';
    const action = actionRaw === 'reject_fallback' ? 'reject_fallback' : 'accept';
    const services = Array.isArray(req.body?.services) ? req.body.services : undefined;
    const { applyStoreResearchReviewDecision } = await import(
      '../services/storeCreationResearch/storeResearchReviewService.js'
    );
    const result = await applyStoreResearchReviewDecision({ missionId, action, services });
    if (!result.ok && result.reason === 'no_pending_research') {
      return res.status(409).json({
        ok: false,
        error: 'no_pending_research',
        message: 'No researched catalog is waiting for your review',
      });
    }
    if (!result.ok && result.reason === 'already_confirmed') {
      return res.status(409).json({
        ok: false,
        error: 'already_confirmed',
        message: 'Research catalog was already accepted',
      });
    }
    if (!result.ok) {
      return res.status(400).json({
        ok: false,
        error: result.error || 'store_research_confirm_failed',
        message: result.message || result.error || 'Could not save your catalog review',
      });
    }
    return res.json({
      ok: true,
      action: result.action,
      accepted: result.accepted === true,
      rejected: result.rejected === true,
      serviceCount: result.serviceCount ?? null,
    });
  } catch (err) {
    const message = err?.message || 'Could not save your catalog review';
    console.error('[store-research/confirm] failed:', message);
    return res.status(500).json({
      ok: false,
      error: message,
      message,
      retryable: true,
    });
  }
});

router.post('/:missionId/qa-fixes/approve', requireAuth, async (req, res, next) => {
  try {
    const missionId = typeof req.params.missionId === 'string' ? req.params.missionId.trim() : '';
    if (!missionId) {
      return res.status(400).json({ ok: false, error: 'mission_id_required', message: 'missionId is required' });
    }
    const access = await resolveAccessibleMission(req.user, missionId);
    if (!access.ok) {
      return res.status(404).json({ ok: false, error: 'not_found', message: 'Mission not found or access denied' });
    }
    const actionRaw = typeof req.body?.action === 'string' ? req.body.action.trim().toLowerCase() : '';
    const decision = actionRaw === 'approve_all' ? 'approve_all' : 'skip_all';
    console.log('[QaCheckpointResume] backend_received', { missionId, decision });
    const { applyPendingStoreBuildQaTier2Fixes } = await import('../services/qa/storeBuildQaAutoFix.js');
    const result = await applyPendingStoreBuildQaTier2Fixes({
      missionId,
      decision,
    });
    console.log('[QaCheckpointResume] backend_apply_result', { missionId, decision, result });
    if (!result.ok && result.reason === 'no_pending_tier2') {
      return res.status(409).json({
        ok: false,
        error: 'no_pending_qa_fixes',
        message: 'No catalog improvements are waiting for approval',
      });
    }
    if (!result.ok) {
      return res.status(400).json({
        ok: false,
        error: result.error || 'qa_approval_failed',
        message: result.error || 'Could not apply catalog improvements',
      });
    }
    return res.json({
      ok: true,
      action: decision,
      applied: result.applied === true,
      skipped: result.skipped === true,
      autoFixed: result.autoFixed ?? [],
    });
  } catch (err) {
    const message = err?.message || 'Could not apply catalog improvements';
    console.error('[qa-fixes/approve] failed:', message);
    return res.status(500).json({
      ok: false,
      error: message,
      message,
      retryable: true,
    });
  }
});

router.post('/:missionId/resume', requireAuth, async (req, res, next) => {
  try {
    const missionId = typeof req.params.missionId === 'string' ? req.params.missionId.trim() : '';
    if (!missionId) {
      return res.status(400).json({ ok: false, error: 'mission_id_required', message: 'missionId is required' });
    }
    const access = await resolveAccessibleMission(req.user, missionId);
    if (!access.ok || access.kind !== 'mission_pipeline') {
      return res.status(404).json({ ok: false, error: 'not_found', message: 'Mission pipeline not found or access denied' });
    }
    const result = await resumeMissionPipeline(missionId);
    if (!result.ok) {
      const code = result.error === 'invalid_state' ? 409 : 404;
      return res.status(code).json({ ok: false, error: result.error, status: result.status });
    }
    const orchestration = await runMissionUntilBlocked(missionId);
    return res.json({
      ok: true,
      status: orchestration.status,
      orchestration: { stepsRun: orchestration.stepsRun, stoppedReason: orchestration.stoppedReason },
    });
  } catch (err) {
    next(err);
  }
});

// Manual: run mission until blocked/completed/failed (same auth as other pipeline actions).
router.post('/:missionId/run-until-blocked', requireAuth, async (req, res, next) => {
  try {
    const missionId = typeof req.params.missionId === 'string' ? req.params.missionId.trim() : '';
    if (!missionId) {
      return res.status(400).json({ ok: false, error: 'mission_id_required', message: 'missionId is required' });
    }
    const access = await resolveAccessibleMission(req.user, missionId);
    if (!access.ok || access.kind !== 'mission_pipeline') {
      return res.status(404).json({ ok: false, error: 'not_found', message: 'Mission pipeline not found or access denied' });
    }
    const maxSteps = typeof req.body?.maxSteps === 'number' && req.body.maxSteps > 0 ? req.body.maxSteps : undefined;
    const result = await runMissionUntilBlocked(missionId, maxSteps != null ? { maxSteps } : {});
    return res.json({
      ok: result.ok,
      missionId: result.missionId,
      status: result.status,
      runState: result.runState,
      stepsRun: result.stepsRun,
      stoppedReason: result.stoppedReason,
    });
  } catch (err) {
    next(err);
  }
});

// DEV / verification: run next pipeline step (manual trigger). Same auth as other pipeline actions.
router.post('/:missionId/run-next-step', requireAuth, async (req, res, next) => {
  try {
    const missionId = typeof req.params.missionId === 'string' ? req.params.missionId.trim() : '';
    if (!missionId) {
      return res.status(400).json({ ok: false, error: 'mission_id_required', message: 'missionId is required' });
    }
    const access = await resolveAccessibleMission(req.user, missionId);
    if (!access.ok || access.kind !== 'mission_pipeline') {
      return res.status(404).json({ ok: false, error: 'not_found', message: 'Mission pipeline not found or access denied' });
    }
    const facade = await executeMissionAction({
      actionType: 'run_pipeline_step',
      missionId,
      source: 'missions_api_run_next_step',
    });
    const result =
      facade.output && typeof facade.output === 'object'
        ? facade.output
        : { ok: false, error: facade.error?.code || 'facade_failed' };
    if (!result.ok) {
      const code = result.error === 'not_found' ? 404 : result.error === 'invalid_state' ? 409 : 400;
      return res.status(code).json({ ok: false, error: result.error, status: result.status });
    }
    return res.json({
      ok: true,
      stepRun: result.stepRun,
      ...(result.toolName && { toolName: result.toolName }),
      ...(result.status && { status: result.status }),
      ...(result.runState && { runState: result.runState }),
    });
  } catch (err) {
    next(err);
  }
});

// ---------- Existing missions API ----------

/**
 * GET /api/missions/recent-for-threads?limit=20&query=...
 * requireAuth; returns { missions: [{ missionId, title?, updatedAt, status? }] }.
 * Only missions passing canAccessMission (tenant/user match); entryPoint = agent-chat.
 */

/**
 * POST /api/missions/:missionId/dispatch
 * Create an AgentRun (status queued). Same permission as /api/agent-messages (canAccessMission).
 * Body: { taskId?, triggerMessageId?, targetAgent?, chainId?, suggestionId?, intent? }
 * When taskId is present: load task, create run with task's agentKeyRecommended/intent, set task running, execute.
 */
router.post('/:missionId/dispatch', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'unauthorized', message: 'Not authenticated' });
    }
    const missionIdRaw = req.params.missionId;
    const missionIdTrimmed = typeof missionIdRaw === 'string' ? missionIdRaw.trim() : '';
    if (!missionIdTrimmed) {
      return res.status(400).json({ ok: false, error: 'mission_id_required', message: 'missionId is required' });
    }
    const allowed = await canAccessMission(missionIdTrimmed, req.user);
    if (!allowed) {
      return res.status(403).json({
        ok: false,
        error: 'forbidden',
        code: 'FORBIDDEN_MISSION',
        message: 'You do not have access to this mission.',
      });
    }
    const mission = await getOrCreateMission(missionIdTrimmed, req.user);
    const tenantId = mission.tenantId || getTenantId(req.user) || userId;
    const body = req.body ?? {};
    const taskId = typeof body.taskId === 'string' && body.taskId.trim() ? body.taskId.trim() : null;

    let agentKey, triggerMessageId, inputOrUndefined;

    if (taskId) {
      const task = await findMissionTaskById(missionIdTrimmed, taskId);
      if (!task) {
        return res.status(404).json({ ok: false, error: 'not_found', message: 'Task not found' });
      }
      if (task.status === 'running') {
        return res.status(409).json({ ok: false, error: 'already_running', message: 'Task is already running' });
      }
      agentKey = (task.agentKeyRecommended || task.agentKey || 'planner').trim() || 'planner';
      triggerMessageId = null;
      inputOrUndefined = {
        taskId,
        intent: task.intent || undefined,
        chainId: task.chainId || undefined,
        suggestionId: task.suggestionId || undefined,
        ...(typeof body.storeId === 'string' && body.storeId.trim() && { storeId: body.storeId.trim() }),
        ...(typeof body.generationRunId === 'string' && body.generationRunId.trim() && { generationRunId: body.generationRunId.trim() }),
      };
    } else {
      agentKey = body.targetAgent === 'research' ? 'research' : body.targetAgent === 'planner' ? 'planner' : body.targetAgent === 'ocr' ? 'ocr' : 'planner';
      triggerMessageId = typeof body.triggerMessageId === 'string' && body.triggerMessageId.trim() ? body.triggerMessageId.trim() : null;
      const chainId = typeof body.chainId === 'string' && body.chainId.trim() ? body.chainId.trim() : null;
      const suggestionId = typeof body.suggestionId === 'string' && body.suggestionId.trim() ? body.suggestionId.trim() : null;
      const input = {
        ...(body.intent != null && { intent: body.intent }),
        ...(chainId && { chainId }),
        ...(suggestionId && { suggestionId }),
        ...(typeof body.storeId === 'string' && body.storeId.trim() && { storeId: body.storeId.trim() }),
        ...(typeof body.generationRunId === 'string' && body.generationRunId.trim() && { generationRunId: body.generationRunId.trim() }),
      };
      inputOrUndefined = Object.keys(input).length > 0 ? input : undefined;
    }

    const prisma = getPrismaClient();
    if (!taskId && agentKey === 'ocr' && triggerMessageId) {
      const existing = await prisma.agentRun.findFirst({
        where: { missionId: missionIdTrimmed, triggerMessageId, agentKey: 'ocr' },
        select: { id: true, status: true },
      });
      if (existing) {
        return res.status(200).json({
          ok: true,
          missionId: missionIdTrimmed,
          runId: existing.id,
          agentKey: 'ocr',
          status: existing.status,
          alreadyExisted: true,
        });
      }
    }

    const run = await createAgentRun({
      missionId: missionIdTrimmed,
      tenantId,
      agentKey,
      triggerMessageId,
      input: inputOrUndefined,
    });

    let updatedTask = null;
    if (taskId) {
      updatedTask = await setMissionTaskRunning(taskId, run.id).catch((err) => {
        if (process.env.NODE_ENV !== 'production') {
          console.warn('[missions/dispatch] setMissionTaskRunning failed:', err?.message || err);
        }
        return null;
      });
      if (!updatedTask) {
        updatedTask = await findMissionTaskById(missionIdTrimmed, taskId);
      }
    }

    const runInProcess =
      (agentKey === 'research' && process.env.MISSION_RUN_INPROCESS === 'true') ||
      (agentKey === 'planner' && (process.env.MISSION_PLANNER_INPROCESS === 'true' || taskId)) ||
      agentKey === 'ocr';
    if (runInProcess) {
      executeAgentRunInProcess(run.id).catch((err) => {
        console.warn('[missions/dispatch] in-process run failed:', err?.message || err);
      });
    }
    return res.status(201).json({
      ok: true,
      missionId: missionIdTrimmed,
      runId: run.id,
      agentKey,
      status: 'queued',
      ...(taskId && { taskId }),
      ...(updatedTask && { task: updatedTask }),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/missions/:missionId/tasks
 * List MissionTasks for the mission (order by createdAt asc). requireAuth + canAccessMission.
 */
router.get('/:missionId/tasks', requireAuth, async (req, res, next) => {
  try {
    const missionIdTrimmed = typeof req.params.missionId === 'string' ? req.params.missionId.trim() : '';
    if (!missionIdTrimmed) {
      return res.status(400).json({ ok: false, error: 'mission_id_required', message: 'missionId is required' });
    }
    const allowed = await canAccessMission(missionIdTrimmed, req.user);
    if (!allowed) {
      return res.status(403).json({
        ok: false,
        error: 'forbidden',
        code: 'FORBIDDEN_MISSION',
        message: 'You do not have access to this mission.',
      });
    }
    const chainId = typeof req.query.chainId === 'string' ? req.query.chainId.trim() : null;
    const prisma = getPrismaClient();
    const where = { missionId: missionIdTrimmed };
    if (chainId) where.chainId = chainId;
    let tasks = [];
    if (prisma.missionTask) {
      try {
        tasks = await prisma.missionTask.findMany({
          where,
          orderBy: { createdAt: 'asc' },
        });
      } catch (err) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn('[missions/tasks] MissionTask findMany failed (run prisma generate + migrate):', err?.message || err);
        }
      }
    }
    return res.json({ ok: true, tasks });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/missions/:missionId/runs/:runId
 * Return a single AgentRun (id, status, error, output) for error taxonomy UI. requireAuth + canAccessMission.
 */
router.get('/:missionId/runs/:runId', requireAuth, async (req, res, next) => {
  try {
    const missionIdTrimmed = typeof req.params.missionId === 'string' ? req.params.missionId.trim() : '';
    const runIdTrimmed = typeof req.params.runId === 'string' ? req.params.runId.trim() : '';
    if (!missionIdTrimmed || !runIdTrimmed) {
      return res.status(400).json({ ok: false, error: 'ids_required', message: 'missionId and runId are required' });
    }
    const allowed = await canAccessMission(missionIdTrimmed, req.user);
    if (!allowed) {
      return res.status(403).json({
        ok: false,
        error: 'forbidden',
        code: 'FORBIDDEN_MISSION',
        message: 'You do not have access to this mission.',
      });
    }
    const prisma = getPrismaClient();
    const run = await prisma.agentRun.findFirst({
      where: { id: runIdTrimmed, missionId: missionIdTrimmed },
      select: { id: true, status: true, error: true, output: true, input: true, agentKey: true },
    });
    if (!run) {
      return res.status(404).json({ ok: false, error: 'not_found', message: 'Run not found' });
    }
    return res.json({ ok: true, run });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/missions/:missionId/blackboard
 * Same contract as GET /api/agents/v1/missions/:missionId/blackboard — MissionBlackboard events for Performer UI.
 * Query: limit, afterSeq | offset, correlationId (optional).
 */
router.get('/:missionId/blackboard', ...requireMissionReadAuth, async (req, res, next) => {
  try {
    const missionIdTrimmed = typeof req.params.missionId === 'string' ? req.params.missionId.trim() : '';
    if (!missionIdTrimmed) {
      return res.status(400).json({ ok: false, error: 'mission_id_required', message: 'missionId is required' });
    }
    const allowed = await canAccessMission(missionIdTrimmed, req.user);
    if (!allowed) {
      return res.status(403).json({
        ok: false,
        error: 'forbidden',
        code: 'FORBIDDEN_MISSION',
        message: 'You do not have access to this mission.',
      });
    }

    const rawLimit = req.query?.limit;
    const limit =
      typeof rawLimit === 'string' && /^\d+$/.test(rawLimit.trim())
        ? Math.min(5000, Math.max(1, parseInt(rawLimit.trim(), 10)))
        : 50;

    const rawOffset = req.query?.offset;
    const rawAfterSeq = req.query?.afterSeq;
    const cursorRaw = typeof rawAfterSeq === 'string' ? rawAfterSeq : rawOffset;
    const afterSeq =
      typeof cursorRaw === 'string' && /^\d+$/.test(cursorRaw.trim())
        ? Math.max(0, parseInt(cursorRaw.trim(), 10))
        : undefined;

    const rawCid = req.query?.correlationId;
    const correlationId =
      typeof rawCid === 'string' && rawCid.trim() ? rawCid.trim() : undefined;

    const { events, error } = await getEvents(missionIdTrimmed, {
      limit,
      ...(afterSeq != null ? { afterSeq } : {}),
      ...(correlationId ? { correlationId } : {}),
    });

    if (error) {
      return res.status(500).json({ ok: false, error: 'blackboard_read_failed', message: error });
    }

    return res.json({ ok: true, events });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/missions/:missionId/tasks/:taskId
 * Update task status (e.g. "completed", "skipped"). requireAuth + canAccessMission.
 * Body: { status: "completed" | "skipped" }
 */
router.patch('/:missionId/tasks/:taskId', requireAuth, async (req, res, next) => {
  try {
    const missionIdTrimmed = typeof req.params.missionId === 'string' ? req.params.missionId.trim() : '';
    const taskId = typeof req.params.taskId === 'string' ? req.params.taskId.trim() : '';
    if (!missionIdTrimmed || !taskId) {
      return res.status(400).json({ ok: false, error: 'mission_id_required', message: 'missionId and taskId are required' });
    }
    const allowed = await canAccessMission(missionIdTrimmed, req.user);
    if (!allowed) {
      return res.status(403).json({
        ok: false,
        error: 'forbidden',
        code: 'FORBIDDEN_MISSION',
        message: 'You do not have access to this mission.',
      });
    }
    const status = req.body?.status;
    if (status !== 'completed' && status !== 'skipped') {
      return res.status(400).json({ ok: false, error: 'invalid_status', message: 'status must be "completed" or "skipped"' });
    }
    const prisma = getPrismaClient();
    const task = await prisma.missionTask.findFirst({
      where: { id: taskId, missionId: missionIdTrimmed },
    });
    if (!task) {
      return res.status(404).json({ ok: false, error: 'not_found', message: 'Task not found' });
    }
    const updated = await updateMissionTaskStatus(taskId, status);
    return res.json({ ok: true, task: updated });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/missions/:missionId/feedback
 * Record user/system feedback for a bidding-layer Assignment. requireAuth + canAccessMission.
 * Body: { assignmentId, userMessageId?, userRating?, systemQualityScore?, comment? }
 * userRating: "1"-"5" or "thumbs_up"|"thumbs_down"
 */
router.post('/:missionId/feedback', requireAuth, async (req, res, next) => {
  try {
    const missionIdTrimmed = typeof req.params.missionId === 'string' ? req.params.missionId.trim() : '';
    if (!missionIdTrimmed) {
      return res.status(400).json({ ok: false, error: 'mission_id_required', message: 'missionId is required' });
    }
    const allowed = await canAccessMission(missionIdTrimmed, req.user);
    if (!allowed) {
      return res.status(403).json({
        ok: false,
        error: 'forbidden',
        code: 'FORBIDDEN_MISSION',
        message: 'You do not have access to this mission.',
      });
    }
    const body = req.body ?? {};
    const assignmentId = typeof body.assignmentId === 'string' ? body.assignmentId.trim() : '';
    if (!assignmentId) {
      return res.status(400).json({ ok: false, error: 'assignment_id_required', message: 'assignmentId is required' });
    }
    const prisma = getPrismaClient();
    const assignment = await prisma.assignment.findFirst({
      where: { id: assignmentId, task: { missionId: missionIdTrimmed } },
      select: { id: true },
    });
    if (!assignment) {
      return res.status(404).json({ ok: false, error: 'not_found', message: 'Assignment not found for this mission.' });
    }
    const userMessageId = typeof body.userMessageId === 'string' ? body.userMessageId.trim() || null : null;
    const userRating = typeof body.userRating === 'string' ? body.userRating.trim() || null : null;
    const systemQualityScore = typeof body.systemQualityScore === 'number' && Number.isFinite(body.systemQualityScore) ? body.systemQualityScore : null;
    const comment = typeof body.comment === 'string' ? body.comment.trim() || null : null;

    const feedbackId = await recordInteractionFeedback({
      missionId: missionIdTrimmed,
      userMessageId,
      assignmentId,
      userRating,
      systemQualityScore,
      comment,
    });
    await recomputeRewardForAssignment(assignmentId).catch(() => {});
    return res.status(200).json({ ok: true, feedbackId, assignmentId });
  } catch (err) {
    next(err);
  }
});

router.get('/recent-for-threads', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const tenantId = getTenantId(req.user);
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'unauthorized', message: 'Not authenticated' });
    }
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 50);
    const query = typeof req.query.query === 'string' ? req.query.query.trim() : '';

    const prisma = getPrismaClient();

    const effectiveTenant = tenantId || userId;
    const where = {
      entryPoint: 'agent-chat',
      OR: [
        { userId },
        { tenantId: effectiveTenant },
      ],
    };
    if (query.length > 0) {
      where.id = { contains: query };
    }

    const tasks = await prisma.orchestratorTask.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: limit,
      select: {
        id: true,
        status: true,
        updatedAt: true,
        request: true,
      },
    });

    const missions = tasks.map((t) => ({
      missionId: t.id,
      title: t.request?.title ?? (typeof t.request?.source === 'string' ? t.request.source : null),
      updatedAt: t.updatedAt,
      status: t.status,
    }));

    return res.json({ ok: true, missions });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/missions/:missionId/chain
 * Body: { action: "retry"|"skip", chainId, suggestionId }. requireAuth + canAccessMission.
 * Retry: re-dispatch current step. Skip: advance cursor, post "Chain step skipped", maybeAutoDispatch; blocked if step.requiresApproval and no decision.
 */
router.patch('/:missionId/chain', requireAuth, async (req, res, next) => {
  try {
    const missionIdTrimmed = typeof req.params.missionId === 'string' ? req.params.missionId.trim() : '';
    if (!missionIdTrimmed) {
      return res.status(400).json({ ok: false, error: 'mission_id_required', message: 'missionId is required' });
    }
    const allowed = await canAccessMission(missionIdTrimmed, req.user);
    if (!allowed) {
      return res.status(403).json({
        ok: false,
        error: 'forbidden',
        code: 'FORBIDDEN_MISSION',
        message: 'You do not have access to this mission.',
      });
    }
    const { action, chainId: bodyChainId, suggestionId: bodySuggestionId } = req.body ?? {};
    if (action !== 'retry' && action !== 'skip') {
      return res.status(400).json({ ok: false, error: 'invalid_action', message: 'action must be "retry" or "skip"' });
    }
    const chainId = typeof bodyChainId === 'string' && bodyChainId.trim() ? bodyChainId.trim() : null;
    const suggestionId = typeof bodySuggestionId === 'string' && bodySuggestionId.trim() ? bodySuggestionId.trim() : null;
    if (!chainId || !suggestionId) {
      return res.status(400).json({ ok: false, error: 'chain_id_required', message: 'chainId and suggestionId are required' });
    }
    const plan = await getChainPlan(missionIdTrimmed);
    if (!plan) {
      return res.status(400).json({ ok: false, error: 'no_chain_plan', message: 'No chain plan for this mission.' });
    }
    if (plan.chainId !== chainId) {
      return res.status(400).json({ ok: false, error: 'chain_mismatch', message: 'chainId does not match current plan.' });
    }
    const cursor = Number(plan.cursor) || 0;
    const step = Array.isArray(plan.suggestions) ? plan.suggestions[cursor] : null;
    if (!step || step.id !== suggestionId) {
      return res.status(400).json({ ok: false, error: 'step_mismatch', message: 'suggestionId does not match current step.' });
    }
    if (action === 'retry') {
      const mission = await getOrCreateMission(missionIdTrimmed, req.user);
      const tenantId = mission.tenantId || getTenantId(req.user) || req.user?.id;
      const run = await createAgentRun({
        missionId: missionIdTrimmed,
        tenantId,
        agentKey: step.agentKey || 'planner',
        triggerMessageId: null,
        input: { intent: step.intent || '', chainId, suggestionId },
      });
      if (step.agentKey === 'research' && process.env.MISSION_RUN_INPROCESS === 'true') {
        executeAgentRunInProcess(run.id).catch((err) =>
          console.warn('[missions/chain] executeAgentRunInProcess failed:', err?.message || err)
        );
      }
      if (step.agentKey === 'planner' && process.env.MISSION_PLANNER_INPROCESS === 'true') {
        executeAgentRunInProcess(run.id).catch((err) =>
          console.warn('[missions/chain] executeAgentRunInProcess failed:', err?.message || err)
        );
      }
      return res.json({ ok: true, action: 'retry', runId: run.id });
    }
    if (action === 'skip') {
      if (step.requiresApproval === true) {
        const prisma = getPrismaClient();
        const approvalMsgs = await prisma.agentMessage.findMany({
          where: { missionId: missionIdTrimmed, messageType: 'approval_required' },
          select: { id: true, payload: true },
        });
        const approvalIdsForStep = new Set();
        for (const m of approvalMsgs) {
          const p = m.payload && typeof m.payload === 'object' ? m.payload : {};
          if (p.chainId === chainId && p.suggestionId === suggestionId) approvalIdsForStep.add(m.id);
        }
        const decided = await prisma.agentMessage.findMany({
          where: { missionId: missionIdTrimmed, senderType: 'system' },
          select: { payload: true },
        });
        let hasDecision = false;
        for (const m of decided) {
          const did = m.payload && typeof m.payload === 'object' ? m.payload.decidedMessageId : null;
          if (did && approvalIdsForStep.has(did)) {
            hasDecision = true;
            break;
          }
        }
        if (!hasDecision) {
          return res.status(400).json({
            ok: false,
            error: 'approval_required',
            message: 'Cannot skip a step that requires approval until a decision is recorded.',
          });
        }
      }
      await advanceChainCursor(missionIdTrimmed);
      const label = step.label || step.intent || step.agentKey || suggestionId;
      await createAgentMessage({
        missionId: missionIdTrimmed,
        senderId: 'mission-run',
        senderType: 'system',
        channel: 'main',
        text: `Chain step skipped: ${label}`,
        messageType: 'system',
        payload: { kind: 'chain_step_skipped', chainId, suggestionId, label },
        visibleToUser: true,
      });
      const { maybeAutoDispatch } = await import('../lib/maybeAutoDispatch.js');
      maybeAutoDispatch(missionIdTrimmed, 'chain_step_skipped').catch((err) =>
        console.warn('[missions/chain] maybeAutoDispatch failed:', err?.message || err)
      );
      return res.json({ ok: true, action: 'skip' });
    }
    return res.status(400).json({ ok: false, error: 'invalid_action', message: 'action must be "retry" or "skip"' });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/missions/:missionId/context/patch
 * Merge businessInputs (budget, targetCustomers, heroProducts) or useDefaults into mission.context,
 * post "Inputs saved" system message, then trigger planner continuation.
 * Body: { businessInputs?: { budget?, targetCustomers?, heroProducts? }, useDefaults?: boolean }
 */
router.post('/:missionId/context/patch', requireAuth, async (req, res, next) => {
  try {
    const missionIdTrimmed = typeof req.params.missionId === 'string' ? req.params.missionId.trim() : '';
    if (!missionIdTrimmed) {
      return res.status(400).json({ ok: false, error: 'mission_id_required', message: 'missionId is required' });
    }
    const allowed = await canAccessMission(missionIdTrimmed, req.user);
    if (!allowed) {
      return res.status(403).json({
        ok: false,
        error: 'forbidden',
        code: 'FORBIDDEN_MISSION',
        message: 'You do not have access to this mission.',
      });
    }
    const body = req.body ?? {};
    const businessInputs = body.businessInputs && typeof body.businessInputs === 'object' ? body.businessInputs : {};
    const useDefaults = body.useDefaults === true;
    const patch = {};
    if (useDefaults) {
      patch.useDefaults = true;
    }
    if (businessInputs.budget != null) patch.budget = businessInputs.budget;
    if (businessInputs.budgetWeekly != null) {
      patch.budgetWeekly = businessInputs.budgetWeekly;
      if (patch.budget == null) patch.budget = businessInputs.budgetWeekly;
    }
    if (businessInputs.targetCustomers != null) patch.targetCustomers = businessInputs.targetCustomers;
    if (businessInputs.heroProducts != null) patch.heroProducts = businessInputs.heroProducts;
    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ ok: false, error: 'nothing_to_patch', message: 'Provide businessInputs or useDefaults' });
    }
    await mergeMissionContext(missionIdTrimmed, patch);
    await createAgentMessage({
      missionId: missionIdTrimmed,
      senderId: 'system',
      senderType: 'system',
      channel: 'main',
      text: 'Inputs saved.',
      messageType: 'text',
      visibleToUser: true,
    }).catch(() => {});
    const plan = await getChainPlan(missionIdTrimmed).catch(() => null);
    if (plan?.mode === 'auto_safe') {
      const { maybeAutoDispatch } = await import('../lib/maybeAutoDispatch.js');
      await maybeAutoDispatch(missionIdTrimmed, 'checkpoint_submitted').catch((err) =>
        console.warn('[missions/context/patch] maybeAutoDispatch failed:', err?.message || err)
      );
      return res.status(200).json({ ok: true, continued: 'auto_safe' });
    }
    const mission = await getOrCreateMission(missionIdTrimmed, req.user);
    const tenantId = mission.tenantId || getTenantId(req.user) || req.user?.id;
    const run = await createAgentRun({
      missionId: missionIdTrimmed,
      tenantId,
      agentKey: 'planner',
      triggerMessageId: null,
      input: { triggeredByContextPatch: true },
    });
    executeAgentRunInProcess(run.id).catch((err) =>
      console.warn('[missions/context/patch] planner run failed:', err?.message || err)
    );
    return res.status(200).json({ ok: true, runId: run.id });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/missions/:missionId/context
 * Body: { patch: { businessInputs?: { budgetWeekly?, targetCustomers?, heroProducts? } } }
 * Deep-merge patch into mission.context, post "Inputs saved", then trigger continuation (auto_safe or planner).
 */
router.patch('/:missionId/context', requireAuth, async (req, res, next) => {
  try {
    const missionIdTrimmed = typeof req.params.missionId === 'string' ? req.params.missionId.trim() : '';
    if (!missionIdTrimmed) {
      return res.status(400).json({ ok: false, error: 'mission_id_required', message: 'missionId is required' });
    }
    const allowed = await canAccessMission(missionIdTrimmed, req.user);
    if (!allowed) {
      return res.status(403).json({
        ok: false,
        error: 'forbidden',
        code: 'FORBIDDEN_MISSION',
        message: 'You do not have access to this mission.',
      });
    }
    const body = req.body ?? {};
    const patchInput = body.patch && typeof body.patch === 'object' ? body.patch : {};
    const businessInputs = patchInput.businessInputs && typeof patchInput.businessInputs === 'object' ? patchInput.businessInputs : {};
    const patch = {};
    if (businessInputs.budgetWeekly != null) {
      patch.budgetWeekly = businessInputs.budgetWeekly;
      patch.budget = businessInputs.budgetWeekly;
    }
    if (businessInputs.targetCustomers != null) patch.targetCustomers = businessInputs.targetCustomers;
    if (businessInputs.heroProducts != null) patch.heroProducts = businessInputs.heroProducts;
    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ ok: false, error: 'nothing_to_patch', message: 'Provide patch.businessInputs' });
    }
    await mergeMissionContext(missionIdTrimmed, patch);
    await createAgentMessage({
      missionId: missionIdTrimmed,
      senderId: 'system',
      senderType: 'system',
      channel: 'main',
      text: 'Inputs saved.',
      messageType: 'text',
      visibleToUser: true,
    }).catch(() => {});
    const plan = await getChainPlan(missionIdTrimmed).catch(() => null);
    if (plan?.mode === 'auto_safe') {
      const { maybeAutoDispatch } = await import('../lib/maybeAutoDispatch.js');
      await maybeAutoDispatch(missionIdTrimmed, 'checkpoint_submitted').catch((err) =>
        console.warn('[missions/context PATCH] maybeAutoDispatch failed:', err?.message || err)
      );
      return res.status(200).json({ ok: true, continued: 'auto_safe' });
    }
    const mission = await getOrCreateMission(missionIdTrimmed, req.user);
    const tenantId = mission.tenantId || getTenantId(req.user) || req.user?.id;
    const run = await createAgentRun({
      missionId: missionIdTrimmed,
      tenantId,
      agentKey: 'planner',
      triggerMessageId: null,
      input: { triggeredByContextPatch: true },
    });
    executeAgentRunInProcess(run.id).catch((err) =>
      console.warn('[missions/context PATCH] planner run failed:', err?.message || err)
    );
    return res.status(200).json({ ok: true, runId: run.id });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/missions/:missionId/topology-decision
 * HITL approve / reject / modify for multi-agent execution plans.
 */
router.post('/:missionId/topology-decision', requireAuth, async (req, res, next) => {
  try {
    const missionIdTrimmed = typeof req.params.missionId === 'string' ? req.params.missionId.trim() : '';
    const decision = String(req.body?.decision ?? '').trim().toLowerCase();

    if (!missionIdTrimmed || !['approve', 'reject', 'modify'].includes(decision)) {
      return res.status(400).json({
        ok: false,
        error: 'validation',
        message: 'missionId and decision (approve|reject|modify) are required',
      });
    }

    const access = await resolveAccessibleMission(req.user ?? {}, missionIdTrimmed);
    if (!access.ok) {
      return res.status(403).json({ ok: false, error: 'forbidden', message: 'Mission not found or access denied' });
    }

    const userId =
      String(req.user?.id ?? req.user?.userId ?? req.guestId ?? req.guest?.id ?? '').trim() || null;
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'unauthorized' });
    }

    const { handleTopologyDecision } = await import('../lib/mission/topologyReviewService.js');
    const result = await handleTopologyDecision(missionIdTrimmed, {
      decision,
      reason: typeof req.body?.reason === 'string' ? req.body.reason.trim() : undefined,
      topology: req.body?.topology,
      policy: req.body?.policy,
      reasoning: req.body?.reasoning,
      modifications:
        req.body?.modifications && typeof req.body.modifications === 'object'
          ? req.body.modifications
          : undefined,
      userId,
      storeId: typeof req.body?.storeId === 'string' ? req.body.storeId.trim() : undefined,
    });

    if (!result.ok) {
      return res.status(400).json(result);
    }

    return res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/missions/:missionId/execute-topology
 * Re-run approved topology (retry after failure or manual trigger).
 */
router.post('/:missionId/execute-topology', requireAuth, async (req, res, next) => {
  try {
    const missionIdTrimmed = typeof req.params.missionId === 'string' ? req.params.missionId.trim() : '';
    if (!missionIdTrimmed) {
      return res.status(400).json({ ok: false, error: 'validation', message: 'missionId is required' });
    }

    const access = await resolveAccessibleMission(req.user ?? {}, missionIdTrimmed);
    if (!access.ok) {
      return res.status(403).json({ ok: false, error: 'forbidden', message: 'Mission not found or access denied' });
    }

    const userId =
      String(req.user?.id ?? req.user?.userId ?? req.guestId ?? req.guest?.id ?? '').trim() || null;
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'unauthorized' });
    }

    const { readMetadata } = await import('../lib/persistence/metadataWriter.js');
    const { executeApprovedTopology } = await import('../lib/mission/topologyExecutor.js');
    const meta = await readMetadata(missionIdTrimmed);
    const metadata = meta && typeof meta === 'object' && !Array.isArray(meta) ? meta : {};
    const topology = metadata.approvedTopology ?? metadata.pendingTopology;
    if (!topology) {
      return res.status(400).json({ ok: false, message: 'No approved topology to execute' });
    }

    const storeId =
      typeof req.body?.storeId === 'string'
        ? req.body.storeId.trim()
        : typeof metadata.storeId === 'string'
          ? metadata.storeId.trim()
          : undefined;

    const execution = await executeApprovedTopology(missionIdTrimmed, topology, { userId, storeId });
    return res.status(200).json({
      ok: execution.ok,
      status: execution.status,
      missionId: missionIdTrimmed,
      executionMode: execution.executionMode,
      execution,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/missions/:missionId/plan-decision
 * Owner decision on skill plan preview (approve / regenerate / cancel).
 * Idempotent per mission+executionId for approve.
 */
router.post('/:missionId/plan-decision', optionalAuth, async (req, res, next) => {
  try {
    const missionIdTrimmed = typeof req.params.missionId === 'string' ? req.params.missionId.trim() : '';
    const decision = String(req.body?.decision ?? '').trim().toLowerCase();
    const editedPlan =
      req.body?.editedPlan && typeof req.body.editedPlan === 'object' && !Array.isArray(req.body.editedPlan)
        ? req.body.editedPlan
        : undefined;
    const feedback = typeof req.body?.feedback === 'string' ? req.body.feedback.trim() : '';
    const executionId = typeof req.body?.executionId === 'string' ? req.body.executionId.trim() : '';

    if (!missionIdTrimmed || !['approve', 'regenerate', 'cancel'].includes(decision)) {
      return res.status(400).json({
        ok: false,
        error: 'validation',
        message: 'missionId and decision (approve|regenerate|cancel) are required',
      });
    }

    const access = await resolveAccessibleMission(req.user ?? {}, missionIdTrimmed);
    if (!access.ok) {
      return res.status(403).json({ ok: false, error: 'forbidden', message: 'Mission not found or access denied' });
    }

    const userId =
      String(req.user?.id ?? req.user?.userId ?? req.guestId ?? req.guest?.id ?? '').trim() || null;
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'unauthorized' });
    }

    const { skillExecutor, skillRegistry } = await import('../lib/skills/index.js');
    const { handlePlanDecision } = await import('../lib/skills/planApprovalService.js');

    const result = await handlePlanDecision({
      missionId: missionIdTrimmed,
      userId,
      decision,
      editedPlan,
      feedback,
      executionId,
      skillExecutor,
      skillRegistry,
    });

    if (!result.ok) {
      const status = result.error === 'validation' ? 400 : result.error === 'not_found' ? 404 : 409;
      return res.status(status).json(result);
    }

    return res.status(200).json({
      ok: true,
      duplicate: result.duplicate === true,
      status: result.status,
      executionId: result.execution?.id ?? executionId ?? null,
      plan: result.plan ?? null,
      stepResults: result.execution?.stepResults ?? null,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/missions/:missionId/respond
 * @deprecated Use POST /api/execution/:executionId/checkpoint
 * Owner response for a checkpoint step (Phase 3). Resumes runMissionUntilBlocked only.
 */
router.post('/:missionId/respond', optionalAuth, async (req, res, next) => {
  try {
    applyDeprecatedCheckpointHeaders(res, 'missionsRespond');
    const missionIdTrimmed = typeof req.params.missionId === 'string' ? req.params.missionId.trim() : '';
    const { stepId, response, data } = parseExecutionCheckpointBody(req.body ?? {});

    const checkpointResult = await handleExecutionCheckpoint({
      user: req.user ?? {},
      executionId: missionIdTrimmed,
      stepId,
      response,
      data,
      source: 'missions_respond_deprecated',
    });

    const http = toExecutionCheckpointHttpResponse(checkpointResult, missionIdTrimmed);
    return res.status(http.statusCode).json(http.body);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/missions/:missionId
 * Returns mission (id, title, status, context) for chain status UI. Same permission as canAccessMission.
 */
router.get('/:missionId', ...requireMissionReadAuth, async (req, res, next) => {
  try {
    const missionIdTrimmed = typeof req.params.missionId === 'string' ? req.params.missionId.trim() : '';
    if (!missionIdTrimmed) {
      return res.status(400).json({ ok: false, error: 'mission_id_required', message: 'missionId is required' });
    }

    const access = await resolveAccessibleMission(req.user, missionIdTrimmed);
    const prisma = getPrismaClient();

    if (process.env.NODE_ENV !== 'production') {
      const pipeDbg = await prisma.missionPipeline.findUnique({
        where: { id: missionIdTrimmed },
        select: { createdBy: true, tenantId: true },
      });
      const missionDbg = await prisma.mission.findUnique({
        where: { id: missionIdTrimmed },
        select: { createdByUserId: true, tenantId: true },
      });
      console.log('[mission-access-debug]', {
        missionId: missionIdTrimmed,
        accessOk: access.ok,
        accessKind: access.ok ? access.kind : access.reason,
        pipelineCreatedBy: pipeDbg?.createdBy ?? null,
        pipelineTenantId: pipeDbg?.tenantId ?? null,
        missionCreatedByUserId: missionDbg?.createdByUserId ?? null,
        missionTenantId: missionDbg?.tenantId ?? null,
        requestUserId: req.user?.id ?? null,
        requestRole: req.user?.role ?? null,
        pipelineOwnerMatch:
          pipeDbg?.createdBy != null && req.user?.id != null && pipeDbg.createdBy === req.user.id,
      });
    }

    if (!access.ok) {
      if (access.reason === 'FORBIDDEN') {
        return res.status(403).json({
          ok: false,
          error: 'forbidden',
          code: 'FORBIDDEN_MISSION',
          message: 'You do not have access to this mission.',
        });
      }
      return res.status(404).json({ ok: false, error: 'not_found', message: 'Mission not found' });
    }

    await ensureMissionRowForBlackboard(prisma, missionIdTrimmed).catch(() => {});

    let mission = await prisma.mission.findUnique({
      where: { id: missionIdTrimmed },
      select: { id: true, title: true, status: true, context: true, updatedAt: true },
    });

    if (!mission && access.kind === 'mission_pipeline') {
      const pipe = await prisma.missionPipeline.findUnique({
        where: { id: missionIdTrimmed },
        select: {
          id: true,
          title: true,
          status: true,
          metadataJson: true,
          createdAt: true,
          updatedAt: true,
          createdBy: true,
        },
      });
      if (pipe) {
        const context =
          pipe.metadataJson && typeof pipe.metadataJson === 'object' && !Array.isArray(pipe.metadataJson)
            ? pipe.metadataJson
            : {};
        const syntheticMission = {
          id: pipe.id,
          title: pipe.title != null ? String(pipe.title).trim() || 'Untitled' : 'Untitled',
          status: pipe.status,
          context,
          createdAt: pipe.createdAt,
          updatedAt: pipe.updatedAt,
          createdByUserId: typeof pipe.createdBy === 'string' ? pipe.createdBy : null,
          ...(process.env.NODE_ENV !== 'production' ? { _synthetic: true } : {}),
        };
        if (process.env.NODE_ENV !== 'production') {
          console.log('[mission-access-debug] serving synthetic mission', syntheticMission);
        }
        mission = syntheticMission;
      }
    }

    if (!mission) {
      return res.status(404).json({ ok: false, error: 'not_found', message: 'Mission not found' });
    }

    const executionPlans = getUnifiedExecutionPlans(mission.context ?? undefined);
    return res.json({ ok: true, mission, executionPlans });
  } catch (err) {
    next(err);
  }
});

/** Allowed chatMode values for mission context (group_chat = two-agent swarm: Research then Planner). */
const CHAT_MODES = ['default', 'group_chat'];

/**
 * PATCH /api/missions/:missionId
 * Body: { chainMode?, allowExternalDrafts?, chatMode?: "default" | "group_chat" }. Merges into context.
 */
router.patch('/:missionId', requireAuth, async (req, res, next) => {
  try {
    const missionIdTrimmed = typeof req.params.missionId === 'string' ? req.params.missionId.trim() : '';
    if (!missionIdTrimmed) {
      return res.status(400).json({ ok: false, error: 'mission_id_required', message: 'missionId is required' });
    }
    const allowed = await canAccessMission(missionIdTrimmed, req.user);
    if (!allowed) {
      return res.status(403).json({
        ok: false,
        error: 'forbidden',
        code: 'FORBIDDEN_MISSION',
        message: 'You do not have access to this mission.',
      });
    }
    const mode = req.body?.chainMode;
    if (mode !== undefined && mode !== 'manual' && mode !== 'auto_safe' && mode !== 'auto_drafts') {
      return res.status(400).json({ ok: false, error: 'invalid_chain_mode', message: 'chainMode must be "manual", "auto_safe", or "auto_drafts"' });
    }
    const allowExternalDrafts = req.body?.allowExternalDrafts;
    const chatMode = req.body?.chatMode;
    if (chatMode !== undefined && !CHAT_MODES.includes(chatMode)) {
      return res.status(400).json({ ok: false, error: 'invalid_chat_mode', message: 'chatMode must be "default" or "group_chat"' });
    }
    const plan = await getChainPlan(missionIdTrimmed);
    if (mode !== undefined) {
      if (!plan) {
        return res.status(400).json({ ok: false, error: 'no_chain_plan', message: 'No chain plan for this mission; create a plan first (e.g. from execution suggestions).' });
      }
      await mergeMissionContext(missionIdTrimmed, { chainPlan: { ...plan, mode } });
    }
    if (allowExternalDrafts !== undefined) {
      await mergeMissionContext(missionIdTrimmed, { allowExternalDrafts: Boolean(allowExternalDrafts) });
    }
    if (chatMode !== undefined) {
      await mergeMissionContext(missionIdTrimmed, { chatMode });
    }
    if (mode === 'auto_safe' || mode === 'auto_drafts') {
      const { maybeAutoDispatch } = await import('../lib/maybeAutoDispatch.js');
      maybeAutoDispatch(missionIdTrimmed, 'chain_plan_updated').catch((err) =>
        console.warn('[missions PATCH] maybeAutoDispatch failed:', err?.message || err)
      );
    }
    return res.json({
      ok: true,
      ...(mode !== undefined && { chainMode: mode }),
      ...(allowExternalDrafts !== undefined && { allowExternalDrafts: Boolean(allowExternalDrafts) }),
      ...(chatMode !== undefined && { chatMode }),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
