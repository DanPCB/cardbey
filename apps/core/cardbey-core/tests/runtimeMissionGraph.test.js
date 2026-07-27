/**
 * Runtime Mission Graph — unit + integration tests (Phase C).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getPrismaClient } from '../src/lib/prisma.js';
import { resetDb } from '../src/test/helpers/resetDb.js';
import { resetRuntimeCapabilitiesForTests } from '../src/lib/runtime/runtimeCapabilitiesService.js';
import {
  graphFromLinearPlan,
  buildCampaignGraphTemplate,
  ensureMissionGraph,
  persistMissionGraph,
} from '../src/lib/runtime/runtimeMissionGraphService.js';
import {
  analyzeGraphSchedule,
  getExecutableGraphNodes,
} from '../src/lib/runtime/runtimeGraphScheduler.js';
import {
  readRuntimeMissionGraph,
  writeRuntimeMissionGraph,
  patchGraphNode,
  markNodeCompleted,
  markNodeFailed,
  isGraphOrchestrationSuccessful,
} from '../src/lib/runtime/runtimeGraphExecutionState.js';
import { attachArtifactToGraphNode, listNodeArtifactLineage } from '../src/lib/runtime/runtimeGraphArtifactLineage.js';
import {
  runGraphNextStep,
  runGraphStepsLoop,
  isRuntimeGraphOrchestrationEnabled,
} from '../src/lib/runtime/runtimeMissionGraphOrchestrator.js';
import { runNextStep, runAllAvailableSteps } from '../src/lib/runtime/runtimeMissionOrchestrator.js';
import { NODE_STATUS, EXECUTION_MODE } from '../src/lib/runtime/runtimeGraphTypes.js';
import { categorizeStreamEvent } from '../src/lib/runtime/performerRuntime/unifiedRuntimeStream.js';

const dbAvailable = (() => {
  try {
    getPrismaClient();
    return true;
  } catch {
    return false;
  }
})();

const GRAPH_FLAGS = {
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
  { step: 3, title: 'Launch', recommendedTool: 'launch_campaign', parameters: { storeId: 's1' } },
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

describe('runtimeMissionGraph — scheduler (unit)', () => {
  beforeEach(() => {
    Object.assign(process.env, GRAPH_FLAGS);
    resetRuntimeCapabilitiesForTests();
  });

  afterEach(() => {
    resetRuntimeCapabilitiesForTests();
    delete process.env.ENABLE_RUNTIME_MISSION_GRAPH;
    delete process.env.ENABLE_RUNTIME_GRAPH_SCHEDULER;
  });

  it('schedules sequential nodes one at a time', () => {
    const graph = graphFromLinearPlan('m-seq', LINEAR_PLAN);
    const analysis = analyzeGraphSchedule(graph);
    expect(analysis.executableNodes).toHaveLength(1);
    expect(analysis.executableNodes[0].nodeId).toBe('node-step-1');

    const completed = patchGraphNode(graph, 'node-step-1', markNodeCompleted(graph.nodes[0]));
    const afterFirst = analyzeGraphSchedule(completed);
    expect(afterFirst.executableNodes).toHaveLength(1);
    expect(afterFirst.executableNodes[0].nodeId).toBe('node-step-2');
  });

  it('schedules parallel nodes when dependencies satisfied', () => {
    const graph = buildCampaignGraphTemplate('m-par');
    const afterAnalyze = patchGraphNode(graph, 'node-analyze', markNodeCompleted(graph.nodes[0]));
    const analysis = analyzeGraphSchedule(afterAnalyze);
    expect(analysis.parallelReadyCount).toBe(3);
    expect(analysis.executableNodes.map((n) => n.nodeId).sort()).toEqual([
      'node-audience',
      'node-copy',
      'node-design',
    ]);
  });

  it('waits at barrier until parallel branches complete', () => {
    const graph = buildCampaignGraphTemplate('m-barrier');
    let g = patchGraphNode(graph, 'node-analyze', markNodeCompleted(graph.nodes[0]));
    g = patchGraphNode(g, 'node-audience', markNodeCompleted(g.nodes.find((n) => n.nodeId === 'node-audience')));
    const waiting = analyzeGraphSchedule(g);
    expect(waiting.waitingBarriers.length).toBeGreaterThan(0);
    expect(waiting.executableNodes.map((n) => n.nodeId)).not.toContain('node-package');

    g = patchGraphNode(g, 'node-copy', markNodeCompleted(g.nodes.find((n) => n.nodeId === 'node-copy')));
    g = patchGraphNode(g, 'node-design', markNodeCompleted(g.nodes.find((n) => n.nodeId === 'node-design')));
    const readyBarrier = analyzeGraphSchedule(g);
    expect(readyBarrier.autoCompleteBarriers.map((n) => n.nodeId)).toContain('node-barrier-package');
  });

  it('blocks downstream nodes when upstream node failed', () => {
    const graph = graphFromLinearPlan('m-fail', LINEAR_PLAN);
    const failed = patchGraphNode(
      graph,
      'node-step-1',
      markNodeFailed(graph.nodes[0], 'tool_error'),
    );
    const analysis = analyzeGraphSchedule(failed);
    expect(analysis.blockedNodes.map((n) => n.nodeId)).toContain('node-step-2');
    expect(analysis.executableNodes).toHaveLength(0);
  });

  it('re-enters retryable failed node when forced', () => {
    let graph = graphFromLinearPlan('m-retry', [
      { step: 1, title: 'Retry step', recommendedTool: 'analyze_store', executionMode: EXECUTION_MODE.RETRYABLE },
    ]);
    graph = patchGraphNode(graph, 'node-step-1', {
      ...markNodeFailed(graph.nodes[0], 'transient'),
      executionMode: EXECUTION_MODE.RETRYABLE,
      retries: { count: 1, max: 3 },
    });
    const blocked = analyzeGraphSchedule(graph);
    expect(blocked.executableNodes).toHaveLength(0);

    const retryReady = analyzeGraphSchedule(graph, { forceRetryNodeId: 'node-step-1' });
    expect(retryReady.executableNodes.map((n) => n.nodeId)).toContain('node-step-1');
  });

  it('detects graph completion when all nodes completed', () => {
    let graph = graphFromLinearPlan('m-done', LINEAR_PLAN.slice(0, 1));
    expect(analyzeGraphSchedule(graph).isComplete).toBe(false);
    graph = patchGraphNode(graph, 'node-step-1', markNodeCompleted(graph.nodes[0]));
    expect(analyzeGraphSchedule(graph).isComplete).toBe(true);
    expect(isGraphOrchestrationSuccessful(graph)).toBe(true);
  });
});

describe('runtimeMissionGraph — persistence & lineage (unit)', () => {
  it('converts linear proactive plan into sequential graph', () => {
    const graph = graphFromLinearPlan('m-conv', LINEAR_PLAN, { targetId: 's1', targetType: 'store' });
    expect(graph.nodes).toHaveLength(3);
    expect(graph.edges).toHaveLength(2);
    expect(graph.nodes[0].dependencies).toEqual([]);
    expect(graph.nodes[1].dependencies).toEqual(['node-step-1']);
    expect(graph.nodes[0].targetId).toBe('s1');
  });

  it('persists graph in metadataJson.runtimeMissionGraph', () => {
    const graph = graphFromLinearPlan('m-persist', LINEAR_PLAN);
    const meta = writeRuntimeMissionGraph({}, graph);
    const reloaded = readRuntimeMissionGraph(meta);
    expect(reloaded.graphId).toBe(graph.graphId);
    expect(reloaded.nodes).toHaveLength(3);
    expect(meta.runtimeMissionGraph.missionId).toBe('m-persist');
  });

  it('attaches artifact lineage to graph node', () => {
    const graph = graphFromLinearPlan('m-art', LINEAR_PLAN.slice(0, 1));
    const withArtifact = attachArtifactToGraphNode(graph, {
      nodeId: 'node-step-1',
      artifactRef: 'promotion:promo-1',
      artifactType: 'create_promotion',
      targetId: 's1',
      metadata: { stepNumber: 1 },
    });
    const records = listNodeArtifactLineage(withArtifact, 'node-step-1');
    expect(records).toHaveLength(1);
    expect(records[0].missionId).toBe('m-art');
    expect(records[0].graphId).toBe(graph.graphId);
    expect(records[0].artifactRef).toBe('promotion:promo-1');
  });

  it('ensureMissionGraph auto-converts when graph missing', () => {
    const meta = { proactivePlanSteps: LINEAR_PLAN };
    const ensured = ensureMissionGraph(meta, 'm-ensure');
    expect(ensured.created).toBe(true);
    expect(ensured.graph.nodes).toHaveLength(3);
    expect(readRuntimeMissionGraph(ensured.metadata)).toBeTruthy();
  });
});

describe('runtimeMissionGraph — stream categorization (unit)', () => {
  it('categorizes runtime.graph events as orchestration', () => {
    expect(categorizeStreamEvent('runtime.graph.created')).toBe('orchestration');
    expect(categorizeStreamEvent('runtime.graph.node.running')).toBe('orchestration');
    expect(categorizeStreamEvent('runtime.graph.barrier.waiting')).toBe('orchestration');
    expect(categorizeStreamEvent('runtime.graph.completed')).toBe('orchestration');
  });
});

describe.skipIf(!dbAvailable)('runtimeMissionGraph — orchestrator integration', () => {
  let prisma;
  let user;

  beforeEach(async () => {
    Object.assign(process.env, GRAPH_FLAGS);
    resetRuntimeCapabilitiesForTests();
    appendEventMock.mockClear();
    executeMissionStepMock.mockReset();
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
        email: 'graph-test@example.com',
        passwordHash: 'hash',
        displayName: 'Graph Test',
        roles: '["viewer"]',
      },
    });
  });

  afterEach(async () => {
    resetRuntimeCapabilitiesForTests();
    delete process.env.ENABLE_RUNTIME_MISSION_GRAPH;
    delete process.env.ENABLE_RUNTIME_GRAPH_SCHEDULER;
    if (dbAvailable) await resetDb(prisma);
  });

  async function createMission(metadataJson = {}) {
    return prisma.missionPipeline.create({
      data: {
        type: 'launch_campaign',
        title: 'Graph test',
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

  async function loadGraph(missionId) {
    const row = await prisma.missionPipeline.findUnique({
      where: { id: missionId },
      select: { metadataJson: true },
    });
    return readRuntimeMissionGraph(row.metadataJson);
  }

  it('isRuntimeGraphOrchestrationEnabled when both graph flags on', () => {
    expect(isRuntimeGraphOrchestrationEnabled()).toBe(true);
  });

  it('executes sequential graph via run-next through orchestrator delegate', async () => {
    const mission = await createMission();
    const result = await runNextStep({ user, missionId: mission.id, source: 'test' });

    expect(result.orchestrationMode).toBe('graph');
    expect(result.ok).toBe(true);
    expect(executeMissionStepMock).toHaveBeenCalledTimes(1);

    const graph = await loadGraph(mission.id);
    expect(graph.nodes.find((n) => n.nodeId === 'node-step-1')?.status).toBe(NODE_STATUS.COMPLETED);
  });

  it('run-all executes multiple sequential steps in graph mode', async () => {
    const mission = await createMission();
    const result = await runAllAvailableSteps({ user, missionId: mission.id, source: 'test', maxSteps: 2 });

    expect(result.orchestrationMode).toBe('graph');
    expect(result.nodesExecuted?.length ?? 0).toBeGreaterThanOrEqual(2);
    const graph = await loadGraph(mission.id);
    expect(graph.nodes.filter((n) => n.status === NODE_STATUS.COMPLETED).length).toBeGreaterThanOrEqual(2);
  });

  it('graph persists across reload', async () => {
    const mission = await createMission();
    await runNextStep({ user, missionId: mission.id, source: 'test' });

    const graph1 = await loadGraph(mission.id);
    expect(graph1).toBeTruthy();

    const freshPrisma = getPrismaClient();
    const row = await freshPrisma.missionPipeline.findUnique({ where: { id: mission.id } });
    const graph2 = readRuntimeMissionGraph(row.metadataJson);
    expect(graph2.graphId).toBe(graph1.graphId);
    expect(graph2.nodes.find((n) => n.nodeId === 'node-step-1')?.status).toBe(NODE_STATUS.COMPLETED);
  });

  it('emits blackboard graph lifecycle events', async () => {
    const mission = await createMission();
    await runNextStep({ user, missionId: mission.id, source: 'test', traceId: 'trace-1' });

    const eventTypes = appendEventMock.mock.calls.map((c) => c[1]);
    expect(eventTypes).toContain('runtime.graph.created');
    expect(eventTypes).toContain('runtime.graph.node.running');
    expect(eventTypes).toContain('runtime.graph.node.completed');
  });

  it('attaches artifact lineage after node execution', async () => {
    const mission = await createMission();
    await runNextStep({ user, missionId: mission.id, source: 'test' });

    const graph = await loadGraph(mission.id);
    expect(graph.artifactLineage.length).toBeGreaterThan(0);
    expect(graph.artifactLineage[0].nodeId).toBe('node-step-1');
  });

  it('detects graph completion on final step', async () => {
    const mission = await createMission({
      proactivePlanSteps: LINEAR_PLAN.slice(0, 1),
    });
    const result = await runAllAvailableSteps({ user, missionId: mission.id, source: 'test' });

    expect(result.allStepsComplete || result.code === 'GRAPH_ORCHESTRATION_COMPLETED').toBe(true);
    const eventTypes = appendEventMock.mock.calls.map((c) => c[1]);
    expect(eventTypes).toContain('runtime.graph.completed');
  });

  it('falls back to Phase B linear orchestrator when graph flags disabled', async () => {
    delete process.env.ENABLE_RUNTIME_MISSION_GRAPH;
    delete process.env.ENABLE_RUNTIME_GRAPH_SCHEDULER;
    resetRuntimeCapabilitiesForTests();

    const mission = await createMission();
    const result = await runNextStep({ user, missionId: mission.id, source: 'test' });

    expect(result.orchestrationMode).toBeUndefined();
    expect(result.ok).toBe(true);
    expect(result.stepNumber).toBe(1);
  });
});

describe('runtimeMissionGraph — campaign parallel integration', () => {
  beforeEach(() => {
    Object.assign(process.env, GRAPH_FLAGS);
    resetRuntimeCapabilitiesForTests();
  });

  it('getExecutableGraphNodes returns parallel batch after analyze', () => {
    const graph = buildCampaignGraphTemplate('m-campaign');
    const g = patchGraphNode(graph, 'node-analyze', markNodeCompleted(graph.nodes[0]));
    const sched = getExecutableGraphNodes(g);
    expect(sched.nextExecutable).toHaveLength(3);
  });
});
