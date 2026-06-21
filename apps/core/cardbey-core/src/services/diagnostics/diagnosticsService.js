/**
 * Diagnostics Service — self-diagnosis and health reporting.
 */

import { getPrismaClient } from '../../lib/prisma.js';
import sloTracker from '../reliability/sloTracker.js';
import { listRecentRuntimeDiagnostics } from '../../lib/runtimeDiagnostics/index.js';
import {
  assessBackendHealthFromObservations,
  assessFrontendHealthFromErrors,
  calculateHealthScore,
  computeFailureRateTrend,
  correlateFrontendBackendErrors,
  detectAnomaliesFromSignals,
  detectErrorSpike,
  diagnosticsTimeWindows,
  generateRecommendations,
} from './diagnosticsLogic.js';

function hasFrontendErrorModel(prisma) {
  return Boolean(prisma?.frontendError?.createMany);
}

export class DiagnosticsService {
  /**
   * Store batched frontend errors for correlation.
   */
  async storeFrontendErrors(data) {
    const { userId, sessionId, errors, timestamp } = data ?? {};
    const batch = Array.isArray(errors) ? errors : [];
    if (!batch.length) return { stored: 0 };

    const prisma = getPrismaClient();
    if (!hasFrontendErrorModel(prisma)) {
      return { stored: 0, skipped: 'model_unavailable' };
    }

    const sid = String(sessionId ?? 'unknown').trim() || 'unknown';
    const rows = batch.map((error) => ({
      userId: userId ? String(userId) : null,
      sessionId: sid,
      type: String(error.type ?? 'unknown').slice(0, 64),
      message: String(error.message ?? '').slice(0, 4000),
      filename: error.filename ? String(error.filename).slice(0, 512) : null,
      lineNumber: Number.isFinite(error.lineno) ? error.lineno : error.lineNumber ?? null,
      columnNumber: Number.isFinite(error.colno) ? error.colno : error.columnNumber ?? null,
      stack: error.stack ? String(error.stack).slice(0, 8000) : null,
      url: error.url ? String(error.url).slice(0, 1024) : null,
      status: Number.isFinite(error.status) ? error.status : null,
      metadata: error && typeof error === 'object' ? error : {},
      timestamp: new Date(error.timestamp || timestamp || Date.now()),
    }));

    try {
      await prisma.frontendError.createMany({ data: rows });
      return { stored: rows.length };
    } catch (err) {
      console.warn('[DiagnosticsService] storeFrontendErrors failed', err?.message || err);
      return { stored: 0, error: err?.message || 'store_failed' };
    }
  }

  async fetchObservationsSince(since) {
    const prisma = getPrismaClient();
    try {
      return await prisma.observation.findMany({
        where: { createdAt: { gte: since } },
        orderBy: { createdAt: 'desc' },
        take: 5000,
      });
    } catch {
      return [];
    }
  }

  async fetchFrontendErrorsSince(since) {
    const prisma = getPrismaClient();
    if (!hasFrontendErrorModel(prisma)) {
      return this.runtimeDiagnosticsAsFrontendErrors(since);
    }
    try {
      const rows = await prisma.frontendError.findMany({
        where: { timestamp: { gte: since } },
        orderBy: { timestamp: 'desc' },
        take: 2000,
      });
      if (rows.length > 0) return rows;
      return this.runtimeDiagnosticsAsFrontendErrors(since);
    } catch {
      return this.runtimeDiagnosticsAsFrontendErrors(since);
    }
  }

  runtimeDiagnosticsAsFrontendErrors(since) {
    const sinceMs = since instanceof Date ? since.getTime() : Date.parse(String(since));
    const rows = listRecentRuntimeDiagnostics({ limit: 200, severity: 'error' });
    return rows
      .filter((r) => {
        const ts = Date.parse(String(r.createdAt ?? ''));
        return Number.isFinite(ts) && ts >= sinceMs;
      })
      .map((r) => ({
        id: r.id,
        userId: r.userId ?? null,
        sessionId: 'runtime-buffer',
        type: String(r.eventName ?? r.category ?? 'runtime_diagnostic'),
        message: String(r.message ?? ''),
        url: r.evidenceJson?.endpoint ?? r.route ?? null,
        status: r.evidenceJson?.status ?? null,
        timestamp: r.createdAt,
      }));
  }

  async assessBackendHealth() {
    const since = diagnosticsTimeWindows.dayAgo();
    const observations = await this.fetchObservationsSince(since);
    return assessBackendHealthFromObservations(observations);
  }

  async assessFrontendHealth() {
    const since = diagnosticsTimeWindows.dayAgo();
    const errors = await this.fetchFrontendErrorsSince(since);
    return assessFrontendHealthFromErrors(errors);
  }

  async getSystemMetrics() {
    const [executionStateStats, failurePatterns] = await Promise.all([
      sloTracker.getExecutionStateStats().catch(() => null),
      sloTracker.getFailurePatterns(8).catch(() => ({ realFailures: [], stubFailures: [] })),
    ]);

    const runtimeRecent = listRecentRuntimeDiagnostics({ limit: 100 });
    const runtimeErrors = runtimeRecent.filter((r) => r.severity === 'error' || r.severity === 'critical');

    return {
      executionStateStats,
      failurePatterns,
      runtimeDiagnosticsOpen: runtimeRecent.filter((r) => r.status === 'open').length,
      runtimeErrors24h: runtimeErrors.length,
    };
  }

  async detectAnomalies() {
    const prisma = getPrismaClient();
    const oneHourAgo = diagnosticsTimeWindows.hourAgo();
    const twoHoursAgo = diagnosticsTimeWindows.twoHoursAgo();
    const thirtyMinAgo = diagnosticsTimeWindows.thirtyMinAgo();
    const sixtyMinAgo = diagnosticsTimeWindows.sixtyMinAgo();

    const [recentObs, previousObs, recentFront, previousFront, slowExecutions, toolPatterns] =
      await Promise.all([
        this.fetchObservationsSince(oneHourAgo),
        prisma.observation
          .findMany({
            where: { createdAt: { gte: twoHoursAgo, lt: oneHourAgo } },
            take: 3000,
          })
          .catch(() => []),
        this.countFrontendErrorsSince(thirtyMinAgo),
        this.countFrontendErrorsSinceWindow(sixtyMinAgo, thirtyMinAgo),
        prisma.observation
          .findMany({
            where: { latency: { gt: 5000 }, createdAt: { gte: oneHourAgo } },
            select: { actionType: true, latency: true, createdAt: true },
            take: 50,
          })
          .catch(() => []),
        sloTracker.getFailurePatterns(5).catch(() => ({ realFailures: [] })),
      ]);

    const runtimeRecent = listRecentRuntimeDiagnostics({ limit: 300, severity: 'error' });
    const runtime30 = runtimeRecent.filter((r) => Date.parse(r.createdAt) >= thirtyMinAgo.getTime()).length;
    const runtimePrev = runtimeRecent.filter((r) => {
      const ts = Date.parse(r.createdAt);
      return ts >= sixtyMinAgo.getTime() && ts < thirtyMinAgo.getTime();
    }).length;

    const failureTrend = computeFailureRateTrend(recentObs, previousObs);
    const errorSpike = detectErrorSpike(recentFront, previousFront);
    const runtimeDiagnosticSpike = detectErrorSpike(runtime30, runtimePrev);

    const toolFailures = (toolPatterns?.realFailures ?? [])
      .filter((t) => t.count >= 3)
      .map((t) => ({ tool: t.action, count: t.count, errors: t.errors }));

    return detectAnomaliesFromSignals({
      failureTrend,
      errorSpike,
      runtimeDiagnosticSpike,
      slowExecutionCount: slowExecutions.length,
      toolFailures,
    });
  }

  async countFrontendErrorsSince(since) {
    const prisma = getPrismaClient();
    if (!hasFrontendErrorModel(prisma)) {
      return this.runtimeDiagnosticsAsFrontendErrors(since).length;
    }
    try {
      return await prisma.frontendError.count({ where: { timestamp: { gte: since } } });
    } catch {
      return 0;
    }
  }

  async countFrontendErrorsSinceWindow(from, to) {
    const prisma = getPrismaClient();
    if (!hasFrontendErrorModel(prisma)) return 0;
    try {
      return await prisma.frontendError.count({
        where: { timestamp: { gte: from, lt: to } },
      });
    } catch {
      return 0;
    }
  }

  async correlateErrors() {
    const since = diagnosticsTimeWindows.dayAgo();
    const [frontendErrors, backendFailures] = await Promise.all([
      this.fetchFrontendErrorsSince(since).then((rows) => rows.slice(0, 100)),
      this.fetchObservationsSince(since).then((rows) =>
        rows.filter((o) => String(o.outcome).toLowerCase() === 'failure').slice(0, 100),
      ),
    ]);

    return correlateFrontendBackendErrors(frontendErrors, backendFailures);
  }

  async getHealthScore() {
    const [backendHealth, frontendHealth, anomalies] = await Promise.all([
      this.assessBackendHealth(),
      this.assessFrontendHealth(),
      this.detectAnomalies(),
    ]);

    return calculateHealthScore({
      successRate: backendHealth.successRate,
      failures: backendHealth.failures,
      totalExecutions: backendHealth.totalExecutions,
      stubs: backendHealth.stubs,
      totalErrors: frontendHealth.totalErrors,
      anomalyCount: anomalies.length,
    });
  }

  async generateHealthReport() {
    const [backendHealth, frontendHealth, systemMetrics, anomalies, correlations, healthScore] =
      await Promise.all([
        this.assessBackendHealth(),
        this.assessFrontendHealth(),
        this.getSystemMetrics(),
        this.detectAnomalies(),
        this.correlateErrors(),
        this.getHealthScore(),
      ]);

    return {
      timestamp: new Date().toISOString(),
      overallHealth: healthScore,
      backendHealth,
      frontendHealth,
      systemMetrics,
      anomalies,
      correlations,
      recommendations: generateRecommendations(backendHealth, frontendHealth, anomalies),
    };
  }
}

export default new DiagnosticsService();
