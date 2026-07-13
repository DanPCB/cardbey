/**
 * Universal mission execution outcome contract.
 * Topology → execution result → mission outcome → artifact validation (warnings, not silent failure).
 */

import { listMissionArtifacts } from './artifactAuthority.js';
import { resolveCanonicalArtifactType } from './artifactRegistry.js';
import {
  evaluateCompletionCriteria,
  resolveCompletionCriteria,
} from './topologyCompletionCriteria.js';

/**
 * @typedef {'completed' | 'blocked' | 'failed' | 'cancelled'} MissionOutcomeStatus
 *
 * @typedef {{
 *   id?: string;
 *   type: string;
 *   status?: string;
 * }} ArtifactRef
 *
 * @typedef {{
 *   type: string;
 *   id?: string;
 * }} EntityRef
 *
 * @typedef {{
 *   code: string;
 *   message: string;
 *   source?: string;
 *   nodeId?: string;
 *   toolName?: string;
 *   retryable?: boolean;
 * }} ExecutionError
 *
 * @typedef {{
 *   code: string;
 *   message: string;
 *   source?: string;
 * }} ExecutionWarning
 *
 * @typedef {{
 *   type: string;
 *   nodeId?: string;
 *   message?: string;
 *   resumable?: boolean;
 * }} ExecutionBlocker
 *
 * @typedef {{
 *   status: MissionOutcomeStatus;
 *   completedNodes: string[];
 *   failedNodes: string[];
 *   artifacts: ArtifactRef[];
 *   persistedEntities: EntityRef[];
 *   warnings: ExecutionWarning[];
 *   errors: ExecutionError[];
 *   blocker?: ExecutionBlocker | null;
 *   completionCriteria?: ReturnType<typeof resolveCompletionCriteria>;
 *   criteriaEvaluation?: ReturnType<typeof evaluateCompletionCriteria>;
 *   reconciled?: boolean;
 * }} MissionExecutionOutcome
 */

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function completedNodeIds(nodeRun) {
  const nodeStatus = asObject(nodeRun?.nodeStatus);
  return Object.entries(nodeStatus)
    .filter(([, status]) => {
      const s = String(status ?? '').toLowerCase();
      return s === 'completed' || s === 'skipped';
    })
    .map(([id]) => id);
}

function failedNodeIds(nodeRun) {
  const nodeStatus = asObject(nodeRun?.nodeStatus);
  return Object.entries(nodeStatus)
    .filter(([, status]) => String(status ?? '').toLowerCase() === 'failed')
    .map(([id]) => id);
}

function collectArtifactRefs({ metadata, nodeRun, outputsJson }) {
  return listMissionArtifacts({ metadata, nodeRun, outputsJson }).map((artifact) => ({
    id: artifact.id,
    type: resolveCanonicalArtifactType(
      artifact.subtype ?? artifact.type ?? /** @type {Record<string, unknown>} */ (artifact).artifactType,
    ),
    status: artifact.status,
  }));
}

function collectPersistedEntities(nodeRun, metadata) {
  /** @type {EntityRef[]} */
  const refs = [];
  const meta = asObject(metadata);
  const outputs = asObject(nodeRun?.outputs);
  const toolOutputs = asObject(nodeRun?.toolOutputs);

  const loyaltyId =
    outputs.loyaltyProgramId ??
    meta.loyaltyProgramId ??
    toolOutputs['loyalty.persist_draft']?.loyaltyProgramId ??
    null;
  if (loyaltyId) {
    refs.push({ type: 'loyalty_program_draft', id: String(loyaltyId) });
  }

  if (meta.loyaltyProgramDraftArtifact && typeof meta.loyaltyProgramDraftArtifact === 'object') {
    const bag = /** @type {Record<string, unknown>} */ (meta.loyaltyProgramDraftArtifact);
    const fromPayload = bag.payload && typeof bag.payload === 'object'
      ? /** @type {Record<string, unknown>} */ (bag.payload).loyaltyProgramId
      : null;
    if (fromPayload && !refs.some((r) => r.type === 'loyalty_program_draft')) {
      refs.push({ type: 'loyalty_program_draft', id: String(fromPayload) });
    }
  }

  const storeId = outputs.storeId ?? meta.storeId ?? null;
  if (storeId) refs.push({ type: 'store', id: String(storeId) });

  return refs;
}

function nodeErrors(nodeRun) {
  /** @type {ExecutionError[]} */
  const errors = [];
  const nodeOutputs = asObject(nodeRun?.nodeOutputs);
  for (const [nodeId, output] of Object.entries(nodeOutputs)) {
    const row = asObject(output);
    const err = asObject(row.error);
    if (!err.message && !err.code) continue;
    errors.push({
      code: String(err.code ?? 'NODE_FAILED'),
      message: String(err.message ?? 'Topology step failed'),
      source: 'topologyNodeRunner',
      nodeId,
      retryable: err.retryable === true,
    });
  }
  return errors;
}

/**
 * Build topology-agnostic mission execution outcome.
 *
 * @param {{
 *   nodeRun: Record<string, unknown>;
 *   topology?: Record<string, unknown> | null;
 *   missionContract?: Record<string, unknown> | null;
 *   metadata?: Record<string, unknown>;
 *   outputsJson?: Record<string, unknown>;
 * }} params
 * @returns {MissionExecutionOutcome}
 */
export function buildMissionExecutionOutcome({
  nodeRun,
  topology,
  missionContract,
  metadata = {},
  outputsJson = {},
}) {
  const nodeStatus = String(nodeRun?.status ?? '').toLowerCase();
  const completedNodes = completedNodeIds(nodeRun);
  const failedNodes = failedNodeIds(nodeRun);
  const artifacts = collectArtifactRefs({ metadata, nodeRun, outputsJson });
  const persistedEntities = collectPersistedEntities(nodeRun, metadata);
  const completionCriteria = resolveCompletionCriteria({ topology, missionContract });

  const artifactTypesPresent = new Set(
    artifacts.map((a) => resolveCanonicalArtifactType(a.type)).filter(Boolean),
  );
  const persistedRecordTypesPresent = new Set(persistedEntities.map((e) => e.type));

  /** @type {ExecutionWarning[]} */
  const warnings = [];
  /** @type {ExecutionError[]} */
  const errors = nodeErrors(nodeRun);

  if (nodeStatus === 'awaiting_owner_input') {
    const pendingNodeId =
      (typeof nodeRun.pendingNodeId === 'string' && nodeRun.pendingNodeId) ||
      (typeof metadata.pendingNodeId === 'string' && metadata.pendingNodeId) ||
      null;
    const missingFields = Array.isArray(nodeRun.missingFields) ? nodeRun.missingFields : [];
    return {
      status: 'blocked',
      completedNodes,
      failedNodes,
      artifacts,
      persistedEntities,
      warnings,
      errors,
      blocker: {
        type: 'owner_input_required',
        nodeId: pendingNodeId ?? undefined,
        message:
          (typeof nodeRun.suggestedQuestion === 'string' && nodeRun.suggestedQuestion) ||
          (missingFields.length ? `Need owner input: ${missingFields.join(', ')}` : 'Owner input required'),
        resumable: true,
      },
      completionCriteria,
    };
  }

  if (nodeStatus === 'failed' || failedNodes.length > 0) {
    if (!errors.length) {
      errors.push({
        code: 'TOPOLOGY_NODE_FAILED',
        message: 'One or more topology steps failed.',
        source: 'topologyNodeRunner',
        retryable: true,
      });
    }
    return {
      status: 'failed',
      completedNodes,
      failedNodes,
      artifacts,
      persistedEntities,
      warnings,
      errors,
      completionCriteria,
    };
  }

  if (nodeStatus !== 'completed') {
    errors.push({
      code: 'UNEXPECTED_TOPOLOGY_STATUS',
      message: `Unexpected topology status: ${nodeStatus || 'unknown'}`,
      source: 'missionExecutionOutcome',
    });
    return {
      status: 'failed',
      completedNodes,
      failedNodes,
      artifacts,
      persistedEntities,
      warnings,
      errors,
      completionCriteria,
    };
  }

  const criteriaEvaluation = evaluateCompletionCriteria(completionCriteria, {
    completedNodes,
    artifactTypesPresent,
    persistedRecordTypesPresent,
  });

  for (const type of criteriaEvaluation.missingOptionalArtifacts) {
    warnings.push({
      code: 'ARTIFACT_INCOMPLETE',
      message: `Optional artifact not generated: ${type}`,
      source: 'artifactValidation',
    });
  }
  for (const type of criteriaEvaluation.missingOptionalRecords) {
    warnings.push({
      code: 'PERSISTENCE_INCOMPLETE',
      message: `Optional persisted record missing: ${type}`,
      source: 'persistenceValidation',
    });
  }

  for (const nodeId of criteriaEvaluation.missingMandatoryNodes) {
    errors.push({
      code: 'REQUIRED_NODE_INCOMPLETE',
      message: `Required topology node did not complete: ${nodeId}`,
      source: 'completionCriteria',
      nodeId,
      retryable: true,
    });
  }
  for (const type of criteriaEvaluation.missingMandatoryArtifacts) {
    errors.push({
      code: 'MANDATORY_ARTIFACT_MISSING',
      message: `Required artifact missing: ${type}`,
      source: 'completionCriteria',
      retryable: true,
    });
  }
  for (const type of criteriaEvaluation.missingMandatoryRecords) {
    errors.push({
      code: 'MANDATORY_RECORD_MISSING',
      message: `Required persisted record missing: ${type}`,
      source: 'completionCriteria',
      retryable: true,
    });
  }

  if (errors.length > 0) {
    return {
      status: 'failed',
      completedNodes,
      failedNodes,
      artifacts,
      persistedEntities,
      warnings,
      errors,
      completionCriteria,
      criteriaEvaluation,
    };
  }

  return {
    status: 'completed',
    completedNodes,
    failedNodes,
    artifacts,
    persistedEntities,
    warnings,
    errors,
    completionCriteria,
    criteriaEvaluation,
  };
}
