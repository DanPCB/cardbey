/**
 * In-process Intelligence Foundation metrics (counters + rolling 1h window).
 * Single Render instance only — multi-instance deploys need external aggregation.
 */

export const WINDOW_MS = 60 * 60 * 1000;
const MAX_WINDOW_EVENTS = 20_000;
const MAX_LATENCY_SAMPLES = 2_000;

/** @type {Map<string, number>} */
const totals = new Map();

/** @type {Array<{ ts: number, key: string, ms?: number, error?: boolean }>} */
const windowEvents = [];

/** @type {Map<string, number[]>} latency buckets keyed by route metric name */
const latencyTotals = new Map();
/** @type {Map<string, Array<{ ts: number, ms: number, error?: boolean }>>} */
const latencyWindow = new Map();

function labelKey(name, labels = {}) {
  const parts = Object.keys(labels)
    .sort()
    .map((k) => `${k}=${String(labels[k])}`);
  return parts.length ? `${name}|${parts.join('|')}` : name;
}

function pruneWindow(now = Date.now()) {
  const cutoff = now - WINDOW_MS;
  while (windowEvents.length > 0 && windowEvents[0].ts < cutoff) {
    windowEvents.shift();
  }
  for (const [route, samples] of latencyWindow) {
    const kept = samples.filter((s) => s.ts >= cutoff);
    latencyWindow.set(route, kept);
  }
  if (windowEvents.length > MAX_WINDOW_EVENTS) {
    windowEvents.splice(0, windowEvents.length - MAX_WINDOW_EVENTS);
  }
}

function percentile(sorted, p) {
  if (sorted.length === 0) return null;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, idx))];
}

function latencyStats(routeKey, useWindow) {
  const samples = useWindow
    ? (latencyWindow.get(routeKey) ?? []).map((s) => s.ms)
    : (latencyTotals.get(routeKey) ?? []);
  const sorted = [...samples].sort((a, b) => a - b);
  const errors = useWindow
    ? (latencyWindow.get(routeKey) ?? []).filter((s) => s.error).length
    : 0;
  return {
    count: sorted.length,
    errors,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
  };
}

function parseLabelsFromKey(key, metricName) {
  const prefix = `${metricName}|`;
  if (!key.startsWith(prefix) && key !== metricName) return null;
  const tail = key === metricName ? '' : key.slice(prefix.length);
  if (!tail) return {};
  const labels = {};
  for (const part of tail.split('|')) {
    const idx = part.indexOf('=');
    if (idx > 0) labels[part.slice(0, idx)] = part.slice(idx + 1);
  }
  return labels;
}

function aggregateLabeled(metricName, labelName, filters = {}, useWindow = false) {
  const out = {};
  const bump = (labels, n = 1) => {
    const key = labels[labelName] ?? 'unknown';
    out[key] = (out[key] ?? 0) + n;
  };

  if (useWindow) {
    const cutoff = Date.now() - WINDOW_MS;
    for (const e of windowEvents) {
      if (e.ts < cutoff) continue;
      const labels = parseLabelsFromKey(e.key, metricName);
      if (!labels) continue;
      if (Object.entries(filters).some(([k, v]) => labels[k] !== v)) continue;
      bump(labels);
    }
    return out;
  }

  for (const [key, count] of totals.entries()) {
    const labels = parseLabelsFromKey(key, metricName);
    if (!labels) continue;
    if (Object.entries(filters).some(([k, v]) => labels[k] !== v)) continue;
    bump(labels, count);
  }
  return out;
}

function countMetric(metricName, useWindow = false) {
  if (useWindow) {
    const cutoff = Date.now() - WINDOW_MS;
    return windowEvents.filter((e) => e.ts >= cutoff && e.key.startsWith(`${metricName}|`)).length;
  }
  return [...totals.entries()]
    .filter(([k]) => k.startsWith(`${metricName}|`))
    .reduce((s, [, v]) => s + v, 0);
}

/**
 * @param {string} name
 * @param {Record<string, string>} [labels]
 * @param {{ ms?: number, error?: boolean, log?: Record<string, unknown> }} [options]
 */
export function record(name, labels = {}, options = {}) {
  try {
    const ts = Date.now();
    const key = labelKey(name, labels);
    totals.set(key, (totals.get(key) ?? 0) + 1);
    windowEvents.push({
      ts,
      key,
      ms: options.ms,
      error: options.error,
    });
    pruneWindow(ts);

    if (options.log) {
      console.log(JSON.stringify(options.log));
    }
  } catch {
    /* metrics must never affect request paths */
  }
}

/**
 * @param {'intelligence_express'|'intelligence_memory'} route
 * @param {number} ms
 * @param {{ error?: boolean }} [options]
 */
export function recordRouteLatency(route, ms, options = {}) {
  try {
    const ts = Date.now();
    const totalsArr = latencyTotals.get(route) ?? [];
    totalsArr.push(ms);
    if (totalsArr.length > MAX_LATENCY_SAMPLES) {
      totalsArr.splice(0, totalsArr.length - MAX_LATENCY_SAMPLES);
    }
    latencyTotals.set(route, totalsArr);

    const winArr = latencyWindow.get(route) ?? [];
    winArr.push({ ts, ms, error: Boolean(options.error) });
    if (winArr.length > MAX_LATENCY_SAMPLES) {
      winArr.splice(0, winArr.length - MAX_LATENCY_SAMPLES);
    }
    latencyWindow.set(route, winArr);
    pruneWindow(ts);
  } catch {
    /* fail-safe */
  }
}

export function logFoundationEvent(payload) {
  try {
    console.log(JSON.stringify(payload));
  } catch {
    /* fail-safe */
  }
}

export function snapshot() {
  try {
    pruneWindow();

    return {
      generatedAt: new Date().toISOString(),
      windowMs: WINDOW_MS,
      note: 'In-process counters; multi-instance Render needs external aggregation.',
      intelligence_express: {
        total: countMetric('intelligence_express_total', false),
        window: countMetric('intelligence_express_total', true),
        bySource: {
          totals: aggregateLabeled('intelligence_express_total', 'source', {}, false),
          window: aggregateLabeled('intelligence_express_total', 'source', {}, true),
        },
        byFallbackReason: {
          totals: aggregateLabeled('intelligence_express_total', 'reason', { source: 'fallback' }, false),
          window: aggregateLabeled('intelligence_express_total', 'reason', { source: 'fallback' }, true),
        },
        latencyMs: {
          totals: latencyStats('intelligence_express', false),
          window: latencyStats('intelligence_express', true),
        },
      },
      intelligence_memory: {
        total: countMetric('intelligence_memory_total', false),
        window: countMetric('intelligence_memory_total', true),
        byOutcome: {
          totals: aggregateLabeled('intelligence_memory_total', 'outcome', {}, false),
          window: aggregateLabeled('intelligence_memory_total', 'outcome', {}, true),
        },
        latencyMs: {
          totals: latencyStats('intelligence_memory', false),
          window: latencyStats('intelligence_memory', true),
        },
      },
      pil_concierge_interpret: {
        total: countMetric('pil_concierge_interpret_total', false),
        window: countMetric('pil_concierge_interpret_total', true),
        bySource: {
          totals: aggregateLabeled('pil_concierge_interpret_total', 'source', {}, false),
          window: aggregateLabeled('pil_concierge_interpret_total', 'source', {}, true),
        },
      },
      pil_event_ingest: {
        total: countMetric('pil_event_ingest_total', false),
        window: countMetric('pil_event_ingest_total', true),
        byEventType: {
          totals: aggregateLabeled('pil_event_ingest_total', 'eventType', {}, false),
          window: aggregateLabeled('pil_event_ingest_total', 'eventType', {}, true),
        },
      },
    };
  } catch {
    return {
      generatedAt: new Date().toISOString(),
      windowMs: WINDOW_MS,
      error: 'snapshot_failed',
    };
  }
}

/** @internal */
export function resetFoundationMetrics() {
  totals.clear();
  windowEvents.length = 0;
  latencyTotals.clear();
  latencyWindow.clear();
}

/** Map expressWithLlm internal failure reasons to go/no-go labels. */
export function mapExpressFallbackReason(failureReason) {
  if (failureReason === 'disabled') {
    if (process.env.INTELLIGENCE_LLM_EXPRESSION === 'false') return 'llm_disabled';
    if (!process.env.OPENAI_API_KEY?.trim()) return 'no_key';
    return 'llm_disabled';
  }
  if (failureReason === 'validation_failed' || failureReason === 'diagnostic_language') {
    return 'validation_failed';
  }
  return 'llm_error';
}
