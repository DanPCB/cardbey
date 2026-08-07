import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  deprecatedOpenAIChatCompletion,
  resetDirectOpenAICallWarnings,
  warnDirectOpenAICall,
} from '../directOpenAICall.js';

describe('directOpenAICall deprecation shim', () => {
  beforeEach(() => {
    resetDirectOpenAICallWarnings();
    vi.restoreAllMocks();
  });

  it('warns once per caller', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    warnDirectOpenAICall('testCaller');
    warnDirectOpenAICall('testCaller');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(/DEPRECATED.*testCaller/);
  });

  it('delegates to openai.chat.completions.create', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const create = vi.fn(async () => ({ choices: [{ message: { content: 'hi' } }] }));
    const client = { chat: { completions: { create } } };
    const result = await deprecatedOpenAIChatCompletion(
      client,
      { model: 'gpt-4o-mini', messages: [] },
      'unit-test',
    );
    expect(create).toHaveBeenCalledOnce();
    expect(result.choices[0].message.content).toBe('hi');
  });
});
