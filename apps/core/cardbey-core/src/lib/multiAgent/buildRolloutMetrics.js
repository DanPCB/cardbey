/**
 * Rollout metrics from MissionPipeline metadata (Control Center).
 */

import { getPrismaClient } from '../../lib/prisma.js';
import { loadMultiAgentRuntimeConfig } from '../../multiAgent/config/agent.config.js';
import { loadDeepSeekConfig } from '../../multiAgent/config/deepseek.config.js';

function parseSinceHours(raw) {
  const n = Number.parseInt(String(raw ?? '168'), 10);
  return Number.isFinite(n) && n > 0 ? n : 168;
}

function metaStatus(meta) {
  if (!meta || typeof meta !== 'object') return null;
  const s = meta.multiAgentStatus ?? meta.multi_agent_status;
  return s != null ? String(s).trim().toLowerCase() : null;
}

function qualityScore(meta) {
  if (!meta || typeof meta !== 'object') return null;
  const q = meta.qualityScore ?? meta.quality_score ?? meta.multiAgentQuality;
  const n = Number(q);
  return Number.isFinite(n) ? n : null;
}

function nodeCount(meta) {
  if (!meta || typeof meta !== 'object') return null;
  const topo = meta.multiAgentTopology ?? meta.multi_agent_topology;
  if (topo && typeof topo === 'object' && Array.isArray(topo.nodes)) {
    return topo.nodes.length;
  }
  const plan = meta.deepSeekPlan ?? meta.deep_seek_plan;
  if (plan && typeof plan === 'object' && Array.isArray(plan.steps)) {
    return plan.steps.length;
  }
  return null;
}

export async function buildMultiAgentRolloutMetrics({ sinceHours = 168 } = {}) {
  const prisma = getPrismaClient();
  const since = new Date(Date.now() - sinceHours * 60 * 60 * 1000);
  const runtime = loadMultiAgentRuntimeConfig();
  const deepseek = loadDeepSeekConfig();

  const rows = await prisma.missionPipeline.findMany({
    where: { createdAt: { gte: since } },
    orderBy: { createdAt: 'desc' },
    take: 500,
    select: {
      id: true,
      type: true,
      status: true,
      metadataJson: true,
      createdAt: true,
    },
  });

  const multiAgentRows = rows.filter((row) => {
    const meta = row.metadataJson;
    return (
      metaStatus(meta) != null ||
      (meta && typeof meta === 'object' && (meta.deepSeekPlan || meta.multiAgentTopology || meta._deepSeekMultiAgent))
    );
  });

  const counts = {
    totalStoreMissions: multiAgentRows.length,
    shadow: 0,
    pending: 0,
    approved: 0,
    rejected: 0,
    executing: 0,
    withReasoning: 0,
    withTopology: 0,
  };

  for (const row of multiAgentRows) {
    const meta = row.metadataJson;
    const status = metaStatus(meta);
    if (status === 'shadow' || meta?._deepSeekMultiAgent?.shadow) counts.shadow += 1;
    if (status === 'pending_approval' || status === 'awaiting_owner_input') counts.pending += 1;
    if (status === 'approved') counts.approved += 1;
    if (status === 'rejected') counts.rejected += 1;
    if (status === 'executing') counts.executing += 1;
    if (meta?.multiAgentReasoning || meta?.deepSeekPlan?.reasoning) counts.withReasoning += 1;
    if (meta?.multiAgentTopology || meta?.deepSeekPlan?.steps) counts.withTopology += 1;
  }

  const decided = counts.approved + counts.rejected;
  const approvalRate = decided > 0 ? Math.round((counts.approved / decided) * 1000) / 10 : null;

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    windowHours: sinceHours,
    flags: {
      MULTI_AGENT_ENABLED: runtime.enabled,
      MULTI_AGENT_EXECUTE: runtime.executePlans,
      MULTI_AGENT_SHADOW: deepseek.shadowEnabled,
      MULTI_AGENT_ROLLOUT_PERCENT: Number.parseInt(process.env.MULTI_AGENT_ROLLOUT_PERCENT ?? '0', 10) || 0,
      DEEPSEEK_AB_TRAFFIC_PERCENT: deepseek.abTrafficPercent,
    },
    counts,
    approvalRate,
    recentSamples: multiAgentRows.slice(0, 20).map((row) => ({
      missionId: row.id,
      multiAgentStatus: metaStatus(row.metadataJson),
      qualityScore: qualityScore(row.metadataJson),
      nodeCount: nodeCount(row.metadataJson),
    })),
  };
}

export async function buildMultiAgentHealth() {
  const runtime = loadMultiAgentRuntimeConfig();
  const deepseek = loadDeepSeekConfig();
  const issues = [];
  const warnings = [];

  if (!runtime.enabled) {
    warnings.push('MULTI_AGENT_ENABLED is false');
  }
  if (!deepseek.apiKey && runtime.enabled) {
    issues.push('DEEPSEEK_API_KEY is not configured');
  }
  if (runtime.executePlans && !runtime.hitlEnabled) {
    warnings.push('MULTI_AGENT_EXECUTE is on without HITL_REVIEW_ENABLED');
  }

  return {
    ok: issues.length === 0,
    issues,
    warnings,
    flags: {
      MULTI_AGENT_ENABLED: runtime.enabled,
      MULTI_AGENT_EXECUTE: runtime.executePlans,
      MULTI_AGENT_SHADOW: deepseek.shadowEnabled,
      AGENT_TELEMETRY_ENABLED: runtime.telemetryEnabled,
      MONITORING_ENABLED: process.env.MONITORING_ENABLED !== 'false',
    },
  };
}
