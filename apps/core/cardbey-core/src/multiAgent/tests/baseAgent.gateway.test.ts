/**
 * @vitest-environment node
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/llm/llmGateway.ts', () => ({
  llmGateway: {
    complete: vi.fn(),
    generate: vi.fn(),
  },
}));

vi.mock('../telemetry/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { llmGateway } from '../../lib/llm/llmGateway.ts';
import { BaseAgent, resetSharedClientForTests } from '../agents/base.agent.js';
import { AgentType } from '../types/agent.types.js';

class TestAgent extends BaseAgent {
  async process(input: unknown): Promise<unknown> {
    const { response, meta } = await this.callDeepSeek(
      [
        { role: 'system', content: 'sys' },
        { role: 'user', content: String(input ?? '') },
      ],
      { responseFormat: { type: 'json_object' }, useCache: false },
    );
    return { text: response.choices[0]?.message?.content, meta };
  }
}

describe('BaseAgent gateway (Phase 2)', () => {
  /** @type {Record<string, string | undefined>} */
  let originalEnv: Record<string, string | undefined>;

  beforeEach(() => {
    originalEnv = { ...process.env };
    process.env.USE_LLM_GATEWAY = 'true';
    process.env.MULTIAGENT_USE_GATEWAY = 'true';
    delete process.env.MULTIAGENT_PROVIDER;
    vi.clearAllMocks();
    resetSharedClientForTests();
  });

  afterEach(() => {
    process.env = originalEnv;
    resetSharedClientForTests();
  });

  it('uses llmGateway with configured MULTIAGENT_PROVIDER', async () => {
    process.env.MULTIAGENT_PROVIDER = 'kimi';
    vi.mocked(llmGateway.complete).mockResolvedValue({
      text: '{"ok":true}',
      content: '{"ok":true}',
      inputTokens: 2,
      outputTokens: 2,
      cached: false,
      tool_calls: null,
      model: 'kimi-k2.5',
    });

    const agent = new TestAgent(AgentType.INTENT_CLASSIFIER, {
      model: 'kimi-k2.5',
      provider: 'deepseek',
    });
    const result = (await agent.process('hi')) as { text: string; meta: { provider: string } };

    expect(result.text).toBe('{"ok":true}');
    expect(llmGateway.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'kimi',
        responseFormat: 'json',
        purpose: 'multi_agent_intent_classifier',
      }),
    );
    expect(result.meta.provider).toBe('kimi');
  });

  it('defaults gateway provider to deepseek', async () => {
    vi.mocked(llmGateway.complete).mockResolvedValue({
      text: 'ok',
      content: 'ok',
      inputTokens: 1,
      outputTokens: 1,
      cached: false,
      tool_calls: null,
    });

    const agent = new TestAgent(AgentType.PLANNER, {
      model: 'deepseek-v4-flash',
      provider: 'deepseek',
    });
    await agent.process('plan');

    expect(llmGateway.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'deepseek',
      }),
    );
  });
});
