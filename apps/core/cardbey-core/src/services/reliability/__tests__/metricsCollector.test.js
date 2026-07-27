import { describe, expect, it, beforeEach } from 'vitest';
import metricsCollector from '../metricsCollector.js';

describe('metricsCollector percentile', () => {
  beforeEach(() => {
    metricsCollector.resetForTests();
  });

  it('computes p95 for slo-eligible http latency samples', () => {
    const now = Date.now();
    for (let i = 1; i <= 100; i += 1) {
      metricsCollector.recordMetric('api.latency', i * 10, {
        sloEligible: 'true',
        path: '/api/health',
      });
      metricsCollector.samples[metricsCollector.samples.length - 1].timestamp = now - i;
    }

    const result = metricsCollector.getPercentile('api.latency', 0.95, {
      tagEquals: { sloEligible: 'true' },
    });
    expect(result.sampleCount).toBe(100);
    expect(result.value).toBe(960);
  });

  it('excludes long-running routes tagged sloEligible=false', () => {
    metricsCollector.recordMetric('api.latency', 95_803, {
      sloEligible: 'false',
      path: '/api/performer/intake/v2',
    });
    metricsCollector.recordMetric('api.latency', 120, {
      sloEligible: 'true',
      path: '/api/health',
    });

    const result = metricsCollector.getPercentile('api.latency', 0.95, {
      tagEquals: { sloEligible: 'true' },
    });
    expect(result.sampleCount).toBe(1);
    expect(result.value).toBe(120);
  });
});
