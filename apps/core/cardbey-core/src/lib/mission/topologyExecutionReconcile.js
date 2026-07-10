/**
 * Lightweight heal pass for stuck topology metadata — no toolExecutor imports.
 */

import { getPrismaClient } from '../prisma.js';
import { writeMetadata } from '../persistence/metadataWriter.js';
import { canTransitionMissionPipeline } from '../missionPipelineTransitions.js';
import { safePipelineUpdate } from '../safePipelineUpdate.js';

const TOPOLOGY_STALL_MS = 45_000;

function allTopologyNodesPending(nodeStatus) {
  if (!nodeStatus || typeof nodeStatus !== 'object') return false;
  const values = Object.values(nodeStatus);
  return values.length > 0 && values.every((s) => String(s ?? '').toLowerCase() === 'pending');
}

async function markPipelineFailed(prisma, missionId, extra = {}) {
  const fromStatus = 'executing';
  const toStatus = 'failed';
  if (canTransitionMissionPipeline(fromStatus, toStatus)) {
    await safePipelineUpdate(
      prisma,
      {
        where: { id: missionId, status: fromStatus },
        data: {
          status: toStatus,
          runState: 'failed',
          completedAt: new Date(),
          ...extra,
        },
      },
      { label: 'topologyExecutionReconcile.failed', missionId },
    );
  } else {
    await safePipelineUpdate(
      prisma,
      {
        where: { id: missionId },
        data: {
          status: toStatus,
          runState: 'failed',
          completedAt: new Date(),
          ...extra,
        },
      },
      { label: 'topologyExecutionReconcile.failed_force', missionId },
    );
  }
}

/**
 * Heal missions stuck in metadata.executing with no node progress (interrupted approve / crash).
 * @param {string} missionId
 * @returns {Promise<{ reconciled: boolean; reason?: string } | null>}
 */
export async function reconcileStuckTopologyExecution(missionId) {
  const mid = String(missionId ?? '').trim();
  if (!mid) return null;

  const prisma = getPrismaClient();
  const pipeline = await prisma.missionPipeline.findUnique({
    where: { id: mid },
    select: { id: true, status: true, metadataJson: true },
  });
  if (!pipeline) return null;

  const meta =
    pipeline.metadataJson && typeof pipeline.metadataJson === 'object' && !Array.isArray(pipeline.metadataJson)
      ? pipeline.metadataJson
      : {};

  const pipelineStatus = String(pipeline.status ?? '').trim().toLowerCase();
  if (pipelineStatus === 'cancelled' || pipelineStatus === 'canceled' || meta.endedByUser === true) {
    if (String(meta.multiAgentStatus ?? '').toLowerCase() === 'executing') {
      await writeMetadata(mid, {
        multiAgentStatus: 'cancelled',
        executionState: 'cancelled',
        runtimeState: 'cancelled',
      });
      return { reconciled: true, reason: 'cancelled_metadata_sync' };
    }
    return null;
  }

  const multiStatus = String(meta.multiAgentStatus ?? '').trim().toLowerCase();
  if (multiStatus !== 'executing') return null;
  if (!allTopologyNodesPending(meta.topologyNodeStatus)) return null;

  const startedRaw = meta.executionStartedAt ?? meta.approvedAt;
  const startedMs = startedRaw ? Date.parse(String(startedRaw)) : NaN;
  const ageMs = Number.isFinite(startedMs) ? Date.now() - startedMs : TOPOLOGY_STALL_MS + 1;
  if (ageMs < TOPOLOGY_STALL_MS) return null;

  const message =
    'Topology execution stalled before any step ran. Use Retry on the execution plan to run again.';
  await writeMetadata(mid, {
    multiAgentStatus: 'failed',
    executionState: 'failed',
    runtimeState: 'failed',
    executionFailureReason: 'TOPOLOGY_STALL',
    executionFailureMessage: message,
  });

  if (pipelineStatus === 'executing') {
    await markPipelineFailed(prisma, mid, {
      progressTotalSteps: Number(meta.executionNodeCount) || 0,
      progressCompletedSteps: 0,
    });
  }

  return { reconciled: true, reason: 'topology_stall' };
}
