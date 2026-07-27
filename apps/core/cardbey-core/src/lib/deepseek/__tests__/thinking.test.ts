import { describe, it, expect } from 'vitest';
import { extractThinkingTokens, extractThinkingFromGateway } from '../thinking.js';

describe('thinking extraction', () => {
  it('extracts thinking from DeepSeek-style response', () => {
    const result = extractThinkingTokens({
      choices: [
        {
          message: {
            thinking: 'Let me analyze the campaign metrics first.',
            content: 'Your campaign performed well last week.',
          },
        },
      ],
      usage: { reasoning_tokens: 42 },
    });

    expect(result.thinking).toContain('analyze');
    expect(result.content).toContain('performed well');
    expect(result.reasoningTokens).toBe(42);
  });

  it('extracts thinking from gateway response', () => {
    const result = extractThinkingFromGateway({
      thinkingText: 'Planning next steps...',
      content: 'Here is the summary.',
    });
    expect(result.thinking).toBe('Planning next steps...');
    expect(result.content).toBe('Here is the summary.');
  });
});
