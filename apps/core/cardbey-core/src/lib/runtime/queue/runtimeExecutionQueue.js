/**
 * Runtime execution queue — durable node execution ordering (Phase E).
 * Scheduler enqueues; worker manager claims; skill executor runs.
 */

import { randomUUID, createHash } from 'node:crypto';
import { getRuntimeCapabilities } from '../runtimeCapabilitiesService.js';
import {
  readExecutionQueue,
  writeExecutionQueue,
  getActiveQueueItemForNode,
  getQueueItemById,
} from './runtimeQueuePersistence.js';
import {
  buildReplayProtectionKey,
  isReplayBlocked,
  recordReplayCompletion,
} from '../recovery/runtimeNodeReplayProtection.js';
import {
  emitQueueEnqueued,
  emitQueueClaimed,
  emitQueueCompleted,
  emitQueueFailed,
  emitNodeRequeued,
  emitReplayBlocked,
} from '../recovery/runtimeRecoveryBlackboardBridge.js';

export const QUEUE_STATUS = {
  QUEUED: 'queued',
  CLAIMED: 'claimed',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  ABANDONED: 'abandoned',
  REPLAY_BLOCKED: 'replay_blocked',
  RETRY_SCHEDULED: 'retry_scheduled',
};

const TERMINAL_QUEUE_STATUSES = new Set([
  QUEUE_STATUS.COMPLETED,
  QUEUE_STATUS.FAILED,
  QUEUE_STATUS.ABANDONED,
  QUEUE_STATUS.REPLAY_BLOCKED,
]);

function str(v) {
  return typeof v === 'string' ? v.trim() : '';
}

export function isRuntimeExecutionQueueEnabled() {
  return getRuntimeCapabilities().runtimeExecutionQueue === true;
}

export function isRuntimeDurableExecutionEnabled() {
  const caps = getRuntimeCapabilities();
  return (
    caps.runtimeExecutionQueue === true &&
    caps.runtimeLeaseRecovery === true &&
    caps.runtimeReplayProtection === true &&
    caps.runtimeHeartbeatMonitor === true
  );
}

function patchQueueItem(metadataJson, queueItemId, patch) {
  const id = str(queueItemId);
  const { items } = readExecutionQueue(metadataJson);
  const next = items.map((item) => {
    if (item.queueItemId !== id) return item;
    return {
      ...item,
      ...patch,
      metadata: patch.metadata ? { ...item.metadata, ...patch.metadata } : item.metadata,
    };
  });
  return writeExecutionQueue(metadataJson, next);
}

/**
 * @param {object} metadataJson
 * @param {string} missionId
 * @param {object} graph
 * @param {object} node
 * @param {{ priority?: number; retryCount?: number; forceRetry?: boolean }} [opts]
 */
export function enqueueGraphNode(metadataJson, missionId, graph, node, opts = {}) {
  const nodeId = str(node.nodeId);
  if (!nodeId) return { ok: false, code: 'INVALID_NODE', metadata: metadataJson };

  const existing = getActiveQueueItemForNode(metadataJson, nodeId);
  if (existing) {
    return { ok: true, code: 'ALREADY_QUEUED', metadata: metadataJson, item: existing, reused: true };
  }

  if (isReplayBlocked(metadataJson, missionId, graph, node, opts.forceRetry === true)) {
    const replayKey = buildReplayProtectionKey(missionId, graph, node);
    const blockedItem = {
      queueItemId: randomUUID(),
      graphId: graph.graphId,
      nodeId,
      workerId: null,
      status: QUEUE_STATUS.REPLAY_BLOCKED,
      priority: 0,
      enqueuedAt: new Date().toISOString(),
      claimedAt: null,
      completedAt: new Date().toISOString(),
      retryCount: 0,
      replayProtectionKey: replayKey,
      metadata: { reason: 'replay_protected' },
    };
    const metadata = writeExecutionQueue(metadataJson, [...readExecutionQueue(metadataJson).items, blockedItem]);
    return { ok: false, code: 'REPLAY_BLOCKED', metadata, item: blockedItem, replayBlocked: true };
  }

  const replayKey = buildReplayProtectionKey(missionId, graph, node);
  const item = {
    queueItemId: randomUUID(),
    graphId: graph.graphId,
    nodeId,
    workerId: null,
    status: opts.retryCount > 0 ? QUEUE_STATUS.RETRY_SCHEDULED : QUEUE_STATUS.QUEUED,
    priority: Math.floor(Number(opts.priority) || 0),
    enqueuedAt: new Date().toISOString(),
    claimedAt: null,
    completedAt: null,
    retryCount: Math.max(0, Math.floor(Number(opts.retryCount) || 0)),
    replayProtectionKey: replayKey,
    metadata: {},
  };

  const metadata = writeExecutionQueue(metadataJson, [...readExecutionQueue(metadataJson).items, item]);
  return { ok: true, code: 'ENQUEUED', metadata, item, reused: false };
}

/**
 * Enqueue all executable nodes from scheduler analysis.
 */
export async function enqueueExecutableNodes(metadataJson, missionId, graph, executableNodes, ctx = {}) {
  let meta = metadataJson;
  /** @type {object[]} */
  const enqueued = [];

  for (const node of executableNodes) {
    const result = enqueueGraphNode(meta, missionId, graph, node, {
      forceRetry: ctx.forceRetry,
      retryCount: node.retries?.count ?? 0,
    });

    if (result.replayBlocked) {
      await emitReplayBlocked(missionId, node, result.item?.replayProtectionKey, ctx.traceId);
    } else if (result.ok && !result.reused) {
      await emitQueueEnqueued(missionId, result.item, ctx.traceId);
      enqueued.push(result.item);
    }

    meta = result.metadata;
  }

  return { metadata: meta, enqueued };
}

/**
 * Claim next queue item (FIFO by priority desc, then enqueuedAt asc).
 */
export function claimNextQueueItem(metadataJson, graph, opts = {}) {
  const preferredNodeId = str(opts.preferredNodeId);
  const { items } = readExecutionQueue(metadataJson);

  const claimable = items
    .filter((i) => i.status === QUEUE_STATUS.QUEUED || i.status === QUEUE_STATUS.RETRY_SCHEDULED)
    .sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      return Date.parse(a.enqueuedAt ?? 0) - Date.parse(b.enqueuedAt ?? 0);
    });

  let candidate = preferredNodeId
    ? claimable.find((i) => i.nodeId === preferredNodeId)
    : claimable[0];

  if (!candidate) {
    return { ok: false, code: 'NO_CLAIMABLE_QUEUE_ITEMS', metadata: metadataJson, item: null };
  }

  const now = new Date().toISOString();
  let metadata = patchQueueItem(metadataJson, candidate.queueItemId, {
    status: QUEUE_STATUS.CLAIMED,
    claimedAt: now,
    metadata: { claimedBy: opts.claimedBy ?? 'runtime_kernel' },
  });

  const item = getQueueItemById(metadata, candidate.queueItemId);
  return { ok: true, code: 'CLAIMED', metadata, item, graph };
}

export function markQueueItemRunning(metadataJson, queueItemId, workerId) {
  return patchQueueItem(metadataJson, queueItemId, {
    status: QUEUE_STATUS.RUNNING,
    workerId: str(workerId) || null,
    metadata: { runningAt: new Date().toISOString() },
  });
}

export async function markQueueItemCompleted(metadataJson, missionId, graph, node, queueItemId, ctx = {}) {
  let metadata = patchQueueItem(metadataJson, queueItemId, {
    status: QUEUE_STATUS.COMPLETED,
    completedAt: new Date().toISOString(),
  });
  const item = getQueueItemById(metadata, queueItemId);
  metadata = recordReplayCompletion(metadata, missionId, graph, node, item);
  await emitQueueCompleted(missionId, item, ctx.traceId);
  return { metadata, item };
}

export async function markQueueItemFailed(metadataJson, missionId, queueItemId, reason, ctx = {}) {
  const metadata = patchQueueItem(metadataJson, queueItemId, {
    status: QUEUE_STATUS.FAILED,
    completedAt: new Date().toISOString(),
    metadata: { failureReason: reason },
  });
  const item = getQueueItemById(metadata, queueItemId);
  await emitQueueFailed(missionId, item, reason, ctx.traceId);
  return { metadata, item };
}

export async function requeueQueueItem(metadataJson, missionId, queueItemId, ctx = {}) {
  const existing = getQueueItemById(metadataJson, queueItemId);
  if (!existing) return { ok: false, code: 'NOT_FOUND', metadata: metadataJson };

  const metadata = patchQueueItem(metadataJson, queueItemId, {
    status: QUEUE_STATUS.RETRY_SCHEDULED,
    retryCount: existing.retryCount + 1,
    claimedAt: null,
    completedAt: null,
    workerId: null,
    metadata: { requeuedAt: new Date().toISOString(), reason: ctx.reason ?? 'recovery' },
  });
  const item = getQueueItemById(metadata, queueItemId);
  await emitNodeRequeued(missionId, item, ctx.traceId);
  return { ok: true, metadata, item };
}

export function abandonQueueItem(metadataJson, queueItemId, reason = 'abandoned') {
  return patchQueueItem(metadataJson, queueItemId, {
    status: QUEUE_STATUS.ABANDONED,
    completedAt: new Date().toISOString(),
    metadata: { abandonReason: reason },
  });
}

export function buildExecutionHash(node) {
  const payload = JSON.stringify({
    nodeId: node.nodeId,
    tool: node.assignedTool,
    step: node.metadata?.stepNumber,
    agent: node.assignedAgent,
  });
  return createHash('sha256').update(payload).digest('hex').slice(0, 16);
}

export default {
  QUEUE_STATUS,
  isRuntimeExecutionQueueEnabled,
  isRuntimeDurableExecutionEnabled,
  enqueueGraphNode,
  enqueueExecutableNodes,
  claimNextQueueItem,
  markQueueItemRunning,
  markQueueItemCompleted,
  markQueueItemFailed,
  requeueQueueItem,
  abandonQueueItem,
  buildExecutionHash,
};
