/**
 * @vitest-environment node
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../openaiChat.ts', () => ({
  callOpenAIChat: vi.fn(),
}));

import { callOpenAIChat } from '../openaiChat.ts';
import { callKimiChat, resolveKimiModel } from '../kimiChat.ts';

describe('kimiChat', () => {
  /** @type {Record<string, string | undefined>} */
  let originalEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    process.env.KIMI_API_KEY = 'test-kimi-key';
    delete process.env.KIMI_DISABLED;
    delete process.env.KIMI_ENABLED;
    delete process.env.KIMI_DEFAULT_MODEL;
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('resolves default kimi model', () => {
    expect(resolveKimiModel()).toBe('kimi-k2.5');
    process.env.KIMI_DEFAULT_MODEL = 'moonshot-v1-8k';
    expect(resolveKimiModel()).toBe('moonshot-v1-8k');
  });

  it('calls OpenAI-compatible Moonshot endpoint and returns gateway shape', async () => {
    callOpenAIChat.mockResolvedValue({
      content: 'Hello from Kimi',
      tool_calls: null,
      inputTokens: 10,
      outputTokens: 5,
      model: 'kimi-k2.5',
    });

    const result = await callKimiChat({
      messages: [{ role: 'user', content: 'Hi' }],
      maxTokens: 100,
      temperature: 0.3,
      model: 'kimi-k2.5',
    });

    expect(result.content).toBe('Hello from Kimi');
    expect(callOpenAIChat).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'kimi-k2.5' }),
      expect.objectContaining({
        apiKey: 'test-kimi-key',
        baseURL: 'https://api.moonshot.cn/v1',
      }),
    );
  });

  it('throws when Kimi is disabled', async () => {
    process.env.KIMI_ENABLED = 'false';
    await expect(
      callKimiChat({
        messages: [{ role: 'user', content: 'Hi' }],
        maxTokens: 10,
        temperature: 0,
        model: 'kimi-k2.5',
      }),
    ).rejects.toThrow(/disabled/i);
  });
});
