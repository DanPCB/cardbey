/**
 * Performer Runtime — normalized execution context (Phase 1.5-B).
 */

import { randomUUID } from 'node:crypto';

/**
 * @typedef {'idle'|'running'|'blocked'|'completed'|'failed'|'cancelled'} RuntimeStateStatus
 */

/**
 * @typedef {object} PerformerRuntimeContext
 * @property {string} runtimeId
 * @property {string|null} missionId
 * @property {string|null} intentId
 * @property {string|null} storeId
 * @property {string|null} tenantId
 * @property {string|null} userId
 * @property {string|null} intent
 * @property {object|null} actionGraph
 * @property {object[]} executionNodes
 * @property {object[]} telemetry
 * @property {object[]} artifacts
 * @property {object[]} approvals
 * @property {object[]} retries
 * @property {object[]} executionHistory
 * @property {RuntimeStateStatus} runtimeState
 * @property {string} createdAt
 * @property {string} updatedAt
 * @property {boolean} runtimeOwned
 */

/**
 * @param {Partial<PerformerRuntimeContext> & { missionId?: string|null }} [seed]
 * @returns {PerformerRuntimeContext}
 */
export function createPerformerRuntimeContext(seed = {}) {
  const now = new Date().toISOString();
  const missionId =
    seed.missionId != null && String(seed.missionId).trim()
      ? String(seed.missionId).trim()
      : null;

  return {
    runtimeId:
      typeof seed.runtimeId === 'string' && seed.runtimeId.trim()
        ? seed.runtimeId.trim()
        : randomUUID(),
    missionId,
    intentId: seed.intentId ?? null,
    storeId: seed.storeId ?? null,
    tenantId: seed.tenantId ?? null,
    userId: seed.userId ?? null,
    intent: seed.intent ?? null,
    actionGraph: seed.actionGraph ?? { version: 'runtime_v1', nodes: [], edges: [] },
    executionNodes: Array.isArray(seed.executionNodes) ? [...seed.executionNodes] : [],
    telemetry: Array.isArray(seed.telemetry) ? [...seed.telemetry] : [],
    artifacts: Array.isArray(seed.artifacts) ? [...seed.artifacts] : [],
    approvals: Array.isArray(seed.approvals) ? [...seed.approvals] : [],
    retries: Array.isArray(seed.retries) ? [...seed.retries] : [],
    executionHistory: Array.isArray(seed.executionHistory) ? [...seed.executionHistory] : [],
    runtimeState: seed.runtimeState ?? 'idle',
    createdAt: seed.createdAt ?? now,
    updatedAt: now,
    runtimeOwned: seed.runtimeOwned !== false,
  };
}

/**
 * @param {PerformerRuntimeContext} ctx
 * @param {Partial<PerformerRuntimeContext>} patch
 * @returns {PerformerRuntimeContext}
 */
export function patchRuntimeContext(ctx, patch) {
  return {
    ...ctx,
    ...patch,
    actionGraph: patch.actionGraph ?? ctx.actionGraph,
    executionNodes: patch.executionNodes ?? ctx.executionNodes,
    telemetry: patch.telemetry ?? ctx.telemetry,
    artifacts: patch.artifacts ?? ctx.artifacts,
    approvals: patch.approvals ?? ctx.approvals,
    retries: patch.retries ?? ctx.retries,
    executionHistory: patch.executionHistory ?? ctx.executionHistory,
    updatedAt: new Date().toISOString(),
    runtimeOwned: true,
  };
}

/**
 * @param {object} request
 * @returns {PerformerRuntimeContext}
 */
export function runtimeContextFromRequest(request) {
  const r = request && typeof request === 'object' ? request : {};
  const payload = r.payload && typeof r.payload === 'object' ? r.payload : {};
  const innerCtx =
    payload.context && typeof payload.context === 'object' ? payload.context : {};

  return createPerformerRuntimeContext({
    runtimeId: r.runtimeId ?? innerCtx.runtimeId ?? null,
    missionId: r.missionId ?? innerCtx.missionId ?? innerCtx.activeMissionId ?? null,
    intentId: r.intentId ?? innerCtx.intentId ?? null,
    storeId: r.storeId ?? innerCtx.storeId ?? null,
    tenantId: r.tenantId ?? r.tenantKey ?? innerCtx.tenantId ?? null,
    userId: r.userId ?? innerCtx.userId ?? innerCtx.createdBy ?? null,
    intent: r.intent ?? innerCtx.intent ?? null,
  });
}

/**
 * Snapshot for persistence (strip volatile arrays if needed).
 *
 * @param {PerformerRuntimeContext} ctx
 */
export function runtimeContextSnapshot(ctx) {
  return {
    runtimeId: ctx.runtimeId,
    missionId: ctx.missionId,
    intentId: ctx.intentId,
    storeId: ctx.storeId,
    runtimeState: ctx.runtimeState,
    actionGraph: ctx.actionGraph,
    executionNodeCount: ctx.executionNodes.length,
    telemetryCount: ctx.telemetry.length,
    artifactCount: ctx.artifacts.length,
    approvalCount: ctx.approvals.length,
    lastExecution: ctx.executionHistory[ctx.executionHistory.length - 1] ?? null,
    updatedAt: ctx.updatedAt,
  };
}
