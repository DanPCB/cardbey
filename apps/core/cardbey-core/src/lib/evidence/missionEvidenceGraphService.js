/**
 * Phase 1 — Mission Evidence Graph service (authoritative write target for loyalty).
 *
 * Dual-writes to mission metadata during migration. When PHASE1_GRAPH_PRIMARY=true,
 * deprecated parallel fields are not written on new graph mutations.
 */

import crypto from 'node:crypto';
import { randomUUID } from 'node:crypto';
import { Features } from '../../config/features.js';
import { readMetadata, writeMetadata } from '../persistence/metadataWriter.js';
import {
  asMissionEvidenceGraph,
  appendEvidenceNode,
  createMissionEvidenceGraph,
  recordEvidenceDecision,
  recordEvidenceConflict,
  summarizeMissionEvidenceGraph,
} from '../mission/missionEvidenceGraph.js';
import {
  attachLoyaltyEvidenceSignals,
  buildVisualGridEvidenceFromTopology,
  buildSemanticTextEvidence,
} from '../loyalty/loyaltyVisualGridEvidence.js';
import { computeTopologyHash } from '../mission/topologyHash.js';
import { handleNewEvidence, isContractFrozen } from './graphConflictService.js';
import { hasAuthoritativeLoyaltyTopology } from '../loyalty/loyaltyContractDiagnostics.js';

/** @typedef {'observe' | 'model' | 'plan' | 'act' | 'verify' | 'remember' | 'terminal'} GraphPhase */

/**
 * @typedef {{
 *   id?: string;
 *   attachmentId?: string;
 *   evidenceId?: string;
 *   contentHash?: string;
 *   mimeType?: string;
 *   title?: string;
 *   at?: string;
 * }} AttachmentRef
 */

/**
 * @typedef {{
 *   id?: string;
 *   type: string;
 *   source?: string;
 *   confidence?: number;
 *   data?: Record<string, unknown>;
 *   at?: string;
 * }} PerceptionRecord
 */

/**
 * @typedef {{
 *   timestamp: string;
 *   message: string;
 *   phase?: GraphPhase;
 *   metadata?: Record<string, unknown>;
 * }} ReasoningLine
 */

/**
 * @typedef {import('../mission/missionEvidenceGraph.js').MissionEvidenceGraph & {
 *   attachments?: AttachmentRef[];
 *   perceptions?: PerceptionRecord[];
 *   rule?: Record<string, unknown> | null;
 *   visualGrid?: Record<string, unknown> | null;
 *   semanticText?: Record<string, unknown> | null;
 *   reasoningTrace?: ReasoningLine[];
 *   phase?: GraphPhase;
 *   frozenSnapshotId?: string | null;
 *   contract?: Record<string, unknown> | null;
 *   executionGraph?: Record<string, unknown> | null;
 *   outcome?: Record<string, unknown> | null;
 *   metadataHash?: string | null;
 *   reanalysisRequired?: boolean;
 * }} UnifiedEvidenceGraph
 */

export const DEPRECATED_GRAPH_METADATA_KEYS = Object.freeze([
  'preseededDraft',
  'attachmentAnalysis',
  'loyaltyProgressiveArtifact',
]);

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
 * @param {unknown} value
 * @returns {UnifiedEvidenceGraph}
 */
export function normalizeToUnifiedGraph(value) {
  const base = asMissionEvidenceGraph(value) ?? createMissionEvidenceGraph();
  const g = /** @type {UnifiedEvidenceGraph} */ (base);
  if (!Array.isArray(g.attachments)) g.attachments = [];
  if (!Array.isArray(g.perceptions)) g.perceptions = [];
  if (!Array.isArray(g.reasoningTrace)) g.reasoningTrace = [];
  if (!g.phase) g.phase = 'observe';
  if (typeof g.version !== 'number' || g.version < 1) g.version = 1;
  return g;
}

/**
 * @param {UnifiedEvidenceGraph} graph
 */
export function computeGraphMetadataHash(graph) {
  const payload = JSON.stringify({
    graphId: graph.graphId,
    version: graph.version,
    evidenceId: graph.evidenceId,
    topologyHash: graph.topology ? computeTopologyHash(graph.topology) : null,
    perceptionCount: graph.perceptions?.length ?? 0,
    decisionCount: graph.decisions?.length ?? 0,
    conflictCount: graph.conflicts?.length ?? 0,
    phase: graph.phase,
  });
  return crypto.createHash('sha256').update(payload).digest('hex');
}

/**
 * @param {string} missionId
 */
export async function loadGraphByMission(missionId) {
  const mid = pickString(missionId);
  if (!mid) return null;
  const meta = await readMetadata(mid);
  if (!meta || typeof meta !== 'object') return null;
  if (!meta.missionEvidenceGraph) return null;
  const graph = asMissionEvidenceGraph(meta.missionEvidenceGraph);
  if (!graph) return null;
  return normalizeToUnifiedGraph(graph);
}

/**
 * @param {string} missionId
 * @param {Record<string, unknown>} [intakeBundle]
 * @param {Record<string, unknown> | null} [attachmentAnalysis]
 */
export async function initializeFromIntake(missionId, intakeBundle = {}, attachmentAnalysis = null) {
  const evidenceId = pickString(
    intakeBundle?.evidenceView?.evidenceId,
    intakeBundle?.evidenceId,
    attachmentAnalysis?.evidenceId,
  );
  const graph = normalizeToUnifiedGraph(
    createMissionEvidenceGraph({
      missionId,
      evidenceId,
      domain: 'loyalty',
      version: 1,
    }),
  );
  graph.phase = 'observe';
  graph.evidenceId = evidenceId || graph.evidenceId;

  const snapshot = intakeBundle?.snapshot ?? {};
  ensureImageAttachmentOnGraph(graph, intakeBundle, attachmentAnalysis);
  const imageRef = pickString(
    intakeBundle?.imageRef,
    snapshot.imageRef,
    attachmentAnalysis?.imageRef,
    attachmentAnalysis?.imageUrl,
    attachmentAnalysis?.imageDataUrl,
  );
  if (imageRef) {
    graph.imageRef = imageRef;
  }
  if (snapshot.ocrText) {
    appendPerception(graph, {
      type: 'ocr',
      source: 'intakeEvidenceBarrier',
      confidence: Number(snapshot.confidence) || 0.5,
      data: {
        ocrTextLength: String(snapshot.ocrText).length,
        ocrStatus: snapshot.ocrStatus ?? 'ok',
        ocrProvider: snapshot.ocrProvider ?? null,
      },
    });
  }

  if (attachmentAnalysis) {
    await enrichGraphFromAttachmentAnalysis(graph, attachmentAnalysis);
  }

  bumpGraphVersion(graph, 'intake_initialize');
  return graph;
}

/**
 * @param {string} missionId
 * @param {Record<string, unknown>} [intakeBundle]
 * @param {Record<string, unknown> | null} [attachmentAnalysis]
 */
export async function getOrCreateEvidenceGraph(missionId, intakeBundle, attachmentAnalysis = null) {
  const existing = await loadGraphByMission(missionId);
  if (existing) return existing;
  if (intakeBundle || attachmentAnalysis) {
    return initializeFromIntake(missionId, intakeBundle ?? {}, attachmentAnalysis);
  }
  return normalizeToUnifiedGraph(
    createMissionEvidenceGraph({ missionId, domain: 'loyalty', version: 1 }),
  );
}

/**
 * @param {UnifiedEvidenceGraph} graph
 * @param {PerceptionRecord} perception
 */
export function appendPerception(graph, perception) {
  const record = {
    id: perception.id ?? `per_${randomUUID().slice(0, 10)}`,
    type: perception.type,
    source: perception.source ?? 'unknown',
    confidence: perception.confidence,
    data: perception.data ?? {},
    at: perception.at ?? nowIso(),
  };
  graph.perceptions.push(record);
  appendEvidenceNode(graph, {
    kind: 'observation',
    source: `perception.${record.type}`,
    summary: `Perception: ${record.type}`,
    confidence: record.confidence,
    data: record.data,
  });
  appendReasoningTrace(graph, `Perception added: ${record.type}`, { perceptionId: record.id });
  bumpGraphVersion(graph, `perception:${record.type}`);
  return record;
}

/**
 * @param {UnifiedEvidenceGraph} graph
 * @param {import('../mission/missionEvidenceGraph.js').EvidenceDecision & { type?: string; fallback?: boolean }} decision
 */
export function recordGraphDecision(graph, decision) {
  recordEvidenceDecision(graph, decision);
  appendReasoningTrace(graph, `Decision: ${decision.answer}`, {
    question: decision.question,
    rationale: decision.rationale,
    type: decision.type,
  });
  bumpGraphVersion(graph, `decision:${decision.type ?? 'generic'}`);
  return graph.decisions[graph.decisions.length - 1];
}

/**
 * @param {UnifiedEvidenceGraph} graph
 * @param {string} message
 * @param {Record<string, unknown>} [metadata]
 */
export function appendReasoningTrace(graph, message, metadata = {}) {
  if (!Array.isArray(graph.reasoningTrace)) graph.reasoningTrace = [];
  graph.reasoningTrace.push({
    timestamp: nowIso(),
    message: String(message ?? '').trim(),
    phase: graph.phase,
    metadata,
  });
  graph.updatedAt = nowIso();
}

/**
 * @param {UnifiedEvidenceGraph} graph
 * @param {GraphPhase} phase
 */
export function setGraphPhase(graph, phase) {
  graph.phase = phase;
  appendReasoningTrace(graph, `Phase → ${phase}`);
  bumpGraphVersion(graph, `phase:${phase}`);
}

function bumpGraphVersion(graph, reason) {
  graph.version = (graph.version ?? 1) + 1;
  graph.updatedAt = nowIso();
  graph.metadataHash = computeGraphMetadataHash(graph);
  if (Features.phase1.traceVersionBumps && process.env.NODE_ENV !== 'production') {
    appendReasoningTrace(graph, `Graph version ${graph.version} (${reason})`, { internal: true });
  }
}

/**
 * Ensure graph has an image attachment URL for visual grid CV.
 *
 * @param {UnifiedEvidenceGraph} graph
 * @param {Record<string, unknown>} [intakeBundle]
 * @param {Record<string, unknown> | null} [attachmentAnalysis]
 */
export function ensureImageAttachmentOnGraph(graph, intakeBundle = {}, attachmentAnalysis = null) {
  const imageRef = pickString(
    intakeBundle?.imageRef,
    attachmentAnalysis?.imageRef,
    attachmentAnalysis?.imageUrl,
    attachmentAnalysis?.imageDataUrl,
    intakeBundle?.snapshot?.imageRef,
  );
  if (!imageRef) return graph;

  if (!Array.isArray(graph.attachments)) graph.attachments = [];
  const already = graph.attachments.some((a) => {
    const url = pickString(a?.url, a?.imageUrl, a?.imageDataUrl);
    return url === imageRef;
  });
  if (already) return graph;

  graph.attachments.push({
    attachmentId:
      pickString(
        attachmentAnalysis?.attachmentId,
        intakeBundle?.evidenceView?.attachmentId,
      ) ?? undefined,
    evidenceId:
      pickString(attachmentAnalysis?.evidenceId, intakeBundle?.evidenceView?.evidenceId, graph.evidenceId) ??
      undefined,
    url: imageRef,
    type: 'image',
    mimeType:
      pickString(attachmentAnalysis?.mimeType, intakeBundle?.snapshot?.uploadMetadata?.mimeType) ??
      'image/jpeg',
    at: nowIso(),
  });
  return graph;
}

/**
 * @param {UnifiedEvidenceGraph} graph
 * @param {Record<string, unknown>} attachmentAnalysis
 */
export async function enrichGraphFromAttachmentAnalysis(graph, attachmentAnalysis) {
  const draft =
    attachmentAnalysis.preseededDraft && typeof attachmentAnalysis.preseededDraft === 'object'
      ? attachmentAnalysis.preseededDraft
      : null;

  if (attachmentAnalysis.attachmentId || attachmentAnalysis.evidenceId) {
    graph.attachments.push({
      id: pickString(attachmentAnalysis.attachmentId) ?? undefined,
      attachmentId: pickString(attachmentAnalysis.attachmentId) ?? undefined,
      evidenceId: pickString(attachmentAnalysis.evidenceId, graph.evidenceId) ?? undefined,
      contentHash: pickString(attachmentAnalysis.contentHash) ?? undefined,
      url: pickString(
        attachmentAnalysis.imageUrl,
        attachmentAnalysis.imageDataUrl,
        attachmentAnalysis.imageRef,
      ) ?? undefined,
      mimeType: pickString(attachmentAnalysis.mimeType) ?? 'image/jpeg',
      type: 'image',
      at: nowIso(),
    });
  }

  const cardTopology = draft?.cardTopology ?? attachmentAnalysis.cardTopology ?? null;
  if (cardTopology && typeof cardTopology === 'object') {
    graph.topology = cardTopology;
    const visual = buildVisualGridEvidenceFromTopology(cardTopology);
    if (visual) {
      graph.visualGrid = visual;
      appendPerception(graph, {
        type: 'visual_grid',
        source: 'loyaltyVisualGridEvidence',
        confidence: visual.confidence,
        data: { rows: visual.rows, columns: visual.columns },
      });
    }
  }

  const ocrText = pickString(attachmentAnalysis.ocrText, draft?.ocrText);
  if (ocrText) {
    const semantic = buildSemanticTextEvidence({
      ocrText,
      purchaseItem: draft?.purchaseItem ?? draft?.rule?.purchaseItem ?? null,
      rewardItem: draft?.reward ?? draft?.rule?.rewardItem ?? null,
      footerText: draft?.cardFooterText ?? cardTopology?.footerText ?? null,
    });
    graph.semanticText = semantic;
    appendPerception(graph, {
      type: 'semantic_text',
      source: 'loyalty.semantic_text',
      confidence: semantic.confidence,
      data: { labelCount: semantic.labels?.length ?? 0 },
    });
  }

  if (draft?.rule && typeof draft.rule === 'object') {
    graph.rule = draft.rule;
  }

  if (draft) {
    attachLoyaltyEvidenceSignals(draft, {
      visualTopology: graph.visualGrid ?? undefined,
      semanticRule: graph.rule ?? undefined,
    });
  }

  if (graph.topology) {
    recordGraphDecision(graph, {
      type: 'topology_extraction',
      question: 'What stamp grid structure does the uploaded card use?',
      answer: `${graph.topology.rows}×${graph.topology.columns}`,
      rationale: String(graph.topology.source ?? 'attachment_analysis'),
      confidence: Number(graph.topology.confidence) || 0.75,
      source: 'missionEvidenceGraphService.enrichGraphFromAttachmentAnalysis',
    });
  }

  graph.phase = graph.topology ? 'model' : 'observe';
  return graph;
}

/**
 * Resolve attachment analysis from mission metadata (and nested intent parameters).
 *
 * @param {Record<string, unknown> | null | undefined} metadata
 */
export function resolveAttachmentAnalysisFromMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object') return null;
  const direct =
    metadata.attachmentAnalysis && typeof metadata.attachmentAnalysis === 'object'
      ? metadata.attachmentAnalysis
      : null;
  if (direct) return direct;
  const intentParams =
    metadata.intentParameters && typeof metadata.intentParameters === 'object'
      ? metadata.intentParameters
      : null;
  if (intentParams?.attachmentAnalysis && typeof intentParams.attachmentAnalysis === 'object') {
    return intentParams.attachmentAnalysis;
  }
  const preseeded =
    metadata.preseededDraft && typeof metadata.preseededDraft === 'object'
      ? metadata.preseededDraft
      : null;
  if (preseeded?.cardTopology || preseeded?.rule) {
    return {
      artifactType: 'loyalty_card',
      preseededDraft: preseeded,
      evidenceId: pickString(preseeded.evidenceId, metadata.evidenceId) || undefined,
      attachmentId: pickString(preseeded.attachmentId, metadata.attachmentId) || undefined,
      imageUrl: pickString(preseeded.imageAssetId, metadata.imageRef) || undefined,
    };
  }
  return null;
}

/**
 * Seed mission evidence graph from loyalty intake metadata when topology is missing.
 * Idempotent when authoritative topology already exists on the graph.
 *
 * @param {string} missionId
 * @param {Record<string, unknown>} [metadata]
 */
export async function seedMissionGraphFromLoyaltyMetadata(missionId, metadata = {}) {
  if (!Features.phase1.graphWriteTarget) return null;
  const mid = pickString(missionId);
  if (!mid) return null;

  const intakeEvidence =
    metadata.intakeEvidence && typeof metadata.intakeEvidence === 'object'
      ? metadata.intakeEvidence
      : null;
  const preseededDraftBase =
    metadata.preseededDraft && typeof metadata.preseededDraft === 'object'
      ? metadata.preseededDraft
      : null;

  let attachmentAnalysis = resolveAttachmentAnalysisFromMetadata(metadata);
  try {
    const { ensureLoyaltyAttachmentAnalysisWithTopology } = await import(
      '../intake/intakeAttachmentBinding.js'
    );
    attachmentAnalysis = await ensureLoyaltyAttachmentAnalysisWithTopology(attachmentAnalysis, {
      evidenceId: pickString(
        metadata.evidenceId,
        intakeEvidence?.evidenceId,
        preseededDraftBase?.evidenceId,
        attachmentAnalysis?.evidenceId,
        attachmentAnalysis?.preseededDraft?.evidenceId,
      ),
      missionId: mid,
      storeId: pickString(metadata.storeId, preseededDraftBase?.storeId) ?? null,
      imageRef: pickString(
        metadata.imageRef,
        intakeEvidence?.imageRef,
        preseededDraftBase?.imageAssetId,
        attachmentAnalysis?.imageUrl,
        attachmentAnalysis?.imageDataUrl,
        attachmentAnalysis?.preseededDraft?.imageAssetId,
      ),
      attachmentId: pickString(
        metadata.attachmentId,
        preseededDraftBase?.attachmentId,
        attachmentAnalysis?.attachmentId,
      ),
    });
  } catch (err) {
    console.warn(
      '[missionEvidenceGraphService] ensureLoyaltyAttachmentAnalysisWithTopology failed (non-fatal):',
      err instanceof Error ? err.message : err,
    );
  }

  const preseededDraft =
    attachmentAnalysis?.preseededDraft && typeof attachmentAnalysis.preseededDraft === 'object'
      ? attachmentAnalysis.preseededDraft
      : preseededDraftBase;

  const hasTopologySeed = Boolean(
    hasAuthoritativeLoyaltyTopology(attachmentAnalysis?.preseededDraft?.cardTopology) ||
      hasAuthoritativeLoyaltyTopology(attachmentAnalysis?.cardTopology) ||
      hasAuthoritativeLoyaltyTopology(preseededDraft?.cardTopology),
  );
  if (!hasTopologySeed && !attachmentAnalysis && !intakeEvidence) {
    return loadGraphByMission(mid);
  }

  let graph = await loadGraphByMission(mid);
  let needsPersist = false;

  if (!graph) {
    graph = await getOrCreateEvidenceGraph(mid, intakeEvidence ?? {}, attachmentAnalysis);
    needsPersist = hasAuthoritativeLoyaltyTopology(graph.topology);
  }

  if (hasAuthoritativeLoyaltyTopology(graph.topology) && !needsPersist) {
    return graph;
  }

  const enrichedAnalysis = attachmentAnalysis
    ? {
        ...attachmentAnalysis,
        preseededDraft: mergeGraphPreseedIntoPriors(
          attachmentAnalysis.preseededDraft,
          preseededDraft ?? {},
        ),
      }
    : preseededDraft
      ? {
          artifactType: 'loyalty_card',
          preseededDraft,
          evidenceId: pickString(preseededDraft.evidenceId, metadata.evidenceId) || undefined,
          attachmentId: pickString(preseededDraft.attachmentId, metadata.attachmentId) || undefined,
          imageUrl: pickString(preseededDraft.imageAssetId, metadata.imageRef) || undefined,
        }
      : null;

  if (intakeEvidence || enrichedAnalysis) {
    ensureImageAttachmentOnGraph(graph, intakeEvidence ?? {}, enrichedAnalysis);
  }
  if (enrichedAnalysis) {
    await enrichGraphFromAttachmentAnalysis(graph, enrichedAnalysis);
    needsPersist = hasAuthoritativeLoyaltyTopology(graph.topology);
  }

  if (needsPersist && hasAuthoritativeLoyaltyTopology(graph.topology)) {
    appendReasoningTrace(graph, 'Seeded loyalty topology from intake metadata', {
      source: 'seedMissionGraphFromLoyaltyMetadata',
      rows: graph.topology?.rows,
      columns: graph.topology?.columns,
    });
    await persistGraph(graph, { missionId: mid });
  }

  return graph;
}

/**
 * Process intake bundle into mission graph (intake → graph wiring).
 *
 * @param {string} missionId
 * @param {Record<string, unknown>} intakeBundle
 * @param {Record<string, unknown> | null} [attachmentAnalysis]
 */
export async function processIntakeToGraph(missionId, intakeBundle, attachmentAnalysis = null) {
  if (!Features.phase1.graphWriteTarget) return null;
  const mid = pickString(missionId);
  if (!mid) return null;

  const graph = await getOrCreateEvidenceGraph(mid, intakeBundle, attachmentAnalysis);
  if (attachmentAnalysis) {
    await enrichGraphFromAttachmentAnalysis(graph, attachmentAnalysis);
  }
  await persistGraph(graph);
  return graph;
}

/**
 * Intake path when graph may already exist (new upload / re-analysis).
 *
 * @param {string} missionId
 * @param {Record<string, unknown>} intakeBundle
 * @param {Record<string, unknown> | null} [attachmentAnalysis]
 */
export async function applyIntakeEvidenceToGraph(missionId, intakeBundle, attachmentAnalysis = null) {
  if (!Features.phase1.graphWriteTarget) return null;
  const mid = pickString(missionId);
  if (!mid) return null;

  const existing = await loadGraphByMission(mid);
  if (!existing) {
    return processIntakeToGraph(mid, intakeBundle, attachmentAnalysis);
  }

  const metadata = await readMetadata(mid);
  const frozen = isContractFrozen(existing, metadata);
  const attachmentRef = {
    attachmentId: pickString(
      attachmentAnalysis?.attachmentId,
      intakeBundle?.evidenceView?.attachmentId,
    ) || undefined,
    evidenceId: pickString(
      attachmentAnalysis?.evidenceId,
      intakeBundle?.evidenceView?.evidenceId,
      existing.evidenceId,
    ) || undefined,
    contentHash: pickString(attachmentAnalysis?.contentHash, intakeBundle?.contentHash) || undefined,
  };

  let graph = existing;

  if (Features.phase1.graphConflictDetection && frozen) {
    const conflictResult = await handleNewEvidence(mid, attachmentRef);
    graph = conflictResult?.graph ?? existing;
  } else {
    if (attachmentRef.evidenceId || attachmentRef.attachmentId) {
      appendPerception(graph, {
        type: 'new_attachment',
        source: 'intakeEvidenceBarrier',
        confidence: 1,
        data: attachmentRef,
      });
    }
    const snapshot = intakeBundle?.snapshot ?? {};
    if (snapshot.ocrText) {
      appendPerception(graph, {
        type: 'ocr',
        source: 'intakeEvidenceBarrier',
        confidence: Number(snapshot.confidence) || 0.5,
        data: {
          ocrTextLength: String(snapshot.ocrText).length,
          ocrStatus: snapshot.ocrStatus ?? 'ok',
          ocrProvider: snapshot.ocrProvider ?? null,
        },
      });
    }
    if (attachmentAnalysis) {
      ensureImageAttachmentOnGraph(graph, intakeBundle, attachmentAnalysis);
      await enrichGraphFromAttachmentAnalysis(graph, attachmentAnalysis);
    } else {
      ensureImageAttachmentOnGraph(graph, intakeBundle, null);
    }
    await persistGraph(graph, { missionId: mid });
  }

  if (attachmentAnalysis && frozen && graph) {
    await enrichGraphFromAttachmentAnalysis(graph, attachmentAnalysis);
    await persistGraph(graph, { missionId: mid });
  }

  return graph;
}

/**
 * Dual-write graph to mission metadata.
 *
 * @param {UnifiedEvidenceGraph} graph
 * @param {{ skipDeprecatedDualWrite?: boolean; missionId?: string }} [options]
 */
export async function persistGraph(graph, options = {}) {
  const missionId = pickString(options.missionId, graph.missionId);
  if (!missionId) return graph;

  graph.missionId = missionId;
  graph.metadataHash = computeGraphMetadataHash(graph);
  graph.updatedAt = nowIso();

  const summary = summarizeMissionEvidenceGraph(graph);
  /** @type {Record<string, unknown>} */
  const patch = {
    missionEvidenceGraph: graph,
    missionEvidenceSummary: summary,
    evidenceGraphVersion: graph.version,
    evidenceGraphPhase: graph.phase,
    evidenceGraphId: graph.graphId,
  };

  const dualWrite = Features.phase1.graphWriteTarget && !Features.phase1.graphPrimary;
  if (dualWrite && !options.skipDeprecatedDualWrite) {
    if (graph.topology || graph.rule) {
      patch.preseededDraft = {
        cardTopology: graph.topology ?? undefined,
        rule: graph.rule ?? undefined,
        visualGridEvidence: graph.visualGrid ?? undefined,
        semanticTextEvidence: graph.semanticText ?? undefined,
        evidenceId: graph.evidenceId ?? undefined,
        graphVersion: graph.version,
        _fromGraph: true,
      };
    }
  }

  if (Features.phase1.graphPrimary) {
    for (const key of DEPRECATED_GRAPH_METADATA_KEYS) {
      patch[key] = undefined;
    }
  }

  await writeMetadata(missionId, patch);
  return graph;
}

/**
 * @param {string} missionId
 * @param {string} message
 * @param {Record<string, unknown>} [metadata]
 */
export async function appendMissionReasoningToGraph(missionId, message, metadata = {}) {
  if (!Features.phase1.consolidatedReasoningTrace) return null;
  const mid = pickString(missionId);
  if (!mid) return null;
  const graph = (await loadGraphByMission(mid)) ??
    normalizeToUnifiedGraph(createMissionEvidenceGraph({ missionId: mid, domain: 'loyalty' }));
  appendReasoningTrace(graph, message, metadata);
  await persistGraph(graph, { missionId: mid });
  return graph;
}

/**
 * Guard: reject new deprecated metadata writes when graph is primary.
 *
 * @param {string[]} keys
 */
export function assertNoDeprecatedMetadataWrites(keys) {
  if (!Features.phase1.graphPrimary) return;
  const blocked = keys.filter((k) => DEPRECATED_GRAPH_METADATA_KEYS.includes(k));
  if (blocked.length > 0) {
    throw new Error(
      `PHASE1_GRAPH_PRIMARY: deprecated metadata write blocked for keys: ${blocked.join(', ')}`,
    );
  }
}

/**
 * Merge graph-backed topology/rule into stage priors (graph authoritative fields win).
 *
 * @param {Record<string, unknown> | null | undefined} priorsDraft
 * @param {Record<string, unknown> | null | undefined} graphDraft
 */
export function mergeGraphPreseedIntoPriors(priorsDraft, graphDraft) {
  const priors = priorsDraft && typeof priorsDraft === 'object' ? { ...priorsDraft } : {};
  const graph = graphDraft && typeof graphDraft === 'object' ? graphDraft : {};
  const merged = { ...priors, ...graph };

  if (hasAuthoritativeLoyaltyTopology(graph.cardTopology)) {
    merged.cardTopology = graph.cardTopology;
    merged.extractedFromImage = graph.extractedFromImage ?? priors.extractedFromImage ?? true;
    merged.layoutSource = graph.cardTopology?.source ?? priors.layoutSource;
    const src = String(graph.cardTopology?.source ?? '').trim();
    if (src && !['APPROVED', 'OWNER_DEFINED', 'OWNER_CONFIRMED', 'PUBLISHED'].includes(src)) {
      merged.topologyReviewRequired =
        graph.topologyReviewRequired ?? priors.topologyReviewRequired ?? true;
    }
  } else if (priors.cardTopology) {
    merged.cardTopology = priors.cardTopology;
  }

  if (graph.rule && typeof graph.rule === 'object') {
    merged.rule = graph.rule;
  } else if (priors.rule) {
    merged.rule = priors.rule;
  }

  return merged;
}

/**
 * Legacy compatibility view for stages still reading preseededDraft / attachmentAnalysis.
 *
 * @param {UnifiedEvidenceGraph | unknown} graphRaw
 */
export function graphToLegacyEvidenceView(graphRaw) {
  const g = normalizeToUnifiedGraph(graphRaw);
  const preseededDraft = {
    cardTopology: g.topology ?? undefined,
    rule: g.rule ?? undefined,
    visualGridEvidence: g.visualGrid ?? undefined,
    semanticTextEvidence: g.semanticText ?? undefined,
    evidenceId: g.evidenceId ?? undefined,
    graphVersion: g.version,
    extractedFromImage: Boolean(g.topology),
    topologyReviewRequired:
      g.topology?.reviewRequired === true ||
      (Boolean(g.topology) &&
        !['APPROVED', 'OWNER_DEFINED', 'OWNER_CONFIRMED', 'PUBLISHED'].includes(
          String(g.topology?.source ?? ''),
        )),
    _fromGraph: true,
  };
  const ocrPerception = (g.perceptions ?? []).find((p) => p.type === 'ocr');
  const ocrText =
    pickString(g.semanticText?.ocrText) ||
    (ocrPerception?.data?.ocrTextLength
      ? String(ocrPerception.data.ocrTextLength)
      : '');
  const attachmentAnalysis = {
    evidenceId: g.evidenceId ?? undefined,
    preseededDraft,
    artifactType: 'loyalty_card',
    confidence:
      Number(ocrPerception?.confidence) ||
      Number(g.topology?.confidence) ||
      (g.topology ? 0.85 : 0.5),
    ocrText: ocrText || undefined,
    visualHints: g.visualGrid ?? undefined,
    confirmedFields:
      g.rule && typeof g.rule === 'object'
        ? {
            reward: pickString(g.rule.rewardItem, g.rule.reward),
            requiredStamps: Number(g.rule.purchasesRequired ?? g.rule.stampThreshold) || undefined,
          }
        : undefined,
    _fromGraph: true,
  };
  return { preseededDraft, attachmentAnalysis, graph: g };
}

/**
 * Load graph-backed loyalty evidence for stage handlers (Phase 1 read path).
 *
 * @param {string} missionId
 */
export async function loadLoyaltyEvidenceContext(missionId) {
  if (!Features.phase1.graphWriteTarget) return null;
  const graph = await loadGraphByMission(missionId);
  if (!graph?.graphId) return null;
  return graphToLegacyEvidenceView(graph);
}

/**
 * Persist loyalty stage output back to the evidence graph.
 *
 * @param {string} missionId
 * @param {{ attachmentAnalysis?: Record<string, unknown> | null; preseededDraft?: Record<string, unknown> | null; stage?: string }} payload
 */
export async function syncLoyaltyStageToGraph(missionId, payload = {}) {
  if (!Features.phase1.graphWriteTarget) return null;
  const mid = pickString(missionId);
  if (!mid) return null;

  const graph = await getOrCreateEvidenceGraph(mid);
  if (payload.attachmentAnalysis) {
    await enrichGraphFromAttachmentAnalysis(graph, payload.attachmentAnalysis);
  }
  const draft = payload.preseededDraft;
  if (draft && typeof draft === 'object') {
    if (hasAuthoritativeLoyaltyTopology(draft.cardTopology)) {
      graph.topology = draft.cardTopology;
    } else if (!hasAuthoritativeLoyaltyTopology(graph.topology) && draft.cardTopology) {
      graph.topology = draft.cardTopology;
    }
    if (draft.rule && typeof draft.rule === 'object') {
      graph.rule = draft.rule;
    }
    if (draft.visualGridEvidence) graph.visualGrid = draft.visualGridEvidence;
    if (draft.semanticTextEvidence) graph.semanticText = draft.semanticTextEvidence;
  }
  if (payload.stage) {
    appendReasoningTrace(graph, `Loyalty stage: ${payload.stage}`, { stage: payload.stage });
  }
  await persistGraph(graph, { missionId: mid });
  return graph;
}

/**
 * Project graph fields for dashboard consumption.
 *
 * @param {unknown} graphRaw
 * @param {Record<string, unknown> | null} [metadataFallback]
 */
export function projectGraphForUi(graphRaw, metadataFallback = null) {
  const graph = normalizeToUnifiedGraph(graphRaw);
  if (!graph.graphId && !metadataFallback) return null;

  return {
    graphId: graph.graphId,
    missionId: graph.missionId,
    version: graph.version,
    phase: graph.phase,
    evidenceId: graph.evidenceId,
    topology: graph.topology ?? metadataFallback?.preseededDraft?.cardTopology ?? null,
    rule: graph.rule ?? metadataFallback?.preseededDraft?.rule ?? null,
    visualGrid: graph.visualGrid ?? null,
    semanticText: graph.semanticText ?? null,
    decisions: graph.decisions ?? [],
    conflicts: graph.conflicts ?? [],
    reasoningTrace: graph.reasoningTrace ?? [],
    outcome: graph.outcome ?? metadataFallback?.terminalMissionOutcome ?? null,
    reanalysisRequired: graph.reanalysisRequired === true,
    summary: summarizeMissionEvidenceGraph(graph),
    metadataHash: graph.metadataHash ?? null,
  };
}

let serviceSingleton = null;

export function getMissionEvidenceGraphService() {
  if (!serviceSingleton) {
    serviceSingleton = {
      getOrCreateEvidenceGraph,
      loadGraphByMission,
      processIntakeToGraph,
      applyIntakeEvidenceToGraph,
      seedMissionGraphFromLoyaltyMetadata,
      resolveAttachmentAnalysisFromMetadata,
      persistGraph,
      appendPerception,
      recordGraphDecision,
      appendReasoningTrace,
      appendMissionReasoningToGraph,
      projectGraphForUi,
      graphToLegacyEvidenceView,
      mergeGraphPreseedIntoPriors,
      loadLoyaltyEvidenceContext,
      syncLoyaltyStageToGraph,
    };
  }
  return serviceSingleton;
}

export function resetMissionEvidenceGraphServiceForTests() {
  serviceSingleton = null;
}
