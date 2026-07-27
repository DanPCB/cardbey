/**
 * @vitest-environment node
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createReasoningResult } from '../../intent/utils.js';
import { planFromReasoning } from '../intentPlannerBridge.js';
import {
  deserializeClientDynamicPlan,
  dynamicPlanStepToPipelineRow,
  executeDynamicPlan,
  isDynamicPlannerExecutionEnabled,
  resolvePlanStepForExecution,
} from '../planExecutor.js';
import { serializeDynamicPlanForClient } from '../planConverters.js';

vi.mock('../../runtime/runtimeMissionOrchestrator.js', () => ({
  runNextStep: vi.fn(),
  runAllAvailableSteps: vi.fn(),
  runMissionUntilNextBlock: vi.fn(),
}));

vi.mock('../../prisma.js', () => ({
  getPrismaClient: vi.fn(),
}));

vi.mock('../../missionPipelineStepWriter.js', () => ({
  insertMissingPipelineSteps: vi.fn().mockResolvedValue({ inserted: 1, skipped: 0, mode: 'insert_missing' }),
}));

vi.mock('../planBlackboard.js', () => ({
  emitPlanStepStarted: vi.fn().mockResolvedValue(null),
  emitPlanStepCompleted: vi.fn().mockResolvedValue(null),
}));

describe('planExecutor', () => {
  /** @type {Record<string, string | undefined>} */
  let envSnapshot;

  beforeEach(() => {
    envSnapshot = { ...process.env };
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = envSnapshot;
  });

  it('isDynamicPlannerExecutionEnabled respects env flag', () => {
    process.env.ENABLE_DYNAMIC_PLANNER_EXECUTION = 'true';
    expect(isDynamicPlannerExecutionEnabled()).toBe(true);
    process.env.ENABLE_DYNAMIC_PLANNER_EXECUTION = 'false';
    expect(isDynamicPlannerExecutionEnabled()).toBe(false);
  });

  it('deserializeClientDynamicPlan rebuilds plan from serialized client payload', () => {
    const reasoning = createReasoningResult('create_store', 0.9, 'execute_tool', []);
    const generated = planFromReasoning(reasoning, { userId: 'user_1' });
    const serialized = serializeDynamicPlanForClient(generated.plan);
    const restored = deserializeClientDynamicPlan(serialized);

    expect(restored?.planId).toBe(generated.plan.planId);
    expect(restored?.steps.length).toBe(generated.plan.steps.length);
    expect(restored?.steps[0].label).toBe(generated.plan.steps[0].label);
  });

  it('dynamicPlanStepToPipelineRow maps checkpoint steps', () => {
    const row = dynamicPlanStepToPipelineRow(
      {
        id: 'step_2',
        name: 'upload_logo',
        label: 'Upload logo',
        type: 'checkpoint',
        tool: 'upload_logo',
        order: 2,
        optional: true,
        dependencies: [],
        estimatedDuration: 5,
        checkpointConfig: { type: 'upload', prompt: 'Upload', required: false },
      },
      'mission_1',
    );

    expect(row.missionId).toBe('mission_1');
    expect(row.orderIndex).toBe(1);
    expect(row.stepKind).toBe('checkpoint');
    expect(row.configJson.dynamicStepId).toBe('step_2');
  });

  it('resolvePlanStepForExecution picks forced step number', () => {
    const plan = {
      steps: [
        { id: 's1', order: 1, type: 'action', tool: 'a' },
        { id: 's2', order: 2, type: 'action', tool: 'b' },
      ],
    };
    expect(resolvePlanStepForExecution(plan, 2)?.id).toBe('s2');
  });

  it('executeDynamicPlan returns disabled when flag is off', async () => {
    process.env.ENABLE_DYNAMIC_PLANNER_EXECUTION = 'false';
    const reasoning = createReasoningResult('create_store', 0.9, 'execute_tool', []);
    const generated = planFromReasoning(reasoning, { userId: 'user_1' });

    const result = await executeDynamicPlan({
      plan: generated.plan,
      missionId: 'mission_1',
      user: { id: 'user_1' },
    });

    expect(result.ok).toBe(false);
    expect(result.code).toBe('EXECUTION_DISABLED');
  });

  it('executeDynamicPlan persists plan and calls runNextStep when enabled', async () => {
    process.env.ENABLE_DYNAMIC_PLANNER_EXECUTION = 'true';

    const update = vi.fn().mockResolvedValue({});
    const findUnique = vi
      .fn()
      .mockResolvedValueOnce({ metadataJson: { source: 'intake_v2' } })
      .mockResolvedValue({ metadataJson: {} });

    const { getPrismaClient } = await import('../../prisma.js');
    getPrismaClient.mockReturnValue({
      missionPipeline: { findUnique, update },
    });

    const { runNextStep } = await import('../../runtime/runtimeMissionOrchestrator.js');
    runNextStep.mockResolvedValue({
      ok: true,
      code: 'STEP_COMPLETED',
      stepNumber: 1,
      orchestrationStatus: 'idle',
      completedStepNumbers: [1],
    });

    const reasoning = createReasoningResult('create_store', 0.9, 'execute_tool', []);
    const generated = planFromReasoning(reasoning, { userId: 'user_1' });

    const result = await executeDynamicPlan({
      plan: generated.plan,
      missionId: 'mission_1',
      user: { id: 'user_1' },
      stepNumber: 1,
      planParameters: { storeName: 'Test Store' },
    });

    expect(result.ok).toBe(true);
    expect(result.status).toBe('executed');
    expect(runNextStep).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalled();
    const updateArg = update.mock.calls[0]?.[0];
    expect(updateArg?.data?.metadataJson?.dynamicPlanner?.planId).toBe(generated.plan.planId);
    expect(updateArg?.data?.metadataJson?.proactivePlanSteps?.length).toBeGreaterThan(0);
  });
});
