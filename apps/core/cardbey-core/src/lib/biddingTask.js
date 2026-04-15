/**
 * Bidding layer: create Task, run auction (Bids), select winner, create Assignment.
 * Pure bidding logic; orchestration calls this then creates AgentRun and links Assignment.
 */

import { getPrismaClient } from '../lib/prisma.js';
import { getWeights, BIDDING_LAYER_ENABLED } from './biddingConfig.js';
import {
  getAgentProfiles,
  historicalSuccessRate,
  recentLatency,
  currentConcurrency,
} from './agentProfile.js';

/** Task types that map to agent skills. */
const TASK_TYPE_TO_SKILLS = {
  plan_marketing: ['plan_marketing', 'strategy', 'next_steps'],
  do_research: ['do_research', 'context', 'rag'],
  summarize_card: ['summarize_card', 'extract_card', 'ocr'],
};

/**
 * Check if profile can handle task type (by agentKey or skills).
 */
function profileSupportsTaskType(profile, taskType) {
  const skills = profile.skills;
  const want = TASK_TYPE_TO_SKILLS[taskType] || [taskType];
  if (Array.isArray(skills)) {
    if (skills.some((s) => want.includes(s))) return true;
  }
  return want.includes(profile.agentKey);
}

/**
 * Estimate token cost for task (placeholder; can use payload size or model config).
 */
function estimatedTokens(task, _agentKey) {
  const payload = task.payload && typeof task.payload === 'object' ? JSON.stringify(task.payload) : '';
  return Math.max(100, Math.min(5000, payload.length / 2));
}

/**
 * Exploration bonus: encourage under-used agents (simple UCB-style: 1/sqrt(n+1) scaled).
 */
async function explorationBonus(agentKey, taskType, prisma) {
  const count = await prisma.assignment.count({
    where: { agentKey, task: { type: taskType } },
  });
  return 1 / Math.sqrt(count + 1);
}

/**
 * Compute one bid score (pure function of task, profile, historical stats).
 */
export async function computeBid(task, profile, stats) {
  const { wQuality, wCost, wLatency, wExploration } = getWeights();
  const qualityEstimate =
    (stats.historicalSuccessRate != null ? (profile.baseQuality + stats.historicalSuccessRate) / 2 : profile.baseQuality);
  const cost = profile.baseCost + (stats.estimatedTokens || 0) / 10000;
  const latency = stats.recentLatency != null ? stats.recentLatency : profile.baseLatency;
  const explorationBonusVal = stats.explorationBonus != null ? stats.explorationBonus : 0.1;

  const score =
    wQuality * qualityEstimate - wCost * cost - wLatency * (latency / 10000) + wExploration * explorationBonusVal;

  return {
    score,
    components: {
      qualityEstimate,
      cost,
      latency,
      explorationBonus: explorationBonusVal,
    },
    rationale: `quality=${qualityEstimate.toFixed(2)} cost=${cost.toFixed(2)} latency=${latency}ms exploration=${explorationBonusVal.toFixed(2)}`,
  };
}

/**
 * Create an AgentTask (pending).
 */
export async function createAgentTask({ missionId, userMessageId, type, payload }) {
  const prisma = getPrismaClient();
  return prisma.agentTask.create({
    data: {
      missionId: (missionId || '').trim(),
      userMessageId: userMessageId != null ? String(userMessageId).trim() || null : null,
      type: (type || 'plan_marketing').trim(),
      payload: payload != null ? payload : undefined,
      status: 'pending',
    },
  });
}

/**
 * Run auction for a task: collect candidates, compute bids, persist Bid rows, select winner, create Assignment.
 * Returns { assignment, winningAgentKey, bids } or null if no candidates.
 */
export async function runAuction(taskId) {
  const prisma = getPrismaClient();
  const task = await prisma.agentTask.findUnique({
    where: { id: taskId },
    select: { id: true, type: true, payload: true, missionId: true },
  });
  if (!task) return null;

  const profiles = await getAgentProfiles();
  const candidates = [];
  for (const profile of profiles) {
    if (!profileSupportsTaskType(profile, task.type)) continue;
    const concurrency = await currentConcurrency(profile.agentKey);
    if (concurrency >= profile.maxConcurrency) continue;
    candidates.push(profile);
  }

  if (candidates.length === 0) {
    return null;
  }

  const bids = [];
  for (const profile of candidates) {
    const historicalSuccessRateVal = await historicalSuccessRate(profile.agentKey, task.type);
    const recentLatencyVal = await recentLatency(profile.agentKey);
    const explorationBonusVal = await explorationBonus(profile.agentKey, task.type, prisma);
    const estimatedTokensVal = estimatedTokens(task, profile.agentKey);

    const bidResult = await computeBid(task, profile, {
      historicalSuccessRate: historicalSuccessRateVal,
      recentLatency: recentLatencyVal,
      explorationBonus: explorationBonusVal,
      estimatedTokens: estimatedTokensVal,
    });

    const bidRow = await prisma.bid.create({
      data: {
        taskId: task.id,
        agentKey: profile.agentKey,
        score: bidResult.score,
        components: bidResult.components,
        rationale: bidResult.rationale,
      },
    });
    bids.push({ ...bidResult, agentKey: profile.agentKey, id: bidRow.id });
  }

  // Optional: exploration epsilon – with probability epsilon pick random candidate
  const { explorationEpsilon } = getWeights();
  let winner = bids[0];
  if (explorationEpsilon > 0 && Math.random() < explorationEpsilon && bids.length > 1) {
    winner = bids[Math.floor(Math.random() * bids.length)];
  } else {
    winner = bids.reduce((a, b) => (a.score >= b.score ? a : b));
  }

  const assignment = await prisma.assignment.create({
    data: {
      taskId: task.id,
      agentKey: winner.agentKey,
      matchedScore: winner.score,
    },
  });

  await prisma.agentTask.update({
    where: { id: taskId },
    data: { status: 'assigned', updatedAt: new Date() },
  });

  return {
    assignment,
    winningAgentKey: winner.agentKey,
    bids,
  };
}

/**
 * Link an AgentRun to an Assignment (set Assignment.agentRunId).
 */
export async function linkAssignmentToRun(assignmentId, agentRunId) {
  const prisma = getPrismaClient();
  await prisma.assignment.update({
    where: { id: assignmentId },
    data: { agentRunId, updatedAt: new Date() },
  });
}

/**
 * Mark task as completed or failed (after run finishes).
 */
export async function completeAgentTask(taskId, status = 'completed') {
  const prisma = getPrismaClient();
  await prisma.agentTask.updateMany({
    where: { id: taskId },
    data: { status, updatedAt: new Date() },
  });
}

export { BIDDING_LAYER_ENABLED };
