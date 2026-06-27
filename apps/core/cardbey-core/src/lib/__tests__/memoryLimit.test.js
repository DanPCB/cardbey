import { describe, it, expect } from 'vitest';
import v8 from 'v8';
import { getHeapLimitMb, parseConfiguredHeapLimitMb } from '../memoryLimit.js';
import { verifyMemoryLimit } from '../memoryVerification.js';

describe('memoryLimit', () => {
  it('reads heap_size_limit from V8', () => {
    const expected = Math.round(v8.getHeapStatistics().heap_size_limit / 1024 / 1024);
    expect(getHeapLimitMb()).toBe(expected);
  });

  it('verifyMemoryLimit passes when actual limit is near configured', () => {
    const configured = parseConfiguredHeapLimitMb();
    const actual = getHeapLimitMb();
    const ok = verifyMemoryLimit(configured);
    if (actual >= configured * 0.5) {
      expect(ok).toBe(true);
    }
  });
});
