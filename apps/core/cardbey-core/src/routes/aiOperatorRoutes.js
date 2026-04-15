/**
 * AI Operator API: start mission run and get status.
 * POST /api/ai-operator/missions/:missionId/start, GET /api/ai-operator/missions/:missionId/status
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getTenantId } from '../lib/tenant.js';
import { createMissionRun, loadOperatorStateByMissionId } from '../ai/operator/operatorState.js';
import { runOperatorStepWithAgents } from '../ai/operator/runOperatorStepWithAgents.js';
import { createThreadForMission } from '../ai/operator/threadForMission.js';
import { getPrismaClient } from '../lib/prisma.js';

const router = Router();

/**
 * POST /api/ai-operator/missions/:missionId/start
 * Body: { goal?: string, missionType?: string }
 * Creates MissionRun, creates ConversationThread for Agent Chat, runs first step.
 */
router.post('/missions/:missionId/start', requireAuth, async (req, res, next) => {
  try {
    const missionId = (req.params.missionId || '').trim();
    if (!missionId) {
      return res.status(400).json({
        ok: false,
        code: 'MISSION_ID_REQUIRED',
        message: 'missionId is required',
      });
    }
    const userId = req.user?.id;
    const tenantId = getTenantId(req.user) || userId;
    if (!userId) {
      return res.status(401).json({
        ok: false,
        code: 'UNAUTHORIZED',
        message: 'Not authenticated',
      });
    }

    const body = req.body || {};
    const goal = typeof body.goal === 'string' ? body.goal.trim() : null;
    const missionType = (typeof body.missionType === 'string' ? body.missionType.trim() : null) || 'build_store';
    const runPipelineAsSingleStep = body.runPipelineAsSingleStep === true;

    const prisma = getPrismaClient();
    if (!prisma.missionOperatorRun) {
      return res.status(503).json({
        ok: false,
        code: 'OPERATOR_UNAVAILABLE',
        message: 'MissionOperatorRun model not available. Run prisma generate and restart.',
      });
    }

    const threadCreated = await createThreadForMission({
      missionId,
      userId,
      tenantId: tenantId || undefined,
      title: `Operator: ${missionType}`,
    });
    const agentThreadId = threadCreated?.threadId ?? null;

    const run = await createMissionRun({
      missionId,
      missionType,
      goal: goal || undefined,
      tenantId: tenantId || undefined,
      userId,
      agentThreadId,
      runPipelineAsSingleStep,
    });
    if (!run) {
      return res.status(500).json({
        ok: false,
        code: 'CREATE_FAILED',
        message: 'Failed to create mission run',
      });
    }

    runOperatorStepWithAgents(run.id).catch((err) => {
      console.warn('[ai-operator] runOperatorStepWithAgents error:', err?.message || err);
    });

    const { createMissionRun: createUnifiedMissionRun } = await import('../lib/missionRouter.js');
    const unifiedRun = await createUnifiedMissionRun({
      userId,
      storeId: body.storeId ?? null,
      intentType: goal || 'create_store',
      title: body.title ?? goal ?? 'create_store',
      mode: 'agent',
      requiresConfirmation: true,
      context: body,
    });

    return res.status(201).json({
      ok: true,
      missionRunId: unifiedRun?.id ?? run.id,
      status: run.status,
      currentStage: run.currentStage,
      agentThreadId: run.agentThreadId ?? undefined,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/ai-operator/missions/:missionId/step
 * Run one operator step for the latest run of this mission (if status is still running). Returns updated state.
 */
router.post('/missions/:missionId/step', requireAuth, async (req, res, next) => {
  try {
    const missionId = (req.params.missionId || '').trim();
    if (!missionId) {
      return res.status(400).json({
        ok: false,
        code: 'MISSION_ID_REQUIRED',
        message: 'missionId is required',
      });
    }
    const state = await loadOperatorStateByMissionId(missionId);
    if (!state || state.status !== 'running') {
      return res.json({
        ok: true,
        missionId,
        run: state,
        message: state ? 'Run not in running status' : 'No run found',
      });
    }
    const { runOperatorStepWithAgents } = await import('../ai/operator/runOperatorStepWithAgents.js');
    const updated = await runOperatorStepWithAgents(state.id);
    const artifacts = updated
      ? {
          draftId: updated.currentDraftId ?? undefined,
          jobId: updated.currentJobId ?? undefined,
          storeId: updated.currentStoreId ?? undefined,
          generationRunId: updated.currentGenerationRunId ?? undefined,
          ...(updated.artifactSnapshot &&
          typeof updated.artifactSnapshot === 'object'
            ? updated.artifactSnapshot
            : {}),
        }
      : {};
    return res.json({
      ok: true,
      missionId,
      missionRunId: updated?.id,
      run: updated,
      currentStage: updated?.currentStage,
      status: updated?.status,
      artifacts,
      agentThreadId: updated?.agentThreadId ?? undefined,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/ai-operator/missions/:missionId/status
 * Returns latest MissionRun state for the mission (currentStage, progress, artifacts, agentThreadId).
 */
router.get('/missions/:missionId/status', requireAuth, async (req, res, next) => {
  try {
    const missionId = (req.params.missionId || '').trim();
    if (!missionId) {
      return res.status(400).json({
        ok: false,
        code: 'MISSION_ID_REQUIRED',
        message: 'missionId is required',
      });
    }

    const state = await loadOperatorStateByMissionId(missionId);
    if (!state) {
      return res.json({
        ok: true,
        missionId,
        run: null,
        currentStage: null,
        status: null,
        artifacts: null,
        agentThreadId: null,
      });
    }

    const artifacts = {
      draftId: state.currentDraftId ?? undefined,
      jobId: state.currentJobId ?? undefined,
      storeId: state.currentStoreId ?? undefined,
      generationRunId: state.currentGenerationRunId ?? undefined,
      ...(state.artifactSnapshot && typeof state.artifactSnapshot === 'object' ? state.artifactSnapshot : {}),
    };

    return res.json({
      ok: true,
      missionId,
      missionRunId: state.id,
      run: state,
      currentStage: state.currentStage,
      status: state.status,
      artifacts,
      agentThreadId: state.agentThreadId ?? undefined,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
