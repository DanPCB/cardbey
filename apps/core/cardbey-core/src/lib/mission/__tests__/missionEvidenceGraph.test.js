import { describe, expect, it } from 'vitest';
import {
  appendEvidenceNode,
  asMissionEvidenceGraph,
  createMissionEvidenceGraph,
  deriveLoyaltyDecisionsFromEvidence,
  mergeMissionEvidenceGraphs,
  recordEvidenceDecision,
  summarizeMissionEvidenceGraph,
} from '../missionEvidenceGraph.js';

describe('missionEvidenceGraph', () => {
  it('creates graph with domain and ids', () => {
    const graph = createMissionEvidenceGraph({
      missionId: 'm1',
      evidenceId: 'ev1',
      domain: 'loyalty',
    });
    expect(graph.missionId).toBe('m1');
    expect(graph.evidenceId).toBe('ev1');
    expect(graph.domain).toBe('loyalty');
    expect(graph.nodes).toEqual([]);
    expect(graph.decisions).toEqual([]);
  });

  it('derives TOPOLOGY_DRIVEN when authoritative topology present', () => {
    const cells = Array.from({ length: 32 }, (_, i) => ({
      row: Math.floor(i / 8),
      col: i % 8,
      role: (i + 1) % 8 === 0 ? 'REWARD' : 'PURCHASE',
    }));
    const cardTopology = {
      rows: 4,
      columns: 8,
      source: 'VISION_EXTRACTED',
      confidence: 0.9,
      cells,
    };
    const graph = createMissionEvidenceGraph({ domain: 'loyalty' });
    deriveLoyaltyDecisionsFromEvidence(graph, {
      cardTopology,
      rule: {
        programType: 'STAMP_CARD',
        purchasesRequired: 7,
        purchaseItem: 'Coffee',
        rewardItem: 'Free',
        rewardQuantity: 1,
      },
      ocrText: 'Coffee Coffee Coffee Coffee Coffee Coffee Coffee Free',
    });

    const rendererDecision = graph.decisions.find((d) => d.answer === 'TOPOLOGY_DRIVEN');
    expect(rendererDecision).toBeTruthy();
    expect(graph.conflicts).toHaveLength(0);

    const summary = summarizeMissionEvidenceGraph(graph);
    expect(summary.topology).toMatchObject({ rows: 4, columns: 8, source: 'VISION_EXTRACTED' });
    expect(summary.lastDecision?.answer).toBe('TOPOLOGY_DRIVEN');
  });

  it('records CARD_TOPOLOGY_MISSING conflict when topology absent', () => {
    const graph = createMissionEvidenceGraph({ domain: 'loyalty' });
    deriveLoyaltyDecisionsFromEvidence(graph, { ocrText: 'loyalty rewards' });

    expect(graph.decisions.some((d) => d.answer === 'DEFAULT_TEMPLATE')).toBe(true);
    expect(graph.conflicts.some((c) => c.code === 'CARD_TOPOLOGY_MISSING')).toBe(true);
  });

  it('merges graphs and validates asMissionEvidenceGraph', () => {
    const base = createMissionEvidenceGraph({ missionId: 'm1', domain: 'loyalty' });
    appendEvidenceNode(base, {
      kind: 'observation',
      source: 'loyalty.ocr',
      summary: 'OCR ok',
    });
    const patch = createMissionEvidenceGraph({ missionId: 'm1', domain: 'loyalty' });
    recordEvidenceDecision(patch, {
      question: 'test?',
      answer: 'yes',
      rationale: 'because',
      source: 'test',
    });
    const merged = mergeMissionEvidenceGraphs(base, patch);
    expect(merged.nodes).toHaveLength(1);
    expect(merged.decisions).toHaveLength(1);
    expect(asMissionEvidenceGraph(merged)).toBeTruthy();
    expect(asMissionEvidenceGraph({ nodes: 'bad' })).toBeNull();
  });
});
