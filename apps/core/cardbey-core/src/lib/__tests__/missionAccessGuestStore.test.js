/**
 * Mission access: guest store handoff and store/draft ownership fallback.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const prismaMock = vi.hoisted(() => ({
  mission: { findUnique: vi.fn() },
  missionPipeline: { findUnique: vi.fn(), findMany: vi.fn() },
  orchestratorTask: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
  draftStore: { findUnique: vi.fn() },
  business: { findUnique: vi.fn() },
}));

vi.mock('../prisma.js', () => ({
  getPrismaClient: () => prismaMock,
}));

vi.mock('../broker/brokerFlags.js', () => ({
  isPerformerOrchestrationStabilityEnabled: () => false,
}));

import { resolveAccessibleMission, resetMissionAccessCacheForTests } from '../missionAccess.js';

const realUser = { id: 'user-real-1', business: { id: 'store-biz-1' } };
const guestUser = { id: 'guest_abc123' };

describe('missionAccess guest store handoff', () => {
  beforeEach(() => {
    resetMissionAccessCacheForTests();
    vi.clearAllMocks();
    prismaMock.mission.findUnique.mockResolvedValue(null);
    prismaMock.orchestratorTask.findUnique.mockResolvedValue(null);
    prismaMock.orchestratorTask.findFirst.mockResolvedValue(null);
    prismaMock.orchestratorTask.findMany.mockResolvedValue([]);
    prismaMock.missionPipeline.findMany.mockResolvedValue([]);
  });

  it('allows authenticated user when shadow Mission row still has guest createdByUserId', async () => {
    const missionId = 'mission-pipe-1';
    prismaMock.mission.findUnique.mockResolvedValue({
      createdByUserId: 'guest_abc123',
      tenantId: 'guest_abc123',
    });
    prismaMock.missionPipeline.findUnique.mockResolvedValue({
      tenantId: 'guest_abc123',
      createdBy: 'guest_abc123',
      targetType: 'store',
      targetId: 'store-biz-1',
      outputsJson: { draftId: 'draft-1' },
    });
    prismaMock.business.findUnique.mockResolvedValue({ userId: 'user-real-1' });

    const result = await resolveAccessibleMission(realUser, missionId);
    expect(result.ok).toBe(true);
    expect(result.kind).toBe('mission_pipeline');
  });

  it('allows real user on pipeline with guest createdBy (no shadow Mission row)', async () => {
    const missionId = 'mission-pipe-2';
    prismaMock.mission.findUnique.mockResolvedValue(null);
    prismaMock.missionPipeline.findUnique.mockResolvedValue({
      tenantId: 'guest_xyz',
      createdBy: 'guest_xyz',
    });

    const result = await resolveAccessibleMission(realUser, missionId);
    expect(result.ok).toBe(true);
    expect(result.kind).toBe('mission_pipeline');
  });

  it('denies unrelated user without store or guest link', async () => {
    const missionId = 'mission-pipe-3';
    prismaMock.mission.findUnique.mockResolvedValue(null);
    prismaMock.missionPipeline.findUnique.mockImplementation(({ select }) => {
      if (select?.targetType) {
        return {
          targetType: 'store',
          targetId: 'store-other',
          outputsJson: {},
        };
      }
      return { tenantId: 'other-tenant', createdBy: 'other-user' };
    });
    prismaMock.business.findUnique.mockResolvedValue({ userId: 'someone-else' });

    const result = await resolveAccessibleMission(realUser, missionId);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('FORBIDDEN');
  });

  it('allows guest session user on guest-owned pipeline', async () => {
    const missionId = 'mission-pipe-4';
    prismaMock.mission.findUnique.mockResolvedValue(null);
    prismaMock.missionPipeline.findUnique.mockResolvedValue({
      tenantId: 'guest_abc123',
      createdBy: 'guest_abc123',
    });

    const result = await resolveAccessibleMission(guestUser, missionId);
    expect(result.ok).toBe(true);
    expect(result.kind).toBe('mission_pipeline');
  });
});
