/**
 * Planner config derived from recent reward stats per mission type (entry point).
 * Use to steer useRag and maxSteps without a full RL pipeline.
 */

import { getPrismaClient } from '../lib/prisma.js';

const BASE_MAX_STEPS = 10;
const RECENT_REWARDS_LIMIT = 100;

/**
 * @typedef {Object} PlannerConfig
 * @property {boolean} useRagByDefault
 * @property {number} maxSteps
 */

/**
 * Get planner config for a mission type (entry point) from recent reward history.
 * Rules:
 * - If avg outcomeQualityScore < 0.4 → useRagByDefault = true, maxSteps = base + 2
 * - If avg toolCompletenessScore < 0.5 → maxSteps = base + 1
 * - Else → defaults (useRagByDefault from caller/existing, maxSteps = base)
 *
 * @param {string} missionType - entryPoint (e.g. 'agent_chat_reply', 'campaign_strategy_review')
 * @param {{ useRagByDefault?: boolean }} [existingDefaults] - existing defaults to use when no adjustment
 * @returns {Promise<PlannerConfig>}
 */
export async function getPlannerConfigForMission(missionType, existingDefaults = {}) {
  const prisma = getPrismaClient();
  let avgTool = 0.5;
  let avgOutcome = 0.5;
  let count = 0;

  try {
    const recentTaskIds = await prisma.orchestratorTask.findMany({
      where: { entryPoint: missionType },
      select: { id: true },
      orderBy: { createdAt: 'desc' },
      take: RECENT_REWARDS_LIMIT,
    });
    const ids = recentTaskIds.map((t) => t.id);
    if (ids.length > 0) {
      const rewards = await prisma.orchestratorRunReward.findMany({
        where: { orchestratorTaskId: { in: ids } },
        select: { toolCompletenessScore: true, outcomeQualityScore: true },
      });
      count = rewards.length;
      if (count > 0) {
        avgTool =
          rewards.reduce((s, r) => s + (r.toolCompletenessScore ?? 0), 0) / count;
        avgOutcome =
          rewards.reduce((s, r) => s + (r.outcomeQualityScore ?? 0), 0) / count;
      }
    }
  } catch (err) {
    console.warn('[plannerConfigFromRewards] Query failed:', err?.message || err);
  }

  let useRagByDefault = existingDefaults.useRagByDefault ?? true;
  let maxSteps = BASE_MAX_STEPS;

  if (count > 0) {
    if (avgOutcome < 0.4) {
      useRagByDefault = true;
      maxSteps = BASE_MAX_STEPS + 2;
    }
    if (avgTool < 0.5) {
      maxSteps = Math.max(maxSteps, BASE_MAX_STEPS + 1);
    }
  }

  return { useRagByDefault, maxSteps };
}
