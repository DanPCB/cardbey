/**
 * Agent unit tests with mocked LLM responses.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IntentClassifier } from '../agents/intent.classifier.js';
import { Planner } from '../agents/planner.agent.js';
import { Critic } from '../agents/critic.agent.js';
import { Refiner } from '../agents/refiner.agent.js';
import { Specialist } from '../agents/specialist.agent.js';
import { Intent } from '../types/agent.types.js';
import { resetSharedClientForTests } from '../agents/base.agent.js';

function mockCompletion(content: string, tokens = 100) {
  return {
    choices: [{ message: { content } }],
    usage: { total_tokens: tokens },
  };
}

function mockAgentCallDeepSeek(agent: { callDeepSeek: (...args: unknown[]) => unknown }, content: string) {
  vi.spyOn(agent, 'callDeepSeek' as never).mockResolvedValue({
    response: mockCompletion(content),
    meta: { tokensUsed: 100, durationMs: 50, model: 'deepseek-v4-flash', provider: 'deepseek' },
  } as never);
}

describe('IntentClassifier', () => {
  beforeEach(() => {
    resetSharedClientForTests();
    vi.restoreAllMocks();
  });

  it('classifies store setup intent', async () => {
    const classifier = new IntentClassifier();
    mockAgentCallDeepSeek(
      classifier,
      JSON.stringify({
        intent: 'STORE_SETUP',
        confidence: 0.95,
        entities: { storeName: 'Glow Beauty', location: 'Melbourne' },
      }),
    );

    const result = await classifier.process(
      "I want to open a beauty store called 'Glow Beauty' in Melbourne",
    );

    expect(result.intent).toBe(Intent.STORE_SETUP);
    expect(result.confidence).toBeGreaterThan(0.9);
    expect(result.entities?.storeName).toBe('Glow Beauty');
  });

  it('classifies mission planning intent', async () => {
    const classifier = new IntentClassifier();
    mockAgentCallDeepSeek(
      classifier,
      JSON.stringify({
        intent: 'MISSION_PLANNING',
        confidence: 0.92,
        entities: { storeCount: 3 },
      }),
    );

    const result = await classifier.process(
      'Set up 3 stores: Beauty in Melbourne, Fashion in Sydney, Electronics in Brisbane',
    );

    expect(result.intent).toBe(Intent.MISSION_PLANNING);
  });
});

describe('Planner multi-store clarification', () => {
  beforeEach(() => {
    resetSharedClientForTests();
    vi.restoreAllMocks();
  });

  it('returns clarification plan without calling the LLM', async () => {
    const planner = new Planner();
    const plan = await planner.process({
      message: 'Set up 3 stores in different cities',
      context: { intent: Intent.MISSION_PLANNING },
    });

    expect(plan.isClarification).toBe(true);
    expect(plan.steps[0]?.action).toBe('clarify_store_names');
    expect(plan.missingFields).toContain('store_names');
    expect(plan.clarificationMessage).toContain('3 stores');
  });
});

describe('Planner', () => {
  beforeEach(() => {
    resetSharedClientForTests();
    vi.restoreAllMocks();
  });

  it('creates a valid mission plan', async () => {
    const planner = new Planner();
    mockAgentCallDeepSeek(
      planner,
      JSON.stringify({
        steps: [
          { action: 'validate_store_name', parameters: { name: 'Glow Beauty' }, validation: 'name unique' },
          { action: 'create_store', parameters: { category: 'beauty' }, validation: 'store created' },
        ],
        requiredTools: ['create_store'],
        estimatedComplexity: 'medium',
        dependencies: { create_store: ['validate_store_name'] },
      }),
    );

    const plan = await planner.process({
      message: "Open beauty store 'Glow Beauty' in Melbourne",
    });

    expect(plan.steps.length).toBe(2);
    expect(plan.steps[0].id).toBeTruthy();
    expect(plan.requiredTools).toContain('create_store');
    expect(plan.estimatedComplexity).toBe('medium');
  });
});

describe('Critic', () => {
  beforeEach(() => {
    resetSharedClientForTests();
    vi.restoreAllMocks();
  });

  it('approves a complete plan', async () => {
    const critic = new Critic();
    mockAgentCallDeepSeek(
      critic,
      JSON.stringify({
        approved: true,
        issues: [],
        suggestions: ['Consider adding menu setup'],
        confidence: 0.9,
        risks: [],
      }),
    );

    const review = await critic.process({
      plan: {
        steps: [{ id: '1', action: 'create_store', parameters: {} }],
        requiredTools: ['create_store'],
        estimatedComplexity: 'low',
        dependencies: {},
      },
    });

    expect(review.approved).toBe(true);
    expect(review.confidence).toBeGreaterThan(0.8);
  });

  it('rejects an invalid plan', async () => {
    const critic = new Critic();
    mockAgentCallDeepSeek(
      critic,
      JSON.stringify({
        approved: false,
        issues: ['Missing store location', 'Invalid category'],
        suggestions: ['Add location parameter'],
        confidence: 0.85,
        risks: ['Incomplete store record'],
      }),
    );

    const review = await critic.process({
      plan: {
        steps: [{ id: '1', action: 'create_store', parameters: {} }],
        requiredTools: [],
        estimatedComplexity: 'high',
        dependencies: {},
      },
      originalMessage: 'Create a store with invalid parameters',
    });

    expect(review.approved).toBe(false);
    expect(review.issues.length).toBeGreaterThan(0);
  });
});

describe('Refiner', () => {
  beforeEach(() => {
    resetSharedClientForTests();
    vi.restoreAllMocks();
  });

  it('refines draft response', async () => {
    const refiner = new Refiner();
    mockAgentCallDeepSeek(
      refiner,
      'Great news! Your store setup is complete. All 3 steps finished successfully.',
    );

    const refined = await refiner.process('Mission completed: 3 of 3 steps succeeded.');
    expect(refined).toContain('store setup');
  });
});

describe('Specialist', () => {
  beforeEach(() => {
    resetSharedClientForTests();
    vi.restoreAllMocks();
  });

  it('answers general queries', async () => {
    const specialist = new Specialist('general_assistance');
    mockAgentCallDeepSeek(
      specialist,
      'Home decor businesses typically perform well in the Home & Living or Gifts categories.',
    );

    const response = await specialist.process(
      "What's the best category for a home decor business?",
    );

    expect(response.toLowerCase()).toContain('home');
  });
});
