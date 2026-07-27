import { describe, it, expect, beforeEach } from 'vitest';
import { checkReasoningLogReadRate, resetReasoningLogRateLimitForTests } from './reasoningLogRateLimit.js';

describe('checkReasoningLogReadRate', () => {
  beforeEach(() => {
    resetReasoningLogRateLimitForTests();
  });

  it('allows first reads in window', () => {
    expect(checkReasoningLogReadRate('m1').allowed).toBe(true);
    expect(checkReasoningLogReadRate('m1').allowed).toBe(true);
  });

  it('rate limits burst polling', () => {
    for (let i = 0; i < 4; i += 1) {
      expect(checkReasoningLogReadRate('m-burst').allowed).toBe(true);
    }
    const blocked = checkReasoningLogReadRate('m-burst');
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
  });
});
