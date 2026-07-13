/**
 * @vitest-environment node
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../../persistence/metadataWriter.js', () => ({
  readMetadata: vi.fn(async () => ({ missionContract: { frozenAt: '2026-01-01' } })),
  writeMetadata: vi.fn(async () => ({})),
}));

import { readMetadata, writeMetadata } from '../../persistence/metadataWriter.js';
import { normalizeToUnifiedGraph } from '../missionEvidenceGraphService.js';
import {
  confirmEvidenceReanalysis,
  dismissEvidenceReanalysis,
} from '../graphReanalysisService.js';

describe('graphReanalysisService', () => {
  beforeEach(() => {
    vi.mocked(readMetadata).mockReset();
    vi.mocked(writeMetadata).mockReset();
    vi.mocked(readMetadata).mockResolvedValue({ missionContract: { frozenAt: '2026-01-01' } });
  });

  it('confirm clears reanalysisRequired and resolves conflicts', async () => {
    const graph = normalizeToUnifiedGraph({
      graphId: 'g-re',
      missionId: 'mission-re',
      nodes: [],
      decisions: [],
      conflicts: [
        {
          type: 'new_evidence_post_freeze',
          code: 'NEW_EVIDENCE_POST_FREEZE',
          resolved: false,
        },
      ],
      reanalysisRequired: true,
      frozenSnapshotId: 'snap-1',
    });

    vi.mocked(readMetadata).mockResolvedValue({
      missionEvidenceGraph: graph,
      missionContract: { frozenAt: '2026-01-01' },
    });

    const result = await confirmEvidenceReanalysis('mission-re', { note: 're-run please' });
    expect(result.ok).toBe(true);
    expect(result.action).toBe('reanalysis_confirmed');
    expect(writeMetadata).toHaveBeenCalled();
  });

  it('dismiss clears reanalysisRequired', async () => {
    const graph = normalizeToUnifiedGraph({
      graphId: 'g-dismiss',
      missionId: 'mission-dismiss',
      nodes: [],
      decisions: [],
      conflicts: [],
      reanalysisRequired: true,
    });

    vi.mocked(readMetadata).mockResolvedValue({
      missionEvidenceGraph: graph,
    });

    const result = await dismissEvidenceReanalysis('mission-dismiss', { never: true });
    expect(result.ok).toBe(true);
    expect(result.dismissed).toBe('never');
    expect(writeMetadata).toHaveBeenCalled();
  });
});
