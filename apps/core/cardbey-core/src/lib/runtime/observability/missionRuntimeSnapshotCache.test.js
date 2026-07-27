import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getCachedSnapshot,
  setCachedSnapshot,
  recordStreamEvent,
  getReplaySince,
  getSnapshotCacheStats,
  resetSnapshotCacheForTests,
} from './missionRuntimeSnapshotCache.js';

describe('missionRuntimeSnapshotCache', () => {
  const prev = process.env.PERFORMER_RUNTIME_SNAPSHOT_CACHE;

  beforeEach(() => {
    process.env.PERFORMER_RUNTIME_SNAPSHOT_CACHE = 'true';
    resetSnapshotCacheForTests();
  });

  afterEach(() => {
    resetSnapshotCacheForTests();
    if (prev === undefined) delete process.env.PERFORMER_RUNTIME_SNAPSHOT_CACHE;
    else process.env.PERFORMER_RUNTIME_SNAPSHOT_CACHE = prev;
  });

  it('is a no-op when flag is off', () => {
    process.env.PERFORMER_RUNTIME_SNAPSHOT_CACHE = 'false';
    setCachedSnapshot('m1', { latestSeq: 5 });
    expect(getCachedSnapshot('m1')).toBeNull();
  });

  it('stores and returns a fresh snapshot', () => {
    setCachedSnapshot('m1', { latestSeq: 5, missionId: 'm1' });
    const got = getCachedSnapshot('m1');
    expect(got?.latestSeq).toBe(5);
  });

  it('invalidates snapshot when a stream event arrives (stream-first)', () => {
    setCachedSnapshot('m1', { latestSeq: 5 });
    recordStreamEvent('m1', { seq: 6, eventType: 'agent_completed', payload: {} });
    // builtAt reset → treated as stale → cache miss on next read
    expect(getCachedSnapshot('m1')).toBeNull();
  });

  it('buffers bounded replay events and serves them after a seq cursor', () => {
    for (let i = 1; i <= 5; i += 1) {
      recordStreamEvent('m1', { seq: i, eventType: 'runtime.execution', payload: { i } });
    }
    const replay = getReplaySince('m1', 2);
    expect(replay.replayAvailable).toBe(true);
    expect(replay.events.map((e) => e.seq)).toEqual([3, 4, 5]);
    expect(replay.lastSeq).toBe(5);
  });

  it('reports cache stats', () => {
    recordStreamEvent('m1', { seq: 1, eventType: 'x' });
    const stats = getSnapshotCacheStats();
    expect(stats.trackedMissions).toBeGreaterThanOrEqual(1);
    expect(stats.totalReplayBuffered).toBeGreaterThanOrEqual(1);
  });
});
