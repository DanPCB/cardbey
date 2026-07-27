import { describe, it, expect, vi, beforeEach } from 'vitest';

const prismaMock = {
  observation: {
    create: vi.fn(),
  },
  patternWeight: {
    upsert: vi.fn(),
  },
};

vi.mock('../prisma.js', () => ({
  getPrismaClient: vi.fn(() => prismaMock),
}));

import observationBus, {
  getObservationRingForTests,
  normalizeObservationLatencyMs,
  isObservationSloEligible,
  isObservationSuccessRateEligible,
  isInfrastructureSloFailure,
  isPermissionHookFailure,
  SLO_EXCLUDED_ACTION_TYPES,
} from './observationBus.js';
import { getPrismaClient } from '../prisma.js';

describe('observationBus', () => {
  beforeEach(() => {
    observationBus.resetForTests();
    vi.clearAllMocks();
    prismaMock.observation.create.mockResolvedValue({ id: 'obs_db_1' });
    prismaMock.patternWeight.upsert.mockResolvedValue({});
  });

  it('emits stubbed observation with execution state', async () => {
    await observationBus.emit({
      missionId: 'm-stub',
      intent: { type: 'deploy_to_cnet' },
      action: 'deploy_to_cnet',
      result: { success: true, stubbed: true, executionState: 'stubbed' },
      metadata: { stubbed: true, executionState: 'stubbed', latency: 12 },
    });

    const ring = getObservationRingForTests();
    expect(ring[0].executionState).toBe('stubbed');
    expect(ring[0].isRealExecution).toBe(false);
    expect(prismaMock.observation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          executionState: 'stubbed',
          isRealExecution: false,
        }),
      }),
    );
    expect(isObservationSuccessRateEligible(ring[0])).toBe(false);
  });

  it('emits success observation to ring and prisma', async () => {
    const created = await observationBus.emit({
      missionId: 'm1',
      intent: { type: 'publish_store' },
      action: 'publish_store',
      result: { success: true },
      metadata: { latency: 42, storeId: 'st1', confidence: 0.9 },
    });

    expect(created.id).toBe('obs_db_1');
    expect(prismaMock.observation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          missionId: 'm1',
          intentType: 'publish_store',
          actionType: 'publish_store',
          outcome: 'success',
          latency: 42,
        }),
      }),
    );

    const ring = getObservationRingForTests();
    expect(ring).toHaveLength(1);
    expect(ring[0].outcome).toBe('success');
  });

  it('emits failure observation and updates learning weights', async () => {
    prismaMock.observation.create.mockRejectedValueOnce(new Error('db down'));

    const row = await observationBus.emit({
      intent: { type: 'delete_product' },
      action: 'delete_product',
      result: { success: false, error: 'blocked' },
      metadata: { latency: 10 },
    });

    expect(row.outcome).toBe('failure');
    expect(getObservationRingForTests()).toHaveLength(1);

    const weights = observationBus.getLearningWeightsForTests();
    expect(weights.get('delete_product:delete_product')).toEqual({
      success: 0,
      failure: 1,
    });
    expect(getPrismaClient).toHaveBeenCalled();
  });

  it('getLatest falls back to ring when prisma unavailable', async () => {
    getPrismaClient.mockReturnValueOnce({});

    await observationBus.emit({
      intent: { type: 'diagnose_store' },
      action: 'diagnose_store',
      result: { success: true },
    });

    const latest = await observationBus.getLatest(5);
    expect(latest).toHaveLength(1);
    expect(latest[0].actionType).toBe('diagnose_store');
  });

  it('skips PatternWeight upsert when table is missing (non-fatal)', async () => {
    prismaMock.patternWeight.upsert.mockRejectedValueOnce(
      new Error('The table `public.PatternWeight` does not exist in the current database.'),
    );

    await observationBus.emit({
      intent: { type: 'create_store' },
      action: 'structured_store_build',
      result: { success: true },
      metadata: { latency: 50 },
    });

    expect(getObservationRingForTests()).toHaveLength(1);
    expect(prismaMock.patternWeight.upsert).toHaveBeenCalledTimes(1);

    prismaMock.patternWeight.upsert.mockClear();
    await observationBus.emit({
      intent: { type: 'create_store' },
      action: 'structured_store_build',
      result: { success: true },
    });
    expect(prismaMock.patternWeight.upsert).not.toHaveBeenCalled();
  });

  it('normalizes per-request latency and ignores cumulative duration', () => {
    expect(normalizeObservationLatencyMs({ latency: 120 })).toBe(120);
    expect(normalizeObservationLatencyMs({ latencyMs: 2500 })).toBe(2500);
    expect(normalizeObservationLatencyMs({ duration: 80_640 })).toBeNull();
    expect(normalizeObservationLatencyMs({ latency: 200_000 })).toBe(120_000);
  });

  it('tags pipeline actions as SLO-ineligible in context snapshot', async () => {
    await observationBus.emit({
      intent: { type: 'run_pipeline_step' },
      action: 'pipeline:run_next_step',
      result: { success: true },
      metadata: { latency: 60_000, sloEligible: false },
    });

    expect(SLO_EXCLUDED_ACTION_TYPES.has('run_pipeline_step')).toBe(true);
    expect(prismaMock.observation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          contextSnapshot: expect.objectContaining({ sloEligible: false }),
        }),
      }),
    );
  });

  it('excludes pipeline intent from SLO eligibility even when action is a tool id', () => {
    expect(
      isObservationSloEligible({
        actionType: 'pipeline:run_next_step',
        intentType: 'run_pipeline_step',
        latency: 80_640,
      }),
    ).toBe(false);
    expect(
      isObservationSloEligible({
        actionType: 'publish_store',
        intentType: 'dispatch_tool',
        latency: 120,
      }),
    ).toBe(true);
    expect(
      isObservationSloEligible({
        actionType: 'dispatch_tool',
        intentType: 'create_campaign',
        contextSnapshot: { source: 'performer_intake_v2' },
        latency: 95_803,
      }),
    ).toBe(false);
  });

  it('excludes infrastructure failures from success-rate SLO', () => {
    expect(isInfrastructureSloFailure('Circuit skill_execution is open')).toBe(true);
    expect(isInfrastructureSloFailure('Agent analytics_agent is not healthy')).toBe(true);
    expect(
      isObservationSuccessRateEligible({
        outcome: 'failure',
        error: 'Circuit skill_execution is open',
        actionType: 'skill:analyze_store',
        intentType: 'run_skill',
      }),
    ).toBe(false);
    expect(
      isObservationSuccessRateEligible({
        outcome: 'success',
        actionType: 'skill:analyze_store',
        intentType: 'run_skill',
      }),
    ).toBe(true);
  });

  it('excludes permission hook probe failures from success-rate SLO', () => {
    expect(
      isObservationSuccessRateEligible({
        outcome: 'failure',
        error: 'Critical hook validate_permissions failed: User dev-admin does not have access to store test',
        actionType: 'skill:analyze_store',
        intentType: 'run_skill',
        contextSnapshot: { userId: 'dev-admin', storeId: 'test', source: 'skill_route_execute' },
      }),
    ).toBe(false);
  });
});
