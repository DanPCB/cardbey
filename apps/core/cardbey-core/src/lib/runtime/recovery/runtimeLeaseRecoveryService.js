/**
 * Runtime lease recovery service (Phase E).
 * Reclaims expired leases and prepares nodes for safe requeue.
 */

import { getRuntimeCapabilities } from '../runtimeCapabilitiesService.js';
import {
  readExecutionLeases,
  writeExecutionLeases,
  LEASE_STATUS,
  releaseExecutionLease,
} from '../workers/runtimeWorkerLease.js';
import { RECOVERY_STATE } from './runtimeHeartbeatMonitor.js';
import { emitLeaseExpired, emitLeaseReclaimed } from './runtimeRecoveryBlackboardBridge.js';

function asObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}

function str(v) {
  return typeof v === 'string' ? v.trim() : '';
}

export function isRuntimeLeaseRecoveryEnabled() {
  return getRuntimeCapabilities().runtimeLeaseRecovery === true;
}

function readLeaseRecoveryLog(metadataJson) {
  const log = asObject(asObject(metadataJson).runtimeLeaseRecovery);
  return Array.isArray(log.records) ? log.records : [];
}

function appendLeaseRecoveryRecord(metadataJson, record) {
  const meta = asObject(metadataJson);
  const records = [...readLeaseRecoveryLog(meta), record];
  return {
    ...meta,
    runtimeLeaseRecovery: { records, updatedAt: new Date().toISOString() },
  };
}

/**
 * Reclaim expired leases and mark recovery metadata.
 * @param {object} metadataJson
 * @param {string} missionId
 * @param {{ traceId?: string; reclaimedBy?: string; now?: number }} [ctx]
 */
export async function recoverExpiredLeases(metadataJson, missionId, ctx = {}) {
  if (!isRuntimeLeaseRecoveryEnabled()) {
    return { metadata: metadataJson, reclaimed: [] };
  }

  const now = ctx.now ?? Date.now();
  const reclaimedBy = str(ctx.reclaimedBy) || 'runtime_recovery';
  let metadata = metadataJson;
  /** @type {object[]} */
  const reclaimed = [];

  const leases = readExecutionLeases(metadata);
  for (const lease of leases) {
    if (lease.status !== LEASE_STATUS.ACTIVE) continue;
    const expiresAt = Date.parse(lease.expiresAt ?? '');
    if (!Number.isFinite(expiresAt) || expiresAt >= now) continue;

    await emitLeaseExpired(missionId, lease, ctx.traceId);

    const recoveryEligibleAt = new Date(now).toISOString();
    const updatedLeases = readExecutionLeases(metadata).map((l) => {
      if (l.leaseId !== lease.leaseId) return l;
      return {
        ...l,
        status: LEASE_STATUS.EXPIRED,
        expiredAt: recoveryEligibleAt,
        recoveryEligibleAt,
        recoveryState: RECOVERY_STATE.RECOVERABLE,
      };
    });
    metadata = writeExecutionLeases(metadata, updatedLeases);

    const recoveryRecord = {
      leaseId: lease.leaseId,
      nodeId: lease.nodeId,
      ownerWorkerId: lease.workerId,
      expiresAt: lease.expiresAt,
      recoveryEligibleAt,
      reclaimedBy,
      recoveryState: RECOVERY_STATE.RECLAIMED,
      reclaimedAt: recoveryEligibleAt,
    };
    metadata = appendLeaseRecoveryRecord(metadata, recoveryRecord);
    reclaimed.push(recoveryRecord);

    await emitLeaseReclaimed(missionId, recoveryRecord, ctx.traceId);
  }

  return { metadata, reclaimed };
}

export default {
  isRuntimeLeaseRecoveryEnabled,
  recoverExpiredLeases,
};
