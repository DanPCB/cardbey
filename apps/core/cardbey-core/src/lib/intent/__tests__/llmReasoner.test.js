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

vi.mock('../../../services/ragService.js', () => ({
  buildRagContext: vi.fn(),
}));

import { llmGateway } from '../../llm/llmGateway.ts';
import { buildRagContext } from '../../../services/ragService.js';

describe('LLMReasoner', () => {
  /** @type {Record<string, string | undefined>} */
  let envSnapshot;

  beforeEach(() => {
    envSnapshot = { ...process.env };
    vi.clearAllMocks();
    process.env.ENABLE_RAG_IN_REASONER = 'false';
  });

  afterEach(() => {
    process.env = envSnapshot;
    vi.useRealTimers();
  });

  it('truncates long conversation history per env limits', () => {
    process.env.LLM_REASONER_MAX_TURN_LENGTH = '1000';
    const longContent = 'x'.repeat(1100);
    const { messages } = buildLlmReasonerPromptForTest(
      { text: 'Create a store called Test' },
      {
        conversationHistory: [
          { role: 'user', content: longContent },
          { role: 'assistant', content: 'Sure, tell me more.' },
        ],
        currentContext: { activeStoreId: 'store_1' },
      },
    );

    const serialized = messages.map((m) => m.content).join('\n');
    expect(serialized).not.toContain(longContent);
    expect(serialized).toContain('x'.repeat(1000));
    expect(serialized).toContain('Sure, tell me more.');
  });

  it('omits duplicate tool schema appendix from system prompt', () => {
    const { system } = buildLlmReasonerPromptForTest(
      { text: 'help me create a store named Test' },
      {},
    );
    expect(system).not.toContain('## Tool parameter reference');
    expect(system).toContain('Params:');
  });

  it('filters tools for store creation domain', () => {
    const { system } = buildLlmReasonerPromptForTest(
      { text: 'help me create a store named Golden Restaurant' },
      {},
    );
    expect(system).toContain('create_store');
    expect(system).not.toMatch(/\d+\. launch_campaign\b/);
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

  it('augments prompt with RAG context when flag is on', async () => {
    process.env.ENABLE_RAG_IN_REASONER = 'true';

    buildRagContext.mockResolvedValue({
      chunks: [
        {
          id: 'c1',
          content: 'Weekly sales were $12,400.',
          similarity: 0.88,
          sourcePath: 'reports/weekly.md',
          scope: 'tenant_activity',
          chunkIndex: 0,
        },
      ],
      context: '',
      sources: [],
    });

    llmGateway.generate.mockResolvedValue({
      text: JSON.stringify({
        intent: 'view_analytics',
        tool: 'get_store_analytics',
        parameters: {},
        confidence: 0.9,
        reasoning: 'User asked about sales; analytics tool fits.',
      }),
      inputTokens: 100,
      outputTokens: 50,
      cached: false,
    });

    const reasoner = new LLMReasoner();
    const result = await reasoner.reason('user_1', 'session_1', { text: 'What are my sales?' }, {
      tenantKey: 'tenant_1',
    });

    expect(buildRagContext).toHaveBeenCalled();
    expect(result.metadata?.ragUsed).toBe(true);
    expect(result.metadata?.ragSummary?.chunkCount).toBe(1);
    expect(result.metadata?.contextUsed).toContain('rag');

    const call = llmGateway.generate.mock.calls[0][0];
    const userMessage = call.messages.find((m) => m.role === 'user')?.content ?? '';
    expect(userMessage).toContain('Weekly sales were $12,400.');
  });

  it('continues without RAG when retrieval fails', async () => {
    process.env.ENABLE_RAG_IN_REASONER = 'true';
    buildRagContext.mockRejectedValue(new Error('OPENAI_NOT_CONFIGURED'));

    llmGateway.generate.mockResolvedValue({
      text: JSON.stringify({
        intent: 'view_analytics',
        tool: 'get_store_analytics',
        parameters: {},
        confidence: 0.85,
        reasoning: 'Proceed without retrieved docs.',
      }),
      inputTokens: 10,
      outputTokens: 10,
      cached: false,
    });

    const reasoner = new LLMReasoner();
    const result = await reasoner.reason('user_1', 'session_1', { text: 'What are my sales?' }, {
      tenantKey: 'tenant_1',
    });

    expect(result.intent).toBe('view_analytics');
    expect(result.metadata?.ragUsed).toBe(false);
  });
});
