/**
 * @vitest-environment node
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  appendStoreCreationBlackboardEvent,
  wrapStepReporterForStoreBlackboard,
} from '../storeCreationBlackboard.js';
import * as missionBlackboard from '../../missionBlackboard.js';

describe('storeCreationBlackboard (Phase 1)', () => {
  beforeEach(() => {
    vi.spyOn(missionBlackboard, 'ensureMissionRowForBlackboard').mockResolvedValue(true);
    vi.spyOn(missionBlackboard, 'appendEvent').mockResolvedValue({ ok: true, seq: 1 });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('appendStoreCreationBlackboardEvent uses pipeline missionId', async () => {
    const result = await appendStoreCreationBlackboardEvent('pipe-1', 'store:research_complete', {
      draftId: 'draft-1',
    });
    expect(result.ok).toBe(true);
    expect(missionBlackboard.ensureMissionRowForBlackboard).toHaveBeenCalledWith('pipe-1');
    expect(missionBlackboard.appendEvent).toHaveBeenCalledWith(
      'pipe-1',
      'store:research_complete',
      expect.objectContaining({ draftId: 'draft-1', missionId: 'pipe-1' }),
      expect.objectContaining({ agentId: 'store_creation' }),
    );
  });

  it('wrapStepReporterForStoreBlackboard emits milestone events on completed', async () => {
    const completed = vi.fn(async () => {});
    const reporter = wrapStepReporterForStoreBlackboard({
      missionId: 'pipe-2',
      draftId: 'draft-2',
      stepReporter: { started: async () => {}, completed, failed: async () => {} },
    });

    await reporter.completed('research');
    await reporter.completed('copy');

    expect(completed).toHaveBeenCalledTimes(2);
    const types = missionBlackboard.appendEvent.mock.calls.map((c) => c[1]);
    expect(types).toEqual(['store:research_complete', 'store:copy_complete']);
  });

  it('appendStoreCreationBlackboardEvent never throws when append fails', async () => {
    missionBlackboard.appendEvent.mockRejectedValue(new Error('boom'));
    const result = await appendStoreCreationBlackboardEvent('pipe-3', 'store:copy_complete', {
      draftId: 'd',
    });
    expect(result.ok).toBe(false);
  });
});
