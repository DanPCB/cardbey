/**
 * AgentProfile: load profiles, seed defaults, and provide historical stats for bidding.
 */

import { getPrismaClient } from '../lib/prisma.js';
import { getWeights } from './biddingConfig.js';

const DEFAULT_AGENTS = [
  { agentKey: 'planner', skills: ['plan_marketing', 'strategy', 'next_steps'], baseQuality: 0.85, baseCost: 1.2, baseLatency: 8000 },
  { agentKey: 'research', skills: ['do_research', 'context', 'rag'], baseQuality: 0.8, baseCost: 1, baseLatency: 6000 },
  { agentKey: 'ocr', skills: ['summarize_card', 'extract_card', 'ocr'], baseQuality: 0.9, baseCost: 0.8, baseLatency: 4000 },
];

/**
 * Ensure AgentProfile rows exist for planner, research, ocr (idempotent).
 */
export async function seedAgentProfiles() {
  const prisma = getPrismaClient();
  for (const row of DEFAULT_AGENTS) {
    await prisma.agentProfile.upsert({
      where: { agentKey: row.agentKey },
      create: {
        agentKey: row.agentKey,
        skills: row.skills,
        baseQuality: row.baseQuality,
        baseCost: row.baseCost,
        baseLatency: row.baseLatency,
        reliabilityScore: 0.8,
        maxConcurrency: 5,
      },
      update: {},
    });
  }
}

/**
 * Get all profiles (for auction candidate filter).
 * @returns {Promise<Array<{ agentKey: string, skills: any, baseQuality: number, baseCost: number, baseLatency: number, reliabilityScore: number, maxConcurrency: number }>>}
 */
export async function getAgentProfiles() {
  const prisma = getPrismaClient();
  const list = await prisma.agentProfile.findMany({
    orderBy: { agentKey: 'asc' },
  });
  return list;
}

/**
 * Get historical success rate for (agentKey, taskType) from Assignment + InteractionFeedback.
 * Returns value in [0, 1]; 0.5 if no history.
 */
export async function historicalSuccessRate(agentKey, taskType) {
  const prisma = getPrismaClient();
  const assignments = await prisma.assignment.findMany({
    where: { agentKey, task: { type: taskType } },
    select: { success: true, metrics: true },
    orderBy: { completedAt: 'desc' },
    take: 50,
  });
  const withOutcome = assignments.filter((a) => a.success !== null);
  if (withOutcome.length === 0) return 0.5;
  const successCount = withOutcome.filter((a) => a.success === true).length;
  return successCount / withOutcome.length;
}

/**
 * Recent average latency (ms) for agentKey from Assignment.metrics.latencyMs.
 */
export async function recentLatency(agentKey) {
  const prisma = getPrismaClient();
  const assignments = await prisma.assignment.findMany({
    where: { agentKey },
    select: { metrics: true },
    orderBy: { completedAt: 'desc' },
    take: 20,
  });
  const latencies = assignments
    .map((a) => (a.metrics && typeof a.metrics === 'object' && typeof a.metrics.latencyMs === 'number' ? a.metrics.latencyMs : null))
    .filter((l) => l != null);
  if (latencies.length === 0) return null;
  return latencies.reduce((s, l) => s + l, 0) / latencies.length;
}

/**
 * Count of runs currently in progress (queued or running) for this agentKey.
 */
export async function currentConcurrency(agentKey) {
  const prisma = getPrismaClient();
  const count = await prisma.agentRun.count({
    where: { agentKey, status: { in: ['queued', 'running'] } },
  });
  return count;
}

/**
 * Update reliabilityScore for an agent (moving average with new reward).
 */
export async function updateReliabilityScore(agentKey, reward) {
  if (reward == null || !Number.isFinite(reward)) return;
  const prisma = getPrismaClient();
  const profile = await prisma.agentProfile.findUnique({ where: { agentKey } });
  if (!profile) return;
  const { reliabilityAlpha } = getWeights();
  const r = Math.max(0, Math.min(1, reward));
  const next = (1 - reliabilityAlpha) * profile.reliabilityScore + reliabilityAlpha * r;
  const clamped = Math.max(0, Math.min(1, next));
  await prisma.agentProfile.update({
    where: { agentKey },
    data: { reliabilityScore: clamped, updatedAt: new Date() },
  });
}
