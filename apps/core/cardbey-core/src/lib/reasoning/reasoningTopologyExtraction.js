/**
 * Phase 2 — visual + OCR fusion topology extraction into the evidence graph.
 */

import { hasAuthoritativeLoyaltyTopology } from '../loyalty/loyaltyContractDiagnostics.js';
import { extractFromGraph } from '../loyalty/loyaltyVisualGridEvidence.js';
import { parseFromGraph } from '../loyalty/loyaltyOcrTopologyParser.js';
import { fuseTopologyResults } from '../loyalty/topologyFusion.js';
import { buildVisualGridEvidenceFromTopology } from '../loyalty/loyaltyVisualGridEvidence.js';
import {
  appendPerception,
  appendReasoningTrace,
  enrichGraphFromAttachmentAnalysis,
  recordGraphDecision,
} from '../evidence/missionEvidenceGraphService.js';

function pickString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

/**
 * @param {import('../evidence/missionEvidenceGraphService.js').UnifiedEvidenceGraph} graph
 */
function markAttachmentsProcessed(graph) {
  for (const attachment of graph.attachments ?? []) {
    if (attachment && typeof attachment === 'object') {
      attachment.perceptionProcessed = true;
    }
  }
}

function isVisualPrimary(visual) {
  return (
    visual?.success === true &&
    visual?.cardTopology &&
    hasAuthoritativeLoyaltyTopology(visual.cardTopology) &&
    Number(visual.confidence) > 0.55
  );
}

function applyFusedTopology(graph, fused, visualResult, ocrResult) {
  graph.topology = fused.topology;
  if (fused.rule) graph.rule = fused.rule;

  const visual = buildVisualGridEvidenceFromTopology(fused.topology);
  if (visual) graph.visualGrid = visual;

  appendPerception(graph, {
    type: 'topology_fusion',
    source: 'reasoningTopologyExtraction',
    confidence: fused.confidence,
    data: {
      rows: fused.topology.rows,
      columns: fused.topology.columns,
      stampThreshold: fused.stampThreshold,
      visualSource: visualResult.source,
      ocrSource: ocrResult.source,
      visualPrimary: isVisualPrimary(visualResult),
    },
  });

  const thresholdLabel = fused.stampThreshold
    ? `${fused.stampThreshold}+1`
    : `${fused.topology.rows}×${fused.topology.columns}`;
  recordGraphDecision(graph, {
    type: 'topology_extraction',
    question: 'What stamp grid structure does the card use?',
    answer: `${fused.topology.rows}×${fused.topology.columns} • ${thresholdLabel}`,
    rationale: isVisualPrimary(visualResult)
      ? `Visual CV primary (${visualResult.source}) + OCR semantics (${ocrResult.source})`
      : `Fused from ${visualResult.source} + ${ocrResult.source}`,
    confidence: fused.confidence,
    source: 'reasoningTopologyExtraction.extractTopologyIntoGraph',
  });

  appendReasoningTrace(graph, `Topology extracted: ${fused.topology.rows}×${fused.topology.columns}`, {
    confidence: fused.confidence,
    source: isVisualPrimary(visualResult) ? 'visual_primary' : 'fusion',
    stampThreshold: fused.stampThreshold,
    visualSource: visualResult.source,
    ocrSource: ocrResult.source,
  });

  markAttachmentsProcessed(graph);
  return visual;
}

/**
 * @param {import('../evidence/missionEvidenceGraphService.js').UnifiedEvidenceGraph} graph
 * @param {Record<string, unknown>} [ctx]
 */
export async function extractTopologyIntoGraph(graph, ctx = {}) {
  if (hasAuthoritativeLoyaltyTopology(graph.topology)) {
    return { ok: true, skipped: true, topology: graph.topology, source: graph.topology?.source ?? null };
  }

  appendReasoningTrace(graph, 'Starting topology extraction', { phase: graph.phase });

  const visualResult = await extractFromGraph(graph, ctx);
  const ocrResult = parseFromGraph(graph, ctx);

  if (!visualResult.success && visualResult.source === 'visual_grid_detector') {
    appendReasoningTrace(graph, 'Visual CV below confidence threshold', {
      confidence: visualResult.confidence,
      debug: visualResult.debug ?? null,
    });
  } else if (visualResult.cvError) {
    appendReasoningTrace(graph, 'Visual CV failed — OCR fallback', {
      error: visualResult.cvError,
      imageId: visualResult.imageId ?? null,
    });
  } else if (visualResult.source === 'none') {
    appendReasoningTrace(graph, 'Visual CV skipped — no image attachment on graph', {
      attachmentCount: graph.attachments?.length ?? 0,
    });
  }

  if (isVisualPrimary(visualResult)) {
    const fused = fuseTopologyResults(visualResult, ocrResult);
    if (Number(fused.confidence) > 0.6) {
      const visual = applyFusedTopology(graph, fused, visualResult, ocrResult);
      const meta = ctx.metadata ?? {};
      const ocrText = pickString(
        graph.semanticText?.ocrText,
        meta.attachmentAnalysis?.ocrText,
        meta.preseededDraft?.ocrText,
      );
      const attachmentAnalysis =
        meta.attachmentAnalysis && typeof meta.attachmentAnalysis === 'object'
          ? {
              ...meta.attachmentAnalysis,
              preseededDraft: {
                ...(meta.attachmentAnalysis.preseededDraft ?? {}),
                cardTopology: fused.topology,
                rule: fused.rule ?? undefined,
                visualGridEvidence: visual ?? undefined,
                requiredStamps: fused.stampThreshold ?? undefined,
                stampThreshold: fused.stampThreshold ?? undefined,
                extractedFromImage: true,
                layoutSource: fused.topology.source,
              },
            }
          : {
              artifactType: 'loyalty_card',
              confidence: fused.confidence,
              ocrText: ocrText ?? undefined,
              preseededDraft: {
                cardTopology: fused.topology,
                rule: fused.rule ?? undefined,
                visualGridEvidence: visual ?? undefined,
                requiredStamps: fused.stampThreshold ?? undefined,
                stampThreshold: fused.stampThreshold ?? undefined,
                extractedFromImage: true,
                layoutSource: fused.topology.source,
              },
            };
      await enrichGraphFromAttachmentAnalysis(graph, attachmentAnalysis);
      return {
        ok: true,
        topology: fused.topology,
        rule: fused.rule,
        source: `visual_primary:${visualResult.source}`,
        confidence: fused.confidence,
        stampThreshold: fused.stampThreshold,
        visual: visualResult,
        ocr: ocrResult,
      };
    }
  }

  let fused;
  try {
    fused = fuseTopologyResults(visualResult, ocrResult);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Fusion failed';
    recordGraphDecision(graph, {
      type: 'topology_extraction',
      question: 'What stamp grid structure does the card use?',
      answer: 'failed',
      rationale: message,
      confidence: 0,
      source: 'reasoningTopologyExtraction.extractTopologyIntoGraph',
    });
    appendReasoningTrace(graph, 'Topology extraction failed — fusion error', {
      visualConfidence: visualResult.confidence,
      ocrConfidence: ocrResult.confidence,
      error: message,
    });
    return {
      ok: false,
      reason: 'FUSION_FAILED',
      visual: visualResult,
      ocr: ocrResult,
    };
  }

  if (Number(fused.confidence) <= 0.6) {
    recordGraphDecision(graph, {
      type: 'topology_extraction',
      question: 'What stamp grid structure does the card use?',
      answer: 'failed',
      rationale: `Low confidence fusion. Visual: ${visualResult.confidence}, OCR: ${ocrResult.confidence}`,
      confidence: fused.confidence,
      source: 'reasoningTopologyExtraction.extractTopologyIntoGraph',
    });
    appendReasoningTrace(graph, 'Topology extraction failed — low confidence', {
      visualConfidence: visualResult.confidence,
      ocrConfidence: ocrResult.confidence,
      fusedConfidence: fused.confidence,
    });
    return {
      ok: false,
      reason: 'LOW_CONFIDENCE',
      visual: visualResult,
      ocr: ocrResult,
      confidence: fused.confidence,
    };
  }

  const visual = applyFusedTopology(graph, fused, visualResult, ocrResult);

  const meta = ctx.metadata ?? {};
  const ocrText = pickString(
    graph.semanticText?.ocrText,
    meta.attachmentAnalysis?.ocrText,
    meta.preseededDraft?.ocrText,
  );

  const attachmentAnalysis =
    meta.attachmentAnalysis && typeof meta.attachmentAnalysis === 'object'
      ? {
          ...meta.attachmentAnalysis,
          preseededDraft: {
            ...(meta.attachmentAnalysis.preseededDraft ?? {}),
            cardTopology: fused.topology,
            rule: fused.rule ?? undefined,
            visualGridEvidence: visual ?? undefined,
            requiredStamps: fused.stampThreshold ?? undefined,
            stampThreshold: fused.stampThreshold ?? undefined,
            extractedFromImage: true,
            layoutSource: fused.topology.source,
          },
        }
      : {
          artifactType: 'loyalty_card',
          confidence: fused.confidence,
          ocrText: ocrText ?? undefined,
          preseededDraft: {
            cardTopology: fused.topology,
            rule: fused.rule ?? undefined,
            visualGridEvidence: visual ?? undefined,
            requiredStamps: fused.stampThreshold ?? undefined,
            stampThreshold: fused.stampThreshold ?? undefined,
            extractedFromImage: true,
            layoutSource: fused.topology.source,
          },
        };

  await enrichGraphFromAttachmentAnalysis(graph, attachmentAnalysis);

  return {
    ok: true,
    topology: fused.topology,
    rule: fused.rule,
    source: `fusion:${visualResult.source}+${ocrResult.source}`,
    confidence: fused.confidence,
    stampThreshold: fused.stampThreshold,
    visual: visualResult,
    ocr: ocrResult,
  };
}
