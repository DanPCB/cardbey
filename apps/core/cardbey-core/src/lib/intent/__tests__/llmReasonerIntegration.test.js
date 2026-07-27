/**
 * @vitest-environment node
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LLMReasonerIntegration,
  hashUserIdForRollout,
  isLlmReasonerEnabled,
} from '../llmReasonerIntegration.js';

vi.mock('../llmReasoner.js', () => ({
  LLMReasoner: vi.fn().mockImplementation(() => ({
    reason: vi.fn(),
  })),
}));

import { LLMReasoner } from '../llmReasoner.js';

describe('LLMReasonerIntegration', () => {
  /** @type {Record<string, string | undefined>} */
  let originalEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('is disabled when ENABLE_LLM_REASONER is not true', () => {
    process.env.ENABLE_LLM_REASONER = 'false';
    expect(isLlmReasonerEnabled({}, 'user_1')).toBe(false);
  });

  it('honors rollout percentage', () => {
    process.env.ENABLE_LLM_REASONER = 'true';
    process.env.LLM_REASONER_ROLLOUT_PERCENTAGE = '10';
    const uid = 'canary-user-fixed-id-for-test';
    const bucket = hashUserIdForRollout(uid);
    const enabled = isLlmReasonerEnabled({}, uid);
    expect(enabled).toBe(bucket < 10);
  });

  it('returns null when feature flag is off', async () => {
    process.env.ENABLE_LLM_REASONER = 'false';
    const deterministicReasoner = { reason: vi.fn() };
    const integration = new LLMReasonerIntegration({ deterministicReasoner });

    const out = await integration.tryReason({
      userId: 'user_1',
      sessionId: 'session_1',
      input: { text: 'hello' },
      classifyOpts: { conversationHistory: [] },
      req: {},
    });

    expect(out).toBeNull();
    expect(deterministicReasoner.reason).not.toHaveBeenCalled();
  });

  it('uses LLM result when enabled and intent is ambiguous for deterministic preview', async () => {
    process.env.ENABLE_LLM_REASONER = 'true';
    const llmResult = {
      intent: 'general_chat',
      tool: 'general_chat',
      confidence: 0.9,
      action: 'show_help',
      parameters: {},
      reasoning: ['ok'],
      metadata: { sources: ['llm'] },
    };

    LLMReasoner.mockImplementation(() => ({
      reason: vi.fn().mockResolvedValue(llmResult),
    }));

    const deterministicReasoner = {
      reason: vi.fn().mockResolvedValue({
        intent: 'general_chat',
        confidence: 0.95,
        tool: 'general_chat',
        action: 'show_help',
        parameters: {},
        reasoning: ['rules'],
        metadata: { sources: ['rules'] },
      }),
    };
    const integration = new LLMReasonerIntegration({ deterministicReasoner });

    const out = await integration.tryReason({
      userId: 'user_1',
      sessionId: 'session_1',
      input: { text: 'tell me about marketing strategy for cafes' },
      classifyOpts: {
        conversationHistory: [{ role: 'user', content: 'Hi' }],
      },
      req: { headers: {} },
    });

    expect(out?.source).toBe('llm');
    expect(out?.result.intent).toBe('general_chat');
    expect(LLMReasoner).toHaveBeenCalled();
  });

  it('skips LLM for unambiguous create_store deterministic preview', async () => {
    process.env.ENABLE_LLM_REASONER = 'true';
    const reasonMock = vi.fn();

    LLMReasoner.mockImplementation(() => ({
      reason: reasonMock,
      reasonWithTools: vi.fn(),
    }));

    const deterministicReasoner = {
      reason: vi.fn().mockResolvedValue({
        intent: 'create_store',
        tool: 'create_store',
        confidence: 0.95,
        action: 'start_new_workflow',
        parameters: { storeName: 'Golden Restaurant' },
        reasoning: ['Store creation phrase detected'],
        metadata: { sources: ['rules'] },
      }),
    };

    const integration = new LLMReasonerIntegration({ deterministicReasoner });

    const out = await integration.tryReason({
      userId: 'user_1',
      sessionId: 'session_1',
      input: { text: 'help me to create a store, named Golden Restaurant' },
      classifyOpts: { conversationHistory: [] },
      req: { headers: {} },
    });

    expect(out?.source).toBe('deterministic_fallback');
    expect(out?.result.intent).toBe('create_store');
    expect(out?.result.metadata?.llmSkipped).toBe('unambiguous_intent');
    expect(reasonMock).not.toHaveBeenCalled();
  });

  it('uses LLM result when enabled for non-unambiguous preview', async () => {
    process.env.ENABLE_LLM_REASONER = 'true';
    const llmResult = {
      intent: 'create_store',
      tool: 'create_store',
      confidence: 0.9,
      action: 'execute_tool',
      parameters: {},
      reasoning: ['ok'],
      metadata: { sources: ['llm'] },
    };

    LLMReasoner.mockImplementation(() => ({
      reason: vi.fn().mockResolvedValue(llmResult),
    }));

    const deterministicReasoner = {
      reason: vi.fn().mockResolvedValue({
        intent: 'general_chat',
        confidence: 0.5,
        tool: 'general_chat',
        action: 'show_help',
        parameters: {},
        reasoning: ['rules'],
        metadata: { sources: ['rules'] },
      }),
    };
    const integration = new LLMReasonerIntegration({ deterministicReasoner });

    const out = await integration.tryReason({
      userId: 'user_1',
      sessionId: 'session_1',
      input: { text: 'Create a store called Test' },
      classifyOpts: {
        conversationHistory: [{ role: 'user', content: 'Hi' }],
      },
      req: { headers: {} },
    });

    expect(out?.source).toBe('llm');
    expect(out?.result.intent).toBe('create_store');
    expect(deterministicReasoner.reason).toHaveBeenCalled();
  });

  it('falls back to deterministic reasoner on LLM failure', async () => {
    process.env.ENABLE_LLM_REASONER = 'true';

    LLMReasoner.mockImplementation(() => ({
      reason: vi.fn().mockRejectedValue(new Error('API down')),
    }));

    const fallbackResult = {
      intent: 'general_chat',
      tool: 'general_chat',
      confidence: 0.6,
      action: 'show_help',
      parameters: {},
      reasoning: ['rules'],
      metadata: { sources: ['rules'] },
    };

    const deterministicReasoner = {
      reason: vi.fn().mockResolvedValue(fallbackResult),
    };

    const integration = new LLMReasonerIntegration({ deterministicReasoner });

    const out = await integration.tryReason({
      userId: 'user_1',
      sessionId: 'session_1',
      input: { text: 'explain quarterly marketing strategy for cafes' },
      classifyOpts: {},
      req: { headers: {} },
    });

    expect(out?.source).toBe('deterministic_fallback');
    expect(out?.result.intent).toBe('general_chat');
    expect(deterministicReasoner.reason).toHaveBeenCalledTimes(1);
    expect(out?.result.metadata?.llmSkipped).toBe('llm_error');
  });
});

describe('hashUserIdForRollout', () => {
  it('is stable for the same user id', () => {
    expect(hashUserIdForRollout('user_abc')).toBe(hashUserIdForRollout('user_abc'));
  });
});
