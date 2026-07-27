/**
 * Phase 2 — graph-driven capability registry for the active reasoning loop.
 * Wraps loyalty stage executors with preconditions scored against UnifiedEvidenceGraph.
 */

import { getExecutor } from '../toolExecutors/index.js';
import { hasUnresolvedConflicts } from './reasoningConflictHandler.js';
import { Features } from '../../config/features.js';
import { scoreFullCardProcessing, hasImageEvidenceOnGraph } from './loyaltyFullCardProcessing.js';
import { hasAuthoritativeLoyaltyTopology } from '../loyalty/loyaltyContractDiagnostics.js';

/**
 * @typedef {import('../evidence/missionEvidenceGraphService.js').UnifiedEvidenceGraph} UnifiedEvidenceGraph
 */

/**
 * @typedef {{
 *   id: string;
 *   priority: number;
 *   phases: string[];
 *   virtual?: boolean;
 *   preconditions: (graph: UnifiedEvidenceGraph, ctx?: Record<string, unknown>) => boolean;
 * }} ReasoningCapabilityDef
 */

function graphHasTopologyPerceptionAttempt(graph) {
  const perceptionSources = new Set([
    'loyalty.full_card_processing',
    'loyalty.extract_topology',
    'loyalty.analyze_attachment',
    'loyalty.vision',
    'loyalty.visual_grid',
  ]);
  if (
    (graph.nodes ?? []).some((node) => {
      const source = String(node.source ?? node.producer ?? '');
      return [...perceptionSources].some((needle) => source.includes(needle));
    })
  ) {
    return true;
  }
  return (graph.reasoningTrace ?? []).some((line) => {
    const text = String(line?.message ?? line?.text ?? line?.capability ?? '');
    return /full.card|extract_topology|analyze_attachment|visual.grid/i.test(text);
  });
}

function canDeferToTopologyPlan(graph, ctx) {
  if (!ctx?.approvedTopology || graph.phase === 'terminal') return false;
  if (!['plan', 'act', 'verify'].includes(String(graph.phase ?? ''))) return false;
  if (hasAuthoritativeLoyaltyTopology(graph.topology)) return true;
  if (hasImageEvidenceOnGraph(graph) && !graphHasTopologyPerceptionAttempt(graph)) return false;
  return true;
}

function hasUnprocessedAttachments(graph) {
  const attachments = graph.attachments ?? [];
  if (!attachments.length) return false;
  const perceived = new Set(
    (graph.perceptions ?? [])
      .filter((p) => p.type === 'new_attachment' || p.type === 'visual_grid' || p.type === 'ocr')
      .map((p) => String(p.data?.attachmentId ?? p.data?.evidenceId ?? '')),
  );
  return attachments.some((a) => {
    const key = String(a.attachmentId ?? a.evidenceId ?? a.id ?? '');
    return key && !perceived.has(key);
  });
}

function hasOcrWithoutTopology(graph) {
  const hasOcr = (graph.perceptions ?? []).some(
    (p) => p.type === 'ocr' || p.type === 'semantic_text',
  );
  return hasOcr && !graph.topology;
}

function hasVisualGridWithoutTopology(graph) {
  return Boolean(graph.visualGrid?.rows && graph.visualGrid?.columns) && !graph.topology;
}

function missingTopologyWithEvidence(graph) {
  if (graph.topology) return false;
  return hasOcrWithoutTopology(graph) || hasVisualGridWithoutTopology(graph);
}

function needsAnalyzeBeforeExtract(graph) {
  return (
    hasUnprocessedAttachments(graph) ||
    ((graph.attachments?.length ?? 0) > 0 && !(graph.perceptions?.length))
  );
}

function hasUnprocessedImageAttachment(graph) {
  return (graph.attachments ?? []).some((a) => {
    if (a?.perceptionProcessed === true) return false;
    const type = String(a?.type ?? a?.mimeType ?? '').toLowerCase();
    return type.includes('image') || Boolean(a?.attachmentId || a?.evidenceId);
  });
}

/**
 * Dynamic priority for extract_topology (higher when image present, no topology).
 *
 * @param {UnifiedEvidenceGraph} graph
 */
export function scoreExtractTopology(graph) {
  if (needsReplan(graph)) return 120;
  if (!missingTopologyWithEvidence(graph) || needsAnalyzeBeforeExtract(graph)) return 0;
  if (hasUnprocessedImageAttachment(graph)) return 115;
  if (hasUnresolvedConflicts(graph)) return 112;
  return 108;
}

/**
 * @param {ReasoningCapabilityDef} cap
 * @param {UnifiedEvidenceGraph} graph
 * @param {Record<string, unknown>} [ctx]
 */
function resolveCapabilityPriority(cap, graph, ctx = {}) {
  if (cap.id === 'loyalty.full_card_processing') {
    return scoreFullCardProcessing(graph);
  }
  if (cap.id === 'loyalty.extract_topology') {
    return scoreExtractTopology(graph);
  }
  if (typeof cap.score === 'function') {
    return cap.score(graph, ctx);
  }
  return cap.priority;
}

function missingLoyaltyRule(graph) {
  return Boolean(graph.topology) && !graph.rule;
}

function missingLoyaltyDraft(graph, ctx = {}) {
  if (ctx?.approvedTopology) return false;
  const meta = ctx?.metadata ?? {};
  if (meta.loyaltyProgramDraft || meta.loyaltyProgramDraftArtifact) return false;
  return Boolean(graph.rule) && graph.phase !== 'terminal' && !graph.outcome;
}

function needsStoreContext(graph, ctx = {}) {
  if (ctx?.storeId) return false;
  const meta = ctx?.metadata ?? {};
  if (meta.storeId || meta.storeContext) return false;
  const priors = ctx?.stepOutputs ?? {};
  for (const value of Object.values(priors)) {
    if (value && typeof value === 'object' && value.storeContext) return false;
  }
  return graph.phase !== 'terminal';
}

function needsDraftValidation(graph, ctx = {}) {
  const meta = ctx?.metadata ?? {};
  const hasDraft =
    Boolean(meta.loyaltyDraft) ||
    Boolean(meta.loyaltyProgramDraft) ||
    Boolean(graph.rule);
  const validated = meta.validationResult?.ok === true;
  return hasDraft && !validated && graph.phase === 'verify';
}

function needsDraftPersist(graph, ctx = {}) {
  const meta = ctx?.metadata ?? {};
  return (
    (meta.validationResult?.ok === true || Boolean(graph.rule)) &&
    !meta.loyaltyProgramDraft &&
    !meta.loyaltyProgramDraftArtifact &&
    graph.phase === 'act'
  );
}

function needsOwnerReview(graph, ctx = {}) {
  const meta = ctx?.metadata ?? {};
  return Boolean(meta.loyaltyProgramDraft || meta.loyaltyProgramDraftArtifact) && graph.phase !== 'terminal';
}

function needsReplan(graph) {
  return graph.reanalysisRequired === true || hasUnresolvedConflicts(graph);
}

/** @type {ReasoningCapabilityDef[]} */
export const REASONING_CAPABILITIES = [
  {
    id: 'loyalty.replan_from_conflicts',
    priority: 110,
    phases: ['observe', 'model', 'plan', 'act', 'verify'],
    virtual: true,
    preconditions: (graph) => needsReplan(graph),
  },
  {
    id: 'loyalty.full_card_processing',
    priority: 120,
    phases: ['observe', 'model', 'plan'],
    virtual: true,
    score: (graph) => (Features.phase2.reasoningPrimary ? scoreFullCardProcessing(graph) : 0),
    preconditions: (graph) =>
      Features.phase2.reasoningPrimary &&
      !needsReplan(graph) &&
      scoreFullCardProcessing(graph) > 0,
  },
  {
    id: 'loyalty.analyze_attachment',
    priority: 100,
    phases: ['observe', 'model'],
    preconditions: (graph) =>
      !needsReplan(graph) &&
      (hasUnprocessedAttachments(graph) || !(graph.perceptions?.length)),
  },
  {
    id: 'loyalty.load_store_context',
    priority: 92,
    phases: ['observe', 'model', 'plan'],
    preconditions: (graph, ctx) => !needsReplan(graph) && needsStoreContext(graph, ctx),
  },
  {
    id: 'loyalty.extract_topology',
    priority: 108,
    phases: ['observe', 'model'],
    virtual: true,
    preconditions: (graph) =>
      !needsReplan(graph) &&
      missingTopologyWithEvidence(graph) &&
      !needsAnalyzeBeforeExtract(graph),
  },
  {
    id: 'loyalty.infer_requirements',
    priority: 80,
    phases: ['model', 'plan'],
    preconditions: (graph, ctx) =>
      !needsReplan(graph) && Boolean(graph.topology) && missingLoyaltyRule(graph),
  },
  {
    id: 'loyalty.run_topology_plan',
    priority: 85,
    phases: ['plan', 'act', 'verify'],
    virtual: true,
    preconditions: (graph, ctx) => !needsReplan(graph) && canDeferToTopologyPlan(graph, ctx),
  },
  {
    id: 'loyalty.generate_draft',
    priority: 70,
    phases: ['plan', 'act'],
    preconditions: (graph, ctx) =>
      !needsReplan(graph) && Boolean(graph.rule) && missingLoyaltyDraft(graph, ctx),
  },
  {
    id: 'loyalty.validate_draft',
    priority: 65,
    phases: ['verify'],
    preconditions: (graph, ctx) => !needsReplan(graph) && needsDraftValidation(graph, ctx),
  },
  {
    id: 'loyalty.persist_draft',
    priority: 62,
    phases: ['act', 'verify'],
    preconditions: (graph, ctx) => !needsReplan(graph) && needsDraftPersist(graph, ctx),
  },
  {
    id: 'loyalty.present_review',
    priority: 60,
    phases: ['verify', 'remember'],
    preconditions: (graph, ctx) => !needsReplan(graph) && needsOwnerReview(graph, ctx),
  },
];

/**
 * @param {UnifiedEvidenceGraph} graph
 * @param {Record<string, unknown>} [ctx]
 */
function filterEligibleCapabilities(graph, ctx = {}) {
  const phase = graph.phase ?? 'observe';
  return REASONING_CAPABILITIES.filter((cap) => {
    const phaseOk =
      cap.phases.includes(phase) ||
      phase === 'observe' ||
      (phase === 'model' && cap.phases.includes('observe'));
    if (!phaseOk) return false;
    try {
      return cap.preconditions(graph, ctx);
    } catch {
      return false;
    }
  }).sort((a, b) => resolveCapabilityPriority(b, graph, ctx) - resolveCapabilityPriority(a, graph, ctx));
}

/**
 * Rank all eligible capabilities (proactive planning).
 *
 * @param {UnifiedEvidenceGraph} graph
 * @param {Record<string, unknown>} [ctx]
 */
export function selectRankedCapabilities(graph, ctx = {}) {
  return filterEligibleCapabilities(graph, ctx);
}

/**
 * @param {UnifiedEvidenceGraph} graph
 * @param {Record<string, unknown>} [ctx]
 */
export function selectNextCapability(graph, ctx = {}) {
  return selectRankedCapabilities(graph, ctx)[0] ?? null;
}

/**
 * @param {string} capabilityId
 */
export function getCapabilityExecutor(capabilityId) {
  if (
    capabilityId === 'loyalty.extract_topology' ||
    capabilityId === 'loyalty.full_card_processing' ||
    capabilityId === 'loyalty.run_topology_plan' ||
    capabilityId === 'loyalty.replan_from_conflicts'
  ) {
    return null;
  }
  return getExecutor(capabilityId);
}

export function listReasoningCapabilities() {
  return REASONING_CAPABILITIES.map((c) => ({
    id: c.id,
    priority: c.priority,
    phases: c.phases,
    virtual: c.virtual === true,
  }));
}
