/**
 * Loyalty-specific mission evidence graph builders.
 * Consolidates intake evidence, OCR topology, rules, and renderer decisions.
 */

import { hasAuthoritativeLoyaltyTopology } from '../loyalty/loyaltyContractDiagnostics.js';
import {
  appendEvidenceNode,
  asMissionEvidenceGraph,
  createMissionEvidenceGraph,
  deriveLoyaltyDecisionsFromEvidence,
  mergeMissionEvidenceGraphs,
  recordEvidenceDecision,
  summarizeMissionEvidenceGraph,
} from './missionEvidenceGraph.js';

function pickString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

/**
 * Record OCR / vision topology extraction in the evidence graph.
 *
 * @param {import('./missionEvidenceGraph.js').MissionEvidenceGraph} graph
 * @param {{
 *   ocrText?: string | null;
 *   extractionMethod?: string | null;
 *   topologyResult?: { ok?: boolean; cardTopology?: object; rule?: object; error?: string };
 *   ocrCharCount?: number;
 * }} params
 */
export function recordLoyaltyTopologyExtractionEvidence(graph, params = {}) {
  const ocrText = pickString(params.ocrText);
  const ocrCharCount = ocrText.length;

  appendEvidenceNode(graph, {
    kind: 'observation',
    source: 'loyalty.ocr',
    summary: ocrCharCount ? `OCR captured ${ocrCharCount} characters` : 'OCR returned no text',
    confidence: ocrCharCount > 20 ? 0.75 : ocrCharCount > 0 ? 0.45 : 0.2,
    data: { ocrCharCount, hasText: ocrCharCount > 0 },
  });

  const topo = params.topologyResult;
  if (topo?.ok && topo.cardTopology) {
    const cardTopology = /** @type {Record<string, unknown>} */ (topo.cardTopology);
    appendEvidenceNode(graph, {
      kind: 'inference',
      source: 'loyalty.topology',
      summary: `Topology ${cardTopology.rows}×${cardTopology.columns} via ${params.extractionMethod ?? 'unknown'}`,
      confidence: Number(cardTopology.confidence) || 0.85,
      data: {
        rows: cardTopology.rows,
        columns: cardTopology.columns,
        source: cardTopology.source,
        extractionMethod: params.extractionMethod ?? null,
        footerText: cardTopology.footerText ?? null,
        reviewRequired: cardTopology.reviewRequired === true,
      },
    });
    recordEvidenceDecision(graph, {
      question: 'What stamp grid structure does the uploaded card use?',
      answer: `${cardTopology.rows} rows × ${cardTopology.columns} columns`,
      rationale: `Extracted by ${params.extractionMethod ?? 'topology pipeline'} from OCR/vision.`,
      confidence: Number(cardTopology.confidence) || 0.85,
      source: 'loyaltyMissionEvidence.recordLoyaltyTopologyExtractionEvidence',
    });
  } else if (topo && topo.ok === false) {
    appendEvidenceNode(graph, {
      kind: 'inference',
      source: 'loyalty.topology',
      summary: `Topology extraction failed: ${topo.error ?? 'unknown'}`,
      confidence: 0.2,
      data: { error: topo.error ?? 'unknown' },
    });
  }

  return graph;
}

/**
 * Build loyalty evidence graph from vision extract + attachment context.
 *
 * @param {{
 *   missionId?: string | null;
 *   evidenceId?: string | null;
 *   ocrText?: string | null;
 *   preseededDraft?: Record<string, unknown> | null;
 *   extractionMethod?: string | null;
 *   topologyResult?: { ok?: boolean; cardTopology?: object; rule?: object; error?: string };
 *   priorGraph?: import('./missionEvidenceGraph.js').MissionEvidenceGraph | null;
 * }} params
 */
export function buildLoyaltyMissionEvidenceGraph(params = {}) {
  let graph = mergeMissionEvidenceGraphs(
    params.priorGraph ?? null,
    createMissionEvidenceGraph({
      missionId: params.missionId,
      evidenceId: params.evidenceId,
      domain: 'loyalty',
    }),
  );

  recordLoyaltyTopologyExtractionEvidence(graph, {
    ocrText: params.ocrText,
    extractionMethod: params.extractionMethod,
    topologyResult: params.topologyResult,
  });

  const draft = {
    ...(params.preseededDraft && typeof params.preseededDraft === 'object' ? params.preseededDraft : {}),
    ocrText: params.ocrText,
  };

  graph = deriveLoyaltyDecisionsFromEvidence(graph, draft);
  if (hasAuthoritativeLoyaltyTopology(draft.cardTopology)) {
    graph.topology = draft.cardTopology;
  } else if (!hasAuthoritativeLoyaltyTopology(graph.topology) && draft.cardTopology) {
    graph.topology = draft.cardTopology;
  }
  return graph;
}

/**
 * Append mission terminal outcome to evidence graph.
 *
 * @param {import('./missionEvidenceGraph.js').MissionEvidenceGraph} graph
 * @param {{
 *   status: string;
 *   missionId?: string;
 *   artifactIds?: string[];
 *   failureCode?: string | null;
 *   reconciled?: boolean;
 * }} outcome
 */
export function recordLoyaltyMissionOutcomeEvidence(graph, outcome) {
  appendEvidenceNode(graph, {
    kind: 'outcome',
    source: 'mission.execution',
    summary: `Mission ${outcome.status}${outcome.reconciled ? ' (reconciled)' : ''}`,
    data: {
      status: outcome.status,
      artifactIds: outcome.artifactIds ?? [],
      failureCode: outcome.failureCode ?? null,
      reconciled: outcome.reconciled === true,
    },
  });

  if (outcome.status === 'completed') {
    recordEvidenceDecision(graph, {
      question: 'Did the loyalty mission complete successfully?',
      answer: 'yes',
      rationale: outcome.reconciled
        ? 'Required outputs were present; mission outcome reconciled after false failure.'
        : 'Topology, rule, and draft artifact satisfied completion criteria.',
      source: 'loyaltyMissionEvidence.recordLoyaltyMissionOutcomeEvidence',
    });
  }

  return graph;
}

export const LOYALTY_EVIDENCE_SOURCE_MAP = Object.freeze({
  intake: [
    'lib/kernel/ingress/intakeEvidenceBarrier.ts',
    'lib/kernel/ingress/evidenceStore.ts',
    'lib/intake/intakeAttachmentBinding.js',
  ],
  attachmentAnalysis: ['lib/intake/attachmentAnalysis.js'],
  visionOcr: ['lib/toolExecutors/loyalty/loyaltyCardVisionExtract.js'],
  ocrTopology: ['lib/loyalty/loyaltyOcrTopologyParser.js', 'lib/loyalty/loyaltyTopologyExtraction.js'],
  visualSemantic: ['lib/loyalty/loyaltyVisualGridEvidence.js'],
  ruleInference: ['lib/loyalty/loyaltyRuleInference.js'],
  draftContract: ['lib/loyalty/loyaltyCreationContract.js', 'lib/toolExecutors/loyalty/loyaltyProgramDraft.js'],
  missionOutcome: ['lib/mission/missionExecutionOutcome.js', 'lib/mission/missionValidator.js'],
  persistence: ['lib/persistence/metadataWriter.js'],
  uiContract: ['apps/dashboard/.../normalizeLoyaltyDraft.ts', 'LoyaltyRenderingDiagnostic.tsx'],
});

/**
 * Pull mission evidence graph from topology node / stage output.
 * @param {Record<string, unknown> | null | undefined} output
 */
export function extractMissionEvidenceGraphFromOutputs(output) {
  if (!output || typeof output !== 'object') return null;
  const direct = asMissionEvidenceGraph(output.missionEvidenceGraph);
  if (direct) return direct;
  const attachment = output.attachmentAnalysis;
  if (attachment && typeof attachment === 'object') {
    return asMissionEvidenceGraph(attachment.missionEvidenceGraph);
  }
  return null;
}

/**
 * @param {import('./missionEvidenceGraph.js').MissionEvidenceGraph | null} graph
 */
export function buildMissionEvidenceMetadataPatch(graph) {
  if (!graph) return {};
  return {
    missionEvidenceGraph: graph,
    missionEvidenceSummary: summarizeMissionEvidenceGraph(graph),
  };
}
