import { describe, expect, it } from 'vitest';
import {
  assessBackendHealthFromObservations,
  assessFrontendHealthFromErrors,
  calculateHealthScore,
  computeFailureRateTrend,
  correlateFrontendBackendErrors,
  detectAnomaliesFromSignals,
  detectErrorSpike,
  generateRecommendations,
} from './diagnosticsLogic.js';

describe('diagnosticsLogic', () => {
  it('assessBackendHealthFromObservations computes success rate', () => {
    const health = assessBackendHealthFromObservations([
      { outcome: 'success', actionType: 'create_store' },
      { outcome: 'failure', actionType: 'create_store' },
      { outcome: 'success', actionType: 'launch_campaign' },
    ]);
    expect(health.totalExecutions).toBe(3);
    expect(health.failures).toBe(1);
    expect(health.successRate).toBeCloseTo(66.7, 0);
    expect(health.status).toBe('degraded');
  });

  it('detectErrorSpike flags large increases', () => {
    expect(detectErrorSpike(20, 5).detected).toBe(true);
    expect(detectErrorSpike(3, 2).detected).toBe(false);
  });

  it('computeFailureRateTrend compares windows', () => {
    const trend = computeFailureRateTrend(
      [{ outcome: 'failure' }, { outcome: 'success' }],
      [{ outcome: 'success' }, { outcome: 'success' }],
    );
    expect(trend.current).toBe(50);
    expect(trend.previous).toBe(0);
    expect(trend.increase).toBe(50);
  });

  it('correlateFrontendBackendErrors matches within window', () => {
    const t0 = new Date('2026-06-21T12:00:00.000Z');
    const t1 = new Date('2026-06-21T12:02:00.000Z');
    const result = correlateFrontendBackendErrors(
      [{ id: 'f1', message: '500 Internal Server Error', timestamp: t0, type: 'api_error', status: 500 }],
      [{ id: 'b1', actionType: 'create_store', error: 'db fail', createdAt: t1 }],
      5 * 60 * 1000,
    );
    expect(result.correlated).toBe(1);
    expect(result.correlations[0]?.rootCauseHint).toMatch(/backend/i);
  });

  it('detectAnomaliesFromSignals emits failure spike', () => {
    const anomalies = detectAnomaliesFromSignals({
      failureTrend: { increase: 25, current: 30, previous: 5 },
      errorSpike: { detected: false },
      slowExecutionCount: 0,
      toolFailures: [],
    });
    expect(anomalies.some((a) => a.type === 'failure_rate_spike')).toBe(true);
  });

  it('calculateHealthScore penalizes failures and anomalies', () => {
    const score = calculateHealthScore({
      successRate: 80,
      failures: 20,
      totalExecutions: 100,
      stubs: 4,
      totalErrors: 30,
      anomalyCount: 2,
    });
    expect(score).toBeLessThan(80);
    expect(score).toBeGreaterThanOrEqual(0);
  });

  it('generateRecommendations surfaces backend and frontend issues', () => {
    const recs = generateRecommendations(
      { successRate: 90 },
      { totalErrors: 25 },
      [{ severity: 'high', type: 'tool_failures', description: 'x' }],
    );
    expect(recs.length).toBeGreaterThanOrEqual(2);
  });

  it('assessFrontendHealthFromErrors groups by type', () => {
    const health = assessFrontendHealthFromErrors([
      { type: 'api_error', message: 'a', userId: 'u1' },
      { type: 'api_error', message: 'b', userId: 'u1' },
    ]);
    expect(health.totalErrors).toBe(2);
    expect(health.byType.api_error).toBe(2);
  });
});
