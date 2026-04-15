/**
 * AgentRun helpers: create and update run records for mission executions.
 * Additive only; no changes to Agent Chat, Threads, or SSE.
 */

import { randomUUID } from 'node:crypto';
import { getPrismaClient } from '../lib/prisma.js';
import { mirrorOrchestraStatusToPipeline } from './orchestraMirror.js';

/**
 * Best-effort: reflect AgentRun status onto MissionPipeline (same id as shadow Mission when present).
 * No-op when no MissionPipeline row exists. Skips when missionId missing (standalone / legacy).
 *
 * @param {string} runId
 * @param {string} newStatus
 * @param {{ error?: string, output?: object }} options
 */
async function syncMissionPipelineFromAgentRunStatus(runId, newStatus, options = {}) {
  const prisma = getPrismaClient();
  let row;
  try {
    row = await prisma.agentRun.findUnique({
      where: { id: runId },
      select: { id: true, missionId: true, agentKey: true },
    });
  } catch {
    return;
  }
  const mid = row?.missionId != null ? String(row.missionId).trim() : '';
  if (!mid) return;

  const s = String(newStatus || '').toLowerCase().trim();

  if (s === 'running') {
    await mirrorOrchestraStatusToPipeline(mid, 'running', { auditSource: 'agent_run_lifecycle' });
    return;
  }

  if (s === 'blocked') {
    await mirrorOrchestraStatusToPipeline(mid, 'running', {
      outputsPatch: {
        agentRun: {
          runId: row.id,
          agentKey: row.agentKey,
          phase: 'blocked',
          reason: 'approval_required',
        },
      },
      auditSource: 'agent_run_lifecycle',
    });
    return;
  }

  if (s === 'failed') {
    const err =
      options.error != null
        ? String(options.error)
        : options.output &&
            typeof options.output === 'object' &&
            options.output.errorTaxonomy &&
            typeof options.output.errorTaxonomy.message === 'string'
          ? String(options.output.errorTaxonomy.message)
          : 'Agent run failed';
    await mirrorOrchestraStatusToPipeline(mid, 'failed', {
      errorMessage: err.slice(0, 2000),
      outputsPatch: {
        agentRun: {
          runId: row.id,
          agentKey: row.agentKey,
          failed: true,
          ...(options.output !== undefined ? { output: options.output } : {}),
        },
      },
      auditSource: 'agent_run_lifecycle',
    });
    return;
  }

  if (s === 'completed') {
    const othersActive = await prisma.agentRun
      .count({
        where: {
          missionId: mid,
          id: { not: runId },
          status: { in: ['queued', 'running'] },
        },
      })
      .catch(() => 0);

    const patch = {
      agentRun: {
        runId: row.id,
        agentKey: row.agentKey,
        ...(options.output !== undefined ? { output: options.output } : {}),
      },
    };

    if (othersActive > 0) {
      await mirrorOrchestraStatusToPipeline(mid, 'running', {
        outputsPatch: patch,
        auditSource: 'agent_run_lifecycle',
      });
    } else {
      await mirrorOrchestraStatusToPipeline(mid, 'completed', {
        outputsPatch: patch,
        auditSource: 'agent_run_lifecycle',
      });
    }
  }
}

/**
 * Trace id for MissionBlackboard rows: use caller correlationId, else reuse latest for mission, else new UUID.
 *
 * @param {string} missionId
 * @param {string | null | undefined} correlationId
 * @returns {Promise<string>}
 */
export async function resolveMissionCorrelationId(missionId, correlationId) {
  const fromCaller =
    typeof correlationId === 'string' && correlationId.trim() ? correlationId.trim() : null;
  if (fromCaller) return fromCaller;

  const mid = typeof missionId === 'string' ? missionId.trim() : '';
  if (!mid) return randomUUID();

  try {
    const prisma = getPrismaClient();
    if (!prisma.missionBlackboard || typeof prisma.missionBlackboard.findFirst !== 'function') {
      return randomUUID();
    }
    const last = await prisma.missionBlackboard.findFirst({
      where: { missionId: mid },
      orderBy: { seq: 'desc' },
      select: { correlationId: true },
    });
    const reuse =
      last?.correlationId != null &&
      typeof last.correlationId === 'string' &&
      last.correlationId.trim();
    if (reuse) return last.correlationId.trim();
  } catch {
    // Table/model missing or DB down — still return a trace id.
  }

  return randomUUID();
}

/**
 * Create an AgentRun record (status "queued").
 *
 * @param {{ missionId: string, tenantId: string, agentKey: string, triggerMessageId?: string, input?: object }} params
 * @returns {Promise<{ id: string, missionId: string, tenantId: string, agentKey: string, status: string, createdAt: Date, updatedAt: Date }>}
 */
export async function createAgentRun({ missionId, tenantId, agentKey, triggerMessageId, input }) {
  const prisma = getPrismaClient();
  const run = await prisma.agentRun.create({
    data: {
      missionId: (missionId || '').trim(),
      tenantId: (tenantId || '').trim(),
      agentKey: (agentKey || '').trim(),
      triggerMessageId: triggerMessageId != null ? String(triggerMessageId).trim() || null : null,
      status: 'queued',
      input: input != null ? input : undefined,
    },
  });
  return run;
}

/**
 * Update an AgentRun's status and optionally error/output.
 *
 * @param {string} runId - AgentRun id
 * @param {string} status - New status (e.g. "running", "completed", "failed")
 * @param {{ error?: string, output?: object }} [options]
 * @returns {Promise<object|null>} Updated run or null if not found
 */
export async function updateAgentRunStatus(runId, status, options = {}) {
  if (!runId || !status) return null;
  const prisma = getPrismaClient();
  const data = { status: String(status).trim(), updatedAt: new Date() };
  if (options.error != null) data.error = String(options.error);
  if (options.output !== undefined) data.output = options.output;
  const run = await prisma.agentRun.updateMany({
    where: { id: runId },
    data,
  });
  if (run.count === 0) return null;
  const updated = await prisma.agentRun.findUnique({ where: { id: runId } });
  await syncMissionPipelineFromAgentRunStatus(runId, String(status).trim(), options).catch(() => {});
  return updated;
}
