/**
 * Durable execution queue + recovery — unit + integration tests (Phase E).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getPrismaClient } from '../src/lib/prisma.js';
import { resetDb } from '../src/test/helpers/resetDb.js';
import { resetRuntimeCapabilitiesForTests } from '../src/lib/runtime/runtimeCapabilitiesService.js';
import {
  enqueueGraphNode,
  claimNextQueueItem,
  markQueueItemCompleted,
  requeueQueueItem,
  QUEUE_STATUS,
  isRuntimeDurableExecutionEnabled,
} from '../src/lib/runtime/queue/runtimeExecutionQueue.js';
import { readExecutionQueue } from '../src/lib/runtime/queue/runtimeQueuePersistence.js';
import {
  isReplayBlocked,
  recordReplayCompletion,
  buildReplayProtectionKey,
} from '../src/lib/runtime/recovery/runtimeNodeReplayProtection.js';
import { scanHeartbeatAndLeases } from '../src/lib/runtime/recovery/runtimeHeartbeatMonitor.js';
import { recoverExpiredLeases } from '../src/lib/runtime/recovery/runtimeLeaseRecoveryService.js';
import {
  runRecoveryPass,
  detectOrphanWorkers,
} from '../src/lib/runtime/recovery/runtimeWorkerRecoveryService.js';
import {
  createWorker,
  markWorkerRunning,
  readRuntimeWorkerState,
  WORKER_STATUS,
} from '../src/lib/runtime/workers/runtimeWorkerManager.js';
import {
  acquireExecutionLease,
  LEASE_STATUS,
} from '../src/lib/runtime/workers/runtimeWorkerLease.js';
import { graphFromLinearPlan } from '../src/lib/runtime/runtimeMissionGraphService.js';
import { patchGraphNode, markNodeCompleted } from '../src/lib/runtime/runtimeGraphExecutionState.js';
import { attachArtifactToGraphNode } from '../src/lib/runtime/runtimeGraphArtifactLineage.js';
import { runNextStep } from '../src/lib/runtime/runtimeMissionOrchestrator.js';
import { NODE_STATUS } from '../src/lib/runtime/runtimeGraphTypes.js';
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
  ENABLE_RUNTIME_EXECUTION_QUEUE: 'true',
  ENABLE_RUNTIME_LEASE_RECOVERY: 'true',
  ENABLE_RUNTIME_REPLAY_PROTECTION: 'true',
  ENABLE_RUNTIME_HEARTBEAT_MONITOR: 'true',
  ENABLE_RUNTIME_STEP_EXECUTION: 'true',
  ENABLE_PERFORMER_RUNTIME_KERNEL: 'true',
  ENABLE_SHARED_RUNTIME_TOOL_REGISTRY: 'true',
};

const PHASE_D_FLAGS = { ...ALL_FLAGS };
delete PHASE_D_FLAGS.ENABLE_RUNTIME_EXECUTION_QUEUE;
delete PHASE_D_FLAGS.ENABLE_RUNTIME_LEASE_RECOVERY;
delete PHASE_D_FLAGS.ENABLE_RUNTIME_REPLAY_PROTECTION;
delete PHASE_D_FLAGS.ENABLE_RUNTIME_HEARTBEAT_MONITOR;

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

describe('runtimeDurableExecution — queue (unit)', () => {
  beforeEach(() => {
    Object.assign(process.env, ALL_FLAGS);
    resetRuntimeCapabilitiesForTests();
  });

  afterEach(() => {
    resetRuntimeCapabilitiesForTests();
  });

  it('persists queue items in metadataJson', () => {
    const graph = graphFromLinearPlan('m1', LINEAR_PLAN);
    const node = graph.nodes[0];
    const result = enqueueGraphNode({}, 'm1', graph, node);
    expect(result.ok).toBe(true);
    const reloaded = readExecutionQueue(result.metadata);
    expect(reloaded.items).toHaveLength(1);
    expect(reloaded.items[0].status).toBe(QUEUE_STATUS.QUEUED);
  });

  it('claims queue items in priority/FIFO order', () => {
    const graph = graphFromLinearPlan('m1', LINEAR_PLAN);
    let meta = {};
    meta = enqueueGraphNode(meta, 'm1', graph, graph.nodes[0]).metadata;
    meta = enqueueGraphNode(meta, 'm1', graph, graph.nodes[1]).metadata;
    const claimed = claimNextQueueItem(meta, graph);
    expect(claimed.ok).toBe(true);
    expect(claimed.item.status).toBe(QUEUE_STATUS.CLAIMED);
  });

  it('blocks replay for completed nodes', () => {
    const graph = graphFromLinearPlan('m1', LINEAR_PLAN.slice(0, 1));
    const completed = patchGraphNode(graph, 'node-step-1', markNodeCompleted(graph.nodes[0]));
    let meta = recordReplayCompletion({}, 'm1', completed, completed.nodes[0]);
    expect(isReplayBlocked(meta, 'm1', completed, completed.nodes[0])).toBe(true);
    const blocked = enqueueGraphNode(meta, 'm1', completed, completed.nodes[0]);
    expect(blocked.replayBlocked).toBe(true);
  });

  it('dedupes artifacts on replay attach', () => {
    const graph = graphFromLinearPlan('m-art', LINEAR_PLAN.slice(0, 1));
    const g1 = attachArtifactToGraphNode(graph, {
      nodeId: 'node-step-1',
      artifactRef: 'output:node-step-1',
      workerId: 'w1',
      skillId: 'analysis',
    });
    const g2 = attachArtifactToGraphNode(g1, {
      nodeId: 'node-step-1',
      artifactRef: 'output:node-step-1',
      workerId: 'w2',
      skillId: 'analysis',
    });
    expect(g2.artifactLineage).toHaveLength(1);
  });
});

describe('runtimeDurableExecution — recovery (unit)', () => {
  beforeEach(() => {
    Object.assign(process.env, ALL_FLAGS);
    resetRuntimeCapabilitiesForTests();
  });

  it('detects expired leases', async () => {
    let meta = {};
    const past = new Date(Date.now() - 60_000).toISOString();
    meta = acquireExecutionLease(meta, {
      nodeId: 'node-1',
      ownerId: 'owner-a',
      ttlMs: 1000,
    }).metadata;
    const leases = meta.runtimeWorkerState.leases;
    leases[0].expiresAt = past;
    meta.runtimeWorkerState.leases = leases;

    const recovered = await recoverExpiredLeases(meta, 'm1');
    expect(recovered.reclaimed.length).toBe(1);
    expect(recovered.metadata.runtimeWorkerState.leases[0].status).toBe(LEASE_STATUS.EXPIRED);
  });

  it('detects stale worker heartbeats', () => {
    const skill = { skillId: 'analysis', skillType: 'analysis', label: 'Analysis' };
    let meta = createWorker({}, { graphId: 'g1', nodeId: 'node-1', assignedSkill: skill }).metadata;
    const workerId = readRuntimeWorkerState(meta).workers[0].workerId;
    meta = markWorkerRunning(meta, workerId);
    const staleAt = new Date(Date.now() - 300_000).toISOString();
    meta = {
      ...meta,
      runtimeWorkerState: {
        ...meta.runtimeWorkerState,
        workers: meta.runtimeWorkerState.workers.map((w) =>
          w.workerId === workerId ? { ...w, heartbeatAt: staleAt, status: WORKER_STATUS.RUNNING } : w,
        ),
      },
    };
    const scan = scanHeartbeatAndLeases(meta, { heartbeatStaleMs: 60_000, now: Date.now() });
    expect(scan.candidates.length).toBeGreaterThan(0);
  });

  it('detects orphan workers', () => {
    const skill = { skillId: 'analysis', skillType: 'analysis', label: 'Analysis' };
    let meta = createWorker({}, { graphId: 'g1', nodeId: 'node-1', assignedSkill: skill }).metadata;
    const workerId = readRuntimeWorkerState(meta).workers[0].workerId;
    meta = markWorkerRunning(meta, workerId);
    const orphans = detectOrphanWorkers(meta);
    expect(orphans.length).toBe(1);
  });

  it('requeues queue item on recovery', async () => {
    const graph = graphFromLinearPlan('m1', LINEAR_PLAN.slice(0, 1));
    let meta = enqueueGraphNode({}, 'm1', graph, graph.nodes[0]).metadata;
    const itemId = readExecutionQueue(meta).items[0].queueItemId;
    meta = (await requeueQueueItem(meta, 'm1', itemId, { reason: 'test' })).metadata;
    expect(readExecutionQueue(meta).items[0].status).toBe(QUEUE_STATUS.RETRY_SCHEDULED);
    expect(readExecutionQueue(meta).items[0].retryCount).toBe(1);
  });
});

describe('runtimeDurableExecution — stream (unit)', () => {
  it('categorizes queue and recovery events', () => {
    expect(categorizeStreamEvent('runtime.queue.enqueued')).toBe('orchestration');
    expect(categorizeStreamEvent('runtime.lease.reclaimed')).toBe('orchestration');
    expect(categorizeStreamEvent('runtime.replay.blocked')).toBe('orchestration');
    expect(categorizeStreamEvent('runtime.worker.recovered')).toBe('orchestration');
  });
});

describe('runtimeDurableExecution — scheduler isolation (unit)', () => {
  it('scheduler does not execute tools', () => {
    const graph = graphFromLinearPlan('m1', LINEAR_PLAN);
    analyzeGraphSchedule(graph);
    expect(executeMissionStepMock).not.toHaveBeenCalled();
  });
});

describe.skipIf(!dbAvailable)('runtimeDurableExecution — integration', () => {
  let prisma;
  let user;

  beforeEach(async () => {
    Object.assign(process.env, ALL_FLAGS);
    resetRuntimeCapabilitiesForTests();
    appendEventMock.mockClear();
    executeMissionStepMock.mockReset();
    executeMissionStepMock.mockImplementation(async ({ missionId, stepNumber, requestedTool, body }) => {
      const p = getPrismaClient();
      const row = await p.missionPipeline.findUnique({ where: { id: missionId } });
      const { mergeProactiveStepStatus } = await import('../src/lib/runtime/runtimeStepState.js');
      const meta = row?.metadataJson ?? {};
      const nextMeta = mergeProactiveStepStatus(meta, stepNumber, {
        status: 'completed',
        tool: requestedTool,
      });
      await p.missionPipeline.update({ where: { id: missionId }, data: { metadataJson: nextMeta } });
      return {
        ok: true,
        httpStatus: 200,
        output: { artifactRef: `output:step-${stepNumber}`, summary: 'ok' },
      };
    });

    prisma = getPrismaClient();
    await resetDb(prisma);
    user = await prisma.user.create({
      data: {
        email: 'durable-test@example.com',
        passwordHash: 'hash',
        displayName: 'Durable Test',
        roles: '["viewer"]',
      },
    });
  });

  afterEach(async () => {
    resetRuntimeCapabilitiesForTests();
    if (dbAvailable) await resetDb(prisma);
  });

  async function createMission(metadataJson = {}) {
    return prisma.missionPipeline.create({
      data: {
        type: 'launch_campaign',
        title: 'Durable test',
        status: 'executing',
        runState: 'idle',
        targetType: 'store',
        targetId: 's1',
        executionMode: 'GUIDED_RUN',
        requiresConfirmation: false,
        createdBy: user.id,
        tenantId: user.id,
        metadataJson: { storeId: 's1', proactivePlanSteps: LINEAR_PLAN, ...metadataJson },
      },
    });
  }

  it('isRuntimeDurableExecutionEnabled when all Phase E flags on', () => {
    expect(isRuntimeDurableExecutionEnabled()).toBe(true);
  });

  it('executes via durable queue with persisted queue state', async () => {
    const mission = await createMission();
    const result = await runNextStep({ user, missionId: mission.id, source: 'test' });

    expect(result.ok).toBe(true);
    expect(result.orchestrationMode).toBe('durable_queue');
    expect(result.queueItemId).toBeTruthy();

    const row = await prisma.missionPipeline.findUnique({ where: { id: mission.id } });
    const queue = readExecutionQueue(row.metadataJson);
    expect(queue.items.some((i) => i.status === QUEUE_STATUS.COMPLETED)).toBe(true);
  });

  it('queue persists after simulated reload', async () => {
    const mission = await createMission();
    await runNextStep({ user, missionId: mission.id, source: 'test' });

    const row = await prisma.missionPipeline.findUnique({ where: { id: mission.id } });
    const queue1 = readExecutionQueue(row.metadataJson);

    const reloaded = await getPrismaClient().missionPipeline.findUnique({ where: { id: mission.id } });
    const queue2 = readExecutionQueue(reloaded.metadataJson);
    expect(queue2.items.length).toBe(queue1.items.length);
  });

  it('emits queue lifecycle blackboard events', async () => {
    const mission = await createMission();
    await runNextStep({ user, missionId: mission.id, source: 'test' });

    const types = appendEventMock.mock.calls.map((c) => c[1]);
    expect(types).toContain('runtime.queue.enqueued');
    expect(types).toContain('runtime.queue.claimed');
    expect(types).toContain('runtime.queue.completed');
  });

  it('recovers after simulated crash (stale worker + requeue)', async () => {
    const mission = await createMission();
    await runNextStep({ user, missionId: mission.id, source: 'test' });

    const row = await prisma.missionPipeline.findUnique({ where: { id: mission.id } });
    const graph = row.metadataJson.runtimeMissionGraph;
    const staleAt = new Date(Date.now() - 300_000).toISOString();
    const workers = row.metadataJson.runtimeWorkerState.workers.map((w) => ({
      ...w,
      status: WORKER_STATUS.RUNNING,
      heartbeatAt: staleAt,
    }));
    const stuckGraph = {
      ...graph,
      nodes: graph.nodes.map((n) =>
        n.nodeId === 'node-step-1' ? { ...n, status: NODE_STATUS.RUNNING } : n,
      ),
    };
    await prisma.missionPipeline.update({
      where: { id: mission.id },
      data: {
        metadataJson: {
          ...row.metadataJson,
          runtimeMissionGraph: stuckGraph,
          runtimeWorkerState: { ...row.metadataJson.runtimeWorkerState, workers },
        },
      },
    });

    const refreshed = await prisma.missionPipeline.findUnique({ where: { id: mission.id } });
    const recovery = await runRecoveryPass(
      refreshed.metadataJson,
      refreshed.metadataJson.runtimeMissionGraph,
      mission.id,
      { heartbeatStaleMs: 60_000 },
    );
    expect(recovery.recovered.length).toBeGreaterThan(0);
  });

  it('falls back to Phase D when Phase E flags disabled', async () => {
    Object.assign(process.env, PHASE_D_FLAGS);
    delete process.env.ENABLE_RUNTIME_EXECUTION_QUEUE;
    delete process.env.ENABLE_RUNTIME_LEASE_RECOVERY;
    delete process.env.ENABLE_RUNTIME_REPLAY_PROTECTION;
    delete process.env.ENABLE_RUNTIME_HEARTBEAT_MONITOR;
    resetRuntimeCapabilitiesForTests();

    const mission = await createMission();
    const result = await runNextStep({ user, missionId: mission.id, source: 'test' });

    expect(result.ok).toBe(true);
    expect(result.orchestrationMode).toBe('graph');
    expect(result.queueItemId).toBeUndefined();
  });
});
