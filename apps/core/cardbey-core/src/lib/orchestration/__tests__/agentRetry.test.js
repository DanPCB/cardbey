/**
 * @vitest-environment node
 */
import { describe, expect, it, vi } from 'vitest';
import { withAgentRetry, isRateLimitError } from '../agentRetry.js';

describe('withAgentRetry (Phase 5)', () => {
  it('retries on 429 up to success', async () => {
    let attempts = 0;
    const fn = vi.fn(async () => {
      attempts += 1;
      if (attempts < 3) {
        throw Object.assign(new Error('rate limit'), { status: 429 });
      }
      return { content: 'success' };
    });

    const result = await withAgentRetry(fn, {
      maxAttempts: 4,
      delaysMs: [1, 1, 1, 1],
    });
    expect(result.content).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('does not retry on non-429 errors', async () => {
    const fn = vi.fn(async () => {
      throw new Error('invalid_request');
    });
    await expect(withAgentRetry(fn, { delaysMs: [1] })).rejects.toThrow('invalid_request');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('throws after maxAttempts exhausted', async () => {
    const fn = vi.fn(async () => {
      throw Object.assign(new Error('rate limit'), { status: 429 });
    });
    await expect(withAgentRetry(fn, { maxAttempts: 3, delaysMs: [1, 1, 1] })).rejects.toThrow(
      /All 3 attempts failed/,
    );
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('isRateLimitError detects message patterns', () => {
    expect(isRateLimitError({ status: 429 })).toBe(true);
    expect(isRateLimitError({ message: 'rate_limit_exceeded' })).toBe(true);
    expect(isRateLimitError({ message: 'invalid_request' })).toBe(false);
  });
});
