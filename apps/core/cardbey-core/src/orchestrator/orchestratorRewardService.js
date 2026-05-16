/**
 * Orchestrator Reward Service
 * Computes and persists OrchestratorRunReward from a completed run's result.
 * Never throws in a way that breaks the main request.
 */

import { getPrismaClient } from '../lib/prisma.js';

/**
 * @typedef {Object} RewardInput
 * @property {string} orchestratorTaskId
 * @property {string} missionId
 * @property {string} tenantId
 * @property {any} result - OrchestratorTask.result
 * @property {string} [missionType] - entryPoint for this run (optional, for stats)
 */

/**
 * Compute tool-completeness score: share of expected tools that were executed with status ok.
 * @param {string[]} expectedTools
 * @param {Array<{ toolName: string; status: string }>} toolSteps
 * @returns {{ score: number; note?: string }}
 */
function computeToolCompletenessScore(expectedTools, toolSteps) {
  if (!Array.isArray(expectedTools) || expectedTools.length === 0) {
    return { score: 0, note: 'expectedTools missing or empty' };
  }
  const executedOk = new Set(
    (toolSteps || [])
      .filter((s) => s && s.status === 'ok' && s.toolName)
      .map((s) => s.toolName)
  );
  let usedOk = 0;
  for (const name of expectedTools) {
    if (executedOk.has(name)) usedOk += 1;
  }
  const score = usedOk / expectedTools.length;
  return { score, usedOk, total: expectedTools.length };
}

/**
 * Find and normalize readiness/quality scores from result (0–100 -> 0–1). Prefer known keys, then average if multiple.
 * @param {any} result
 * @returns {{ score: number; metricsUsed: string[]; note?: string }}
 */
function computeOutcomeQualityScore(result) {
  if (!result || typeof result !== 'object') {
    return { score: 0, metricsUsed: [], note: 'result missing' };
  }
  const candidates = [
    'storeReadinessScore',
    'productReadinessScore',
    'readinessScore',
    'qualityScore',
    'outcomeQualityScore',
  ];
  const values = [];
  const metricsUsed = [];
  for (const key of candidates) {
    const v = result[key];
    if (v == null) continue;
    const n = Number(v);
    if (!Number.isFinite(n)) continue;
    const normalized = n > 1 ? Math.min(100, n) / 100 : n;
    values.push(Math.max(0, Math.min(1, normalized)));
    metricsUsed.push(key);
  }
  if (values.length === 0) {
    return { score: 0, metricsUsed: [], note: 'no readiness/quality metrics in result' };
  }
  const score = values.reduce((a, b) => a + b, 0) / values.length;
  return { score, metricsUsed };
}

/**
 * Compute and persist reward for a completed orchestrator run.
 * Handles missing data gracefully; logs errors but does not throw.
 *
 * @param {RewardInput} input
 * @returns {Promise<void>}
 */
export async function computeAndSaveReward(input) {
  if (!input || !input.orchestratorTaskId || !input.tenantId) {
    console.warn('[orchestratorRewardService] computeAndSaveReward: missing required fields');
    return;
  }
  const missionId = input.missionId || input.orchestratorTaskId;
  const result = input.result;

  let expectedTools = [];
  if (result && typeof result === 'object') {
    if (Array.isArray(result.expectedTools)) {
      expectedTools = result.expectedTools;
    } else if (result.plan && Array.isArray(result.plan.expectedTools)) {
      expectedTools = result.plan.expectedTools;
    }
  }

  const toolSteps = (result && result.toolSteps) || [];
  const toolCompleteness = computeToolCompletenessScore(expectedTools, toolSteps);
  const outcomeQuality = computeOutcomeQualityScore(result);

  const toolCompletenessScore = Math.max(0, Math.min(1, toolCompleteness.score));
  const outcomeQualityScore = Math.max(0, Math.min(1, outcomeQuality.score));
  const overallReward = 0.4 * toolCompletenessScore + 0.6 * outcomeQualityScore;

  const details = {
    expectedTools,
    executedTools: (toolSteps || []).map((s) => ({ toolName: s.toolName, status: s.status })),
    toolCompletenessNote: toolCompleteness.note,
    outcomeQualityMetricsUsed: outcomeQuality.metricsUsed,
    outcomeQualityNote: outcomeQuality.note,
    ...(input.missionType && { missionType: input.missionType }),
  };

  try {
    const prisma = getPrismaClient();
    await prisma.orchestratorRunReward.create({
      data: {
        orchestratorTaskId: input.orchestratorTaskId,
        missionId,
        tenantId: input.tenantId,
        toolCompletenessScore,
        outcomeQualityScore,
        overallReward,
        details,
      },
    });
  } catch (err) {
    console.warn('[orchestratorRewardService] Failed to save reward:', err?.message || err);
  }
}
