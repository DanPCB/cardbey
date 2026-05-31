/**
 * Runtime Skill / Worker execution — unit + integration tests (Phase D).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getPrismaClient } from '../src/lib/prisma.js';
import { resetDb } from '../src/test/helpers/resetDb.js';
import { resetRuntimeCapabilitiesForTests } from '../src/lib/runtime/runtimeCapabilitiesService.js';
import {
  getRuntimeSkill,
  resolveSkillIdForTool,
  SKILL_TYPE,
} from '../src/lib/runtime/skills/runtimeSkillRegistry.js';
import { resolveSkillForGraphNode } from '../src/lib/runtime/skills/runtimeSkillResolver.js';
import {
  acquireExecutionLease,
  getActiveLeaseForNode,
  releaseExecutionLease,
  LEASE_STATUS,
} from '../src/lib/runtime/workers/runtimeWorkerLease.js';
import {
  createWorker,
  getWorkerById,
  markWorkerRunning,
  touchWorkerHeartbeat,
  markWorkerFailed,
  readRuntimeWorkerState,
  WORKER_STATUS,
} from '../src/lib/runtime/workers/runtimeWorkerManager.js';
import { createWorkerContext } from '../src/lib/runtime/workers/runtimeWorkerContext.js';
import { isRuntimeSkillExecutionEnabled } from '../src/lib/runtime/skills/runtimeSkillExecutor.js';
import { attachArtifactToGraphNode } from '../src/lib/runtime/runtimeGraphArtifactLineage.js';
import { graphFromLinearPlan } from '../src/lib/runtime/runtimeMissionGraphService.js';
import { runNextStep } from '../src/lib/runtime/runtimeMissionOrchestrator.js';
import { NODE_STATUS, EXECUTION_MODE } from '../src/lib/runtime/runtimeGraphTypes.js';
import { categorizeStreamEvent } from '../src/lib/runtime/performerRuntime/unifiedRuntimeStream.js';
import { analyzeGraphSchedule } from '../src/lib/runtime/runtimeGraphScheduler.js';

const dbAvailable = (() => {
  try {
    getPrismaClient();
    return true;
  } catch {
    return false;
  }
})();

const ALL_FLAGS = {
  ENABLE_RUNTIME_MISSION_ORCHESTRATOR: 'true',
  ENABLE_RUNTIME_MISSION_GRAPH: 'true',
  ENABLE_RUNTIME_GRAPH_SCHEDULER: 'true',
  ENABLE_RUNTIME_SKILL_RUNTIME: 'true',
  ENABLE_RUNTIME_WORKER_MANAGER: 'true',
  ENABLE_RUNTIME_EXECUTION_LEASES: 'true',
  ENABLE_RUNTIME_STEP_EXECUTION: 'true',
  ENABLE_PERFORMER_RUNTIME_KERNEL: 'true',
  ENABLE_SHARED_RUNTIME_TOOL_REGISTRY: 'true',
};

const GRAPH_ONLY_FLAGS = {
  ENABLE_RUNTIME_MISSION_ORCHESTRATOR: 'true',
  ENABLE_RUNTIME_MISSION_GRAPH: 'true',
  ENABLE_RUNTIME_GRAPH_SCHEDULER: 'true',
  ENABLE_RUNTIME_STEP_EXECUTION: 'true',
  ENABLE_PERFORMER_RUNTIME_KERNEL: 'true',
  ENABLE_SHARED_RUNTIME_TOOL_REGISTRY: 'true',
};

const LINEAR_PLAN = [
  { step: 1, title: 'Analyze', recommendedTool: 'analyze_store', parameters: { storeId: 's1' } },
  { step: 2, title: 'Promo', recommendedTool: 'create_promotion', parameters: { storeId: 's1' } },
];

const { executeMissionStepMock, appendEventMock } = vi.hoisted(() => ({
  executeMissionStepMock: vi.fn(),
  appendEventMock: vi.fn(async () => ({ ok: true, seq: 1 })),
}));

vi.mock('../src/lib/runtime/performerRuntimeKernel.js', () => ({
  executeMissionStep: (...args) => executeMissionStepMock(...args),
  isRuntimeStepExecutionEnabled: () => true,
}));

vi.mock('../src/lib/missionBlackboard.js', () => ({
  appendEvent: (...args) => appendEventMock(...args),
}));

describe('runtimeSkillRuntime — registry & resolver (unit)', () => {
  it('resolves skill from tool name', () => {
    expect(resolveSkillIdForTool('analyze_store')).toBe(SKILL_TYPE.ANALYSIS);
    expect(resolveSkillIdForTool('create_promotion')).toBe(SKILL_TYPE.CAMPAIGN_GENERATION);
    const skill = getRuntimeSkill(SKILL_TYPE.DESIGN_GENERATION);
    expect(skill.supportedTools).toContain('generate_poster');
  });

  it('resolves skill for graph node via assignedTool', () => {
    const node = {
      nodeId: 'node-step-1',
      assignedTool: 'analyze_store',
      assignedAgent: null,
      metadata: { stepNumber: 1 },
    };
    const resolved = resolveSkillForGraphNode(node);
    expect(resolved.skill?.skillId).toBe(SKILL_TYPE.ANALYSIS);
    expect(resolved.resolvedVia).toBe('assignedTool');
  });

  it('resolves skill for graph node via assignedAgent', () => {
    const node = {
      nodeId: 'node-copy',
      assignedTool: 'create_promotion',
      assignedAgent: 'copyAgent',
      metadata: {},
    };
    const resolved = resolveSkillForGraphNode(node);
    expect(resolved.skill?.skillId).toBe(SKILL_TYPE.COPY_GENERATION);
    expect(resolved.resolvedVia).toBe('assignedAgent');
  });
});

describe('runtimeSkillRuntime — leases (unit)', () => {
  beforeEach(() => {
    Object.assign(process.env, ALL_FLAGS);
    resetRuntimeCapabilitiesForTests();
  });

  afterEach(() => {
    resetRuntimeCapabilitiesForTests();
  });

  it('acquires and releases execution lease', () => {
    let meta = {};
    const acquired = acquireExecutionLease(meta, { nodeId: 'node-1', ownerId: 'owner-a' });
    expect(acquired.ok).toBe(true);
    expect(acquired.lease.status).toBe(LEASE_STATUS.ACTIVE);
    meta = acquired.metadata;

    const active = getActiveLeaseForNode(meta, 'node-1');
    expect(active?.ownerId).toBe('owner-a');

    meta = releaseExecutionLease(meta, active.leaseId);
    expect(getActiveLeaseForNode(meta, 'node-1')).toBeNull();
  });

  it('blocks lease when held by another owner', () => {
    let meta = {};
    const first = acquireExecutionLease(meta, { nodeId: 'node-1', ownerId: 'owner-a' });
    meta = first.metadata;
    const second = acquireExecutionLease(meta, { nodeId: 'node-1', ownerId: 'owner-b' });
    expect(second.ok).toBe(false);
    expect(second.code).toBe('LEASE_HELD');
  });
});

describe('runtimeSkillRuntime — worker manager (unit)', () => {
  it('creates worker and updates heartbeat', () => {
    const skill = getRuntimeSkill(SKILL_TYPE.ANALYSIS);
    const { worker, metadata } = createWorker({}, {
      graphId: 'g1',
      nodeId: 'node-1',
      assignedSkill: skill,
    });
    expect(worker.workerId).toBeTruthy();
    expect(worker.status).toBe(WORKER_STATUS.PENDING);

    let meta = markWorkerRunning(metadata, worker.workerId);
    const running = getWorkerById(meta, worker.workerId);
    expect(running.status).toBe(WORKER_STATUS.RUNNING);
    expect(running.startedAt).toBeTruthy();

    meta = touchWorkerHeartbeat(meta, worker.workerId);
    const heartbeat = getWorkerById(meta, worker.workerId);
    expect(heartbeat.heartbeatAt).toBeTruthy();
    expect(Date.parse(heartbeat.heartbeatAt)).toBeGreaterThanOrEqual(Date.parse(running.startedAt));
  });

  it('creates worker context with mission scope', () => {
    const graph = graphFromLinearPlan('m1', LINEAR_PLAN, { targetId: 's1', targetType: 'store' });
    const node = graph.nodes[0];
    const skill = getRuntimeSkill(SKILL_TYPE.ANALYSIS);
    const ctx = createWorkerContext({
      missionId: 'm1',
      graphId: graph.graphId,
      node,
      skill,
      workerId: 'w1',
      leaseId: 'lease-1',
      row: { targetId: 's1', targetType: 'store' },
      metadataJson: { storeId: 's1', runtimeMissionGraph: graph },
    });
    expect(ctx.missionId).toBe('m1');
    expect(ctx.targetContext.storeId).toBe('s1');
    expect(ctx.skillId).toBe(SKILL_TYPE.ANALYSIS);
    expect(ctx.executionScope.stepNumber).toBe(1);
  });
});

describe('runtimeSkillRuntime — artifact lineage (unit)', () => {
  it('includes workerId and skillId on artifact records', () => {
    const graph = graphFromLinearPlan('m-art', LINEAR_PLAN.slice(0, 1));
    const next = attachArtifactToGraphNode(graph, {
      nodeId: 'node-step-1',
      artifactRef: 'promotion:p1',
      artifactType: 'create_promotion',
      workerId: 'worker-1',
      skillId: SKILL_TYPE.CAMPAIGN_GENERATION,
      targetId: 's1',
    });
    expect(next.artifactLineage[0].workerId).toBe('worker-1');
    expect(next.artifactLineage[0].skillId).toBe(SKILL_TYPE.CAMPAIGN_GENERATION);
  });
});

describe('runtimeSkillRuntime — stream categorization (unit)', () => {
  it('categorizes worker and skill events as orchestration', () => {
    expect(categorizeStreamEvent('runtime.worker.started')).toBe('orchestration');
    expect(categorizeStreamEvent('runtime.worker.heartbeat')).toBe('orchestration');
    expect(categorizeStreamEvent('runtime.skill.executing')).toBe('orchestration');
    expect(categorizeStreamEvent('runtime.skill.completed')).toBe('orchestration');
  });
});

describe('runtimeSkillRuntime — scheduler isolation (unit)', () => {
  it('scheduler returns executable nodes without executing', () => {
    const graph = graphFromLinearPlan('m-sched', LINEAR_PLAN);
    const analysis = analyzeGraphSchedule(graph);
    expect(analysis.executableNodes).toHaveLength(1);
    expect(executeMissionStepMock).not.toHaveBeenCalled();
  });
});

describe.skipIf(!dbAvailable)('runtimeSkillRuntime — orchestrator integration', () => {
  let prisma;
  let user;

  beforeEach(async () => {
    Object.assign(process.env, ALL_FLAGS);
    resetRuntimeCapabilitiesForTests();
    appendEventMock.mockClear();
    executeMissionStepMock.mockReset();
    executeMissionStepMock.mockImplementation(async ({ missionId, stepNumber, requestedTool, body }) => {
      expect(body?.workerId).toBeTruthy();
      expect(body?.skillId).toBeTruthy();
      expect(body?.workerContext).toBeTruthy();

      const p = getPrismaClient();
      const row = await p.missionPipeline.findUnique({ where: { id: missionId } });
      const { mergeProactiveStepStatus } = await import('../src/lib/runtime/runtimeStepState.js');
      const meta = row?.metadataJson && typeof row.metadataJson === 'object' ? row.metadataJson : {};
      const nextMeta = mergeProactiveStepStatus(meta, stepNumber, {
        status: 'completed',
        tool: requestedTool,
      });
      await p.missionPipeline.update({
        where: { id: missionId },
        data: { metadataJson: nextMeta },
      });
      return {
        ok: true,
        httpStatus: 200,
        stepStatus: 'completed',
        output: { artifactRef: `output:step-${stepNumber}`, summary: 'ok' },
      };
    });

    prisma = getPrismaClient();
    await resetDb(prisma);
    user = await prisma.user.create({
      data: {
        email: 'skill-test@example.com',
        passwordHash: 'hash',
        displayName: 'Skill Test',
        roles: '["viewer"]',
      },
    });
  });

  afterEach(async () => {
    resetRuntimeCapabilitiesForTests();
    delete process.env.ENABLE_RUNTIME_SKILL_RUNTIME;
    delete process.env.ENABLE_RUNTIME_WORKER_MANAGER;
    delete process.env.ENABLE_RUNTIME_EXECUTION_LEASES;
    if (dbAvailable) await resetDb(prisma);
  });

  async function createMission(metadataJson = {}) {
    return prisma.missionPipeline.create({
      data: {
        type: 'launch_campaign',
        title: 'Skill runtime test',
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
          proactivePlanSteps: LINEAR_PLAN,
          ...metadataJson,
        },
      },
    });
  }

  it('isRuntimeSkillExecutionEnabled when all skill flags on', () => {
    expect(isRuntimeSkillExecutionEnabled()).toBe(true);
  });

  it('executes graph node through skill runtime with worker + lease', async () => {
    const mission = await createMission();
    const result = await runNextStep({ user, missionId: mission.id, source: 'test', traceId: 't1' });

    expect(result.orchestrationMode).toBe('graph');
    expect(result.ok).toBe(true);
    expect(result.workerId).toBeTruthy();
    expect(result.skillId).toBe(SKILL_TYPE.ANALYSIS);
    expect(result.executionMode).toBe('skill_runtime');

    const row = await prisma.missionPipeline.findUnique({ where: { id: mission.id } });
    const workerState = readRuntimeWorkerState(row.metadataJson);
    expect(workerState.workers.length).toBeGreaterThan(0);
    expect(workerState.workers[0].status).toBe(WORKER_STATUS.COMPLETED);
    expect(workerState.leases.length).toBeGreaterThan(0);
    expect(workerState.leases[0].status).toBe(LEASE_STATUS.RELEASED);
  });

  it('emits worker and skill lifecycle events', async () => {
    const mission = await createMission();
    await runNextStep({ user, missionId: mission.id, source: 'test' });

    const types = appendEventMock.mock.calls.map((c) => c[1]);
    expect(types).toContain('runtime.worker.started');
    expect(types).toContain('runtime.worker.heartbeat');
    expect(types).toContain('runtime.worker.completed');
    expect(types).toContain('runtime.skill.executing');
    expect(types).toContain('runtime.skill.completed');
  });

  it('artifact lineage includes worker and skill ids', async () => {
    const mission = await createMission();
    await runNextStep({ user, missionId: mission.id, source: 'test' });

    const row = await prisma.missionPipeline.findUnique({ where: { id: mission.id } });
    const graph = row.metadataJson.runtimeMissionGraph;
    expect(graph.artifactLineage.length).toBeGreaterThan(0);
    expect(graph.artifactLineage[0].workerId).toBeTruthy();
    expect(graph.artifactLineage[0].skillId).toBe(SKILL_TYPE.ANALYSIS);
  });

  it('failed worker updates node state and emits failure events', async () => {
    executeMissionStepMock.mockResolvedValueOnce({
      ok: false,
      httpStatus: 500,
      code: 'TOOL_FAILED',
      message: 'simulated failure',
    });

    const mission = await createMission();
    const result = await runNextStep({ user, missionId: mission.id, source: 'test' });

    expect(result.ok).toBe(false);
    expect(result.workerId).toBeTruthy();

    const row = await prisma.missionPipeline.findUnique({ where: { id: mission.id } });
    const node = row.metadataJson.runtimeMissionGraph.nodes.find((n) => n.nodeId === 'node-step-1');
    expect(node.status).toBe(NODE_STATUS.FAILED);

    const worker = readRuntimeWorkerState(row.metadataJson).workers[0];
    expect(worker.status).toBe(WORKER_STATUS.FAILED);

    const types = appendEventMock.mock.calls.map((c) => c[1]);
    expect(types).toContain('runtime.worker.failed');
  });

  it('retryable node marks failure as retryable per skill policy', async () => {
    executeMissionStepMock.mockResolvedValueOnce({
      ok: false,
      httpStatus: 500,
      code: 'TRANSIENT',
      message: 'retry me',
    });

    const mission = await createMission({
      proactivePlanSteps: [
        {
          step: 1,
          title: 'Analyze',
          recommendedTool: 'analyze_store',
          executionMode: EXECUTION_MODE.RETRYABLE,
        },
      ],
    });
    const result = await runNextStep({ user, missionId: mission.id, source: 'test' });
    expect(result.retryable).toBe(true);
    expect(result.code).toBe('SKILL_EXECUTION_RETRYABLE');
  });

  it('falls back to Phase C direct execution when skill flags disabled', async () => {
    Object.assign(process.env, GRAPH_ONLY_FLAGS);
    delete process.env.ENABLE_RUNTIME_SKILL_RUNTIME;
    delete process.env.ENABLE_RUNTIME_WORKER_MANAGER;
    delete process.env.ENABLE_RUNTIME_EXECUTION_LEASES;
    resetRuntimeCapabilitiesForTests();

    executeMissionStepMock.mockImplementation(async ({ missionId, stepNumber, requestedTool }) => {
      const p = getPrismaClient();
      const row = await p.missionPipeline.findUnique({ where: { id: missionId } });
      const { mergeProactiveStepStatus } = await import('../src/lib/runtime/runtimeStepState.js');
      const meta = row?.metadataJson && typeof row.metadataJson === 'object' ? row.metadataJson : {};
      const nextMeta = mergeProactiveStepStatus(meta, stepNumber, {
        status: 'completed',
        tool: requestedTool,
      });
      await p.missionPipeline.update({
        where: { id: missionId },
        data: { metadataJson: nextMeta },
      });
      return { ok: true, httpStatus: 200, stepStatus: 'completed', output: { summary: 'ok' } };
    });

    const mission = await createMission();
    const result = await runNextStep({ user, missionId: mission.id, source: 'test' });

    expect(result.ok).toBe(true);
    expect(result.executionMode).toBeUndefined();
    expect(result.workerId).toBeUndefined();
    expect(executeMissionStepMock.mock.calls[0][0].body?.workerId).toBeUndefined();
  });
});
