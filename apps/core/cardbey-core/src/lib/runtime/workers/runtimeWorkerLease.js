/**
 * Runtime execution leases — authority lock for graph node execution (Phase D).
 * Persisted in metadataJson.runtimeWorkerState.leases
 */

import { randomUUID } from 'node:crypto';
import { getRuntimeCapabilities } from '../runtimeCapabilitiesService.js';

export const LEASE_STATUS = {
  ACTIVE: 'active',
  RELEASED: 'released',
  EXPIRED: 'expired',
};

const DEFAULT_LEASE_TTL_MS = 300_000;

function asObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}

function str(v) {
  return typeof v === 'string' ? v.trim() : '';
}

export function isRuntimeExecutionLeasesEnabled() {
  return getRuntimeCapabilities().runtimeExecutionLeases === true;
}

/**
 * @param {unknown} metadataJson
 */
export function readExecutionLeases(metadataJson) {
  const state = asObject(asObject(metadataJson).runtimeWorkerState);
  return Array.isArray(state.leases) ? state.leases : [];
}

/**
 * @param {object} metadataJson
 * @param {object[]} leases
 */
export function writeExecutionLeases(metadataJson, leases) {
  const meta = asObject(metadataJson);
  const state = asObject(meta.runtimeWorkerState);
  return {
    ...meta,
    runtimeWorkerState: {
      ...state,
      leases,
      updatedAt: new Date().toISOString(),
    },
  };
}

/**
 * @param {object} metadataJson
 * @param {string} nodeId
 */
export function getActiveLeaseForNode(metadataJson, nodeId) {
  const id = str(nodeId);
  const now = Date.now();
  return (
    readExecutionLeases(metadataJson).find((lease) => {
      if (lease.nodeId !== id) return false;
      if (lease.status !== LEASE_STATUS.ACTIVE) return false;
      const expiresAt = Date.parse(lease.expiresAt ?? '');
      if (Number.isFinite(expiresAt) && expiresAt < now) return false;
      return true;
    }) ?? null
  );
}

/**
 * @param {object} metadataJson
 * @param {{ nodeId: string; ownerId: string; ttlMs?: number; workerId?: string }} input
 */
export function acquireExecutionLease(metadataJson, input) {
  const nodeId = str(input.nodeId);
  const ownerId = str(input.ownerId);
  if (!nodeId || !ownerId) {
    return { ok: false, code: 'INVALID_LEASE_REQUEST', metadata: metadataJson, lease: null };
  }

  if (isRuntimeExecutionLeasesEnabled()) {
    const existing = getActiveLeaseForNode(metadataJson, nodeId);
    if (existing && existing.ownerId !== ownerId) {
      return {
        ok: false,
        code: 'LEASE_HELD',
        metadata: metadataJson,
        lease: existing,
        message: `Node ${nodeId} lease held by ${existing.ownerId}`,
      };
    }
    if (existing && existing.ownerId === ownerId) {
      return { ok: true, code: 'LEASE_REUSED', metadata: metadataJson, lease: existing, reused: true };
    }
  }

  const now = new Date();
  const ttlMs = Math.max(30_000, Math.floor(Number(input.ttlMs) || DEFAULT_LEASE_TTL_MS));
  const lease = {
    leaseId: randomUUID(),
    nodeId,
    ownerId,
    workerId: str(input.workerId) || null,
    acquiredAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
    status: LEASE_STATUS.ACTIVE,
  };

  const leases = [...readExecutionLeases(metadataJson), lease];
  const metadata = writeExecutionLeases(metadataJson, leases);
  return { ok: true, code: 'LEASE_ACQUIRED', metadata, lease, reused: false };
}

/**
 * @param {object} metadataJson
 * @param {string} leaseId
 */
export function releaseExecutionLease(metadataJson, leaseId) {
  const id = str(leaseId);
  if (!id) return metadataJson;

  const leases = readExecutionLeases(metadataJson).map((lease) => {
    if (lease.leaseId !== id) return lease;
    return { ...lease, status: LEASE_STATUS.RELEASED, releasedAt: new Date().toISOString() };
  });
  return writeExecutionLeases(metadataJson, leases);
}

/**
 * Expire stale active leases (best-effort housekeeping).
 * @param {object} metadataJson
 */
export function expireStaleLeases(metadataJson) {
  const now = Date.now();
  let changed = false;
  const leases = readExecutionLeases(metadataJson).map((lease) => {
    if (lease.status !== LEASE_STATUS.ACTIVE) return lease;
    const expiresAt = Date.parse(lease.expiresAt ?? '');
    if (Number.isFinite(expiresAt) && expiresAt < now) {
      changed = true;
      return { ...lease, status: LEASE_STATUS.EXPIRED, expiredAt: new Date().toISOString() };
    }
    return lease;
  });
  return changed ? writeExecutionLeases(metadataJson, leases) : metadataJson;
}

export default {
  LEASE_STATUS,
  isRuntimeExecutionLeasesEnabled,
  readExecutionLeases,
  writeExecutionLeases,
  getActiveLeaseForNode,
  acquireExecutionLease,
  releaseExecutionLease,
  expireStaleLeases,
};
