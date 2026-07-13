/**
 * @vitest-environment node
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { normalizeToUnifiedGraph } from '../../evidence/missionEvidenceGraphService.js';
import { selectNextCapability } from '../reasoningCapabilityRegistry.js';

vi.mock('../../loyalty/loyaltyTopologyExtraction.js', () => ({
  extractLoyaltyCardTopology: vi.fn(async () => ({ ok: false })),
}));

import { parseFromGraph } from '../../loyalty/loyaltyOcrTopologyParser.js';
import { extractFromGraph } from '../../loyalty/loyaltyVisualGridEvidence.js';
import { hasAuthoritativeLoyaltyTopology } from '../../loyalty/loyaltyContractDiagnostics.js';
import { extractTopologyIntoGraph } from '../reasoningTopologyExtraction.js';

describe('reasoningCapabilityRegistry topology priority', () => {
  beforeEach(() => {
    process.env.PHASE2_REASONING_PRIMARY = 'false';
  });

  it('selects extract_topology when OCR exists without topology', () => {
    const graph = normalizeToUnifiedGraph({
      graphId: 'g-topo',
      missionId: 'm-topo',
      nodes: [],
      decisions: [],
      conflicts: [],
      phase: 'model',
      attachments: [{ attachmentId: 'att-1', evidenceId: 'ev-1' }],
      perceptions: [
        { type: 'ocr', source: 'intake', data: { attachmentId: 'att-1', ocrTextLength: 120 } },
      ],
    });
    const next = selectNextCapability(graph);
    expect(next?.id).toBe('loyalty.extract_topology');
  });

  it('selects analyze_attachment before extract when no perceptions exist', () => {
    const graph = normalizeToUnifiedGraph({
      graphId: 'g-analyze',
      missionId: 'm-analyze',
      nodes: [],
      decisions: [],
      conflicts: [],
      phase: 'observe',
      attachments: [{ attachmentId: 'att-2', evidenceId: 'ev-2' }],
    });
    const next = selectNextCapability(graph);
    expect(next?.id).toBe('loyalty.analyze_attachment');
  });
});

describe('reasoningTopologyExtraction', () => {
  it('extracts authoritative topology from visual grid evidence', async () => {
    const graph = normalizeToUnifiedGraph({
      graphId: 'g-visual',
      missionId: 'm-visual',
      nodes: [],
      decisions: [],
      conflicts: [],
      phase: 'observe',
      visualGrid: { rows: 2, columns: 5, cells: [], confidence: 0.9 },
    });

    const result = await extractTopologyIntoGraph(graph, {
      metadata: {
        preseededDraft: { ocrText: 'Collect 8 visit - GET 1 REWARD PERK' },
      },
    });
    expect(result.ok).toBe(true);
    expect(graph.topology?.rows).toBe(2);
    expect(graph.topology?.columns).toBe(5);
    expect(hasAuthoritativeLoyaltyTopology(graph.topology)).toBe(true);
    expect(Array.isArray(graph.topology?.cells)).toBe(true);
    expect(graph.topology?.cells?.length).toBeGreaterThan(0);
  });

  it('parseFromGraph reads collect N visit threshold', () => {
    const graph = normalizeToUnifiedGraph({
      graphId: 'g-ocr',
      missionId: 'm-ocr',
      nodes: [],
      decisions: [],
      conflicts: [],
      phase: 'observe',
      semanticText: { ocrText: 'Collect 8 visit - GET 1 REWARD PERK' },
    });
    const ocr = parseFromGraph(graph, {});
    expect(ocr.stampThreshold).toBe(8);
    expect(ocr.buyGetRule?.buy).toBe(8);
  });

  it('extractFromGraph prefers graph visual grid', async () => {
    const graph = normalizeToUnifiedGraph({
      graphId: 'g-grid',
      missionId: 'm-grid',
      nodes: [],
      decisions: [],
      conflicts: [],
      phase: 'observe',
      visualGrid: { rows: 2, columns: 5, cells: [], confidence: 0.87 },
    });
    const visual = await extractFromGraph(graph, {});
    expect(visual.rows).toBe(2);
    expect(visual.columns).toBe(5);
    expect(visual.confidence).toBeGreaterThan(0.8);
  });
});
