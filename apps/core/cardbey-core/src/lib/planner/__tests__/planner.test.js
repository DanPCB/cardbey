/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Planner } from '../planner.js';
import { PLAN_TEMPLATES, getTemplateForIntent, resolveTemplateKey } from '../planTemplates.js';
import { createReasoningResult } from '../../intent/utils.js';
import { emitPlanToBlackboard } from '../planBlackboard.js';

function buildReasoning(overrides = {}) {
  return createReasoningResult(
    overrides.intent ?? 'create_store',
    overrides.confidence ?? 0.9,
    overrides.action ?? 'execute_tool',
    overrides.reasoning ?? ['Test reasoning'],
    {},
  );
}

describe('planTemplates', () => {
  it('resolves intent aliases to templates', () => {
    expect(resolveTemplateKey('import_products')).toBe('add_product');
    expect(getTemplateForIntent('launch_campaign').workflow).toBe('campaign_creation');
  });

  it('falls back to general_chat for unknown intents', () => {
    expect(getTemplateForIntent('unknown_intent_xyz').intent).toBe('general_chat');
  });
});

describe('Planner', () => {
  /** @type {Planner} */
  let planner;

  beforeEach(() => {
    planner = new Planner({ logger: console });
  });

  it('generates a create_store plan with labeled steps', () => {
    const reasoning = buildReasoning({ intent: 'create_store' });
    const result = planner.generatePlan(reasoning, { userId: 'user_1' });

    expect(result.success).toBe(true);
    expect(result.plan.intent).toBe('create_store');
    expect(result.plan.workflow).toBe('store_creation');
    expect(result.plan.steps.length).toBe(PLAN_TEMPLATES.create_store.steps.length);
    expect(result.plan.steps[0].label).toContain('Validating');
    expect(result.plan.steps.every((s) => s.label && s.order > 0)).toBe(true);
  });

  it('marks checkpoint steps explicitly', () => {
    const reasoning = buildReasoning({ intent: 'add_product', tool: 'replace_store_catalog' });
    const result = planner.generatePlan(reasoning, {
      userId: 'user_1',
      activeStoreId: 'store_1',
    });

    const validateStep = result.plan.steps.find((s) => s.tool === 'validate_store_context');
    const prepareStep = result.plan.steps.find((s) => s.tool === 'prepare_catalog');
    expect(validateStep).toBeTruthy();
    expect(prepareStep).toBeTruthy();
    expect(validateStep?.preview_only).not.toBe(true);
    expect(prepareStep?.preview_only).not.toBe(true);

    const checkpoints = result.plan.steps.filter((s) => s.type === 'checkpoint');
    expect(checkpoints.length).toBeGreaterThan(0);
    expect(checkpoints[0].checkpointConfig?.type).toBe('upload');
    expect(checkpoints[0].checkpointConfig?.required).toBe(true);
  });

  it('guest-aware planning converts blocked steps to sign-in checkpoints', () => {
    const reasoning = buildReasoning({ intent: 'add_product' });
    const result = planner.generatePlan(reasoning, {
      userId: 'guest_abc',
      activeDraftId: 'draft_1',
    });

    expect(result.plan.metadata.requiresSignIn).toBe(true);
    const signInStep = result.plan.steps.find((s) => s.guestBehavior === 'guide_to_sign_in');
    expect(signInStep?.type).toBe('checkpoint');
    expect(signInStep?.checkpointConfig?.type).toBe('confirmation');
  });

  it('prepends create_store step when no store exists', () => {
    const reasoning = buildReasoning({ intent: 'add_product' });
    const result = planner.generatePlan(reasoning, { userId: 'user_1' });

    expect(result.plan.steps[0].tool).toBe('create_store');
    expect(result.plan.steps[0].name).toBe('create_store_first');
  });

  it('validates plans and reports errors for empty steps', () => {
    const reasoning = buildReasoning({ intent: 'general_chat' });
    const badPlanner = new Planner({ config: { maxSteps: 0 } });
    const result = badPlanner.generatePlan(reasoning, { userId: 'user_1' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('max is 0');
  });

  it('includes reasoning trace on the plan', () => {
    const reasoning = buildReasoning({
      intent: 'create_campaign',
      reasoning: ['User wants campaign'],
    });
    const result = planner.generatePlan(reasoning, {
      userId: 'user_1',
      activeStoreId: 'store_1',
    });

    expect(result.plan.reasoning.some((r) => r.includes('create_campaign'))).toBe(true);
    expect(result.alternatives.length).toBeGreaterThan(0);
  });
});

describe('planBlackboard', () => {
  it('emits plan preview events to blackboard', async () => {
    const reasoning = buildReasoning({ intent: 'create_store' });
    const planner = new Planner();
    const { plan } = planner.generatePlan(reasoning, { userId: 'user_1' });

    const appendEvent = vi.fn().mockResolvedValue(null);
    const blackboard = {
      appendEvent,
      flushOrchestrationEvents: vi.fn().mockResolvedValue(undefined),
    };

    const out = await emitPlanToBlackboard('mission_1', plan, { blackboard });

    expect(out.emitted).toBeGreaterThan(plan.steps.length);
    expect(appendEvent).toHaveBeenCalled();
    const eventTypes = appendEvent.mock.calls.map((c) => c[1]);
    expect(eventTypes).toContain('execution.started');
    expect(eventTypes.some((t) => t === 'plan.step.preview' || t === 'execution.checkpoint.awaiting')).toBe(
      true,
    );
  });
});
