/**
 * Orchestrator run feedback API.
 * GET /api/orchestrator-runs?missionId=xxx — latest reward (and task id) for mission.
 * POST /api/orchestrator-runs/:id/feedback — submit user rating (good / edit / bad) and update reward.
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getPrismaClient } from '../lib/prisma.js';

const router = Router();
const prisma = getPrismaClient();

async function canAccessReward(reward, user) {
  const task = await prisma.orchestratorTask.findUnique({
    where: { id: reward.orchestratorTaskId },
    select: { userId: true, tenantId: true },
  });
  if (!task) return false;
  const ownerId = user?.id;
  const userBusinessId = user?.business?.id;
  const effectiveTenant = userBusinessId ?? ownerId;
  const isOwner =
    task.userId === ownerId ||
    task.userId === effectiveTenant ||
    task.tenantId === ownerId ||
    task.tenantId === userBusinessId;
  const devBypass =
    process.env.NODE_ENV !== 'production' &&
    ownerId &&
    (task.userId === 'temp' || task.tenantId === 'temp' || task.userId === 'dev-user-id' || task.tenantId === 'dev-user-id');
  return isOwner || devBypass;
}

/**
 * GET /api/orchestrator-runs?missionId=xxx
 * Returns latest OrchestratorRunReward for this mission (for UI to get orchestratorTaskId and show feedback).
 */
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const missionId = req.query.missionId;
    if (!missionId || typeof missionId !== 'string' || !missionId.trim()) {
      return res.status(400).json({ ok: false, message: 'missionId query required' });
    }
    const reward = await prisma.orchestratorRunReward.findFirst({
      where: { missionId: missionId.trim() },
      orderBy: { createdAt: 'desc' },
    });
    if (!reward) {
      return res.json({ ok: true, reward: null, orchestratorTaskId: null });
    }
    let allowed = await canAccessReward(reward, req.user);
    // Align with agent-messages: if missionId is a "named" mission (not an OrchestratorTask id), allow any authenticated user (same as GET /api/agent-messages).
    if (!allowed) {
      const taskById = await prisma.orchestratorTask.findUnique({
        where: { id: missionId.trim() },
        select: { id: true },
      });
      if (!taskById) {
        allowed = true; // named mission, same access as agent-messages
      }
    }
    if (!allowed) {
      return res.status(403).json({ ok: false, message: 'Access denied' });
    }
    return res.json({
      ok: true,
      reward: {
        id: reward.id,
        orchestratorTaskId: reward.orchestratorTaskId,
        overallReward: reward.overallReward,
        toolCompletenessScore: reward.toolCompletenessScore,
        outcomeQualityScore: reward.outcomeQualityScore,
        details: reward.details,
        createdAt: reward.createdAt,
      },
      orchestratorTaskId: reward.orchestratorTaskId,
    });
  } catch (err) {
    next(err);
  }
});

const RATING_ADJUSTMENT = { good: 0.3, edit: 0, bad: -0.5 };

async function canAccessTask(taskId, user) {
  const task = await prisma.orchestratorTask.findUnique({
    where: { id: taskId },
    select: { userId: true, tenantId: true, request: true },
  });
  if (!task) return { allowed: false, task: null };
  const ownerId = user?.id;
  const userBusinessId = user?.business?.id;
  const effectiveTenant = userBusinessId ?? ownerId;
  const isOwner =
    task.userId === ownerId ||
    task.userId === effectiveTenant ||
    task.tenantId === ownerId ||
    task.tenantId === userBusinessId;
  const devPlaceholder =
    task.userId === 'temp' ||
    task.tenantId === 'temp' ||
    task.userId === 'dev-user-id' ||
    task.tenantId === 'dev-user-id';
  const devBypass = process.env.NODE_ENV !== 'production' && ownerId && devPlaceholder;
  return { allowed: isOwner || devBypass, task };
}

/**
 * POST /api/orchestrator-runs/:id/feedback
 * Body: { rating: 'good' | 'edit' | 'bad' }
 * Updates OrchestratorRunReward.overallReward by adjustment and stores userFeedback in details.
 */
router.post('/:id/feedback', requireAuth, async (req, res, next) => {
  try {
    const taskId = req.params.id;
    const rating = req.body?.rating;
    if (!taskId || !['good', 'edit', 'bad'].includes(rating)) {
      return res.status(400).json({
        ok: false,
        message: 'Invalid id or rating. Use rating: "good" | "edit" | "bad"',
      });
    }

    const { allowed, task } = await canAccessTask(taskId, req.user);
    if (!allowed || !task) {
      return res.status(403).json({ ok: false, message: 'Access denied to this run' });
    }

    const adjustment = RATING_ADJUSTMENT[rating];
    const missionId =
      task.request?.payload?.missionId ?? task.request?.missionId ?? taskId;
    const tenantId = task.tenantId;

    let reward = await prisma.orchestratorRunReward.findFirst({
      where: { orchestratorTaskId: taskId },
      orderBy: { createdAt: 'desc' },
    });

    if (!reward) {
      reward = await prisma.orchestratorRunReward.create({
        data: {
          orchestratorTaskId: taskId,
          missionId,
          tenantId,
          toolCompletenessScore: 0,
          outcomeQualityScore: 0,
          overallReward: 0,
          details: {},
        },
      });
    }

    const currentDetails = (reward.details && typeof reward.details === 'object')
      ? reward.details
      : {};
    const userFeedback = {
      rating,
      adjustment,
      userId: req.user?.id,
      at: new Date().toISOString(),
    };
    const updatedDetails = {
      ...currentDetails,
      userFeedback,
    };
    const newOverallReward = Math.max(
      0,
      Math.min(1, reward.overallReward + adjustment)
    );

    const updated = await prisma.orchestratorRunReward.update({
      where: { id: reward.id },
      data: {
        overallReward: newOverallReward,
        details: updatedDetails,
      },
    });

    return res.json(updated);
  } catch (err) {
    next(err);
  }
});

export default router;
