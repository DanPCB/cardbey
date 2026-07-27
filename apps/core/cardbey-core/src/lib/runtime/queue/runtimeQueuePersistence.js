/**
 * Runtime execution queue persistence (Phase E).
 * Stored in metadataJson.runtimeExecutionQueue
 */

function asObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}

function str(v) {
  return typeof v === 'string' ? v.trim() : '';
}

/**
 * @param {unknown} metadataJson
 */
export function readExecutionQueue(metadataJson) {
  const queue = asObject(asObject(metadataJson).runtimeExecutionQueue);
  return {
    items: Array.isArray(queue.items) ? queue.items.map(normalizeQueueItem) : [],
    updatedAt: str(queue.updatedAt) || null,
  };
}

function normalizeQueueItem(raw) {
  const item = asObject(raw);
  return {
    queueItemId: str(item.queueItemId),
    graphId: str(item.graphId),
    nodeId: str(item.nodeId),
    workerId: str(item.workerId) || null,
    status: str(item.status) || 'queued',
    priority: Math.floor(Number(item.priority) || 0),
    enqueuedAt: str(item.enqueuedAt) || null,
    claimedAt: str(item.claimedAt) || null,
    completedAt: str(item.completedAt) || null,
    retryCount: Math.max(0, Math.floor(Number(item.retryCount) || 0)),
    replayProtectionKey: str(item.replayProtectionKey) || null,
    metadata: asObject(item.metadata),
  };
}

/**
 * @param {object} metadataJson
 * @param {object[]} items
 */
export function writeExecutionQueue(metadataJson, items) {
  const meta = asObject(metadataJson);
  return {
    ...meta,
    runtimeExecutionQueue: {
      items: items.map(normalizeQueueItem),
      updatedAt: new Date().toISOString(),
    },
  };
}

/**
 * @param {object} metadataJson
 * @param {string} queueItemId
 */
export function getQueueItemById(metadataJson, queueItemId) {
  const id = str(queueItemId);
  return readExecutionQueue(metadataJson).items.find((i) => i.queueItemId === id) ?? null;
}

/**
 * @param {object} metadataJson
 * @param {string} nodeId
 * @param {string[]} [activeStatuses]
 */
export function getActiveQueueItemForNode(metadataJson, nodeId, activeStatuses = null) {
  const id = str(nodeId);
  const active = activeStatuses ?? ['queued', 'claimed', 'running', 'retry_scheduled'];
  return readExecutionQueue(metadataJson).items.find(
    (i) => i.nodeId === id && active.includes(i.status),
  ) ?? null;
}

export default {
  readExecutionQueue,
  writeExecutionQueue,
  getQueueItemById,
  getActiveQueueItemForNode,
};
