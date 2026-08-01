/**
 * Bridges runtime diagnostics and process memory samples into multi-agent monitoring.
 * Uses dynamic imports to avoid circular dependencies at module load time.
 */

import { AlertSeverity } from './types/alert.types.js';

/**
 * Client/browser diagnostics must not inflate multi-agent mission success/error rates.
 * (e.g. eventsource-parser createParser misuse → unhandledrejection → fake failed missions)
 */
export function shouldBridgeDiagnosticToMissionMetrics(record: {
  category?: string | null;
  eventName?: string | null;
  message?: string | null;
}): boolean {
  const eventName = String(record.eventName ?? '').trim().toLowerCase();
  if (eventName === 'unhandledrejection' || eventName === 'window.error') {
    return false;
  }

  const message = String(record.message ?? '');
  if (/createParser\(\s*\{\s*onEvent/i.test(message) || /`config` must be an object, got a function/i.test(message)) {
    return false;
  }

  return true;
}

export async function notifyRuntimeDiagnostic(record: {
  id: string;
  severity: string;
  category: string;
  message: string;
  missionId?: string | null;
  eventName?: string | null;
}): Promise<void> {
  if (process.env.MONITORING_ENABLED === 'false') return;

  const severity = String(record.severity ?? '').trim().toLowerCase();
  if (severity !== 'error' && severity !== 'critical') return;

  if (!shouldBridgeDiagnosticToMissionMetrics(record)) {
    return;
  }

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
