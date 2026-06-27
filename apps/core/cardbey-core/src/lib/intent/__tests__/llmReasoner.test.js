/**
 * @vitest-environment node
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LLMReasoner, buildLlmReasonerPromptForTest } from '../llmReasoner.js';

vi.mock('../../llm/llmGateway.ts', () => ({
  llmGateway: {
    generate: vi.fn(),
  },
}));

import { llmGateway } from '../../llm/llmGateway.ts';

describe('LLMReasoner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('includes full conversation history without truncation in prompt', () => {
    const longContent = 'x'.repeat(900);
    const { user } = buildLlmReasonerPromptForTest(
      { text: 'Create a store called Test' },
      {
        conversationHistory: [
          { role: 'user', content: longContent },
          { role: 'assistant', content: 'Sure, tell me more.' },
        ],
        currentContext: { activeStoreId: 'store_1' },
      },
    );

    expect(user).toContain(longContent);
    expect(user).toContain('Sure, tell me more.');
    expect(user).toContain('store_1');
  });

  it('parses LLM JSON into IntentReasoningResult with registered tool', async () => {
    llmGateway.generate.mockResolvedValue({
      text: JSON.stringify({
        intent: 'create_store',
        tool: 'create_store',
        parameters: { storeName: 'Test' },
        confidence: 0.92,
        reasoning: 'User asked to create a store named Test.',
      }),
      inputTokens: 100,
      outputTokens: 50,
      cached: false,
    });

    const reasoner = new LLMReasoner();
    const result = await reasoner.reason('user_1', 'session_1', { text: 'Create a store called Test' }, {
      conversationHistory: [],
      tenantKey: 'user_1',
    });

    expect(result.intent).toBe('create_store');
    expect(result.tool).toBe('create_store');
    expect(result.confidence).toBe(0.92);
    expect(result.action).toBe('execute_tool');
    expect(result.metadata?.sources).toContain('llm');
    expect(llmGateway.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        purpose: 'intake:llm_reasoner',
        responseFormat: 'json',
      }),
    );
  });

  it('throws when LLM returns empty response', async () => {
    llmGateway.generate.mockResolvedValue({ text: '', inputTokens: 0, outputTokens: 0, cached: false });

    const reasoner = new LLMReasoner();
    await expect(
      reasoner.reason('user_1', 'session_1', { text: 'hello' }, { tenantKey: 'user_1' }),
    ).rejects.toThrow('LLM_REASONER_EMPTY_RESPONSE');
  });

  it('maps low confidence to clarification action', async () => {
    llmGateway.generate.mockResolvedValue({
      text: JSON.stringify({
        intent: 'add_product',
        tool: 'replace_store_catalog',
        parameters: {},
        confidence: 0.4,
        reasoning: 'Need product details.',
      }),
      inputTokens: 10,
      outputTokens: 10,
      cached: false,
    });

    const reasoner = new LLMReasoner();
    const result = await reasoner.reason('user_1', 'session_1', { text: 'add a product' }, {
      tenantKey: 'user_1',
    });

    expect(result.action).toBe('ask_clarification');
    expect(result.requiresClarification).toBe(true);
  });
});
