/**
 * Assignment reward: compute reward from metrics and feedback, update Assignment.metrics, update AgentProfile.
 */

import { getPrismaClient } from '../lib/prisma.js';
import { getWeights } from './biddingConfig.js';
import { updateReliabilityScore } from './agentProfile.js';

/**
 * Normalize value to [0, 1] for reward (e.g. latency: lower is better, so invert).
 */
function normalizeLatency(ms, maxMs = 60000) {
  if (ms == null || !Number.isFinite(ms)) return 0.5;
  return Math.max(0, 1 - ms / maxMs);
}

/**
 * Normalize cost to [0, 1] (lower cost = higher score).
 */
function normalizeCost(cost, maxCost = 10) {
  if (cost == null || !Number.isFinite(cost)) return 0.5;
  return Math.max(0, 1 - cost / maxCost);
}

/**
 * Compute reward in [0, 1] from assignment metrics and optional feedback.
 * r = w_user * userSatisfaction + w_system * systemQuality - w_latency * (1 - normLatency) - w_cost * (1 - normCost)
 * Then normalize to [0, 1].
 */
export function computeReward(metrics = {}, feedback = null) {
  const {
    rewardWUser,
    rewardWSystem,
    rewardWLatency,
    rewardWCost,
  } = getWeights();

  let userSatisfaction = 0.5;
  if (feedback && feedback.userRating != null) {
    const r = feedback.userRating;
    if (r === 'thumbs_up' || r === '5') userSatisfaction = 1;
    else if (r === 'thumbs_down' || r === '1') userSatisfaction = 0;
    else if (['2', '3', '4'].includes(String(r))) userSatisfaction = (Number(r) - 1) / 4;
  }
  const systemQuality =
    feedback?.systemQualityScore != null && Number.isFinite(feedback.systemQualityScore)
      ? Math.max(0, Math.min(1, feedback.systemQualityScore))
      : (metrics.autoQualityScore != null && Number.isFinite(metrics.autoQualityScore)
          ? Math.max(0, Math.min(1, metrics.autoQualityScore))
          : 0.5);

  const latencyNorm = normalizeLatency(metrics.latencyMs);
  const costNorm = normalizeCost(metrics.cost);

  let r =
    rewardWUser * userSatisfaction +
    rewardWSystem * systemQuality +
    rewardWLatency * latencyNorm +
    rewardWCost * costNorm;
  r = Math.max(0, Math.min(1, r));
  return r;
}

/**
 * Record assignment completion: set completedAt, success, metrics (latencyMs, tokensUsed, reward).
 * Optionally run profile update from reward.
 * @param {string} assignmentId
 * @param {Object} [options]
 * @param {boolean} [options.success]
 * @param {number} [options.latencyMs]
 * @param {number} [options.tokensUsed]
 * @param {number} [options.cost]
 * @param {number} [options.autoQualityScore]
 */
export async function recordAssignmentCompletion(assignmentId, options = {}) {
  const { success, latencyMs, tokensUsed, cost, autoQualityScore } = options;
  const prisma = getPrismaClient();
  const assignment = await prisma.assignment.findUnique({
    where: { id: assignmentId },
    include: { task: true },
  });
  if (!assignment) return;

  const metrics = {
    ...(assignment.metrics && typeof assignment.metrics === 'object' ? assignment.metrics : {}),
    latencyMs: latencyMs ?? null,
    tokensUsed: tokensUsed ?? null,
    cost: cost ?? null,
    autoQualityScore: autoQualityScore ?? null,
  };

  const reward = computeReward(metrics, null);
  metrics.reward = reward;

  await prisma.assignment.update({
    where: { id: assignmentId },
    data: {
      completedAt: new Date(),
      success: !!success,
      metrics,
      updatedAt: new Date(),
    },
  });

  await updateReliabilityScore(assignment.agentKey, reward).catch(() => {});
}

/**
 * Create or update InteractionFeedback for an assignment (user rating, system score, comment).
 */
export async function recordInteractionFeedback({
  missionId,
  userMessageId,
  assignmentId,
  userRating,
  systemQualityScore,
  comment,
}) {
  const prisma = getPrismaClient();
  const existing = await prisma.interactionFeedback.findFirst({
    where: { assignmentId },
    orderBy: { createdAt: 'desc' },
  });

  const data = {
    missionId: (missionId || '').trim(),
    userMessageId: userMessageId != null ? String(userMessageId).trim() || null : null,
    assignmentId,
    userRating: userRating != null ? String(userRating) : null,
    systemQualityScore:
      systemQualityScore != null && Number.isFinite(systemQualityScore) ? systemQualityScore : null,
    comment: comment != null ? String(comment) : null,
  };

  if (existing) {
    await prisma.interactionFeedback.update({
      where: { id: existing.id },
      data: { ...data, createdAt: existing.createdAt },
    });
    return existing.id;
  }

  const created = await prisma.interactionFeedback.create({ data });
  return created.id;
}

/**
 * Recompute reward for an assignment using its feedback and metrics, then update Assignment.metrics.reward and profile.
 */
export async function recomputeRewardForAssignment(assignmentId) {
  const prisma = getPrismaClient();
  const assignment = await prisma.assignment.findUnique({
    where: { id: assignmentId },
    include: { feedback: true },
  });
  if (!assignment) return;

  const latestFeedback = assignment.feedback?.length
    ? assignment.feedback.reduce((a, b) => (a.createdAt >= b.createdAt ? a : b))
    : null;

  const metrics = assignment.metrics && typeof assignment.metrics === 'object' ? assignment.metrics : {};
  const reward = computeReward(metrics, latestFeedback);

  await prisma.assignment.update({
    where: { id: assignmentId },
    data: {
      metrics: { ...metrics, reward },
      updatedAt: new Date(),
    },
  });

  await updateReliabilityScore(assignment.agentKey, reward).catch(() => {});
}
