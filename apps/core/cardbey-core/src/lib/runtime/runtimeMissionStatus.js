/**
 * Shared orchestration / mission status helpers for Runtime Kernel proactive missions.
 */

import { deriveCanonicalRuntimeState } from './canonicalRuntimeState.js';

export const ORCHESTRATION_STATUS = {
  IDLE: 'idle',
  RUNNING: 'running',
  QUEUED: 'queued',
  WAITING_FOR_PREREQUISITE: 'waiting_for_prerequisite',
  WAITING_FOR_DECISION: 'waiting_for_decision',
  BLOCKED: 'blocked',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
  ACTIVE: 'active',
};

export const MISSION_PIPELINE_ACTIVE = new Set([
  'requested',
  'planned',
  'awaiting_confirmation',
  'queued',
  'executing',
  'paused',
  'running',
  'draft',
]);

export const MISSION_PIPELINE_TERMINAL = new Set(['completed', 'done', 'failed', 'cancelled']);

function str(v) {
  return typeof v === 'string' ? v.trim() : '';
}

/**
 * Derive orchestration-facing status from pipeline row + metadata orchestrationState.
 * @param {{ status?: string|null; runState?: string|null; metadataJson?: unknown }} row
 */
export function resolveMissionOrchestrationStatus(row) {
  const meta =
    row?.metadataJson && typeof row.metadataJson === 'object' && !Array.isArray(row.metadataJson)
      ? row.metadataJson
      : {};
  const orch =
    meta.orchestrationState && typeof meta.orchestrationState === 'object'
      ? meta.orchestrationState
      : {};
  const orchStatus = str(orch.status).toLowerCase();
  if (orchStatus && Object.values(ORCHESTRATION_STATUS).includes(orchStatus)) {
    return orchStatus;
  }

  const prereq = meta.runtimePrerequisites;
  if (prereq && typeof prereq === 'object' && str(prereq.status) === 'waiting') {
    return ORCHESTRATION_STATUS.WAITING_FOR_PREREQUISITE;
  }

  const pipelineStatus = str(row?.status).toLowerCase();
  if (pipelineStatus === 'awaiting_confirmation' || pipelineStatus === 'paused') {
    return ORCHESTRATION_STATUS.WAITING_FOR_DECISION;
  }
  if (MISSION_PIPELINE_TERMINAL.has(pipelineStatus)) {
    if (pipelineStatus === 'failed') return ORCHESTRATION_STATUS.FAILED;
    if (pipelineStatus === 'cancelled') return ORCHESTRATION_STATUS.CANCELLED;
    return ORCHESTRATION_STATUS.COMPLETED;
  }
  if (pipelineStatus === 'queued' || pipelineStatus === 'requested' || pipelineStatus === 'planned') {
    return ORCHESTRATION_STATUS.QUEUED;
  }
  if (pipelineStatus === 'executing' || pipelineStatus === 'running') {
    return ORCHESTRATION_STATUS.RUNNING;
  }
  return ORCHESTRATION_STATUS.ACTIVE;
}

export function resolveCanonicalMissionRuntimeState(row) {
  const meta =
    row?.metadataJson && typeof row.metadataJson === 'object' && !Array.isArray(row.metadataJson)
      ? row.metadataJson
      : {};
  return deriveCanonicalRuntimeState({
    status: row?.status ?? null,
    missionStatus: row?.status ?? null,
    runtimeState: meta.runtimeState ?? meta.executionState ?? null,
    action: meta.action ?? null,
    multiAgentStatus: meta.multiAgentStatus ?? null,
  });
}

export function isOrchestrationBlockedStatus(status) {
  const s = str(status).toLowerCase();
  return (
    s === ORCHESTRATION_STATUS.BLOCKED ||
    s === ORCHESTRATION_STATUS.WAITING_FOR_PREREQUISITE ||
    s === ORCHESTRATION_STATUS.WAITING_FOR_DECISION
  );
}

export function isOrchestrationTerminalStatus(status) {
  const s = str(status).toLowerCase();
  return (
    s === ORCHESTRATION_STATUS.COMPLETED ||
    s === ORCHESTRATION_STATUS.FAILED ||
    s === ORCHESTRATION_STATUS.CANCELLED
  );
}
