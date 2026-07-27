/**
 * Phase 0 — centralized terminal mission outcome resolution.
 * Single source of truth for pipeline/UI terminal status (no dashboard overrides).
 */

import { appendEvidenceNode } from './missionEvidenceGraph.js';
import { Features } from '../../config/features.js';

const LOYALTY_ARTIFACT_TYPES = new Set(['generated_loyalty_program', 'loyalty_program_draft']);

/**
 * @param {Record<string, unknown> | null | undefined} metadata
 */
export function hasLoyaltyProgramDraftArtifactInMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object') return false;
  if (metadata.loyaltyProgramDraftArtifact && typeof metadata.loyaltyProgramDraftArtifact === 'object') {
    return true;
  }
  if (metadata.generatedLoyaltyProgram && typeof metadata.generatedLoyaltyProgram === 'object') {
    return true;
  }
  if (metadata.loyaltyProgramDraft && typeof metadata.loyaltyProgramDraft === 'object') {
    return true;
  }
  const delivered = metadata.missionDeliveredArtifacts;
  if (Array.isArray(delivered)) {
    return delivered.some(
      (row) =>
        row &&
        typeof row === 'object' &&
        LOYALTY_ARTIFACT_TYPES.has(String(/** @type {Record<string, unknown>} */ (row).type ?? '')),
    );
  }
  return false;
}

/**
 * @param {Record<string, string> | null | undefined} nodeStatuses
 */
export function allTopologyNodesTerminal(nodeStatuses) {
  if (!nodeStatuses || typeof nodeStatuses !== 'object') return false;
  const values = Object.values(nodeStatuses);
  if (!values.length) return false;
  return values.every((status) => {
    const normalized = String(status ?? '').toLowerCase();
    return normalized === 'completed' || normalized === 'skipped';
  });
}

/**
 * @param {import('./missionExecutionOutcome.js').MissionExecutionOutcome} missionOutcome
 * @param {Record<string, unknown>} [metadata]
 */
function generateFailureRationale(missionOutcome, metadata = {}) {
  const primary = missionOutcome.errors?.[0];
  if (primary?.message) return primary.message;
  if (typeof metadata.executionFailureMessage === 'string' && metadata.executionFailureMessage.trim()) {
    return metadata.executionFailureMessage.trim();
  }
  return 'Mission did not satisfy completion criteria';
}

/**
 * @typedef {'completed' | 'failed' | 'blocked' | 'cancelled' | 'partial' | 'review_needed'} TerminalOutcomeStatus
 *
 * @typedef {{
 *   status: TerminalOutcomeStatus;
 *   rationale: string;
 *   artifacts: import('./missionExecutionOutcome.js').ArtifactRef[];
 *   warnings: string[];
 *   errors: string[];
 *   reconciledAt: string;
 *   source: 'graph' | 'validator';
 *   reconciled?: boolean;
 *   pipelineStatus?: string;
 * }} TerminalMissionOutcome
 */

/**
 * Compute authoritative terminal outcome from execution outcome + loyalty coherence rules.
 *
 * @param {{
 *   graph?: import('./missionEvidenceGraph.js').MissionEvidenceGraph | null;
 *   missionOutcome: import('./missionExecutionOutcome.js').MissionExecutionOutcome;
 *   metadata?: Record<string, unknown>;
 *   nodeStatuses?: Record<string, string>;
 *   missionFamily?: string;
 *   pipelineStatus?: string;
 * }} params
 * @returns {TerminalMissionOutcome}
 */
export function computeTerminalMissionOutcome({
  graph = null,
  missionOutcome,
  metadata = {},
  nodeStatuses = {},
  missionFamily = 'generic',
  pipelineStatus = '',
}) {
  const now = new Date().toISOString();
  const artifacts = missionOutcome.artifacts ?? [];
  const warnings = (missionOutcome.warnings ?? []).map((w) => w.message || w.code || 'warning');
  const errors = (missionOutcome.errors ?? []).map((e) => e.message || e.code || 'error');

  let status = /** @type {TerminalOutcomeStatus} */ (missionOutcome.status);
  let rationale = '';
  let reconciled = missionOutcome.reconciled === true;
  let source = /** @type {'graph' | 'validator'} */ ('validator');

  if (status === 'blocked') {
    rationale =
      missionOutcome.blocker?.message ||
      'Mission blocked awaiting owner input';
    const outcome = {
      status,
      rationale,
      artifacts,
      warnings,
      errors,
      reconciledAt: now,
      source,
      reconciled,
      pipelineStatus: pipelineStatus || 'awaiting_owner_input',
    };
    persistTerminalOutcomeOnGraph(graph, outcome);
    return outcome;
  }

  const isLoyalty = missionFamily === 'loyalty';
  const hasDraft = hasLoyaltyProgramDraftArtifactInMetadata(metadata) || artifacts.length > 0;
  const nodesHealthy = allTopologyNodesTerminal(nodeStatuses);

  if (
    Features.reasoningPhase0.centralizedOutcome &&
    isLoyalty &&
    hasDraft &&
    nodesHealthy &&
    (status === 'failed' || pipelineStatus === 'failed')
  ) {
    status = 'completed';
    rationale =
      'Draft artifact exists and all topology nodes reached terminal state; outcome reconciled from false pipeline failure';
    reconciled = true;
    source = 'graph';
  } else if (status === 'completed') {
    rationale = 'All completion criteria satisfied';
  } else if (isLoyalty && hasDraft && !nodesHealthy) {
    status = 'partial';
    rationale = 'Draft created but some topology nodes did not reach terminal state';
  } else if (isLoyalty && hasDraft && status !== 'completed') {
    status = 'review_needed';
    rationale = 'Draft artifact available for owner review despite non-success pipeline signal';
  } else if (status === 'failed') {
    rationale = generateFailureRationale(missionOutcome, metadata);
  } else {
    rationale = `Mission terminal status: ${status}`;
  }

  const outcome = {
    status,
    rationale,
    artifacts,
    warnings,
    errors,
    reconciledAt: now,
    source,
    reconciled,
    pipelineStatus: pipelineStatus || status,
  };

  persistTerminalOutcomeOnGraph(graph, outcome);
  return outcome;
}

/**
 * @param {import('./missionEvidenceGraph.js').MissionEvidenceGraph | null | undefined} graph
 * @param {TerminalMissionOutcome} outcome
 */
function persistTerminalOutcomeOnGraph(graph, outcome) {
  if (!graph || !Features.reasoningPhase0.centralizedOutcome) return;
  appendEvidenceNode(graph, {
    kind: 'outcome',
    source: 'mission.terminalOutcome',
    summary: `${outcome.status}: ${outcome.rationale}`,
    data: outcome,
  });
}

/**
 * Map terminal outcome to topology review UI mode.
 * @param {TerminalMissionOutcome | Record<string, unknown> | null | undefined} outcome
 */
export function mapTerminalOutcomeToReviewMode(outcome) {
  if (!outcome || typeof outcome !== 'object') return null;
  const status = String(outcome.status ?? '').toLowerCase();
  if (status === 'completed' || status === 'review_needed' || status === 'partial') return 'completed';
  if (status === 'blocked') return 'awaiting_owner_input';
  if (status === 'failed' || status === 'cancelled') return 'failed';
  return null;
}
