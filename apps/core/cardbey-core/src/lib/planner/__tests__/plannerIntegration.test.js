/**
 * @vitest-environment node
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createReasoningResult } from '../../intent/utils.js';
import {
  PlannerIntegration,
  applyDynamicPlanToClassification,
  dynamicPlanToProactivePlanSteps,
  resetPlannerIntegrationForTests,
  serializeDynamicPlanForClient,
  toolToIntent,
} from '../plannerIntegration.js';

describe('plannerIntegration', () => {
  /** @type {Record<string, string | undefined>} */
  let envSnapshot;

  beforeEach(() => {
    resetPlannerIntegrationForTests();
    envSnapshot = { ...process.env };
    process.env.ENABLE_DYNAMIC_PLANNER = 'true';
  });

  afterEach(() => {
    process.env = envSnapshot;
    resetPlannerIntegrationForTests();
  });

  it('toolToIntent maps catalog tools', () => {
    expect(toolToIntent('replace_store_catalog')).toBe('add_product');
    expect(toolToIntent('create_store')).toBe('create_store');
  });

  it('generates plan bundle for create_store classification', async () => {
    const integration = new PlannerIntegration();
    const reasoning = createReasoningResult('create_store', 0.9, 'execute_tool', ['Create store']);
    const classification = {
      executionPath: 'direct_action',
      tool: 'create_store',
      confidence: 0.9,
      parameters: {},
      _reasoningResult: reasoning,
    };

    const bundle = await integration.maybeGenerateForIntake({
      classification,
      reasoningResult: reasoning,
      context: { userId: 'user_1' },
      locale: 'en',
      req: { headers: {} },
    });

    expect(bundle).toBeTruthy();
    expect(bundle?.plan.intent).toBe('create_store');
    expect(bundle?.proactivePlanSteps.length).toBeGreaterThan(0);
    expect(bundle?.serialized.steps.length).toBe(bundle?.plan.steps.length);
  });

  it('skips plan generation for clarify classifications', async () => {
    const integration = new PlannerIntegration();
    const bundle = await integration.maybeGenerateForIntake({
      classification: { executionPath: 'clarify', tool: 'general_chat' },
      context: { userId: 'user_1' },
      req: { headers: {} },
    });
    expect(bundle).toBeNull();
  });

  it('applyDynamicPlanToClassification injects proactive plan steps', () => {
    const reasoning = createReasoningResult('add_product', 0.9, 'execute_tool', []);
    const classification = {
      executionPath: 'chat',
      tool: 'replace_store_catalog',
      confidence: 0.9,
      parameters: { storeId: 'store_1' },
    };
    const integration = new PlannerIntegration();
    return integration.maybeGenerateForIntake({
      classification: { ...classification, _reasoningResult: reasoning },
      reasoningResult: reasoning,
      context: { userId: 'user_1', activeStoreId: 'store_1' },
      req: { headers: {} },
    }).then((bundle) => {
      expect(bundle).toBeTruthy();
      const next = applyDynamicPlanToClassification(classification, bundle);
      expect(next.executionPath).toBe('proactive_plan');
      expect(Array.isArray(next.plan)).toBe(true);
      expect(next._dynamicPlan).toBeTruthy();
    });
  });

  it('publishes plan preview events to blackboard when missionId is set', async () => {
    const appendEvent = vi.fn().mockResolvedValue(null);
    const blackboard = {
      appendEvent,
      flushOrchestrationEvents: vi.fn().mockResolvedValue(undefined),
    };

    const integration = new PlannerIntegration();
    const reasoning = createReasoningResult('create_store', 0.9, 'execute_tool', []);
    const bundle = await integration.maybeGenerateForIntake({
      classification: {
        executionPath: 'direct_action',
        tool: 'create_store',
        _reasoningResult: reasoning,
      },
      reasoningResult: reasoning,
      context: { userId: 'user_1' },
      missionId: 'mission_123',
      req: { headers: {} },
    });

    expect(bundle?.blackboard?.emitted).toBeGreaterThan(1);

    const replay = await integration.maybeGenerateForIntake({
      classification: {
        executionPath: 'direct_action',
        tool: 'create_store',
        _reasoningResult: reasoning,
      },
      reasoningResult: reasoning,
      context: { userId: 'user_1' },
      missionId: 'mission_123',
      req: { headers: {} },
    });

    const { emitPlanToBlackboard } = await import('../planBlackboard.js');
    const out = await emitPlanToBlackboard('mission_123', replay.plan, { blackboard });
    expect(out.emitted).toBeGreaterThan(1);
    expect(appendEvent).toHaveBeenCalled();
    const types = appendEvent.mock.calls.map((c) => c[1]);
    expect(types).toContain('execution.started');
    expect(types.some((t) => t === 'plan.step.preview' || t === 'execution.checkpoint.awaiting')).toBe(true);
  });

  it('executeDynamicPlanForIntake returns null when execution flag is off', async () => {
    process.env.ENABLE_DYNAMIC_PLANNER_EXECUTION = 'false';
    const integration = new PlannerIntegration();
    const reasoning = createReasoningResult('create_store', 0.9, 'execute_tool', []);
    const bundle = await integration.maybeGenerateForIntake({
      classification: {
        executionPath: 'direct_action',
        tool: 'create_store',
        _reasoningResult: reasoning,
      },
      reasoningResult: reasoning,
      context: { userId: 'user_1' },
      req: { headers: {} },
    });

    const result = await integration.executeDynamicPlanForIntake({
      missionId: 'mission_1',
      bundle,
      user: { id: 'user_1' },
      req: { headers: {} },
    });
    expect(result).toBeNull();
  });

  it('serializes plan for client consumption', () => {
    const steps = dynamicPlanToProactivePlanSteps({
      planId: 'plan_test',
      intent: 'create_store',
      workflow: 'store_creation',
      steps: [
        {
          id: 'step_1',
          name: 'validate',
          label: 'Validating...',
          type: 'action',
          tool: 'validate_store_input',
          order: 1,
          optional: false,
          dependencies: [],
          estimatedDuration: 2,
        },
      ],
      metadata: {
        totalSteps: 1,
        estimatedDuration: 2,
        requiresSignIn: false,
        requiresStore: false,
        tags: [],
        priority: 1,
      },
      contextSnapshot: {},
      reasoning: [],
      suggestedActions: [],
      generatedAt: new Date().toISOString(),
      version: '1.0.0',
    });

    expect(steps[0].title).toBe('Validating...');
    expect(serializeDynamicPlanForClient({
      planId: 'plan_test',
      intent: 'create_store',
      workflow: 'store_creation',
      steps: [
        {
          id: 'step_1',
          name: 'validate',
          label: 'Validating...',
          type: 'action',
          tool: 'validate_store_input',
          order: 1,
          optional: false,
          dependencies: [],
          estimatedDuration: 2,
        },
      ],
      metadata: {
        totalSteps: 1,
        estimatedDuration: 2,
        requiresSignIn: false,
        requiresStore: false,
        tags: [],
        priority: 1,
      },
      contextSnapshot: {},
      reasoning: [],
      suggestedActions: [],
      generatedAt: new Date().toISOString(),
      version: '1.0.0',
    }).steps[0].label).toBe('Validating...');
  });
});
