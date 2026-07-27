import { describe, it, expect, beforeEach } from 'vitest';
import {
  getMemoryCacheKey,
  getCachedMemory,
  setCachedMemory,
  invalidateMemoryCache,
  invalidateMemoryByPattern,
  clearMemoryCacheForTests,
} from './memoryCache.js';

describe('memoryCache', () => {
  beforeEach(() => {
    clearMemoryCacheForTests();
  });

  it('stores and retrieves cached bundles by context key', () => {
    const context = {
      actor: { type: 'store_owner', id: 'user-1' },
      storeId: 'store-1',
      sessionId: 'sess-1',
      missionId: null,
    };

    const bundle = { ok: true, meta: { fetchedAt: '2026-01-01T00:00:00.000Z' } };
    setCachedMemory(context, bundle);

    expect(getCachedMemory(context)).toEqual(bundle);
    expect(getMemoryCacheKey(context)).toContain('user-1');
  });

  it('invalidates by pattern', () => {
    const ctxA = {
      actor: { type: 'store_owner', id: 'user-a' },
      storeId: 'store-x',
      sessionId: 's1',
      missionId: null,
    };
    const ctxB = {
      actor: { type: 'store_owner', id: 'user-b' },
      storeId: 'store-y',
      sessionId: 's2',
      missionId: null,
    };

    setCachedMemory(ctxA, { ok: true });
    setCachedMemory(ctxB, { ok: true });

    invalidateMemoryByPattern(':store-x:');
    expect(getCachedMemory(ctxA)).toBeUndefined();
    expect(getCachedMemory(ctxB)).toBeDefined();
  });

  it('invalidates exact context key', () => {
    const context = {
      actor: { type: 'guest', id: null },
      storeId: null,
      sessionId: null,
      missionId: null,
    };
    setCachedMemory(context, { ok: true });
    invalidateMemoryCache(context);
    expect(getCachedMemory(context)).toBeUndefined();
  });
});
