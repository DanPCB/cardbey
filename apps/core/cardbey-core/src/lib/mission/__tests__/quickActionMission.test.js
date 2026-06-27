/**
 * @vitest-environment node
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createMissionFromQuickAction,
  generateQuickActionPlan,
  getStepsForActionType,
  isQuickActionMissionCreationEnabled,
} from '../quickActionMission.js';

vi.mock('../../missionPipelineService.js', () => ({
  createMissionPipeline: vi.fn(),
}));

vi.mock('../../missionPipelineStepWriter.js', () => ({
  insertMissingPipelineSteps: vi.fn().mockResolvedValue({ inserted: 2, skipped: 0, mode: 'insert_missing' }),
}));

vi.mock('../../context/contextEngine.js', () => ({
  getContextProvider: vi.fn(),
  isContextEngineEnabled: vi.fn(() => false),
}));

describe('quickActionMission', () => {
  /** @type {Record<string, string | undefined>} */
  let envSnapshot;

  beforeEach(() => {
    envSnapshot = { ...process.env };
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = envSnapshot;
  });

  it('isQuickActionMissionCreationEnabled respects disable flag', () => {
    delete process.env.DISABLE_QUICK_ACTION_MISSION_CREATION;
    expect(isQuickActionMissionCreationEnabled()).toBe(true);
    process.env.DISABLE_QUICK_ACTION_MISSION_CREATION = 'true';
    expect(isQuickActionMissionCreationEnabled()).toBe(false);
  });

  it('creates a mission from quick action', async () => {
    const { createMissionPipeline } = await import('../../missionPipelineService.js');
    createMissionPipeline.mockResolvedValue({
      id: 'mission_123',
      status: 'requested',
      stepsCreated: 2,
    });

    const mockContextProvider = {
      updateContext: vi.fn().mockResolvedValue({}),
    };

    const result = await createMissionFromQuickAction({
      storeId: 'store_123',
      actionType: 'create_offer',
      source: 'quick_action_pill',
      intentText: 'Create a promotion graphic',
      label: 'Create promotion graphic',
      userId: 'user_123',
      sessionId: 'session_123',
      contextProvider: mockContextProvider,
    });

    expect(result.missionId).toBe('mission_123');
    expect(createMissionPipeline).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'launch_campaign',
        targetType: 'store',
        targetId: 'store_123',
        executionMode: 'GUIDED_RUN',
        createdBy: 'user_123',
      }),
    );
    expect(mockContextProvider.updateContext).toHaveBeenCalledWith(
      'user_123',
      'session_123',
      expect.objectContaining({
        activeMissionId: 'mission_123',
        activeStoreId: 'store_123',
      }),
    );
  });

  it('generates steps for create_promotion_graphic', () => {
    const steps = getStepsForActionType('create_promotion_graphic', 'store_123');
    expect(steps.length).toBe(3);
    expect(steps[0].tool).toBe('analyze_store');
    expect(steps[1].tool).toBe('create_promotion_graphic');
    expect(steps[2].kind).toBe('checkpoint');
  });

  it('generateQuickActionPlan inserts pipeline steps', async () => {
    const update = vi.fn().mockResolvedValue({});
    const prisma = { missionPipeline: { update } };

    const steps = await generateQuickActionPlan({
      missionId: 'mission_123',
      actionType: 'create_offer',
      storeId: 'store_123',
      prisma,
    });

    expect(steps).toHaveLength(2);
    const { insertMissingPipelineSteps } = await import('../../missionPipelineStepWriter.js');
    expect(insertMissingPipelineSteps).toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith({
      where: { id: 'mission_123' },
      data: { progressTotalSteps: 2 },
    });
  });

  it('handles missing contextProvider gracefully', async () => {
    const { createMissionPipeline } = await import('../../missionPipelineService.js');
    createMissionPipeline.mockResolvedValue({
      id: 'mission_123',
      status: 'requested',
      stepsCreated: 1,
    });

    const result = await createMissionFromQuickAction({
      storeId: 'store_123',
      actionType: 'create_offer',
      source: 'quick_action_pill',
      intentText: 'Create a promotion graphic',
      userId: 'user_123',
      sessionId: 'session_123',
      contextProvider: null,
    });

    expect(result.missionId).toBe('mission_123');
  });

  it('handles unknown actionType with default step', () => {
    const steps = getStepsForActionType('unknown_action', 'store_123');
    expect(steps).toHaveLength(1);
    expect(steps[0].tool).toBe('general_chat');
  });
});
