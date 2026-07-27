/**
 * @vitest-environment node
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../providers/anthropicChat.ts', () => ({
  callAnthropicChat: vi.fn(),
}));
vi.mock('../providers/openaiChat.ts', () => ({
  callOpenAIChat: vi.fn(),
  callXaiChat: vi.fn(),
}));
vi.mock('../providers/deepseekChat.ts', () => ({
  callDeepSeekChat: vi.fn(),
}));

vi.mock('../../lib/prisma.js', () => ({
  getPrismaClient: vi.fn(() => ({
    llmUsageDaily: {
      findMany: vi.fn().mockResolvedValue([]),
      upsert: vi.fn().mockResolvedValue({}),
    },
    llmCache: {
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue({}),
    },
  })),
}));

import { callOpenAIChat } from '../providers/openaiChat.ts';
import { llmGateway } from '../llmGateway.ts';

describe('llmGateway complete/generate', () => {
  /** @type {Record<string, string | undefined>} */
  let originalEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    process.env.LLM_ENABLED = 'true';
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.LLM_DEFAULT_PROVIDER = 'openai';
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('supports multi-message chat', async () => {
    callOpenAIChat.mockResolvedValue({
      content: 'Store draft ready.',
      tool_calls: null,
      inputTokens: 12,
      outputTokens: 8,
      model: 'gpt-4o',
    });

    const result = await llmGateway.complete({
      purpose: 'test:multi_message',
      tenantKey: 'tenant_1',
      messages: [
        { role: 'system', content: 'You are Performer.' },
        { role: 'user', content: 'Hi' },
        { role: 'assistant', content: 'Hello!' },
        { role: 'user', content: 'Create a store.' },
      ],
      provider: 'openai',
      model: 'gpt-4o',
    });

    expect(result.text).toBe('Store draft ready.');
    expect(callOpenAIChat).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({ role: 'system' }),
          expect.objectContaining({ role: 'user', content: 'Create a store.' }),
        ]),
      }),
    );
  });

  it('passes native tool schemas to provider', async () => {
    callOpenAIChat.mockResolvedValue({
      content: '',
      tool_calls: [{ id: 'call_1', name: 'list_stores', parameters: {} }],
      inputTokens: 5,
      outputTokens: 3,
      model: 'gpt-4o',
    });

    const result = await llmGateway.complete({
      purpose: 'test:tools',
      tenantKey: 'tenant_1',
      messages: [{ role: 'user', content: 'What stores do I have?' }],
      tools: [
        {
          name: 'list_stores',
          description: 'List all stores for the user',
          parameters: { type: 'object', properties: {} },
        },
      ],
      provider: 'openai',
      model: 'gpt-4o',
    });

    expect(result.tool_calls?.[0]?.name).toBe('list_stores');
    expect(callOpenAIChat).toHaveBeenCalledWith(
      expect.objectContaining({
        tools: expect.arrayContaining([
          expect.objectContaining({ name: 'list_stores' }),
        ]),
      }),
    );
  });

  it('remains backward compatible with prompt + systemPrompt', async () => {
    callOpenAIChat.mockResolvedValue({
      content: 'Hello!',
      tool_calls: null,
      inputTokens: 4,
      outputTokens: 2,
      model: 'gpt-4o',
    });

    const result = await llmGateway.generate({
      purpose: 'test:legacy',
      tenantKey: 'tenant_1',
      prompt: 'Hello',
      systemPrompt: 'You are Performer.',
      provider: 'openai',
      model: 'gpt-4o',
    });

    expect(result.text).toBe('Hello!');
    expect(callOpenAIChat).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          { role: 'system', content: 'You are Performer.' },
          { role: 'user', content: 'Hello' },
        ],
      }),
    );
  });
});
