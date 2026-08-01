import { describe, expect, it, beforeEach, vi } from 'vitest';
import { AgentType } from '../../types/agent.types.js';
import {
  globalMetrics,
  resetMissionHistoryForTests,
} from '../../telemetry/metrics.js';
import { multiAgentMetricsStore } from '../dashboard/metricsStore.js';
import { resetAlertHistoryForTests } from '../alerts/alert.history.js';
import {
  initMultiAgentMonitoring,
  resetMultiAgentMonitoringForTests,
} from '../alerts/alert.manager.js';
import { AlertSeverity } from '../types/alert.types.js';
import { notifyProcessMemory, notifyRuntimeDiagnostic } from '../monitoringRuntimeBridge.js';

vi.mock('../../../services/reliability/alerting.js', () => ({
  default: {
    sendAlert: vi.fn().mockResolvedValue(undefined),
  },
}));

describe('Monitoring System Integration', () => {
  beforeEach(() => {
    resetMissionHistoryForTests();
    resetAlertHistoryForTests();
    resetMultiAgentMonitoringForTests();
    process.env.MONITORING_ENABLED = 'true';
  });

  it('records and retrieves mission metrics', () => {
    globalMetrics.recordMission({
      missionId: 'test-123',
      timestamp: new Date(),
      duration: 1000,
      agentsUsed: [AgentType.INTENT_CLASSIFIER, AgentType.PLANNER],
      tokenUsage: { total: 1000, byAgent: {} },
      thinkingMode: { type: 'enabled', reasoningEffort: 'medium' },
      parallelLimit: 5,
      hitlEnabled: true,
      retries: 0,
      errors: [],
      costUsd: 0.001,
      intent: 'STORE_SETUP',
      missionStatus: 'completed',
      planComplexity: 'low',
      qualityMetrics: { intentConfidence: 0.95 },
    });

    const dashboard = multiAgentMetricsStore.getDashboardData('1h');
    expect(dashboard.metrics.totalRequests).toBeGreaterThan(0);
    expect(dashboard.metrics.successRate).toBe(1);

    const mission = multiAgentMetricsStore.getMissionMetrics('test-123');
    expect(mission?.missionId).toBe('test-123');
    expect(mission?.duration).toBe(1000);
  });

  it('generates prometheus metrics output', () => {
    globalMetrics.recordMission({
      missionId: 'prom-1',
      timestamp: new Date(),
      duration: 500,
      agentsUsed: [AgentType.INTENT_CLASSIFIER],
      tokenUsage: { total: 100, byAgent: {} },
      thinkingMode: { type: 'disabled', reasoningEffort: 'low' },
      parallelLimit: 1,
      hitlEnabled: false,
      retries: 0,
      errors: [],
      missionStatus: 'completed',
    });

    const text = multiAgentMetricsStore.getPrometheusMetrics();
    expect(text).toContain('cardbey_multi_agent_success_rate');
    expect(text).toContain('cardbey_process_rss_mb');
  });

  it('triggers manual alert and lists it', async () => {
    const { alertManager } = initMultiAgentMonitoring();
    await alertManager.triggerManualAlert({
      ruleId: 'test_rule',
      severity: AlertSeverity.WARNING,
      title: 'Test Threshold',
      message: 'Synthetic test alert',
      value: 2,
      threshold: 1,
    });

    const alerts = alertManager.getAlerts({ status: 'pending' });
    expect(alerts.length).toBeGreaterThanOrEqual(1);
    expect(alerts[0]?.title).toContain('Test Threshold');
  });

  it('reports system health', () => {
    const health = multiAgentMetricsStore.getSystemHealth();
    expect(health.status).toBeDefined();
    expect(health.successRate).toBeDefined();
    expect(health.errorRate).toBeDefined();
  });

  it('bridges runtime diagnostics into mission history', async () => {
    await notifyRuntimeDiagnostic({
      id: 'diag-abc-123',
      severity: 'error',
      category: 'api_failure',
      message: 'Upstream timeout',
      missionId: 'mission-xyz',
    });

    const mission = multiAgentMetricsStore.getMissionMetrics('mission-xyz');
    expect(mission?.status).toBe('failed');
  });

  it('does not bridge browser unhandledrejection / createParser noise into mission history', async () => {
    await notifyRuntimeDiagnostic({
      id: 'diag-client-1',
      severity: 'error',
      category: 'unknown',
      eventName: 'unhandledrejection',
      message:
        "`config` must be an object, got a function instead. Did you mean `createParser({onEvent: fn})`?",
      missionId: 'mission-client-noise',
    });

    expect(multiAgentMetricsStore.getMissionMetrics('mission-client-noise')).toBeUndefined();
  });

  it('updates process memory metrics for alert evaluation', async () => {
    const { alertManager } = initMultiAgentMonitoring();
    await notifyProcessMemory({ rssMb: 3200, heapUsedMb: 180 });

    const snapshot = multiAgentMetricsStore.getEvaluationSnapshot(300);
    expect(snapshot.process?.rssMb).toBe(3200);

    await alertManager.evaluateRules();
    const alerts = alertManager.getAlerts();
    expect(Array.isArray(alerts)).toBe(true);
  });
});
