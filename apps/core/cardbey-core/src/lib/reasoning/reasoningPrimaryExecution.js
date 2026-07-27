/**
 * Phase 2.5 — reasoning-first execution (coordinator owns the loop; DAG is optional snapshot).
 */

import { Features } from '../../config/features.js';
import { readMetadata, writeMetadata } from '../persistence/metadataWriter.js';
import { isReasoningEnabledForMission } from './reasoningRollout.js';
import { executeFullCardProcessing, scoreFullCardProcessing } from './loyaltyFullCardProcessing.js';

const TERMINAL_PRIMARY_CAPABILITIES = new Set([
  'loyalty.persist_draft',
  'loyalty.present_review',
]);

/**
 * @param {string} missionId
 */
export function isReasoningPrimaryEnabledForMission(missionId) {
  if (!Features.phase2.reasoningPrimary) {
    return { enabled: false, reason: 'PHASE2_REASONING_PRIMARY disabled' };
  }
  const base = isReasoningEnabledForMission(missionId);
  if (!base.enabled) {
    return { enabled: false, reason: base.reason, rollout: base };
  }
  return { enabled: true, reason: 'reasoning_primary', rollout: base };
}

/**
 * @param {string | null | undefined} missionType
 * @param {Record<string, unknown>} [metadata]
 */
export function isLoyaltyCardMission(missionType, metadata = {}) {
  const type = String(missionType ?? metadata.missionType ?? '').trim().toLowerCase();
  const compilerTool = String(metadata.compilerTool ?? metadata.tool ?? '').trim().toLowerCase();
  const source = String(metadata.source ?? '').trim().toLowerCase();
  return (
    type === 'setup_loyalty_program' ||
    type === 'create_loyalty_program' ||
    type === 'loyalty' ||
    type === 'loyalty_campaign' ||
    compilerTool === 'setup_loyalty_program' ||
    compilerTool === 'create_loyalty_program' ||
    source === 'dashboard_loyalty_card_scan' ||
    source === 'loyalty_spine'
  );
}

/**
 * @param {Record<string, unknown> | null | undefined} reasoningResult
 */
export function shouldSkipDagAfterReasoning(reasoningResult) {
  if (!reasoningResult || reasoningResult.skipped) return false;
  if (reasoningResult.reasoningPrimary !== true) return false;
  if (reasoningResult.deferTopology === true) return false;

  const status = String(reasoningResult.actionResult?.status ?? '');
  if (status === 'needs_input') return true;
  if (reasoningResult.terminalOutcome) return true;
  if (reasoningResult.completedInPrimary === true) return true;

  const cap =
    reasoningResult.actionResult?.capabilityId ??
    reasoningResult.nextPlan?.capabilityId ??
    null;
  return status === 'ok' && cap && TERMINAL_PRIMARY_CAPABILITIES.has(cap);
}

/**
 * @returns {number}
 */
export function reasoningPrimaryMaxSteps() {
  const raw = Number(process.env.PHASE2_REASONING_PRIMARY_MAX_STEPS);
  if (Number.isFinite(raw) && raw > 0) return Math.min(Math.floor(raw), 24);
  return 12;
}

/**
 * Primary-mode observe: prefer fused full-card processing when image evidence exists.
 *
 * @param {import('../evidence/missionEvidenceGraphService.js').UnifiedEvidenceGraph} graph
 * @param {Record<string, unknown>} ctx
 * @param {(capabilityId: string, graph: unknown, ctx: Record<string, unknown>) => Promise<Record<string, unknown>>} executeCapability
 */
export async function observeAndEnrichGraph(graph, ctx, executeCapability) {
  if (scoreFullCardProcessing(graph) > 0) {
    const result = await executeFullCardProcessing(graph, ctx);
    return {
      status: result.ok ? 'ok' : 'failed',
      output: result,
      virtual: true,
      capabilityId: 'loyalty.full_card_processing',
    };
  }
  return executeCapability('loyalty.analyze_attachment', graph, ctx);
}

/**
 * @param {import('../evidence/missionEvidenceGraphService.js').UnifiedEvidenceGraph} graph
 */
export function isPrimaryLoopComplete(graph, actionResult) {
  const status = String(actionResult?.status ?? '');
  const cap = actionResult?.capabilityId ?? null;
  if (status === 'needs_input' || status === 'failed') return true;
  if (graph.phase === 'terminal' || graph.outcome) return true;
  if (status === 'ok' && cap && TERMINAL_PRIMARY_CAPABILITIES.has(cap)) return true;
  return false;
}

/**
 * @param {string} missionId
 * @param {Record<string, unknown>} reasoningResult
 * @param {{ pipelineStatus: string; multiAgentStatus: string; executionState: string }} statusPatch
 */
export async function writeReasoningPrimaryExecutionMetadata(missionId, reasoningResult, statusPatch) {
  await writeMetadata(missionId, {
    reasoningPrimaryExecution: true,
    reasoningPrimaryCompletedAt: new Date().toISOString(),
    lastReasoningStep: {
      capabilityId:
        reasoningResult.actionResult?.capabilityId ??
        reasoningResult.nextPlan?.capabilityId ??
        null,
      completedInPrimary: reasoningResult.completedInPrimary === true,
      deferTopology: reasoningResult.deferTopology === true,
      terminalOutcome: reasoningResult.terminalOutcome ?? null,
    },
    multiAgentStatus: statusPatch.multiAgentStatus,
    executionState: statusPatch.executionState,
    runtimeState: statusPatch.executionState,
    ...(statusPatch.pipelineStatus === 'awaiting_owner_input'
      ? {
          awaitingOwnerInput: true,
          missingFields: reasoningResult.actionResult?.missingFields ?? [],
          suggestedQuestion: reasoningResult.actionResult?.suggestedQuestion ?? null,
        }
      : {}),
  });
}

/**
 * @param {string} missionId
 */
export async function refreshReasoningMetadata(missionId) {
  return readMetadata(missionId);
}
