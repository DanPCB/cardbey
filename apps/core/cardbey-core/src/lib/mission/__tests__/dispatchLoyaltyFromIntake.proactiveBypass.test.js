/**
 * @vitest-environment node
 *
 * Regression: loyalty must hard-route to compiler topology, never proactive_plan.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../../config/features.js', () => ({
  Features: {
    loyalty: { useSpine: true },
    compiler: { useForCampaigns: false, useForStores: false },
  },
}));

vi.mock('../../missionAccess.js', () => ({
  getTenantId: () => 'tenant_1',
}));

vi.mock('../../intake/resolveStoreAmbiguity.js', () => ({
  fetchUserStoresForDisambiguation: vi.fn(async () => [
    { id: 'store_1', name: 'Store One', type: 'cafe' },
    { id: 'cmragerp2003tjvikdhczo7ow', name: 'Active Store', type: 'retail' },
    { id: 'store_active', name: 'Active Store 2', type: 'retail' },
  ]),
  validateUserStoreId: vi.fn(async () => true),
}));

const generateExecutionPlan = vi.fn(async () => ({
  missionId: 'mission_loyalty_bypass',
  artifactBundle: {
    topology: {
      id: 't_loyalty',
      version: '1',
      missionType: 'setup_loyalty_program',
      nodes: [
        { id: 'setup_1', toolName: 'setup_loyalty_program', orderIndex: 0 },
        { id: 'segment_1', toolName: 'segment_loyal_customers', orderIndex: 1 },
      ],
      edges: [],
    },
    policy: { id: 'p1', version: '1', gates: [] },
    reasoning: { id: 'r1', version: '1', summary: 'Loyalty topology from chat' },
    toolContracts: [],
  },
  metadata: { multiAgentStatus: 'pending_approval' },
  response: {
    success: true,
    action: 'show_execution_plan',
    missionId: 'mission_loyalty_bypass',
    executionPlan: {
      topology: {
        nodes: [
          { id: 'setup_1', toolName: 'setup_loyalty_program' },
          { id: 'segment_1', toolName: 'segment_loyal_customers' },
        ],
      },
      policy: {},
      reasoning: {},
      metadata: {},
    },
    pendingTopology: {
      nodes: [
        { id: 'setup_1', toolName: 'setup_loyalty_program' },
        { id: 'segment_1', toolName: 'segment_loyal_customers' },
      ],
    },
  },
}));

vi.mock('../generateExecutionPlan.js', () => ({
  generateExecutionPlan: (...args) => generateExecutionPlan(...args),
}));

import {
  isLoyaltyCompilerTool,
  shouldDispatchLoyaltyViaCompiler,
  runLoyaltyCompilerFromIntake,
  buildLoyaltyCompilerResponseBody,
  buildLoyaltyStoreClarifyResponse,
  respondLoyaltyCompilerDispatch,
} from '../dispatchLoyaltyFromIntake.js';
import { emitSpinePathTelemetry } from '../../intake/spinePathTelemetry.js';

describe('loyalty proactive_plan bypass → compiler topology', () => {
  let infoSpy;

  beforeEach(() => {
    vi.clearAllMocks();
    infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
  });

  afterEach(() => {
    infoSpy?.mockRestore();
  });

  it('loyalty text + active store → show_execution_plan / loyalty_chat_compile', async () => {
    const classification = {
      tool: 'setup_loyalty_program',
      confidence: 1,
      validated: true,
      executionPath: 'proactive_plan',
      parameters: {
        storeId: 'cmragerp2003tjvikdhczo7ow',
        confirmedActiveSpace: true,
        selectionMethod: 'active-space',
      },
    };

    expect(isLoyaltyCompilerTool(classification)).toBe(true);
    expect(shouldDispatchLoyaltyViaCompiler(classification)).toBe(true);

    const result = await runLoyaltyCompilerFromIntake({
      user: { id: 'user_1' },
      actorId: 'user_1',
      locale: 'en',
      userMessage: 'create a loyalty program from this card',
      classification,
      storeId: 'cmragerp2003tjvikdhczo7ow',
      auditSource: 'test_hard_route',
    });

    expect(result.kind).toBe('compiled');
    expect(result.responseBody.action).toBe('show_execution_plan');
    expect(result.responseBody.executionPath).toBe('loyalty_chat_compile');
    expect(result.responseBody.pathId).toBe('loyalty_chat_compile');
    expect(result.responseBody.missingContext).toEqual([]);
    expect(result.responseBody.storeId).toBe('cmragerp2003tjvikdhczo7ow');
    expect(result.responseBody.executionPlan?.topology?.nodes?.length).toBeGreaterThan(0);
    expect(result.telemetry.classification.executionPath).toBe('loyalty_chat_compile');
    expect(result.telemetry.classification.executionPath).not.toBe('proactive_plan');
    expect(generateExecutionPlan).toHaveBeenCalled();

    const spineLogs = infoSpy.mock.calls
      .filter((c) => c[0] === '[spine.path]')
      .map((c) => JSON.parse(String(c[1])));
    expect(spineLogs.some((e) => e.pathId === 'loyalty_chat_compile' && e.action === 'show_execution_plan')).toBe(
      true,
    );
  });

  it('store_required response includes store candidates when actor has stores', async () => {
    const safeJson = vi.fn(async () => {});
    const res = { status: vi.fn(() => res), json: vi.fn() };
    await respondLoyaltyCompilerDispatch(
      res,
      { kind: 'store_required' },
      {
        locale: 'en',
        safeJson,
        tool: 'setup_loyalty_program',
        actorId: 'user_1',
      },
    );
    expect(safeJson).toHaveBeenCalled();
    const body = safeJson.mock.calls[0][0];
    expect(body.action).toBe('clarify_store');
    expect(body.clarifyType).toBe('execution_context_store_picker');
    expect(Array.isArray(body.storeCandidates)).toBe(true);
    expect(body.storeCandidates.length).toBeGreaterThan(0);
    expect(body.options?.[0]?.parameters?.selectionMethod).toBe('manual');
  });

  it('manual store selection locks execution context and compiles', async () => {
    const result = await runLoyaltyCompilerFromIntake({
      user: { id: 'user_1' },
      actorId: 'user_1',
      locale: 'en',
      userMessage: 'create a loyalty program from this card',
      classification: {
        tool: 'setup_loyalty_program',
        confidence: 1,
        parameters: {
          storeId: 'store_1',
          activeStoreId: 'store_1',
          selectionMethod: 'manual',
        },
      },
      storeId: 'store_1',
      auditSource: 'test_manual_selection',
    });

    expect(result.kind).toBe('compiled');
    expect(result.responseBody.action).toBe('show_execution_plan');
    expect(generateExecutionPlan).toHaveBeenCalled();
  });

  it('loyalty text + no store hint → execution_context store picker', async () => {
    const result = await runLoyaltyCompilerFromIntake({
      user: { id: 'user_1' },
      actorId: 'user_1',
      locale: 'en',
      userMessage: 'create a loyalty program from this card',
      classification: {
        tool: 'setup_loyalty_program',
        confidence: 1,
        parameters: {},
      },
      storeId: null,
      auditSource: 'test_no_store',
    });

    expect(result.kind).toBe('execution_context_required');
    expect(result.clarify?.clarifyType).toBe('execution_context_store_picker');
    expect(generateExecutionPlan).not.toHaveBeenCalled();

    const clarify = buildLoyaltyStoreClarifyResponse({ tool: 'setup_loyalty_program' });
    expect(clarify.action).toBe('clarify_store');
    expect(clarify.lockedTool).toBe('setup_loyalty_program');
    expect(clarify.clarifyType).toBe('execution_context_store_picker');
    expect(clarify.missingContext).toEqual(['store']);

    const safeJson = vi.fn(async () => {});
    const res = { status: vi.fn(() => res), json: vi.fn() };
    await respondLoyaltyCompilerDispatch(res, result, {
      locale: 'en',
      safeJson,
      tool: 'setup_loyalty_program',
    });
    expect(safeJson).toHaveBeenCalled();
    const body = safeJson.mock.calls[0][0];
    expect(body.action).toBe('clarify_store');
    expect(body.lockedTool).toBe('setup_loyalty_program');
    expect(body.clarifyType).toBe('execution_context_store_picker');

    const spineLogs = infoSpy.mock.calls
      .filter((c) => c[0] === '[spine.path]')
      .map((c) => JSON.parse(String(c[1])));
    expect(spineLogs.some((e) => e.pathId === 'resolve_execution_context')).toBe(true);
  });

  it('loyalty must not enter proactive_plan executionPath in compiler response', async () => {
    const result = await runLoyaltyCompilerFromIntake({
      user: { id: 'user_1' },
      actorId: 'user_1',
      locale: 'en',
      userMessage: 'create a loyalty program',
      classification: {
        tool: 'setup_loyalty_program',
        executionPath: 'proactive_plan',
        confidence: 0.97,
        parameters: {
          storeId: 'store_active',
          confirmedActiveSpace: true,
          selectionMethod: 'active-space',
        },
      },
      storeId: 'store_active',
      auditSource: 'test_no_proactive',
    });

    expect(result.kind).toBe('compiled');
    expect(result.responseBody.executionPath).not.toBe('proactive_plan');
    expect(result.responseBody.action).not.toBe('proactive_plan');
    expect(result.responseBody.action).toBe('show_execution_plan');
  });

  it('buildLoyaltyCompilerResponseBody matches TopologyReviewCard payload', () => {
    const body = buildLoyaltyCompilerResponseBody(
      {
        missionId: 'm1',
        artifactBundle: {
          topology: { nodes: [{ id: 'n1' }] },
          policy: { gates: [] },
          reasoning: { summary: 'ok' },
        },
        metadata: { multiAgentStatus: 'pending_approval' },
        response: { action: 'show_execution_plan', missionId: 'm1' },
      },
      { storeId: 's1', tool: 'setup_loyalty_program' },
    );

    expect(body.action).toBe('show_execution_plan');
    expect(body.executionPlan.topology.nodes.length).toBeGreaterThan(0);
    expect(body.executionPlan.metadata.pathId).toBe('loyalty_chat_compile');
    expect(body.executionPlan.metadata.tool).toBe('setup_loyalty_program');
  });

  it('emitSpinePathTelemetry includes loyalty_proactive_bypass_prevented fields', () => {
    emitSpinePathTelemetry({
      pathId: 'loyalty_proactive_bypass_prevented',
      source: 'test',
      ok: true,
      tool: 'setup_loyalty_program',
      storeId: 's1',
      missingContext: [],
      executionPath: 'loyalty_chat_compile',
      action: 'show_execution_plan',
      spine: true,
    });
    const last = infoSpy.mock.calls.find((c) => c[0] === '[spine.path]');
    const parsed = JSON.parse(String(last[1]));
    expect(parsed.pathId).toBe('loyalty_proactive_bypass_prevented');
    expect(parsed.executionPath).toBe('loyalty_chat_compile');
    expect(parsed.action).toBe('show_execution_plan');
    expect(parsed.missingContext).toEqual([]);
  });
});
