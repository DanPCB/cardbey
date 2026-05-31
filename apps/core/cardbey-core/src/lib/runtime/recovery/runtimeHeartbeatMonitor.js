/**
 * Runtime heartbeat monitor (Phase E).
 * Detects stale workers and expired leases; marks recovery candidates.
 */

import { getRuntimeCapabilities } from '../runtimeCapabilitiesService.js';
import { readRuntimeWorkerState, WORKER_STATUS } from '../workers/runtimeWorkerManager.js';
import { readExecutionLeases, LEASE_STATUS } from '../workers/runtimeWorkerLease.js';
import { readExecutionQueue } from '../queue/runtimeQueuePersistence.js';

const QUEUE_RUNNING = 'running';

export const RECOVERY_STATE = {
  RECOVERABLE: 'recoverable',
  EXPIRED: 'expired',
  RECLAIMED: 'reclaimed',
  ORPHANED: 'orphaned',
  REPLAY_PROTECTED: 'replay_protected',
};

const DEFAULT_HEARTBEAT_STALE_MS = 120_000;

function asObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}

function str(v) {
  return typeof v === 'string' ? v.trim() : '';
}

export function isRuntimeHeartbeatMonitorEnabled() {
  return getRuntimeCapabilities().runtimeHeartbeatMonitor === true;
}

function readRecoveryState(metadataJson) {
  const state = asObject(asObject(metadataJson).runtimeRecoveryState);
  return {
    candidates: Array.isArray(state.candidates) ? state.candidates : [],
    updatedAt: str(state.updatedAt) || null,
  };
}

function writeRecoveryState(metadataJson, candidates) {
  const meta = asObject(metadataJson);
  return {
    ...meta,
    runtimeRecoveryState: {
      candidates,
      updatedAt: new Date().toISOString(),
    },
  };
}

/**
 * Scan workers and leases for recovery candidates.
 * @param {object} metadataJson
 * @param {{ heartbeatStaleMs?: number; now?: number }} [opts]
 */
export function scanHeartbeatAndLeases(metadataJson, opts = {}) {
  if (!isRuntimeHeartbeatMonitorEnabled()) {
    return { metadata: metadataJson, candidates: [], staleWorkers: [], expiredLeases: [] };
  }

  const now = opts.now ?? Date.now();
  const staleMs = Math.max(10_000, Math.floor(Number(opts.heartbeatStaleMs) || DEFAULT_HEARTBEAT_STALE_MS));
  const workerState = readRuntimeWorkerState(metadataJson);
  const leases = readExecutionLeases(metadataJson);
  const queueItems = readExecutionQueue(metadataJson).items;

  /** @type {object[]} */
  const staleWorkers = [];
  /** @type {object[]} */
  const expiredLeases = [];

  for (const worker of workerState.workers) {
    if (worker.status !== WORKER_STATUS.RUNNING) continue;
    const heartbeatAt = Date.parse(worker.heartbeatAt ?? worker.startedAt ?? '');
    if (Number.isFinite(heartbeatAt) && now - heartbeatAt > staleMs) {
      staleWorkers.push(worker);
    }
  }

  for (const lease of leases) {
    if (lease.status !== LEASE_STATUS.ACTIVE) continue;
    const expiresAt = Date.parse(lease.expiresAt ?? '');
    if (Number.isFinite(expiresAt) && expiresAt < now) {
      expiredLeases.push(lease);
    }
  }

  /** @type {object[]} */
  const candidates = [];

  for (const worker of staleWorkers) {
    const queueItem = queueItems.find(
      (i) => i.workerId === worker.workerId && i.status === QUEUE_RUNNING,
    );
    candidates.push({
      type: 'stale_worker',
      recoveryState: RECOVERY_STATE.RECOVERABLE,
      workerId: worker.workerId,
      nodeId: worker.nodeId,
      graphId: worker.graphId,
      queueItemId: queueItem?.queueItemId ?? null,
      detectedAt: new Date(now).toISOString(),
      heartbeatAt: worker.heartbeatAt,
    });
  }

  for (const lease of expiredLeases) {
    if (candidates.some((c) => c.nodeId === lease.nodeId)) continue;
    candidates.push({
      type: 'expired_lease',
      recoveryState: RECOVERY_STATE.EXPIRED,
      leaseId: lease.leaseId,
      nodeId: lease.nodeId,
      ownerWorkerId: lease.workerId,
      detectedAt: new Date(now).toISOString(),
      expiresAt: lease.expiresAt,
    });
  }

  const metadata = writeRecoveryState(metadataJson, candidates);
  return { metadata, candidates, staleWorkers, expiredLeases };
}

export function getRecoveryCandidates(metadataJson) {
  return readRecoveryState(metadataJson).candidates;
}

export default {
  RECOVERY_STATE,
  isRuntimeHeartbeatMonitorEnabled,
  scanHeartbeatAndLeases,
  getRecoveryCandidates,
};
