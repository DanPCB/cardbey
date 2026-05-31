/**
 * Runtime Mission Orchestrator — unit tests.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getPrismaClient } from '../src/lib/prisma.js';
import { resetDb } from '../src/test/helpers/resetDb.js';
import {
  runNextStep,
  runAllAvailableSteps,
} from '../src/lib/runtime/runtimeMissionOrchestrator.js';
import { resetRuntimeCapabilitiesForTests } from '../src/lib/runtime/runtimeCapabilitiesService.js';
import { hydrateCompletedStepNumbers } from '../src/lib/runtime/runtimeStepState.js';
import {
  normalizePlanSteps,
  readProactivePlanSteps,
} from '../src/lib/runtime/runtimeOrchestrationState.js';

const dbAvailable = (() => {
  try {
    getPrismaClient();
    return true;
  } catch {
    return false;
  }
})();

const ORCH_FLAGS = {
  ENABLE_RUNTIME_MISSION_ORCHESTRATOR: 'true',
  ENABLE_RUNTIME_STEP_EXECUTION: 'true',
  ENABLE_PERFORMER_RUNTIME_KERNEL: 'true',
  ENABLE_SHARED_RUNTIME_TOOL_REGISTRY: 'true',
};

const { executeMissionStepMock } = vi.hoisted(() => ({
  executeMissionStepMock: vi.fn(),
}));

vi.mock('../src/lib/runtime/performerRuntimeKernel.js', () => ({
  executeMissionStep: (...args) => executeMissionStepMock(...args),
  isRuntimeStepExecutionEnabled: () => true,
}));

vi.mock('../src/lib/missionBlackboard.js', () => ({
  appendEvent: vi.fn(async () => ({ ok: true, seq: 1 })),
}));

const PLAN = [
  { step: 1, title: 'Analyze', recommendedTool: 'analyze_store', parameters: { storeId: 's1' } },
  { step: 2, title: 'Promo', recommendedTool: 'create_promotion', parameters: { storeId: 's1' } },
];

describe.skipIf(!dbAvailable)('runtimeMissionOrchestrator', () => {
  let prisma;
  let user;

  beforeEach(async () => {
    Object.assign(process.env, ORCH_FLAGS);
    resetRuntimeCapabilitiesForTests();
    executeMissionStepMock.mockReset();
    executeMissionStepMock.mockImplementation(async ({ missionId, stepNumber, requestedTool }) => {
      const prisma = getPrismaClient();
      const row = await prisma.missionPipeline.findUnique({ where: { id: missionId } });
      if (!row) {
        return { ok: false, httpStatus: 404, code: 'NOT_FOUND', message: 'missing' };
      }
      const { mergeProactiveStepStatus } = await import('../src/lib/runtime/runtimeStepState.js');
      const meta = row.metadataJson && typeof row.metadataJson === 'object' ? row.metadataJson : {};
      const nextMeta = mergeProactiveStepStatus(meta, stepNumber, {
        status: 'completed',
        tool: requestedTool,
        requestedTool,
      });
      await prisma.missionPipeline.update({
        where: { id: missionId },
        data: { metadataJson: nextMeta },
      });
      return {
        ok: true,
        httpStatus: 200,
        stepStatus: 'completed',
        output: { summary: 'ok' },
      };
    });
    prisma = getPrismaClient();
    await resetDb(prisma);
    user = await prisma.user.create({
      data: {
        email: 'orch-test@example.com',
        passwordHash: 'hash',
        displayName: 'Orch Test',
        roles: '["viewer"]',
      },
    });
  });

  afterEach(async () => {
    resetRuntimeCapabilitiesForTests();
    delete process.env.ENABLE_RUNTIME_TARGET_READINESS;
    if (dbAvailable) await resetDb(prisma);
  });

  async function createGuidedMission(metadataJson = {}) {
    return prisma.missionPipeline.create({
      data: {
        type: 'launch_campaign',
        title: 'Orchestrator test',
        status: 'executing',
        runState: 'idle',
        targetType: 'store',
        targetId: 's1',
        executionMode: 'GUIDED_RUN',
        requiresConfirmation: false,
        createdBy: user.id,
        tenantId: user.id,
        metadataJson: {
          storeId: 's1',
          proactivePlanSteps: PLAN,
          ...metadataJson,
        },
      },
    });
  }

  it('selects first pending step on run-next', async () => {
    const mission = await createGuidedMission();
    const result = await runNextStep({ user, missionId: mission.id, source: 'test' });

    expect(result.ok).toBe(true);
    expect(result.stepNumber).toBe(1);
    expect(executeMissionStepMock).toHaveBeenCalledTimes(1);
    expect(executeMissionStepMock.mock.calls[0][0].stepNumber).toBe(1);
    expect(executeMissionStepMock.mock.calls[0][0].requestedTool).toBe('analyze_store');
  });

  it('skips completed steps', async () => {
    const mission = await createGuidedMission({
      proactiveStepStatus: {
        '1': { status: 'completed', tool: 'analyze_store', stepNumber: 1 },
      },
    });

    const result = await runNextStep({ user, missionId: mission.id, source: 'test' });
    expect(result.ok).toBe(true);
    expect(result.stepNumber).toBe(2);
    expect(executeMissionStepMock).toHaveBeenCalledTimes(1);
    expect(executeMissionStepMock.mock.calls[0][0].stepNumber).toBe(2);
  });

  it('run-all stops at prerequisite block', async () => {
    executeMissionStepMock.mockResolvedValueOnce({
      ok: false,
      httpStatus: 412,
      code: 'PREREQUISITE_REQUIRED',
      prerequisiteBlocked: true,
      blockingReason: 'store_required',
      stepStatus: 'blocked',
    });

    const mission = await createGuidedMission();
    const result = await runAllAvailableSteps({ user, missionId: mission.id, source: 'test' });

    expect(result.blocked).toBe(true);
    expect(result.code).toBe('PREREQUISITE_REQUIRED');
    expect(executeMissionStepMock).toHaveBeenCalledTimes(1);
  });

  it('run-all stops at readiness block when target readiness enabled', async () => {
    process.env.ENABLE_RUNTIME_TARGET_READINESS = 'true';
    resetRuntimeCapabilitiesForTests();

    const mission = await createGuidedMission({
      proactivePlanSteps: [
        { step: 1, title: 'Promo', recommendedTool: 'create_promotion', parameters: {} },
      ],
    });

    const result = await runAllAvailableSteps({ user, missionId: mission.id, source: 'test' });

    expect(result.blocked).toBe(true);
    expect(result.code).toBe('READINESS_BLOCKED');
    expect(executeMissionStepMock).not.toHaveBeenCalled();
  });

  it('run-next executes exactly one step even when more pending', async () => {
    executeMissionStepMock.mockResolvedValueOnce({
      ok: true,
      httpStatus: 200,
      stepStatus: 'completed',
      output: {},
    });

    const mission = await createGuidedMission();
    const result = await runNextStep({ user, missionId: mission.id, source: 'test' });

    expect(result.ok).toBe(true);
    expect(executeMissionStepMock).toHaveBeenCalledTimes(1);
    expect(result.stepsExecuted?.length ?? 1).toBeLessThanOrEqual(1);
  });

  it('persists orchestrationState and completed steps after refresh', async () => {
    const mission = await createGuidedMission();
    await runNextStep({ user, missionId: mission.id, source: 'test' });

    const refreshed = await prisma.missionPipeline.findUnique({
      where: { id: mission.id },
      select: { metadataJson: true },
    });
    const completed = hydrateCompletedStepNumbers(refreshed.metadataJson);
    expect(completed).toContain(1);
    expect(refreshed.metadataJson.orchestrationState).toBeTruthy();
    expect(refreshed.metadataJson.orchestrationState.activeStepNumber).toBeDefined();
  });

  it('returns idempotent completion when forced step already completed', async () => {
    const mission = await createGuidedMission({
      proactiveStepStatus: {
        '1': { status: 'completed', tool: 'analyze_store', stepNumber: 1 },
      },
    });

    const result = await runNextStep({
      user,
      missionId: mission.id,
      source: 'test',
      stepNumber: 1,
    });

    expect(result.ok).toBe(true);
    expect(result.code === 'NO_PENDING_STEPS' || result.code === 'ORCHESTRATION_COMPLETED').toBe(true);
    expect(executeMissionStepMock).not.toHaveBeenCalled();
  });

  it('normalizes proactive plan steps from metadata', () => {
    const steps = normalizePlanSteps([
      { step: 2, title: 'B', recommendedTool: 'create_promotion' },
      { step: 1, title: 'A', recommendedTool: 'analyze_store' },
    ]);
    expect(steps.map((s) => s.step)).toEqual([1, 2]);
    const read = readProactivePlanSteps({ proactivePlanSteps: steps });
    expect(read.length).toBe(2);
  });
});

describe('runtimeMissionOrchestrator capability gate', () => {
  beforeEach(() => {
    resetRuntimeCapabilitiesForTests();
    delete process.env.ENABLE_RUNTIME_MISSION_ORCHESTRATOR;
  });

  it('returns 503 when orchestrator capability disabled', async () => {
    const result = await runNextStep({
      user: { id: 'u1' },
      missionId: 'm1',
      source: 'test',
    });
    expect(result.httpStatus).toBe(503);
    expect(result.code).toBe('RUNTIME_CAPABILITY_UNAVAILABLE');
  });
});
