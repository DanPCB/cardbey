/**
 * Mission Evidence Graph — unified observe → infer → decide → act trace.
 * Phase 1: loyalty card missions. Kernel ingress evidenceId links intake to mission graph.
 */

import { randomUUID } from 'node:crypto';
import { hasAuthoritativeLoyaltyTopology } from '../loyalty/loyaltyContractDiagnostics.js';
import { inferRuleFromTopology } from '../loyalty/loyaltyRuleInference.js';
import {
  buildSemanticTextEvidence,
  buildVisualGridEvidenceFromTopology,
} from '../loyalty/loyaltyVisualGridEvidence.js';

/**
 * @typedef {'observation' | 'inference' | 'decision' | 'artifact' | 'outcome'} EvidenceNodeKind
 *
 * @typedef {{
 *   id: string;
 *   kind: EvidenceNodeKind;
 *   source: string;
 *   at: string;
 *   confidence?: number;
 *   summary: string;
 *   data?: Record<string, unknown>;
 * }} EvidenceNode
 *
 * @typedef {{
 *   id: string;
 *   question: string;
 *   answer: string;
 *   rationale: string;
 *   confidence?: number;
 *   source: string;
 *   at: string;
 * }} EvidenceDecision
 *
 * @typedef {{
 *   code: string;
 *   message: string;
 *   resolved?: boolean;
 * }} EvidenceConflict
 *
 * @typedef {{
 *   graphId: string;
 *   missionId?: string | null;
 *   evidenceId?: string | null;
 *   domain: string;
 *   nodes: EvidenceNode[];
 *   decisions: EvidenceDecision[];
 *   conflicts: EvidenceConflict[];
 *   version?: number;
 *   topology?: Record<string, unknown> | null;
 *   updatedAt: string;
 * }} MissionEvidenceGraph
 */

function nowIso() {
  return new Date().toISOString();
}

function pickString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

/**
 * @param {{
 *   missionId?: string | null;
 *   evidenceId?: string | null;
 *   domain?: string;
 *   graphId?: string;
 * }} params
 * @returns {MissionEvidenceGraph}
 */
export function createMissionEvidenceGraph(params = {}) {
  const t = nowIso();
  return {
    graphId: pickString(params.graphId) || `meg_${randomUUID()}`,
    missionId: pickString(params.missionId) || null,
    evidenceId: pickString(params.evidenceId) || null,
    domain: pickString(params.domain) || 'generic',
    nodes: [],
    decisions: [],
    conflicts: [],
    version: typeof params.version === 'number' && params.version > 0 ? params.version : 1,
    topology: params.topology && typeof params.topology === 'object' ? params.topology : null,
    updatedAt: t,
  };
}

/**
 * @param {MissionEvidenceGraph} graph
 * @param {Omit<EvidenceNode, 'id' | 'at'> & { id?: string; at?: string }} node
 */
export function appendEvidenceNode(graph, node) {
  graph.nodes.push({
    id: node.id ?? `evn_${randomUUID()}`,
    at: node.at ?? nowIso(),
    kind: node.kind,
    source: node.source,
    summary: node.summary,
    confidence: node.confidence,
    data: node.data,
  });
  graph.updatedAt = nowIso();
  return graph.nodes[graph.nodes.length - 1];
}

/**
 * @param {MissionEvidenceGraph} graph
 * @param {Omit<EvidenceDecision, 'id' | 'at'> & { id?: string; at?: string }} decision
 */
export function recordEvidenceDecision(graph, decision) {
  graph.decisions.push({
    id: decision.id ?? `evd_${randomUUID()}`,
    at: decision.at ?? nowIso(),
    question: decision.question,
    answer: decision.answer,
    rationale: decision.rationale,
    confidence: decision.confidence,
    source: decision.source,
  });
  graph.updatedAt = nowIso();
  return graph.decisions[graph.decisions.length - 1];
}

/**
 * @param {MissionEvidenceGraph} graph
 * @param {EvidenceConflict} conflict
 */
export function recordEvidenceConflict(graph, conflict) {
  graph.conflicts.push({ ...conflict });
  graph.updatedAt = nowIso();
}

/**
 * @param {unknown} value
 * @returns {MissionEvidenceGraph | null}
 */
export function asMissionEvidenceGraph(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const g = /** @type {MissionEvidenceGraph} */ (value);
  if (!Array.isArray(g.nodes) || !Array.isArray(g.decisions)) return null;
  return g;
}

/**
 * Merge graphs — later nodes win on same source+kind for inference/decision duplicates.
 * @param {MissionEvidenceGraph | null | undefined} base
 * @param {MissionEvidenceGraph | null | undefined} patch
 */
export function mergeMissionEvidenceGraphs(base, patch) {
  if (!patch) return base ?? createMissionEvidenceGraph();
  if (!base) return { ...patch, nodes: [...patch.nodes], decisions: [...patch.decisions], conflicts: [...patch.conflicts] };
  const topology = hasAuthoritativeLoyaltyTopology(patch.topology)
    ? patch.topology
    : hasAuthoritativeLoyaltyTopology(base.topology)
      ? base.topology
      : patch.topology ?? base.topology ?? null;
  return {
    ...base,
    missionId: pickString(patch.missionId, base.missionId) || null,
    evidenceId: pickString(patch.evidenceId, base.evidenceId) || null,
    nodes: [...base.nodes, ...patch.nodes],
    decisions: [...base.decisions, ...patch.decisions],
    conflicts: [...base.conflicts, ...patch.conflicts],
    topology,
    updatedAt: patch.updatedAt ?? nowIso(),
  };
}

/**
 * Safe summary for logs/UI — no raw OCR blobs or image data.
 * @param {MissionEvidenceGraph | null | undefined} graph
 */
export function summarizeMissionEvidenceGraph(graph) {
  if (!graph) return null;
  const lastDecision = graph.decisions[graph.decisions.length - 1] ?? null;
  const topologyNode = [...graph.nodes].reverse().find(
    (n) =>
      n.source.includes('topology') ||
      n.source === 'loyalty.visual_grid' ||
      (n.data?.rows && n.data?.columns),
  );
  const outcomeNode = [...graph.nodes].reverse().find((n) => n.kind === 'outcome');
  return {
    graphId: graph.graphId,
    missionId: graph.missionId,
    evidenceId: graph.evidenceId,
    domain: graph.domain,
    nodeCount: graph.nodes.length,
    decisionCount: graph.decisions.length,
    conflictCount: graph.conflicts.length,
    lastDecision: lastDecision
      ? { question: lastDecision.question, answer: lastDecision.answer }
      : null,
    topology: topologyNode?.data
      ? {
          rows: topologyNode.data.rows,
          columns: topologyNode.data.columns,
          source: topologyNode.data.source,
          method: topologyNode.data.extractionMethod,
        }
      : null,
    outcome: outcomeNode?.summary ?? null,
    updatedAt: graph.updatedAt,
  };
}

/**
 * Derive renderer + rule decisions from accumulated evidence (loyalty).
 * @param {MissionEvidenceGraph} graph
 * @param {Record<string, unknown>} draft
 */
export function deriveLoyaltyDecisionsFromEvidence(graph, draft = {}) {
  const draftTopology =
    draft.cardTopology && typeof draft.cardTopology === 'object' ? draft.cardTopology : null;
  const graphTopology =
    graph.topology && typeof graph.topology === 'object' ? graph.topology : null;
  const cardTopology = hasAuthoritativeLoyaltyTopology(draftTopology)
    ? draftTopology
    : hasAuthoritativeLoyaltyTopology(graphTopology)
      ? graphTopology
      : draftTopology;
  const hasTopology = hasAuthoritativeLoyaltyTopology(cardTopology);
  const rule =
    draft.rule && typeof draft.rule === 'object'
      ? draft.rule
      : hasTopology
        ? inferRuleFromTopology(cardTopology, {
            purchaseItem: pickString(draft.purchaseItem, draft.rule?.purchaseItem, 'Coffee'),
            rewardItem: pickString(draft.reward, draft.rule?.rewardItem, 'Free'),
          })
        : null;

  const visual = buildVisualGridEvidenceFromTopology(cardTopology);
  const semantic = buildSemanticTextEvidence({
    ocrText: pickString(draft.ocrText) || null,
    purchaseItem: rule?.purchaseItem ?? null,
    rewardItem: rule?.rewardItem ?? null,
    footerText: pickString(draft.cardFooterText, cardTopology?.footerText) || null,
  });

  if (visual) {
    appendEvidenceNode(graph, {
      kind: 'observation',
      source: 'loyalty.visual_grid',
      summary: `Visual grid ${visual.rows}×${visual.columns}`,
      confidence: visual.confidence,
      data: {
        rows: visual.rows,
        columns: visual.columns,
        repeatedRowPattern: visual.repeatedRowPattern,
        source: visual.source,
      },
    });
  }

  if (semantic.labels?.length) {
    appendEvidenceNode(graph, {
      kind: 'observation',
      source: 'loyalty.semantic_text',
      summary: `OCR labels: ${semantic.labels.slice(0, 6).join(', ')}`,
      confidence: semantic.confidence,
      data: {
        purchaseItem: semantic.purchaseItem,
        rewardItem: semantic.rewardItem,
        footerText: semantic.footerText,
        ocrRowEstimate: semantic.ocrRowEstimate,
        labelCount: semantic.labels.length,
      },
    });
  }

  if (rule) {
    appendEvidenceNode(graph, {
      kind: 'inference',
      source: 'loyalty.rule',
      summary: `Rule: ${rule.purchasesRequired} ${rule.purchaseItem} → ${rule.rewardItem}`,
      confidence: Number(draft.confidence) || 0.85,
      data: {
        purchasesRequired: rule.purchasesRequired,
        rewardQuantity: rule.rewardQuantity,
        fixedCardCycles: rule.fixedCardCycles ?? null,
        purchaseItem: rule.purchaseItem,
        rewardItem: rule.rewardItem,
      },
    });
  }

  if (hasTopology) {
    recordEvidenceDecision(graph, {
      question: 'Which renderer should draw the loyalty card?',
      answer: 'TOPOLOGY_DRIVEN',
      rationale: `Authoritative topology ${cardTopology.rows}×${cardTopology.columns} (${cardTopology.source}).`,
      confidence: Number(cardTopology.confidence) || 0.85,
      source: 'loyaltyMissionEvidence.deriveLoyaltyDecisionsFromEvidence',
    });
  } else {
    const ocrNode = [...graph.nodes].reverse().find((n) => n.source.includes('ocr'));
    recordEvidenceDecision(graph, {
      question: 'Which renderer should draw the loyalty card?',
      answer: 'DEFAULT_TEMPLATE',
      rationale: ocrNode
        ? 'No authoritative card topology after OCR/vision extraction; using default stamp template.'
        : 'No card image topology or OCR grid detected; using default stamp template.',
      confidence: 0.6,
      source: 'loyaltyMissionEvidence.deriveLoyaltyDecisionsFromEvidence',
    });
    recordEvidenceConflict(graph, {
      code: 'CARD_TOPOLOGY_MISSING',
      message: 'Loyalty card layout could not be recovered from uploaded evidence.',
      resolved: false,
    });
  }

  if (
    semantic.ocrRowEstimate &&
    visual?.rows &&
    semantic.ocrRowEstimate !== visual.rows
  ) {
    recordEvidenceConflict(graph, {
      code: 'OCR_ROW_GEOMETRY_MISMATCH',
      message: `OCR estimated ${semantic.ocrRowEstimate} rows but topology has ${visual.rows} rows.`,
      resolved: hasTopology,
    });
  }

  return graph;
}
