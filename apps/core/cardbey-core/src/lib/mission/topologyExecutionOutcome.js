/**
 * Canonical topology execution outcome — thin adapter over universal mission execution contract.
 *
 * Pipeline: Topology → buildMissionExecutionOutcome → reconcile → validate → pipeline status
 */

import { resolveMissionArtifactAuthority } from './artifactAuthority.js';
import { buildMissionExecutionOutcome } from './missionExecutionOutcome.js';
import { computeTerminalMissionOutcome } from './missionOutcomeResolution.js';
import { reconcileMissionOutcome, validateMissionExecutionOutcome } from './missionValidator.js';
import { Features } from '../../config/features.js';

/**
 * @typedef {'completed' | 'failed' | 'awaiting_owner_input'} PipelineTerminalStatus
 *
 * @typedef {{
 *   pipelineStatus: PipelineTerminalStatus;
 *   missionOutcome: import('./missionExecutionOutcome.js').MissionExecutionOutcome;
 *   validation: ReturnType<typeof validateMissionExecutionOutcome>;
 *   artifactAuthority: ReturnType<typeof resolveMissionArtifactAuthority>;
 *   failureReason?: string;
 *   failureMessage?: string;
 *   reconciled?: boolean;
 *   warnings?: import('./missionExecutionOutcome.js').ExecutionWarning[];
 * }} TopologyExecutionOutcome
 */

/**
 * @param {import('./missionExecutionOutcome.js').MissionExecutionOutcome} outcome
 * @returns {PipelineTerminalStatus}
 */
export function mapMissionOutcomeToPipelineStatus(outcome) {
  if (outcome.status === 'blocked') return 'awaiting_owner_input';
  if (outcome.status === 'completed') return 'completed';
  return 'failed';
}

/**
 * @param {{
 *   executionMode?: string;
 *   nodeRun: Record<string, unknown>;
 *   missionContract: Record<string, unknown> | null | undefined;
 *   metadata: Record<string, unknown>;
 *   outputsJson: Record<string, unknown>;
 *   topology?: Record<string, unknown> | null;
 *   missionFamily?: string;
 *   evidenceGraph?: Record<string, unknown> | null;
 * }} params
 * @returns {TopologyExecutionOutcome & { terminalOutcome?: import('./missionOutcomeResolution.js').TerminalMissionOutcome }}
 */
export function resolveTopologyExecutionOutcome({
  nodeRun,
  missionContract,
  metadata,
  outputsJson,
  topology = null,
  missionFamily,
  evidenceGraph = null,
}) {
  let missionOutcome = buildMissionExecutionOutcome({
    nodeRun,
    topology,
    missionContract,
    metadata,
    outputsJson,
  });

  missionOutcome = reconcileMissionOutcome(missionOutcome);
  const validation = validateMissionExecutionOutcome(missionOutcome);
  const artifactAuthority = resolveMissionArtifactAuthority({
    contract: missionContract,
    metadata,
    nodeRun,
    outputsJson,
  });

  let pipelineStatus = mapMissionOutcomeToPipelineStatus(missionOutcome);
  /** @type {import('./missionOutcomeResolution.js').TerminalMissionOutcome | undefined} */
  let terminalOutcome;

  if (Features.reasoningPhase0.centralizedOutcome) {
    const nodeStatuses =
      nodeRun?.nodeStatus && typeof nodeRun.nodeStatus === 'object' && !Array.isArray(nodeRun.nodeStatus)
        ? /** @type {Record<string, string>} */ (nodeRun.nodeStatus)
        : metadata?.topologyNodeStatus && typeof metadata.topologyNodeStatus === 'object'
          ? /** @type {Record<string, string>} */ (metadata.topologyNodeStatus)
          : {};

    terminalOutcome = computeTerminalMissionOutcome({
      graph: evidenceGraph,
      missionOutcome,
      metadata,
      nodeStatuses,
      missionFamily:
        missionFamily ??
        (String(missionContract?.missionFamily ?? metadata?.compilerTool ?? '').trim() || 'generic'),
      pipelineStatus,
    });

    if (terminalOutcome.status === 'completed') {
      pipelineStatus = 'completed';
      missionOutcome = {
        ...missionOutcome,
        status: 'completed',
        reconciled: terminalOutcome.reconciled === true || missionOutcome.reconciled === true,
        errors: terminalOutcome.reconciled ? [] : missionOutcome.errors,
      };
    } else if (terminalOutcome.status === 'blocked') {
      pipelineStatus = 'awaiting_owner_input';
    } else if (terminalOutcome.status === 'failed' || terminalOutcome.status === 'cancelled') {
      pipelineStatus = 'failed';
    }
  }

  const primaryError = missionOutcome.errors?.[0];

  return {
    pipelineStatus,
    missionOutcome,
    terminalOutcome,
    validation,
    artifactAuthority,
    failureReason: primaryError?.code,
    failureMessage: primaryError?.message ?? terminalOutcome?.rationale,
    reconciled: missionOutcome.reconciled === true || terminalOutcome?.reconciled === true,
    warnings: missionOutcome.warnings ?? [],
  };
}

/**
 * Structured lifecycle trace (no auth tokens or raw image data).
 *
 * @param {Record<string, unknown>} params
 */
export function buildTopologyLifecycleTrace(params) {
  return {
    traceId: params.traceId ?? null,
    missionId: params.missionId ?? null,
    topologyId: params.topologyId ?? null,
    toolName: params.toolName ?? null,
    nodeId: params.nodeId ?? null,
    nodeIndex: params.nodeIndex ?? null,
    nodeStatus: params.nodeStatus ?? null,
    requiredNode: params.requiredNode ?? null,
    resultStatus: params.resultStatus ?? null,
    artifactIds: params.artifactIds ?? [],
    persistedRecordIds: params.persistedRecordIds ?? [],
    terminalSignal: params.terminalSignal ?? null,
    previousMissionStatus: params.previousMissionStatus ?? null,
    nextMissionStatus: params.nextMissionStatus ?? null,
    failureCode: params.failureCode ?? null,
    failureSource: params.failureSource ?? null,
    errorPresent: params.errorPresent === true,
    reconciled: params.reconciled === true,
    warnings: params.warnings ?? [],
    outcomeStatus: params.outcomeStatus ?? null,
  };
}
