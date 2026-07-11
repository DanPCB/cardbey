/**
 * @vitest-environment node
 */
import { describe, expect, it, beforeEach } from 'vitest';
import {
  checkStreamTokenRateLimit,
  cleanupStreamTokenRateLimitBuckets,
  resetStreamTokenRateLimitForTests,
  getStreamTokenRateLimitConfig,
} from '../streamTokenRateLimit.js';

describe('streamTokenRateLimit', () => {
  beforeEach(() => {
    resetStreamTokenRateLimitForTests();
  });

  it('allows up to max requests per window', () => {
    const { maxPerMission } = getStreamTokenRateLimitConfig();
    const mid = 'mission-1';
    for (let i = 0; i < maxPerMission; i += 1) {
      expect(checkStreamTokenRateLimit(mid)).toBe(true);
    }
    expect(checkStreamTokenRateLimit(mid)).toBe(false);
  });

  it('cleans up stale buckets', () => {
    checkStreamTokenRateLimit('old-mission');
    const removed = cleanupStreamTokenRateLimitBuckets(-1);
    expect(removed).toBeGreaterThanOrEqual(1);
    expect(checkStreamTokenRateLimit('old-mission')).toBe(true);
  });
});
