/**
 * Phase 2.3-C — stream-first runtime observability metrics (in-process, read-only counters).
 * No DB scans, no execution authority. Proves polling/read-pressure reduction.
 */

const metrics = {
  snapshotCacheHits: 0,
  snapshotCacheMisses: 0,
  snapshotBuilds: 0,
  snapshotBuildLatencyMsTotal: 0,
  coalescedQueries: 0,
  avoidedDbReads: 0,
  replayServedEvents: 0,
  replayRequests: 0,
  sseHealthyChecks: 0,
  sseUnhealthyChecks: 0,
  pollFallbackActivations: 0,
  streamPrimaryActivations: 0,
  recoveryModeActivations: 0,
};

let sseHealthyMsAccumulated = 0;
let lastSseHealthySampleAt = 0;

export function recordSnapshotCacheHit() {
  metrics.snapshotCacheHits += 1;
}

export function recordSnapshotCacheMiss() {
  metrics.snapshotCacheMisses += 1;
}

export function recordSnapshotBuild({ latencyMs } = {}) {
  metrics.snapshotBuilds += 1;
  if (typeof latencyMs === 'number' && Number.isFinite(latencyMs)) {
    metrics.snapshotBuildLatencyMsTotal += latencyMs;
  }
}

export function recordCoalescedQuery(avoidedDbReads = 1) {
  metrics.coalescedQueries += 1;
  const n = Number.isFinite(avoidedDbReads) && avoidedDbReads > 0 ? avoidedDbReads : 1;
  metrics.avoidedDbReads += n;
}

export function recordReplayServed(eventCount = 0) {
  metrics.replayRequests += 1;
  const n = Number.isFinite(eventCount) && eventCount > 0 ? eventCount : 0;
  metrics.replayServedEvents += n;
}

export function recordSseHealth(healthy) {
  const now = Date.now();
  if (healthy) {
    metrics.sseHealthyChecks += 1;
    if (lastSseHealthySampleAt > 0) {
      sseHealthyMsAccumulated += now - lastSseHealthySampleAt;
    }
    lastSseHealthySampleAt = now;
  } else {
    metrics.sseUnhealthyChecks += 1;
    lastSseHealthySampleAt = 0;
  }
}

export function recordPollingMode(mode) {
  if (mode === 'STREAM_PRIMARY') metrics.streamPrimaryActivations += 1;
  else if (mode === 'POLL_FALLBACK') metrics.pollFallbackActivations += 1;
  else if (mode === 'RECOVERY_MODE') metrics.recoveryModeActivations += 1;
}

export function getRuntimeObservabilityMetricsSnapshot() {
  const totalSnapshotRequests = metrics.snapshotCacheHits + metrics.snapshotCacheMisses;
  const cacheHitRate =
    totalSnapshotRequests > 0 ? Number((metrics.snapshotCacheHits / totalSnapshotRequests).toFixed(3)) : null;
  const avgSnapshotBuildLatencyMs =
    metrics.snapshotBuilds > 0 ? Math.round(metrics.snapshotBuildLatencyMsTotal / metrics.snapshotBuilds) : null;
  const totalSseChecks = metrics.sseHealthyChecks + metrics.sseUnhealthyChecks;
  const sseHealthyRate =
    totalSseChecks > 0 ? Number((metrics.sseHealthyChecks / totalSseChecks).toFixed(3)) : null;
  // pollingReductionRate: fraction of snapshot requests that avoided a fresh DB rebuild.
  const pollingReductionRate =
    totalSnapshotRequests > 0 ? Number((metrics.snapshotCacheHits / totalSnapshotRequests).toFixed(3)) : null;

  return {
    ...metrics,
    cacheHitRate,
    avgSnapshotBuildLatencyMs,
    sseHealthyRate,
    sseHealthyMsAccumulated,
    pollingReductionRate,
  };
}

export function resetRuntimeObservabilityMetricsForTests() {
  for (const k of Object.keys(metrics)) {
    metrics[k] = 0;
  }
  sseHealthyMsAccumulated = 0;
  lastSseHealthySampleAt = 0;
}
