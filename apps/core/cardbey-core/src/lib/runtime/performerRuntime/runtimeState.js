/**
 * Performer Runtime — authoritative in-memory state + optional Mission.context persist.
 */

import { getPrismaClient } from '../../prisma.js';
import { mergeMissionContext } from '../../mission.js';
import {
  createPerformerRuntimeContext,
  patchRuntimeContext,
  runtimeContextSnapshot,
} from './runtimeContext.js';
import { isPerformerRuntimeStatePersistEnabled } from './runtimeFlags.js';
import { isPerformerMissionPipelineWriteIsolationEnabled } from '../../broker/brokerFlags.js';
import { queueRuntimeSnapshotPersist } from '../../mission/missionWriteQueue.js';

/** @type {Map<string, import('./runtimeContext.js').PerformerRuntimeContext>} */
const byRuntimeId = new Map();

/** @type {Map<string, string>} missionId → runtimeId */
const missionToRuntime = new Map();

/**
 * @param {import('./runtimeContext.js').PerformerRuntimeContext} ctx
 * @returns {import('./runtimeContext.js').PerformerRuntimeContext}
 */
export function registerRuntimeContext(ctx) {
  byRuntimeId.set(ctx.runtimeId, ctx);
  if (ctx.missionId) {
    missionToRuntime.set(ctx.missionId, ctx.runtimeId);
  }
  return ctx;
}

/**
 * @param {string} runtimeId
 * @returns {import('./runtimeContext.js').PerformerRuntimeContext|undefined}
 */
export function getRuntimeById(runtimeId) {
  const id = typeof runtimeId === 'string' ? runtimeId.trim() : '';
  return id ? byRuntimeId.get(id) : undefined;
}

/**
 * @param {string} missionId
 * @returns {import('./runtimeContext.js').PerformerRuntimeContext|undefined}
 */
export function getRuntimeByMissionId(missionId) {
  const mid = typeof missionId === 'string' ? missionId.trim() : '';
  if (!mid) return undefined;
  const rid = missionToRuntime.get(mid);
  return rid ? byRuntimeId.get(rid) : undefined;
}

/**
 * Get or create runtime for a mission-scoped execution.
 *
 * @param {{ missionId?: string|null, runtimeId?: string|null, userId?: string|null, storeId?: string|null, tenantId?: string|null, intentId?: string|null }} seed
 */
export function resolveRuntimeContext(seed = {}) {
  if (seed.runtimeId) {
    const existing = getRuntimeById(seed.runtimeId);
    if (existing) return existing;
  }
  if (seed.missionId) {
    const existing = getRuntimeByMissionId(seed.missionId);
    if (existing) return existing;
  }
  const ctx = createPerformerRuntimeContext(seed);
  return registerRuntimeContext(ctx);
}

/**
 * @param {string} runtimeId
 * @param {Partial<import('./runtimeContext.js').PerformerRuntimeContext>} patch
 */
export function updateRuntimeState(runtimeId, patch) {
  const existing = getRuntimeById(runtimeId);
  if (!existing) return null;
  const next = patchRuntimeContext(existing, patch);
  registerRuntimeContext(next);
  if (isPerformerRuntimeStatePersistEnabled() && next.missionId) {
    void persistRuntimeSnapshot(next).catch(() => {});
  }
  return next;
}

/**
 * @param {import('./runtimeContext.js').PerformerRuntimeContext} ctx
 */
async function persistRuntimeSnapshot(ctx) {
  const mid = ctx.missionId;
  if (!mid) return;
  const prisma = getPrismaClient();
  if (!prisma?.mission) return;
  const snapshot = runtimeContextSnapshot(ctx);
  const run = () => mergeMissionContext(mid, { performerRuntime: snapshot }, { prisma });

  if (isPerformerMissionPipelineWriteIsolationEnabled()) {
    queueRuntimeSnapshotPersist(mid, run, { label: 'runtimeSnapshot.persist' });
    return;
  }
  await run();
}

/** Clear caches (tests). */
export function resetRuntimeStateStore() {
  byRuntimeId.clear();
  missionToRuntime.clear();
}
