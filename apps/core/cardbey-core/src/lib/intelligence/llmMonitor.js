/**
 * LLM quality monitor — runtime JS entry (mirrors llmMonitor.ts).
 */

/** @typedef {'pil'|'briefing'|'smart_object'|'discover'} LlmExpressSurface */
/** @typedef {'disabled'|'rate_limited'|'timeout'|'invalid_json'|'validation_failed'|'diagnostic_language'|'http_error'|'unknown'} LlmFailureReason */

const MAX_EVENTS = 5000;
const MAX_LATENCIES_PER_BUCKET = 500;

const events = [];
const buckets = new Map();

function hourKey(ts = Date.now()) {
  const d = new Date(ts);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}T${String(d.getUTCHours()).padStart(2, '0')}`;
}

function getBucket(surface, ts) {
  const key = `${surface}:${hourKey(ts)}`;
  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = {
      hourKey: key,
      total: 0,
      fallback: 0,
      success: 0,
      failureReasons: {},
      latencies: [],
    };
    buckets.set(key, bucket);
  }
  return bucket;
}

function percentile(sorted, p) {
  if (sorted.length === 0) return null;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, idx))];
}

export function latencyPercentiles(latencies) {
  const sorted = [...latencies].sort((a, b) => a - b);
  return {
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
  };
}

/**
 * @param {{ surface: LlmExpressSurface, outcome: 'llm_success'|'fallback', failureReason?: LlmFailureReason, validationErrors?: string[], latencyMs: number, timestamp: number }} event
 */
export function recordLlmExpressEvent(event) {
  events.push(event);
  if (events.length > MAX_EVENTS) {
    events.splice(0, events.length - MAX_EVENTS);
  }

  const bucket = getBucket(event.surface, event.timestamp);
  bucket.total += 1;
  if (event.outcome === 'fallback') {
    bucket.fallback += 1;
    const reason = event.failureReason ?? 'unknown';
    bucket.failureReasons[reason] = (bucket.failureReasons[reason] ?? 0) + 1;
  } else {
    bucket.success += 1;
  }

  bucket.latencies.push(event.latencyMs);
  if (bucket.latencies.length > MAX_LATENCIES_PER_BUCKET) {
    bucket.latencies.splice(0, bucket.latencies.length - MAX_LATENCIES_PER_BUCKET);
  }
}

export function getLlmMetricsSnapshot() {
  const surfaceMetrics = [];

  for (const [, bucket] of buckets) {
    const surface = bucket.hourKey.split(':')[0];
    const fallbackRate = bucket.total > 0 ? bucket.fallback / bucket.total : 0;
    surfaceMetrics.push({
      surface,
      hourKey: bucket.hourKey,
      total: bucket.total,
      fallbackRate: Number(fallbackRate.toFixed(4)),
      successRate: Number((1 - fallbackRate).toFixed(4)),
      failureReasons: { ...bucket.failureReasons },
      latency: latencyPercentiles(bucket.latencies),
    });
  }

  surfaceMetrics.sort((a, b) => b.hourKey.localeCompare(a.hourKey));

  return {
    generatedAt: new Date().toISOString(),
    surfaces: surfaceMetrics.slice(0, 48),
    recentEvents: events.slice(-50),
  };
}

export function resetLlmMetrics() {
  events.length = 0;
  buckets.clear();
}
