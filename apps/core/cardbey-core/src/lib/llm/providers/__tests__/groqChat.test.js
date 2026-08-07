/**
 * @vitest-environment node
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../openaiChat.ts', () => ({
  callOpenAIChat: vi.fn(),
}));

import { callOpenAIChat } from '../openaiChat.ts';
import { callGroqChat, resolveGroqModel } from '../groqChat.ts';

describe('groqChat', () => {
  /** @type {Record<string, string | undefined>} */
  let originalEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    process.env.GROQ_API_KEY = 'test-groq-key';
    delete process.env.GROQ_ENABLED;
    delete process.env.GROQ_DEFAULT_MODEL;
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('resolves default groq model', () => {
    expect(resolveGroqModel()).toBe('llama-3.1-8b-instant');
  });

  it('calls Groq OpenAI-compatible endpoint', async () => {
    callOpenAIChat.mockResolvedValue({
      content: 'Hello from Groq',
      tool_calls: null,
      inputTokens: 8,
      outputTokens: 4,
      model: 'llama-3.1-8b-instant',
    });

    const result = await callGroqChat({
      messages: [{ role: 'user', content: 'Hi' }],
      maxTokens: 100,
      temperature: 0.3,
      model: '',
    });

    expect(result.content).toBe('Hello from Groq');
    expect(callOpenAIChat).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'llama-3.1-8b-instant' }),
      expect.objectContaining({
        apiKey: 'test-groq-key',
        baseURL: 'https://api.groq.com/openai/v1',
      }),
    );
  });
});
