/**
 * LLM quality monitor — in-process metrics for Intelligence Foundation expression layer.
 */

export type LlmFailureReason =
  | 'disabled'
  | 'rate_limited'
  | 'timeout'
  | 'invalid_json'
  | 'validation_failed'
  | 'diagnostic_language'
  | 'http_error'
  | 'unknown';

export type LlmExpressSurface = 'pil' | 'briefing' | 'smart_object' | 'discover';

export type LlmExpressEvent = {
  surface: LlmExpressSurface;
  outcome: 'llm_success' | 'fallback';
  failureReason?: LlmFailureReason;
  validationErrors?: string[];
  latencyMs: number;
  timestamp: number;
};

type HourBucket = {
  hourKey: string;
  total: number;
  fallback: number;
  success: number;
  failureReasons: Record<string, number>;
  latencies: number[];
};

const MAX_EVENTS = 5000;
const MAX_LATENCIES_PER_BUCKET = 500;

const events: LlmExpressEvent[] = [];
const buckets = new Map<string, HourBucket>();

function hourKey(ts = Date.now()): string {
  const d = new Date(ts);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}T${String(d.getUTCHours()).padStart(2, '0')}`;
}

function getBucket(surface: LlmExpressSurface, ts: number): HourBucket {
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

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, idx))];
}

/**
 * Record a single express LLM attempt.
 */
export function recordLlmExpressEvent(event: LlmExpressEvent): void {
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

/**
 * Build latency percentiles for a bucket.
 */
export function latencyPercentiles(latencies: number[]): {
  p50: number | null;
  p95: number | null;
  p99: number | null;
} {
  const sorted = [...latencies].sort((a, b) => a - b);
  return {
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
  };
}

export type SurfaceHourMetrics = {
  surface: LlmExpressSurface;
  hourKey: string;
  total: number;
  fallbackRate: number;
  successRate: number;
  failureReasons: Record<string, number>;
  latency: { p50: number | null; p95: number | null; p99: number | null };
};

/**
 * Snapshot metrics per surface per hour (last 24 buckets max).
 */
export function getLlmMetricsSnapshot(): {
  generatedAt: string;
  surfaces: SurfaceHourMetrics[];
  recentEvents: LlmExpressEvent[];
} {
  const surfaceMetrics: SurfaceHourMetrics[] = [];

  for (const [, bucket] of buckets) {
    const [surface] = bucket.hourKey.split(':') as [LlmExpressSurface, string];
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

/**
 * Reset metrics (tests / maintenance only).
 */
export function resetLlmMetrics(): void {
  events.length = 0;
  buckets.clear();
}
