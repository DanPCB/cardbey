/**
 * Runtime Worker Manager — worker lifecycle persistence (Phase D).
 * Workers report status; they do not mutate graph state directly.
 */

import { randomUUID } from 'node:crypto';
import { getRuntimeCapabilities } from '../runtimeCapabilitiesService.js';

export const WORKER_STATUS = {
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
};

function asObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}

function str(v) {
  return typeof v === 'string' ? v.trim() : '';
}

export function isRuntimeWorkerManagerEnabled() {
  return getRuntimeCapabilities().runtimeWorkerManager === true;
}

/**
 * @param {unknown} metadataJson
 */
export function readRuntimeWorkerState(metadataJson) {
  const state = asObject(asObject(metadataJson).runtimeWorkerState);
  return {
    workers: Array.isArray(state.workers) ? state.workers : [],
    leases: Array.isArray(state.leases) ? state.leases : [],
    updatedAt: str(state.updatedAt) || null,
  };
}

/**
 * @param {object} metadataJson
 * @param {object} statePatch
 */
export function writeRuntimeWorkerState(metadataJson, statePatch) {
  const meta = asObject(metadataJson);
  const prev = readRuntimeWorkerState(meta);
  return {
    ...meta,
    runtimeWorkerState: {
      ...prev,
      ...(statePatch && typeof statePatch === 'object' ? statePatch : {}),
      updatedAt: new Date().toISOString(),
    },
  };
}

/**
 * @param {object} metadataJson
 * @param {string} workerId
 */
export function getWorkerById(metadataJson, workerId) {
  const id = str(workerId);
  return readRuntimeWorkerState(metadataJson).workers.find((w) => w.workerId === id) ?? null;
}

/**
 * @param {object} metadataJson
 * @param {string} nodeId
 */
export function getActiveWorkerForNode(metadataJson, nodeId) {
  const id = str(nodeId);
  return (
    readRuntimeWorkerState(metadataJson).workers.find(
      (w) => w.nodeId === id && w.status === WORKER_STATUS.RUNNING,
    ) ?? null
  );
}

/**
 * @param {object} metadataJson
 * @param {{
 *   graphId: string;
 *   nodeId: string;
 *   assignedSkill: object;
 *   executionLease?: object|null;
 *   metadata?: object;
 * }} input
 */
export function createWorker(metadataJson, input) {
  const graphId = str(input.graphId);
  const nodeId = str(input.nodeId);
  const skill = input.assignedSkill ?? {};
  const now = new Date().toISOString();

  const worker = {
    workerId: randomUUID(),
    graphId,
    nodeId,
    assignedSkill: {
      skillId: skill.skillId ?? null,
      skillType: skill.skillType ?? null,
      label: skill.label ?? null,
    },
    executionLease: input.executionLease ?? null,
    status: WORKER_STATUS.PENDING,
    startedAt: null,
    heartbeatAt: null,
    completedAt: null,
    metadata: input.metadata && typeof input.metadata === 'object' ? input.metadata : {},
    createdAt: now,
  };

  const state = readRuntimeWorkerState(metadataJson);
  const metadata = writeRuntimeWorkerState(metadataJson, {
    workers: [...state.workers, worker],
  });

  return { worker, metadata };
}

/**
 * @param {object} metadataJson
 * @param {string} workerId
 * @param {object} [patch]
 */
export function updateWorker(metadataJson, workerId, patch = {}) {
  const id = str(workerId);
  const state = readRuntimeWorkerState(metadataJson);
  const workers = state.workers.map((w) => {
    if (w.workerId !== id) return w;
    return {
      ...w,
      ...patch,
      metadata: patch.metadata ? { ...asObject(w.metadata), ...patch.metadata } : w.metadata,
    };
  });
  return writeRuntimeWorkerState(metadataJson, { workers });
}

/**
 * @param {object} metadataJson
 * @param {string} workerId
 */
export function markWorkerRunning(metadataJson, workerId) {
  const now = new Date().toISOString();
  return updateWorker(metadataJson, workerId, {
    status: WORKER_STATUS.RUNNING,
    startedAt: now,
    heartbeatAt: now,
  });
}

/**
 * @param {object} metadataJson
 * @param {string} workerId
 */
export function touchWorkerHeartbeat(metadataJson, workerId) {
  return updateWorker(metadataJson, workerId, {
    heartbeatAt: new Date().toISOString(),
  });
}

/**
 * @param {object} metadataJson
 * @param {string} workerId
 * @param {object} [extra]
 */
export function markWorkerCompleted(metadataJson, workerId, extra = {}) {
  return updateWorker(metadataJson, workerId, {
    status: WORKER_STATUS.COMPLETED,
    completedAt: new Date().toISOString(),
    metadata: extra,
  });
}

/**
 * @param {object} metadataJson
 * @param {string} workerId
 * @param {string} [reason]
 * @param {object} [extra]
 */
export function markWorkerFailed(metadataJson, workerId, reason = null, extra = {}) {
  return updateWorker(metadataJson, workerId, {
    status: WORKER_STATUS.FAILED,
    completedAt: new Date().toISOString(),
    metadata: { ...extra, failureReason: reason },
  });
}

export default {
  WORKER_STATUS,
  isRuntimeWorkerManagerEnabled,
  readRuntimeWorkerState,
  writeRuntimeWorkerState,
  getWorkerById,
  getActiveWorkerForNode,
  createWorker,
  updateWorker,
  markWorkerRunning,
  touchWorkerHeartbeat,
  markWorkerCompleted,
  markWorkerFailed,
};
