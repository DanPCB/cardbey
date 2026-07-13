/**
 * @vitest-environment node
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../../persistence/metadataWriter.js', () => ({
  readMetadata: vi.fn(async () => ({})),
  writeMetadata: vi.fn(async () => ({})),
}));

import { readMetadata, writeMetadata } from '../../persistence/metadataWriter.js';
import {
  appendPerception,
  appendReasoningTrace,
  getOrCreateEvidenceGraph,
  initializeFromIntake,
  normalizeToUnifiedGraph,
  persistGraph,
  processIntakeToGraph,
  applyIntakeEvidenceToGraph,
  seedMissionGraphFromLoyaltyMetadata,
  resetMissionEvidenceGraphServiceForTests,
  graphToLegacyEvidenceView,
} from '../missionEvidenceGraphService.js';
import { handleNewEvidence, isContractFrozen } from '../graphConflictService.js';

describe('missionEvidenceGraphService', () => {
  beforeEach(() => {
    resetMissionEvidenceGraphServiceForTests();
    vi.mocked(readMetadata).mockReset();
    vi.mocked(writeMetadata).mockReset();
    vi.mocked(readMetadata).mockResolvedValue({});
  });

  it('initializes graph from intake with OCR perception', async () => {
    const graph = await initializeFromIntake(
      'mission-1',
      {
        evidenceView: { evidenceId: 'ev-1' },
        snapshot: { ocrText: 'Buy 10 get 1 free', ocrStatus: 'ok', confidence: 0.8 },
      },
      {
        evidenceId: 'ev-1',
        preseededDraft: {
          cardTopology: {
            source: 'VISION_EXTRACTED',
            rows: 2,
            columns: 5,
            cells: [{ row: 0, column: 0, role: 'PURCHASE' }],
            confidence: 0.9,
          },
          rule: {
            programType: 'STAMP_CARD',
            purchasesRequired: 10,
            purchaseItem: 'Coffee',
            rewardItem: 'Free',
            rewardQuantity: 1,
            repeatMode: 'INDEFINITE',
          },
        },
      },
    );

    expect(graph.missionId).toBe('mission-1');
    expect(graph.evidenceId).toBe('ev-1');
    expect(graph.perceptions?.length).toBeGreaterThan(0);
    expect(graph.topology?.rows).toBe(2);
    expect(graph.version).toBeGreaterThan(1);
  });

  it('persists graph to metadata with dual-write preseededDraft', async () => {
    const graph = normalizeToUnifiedGraph(
      await getOrCreateEvidenceGraph('mission-2', null, null),
    );
    graph.topology = {
      source: 'VISION_EXTRACTED',
      rows: 2,
      columns: 5,
      cells: [{ row: 0, column: 0, role: 'PURCHASE' }],
    };
    graph.rule = { programType: 'STAMP_CARD', purchasesRequired: 8 };
    await persistGraph(graph, { missionId: 'mission-2' });

    expect(writeMetadata).toHaveBeenCalledWith(
      'mission-2',
      expect.objectContaining({
        missionEvidenceGraph: expect.objectContaining({ graphId: expect.any(String) }),
        preseededDraft: expect.objectContaining({ _fromGraph: true }),
      }),
    );
  });

  it('appends reasoning trace', () => {
    const graph = normalizeToUnifiedGraph({ graphId: 'g1', missionId: 'm1', nodes: [], decisions: [], conflicts: [] });
    appendReasoningTrace(graph, 'Test reasoning line');
    expect(graph.reasoningTrace?.length).toBe(1);
    expect(graph.updatedAt).toBeTruthy();
  });

  it('processIntakeToGraph writes through persistGraph', async () => {
    const result = await processIntakeToGraph(
      'mission-3',
      {
        evidenceView: { evidenceId: 'ev-3' },
        snapshot: { ocrText: 'stamp card', ocrStatus: 'ok' },
      },
      null,
    );
    expect(result?.missionId).toBe('mission-3');
    expect(writeMetadata).toHaveBeenCalled();
  });

  it('graphToLegacyEvidenceView maps topology and rule', () => {
    const graph = normalizeToUnifiedGraph({
      graphId: 'g-legacy',
      missionId: 'm-legacy',
      evidenceId: 'ev-legacy',
      nodes: [],
      decisions: [],
      conflicts: [],
      topology: { rows: 2, columns: 5, confidence: 0.9 },
      rule: { programType: 'STAMP_CARD', purchasesRequired: 10, rewardItem: 'Coffee' },
    });
    const view = graphToLegacyEvidenceView(graph);
    expect(view.preseededDraft._fromGraph).toBe(true);
    expect(view.preseededDraft.cardTopology?.rows).toBe(2);
    expect(view.attachmentAnalysis.confirmedFields?.requiredStamps).toBe(10);
  });

  it('applyIntakeEvidenceToGraph enriches existing non-frozen graph', async () => {
    const existing = normalizeToUnifiedGraph({
      graphId: 'g-existing',
      missionId: 'mission-existing',
      nodes: [],
      decisions: [],
      conflicts: [],
      version: 2,
    });
    vi.mocked(readMetadata).mockResolvedValue({ missionEvidenceGraph: existing });

    const result = await applyIntakeEvidenceToGraph(
      'mission-existing',
      { snapshot: { ocrText: 'updated card', ocrStatus: 'ok' } },
      {
        evidenceId: 'ev-new',
        artifactType: 'loyalty_card',
        confidence: 0.8,
        preseededDraft: {
          cardTopology: { rows: 3, columns: 6, cells: [{ row: 0, column: 0, role: 'PURCHASE' }] },
        },
      },
    );

    expect(result?.version).toBeGreaterThan(2);
    expect(result?.perceptions?.length).toBeGreaterThan(0);
    expect(writeMetadata).toHaveBeenCalled();
  });

  it('seedMissionGraphFromLoyaltyMetadata copies attachmentAnalysis topology onto graph', async () => {
    const graph = await seedMissionGraphFromLoyaltyMetadata('mission-seed', {
      attachmentAnalysis: {
        artifactType: 'loyalty_card',
        evidenceId: 'ev-seed',
        preseededDraft: {
          cardTopology: {
            source: 'VISION_EXTRACTED',
            rows: 5,
            columns: 4,
            cells: [{ row: 0, column: 0, role: 'PURCHASE' }],
            confidence: 0.9,
          },
          rule: {
            programType: 'STAMP_CARD',
            purchasesRequired: 8,
            rewardItem: 'Free Coffee',
            purchaseItem: 'Coffee',
            rewardQuantity: 1,
            repeatMode: 'INDEFINITE',
          },
        },
      },
    });

    expect(graph?.topology?.rows).toBe(5);
    expect(graph?.topology?.columns).toBe(4);
    expect(graph?.topology?.source).toBe('VISION_EXTRACTED');
    expect(writeMetadata).toHaveBeenCalled();
    const view = graphToLegacyEvidenceView(graph);
    expect(view.preseededDraft.cardTopology.rows).toBe(5);
  });
});

describe('graphConflictService', () => {
  beforeEach(() => {
    vi.mocked(readMetadata).mockReset();
    vi.mocked(writeMetadata).mockReset();
  });

  it('detects frozen contract', () => {
    const graph = normalizeToUnifiedGraph({
      graphId: 'g1',
      missionId: 'm1',
      nodes: [],
      decisions: [],
      conflicts: [],
      frozenSnapshotId: 'snap-1',
    });
    expect(isContractFrozen(graph, { missionContract: { frozenAt: '2026-01-01' } })).toBe(true);
  });

  it('records conflict and reanalysis prompt on post-freeze evidence', async () => {
    vi.mocked(readMetadata).mockResolvedValue({
      missionContract: { frozenAt: '2026-01-01' },
      missionEvidenceGraph: normalizeToUnifiedGraph({
        graphId: 'g-frozen',
        missionId: 'mission-frozen',
        nodes: [],
        decisions: [],
        conflicts: [],
        version: 3,
        frozenSnapshotId: 'snap-1',
      }),
    });

    const result = await handleNewEvidence('mission-frozen', {
      attachmentId: 'att-new',
      evidenceId: 'ev-new',
    });

    expect(result?.frozen).toBe(true);
    expect(result?.prompt?.action).toBe('reanalysis_prompt');
    expect(result?.graph.conflicts?.length).toBeGreaterThan(0);
    expect(writeMetadata).toHaveBeenCalled();
  });
});
