/**
 * DeepSeek adapter smoke tests (vitest).
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../lib/llm/deepseekAdapter.js', () => ({
  default: {
    reason: vi.fn(async () => ({
      ok: true,
      confidence: 0.82,
      source: 'deepseek',
    })),
  },
}));

import deepseekAdapter from '../../lib/llm/deepseekAdapter.js';

const mockContext = { query: 'test' };
const mockMemory = {};

describe('DeepSeek Adapter', () => {
  it('returns reasoning with confidence', async () => {
    const result = await deepseekAdapter.reason(mockContext, mockMemory);
    expect(result.ok).toBe(true);
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.source).toBe('deepseek');
  });
});
