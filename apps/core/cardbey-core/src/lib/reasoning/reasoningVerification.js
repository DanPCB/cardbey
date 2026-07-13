/**
 * Phase 2 — verification and terminal outcome resolution for the reasoning loop.
 */

import { Features } from '../../config/features.js';
import { readMissionContract } from '../kernel/missionContract.js';
import { validateGraphContractConsistency } from '../mission/missionValidator.js';
import {
  computeTerminalMissionOutcome,
  hasLoyaltyProgramDraftArtifactInMetadata,
} from '../mission/missionOutcomeResolution.js';
import { recordGraphDecision, appendReasoningTrace } from '../evidence/missionEvidenceGraphService.js';

const TERMINAL_CAPABILITIES = new Set([
  'loyalty.persist_draft',
  'loyalty.present_review',
]);

/**
 * @param {import('../evidence/missionEvidenceGraphService.js').UnifiedEvidenceGraph} graph
 * @param {Record<string, unknown>} actionResult
 * @param {Record<string, unknown>} metadata
 */
export async function verifyReasoningStep(graph, actionResult, metadata = {}) {
  const contract = await readMissionContract(graph.missionId);
  if (!contract || !Features.reasoningPhase0.graphContractInvariant) {
    return { ok: true, skipped: true, reason: 'NO_CONTRACT_OR_INVARIANT_OFF' };
  }

  try {
    validateGraphContractConsistency(graph, contract);
    recordGraphDecision(graph, {
      type: 'verification_passed',
      question: 'Does graph state match frozen mission contract?',
      answer: 'yes',
      rationale: 'Graph-contract invariants satisfied after reasoning step.',
      confidence: 1,
      source: 'reasoningVerification.verifyReasoningStep',
    });
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Contract verification failed';
    recordGraphDecision(graph, {
      type: 'verification_failed',
      question: 'Does graph state match frozen mission contract?',
      answer: 'no',
      rationale: message,
      confidence: 1,
      source: 'reasoningVerification.verifyReasoningStep',
    });
    appendReasoningTrace(graph, `Verification failed: ${message}`, {
      actionStatus: actionResult?.status ?? null,
      executionState: metadata?.executionState ?? null,
    });
    return {
      ok: false,
      error: message,
      actionStatus: actionResult?.status ?? null,
      metaExecutionState: metadata?.executionState ?? null,
    };
  }
}

/**
 * @param {{
 *   graph: import('../evidence/missionEvidenceGraphService.js').UnifiedEvidenceGraph;
 *   actionResult: Record<string, unknown>;
 *   metadata: Record<string, unknown>;
 *   capabilityId?: string | null;
 * }} params
 */
export function shouldResolveTerminalOutcome({ graph, actionResult, metadata, capabilityId = null }) {
  const cap = capabilityId ?? actionResult?.capabilityId ?? null;
  const status = String(actionResult?.status ?? '');

  if (status === 'needs_input') {
    return { resolve: true, missionStatus: 'blocked', pipelineStatus: 'awaiting_owner_input' };
  }
  if (status === 'failed') {
    return { resolve: true, missionStatus: 'failed', pipelineStatus: 'failed' };
  }
  if (status === 'ok' && cap && TERMINAL_CAPABILITIES.has(cap)) {
    const hasDraft = hasLoyaltyProgramDraftArtifactInMetadata(metadata);
    return {
      resolve: true,
      missionStatus: hasDraft ? 'review_needed' : 'completed',
      pipelineStatus: hasDraft ? 'awaiting_owner_input' : 'completed',
    };
  }
  if (graph.phase === 'terminal' || graph.outcome) {
    return { resolve: true, missionStatus: 'completed', pipelineStatus: 'completed' };
  }
  return { resolve: false };
}

/**
 * @param {{
 *   graph: import('../evidence/missionEvidenceGraphService.js').UnifiedEvidenceGraph;
 *   actionResult: Record<string, unknown>;
 *   metadata: Record<string, unknown>;
 *   capabilityId?: string | null;
 * }} params
 */
export function resolveReasoningTerminalOutcome({ graph, actionResult, metadata, capabilityId = null }) {
  const gate = shouldResolveTerminalOutcome({ graph, actionResult, metadata, capabilityId });
  if (!gate.resolve) return null;

  const nodeStatuses =
    metadata?.topologyNodeStatus && typeof metadata.topologyNodeStatus === 'object'
      ? metadata.topologyNodeStatus
      : {};

  return computeTerminalMissionOutcome({
    graph,
    missionOutcome: {
      status: gate.missionStatus,
      artifacts: [],
      persistedEntities: [],
      errors: actionResult?.error ? [actionResult.error] : [],
      blocker:
        gate.missionStatus === 'blocked'
          ? { message: actionResult?.suggestedQuestion ?? actionResult?.message ?? 'Awaiting owner input' }
          : undefined,
    },
    metadata,
    nodeStatuses,
    missionFamily: 'loyalty',
    pipelineStatus: gate.pipelineStatus,
  });
}
