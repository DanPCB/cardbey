import { describe, expect, it } from 'vitest';
import { normalizeAnthropicModelId, resolveAnthropicModel } from './anthropicModelConfig.js';

describe('anthropicModelConfig', () => {
  it('strips double claude- prefix from misconfigured env', () => {
    expect(normalizeAnthropicModelId('claude-claude-sonnet-4-6-20250514')).toBe('claude-sonnet-4-6');
  });

  it('maps legacy dated sonnet ids to claude-sonnet-4-6', () => {
    expect(normalizeAnthropicModelId('claude-sonnet-4-6-20250514')).toBe('claude-sonnet-4-6');
    expect(normalizeAnthropicModelId('claude-sonnet-4-20250514')).toBe('claude-sonnet-4-6');
  });

  it('passes valid ids verbatim', () => {
    expect(normalizeAnthropicModelId('claude-opus-4-6')).toBe('claude-opus-4-6');
  });

  it('resolveAnthropicModel normalizes explicit override', () => {
    expect(resolveAnthropicModel('claude-claude-sonnet-4-6-20250514')).toBe('claude-sonnet-4-6');
  });

  it('maps fast/thinking tier aliases to real model ids', () => {
    expect(resolveAnthropicModel('fast')).toBe('claude-sonnet-4-6');
    expect(resolveAnthropicModel('thinking')).toBe('claude-sonnet-4-6');
    expect(resolveAnthropicModel('fast')).not.toBe('fast');
  });
});
