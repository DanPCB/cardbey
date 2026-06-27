/**
 * @vitest-environment node
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  getCachedSystemPrompt,
  inferToolDomainFromText,
  normalizeConversationHistory,
  resetSystemPromptCacheForTests,
  truncateTurnContent,
} from '../llmReasonerPromptUtils.js';

describe('llmReasonerPromptUtils', () => {
  /** @type {Record<string, string | undefined>} */
  let envSnapshot;

  beforeEach(() => {
    envSnapshot = { ...process.env };
    resetSystemPromptCacheForTests();
  });

  afterEach(() => {
    process.env = envSnapshot;
    resetSystemPromptCacheForTests();
  });

  it('infers create_store domain from store creation phrases', () => {
    expect(inferToolDomainFromText('help me to create a store, named Golden Restaurant')).toBe(
      'create_store',
    );
  });

  it('truncates conversation history turns and count', () => {
    process.env.LLM_REASONER_MAX_HISTORY_TURNS = '2';
    process.env.LLM_REASONER_MAX_TURN_LENGTH = '10';

    const normalized = normalizeConversationHistory([
      { role: 'user', content: 'first message turn' },
      { role: 'assistant', content: 'second message turn' },
      { role: 'user', content: 'third message turn' },
    ]);

    expect(normalized).toHaveLength(2);
    expect(normalized[0].content).toBe('second mes…');
    expect(normalized[1].content).toBe('third mess…');
  });

  it('memoizes system prompt for the same cache key', () => {
    const a = getCachedSystemPrompt('en', false, 'create_store');
    const b = getCachedSystemPrompt('en', false, 'create_store');
    expect(a).toBe(b);
    expect(a).toContain('create_store');
    expect(a).not.toContain('## Tool parameter reference');
  });

  it('filters tools for create_store domain', () => {
    const prompt = getCachedSystemPrompt('en', false, 'create_store');
    expect(prompt).toContain('create_store');
    expect(prompt).not.toMatch(/\d+\. launch_campaign\b/);
  });

  it('truncateTurnContent respects max length', () => {
    expect(truncateTurnContent('abcdefghij', 5)).toBe('abcde…');
  });
});
