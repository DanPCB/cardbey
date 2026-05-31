/**
 * Phase 2.3-C — in-memory mission RuntimeSnapshot cache + bounded replay buffer.
 *
 * - mission-scoped
 * - bounded memory (LRU-ish by entry cap + TTL)
 * - reconnect-safe replay (recent events only, no full history)
 * - in-memory only (no Redis)
 * - read-only: never mutates runtime
 */

import { isPerformerRuntimeSnapshotCacheEnabled } from '../../broker/brokerFlags.js';
import {
  recordSnapshotCacheHit,
  recordSnapshotCacheMiss,
  recordReplayServed,
} from './runtimeObservabilityMetrics.js';

const SNAPSHOT_TTL_MS = 15_000;
const MAX_MISSIONS = 200;
const REPLAY_BUFFER_MAX = 100;
const CLEANUP_INTERVAL_MS = 30_000;

/**
 * @typedef {Object} CacheEntry
 * @property {any} snapshot
 * @property {number} builtAt
 * @property {number} touchedAt
 * @property {Array<{ seq: number|null, eventType: string, payload?: any, at: number }>} replay
 * @property {number} lastSeq
 */

/** @type {Map<string, CacheEntry>} */
const cache = new Map();

let cleanupTimer = null;

function ensureCleanup() {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [missionId, entry] of cache) {
      if (now - entry.touchedAt > SNAPSHOT_TTL_MS * 4) {
        cache.delete(missionId);
      }
    }
  }, CLEANUP_INTERVAL_MS);
  if (typeof cleanupTimer.unref === 'function') cleanupTimer.unref();
}

function evictIfNeeded() {
  if (cache.size <= MAX_MISSIONS) return;
  // Evict oldest-touched entries until under cap.
  const entries = [...cache.entries()].sort((a, b) => a[1].touchedAt - b[1].touchedAt);
  const toEvict = cache.size - MAX_MISSIONS;
  for (let i = 0; i < toEvict; i += 1) {
    cache.delete(entries[i][0]);
  }
}

function getEntry(missionId) {
  const mid = typeof missionId === 'string' ? missionId.trim() : '';
  if (!mid) return null;
  return cache.get(mid) ?? null;
}

/**
 * Return a fresh (non-expired) cached snapshot, or null on miss/expiry.
 * Counts hit/miss metrics. Returns null when cache disabled.
 */
export function getCachedSnapshot(missionId) {
  if (!isPerformerRuntimeSnapshotCacheEnabled()) return null;
  const entry = getEntry(missionId);
  if (!entry) {
    recordSnapshotCacheMiss();
    return null;
  }
  const fresh = Date.now() - entry.builtAt <= SNAPSHOT_TTL_MS;
  entry.touchedAt = Date.now();
  if (fresh && entry.snapshot) {
    recordSnapshotCacheHit();
    return entry.snapshot;
  }
  recordSnapshotCacheMiss();
  return null;
}

/**
 * Store a freshly built snapshot. No-op when cache disabled.
 */
export function setCachedSnapshot(missionId, snapshot) {
  if (!isPerformerRuntimeSnapshotCacheEnabled()) return;
  const mid = typeof missionId === 'string' ? missionId.trim() : '';
  if (!mid || !snapshot) return;
  ensureCleanup();
  const existing = cache.get(mid);
  const now = Date.now();
  if (existing) {
    existing.snapshot = snapshot;
    existing.builtAt = now;
    existing.touchedAt = now;
  } else {
    cache.set(mid, {
      snapshot,
      builtAt: now,
      touchedAt: now,
      replay: [],
      lastSeq: typeof snapshot?.latestSeq === 'number' ? snapshot.latestSeq : 0,
    });
  }
  evictIfNeeded();
}

/**
 * Append a streamed event to the mission replay buffer and invalidate the snapshot
 * (stream-first: next read rebuilds incrementally). No-op when cache disabled.
 */
export function recordStreamEvent(missionId, event) {
  if (!isPerformerRuntimeSnapshotCacheEnabled()) return;
  const mid = typeof missionId === 'string' ? missionId.trim() : '';
  if (!mid || !event) return;
  ensureCleanup();
  let entry = cache.get(mid);
  if (!entry) {
    entry = { snapshot: null, builtAt: 0, touchedAt: Date.now(), replay: [], lastSeq: 0 };
    cache.set(mid, entry);
  }
  const seq = typeof event.seq === 'number' ? event.seq : null;
  entry.replay.push({
    seq,
    eventType: typeof event.eventType === 'string' ? event.eventType : 'unknown',
    payload: event.payload ?? null,
    at: Date.now(),
  });
  if (entry.replay.length > REPLAY_BUFFER_MAX) {
    entry.replay.splice(0, entry.replay.length - REPLAY_BUFFER_MAX);
  }
  if (seq != null && seq > entry.lastSeq) entry.lastSeq = seq;
  // Invalidate snapshot so the next read reflects the new event (cheap; rebuild is bounded).
  entry.builtAt = 0;
  entry.touchedAt = Date.now();
  evictIfNeeded();
}

/**
 * Replay recent events after a given seq (reconnect-safe; bounded).
 * @returns {{ events: Array, lastSeq: number, replayAvailable: boolean }}
 */
export function getReplaySince(missionId, afterSeq = 0) {
  const entry = getEntry(missionId);
  if (!entry) {
    recordReplayServed(0);
    return { events: [], lastSeq: 0, replayAvailable: false };
  }
  const cursor = typeof afterSeq === 'number' && afterSeq >= 0 ? afterSeq : 0;
  const events = entry.replay.filter((e) => e.seq == null || e.seq > cursor);
  recordReplayServed(events.length);
  return { events, lastSeq: entry.lastSeq, replayAvailable: true };
}

export function getSnapshotCacheStats() {
  let totalReplay = 0;
  for (const e of cache.values()) totalReplay += e.replay.length;
  return {
    trackedMissions: cache.size,
    totalReplayBuffered: totalReplay,
    ttlMs: SNAPSHOT_TTL_MS,
    maxMissions: MAX_MISSIONS,
    replayBufferMax: REPLAY_BUFFER_MAX,
  };
}

export function resetSnapshotCacheForTests() {
  cache.clear();
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
}
