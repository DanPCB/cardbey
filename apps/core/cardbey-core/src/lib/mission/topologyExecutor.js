/**
 * topologyExecutor — run approved topology (Phase 4: DAG node dispatch).
 */

import { getPrismaClient } from '../prisma.js';
import { canTransitionMissionPipeline } from '../missionPipelineTransitions.js';
import { safePipelineUpdate } from '../safePipelineUpdate.js';
import { readMetadata, writeMetadata } from '../persistence/metadataWriter.js';
import { runTopologyNodes } from './topologyNodeRunner.js';

/** @typedef {'campaign' | 'store' | 'generic'} TopologyExecutionMode */

/**
 * @param {string | null | undefined} missionType
 * @param {Record<string, unknown> | null | undefined} [metadata]
 * @returns {TopologyExecutionMode}
 */
export function resolveTopologyExecutionMode(missionType, metadata = null) {
  const type = String(missionType ?? '').trim().toLowerCase();
  const source = String(metadata?.source ?? '').trim().toLowerCase();
  const compilerTool = String(metadata?.compilerTool ?? metadata?.tool ?? '').trim().toLowerCase();

  if (
    type === 'launch_campaign' ||
    type === 'campaign' ||
    type === 'campaign_orchestration' ||
    compilerTool === 'create_campaign' ||
    compilerTool === 'launch_campaign'
  ) {
    return 'campaign';
  }

  if (
    type === 'store' ||
    type === 'store_creation_workflow' ||
    type === 'create_store' ||
    source === 'store_creation'
  ) {
    return 'store';
  }

  return 'generic';
}

/**
 * @param {import('../lib/prisma.js').PrismaClient} prisma
 * @param {string} missionId
 * @param {string} fromStatus
 * @param {string} toStatus
 * @param {Record<string, unknown>} [extra]
 */
async function transitionMissionStatus(prisma, missionId, fromStatus, toStatus, extra = {}) {
  if (!canTransitionMissionPipeline(fromStatus, toStatus)) return false;
  const result = await safePipelineUpdate(
    prisma,
    {
      where: { id: missionId, status: fromStatus },
      data: { status: toStatus, ...extra },
    },
    { label: `topologyExecutor.${fromStatus}_to_${toStatus}`, missionId },
  );
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[topologyExecutor] transition: ${fromStatus} -> ${toStatus} mission=${missionId}`);
  }
  return Boolean(result);
}

/**
 * Advance mission through valid pipeline transitions before topology execution.
 *
 * @param {import('../lib/prisma.js').PrismaClient} prisma
 * @param {string} missionId
 */
export async function ensureMissionReadyForTopologyExecution(prisma, missionId) {
  const row = await prisma.missionPipeline.findUnique({
    where: { id: missionId },
    select: { status: true },
  });
  if (!row) throw new Error(`MissionPipeline not found: ${missionId}`);

  let status = String(row.status ?? '').trim();

  if (status === 'awaiting_confirmation') {
    const moved = await transitionMissionStatus(prisma, missionId, 'awaiting_confirmation', 'queued');
    if (!moved) {
      throw new Error(`Cannot transition mission ${missionId} from awaiting_confirmation to queued`);
    }
    status = 'queued';
  }

  if (status === 'queued') {
    const moved = await transitionMissionStatus(prisma, missionId, 'queued', 'executing', {
      runState: 'running',
      startedAt: new Date(),
    });
    if (!moved) {
      throw new Error(`Cannot transition mission ${missionId} from queued to executing`);
    }
    return 'executing';
  }

  if (status === 'executing') {
    await safePipelineUpdate(
      prisma,
      {
        where: { id: missionId },
        data: { runState: 'running', startedAt: new Date() },
      },
      { label: 'topologyExecutor.resume_executing', missionId },
    );
    return 'executing';
  }

  if (status === 'failed') {
    const moved = await transitionMissionStatus(prisma, missionId, 'failed', 'queued');
    if (!moved) {
      throw new Error(`Cannot retry mission ${missionId} from failed`);
    }
    const executing = await transitionMissionStatus(prisma, missionId, 'queued', 'executing', {
      runState: 'running',
      startedAt: new Date(),
    });
    if (!executing) {
      throw new Error(`Cannot transition retried mission ${missionId} to executing`);
    }
    return 'executing';
  }

  throw new Error(`Mission ${missionId} is ${status}; cannot start topology execution`);
}

/**
 * @param {import('../lib/prisma.js').PrismaClient} prisma
 * @param {string} missionId
 * @param {'completed' | 'failed'} finalStatus
 * @param {Record<string, unknown>} extra
 */
async function finalizeMissionStatus(prisma, missionId, finalStatus, extra = {}) {
  const fromStatus = 'executing';
  if (!canTransitionMissionPipeline(fromStatus, finalStatus)) {
    await safePipelineUpdate(
      prisma,
      {
        where: { id: missionId },
        data: {
          status: finalStatus,
          runState: finalStatus === 'completed' ? 'done' : 'failed',
          completedAt: new Date(),
          ...extra,
        },
      },
      { label: `topologyExecutor.finalize_${finalStatus}`, missionId },
    );
    return;
  }

  await transitionMissionStatus(prisma, missionId, fromStatus, finalStatus, {
    runState: finalStatus === 'completed' ? 'done' : 'failed',
    completedAt: new Date(),
    ...extra,
  });
}

/**
 * @param {Record<string, unknown>} pipelineMeta
 * @param {{ userId?: string; storeId?: string; missionType?: string; executionMode?: TopologyExecutionMode; missionId?: string }} context
 * @returns {Record<string, unknown>}
 */
function buildExecutionContext(pipelineMeta, context) {
  return {
    missionId: context.missionId,
    userId: context.userId ?? pipelineMeta.userId ?? null,
    storeId:
      context.storeId ??
      pipelineMeta.storeId ??
      pipelineMeta.targetId ??
      null,
    tenantId: pipelineMeta.tenantId ?? context.userId ?? null,
    goal:
      typeof pipelineMeta.goal === 'string' && pipelineMeta.goal.trim()
        ? pipelineMeta.goal.trim()
        : null,
    executionMode: context.executionMode ?? 'generic',
    missionType: context.missionType ?? null,
  };
}

/**
 * @param {string} missionId
 * @param {import('../artifact/types.ts').TopologyArtifact | Record<string, unknown>} topology
 * @param {{ userId?: string; storeId?: string; missionType?: string; executionMode?: TopologyExecutionMode; missionId?: string }} [context]
 */
export async function executeApprovedTopology(missionId, topology, context = {}) {
  const mid = String(missionId ?? '').trim();
  if (!mid) throw new Error('topologyExecutor requires missionId');

  const nodes = Array.isArray(topology?.nodes) ? topology.nodes : [];
  if (!nodes.length) {
    throw new Error('topologyExecutor requires approved topology with nodes');
  }

  const prisma = getPrismaClient();
  const pipeline = await prisma.missionPipeline.findUnique({
    where: { id: mid },
    select: { type: true, metadataJson: true, outputsJson: true, targetId: true, targetType: true },
  });

  const pipelineMeta =
    pipeline?.metadataJson && typeof pipeline.metadataJson === 'object' && !Array.isArray(pipeline.metadataJson)
      ? pipeline.metadataJson
      : {};

  const executionMode =
    context.executionMode ??
    resolveTopologyExecutionMode(pipeline?.type ?? context.missionType, pipelineMeta);

  const resolvedStoreId =
    context.storeId ??
    (typeof pipelineMeta.storeId === 'string' ? pipelineMeta.storeId : null) ??
    (pipeline?.targetType === 'store' && pipeline?.targetId ? pipeline.targetId : null);

  await writeMetadata(mid, {
    multiAgentStatus: 'executing',
    approvalStatus: 'approved',
    executionStartedAt: new Date().toISOString(),
    executionState: 'queued',
    executionMode,
    executionNodeCount: nodes.length,
    executionContext: {
      userId: context.userId ?? null,
      storeId: resolvedStoreId ?? null,
      missionType: pipeline?.type ?? context.missionType ?? null,
    },
  });

  await ensureMissionReadyForTopologyExecution(prisma, mid);

  if (executionMode !== 'campaign') {
    const metadata = await readMetadata(mid);
    return {
      ok: true,
      status: 'executing',
      missionId: mid,
      executionMode,
      nodeCount: nodes.length,
      metadata,
      message: 'Topology queued — campaign-mode node dispatch only in Phase 4',
    };
  }

  const executionContext = buildExecutionContext(pipelineMeta, {
    ...context,
    storeId: resolvedStoreId ?? undefined,
    missionId: mid,
    executionMode,
    missionType: pipeline?.type ?? context.missionType ?? null,
  });

  const nodeRun = await runTopologyNodes(mid, topology, executionContext);

  const priorOutputs =
    pipeline?.outputsJson && typeof pipeline.outputsJson === 'object' && !Array.isArray(pipeline.outputsJson)
      ? pipeline.outputsJson
      : {};
  const outputsJson = { ...priorOutputs, ...nodeRun.outputs };

  await finalizeMissionStatus(prisma, mid, nodeRun.status === 'completed' ? 'completed' : 'failed', {
    progressTotalSteps: nodes.length,
    progressCompletedSteps: nodeRun.completedCount + nodeRun.skippedCount,
    outputsJson,
  });

  const finalMetadata = await readMetadata(mid);

  return {
    ok: nodeRun.ok,
    status: nodeRun.status,
    missionId: mid,
    executionMode,
    nodeCount: nodes.length,
    metadata: finalMetadata,
    nodeRun,
  };
}
