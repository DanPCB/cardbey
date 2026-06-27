/**
 * @vitest-environment node
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IntentIntegration, resetIntentIntegrationForTests } from '../intentIntegration.js';

vi.mock('../../llm/llmGateway.ts', () => ({
  llmGateway: {
    generate: vi.fn(),
  },
}));

import { llmGateway } from '../../llm/llmGateway.ts';

describe('IntentIntegration with LLM reasoner flag', () => {
  /** @type {Record<string, string | undefined>} */
  let originalEnv;

  beforeEach(() => {
    resetIntentIntegrationForTests();
    originalEnv = { ...process.env };
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
    resetIntentIntegrationForTests();
  });

  it('uses llm_reasoner classification source when flag is on', async () => {
    process.env.ENABLE_LLM_REASONER = 'true';

    llmGateway.generate.mockResolvedValue({
      text: JSON.stringify({
        intent: 'create_store',
        tool: 'create_store',
        parameters: { storeName: 'Test' },
        confidence: 0.95,
        reasoning: 'Clear create store request.',
      }),
      inputTokens: 10,
      outputTokens: 10,
      cached: false,
    });

    const mockContextProvider = {
      getContext: vi.fn().mockResolvedValue({
        activeStoreId: null,
        interactions: [],
        preferences: {},
      }),
    };

    const integration = new IntentIntegration({
      contextProvider: mockContextProvider,
      logger: console,
    });

    const reasonSpy = vi.spyOn(integration.reasoner, 'reason');

    const result = await integration.processIntake({
      userId: 'user_1',
      sessionId: 'session_1',
      input: { text: 'Create a store called Test' },
      classifyOpts: {
        conversationHistory: [{ role: 'user', content: 'I want a new shop' }],
        tenantKey: 'user_1',
      },
      req: { headers: {} },
    });

    expect(['llm_reasoner', 'fast_path', 'llm_reasoner_fallback']).toContain(
      result._classificationSource,
    );
    expect(result.tool).toBe('create_store');
    expect(reasonSpy).toHaveBeenCalled();
    expect(llmGateway.generate).not.toHaveBeenCalled();
  });

  it('uses intent_reasoner when flag is off', async () => {
    process.env.ENABLE_LLM_REASONER = 'false';

    const mockContextProvider = {
      getContext: vi.fn().mockResolvedValue({
        activeStoreId: 'store_1',
        interactions: [],
        preferences: {},
      }),
    };

    const integration = new IntentIntegration({
      contextProvider: mockContextProvider,
      logger: console,
    });

    const reasonSpy = vi.spyOn(integration.reasoner, 'reason');

    const result = await integration.processIntake({
      userId: 'user_1',
      sessionId: 'session_1',
      input: { text: 'Add a product' },
      classifyOpts: {},
      req: { headers: {} },
    });

    expect(reasonSpy).toHaveBeenCalled();
    expect(result._classificationSource).toBe('intent_reasoner');
    expect(llmGateway.generate).not.toHaveBeenCalled();
  });

  it('uses fast_path for simple greeting when LLM flag is on', async () => {
    process.env.ENABLE_LLM_REASONER = 'true';

    const mockContextProvider = {
      getContext: vi.fn().mockResolvedValue({
        activeStoreId: null,
        activeMissionId: null,
        interactions: [],
        preferences: {},
      }),
    };

    const integration = new IntentIntegration({
      contextProvider: mockContextProvider,
      logger: console,
    });

    const reasonSpy = vi.spyOn(integration.reasoner, 'reason');

    const result = await integration.processIntake({
      userId: 'user_1',
      sessionId: 'session_1',
      input: { text: 'Hi' },
      classifyOpts: {},
      req: { headers: {} },
    });

    expect(result._classificationSource).toBe('fast_path');
    expect(reasonSpy).toHaveBeenCalled();
    expect(llmGateway.generate).not.toHaveBeenCalled();
  });

  it('uses llm_reasoner for complex message when LLM flag is on', async () => {
    process.env.ENABLE_LLM_REASONER = 'true';

    llmGateway.generate.mockResolvedValue({
      text: JSON.stringify({
        intent: 'create_store',
        tool: 'create_store',
        parameters: { storeName: 'Test' },
        confidence: 0.95,
        reasoning: 'Clear create store request.',
      }),
      inputTokens: 10,
      outputTokens: 10,
      cached: false,
    });

    const mockContextProvider = {
      getContext: vi.fn().mockResolvedValue({
        activeStoreId: null,
        interactions: [],
        preferences: {},
      }),
    };

    const integration = new IntentIntegration({
      contextProvider: mockContextProvider,
      logger: console,
    });

    const reasonSpy = vi.spyOn(integration.reasoner, 'reason');

    const result = await integration.processIntake({
      userId: 'user_1',
      sessionId: 'session_1',
      input: { text: 'Create a store called Test' },
      classifyOpts: {},
      req: { headers: {} },
    });

    expect(['llm_reasoner', 'llm_reasoner_fallback']).toContain(result._classificationSource);
    expect(reasonSpy).toHaveBeenCalled();
  });
});
