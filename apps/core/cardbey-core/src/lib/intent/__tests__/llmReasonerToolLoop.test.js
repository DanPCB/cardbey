/**
 * @vitest-environment node
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { LLMReasoner } from '../llmReasoner.js';
import { isLlmReasonerReadOnlyTool } from '../llmReasonerReadOnlyTools.js';

vi.mock('../../llm/llmGateway.ts', () => ({
  llmGateway: {
    generate: vi.fn(),
  },
}));

vi.mock('../../toolExecutors/index.js', () => ({
  getExecutor: vi.fn(() => ({
    execute: vi.fn(async () => ({ ok: true, products: [{ name: 'Latte' }] })),
  })),
}));

import { llmGateway } from '../../llm/llmGateway.ts';

describe('LLMReasoner tool loop', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allows whitelisted read-only tools', () => {
    expect(isLlmReasonerReadOnlyTool('mcp_context_analytics')).toBe(true);
    expect(isLlmReasonerReadOnlyTool('create_store')).toBe(false);
  });

  it('runs ReAct loop then returns final intent', async () => {
    llmGateway.generate
      .mockResolvedValueOnce({
        text: JSON.stringify({
          phase: 'tool_call',
          tool_call: { name: 'mcp_context_analytics', parameters: { storeId: 's1' } },
          reasoning: 'Need analytics',
        }),
        inputTokens: 10,
        outputTokens: 10,
        cached: false,
      })
      .mockResolvedValueOnce({
        text: JSON.stringify({
          phase: 'final',
          intent: 'view_analytics',
          tool: 'get_store_analytics',
          parameters: { storeId: 's1' },
          confidence: 0.9,
          reasoning: 'User asked about performance',
        }),
        inputTokens: 10,
        outputTokens: 10,
        cached: false,
      });

    const reasoner = new LLMReasoner();
    const result = await reasoner.reasonWithTools(
      'user_1',
      'session_1',
      { text: 'How is my store doing?' },
      {
        tenantKey: 'user_1',
        currentContext: { activeStoreId: 's1' },
        conversationHistory: [],
      },
    );

    expect(llmGateway.generate).toHaveBeenCalledTimes(2);
    expect(result.intent).toBe('view_analytics');
    expect(result.metadata?.toolLoopTrace?.length).toBe(1);
  });
});
