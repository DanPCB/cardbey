/**
 * Bridges runtime diagnostics and process memory samples into multi-agent monitoring.
 * Uses dynamic imports to avoid circular dependencies at module load time.
 */

import { AlertSeverity } from './types/alert.types.js';

export async function notifyRuntimeDiagnostic(record: {
  id: string;
  severity: string;
  category: string;
  message: string;
  missionId?: string | null;
}): Promise<void> {
  if (process.env.MONITORING_ENABLED === 'false') return;

  const severity = String(record.severity ?? '').toLowerCase();
  if (severity !== 'error' && severity !== 'critical') return;

  const monitoring = await import('./index.js');
  monitoring.initMultiAgentMonitoring();

  const { globalMetrics } = await import('../telemetry/metrics.js');
  globalMetrics.recordMission({
    missionId: record.missionId?.trim() || `diag_${record.id.slice(0, 8)}`,
    timestamp: new Date(),
    duration: 0,
    agentsUsed: [],
    tokenUsage: { total: 0, byAgent: {} },
    thinkingMode: { type: 'disabled', reasoningEffort: 'low' },
    parallelLimit: 0,
    hitlEnabled: false,
    retries: 0,
    errors: [record.message],
    missionStatus: 'failed',
  });

  if (severity === 'critical') {
    const alertManager = monitoring.getMultiAgentAlertManager();
    if (alertManager) {
      await alertManager.triggerManualAlert({
        ruleId: 'critical_runtime_diagnostic',
        severity: AlertSeverity.CRITICAL,
        title: `Runtime: ${record.category}`,
        message: record.message,
        value: 1,
        threshold: 0,
      });
    }
  }
}

export async function notifyProcessMemory(stats: {
  rssMb: number;
  heapUsedMb?: number;
}): Promise<void> {
  if (process.env.MONITORING_ENABLED === 'false') return;

  const monitoring = await import('./index.js');
  const { metricsStore, alertManager } = monitoring.initMultiAgentMonitoring();
  metricsStore.updateProcessMetrics(stats);
  await alertManager.evaluateRules();
}
