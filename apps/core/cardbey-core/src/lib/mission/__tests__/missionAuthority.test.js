/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const findUniqueMock = vi.fn();
const updateMock = vi.fn();

vi.mock('../../prisma.js', () => ({
  getPrismaClient: () => ({
    missionPipeline: { findUnique: findUniqueMock, update: updateMock },
    mission: { findUnique: vi.fn(async () => null) },
    orchestratorTask: { findFirst: vi.fn(async () => null) },
  }),
}));

describe('mission authority', () => {
  beforeEach(() => {
    findUniqueMock.mockReset();
    updateMock.mockReset();
  });

  it('resolves MissionPipeline authority record', async () => {
    findUniqueMock.mockResolvedValueOnce({
      id: 'mission-1',
      status: 'awaiting_confirmation',
      type: 'setup_loyalty_program',
      createdAt: new Date('2026-07-12T00:00:00Z'),
      metadataJson: {},
      targetId: 'store-1',
      targetType: 'store',
    });

    const { resolveMissionAuthority } = await import('../missionAuthority.js');
    const result = await resolveMissionAuthority('mission-1');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.authority.persistenceKind).toBe('mission_pipeline');
      expect(result.authority.persistenceRecordId).toBe('mission-1');
      expect(result.authority.currentState).toBe('awaiting_confirmation');
    }
  });

  it('returns MISSION_RECORD_NOT_FOUND when no persisted record exists', async () => {
    const { resolveMissionAuthority, requireMissionPipelineAuthority } = await import(
      '../missionAuthority.js'
    );
    const missing = await resolveMissionAuthority('missing-mission');
    expect(missing.ok).toBe(false);
    if (!missing.ok) {
      expect(missing.code).toBe('MISSION_RECORD_NOT_FOUND');
    }

    const required = await requireMissionPipelineAuthority('missing-mission');
    expect(required.ok).toBe(false);
    if (!required.ok) {
      expect(required.code).toBe('MISSION_RECORD_NOT_FOUND');
    }
  });
});
