/**
 * @vitest-environment node
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../persistence/metadataWriter.js', () => ({
  readMetadata: vi.fn(async () => ({})),
  writeMetadata: vi.fn(async () => ({})),
}));

vi.mock('../../kernel/missionContract.js', () => ({
  readMissionContract: vi.fn(async () => null),
}));

vi.mock('../toolExecutors/index.js', () => ({
  getExecutor: vi.fn(() => null),
}));

import { readMetadata, writeMetadata } from '../../persistence/metadataWriter.js';
import { normalizeToUnifiedGraph } from '../../evidence/missionEvidenceGraphService.js';
import { selectNextCapability } from '../reasoningCapabilityRegistry.js';
import { runReasoningStep, resetReasoningCoordinatorForTests } from '../reasoningCoordinator.js';

describe('reasoningCapabilityRegistry', () => {
  it('selects analyze_attachment when graph has no perceptions', () => {
    const graph = normalizeToUnifiedGraph({
      graphId: 'g1',
      missionId: 'm1',
      nodes: [],
      decisions: [],
      conflicts: [],
      phase: 'observe',
    });
    const next = selectNextCapability(graph);
    expect(next?.id).toBe('loyalty.analyze_attachment');
  });

  it('selects run_topology_plan when approved topology present in plan phase', () => {
    const graph = normalizeToUnifiedGraph({
      graphId: 'g2',
      missionId: 'm2',
      nodes: [],
      decisions: [],
      conflicts: [],
      phase: 'plan',
      topology: { rows: 2, columns: 5, cells: [{ row: 0, column: 0, role: 'PURCHASE' }] },
      rule: { programType: 'STAMP_CARD', purchasesRequired: 10, rewardItem: 'Coffee' },
    });
    const next = selectNextCapability(graph, {
      approvedTopology: { id: 'topo-1', nodes: [{ id: 'n1' }] },
      storeId: 'store-1',
      metadata: { storeId: 'store-1', storeContext: { storeId: 'store-1' } },
    });
    expect(next?.id).toBe('loyalty.run_topology_plan');
  });

  it('defers run_topology_plan until perception when image evidence lacks topology', () => {
    process.env.PHASE2_REASONING_PRIMARY = 'true';
    const graph = normalizeToUnifiedGraph({
      graphId: 'g3',
      missionId: 'm3',
      nodes: [],
      decisions: [],
      conflicts: [],
      phase: 'plan',
      attachments: [{ attachmentId: 'att-1', mimeType: 'image/jpeg', url: 'http://x/img.jpg' }],
    });
    const next = selectNextCapability(graph, {
      approvedTopology: { id: 'topo-1', nodes: [{ id: 'n1' }] },
      storeId: 'store-1',
      metadata: { storeId: 'store-1' },
    });
    expect(next?.id).toBe('loyalty.full_card_processing');
    delete process.env.PHASE2_REASONING_PRIMARY;
  });
});

describe('reasoningCoordinator', () => {
  const prevFlag = process.env.PHASE2_ACTIVE_REASONING;

  beforeEach(() => {
    resetReasoningCoordinatorForTests();
    process.env.PHASE2_ACTIVE_REASONING = 'true';
    process.env.PHASE2_REASONING_ROLLOUT_PERCENT = '100';
    process.env.PHASE2_REASONING_STAGING_ONLY = 'false';
    process.env.PHASE2_REASONING_TELEMETRY = 'false';
    process.env.PHASE2_REASONING_PRIMARY = 'false';
    vi.mocked(readMetadata).mockReset();
    vi.mocked(writeMetadata).mockReset();
    vi.mocked(readMetadata).mockResolvedValue({});
  });

  afterEach(() => {
    if (prevFlag === undefined) delete process.env.PHASE2_ACTIVE_REASONING;
    else process.env.PHASE2_ACTIVE_REASONING = prevFlag;
  });

  it('skips when PHASE2_ACTIVE_REASONING is false', async () => {
    process.env.PHASE2_ACTIVE_REASONING = 'false';
    const result = await runReasoningStep('mission-off');
    expect(result.skipped).toBe(true);
  });

  it('runs analyze_attachment when graph needs perception', async () => {
    vi.mocked(readMetadata).mockResolvedValue({
      missionEvidenceGraph: normalizeToUnifiedGraph({
        graphId: 'g-obs',
        missionId: 'mission-obs',
        nodes: [],
        decisions: [],
        conflicts: [],
        phase: 'observe',
        attachments: [{ attachmentId: 'att-1', evidenceId: 'ev-1' }],
      }),
    });

    const result = await runReasoningStep('mission-obs');
    expect(result.ok).toBe(true);
    expect(result.nextPlan?.capabilityId).toBe('loyalty.analyze_attachment');
    expect(result.actionResult?.capabilityId).toBe('loyalty.analyze_attachment');
    expect(writeMetadata).toHaveBeenCalled();
  });

  it('selects replan when reanalysisRequired is set', () => {
    const graph = normalizeToUnifiedGraph({
      graphId: 'g-replan',
      missionId: 'm-replan',
      nodes: [],
      decisions: [],
      conflicts: [],
      phase: 'plan',
      reanalysisRequired: true,
      topology: { rows: 2, columns: 5, cells: [{ row: 0, column: 0, role: 'PURCHASE' }] },
      rule: { programType: 'STAMP_CARD', purchasesRequired: 10 },
    });
    const next = selectNextCapability(graph);
    expect(next?.id).toBe('loyalty.replan_from_conflicts');
  });
});
