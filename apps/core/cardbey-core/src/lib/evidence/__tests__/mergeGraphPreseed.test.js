/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import { mergeGraphPreseedIntoPriors } from '../missionEvidenceGraphService.js';
import { getCanonicalTopologyFromGraph } from '../evidenceDecisionService.js';

describe('mergeGraphPreseedIntoPriors', () => {
  it('graph authoritative topology wins over stale priors', () => {
    const graphTopo = {
      source: 'VISION_EXTRACTED',
      rows: 4,
      columns: 6,
      cells: [{ row: 0, column: 0, role: 'PURCHASE' }],
      confidence: 0.9,
    };
    const merged = mergeGraphPreseedIntoPriors(
      { reward: 'Coffee', stampThreshold: 8, cardTopology: { source: 'DEFAULT_TEMPLATE', rows: 2, columns: 5, cells: [] } },
      { cardTopology: graphTopo, extractedFromImage: true },
    );
    expect(merged.cardTopology).toEqual(graphTopo);
    expect(merged.extractedFromImage).toBe(true);
  });
});

describe('getCanonicalTopologyFromGraph unified field', () => {
  it('reads graph.topology directly', () => {
    const topo = getCanonicalTopologyFromGraph({
      nodes: [],
      topology: {
        source: 'FUSION_VISUAL_OCR',
        rows: 4,
        columns: 6,
        cells: [{ row: 0, column: 0, role: 'PURCHASE' }],
        confidence: 0.88,
      },
    });
    expect(topo?.rows).toBe(4);
    expect(topo?.columns).toBe(6);
  });
});
