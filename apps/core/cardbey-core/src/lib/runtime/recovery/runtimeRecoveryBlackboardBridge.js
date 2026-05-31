/**
 * Queue / recovery / replay blackboard bridge (Phase E).
 */

import { appendEvent } from '../../missionBlackboard.js';

async function emitRecoveryEvent(missionId, eventType, payload, traceId = null) {
  try {
    await appendEvent(missionId, eventType, payload, traceId ? { traceId } : {});
  } catch (e) {
    console.warn(`[RecoveryBlackboard] ${eventType} emit failed:`, e?.message || e);
  }
}

export async function emitQueueEnqueued(missionId, item, traceId) {
  return emitRecoveryEvent(
    missionId,
    'runtime.queue.enqueued',
    { queueItemId: item.queueItemId, nodeId: item.nodeId, graphId: item.graphId },
    traceId,
  );
}

export async function emitQueueClaimed(missionId, item, traceId) {
  return emitRecoveryEvent(
    missionId,
    'runtime.queue.claimed',
    { queueItemId: item.queueItemId, nodeId: item.nodeId },
    traceId,
  );
}

export async function emitQueueCompleted(missionId, item, traceId) {
  return emitRecoveryEvent(
    missionId,
    'runtime.queue.completed',
    { queueItemId: item?.queueItemId, nodeId: item?.nodeId },
    traceId,
  );
}

export async function emitQueueFailed(missionId, item, reason, traceId) {
  return emitRecoveryEvent(
    missionId,
    'runtime.queue.failed',
    { queueItemId: item?.queueItemId, nodeId: item?.nodeId, reason },
    traceId,
  );
}

export async function emitLeaseExpired(missionId, lease, traceId) {
  return emitRecoveryEvent(
    missionId,
    'runtime.lease.expired',
    { leaseId: lease.leaseId, nodeId: lease.nodeId, workerId: lease.workerId },
    traceId,
  );
}

export async function emitLeaseReclaimed(missionId, recovery, traceId) {
  return emitRecoveryEvent(
    missionId,
    'runtime.lease.reclaimed',
    {
      leaseId: recovery.leaseId,
      nodeId: recovery.nodeId,
      reclaimedBy: recovery.reclaimedBy,
    },
    traceId,
  );
}

export async function emitWorkerRecovered(missionId, worker, traceId) {
  return emitRecoveryEvent(
    missionId,
    'runtime.worker.recovered',
    { workerId: worker.workerId, nodeId: worker.nodeId },
    traceId,
  );
}

export async function emitNodeRequeued(missionId, item, traceId) {
  return emitRecoveryEvent(
    missionId,
    'runtime.node.requeued',
    { queueItemId: item?.queueItemId, nodeId: item?.nodeId, retryCount: item?.retryCount },
    traceId,
  );
}

export async function emitReplayBlocked(missionId, node, replayKey, traceId) {
  return emitRecoveryEvent(
    missionId,
    'runtime.replay.blocked',
    { nodeId: node.nodeId, replayKey },
    traceId,
  );
}

export default {
  emitQueueEnqueued,
  emitQueueClaimed,
  emitQueueCompleted,
  emitQueueFailed,
  emitLeaseExpired,
  emitLeaseReclaimed,
  emitWorkerRecovered,
  emitNodeRequeued,
  emitReplayBlocked,
};
