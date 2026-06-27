import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getCachedAdminData, clearAdminCacheForTests } from '../adminCache.js';

describe('adminCache', () => {
  beforeEach(() => {
    clearAdminCacheForTests();
    vi.useFakeTimers();
  });

  it('returns cached data within TTL without re-fetching', async () => {
    const fetcher = vi.fn(async () => ({ value: 1 }));
    const first = await getCachedAdminData('test:key', fetcher, 30_000);
    const second = await getCachedAdminData('test:key', fetcher, 30_000);

    expect(first).toEqual({ value: 1 });
    expect(second).toEqual({ value: 1 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('re-fetches after TTL expires', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce({ value: 1 })
      .mockResolvedValueOnce({ value: 2 });

    await getCachedAdminData('test:key', fetcher, 1000);
    vi.advanceTimersByTime(1500);
    const second = await getCachedAdminData('test:key', fetcher, 1000);

    expect(second).toEqual({ value: 2 });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
