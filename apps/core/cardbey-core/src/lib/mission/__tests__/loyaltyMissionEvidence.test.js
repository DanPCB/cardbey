import { describe, expect, it } from 'vitest';
import {
  buildLoyaltyMissionEvidenceGraph,
  buildMissionEvidenceMetadataPatch,
  extractMissionEvidenceGraphFromOutputs,
  recordLoyaltyMissionOutcomeEvidence,
} from '../loyaltyMissionEvidence.js';
import { createMissionEvidenceGraph } from '../missionEvidenceGraph.js';

describe('loyaltyMissionEvidence', () => {
  it('builds graph from vision extract topology result', () => {
    const cells = Array.from({ length: 32 }, (_, i) => ({
      row: Math.floor(i / 8),
      col: i % 8,
      role: (i + 1) % 8 === 0 ? 'REWARD' : 'PURCHASE',
    }));
    const cardTopology = {
      rows: 4,
      columns: 8,
      source: 'VISION_EXTRACTED',
      confidence: 0.92,
      footerText: 'Catering Available',
      cells,
    };
    const graph = buildLoyaltyMissionEvidenceGraph({
      missionId: 'm-coffee',
      ocrText: 'Coffee '.repeat(28) + 'Free '.repeat(4),
      extractionMethod: 'OCR_ROW_PARSER',
      topologyResult: {
        ok: true,
        cardTopology,
      },
      preseededDraft: {
        cardTopology,
        rule: {
          programType: 'STAMP_CARD',
          purchasesRequired: 7,
          purchaseItem: 'Coffee',
          rewardItem: 'Free',
          rewardQuantity: 1,
        },
      },
    });

    expect(graph.nodes.some((n) => n.source === 'loyalty.topology')).toBe(true);
    expect(graph.decisions.some((d) => d.answer === 'TOPOLOGY_DRIVEN')).toBe(true);

    const patch = buildMissionEvidenceMetadataPatch(graph);
    expect(patch.missionEvidenceGraph).toBe(graph);
    expect(patch.missionEvidenceSummary?.topology).toMatchObject({ rows: 4, columns: 8 });
  });

  it('extracts graph from stage output shapes', () => {
    const graph = createMissionEvidenceGraph({ domain: 'loyalty' });
    expect(extractMissionEvidenceGraphFromOutputs({ missionEvidenceGraph: graph })).toBe(graph);
    expect(
      extractMissionEvidenceGraphFromOutputs({ attachmentAnalysis: { missionEvidenceGraph: graph } }),
    ).toBe(graph);
    expect(extractMissionEvidenceGraphFromOutputs(null)).toBeNull();
  });

  it('records terminal mission outcome', () => {
    let graph = createMissionEvidenceGraph({ domain: 'loyalty' });
    graph = recordLoyaltyMissionOutcomeEvidence(graph, {
      status: 'completed',
      missionId: 'm1',
      artifactIds: ['art-1'],
      reconciled: true,
    });
    expect(graph.nodes.some((n) => n.kind === 'outcome')).toBe(true);
    expect(graph.decisions.some((d) => d.question.includes('complete successfully'))).toBe(true);
  });
});
