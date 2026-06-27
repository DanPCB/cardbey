/**
 * @vitest-environment node
 */

import { describe, expect, it } from 'vitest';
import { buildChatMessages, capChatMessages } from '../llmMessageBuilder.ts';

describe('llmMessageBuilder', () => {
  it('builds messages from legacy prompt + system', () => {
    const messages = buildChatMessages({
      system: 'You are Performer.',
      prompt: 'Hello',
    });

    expect(messages).toEqual([
      { role: 'system', content: 'You are Performer.' },
      { role: 'user', content: 'Hello' },
    ]);
  });

  it('preserves multi-message chat roles', () => {
    const messages = buildChatMessages({
      messages: [
        { role: 'user', content: 'Hi' },
        { role: 'assistant', content: 'Hello!' },
        { role: 'user', content: 'Create a store.' },
      ],
    });

    expect(messages).toHaveLength(3);
    expect(messages[2].content).toBe('Create a store.');
  });

  it('appends tool results as tool role messages', () => {
    const messages = buildChatMessages({
      messages: [{ role: 'user', content: 'List stores' }],
      tool_results: [{ tool_call_id: 'call_1', result: { stores: [] } }],
    });

    expect(messages.at(-1)).toMatchObject({
      role: 'tool',
      tool_call_id: 'call_1',
    });
  });

  it('caps messages while preserving system', () => {
    const messages = capChatMessages(
      [
        { role: 'system', content: 'sys' },
        { role: 'user', content: '1' },
        { role: 'assistant', content: '2' },
        { role: 'user', content: '3' },
      ],
      3,
    );

    expect(messages[0].role).toBe('system');
    expect(messages).toHaveLength(3);
    expect(messages.at(-1)?.content).toBe('3');
  });
});
