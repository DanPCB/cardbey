import { describe, expect, it, vi } from 'vitest';
import { executeWithConcurrency } from '../executeWithConcurrency.js';

describe('executeWithConcurrency', () => {
  it('runs items in concurrency-sized chunks with Promise.all per chunk', async () => {
    const active = new Set();
    let maxConcurrent = 0;

    await executeWithConcurrency(
      [1, 2, 3, 4, 5],
      { concurrency: 2, delayMs: 0 },
      async (n) => {
        active.add(n);
        maxConcurrent = Math.max(maxConcurrent, active.size);
        await Promise.resolve();
        active.delete(n);
      },
    );

    expect(maxConcurrent).toBeLessThanOrEqual(2);
  });

  it('delays between chunks but not after the last chunk', async () => {
    const sleepSpy = vi.spyOn(globalThis, 'setTimeout');
    const started = [];

    await executeWithConcurrency(
      ['a', 'b', 'c'],
      { concurrency: 1, delayMs: 25 },
      async (item) => {
        started.push(item);
      },
    );

    expect(started).toEqual(['a', 'b', 'c']);
    // Two inter-chunk delays (a→b, b→c); none after c.
    const delayCalls = sleepSpy.mock.calls.filter((args) => args[1] === 25);
    expect(delayCalls).toHaveLength(2);
    sleepSpy.mockRestore();
  });

  it('treats empty list as no-op', async () => {
    const worker = vi.fn();
    await executeWithConcurrency([], { concurrency: 3, delayMs: 500 }, worker);
    expect(worker).not.toHaveBeenCalled();
  });
});
