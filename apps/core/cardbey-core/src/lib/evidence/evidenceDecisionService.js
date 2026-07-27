/**
 * Explicit evidence-backed decisions (Phase 0) — renderer mode, fallbacks, owner ack.
 */

import { hasAuthoritativeLoyaltyTopology } from '../loyalty/loyaltyContractDiagnostics.js';
import { recordEvidenceDecision, recordEvidenceConflict } from '../mission/missionEvidenceGraph.js';
import { Features } from '../../config/features.js';
import { LoyaltyContractError } from '../loyalty/loyaltyContractErrors.js';
import { logDefaultTemplateBlocked } from '../loyalty/defaultLoyaltyCardTopology.js';

export class ExplicitFallbackRequiredError extends Error {
  /**
   * @param {Record<string, unknown>} decision
   */
  constructor(decision) {
    super('Explicit fallback acknowledgment required before using DEFAULT_TEMPLATE in SOURCE_DRIVEN mode');
    this.name = 'ExplicitFallbackRequiredError';
    this.code = 'EXPLICIT_FALLBACK_REQUIRED';
    this.decision = decision;
  }
}

/**
 * @param {import('../mission/missionEvidenceGraph.js').MissionEvidenceGraph | null | undefined} graph
 * @returns {import('../loyalty/loyaltyTopologyTypes.js').LoyaltyCardTopology | null}
 */
export function getCanonicalTopologyFromGraph(graph) {
  if (!graph) return null;

  if (graph.topology && typeof graph.topology === 'object') {
    const direct = /** @type {Record<string, unknown>} */ (graph.topology);
    if (hasAuthoritativeLoyaltyTopology(direct)) {
      return direct;
    }
  }

  if (!graph?.nodes?.length) return null;
  const topologyNode = [...graph.nodes].reverse().find(
    (n) =>
      n.source?.includes('topology') ||
      n.source === 'loyalty.visual_grid' ||
      (n.data?.rows && n.data?.columns),
  );
  if (!topologyNode?.data) return null;
  const data = topologyNode.data;
  return {
    source: data.source ?? 'VISION_EXTRACTED',
    rows: Number(data.rows) || 0,
    columns: Number(data.columns) || 0,
    cells: [],
    confidence: Number(data.confidence) || Number(topologyNode.confidence) || 0,
    reviewRequired: data.reviewRequired === true,
  };
}

/**
 * @param {{
 *   graph?: import('../mission/missionEvidenceGraph.js').MissionEvidenceGraph | null;
 *   cardTopology?: Record<string, unknown> | null;
 *   creationMode?: string;
 * }} input
 * @returns {{ mode: 'TOPOLOGY_DRIVEN' | 'DEFAULT_TEMPLATE'; decision: Record<string, unknown>; requiresOwnerAck?: boolean }}
 */
export function resolveRendererModeWithDecision(input = {}) {
  const creationMode = String(input.creationMode ?? 'INTENT_DRIVEN').toUpperCase();
  const topology =
    (input.cardTopology && typeof input.cardTopology === 'object' ? input.cardTopology : null) ||
    getCanonicalTopologyFromGraph(input.graph ?? null);

  const confidence = Number(topology?.confidence) || 0;
  const authoritative = hasAuthoritativeLoyaltyTopology(topology);
  const useTopology = authoritative && confidence >= 0.65;

  if (useTopology) {
    const decision = {
      type: 'renderer_mode',
      question: 'Which renderer should draw the loyalty card?',
      answer: 'TOPOLOGY_DRIVEN',
      rationale: `Valid topology extracted (confidence: ${confidence.toFixed(2)})`,
      confidence,
      fallback: false,
      requiresOwnerAck: false,
      source: 'evidenceDecisionService.resolveRendererModeWithDecision',
    };
    if (input.graph) {
      recordEvidenceDecision(input.graph, decision);
    }
    return { mode: 'TOPOLOGY_DRIVEN', decision };
  }

  const decision = {
    type: 'renderer_mode',
    question: 'Which renderer should draw the loyalty card?',
    answer: 'DEFAULT_TEMPLATE',
    rationale: authoritative
      ? `Topology confidence ${confidence.toFixed(2)} below threshold 0.65`
      : 'No reliable topology found in evidence graph',
    confidence: authoritative ? confidence : 0.5,
    fallback: true,
    requiresOwnerAck: creationMode === 'SOURCE_DRIVEN',
    source: 'evidenceDecisionService.resolveRendererModeWithDecision',
  };

  if (input.graph) {
    recordEvidenceDecision(input.graph, decision);
    recordEvidenceConflict(input.graph, {
      code: 'CARD_TOPOLOGY_MISSING',
      message: decision.rationale,
      resolved: false,
    });
  }

  if (
    Features.reasoningPhase0.explicitDefaultTemplate &&
    creationMode === 'SOURCE_DRIVEN' &&
    decision.requiresOwnerAck
  ) {
    throw new ExplicitFallbackRequiredError(decision);
  }

  if (Features.loyalty.disableDefaultTemplate) {
    logDefaultTemplateBlocked('resolveRendererModeWithDecision');
    throw new LoyaltyContractError(
      'DEFAULT_TEMPLATE_DISABLED',
      'DEFAULT_TEMPLATE fallback is disabled (LOYALTY_DISABLE_DEFAULT_TEMPLATE). No authoritative topology in evidence graph.',
      { decision, creationMode },
    );
  }

  return { mode: 'DEFAULT_TEMPLATE', decision, requiresOwnerAck: decision.requiresOwnerAck };
}
