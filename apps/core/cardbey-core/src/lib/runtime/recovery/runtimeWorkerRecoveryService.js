/**
 * Runtime worker recovery service (Phase E).
 * Detects orphan/stale workers and safely requeues execution.
 */

import { getRuntimeCapabilities } from '../runtimeCapabilitiesService.js';
import {
  getWorkerById,
  markWorkerFailed,
  readRuntimeWorkerState,
  WORKER_STATUS,
} from '../workers/runtimeWorkerManager.js';
import { patchGraphNode, getGraphNode } from '../runtimeGraphExecutionState.js';
import { NODE_STATUS } from '../runtimeGraphTypes.js';
import { persistMissionGraph } from '../runtimeMissionGraphService.js';
import { scanHeartbeatAndLeases, RECOVERY_STATE } from './runtimeHeartbeatMonitor.js';
import { recoverExpiredLeases } from './runtimeLeaseRecoveryService.js';
import {
  requeueQueueItem,
} from '../queue/runtimeExecutionQueue.js';
import { readExecutionQueue } from '../queue/runtimeQueuePersistence.js';
import { emitWorkerRecovered } from './runtimeRecoveryBlackboardBridge.js';

function str(v) {
  return typeof v === 'string' ? v.trim() : '';
}

export function isRuntimeWorkerRecoveryEnabled() {
  return getRuntimeCapabilities().runtimeLeaseRecovery === true;
}

/**
 * Run full recovery pass: heartbeat scan → lease reclaim → worker orphan handling.
 * @param {object} metadataJson
 * @param {object} graph
 * @param {string} missionId
 * @param {{ traceId?: string; heartbeatStaleMs?: number }} [ctx]
 */
export async function runRecoveryPass(metadataJson, graph, missionId, ctx = {}) {
  let meta = metadataJson;
  let g = graph;

  const scan = scanHeartbeatAndLeases(meta, { heartbeatStaleMs: ctx.heartbeatStaleMs });
  meta = scan.metadata;

  const leaseRecovery = await recoverExpiredLeases(meta, missionId, {
    traceId: ctx.traceId,
    reclaimedBy: 'runtime_worker_recovery',
  });
  meta = leaseRecovery.metadata;

  /** @type {object[]} */
  const recovered = [];

  for (const candidate of scan.candidates) {
    if (candidate.type === 'stale_worker' && candidate.workerId) {
      const worker = getWorkerById(meta, candidate.workerId);
      if (!worker || worker.status !== WORKER_STATUS.RUNNING) continue;

      meta = markWorkerFailed(meta, candidate.workerId, 'stale_heartbeat', {
        recoveryState: RECOVERY_STATE.ORPHANED,
      });

      if (candidate.queueItemId) {
        const requeue = await requeueQueueItem(meta, missionId, candidate.queueItemId, {
          traceId: ctx.traceId,
          reason: 'stale_worker_recovery',
        });
        meta = requeue.metadata;
      }

      const node = getGraphNode(g, candidate.nodeId);
      if (node && node.status === NODE_STATUS.RUNNING) {
        g = patchGraphNode(g, candidate.nodeId, {
          status: NODE_STATUS.PENDING,
          metadata: { ...node.metadata, recoveryState: RECOVERY_STATE.RECOVERABLE },
        });
        meta = persistMissionGraph(meta, g);
      }

      await emitWorkerRecovered(missionId, worker, ctx.traceId);
      recovered.push({ type: 'stale_worker', workerId: candidate.workerId, nodeId: candidate.nodeId });
    }

    if (candidate.type === 'expired_lease' && candidate.nodeId) {
      const queueItem = readExecutionQueue(meta).items.find(
        (i) => i.nodeId === candidate.nodeId && (i.status === 'running' || i.status === 'claimed'),
      );
      if (queueItem) {
        const requeue = await requeueQueueItem(meta, missionId, queueItem.queueItemId, {
          traceId: ctx.traceId,
          reason: 'expired_lease_recovery',
        });
        meta = requeue.metadata;
        recovered.push({ type: 'expired_lease', nodeId: candidate.nodeId, queueItemId: queueItem.queueItemId });
      }
    }
  }

  return { metadata: meta, graph: g, recovered, candidates: scan.candidates };
}

/**
 * Detect orphan workers (running worker with no active queue item).
 */
export function detectOrphanWorkers(metadataJson) {
  const workers = readRuntimeWorkerState(metadataJson).workers.filter(
    (w) => w.status === WORKER_STATUS.RUNNING,
  );
  const queueItems = readExecutionQueue(metadataJson).items;
  return workers.filter(
    (w) =>
      !queueItems.some(
        (i) => i.workerId === w.workerId && (i.status === 'running' || i.status === 'claimed'),
      ),
  );
}

export default {
  isRuntimeWorkerRecoveryEnabled,
  runRecoveryPass,
  detectOrphanWorkers,
};
