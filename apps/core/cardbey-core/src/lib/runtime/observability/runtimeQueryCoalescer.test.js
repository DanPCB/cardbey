import { describe, it, expect, beforeEach } from 'vitest';
import { coalesce, getInFlightCount, resetCoalescerForTests } from './runtimeQueryCoalescer.js';
import {
  getRuntimeObservabilityMetricsSnapshot,
  resetRuntimeObservabilityMetricsForTests,
} from './runtimeObservabilityMetrics.js';

describe('runtimeQueryCoalescer', () => {
  beforeEach(() => {
    resetCoalescerForTests();
    resetRuntimeObservabilityMetricsForTests();
  });

  it('coalesces concurrent identical reads into one producer call', async () => {
    let calls = 0;
    const producer = () =>
      new Promise((resolve) => {
        calls += 1;
        setTimeout(() => resolve('done'), 20);
      });

    const [a, b, c] = await Promise.all([
      coalesce('key:1', producer),
      coalesce('key:1', producer),
      coalesce('key:1', producer),
    ]);

    expect(a).toBe('done');
    expect(b).toBe('done');
    expect(c).toBe('done');
    expect(calls).toBe(1);

    const metrics = getRuntimeObservabilityMetricsSnapshot();
    expect(metrics.coalescedQueries).toBe(2);
    expect(metrics.avoidedDbReads).toBe(2);
  });

  it('clears in-flight entry after settle so later reads re-run', async () => {
    await coalesce('key:2', () => Promise.resolve(1));
    expect(getInFlightCount()).toBe(0);
    let calls = 0;
    await coalesce('key:2', () => {
      calls += 1;
      return Promise.resolve(2);
    });
    expect(calls).toBe(1);
  });
});
