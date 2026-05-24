import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  resolveRuntimeContext,
  resetRuntimeStateStore,
} from './runtimeState.js';
import { createPerformerRuntimeContext } from './runtimeContext.js';
import { categorizeStreamEvent, normalizeStreamEvent } from './unifiedRuntimeStream.js';
import { assertRuntimeOwnership, markRuntimeOwnedContext } from './runtimeOwnership.js';
import { recordRuntimeExecutionNode } from './runtimeStateGraph.js';

vi.mock('../../execution/executeMissionAction.js', () => ({
  executeMissionAction: vi.fn(async () => ({
    status: 'ok',
    output: { artifact: { id: 'art-1' } },
    metadata: {},
  })),
}));

vi.mock('../../broker/brokerRunwayGuard.js', () => ({
  guardBrokerDirectAction: vi.fn(() => ({ blocked: false })),
}));

vi.mock('../../telemetry/healthProbes.js', () => ({
  emitHealthProbe: vi.fn(),
}));

vi.mock('../../missionBlackboard.js', () => ({
  appendEvent: vi.fn(async () => ({ ok: true, seq: 1 })),
  getEvents: vi.fn(async () => ({ events: [] })),
}));

vi.mock('../../../realtime/simpleSse.js', () => ({
  broadcastSse: vi.fn(),
}));

describe('performerRuntime kernel', () => {
  beforeEach(() => {
    resetRuntimeStateStore();
    process.env.BROKER_EXECUTION_TELEMETRY = 'false';
    process.env.PERFORMER_RUNTIME_UNIFIED_STREAM = 'false';
    process.env.PERFORMER_RUNTIME_STATE_PERSIST = 'false';
    process.env.PERFORMER_RUNTIME_OWNERSHIP_BLOCK = 'false';
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('creates and resolves runtime context by missionId', () => {
    const ctx = resolveRuntimeContext({ missionId: 'm-1', userId: 'u-1' });
    expect(ctx.runtimeId).toBeTruthy();
    expect(ctx.missionId).toBe('m-1');
    expect(ctx.runtimeOwned).toBe(true);
    const again = resolveRuntimeContext({ missionId: 'm-1' });
    expect(again.runtimeId).toBe(ctx.runtimeId);
  });

  it('categorizes stream events', () => {
    expect(categorizeStreamEvent('runtime.execution.started')).toBe('execution');
    expect(categorizeStreamEvent('reasoning_line')).toBe('telemetry');
    expect(normalizeStreamEvent({ id: '1', seq: 1, eventType: 'completed_action', payload: {} }).category).toBe(
      'execution',
    );
  });

  it('warns on orphan ownership but allows when block off', () => {
    const check = assertRuntimeOwnership({ missionId: 'm-1' }, 'orphan_source');
    expect(check.allowed).toBe(true);
  });

  it('marks context as runtime-owned', () => {
    const ctx = markRuntimeOwnedContext({ missionId: 'm-1' }, 'rt-1');
    expect(ctx.runtimeOwned).toBe(true);
    expect(ctx.runtimeId).toBe('rt-1');
  });

  it('records execution graph nodes', () => {
    let ctx = createPerformerRuntimeContext({ missionId: 'm-2' });
    ctx = recordRuntimeExecutionNode(ctx, {
      actionId: 'tool:create_store',
      capabilityId: 'store_website',
      status: 'completed',
      artifactRefs: ['art-1'],
    });
    expect(ctx.executionNodes.length).toBe(1);
    expect(ctx.actionGraph.nodes.length).toBeGreaterThan(0);
    expect(ctx.actionGraph.edges.length).toBeGreaterThan(0);
  });
});

describe('executeRuntimeAction', () => {
  beforeEach(() => {
    resetRuntimeStateStore();
    process.env.BROKER_EXECUTION_TELEMETRY = 'false';
    process.env.PERFORMER_RUNTIME_UNIFIED_STREAM = 'false';
    process.env.PERFORMER_RUNTIME_STATE_PERSIST = 'false';
  });

  it('delegates to executeMissionAction and returns runtime metadata', async () => {
    const { executeRuntimeAction } = await import('./executeRuntimeAction.js');
    const result = await executeRuntimeAction({
      actionType: 'dispatch_tool',
      missionId: 'm-3',
      source: 'test_runtime',
      payload: { toolName: 'market_research', input: {}, context: {} },
      skipDirectGuard: true,
    });
    expect(result.status).toBe('ok');
    expect(result.metadata?.runtimeId).toBeTruthy();
    expect(result.metadata?.actionId).toBe('tool:market_research');
    expect(result.metadata?.executionSource).toBe('performer_runtime');
  });
});
