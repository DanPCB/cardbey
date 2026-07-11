/**
 * Detects API latency spikes exceeding SLO.
 */

import { BaseDetector, type AuditContext, type AuditIssue } from './base.detector.js';

const SLO_TARGET_MS = 5000;

export class LatencySpikeDetector extends BaseDetector {
  readonly name = 'Latency Spike';
  readonly detectorKey = 'latency-spike';

  async detect(context: AuditContext): Promise<AuditIssue[]> {
    if (!this.shouldRun(context)) return [];

    const issues: AuditIssue[] = [];
    const p95 = Number(context.metrics?.latency_p95 ?? 0);

    const latencyWarnings = context.logs.filter(
      (log) =>
        log.includes('SLO breach') ||
        (log.includes('latency') && log.includes('exceeded')),
    );

    if (p95 > SLO_TARGET_MS || latencyWarnings.length > 10) {
      const severity = p95 > 10000 || latencyWarnings.length > 20 ? 'critical' : 'high';
      issues.push(
        this.createIssue(
          'performance',
          severity,
          `API latency spike (${p95 || 'unknown'}ms)`,
          `P95 latency ${p95 ? `(${p95}ms)` : 'exceeds thresholds'} — SLO target is ${SLO_TARGET_MS}ms.`,
          'apps/core/cardbey-core/src/multiAgent/config/agent.config.ts',
          {
            p95,
            slo: SLO_TARGET_MS,
            breach: p95 > 0 ? p95 - SLO_TARGET_MS : null,
            latencyWarnings: latencyWarnings.length,
          },
          'Reduce MULTI_AGENT_PARALLEL_LIMIT, enable circuit breaker, and profile slow agent steps.',
          true,
        ),
      );
    }

    this.logDetect(issues.length);
    return issues;
  }
}
