/**
 * @vitest-environment node
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  readMissionSpineOwnership: vi.fn(async () => null),
}));

vi.mock('../../kernel/spineAuthority.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    readMissionSpineOwnership: (...args) => mocks.readMissionSpineOwnership(...args),
  };
});

import { unifiedDispatch } from '../unifiedDispatch.js';
import { UNIFIED_ACTION_TYPES } from '../../execution/executionTypes.js';

describe('unifiedDispatch spine guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('blocks checkpoint dispatch when mission spine is compiler-owned', async () => {
    mocks.readMissionSpineOwnership.mockResolvedValue({
      owner: 'compiler_topology',
      claimedAt: new Date().toISOString(),
    });

    const result = await unifiedDispatch(
      {
        type: UNIFIED_ACTION_TYPES.CREATE_CAMPAIGN_CHECKPOINT,
        payload: { missionId: 'mission_1', userId: 'user_1' },
      },
      { source: 'test' },
    );

    expect(result.ok).toBe(false);
    expect(result.code).toBe('MISSION_SPINE_LOCKED');
  });
});
