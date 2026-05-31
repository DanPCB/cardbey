/**
 * Runtime node replay protection (Phase E).
 * Prevents duplicate execution after completion/restart/race.
 */

import { createHash } from 'node:crypto';
import { getRuntimeCapabilities } from '../runtimeCapabilitiesService.js';
import { NODE_STATUS, EXECUTION_MODE } from '../runtimeGraphTypes.js';

function buildExecutionHash(node) {
  const payload = JSON.stringify({
    nodeId: node.nodeId,
    tool: node.assignedTool,
    step: node.metadata?.stepNumber,
    agent: node.assignedAgent,
  });
  return createHash('sha256').update(payload).digest('hex').slice(0, 16);
}

function asObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}

function str(v) {
  return typeof v === 'string' ? v.trim() : '';
}

export const REPLAY_STATE = {
  PROTECTED: 'replay_protected',
  RETRY_ALLOWED: 'retry_allowed',
};

export function isRuntimeReplayProtectionEnabled() {
  return getRuntimeCapabilities().runtimeReplayProtection === true;
}

/**
 * @param {unknown} metadataJson
 */
export function readReplayProtectionRecords(metadataJson) {
  const store = asObject(asObject(metadataJson).runtimeReplayProtection);
  return Array.isArray(store.records) ? store.records : [];
}

function writeReplayProtectionRecords(metadataJson, records) {
  const meta = asObject(metadataJson);
  return {
    ...meta,
    runtimeReplayProtection: {
      records,
      updatedAt: new Date().toISOString(),
    },
  };
}

export function buildReplayProtectionKey(missionId, graph, node) {
  return `${str(missionId)}:${str(graph?.graphId)}:${str(node?.nodeId)}`;
}

export function buildReplayRecord(missionId, graph, node, queueItem = null) {
  const replayKey = buildReplayProtectionKey(missionId, graph, node);
  const executionHash = buildExecutionHash(node);
  return {
    replayKey,
    missionId: str(missionId),
    graphId: str(graph?.graphId),
    nodeId: str(node?.nodeId),
    executionHash,
    completedAt: new Date().toISOString(),
    queueItemId: queueItem?.queueItemId ?? null,
    state: REPLAY_STATE.PROTECTED,
  };
}

/**
 * @param {object} metadataJson
 * @param {string} missionId
 * @param {object} graph
 * @param {object} node
 * @param {boolean} [forceRetry]
 */
export function isReplayBlocked(metadataJson, missionId, graph, node, forceRetry = false) {
  if (!isRuntimeReplayProtectionEnabled()) return false;
  if (forceRetry) return false;

  if (node.status === NODE_STATUS.COMPLETED) {
    const retryable =
      node.executionMode === EXECUTION_MODE.RETRYABLE ||
      node.metadata?.retryable === true;
    if (!retryable) return true;
  }

  const replayKey = buildReplayProtectionKey(missionId, graph, node);
  const executionHash = buildExecutionHash(node);
  const record = readReplayProtectionRecords(metadataJson).find((r) => r.replayKey === replayKey);

  if (!record) return false;
  if (record.executionHash !== executionHash) return false;
  if (record.state === REPLAY_STATE.RETRY_ALLOWED) return false;
  return true;
}

/**
 * @param {object} metadataJson
 * @param {string} missionId
 * @param {object} graph
 * @param {object} node
 * @param {object} [queueItem]
 */
export function recordReplayCompletion(metadataJson, missionId, graph, node, queueItem = null) {
  if (!isRuntimeReplayProtectionEnabled()) return metadataJson;

  const record = buildReplayRecord(missionId, graph, node, queueItem);
  const records = readReplayProtectionRecords(metadataJson).filter((r) => r.replayKey !== record.replayKey);
  records.push(record);
  return writeReplayProtectionRecords(metadataJson, records);
}

/**
 * Allow retry by marking replay record as retry_allowed.
 */
export function allowReplayRetry(metadataJson, missionId, graph, node) {
  const replayKey = buildReplayProtectionKey(missionId, graph, node);
  const records = readReplayProtectionRecords(metadataJson).map((r) =>
    r.replayKey === replayKey ? { ...r, state: REPLAY_STATE.RETRY_ALLOWED } : r,
  );
  return writeReplayProtectionRecords(metadataJson, records);
}

/**
 * Check if artifact already attached to node (dedupe).
 * @param {object} graph
 * @param {string} nodeId
 * @param {string} artifactRef
 */
export function isArtifactDuplicate(graph, nodeId, artifactRef) {
  const id = str(nodeId);
  const ref = str(artifactRef);
  if (!id || !ref) return false;
  return (graph.artifactLineage ?? []).some((r) => r.nodeId === id && r.artifactRef === ref);
}

export default {
  REPLAY_STATE,
  isRuntimeReplayProtectionEnabled,
  readReplayProtectionRecords,
  buildReplayProtectionKey,
  buildReplayRecord,
  isReplayBlocked,
  recordReplayCompletion,
  allowReplayRetry,
  isArtifactDuplicate,
};
