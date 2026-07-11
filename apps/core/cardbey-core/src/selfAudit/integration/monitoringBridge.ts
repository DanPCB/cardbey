/**
 * Connect self-audit results to multi-agent monitoring and alerting.
 */

import type { AuditIssue } from '../detectors/base.detector.js';
import { selfAuditLog } from '../detectors/base.detector.js';

export interface AuditReportPayload {
  issueCount: number;
  criticalCount: number;
  highCount: number;
  issues: AuditIssue[];
  timestamp: string;
}

/**
 * Report audit results to monitoring system.
 */
export async function reportAuditToMonitoring(report: AuditReportPayload): Promise<void> {
  if (process.env.MONITORING_ENABLED === 'false') {
    selfAuditLog.debug('Monitoring disabled — skipping audit report');
    return;
  }

  try {
    const monitoring = await import('../../multiAgent/monitoring/index.js');
    monitoring.initMultiAgentMonitoring();

    const { globalMetrics } = await import('../../multiAgent/telemetry/metrics.js');
    globalMetrics.recordMission({
      missionId: `self_audit_${Date.now()}`,
      timestamp: new Date(),
      duration: 0,
      agentsUsed: [],
      tokenUsage: { total: 0, byAgent: {} },
      thinkingMode: { type: 'disabled', reasoningEffort: 'low' },
      parallelLimit: 0,
      hitlEnabled: false,
      retries: 0,
      errors: report.criticalCount > 0 ? [`${report.criticalCount} critical self-audit issues`] : [],
      missionStatus: report.criticalCount > 0 ? 'failed' : 'success',
    });

    if (report.criticalCount > 0) {
      const alertManager = monitoring.getMultiAgentAlertManager();
      if (alertManager) {
        const { AlertSeverity } = await import('../../multiAgent/monitoring/types/alert.types.js');
        await alertManager.triggerManualAlert({
          ruleId: 'self_audit_critical',
          severity: AlertSeverity.CRITICAL,
          title: 'Self-audit: critical issues detected',
          message: `${report.criticalCount} critical, ${report.highCount} high severity issues`,
          value: report.criticalCount,
          threshold: 0,
        });
      }
    }

    selfAuditLog.info('Reported audit to monitoring', {
      issueCount: report.issueCount,
      criticalCount: report.criticalCount,
    });
  } catch (err) {
    selfAuditLog.warn('Failed to report to monitoring', { error: (err as Error).message });
  }
}

/**
 * Collect runtime metrics for audit context.
 */
export async function collectMonitoringMetrics(): Promise<Record<string, number>> {
  const metrics: Record<string, number> = {};

  try {
    const mem = process.memoryUsage();
    metrics.rss = Math.round(mem.rss / 1024 / 1024);
    metrics.memory_usage = metrics.rss;
    metrics.heap_used = Math.round(mem.heapUsed / 1024 / 1024);

    const monitoring = await import('../../multiAgent/monitoring/index.js');
    const { metricsStore } = monitoring.initMultiAgentMonitoring();
    const dashboard = metricsStore.getDashboardData('24h');
    if (dashboard?.metrics?.averageResponseTime != null) {
      metrics.latency_p95 = dashboard.metrics.averageResponseTime;
    }
    const durations = dashboard.recentMissions
      .map((m) => m.duration)
      .filter((d) => typeof d === 'number' && d > 0)
      .sort((a, b) => a - b);
    if (durations.length > 0) {
      const p95Idx = Math.min(durations.length - 1, Math.floor(durations.length * 0.95));
      metrics.latency_p95 = durations[p95Idx] ?? metrics.latency_p95;
    }
    if (dashboard?.metrics?.successRate != null) {
      metrics.success_rate = dashboard.metrics.successRate;
    }
    if (dashboard?.metrics?.errorRate != null) {
      metrics.error_rate = dashboard.metrics.errorRate;
    }
  } catch {
    /* monitoring optional */
  }

  return metrics;
}
