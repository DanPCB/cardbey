/**
 * Phase 2.5 — single high-level loyalty card perception capability (visual + OCR fusion).
 */

import { hasAuthoritativeLoyaltyTopology } from '../loyalty/loyaltyContractDiagnostics.js';
import { extractTopologyIntoGraph } from './reasoningTopologyExtraction.js';
import { appendReasoningTrace, recordGraphDecision } from '../evidence/missionEvidenceGraphService.js';

function pickString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

/**
 * @param {import('../evidence/missionEvidenceGraphService.js').UnifiedEvidenceGraph} graph
 */
export function hasImageEvidenceOnGraph(graph) {
  if (pickString(graph.imageRef)) return true;
  return (graph.attachments ?? []).some((attachment) => {
    if (!attachment || typeof attachment !== 'object') return false;
    const mime = String(attachment.mimeType ?? attachment.type ?? '').toLowerCase();
    return mime.includes('image') || Boolean(attachment.url ?? attachment.attachmentId ?? attachment.evidenceId);
  });
}

/**
 * @param {import('../evidence/missionEvidenceGraphService.js').UnifiedEvidenceGraph} graph
 */
export function scoreFullCardProcessing(graph) {
  if (hasAuthoritativeLoyaltyTopology(graph.topology)) return 0;
  if (!hasImageEvidenceOnGraph(graph)) return 0;
  return 120;
}

/**
 * @param {import('../evidence/missionEvidenceGraphService.js').UnifiedEvidenceGraph} graph
 * @param {Record<string, unknown>} [ctx]
 */
export async function executeFullCardProcessing(graph, ctx = {}) {
  if (hasAuthoritativeLoyaltyTopology(graph.topology)) {
    return {
      ok: true,
      skipped: true,
      topology: graph.topology,
      source: 'loyalty.full_card_processing',
    };
  }

  appendReasoningTrace(graph, 'Full card processing: visual CV + OCR fusion', {
    capability: 'loyalty.full_card_processing',
    attachmentCount: graph.attachments?.length ?? 0,
  });

  const extraction = await extractTopologyIntoGraph(graph, ctx);
  if (extraction.ok && extraction.topology) {
    recordGraphDecision(graph, {
      type: 'full_card_processing',
      question: 'What is the stamp card layout from the uploaded image?',
      answer: `${extraction.topology.rows}×${extraction.topology.columns}`,
      rationale: `Fused topology via loyalty.full_card_processing (${extraction.source ?? 'fusion'})`,
      confidence: Number(extraction.confidence) || Number(extraction.topology.confidence) || 0.85,
      source: 'loyaltyFullCardProcessing.executeFullCardProcessing',
    });
  }

  return {
    ...extraction,
    capabilityId: 'loyalty.full_card_processing',
    source: 'loyalty.full_card_processing',
  };
}
