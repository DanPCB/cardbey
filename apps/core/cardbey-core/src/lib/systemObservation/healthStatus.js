/**
 * Aggregated health metrics for System Observation.
 */

import { buildStatusSummary, getComponentStatuses } from './componentStatus.js';
import { computeRegistryBaseline, getComponentRegistry } from './componentRegistry.js';

/**
 * @param {{ bypassCache?: boolean }} [options]
 */
export async function getHealthStatus(options = {}) {
  const components = await getComponentStatuses(options);
  const summary = buildStatusSummary(components);

  const latencies = components
    .map((c) => c.latency)
    .filter((v) => typeof v === 'number' && Number.isFinite(v));

  const successRate =
    summary.total > 0 ? Math.round((summary.running / summary.total) * 1000) / 10 : 0;

  const avgProbeLatencyMs =
    latencies.length > 0
      ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
      : null;

  const maxProbeLatencyMs = latencies.length > 0 ? Math.max(...latencies) : null;
  const docBaselineRaw = computeRegistryBaseline(getComponentRegistry());

  return {
    timestamp: new Date().toISOString(),
    summary,
    metrics: {
      successRate,
      avgProbeLatencyMs,
      maxProbeLatencyMs,
      probedComponents: latencies.length,
      totalComponents: summary.total,
    },
    docBaseline: {
      running: docBaselineRaw.running,
      partial: docBaselineRaw.partial,
      placeholder: docBaselineRaw.placeholder,
      total: docBaselineRaw.total,
      successRatePct: docBaselineRaw.successRatePct,
    },
    links: {
      reliability: '#reliability-slo',
      diagnostics: '/api/diagnostics/health-report',
      runtime: '#runtime',
      architectureDoc: '/docs/system_architecture.html',
    },
  };
}
