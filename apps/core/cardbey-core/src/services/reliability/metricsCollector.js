/**
 * In-process API latency metrics for SLO monitoring and alerting.
 */

const MAX_SAMPLES = 500;

export class MetricsCollector {
  constructor() {
    /** @type {Array<{ name: string; value: number; tags: Record<string, string>; timestamp: number }>} */
    this.samples = [];
    /** @type {Map<string, { count: number; total: number; max: number }>} */
    this.aggregates = new Map();
  }

  /**
   * @param {string} name
   * @param {number} value
   * @param {Record<string, string>} [tags]
   */
  recordMetric(name, value, tags = {}) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return;

    const timestamp = Date.now();
    this.samples.push({ name, value: numeric, tags, timestamp });
    if (this.samples.length > MAX_SAMPLES) {
      this.samples.shift();
    }

    const tagKey = Object.entries(tags)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join(',');
    const aggregateKey = tagKey ? `${name}|${tagKey}` : name;
    const current = this.aggregates.get(aggregateKey) ?? { count: 0, total: 0, max: 0 };
    current.count += 1;
    current.total += numeric;
    current.max = Math.max(current.max, numeric);
    this.aggregates.set(aggregateKey, current);
  }

  getRecentMetrics(name, limit = 50) {
    return this.samples.filter((sample) => sample.name === name).slice(-limit);
  }

  getAggregates() {
    const rows = [];
    for (const [key, stats] of this.aggregates.entries()) {
      rows.push({
        key,
        count: stats.count,
        avg: stats.count > 0 ? Math.round(stats.total / stats.count) : 0,
        max: stats.max,
      });
    }
    return rows.sort((a, b) => b.max - a.max);
  }

  /**
   * @param {string} metricName
   * @param {number} percentile 0–1 (e.g. 0.95)
   * @param {{ maxAgeMs?: number; tagEquals?: Record<string, string> }} [opts]
   */
  getPercentile(metricName, percentile, opts = {}) {
    const maxAgeMs = opts.maxAgeMs ?? 24 * 60 * 60 * 1000;
    const cutoff = Date.now() - maxAgeMs;
    const tagEquals = opts.tagEquals ?? { sloEligible: 'true' };

    const values = this.samples
      .filter((sample) => {
        if (sample.name !== metricName || sample.timestamp < cutoff) return false;
        for (const [key, expected] of Object.entries(tagEquals)) {
          if (String(sample.tags?.[key] ?? '') !== String(expected)) return false;
        }
        return true;
      })
      .map((sample) => sample.value)
      .filter((value) => Number.isFinite(value) && value > 0)
      .sort((a, b) => a - b);

    if (values.length === 0) {
      return { value: 0, sampleCount: 0 };
    }

    const index = Math.min(values.length - 1, Math.floor(values.length * percentile));
    return { value: values[index] ?? 0, sampleCount: values.length };
  }

  resetForTests() {
    this.samples = [];
    this.aggregates.clear();
  }
}

const metricsCollector = new MetricsCollector();
export default metricsCollector;
