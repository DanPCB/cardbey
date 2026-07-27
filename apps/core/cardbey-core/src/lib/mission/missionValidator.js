/**
 * Mission validator — final gate before persisting terminal mission status.
 * Enforces lifecycle invariants so false transitions cannot reach the database silently.
 */

import { computeTopologyHash } from './topologyHash.js';

export class MissionInvariantViolation extends Error {
  /**
   * @param {string[]} violations
   * @param {import('./missionExecutionOutcome.js').MissionExecutionOutcome} [outcome]
   */
  constructor(violations, outcome = null) {
    super(`Mission lifecycle invariant violation: ${violations.join('; ')}`);
    this.name = 'MissionInvariantViolation';
    this.violations = violations;
    this.outcome = outcome;
  }
}

/**
 * @param {import('./missionExecutionOutcome.js').MissionExecutionOutcome} outcome
 * @returns {{ ok: boolean; violations: string[] }}
 */
export function validateMissionExecutionOutcome(outcome) {
  /** @type {string[]} */
  const violations = [];

  if (!outcome || typeof outcome !== 'object') {
    violations.push('OUTCOME_MISSING');
    return { ok: false, violations };
  }

  const status = String(outcome.status ?? '');

  if (status === 'failed' && (!Array.isArray(outcome.errors) || outcome.errors.length === 0)) {
    violations.push('FAILED_WITHOUT_STRUCTURED_ERROR');
  }

  if (status === 'completed') {
    if (Array.isArray(outcome.errors) && outcome.errors.length > 0) {
      violations.push('COMPLETED_WITH_FATAL_ERRORS');
    }
    if (outcome.criteriaEvaluation && outcome.criteriaEvaluation.satisfied !== true) {
      violations.push('COMPLETED_WITHOUT_SATISFIED_CRITERIA');
    }
  }

  if (status === 'blocked' && !outcome.blocker) {
    violations.push('BLOCKED_WITHOUT_BLOCKER');
  }

  if (status === 'blocked' && outcome.blocker && !outcome.blocker.type) {
    violations.push('BLOCKED_WITHOUT_BLOCKER_TYPE');
  }

  const validStatuses = new Set(['completed', 'blocked', 'failed', 'cancelled']);
  if (!validStatuses.has(status)) {
    violations.push(`INVALID_OUTCOME_STATUS:${status || 'unknown'}`);
  }

  if (process.env.NODE_ENV !== 'production' && violations.length > 0) {
    throw new MissionInvariantViolation(violations, outcome);
  }

  return { ok: violations.length === 0, violations };
}

/**
 * Apply safe reconciliation when validator would block a false failure.
 *
 * @param {import('./missionExecutionOutcome.js').MissionExecutionOutcome} outcome
 * @returns {import('./missionExecutionOutcome.js').MissionExecutionOutcome}
 */
export function reconcileMissionOutcome(outcome) {
  if (outcome.status !== 'failed') return outcome;

  const evalResult = outcome.criteriaEvaluation;
  const hasStructuredNodeFailure = (outcome.failedNodes ?? []).length > 0;
  const onlyArtifactErrors = (outcome.errors ?? []).every((err) =>
    ['MANDATORY_ARTIFACT_MISSING', 'MANDATORY_RECORD_MISSING'].includes(String(err.code)),
  );

  if (
    !hasStructuredNodeFailure &&
    evalResult?.satisfied === true &&
    onlyArtifactErrors &&
    (outcome.artifacts?.length ?? 0) > 0
  ) {
    return {
      ...outcome,
      status: 'completed',
      errors: [],
      reconciled: true,
      warnings: [
        ...(outcome.warnings ?? []),
        {
          code: 'OUTCOME_RECONCILED',
          message: 'Mission outcome reconciled: required outputs present before false terminal transition.',
          source: 'missionValidator',
        },
      ],
    };
  }

  return outcome;
}

export class ContractGraphMismatchError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   */
  constructor(code, message) {
    super(message);
    this.name = 'ContractGraphMismatchError';
    this.code = code;
  }
}

/**
 * @param {import('./missionEvidenceGraph.js').MissionEvidenceGraph | null | undefined} graph
 * @param {Record<string, unknown> | null | undefined} contract
 */
export function validateGraphContractConsistency(graph, contract) {
  if (!contract || typeof contract !== 'object') return { ok: true };
  if (!graph) return { ok: true };

  const contractVersion = Number(contract.evidenceGraphVersion);
  const graphVersion = Number(graph.version);
  // Contract freezes a baseline graph version at plan approval. The graph may advance
  // monotonically during coordinator steps and DAG execution (perceptions, decisions,
  // phase transitions). Only reject if the graph regressed below the frozen baseline.
  if (
    Number.isFinite(contractVersion) &&
    contractVersion > 0 &&
    Number.isFinite(graphVersion) &&
    graphVersion > 0 &&
    graphVersion < contractVersion
  ) {
    throw new ContractGraphMismatchError(
      'CONTRACT_GRAPH_MISMATCH',
      `Graph version ${graphVersion} is behind frozen contract baseline ${contractVersion}`,
    );
  }

  const contractHash = String(contract.topologyHash ?? '').trim();
  const graphTopology = graph.topology && typeof graph.topology === 'object' ? graph.topology : null;
  if (contractHash && graphTopology) {
    const graphHash = computeTopologyHash(graphTopology);
    if (graphHash !== contractHash) {
      throw new ContractGraphMismatchError(
        'TOPOLOGY_DRIFT',
        `Topology hash drift: graph=${graphHash.slice(0, 12)} contract=${contractHash.slice(0, 12)}`,
      );
    }
  }

  const contractGraphId = String(contract.evidenceGraphId ?? '').trim();
  const graphId = String(graph.graphId ?? '').trim();
  if (contractGraphId && graphId && contractGraphId !== graphId) {
    throw new ContractGraphMismatchError(
      'EVIDENCE_GRAPH_ID_MISMATCH',
      `Contract evidenceGraphId ${contractGraphId} does not match graph ${graphId}`,
    );
  }

  return { ok: true };
}
