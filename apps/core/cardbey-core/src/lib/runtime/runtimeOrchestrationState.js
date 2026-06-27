/**
 * Durable orchestration state on MissionPipeline.metadataJson.
 */

import { randomUUID } from 'node:crypto';
import { ORCHESTRATION_STATUS } from './runtimeMissionStatus.js';

function asObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}

/**
 * @param {unknown} metadataJson
 */
export function readOrchestrationState(metadataJson) {
  const meta = asObject(metadataJson);
  const orch = asObject(meta.orchestrationState);
  return {
    status: typeof orch.status === 'string' ? orch.status : ORCHESTRATION_STATUS.IDLE,
    activeStepNumber:
      typeof orch.activeStepNumber === 'number' && Number.isFinite(orch.activeStepNumber)
        ? Math.floor(orch.activeStepNumber)
        : null,
    lastBlockedReason: typeof orch.lastBlockedReason === 'string' ? orch.lastBlockedReason : null,
    lastOrchestratorRunId:
      typeof orch.lastOrchestratorRunId === 'string' ? orch.lastOrchestratorRunId : null,
    updatedAt: typeof orch.updatedAt === 'string' ? orch.updatedAt : null,
  };
}

/**
 * @param {object} metadataJson
 * @param {object} patch
 */
export function mergeOrchestrationState(metadataJson, patch) {
  const meta = asObject(metadataJson);
  const prev = readOrchestrationState(meta);
  const next = {
    ...prev,
    ...(patch && typeof patch === 'object' ? patch : {}),
    updatedAt: new Date().toISOString(),
  };
  if (!next.lastOrchestratorRunId) {
    next.lastOrchestratorRunId = randomUUID();
  }
  return { ...meta, orchestrationState: next };
}

/**
 * @param {unknown} metadataJson
 * @returns {Array<{ step: number; title?: string; description?: string; recommendedTool?: string; parameters?: object }>}
 */
export function readProactivePlanSteps(metadataJson) {
  const meta = asObject(metadataJson);
  const proactivePlanPayload = asObject(meta.proactivePlan);
  if (Array.isArray(proactivePlanPayload.plan) && proactivePlanPayload.plan.length > 0) {
    return normalizePlanSteps(proactivePlanPayload.plan);
  }
  if (Array.isArray(meta.proactivePlanSteps) && meta.proactivePlanSteps.length > 0) {
    return normalizePlanSteps(meta.proactivePlanSteps);
  }
  return [];
}

/**
 * @param {unknown[]} raw
 */
export function normalizePlanSteps(raw) {
  const out = [];
  for (let i = 0; i < raw.length; i++) {
    const row = raw[i];
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
    const step = Math.floor(Number(row.step ?? i + 1));
    if (!Number.isFinite(step) || step < 1) continue;
    out.push({
      step,
      title: typeof row.title === 'string' ? row.title : `Step ${step}`,
      description: typeof row.description === 'string' ? row.description : '',
      recommendedTool:
        typeof row.recommendedTool === 'string' ? row.recommendedTool.trim().toLowerCase() : undefined,
      ...(typeof row.executionMode === 'string'
        ? { executionMode: row.executionMode.trim().toLowerCase() }
        : {}),
      ...(row.parameters && typeof row.parameters === 'object' && !Array.isArray(row.parameters)
        ? { parameters: row.parameters }
        : {}),
    });
  }
  return out.sort((a, b) => a.step - b.step);
}

/**
 * Persist plan steps when missing from metadata.
 * @param {object} metadataJson
 * @param {unknown[]} planSteps
 */
export function ensureProactivePlanInMetadata(metadataJson, planSteps) {
  const meta = asObject(metadataJson);
  const existing = readProactivePlanSteps(meta);
  if (existing.length > 0) return meta;
  const normalized = normalizePlanSteps(planSteps);
  if (normalized.length === 0) return meta;
  return {
    ...meta,
    proactivePlanSteps: normalized,
    proactivePlan: {
      version: 1,
      plan: normalized,
      persistedAt: new Date().toISOString(),
    },
  };
}

/**
 * Persist proactive plan steps and plan-level parameters on mission metadata.
 * @param {object} metadataJson
 * @param {{ planSteps?: unknown[]; planParameters?: Record<string, unknown> }} bundle
 */
export function mergeProactivePlanBundleIntoMetadata(metadataJson, bundle = {}) {
  let meta = asObject(metadataJson);
  if (Array.isArray(bundle.planSteps) && bundle.planSteps.length > 0) {
    const normalized = normalizePlanSteps(bundle.planSteps);
    if (normalized.length > 0) {
      meta = {
        ...meta,
        proactivePlanSteps: normalized,
        proactivePlan: {
          version: 1,
          plan: normalized,
          persistedAt: new Date().toISOString(),
        },
      };
    }
  }
  const params =
    bundle.planParameters && typeof bundle.planParameters === 'object' && !Array.isArray(bundle.planParameters)
      ? bundle.planParameters
      : null;
  if (params && Object.keys(params).length > 0) {
    const prev =
      meta.planParameters && typeof meta.planParameters === 'object' && !Array.isArray(meta.planParameters)
        ? meta.planParameters
        : {};
    meta = { ...meta, planParameters: { ...prev, ...params } };
  }
  return meta;
}
