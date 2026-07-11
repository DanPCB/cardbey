import { describe, expect, it, beforeEach } from 'vitest';
import { AgentType } from '../../types/agent.types.js';
import {
  globalMetrics,
  onMissionRecorded,
  resetMissionHistoryForTests,
} from '../../telemetry/metrics.js';
import { multiAgentMetricsStore } from '../dashboard/metricsStore.js';
import { resetAlertHistoryForTests } from '../alerts/alert.history.js';
import { resetMultiAgentMonitoringForTests } from '../alerts/alert.manager.js';

describe('multiAgentMetricsStore', () => {
  beforeEach(() => {
    resetMissionHistoryForTests();
    resetAlertHistoryForTests();
    resetMultiAgentMonitoringForTests();
  });

  it('aggregates dashboard metrics from recorded missions', () => {
    globalMetrics.recordMission({
      missionId: 'M1',
      timestamp: new Date(),
      duration: 1200,
      agentsUsed: [AgentType.INTENT_CLASSIFIER, AgentType.PLANNER],
      tokenUsage: { total: 500, byAgent: { intent_classifier: 200, planner: 300 } },
      thinkingMode: { type: 'enabled', reasoningEffort: 'medium' },
      parallelLimit: 5,
      hitlEnabled: true,
      retries: 0,
      errors: [],
      costUsd: 0.01,
      intent: 'STORE_SETUP',
      missionStatus: 'completed',
      planComplexity: 'low',
      qualityMetrics: { intentConfidence: 0.92 },
    });

    const data = multiAgentMetricsStore.getDashboardData('24h');
    expect(data.metrics.totalRequests).toBe(1);
    expect(data.metrics.successRate).toBe(1);
    expect(data.metrics.totalCost).toBeCloseTo(0.01);
    expect(data.charts.agentPerformance.length).toBeGreaterThan(0);

    const health = multiAgentMetricsStore.getSystemHealth();
    expect(health.lastUpdate).toBeTruthy();
    expect(health.isFresh).toBe(true);
    expect(health.agentDetails).toHaveLength(6);
    expect(health.healthScore).toBeGreaterThan(0);
  });

  it('fires mission recorded listeners', () => {
    let called = 0;
    const off = onMissionRecorded(() => {
      called += 1;
    });
    globalMetrics.recordMission({
      missionId: 'M2',
      timestamp: new Date(),
      duration: 100,
      agentsUsed: [],
      tokenUsage: { total: 0, byAgent: {} },
      thinkingMode: { type: 'disabled', reasoningEffort: 'low' },
      parallelLimit: 1,
      hitlEnabled: false,
      retries: 0,
      errors: [],
    });
    expect(called).toBe(1);
    off();
  });
});
