/**
 * Pure self-diagnosis logic (testable without Prisma).
 */

const MS_HOUR = 60 * 60 * 1000;
const MS_DAY = 24 * MS_HOUR;
export const CORRELATION_WINDOW_MS = 5 * 60 * 1000;

/**
 * @param {Array<{ outcome?: string; actionType?: string; executionState?: string; isRealExecution?: boolean }>} observations
 */
export function assessBackendHealthFromObservations(observations) {
  const rows = Array.isArray(observations) ? observations : [];
  const total = rows.length;
  const failures = rows.filter((o) => String(o.outcome ?? '').toLowerCase() === 'failure').length;
  const stubs = rows.filter(
    (o) =>
      String(o.executionState ?? '').toLowerCase() === 'stubbed' || o.isRealExecution === false,
  ).length;
  const successRate = total > 0 ? ((total - failures) / total) * 100 : 100;

  return {
    status: total === 0 ? 'healthy' : failures / total < 0.05 ? 'healthy' : 'degraded',
    successRate: Math.round(successRate * 10) / 10,
    totalExecutions: total,
    failures,
    stubs,
    topFailureActions: getTopFailureActions(rows),
  };
}

/**
 * @param {Array<{ type?: string; message?: string; userId?: string|null }>} errors
 */
export function assessFrontendHealthFromErrors(errors) {
  const rows = Array.isArray(errors) ? errors : [];
  const total = rows.length;

  return {
    status: total < 10 ? 'healthy' : total < 50 ? 'degraded' : 'critical',
    totalErrors: total,
    byType: groupByField(rows, 'type'),
    byUser: groupByUser(rows),
    topErrors: getTopErrors(rows),
  };
}

/**
 * @param {Array<{ outcome?: string; createdAt?: Date|string }>} recent
 * @param {Array<{ outcome?: string; createdAt?: Date|string }>} previous
 */
export function computeFailureRateTrend(recent, previous) {
  const recentFailureRate = rateOfFailures(recent);
  const previousFailureRate = rateOfFailures(previous);
  const increase = recentFailureRate - previousFailureRate;

  return {
    current: Math.round(recentFailureRate * 100) / 100,
    previous: Math.round(previousFailureRate * 100) / 100,
    increase: Math.round(increase * 100) / 100,
  };
}

/**
 * @param {number} recentCount
 * @param {number} previousCount
 */
export function detectErrorSpike(recentCount, previousCount) {
  const recent = Number(recentCount) || 0;
  const previous = Number(previousCount) || 0;
  const increase = previous > 0 ? Math.round(((recent - previous) / previous) * 100) : recent > 0 ? 100 : 0;

  return {
    detected: recent > previous * 1.5 && recent > 5,
    current: recent,
    previous,
    increase,
  };
}

/**
 * @param {{
 *   failureTrend?: { increase?: number };
 *   errorSpike?: { detected?: boolean; increase?: number };
 *   slowExecutionCount?: number;
 *   toolFailures?: Array<{ tool?: string }>;
 * }} signals
 */
export function detectAnomaliesFromSignals(signals) {
  const anomalies = [];
  const now = new Date().toISOString();

  const failureTrend = signals.failureTrend ?? {};
  if (Number(failureTrend.increase) > 20) {
    anomalies.push({
      type: 'failure_rate_spike',
      severity: 'high',
      description: `Failure rate increased by ${failureTrend.increase}% in the last hour`,
      currentRate: failureTrend.current,
      previousRate: failureTrend.previous,
      timestamp: now,
    });
  }

  const errorSpike = signals.errorSpike ?? {};
  if (errorSpike.detected) {
    anomalies.push({
      type: 'frontend_error_spike',
      severity: 'medium',
      description: `Frontend errors spiked by ${errorSpike.increase}% in the last 30 minutes`,
      currentCount: errorSpike.current,
      previousCount: errorSpike.previous,
      timestamp: now,
    });
  }

  const slowCount = Number(signals.slowExecutionCount) || 0;
  if (slowCount > 5) {
    anomalies.push({
      type: 'slow_executions',
      severity: 'medium',
      description: `${slowCount} executions exceeded 5 seconds in the last hour`,
      slowCount,
      timestamp: now,
    });
  }

  const toolFailures = Array.isArray(signals.toolFailures) ? signals.toolFailures : [];
  if (toolFailures.length > 0) {
    anomalies.push({
      type: 'tool_failures',
      severity: 'high',
      description: `Tools failing: ${toolFailures.map((t) => t.tool).filter(Boolean).join(', ')}`,
      failures: toolFailures.slice(0, 10),
      timestamp: now,
    });
  }

  const runtimeSpike = signals.runtimeDiagnosticSpike;
  if (runtimeSpike?.detected) {
    anomalies.push({
      type: 'runtime_diagnostic_spike',
      severity: 'high',
      description: `Runtime client errors spiked (${runtimeSpike.current} in 30m vs ${runtimeSpike.previous} prior)`,
      currentCount: runtimeSpike.current,
      previousCount: runtimeSpike.previous,
      timestamp: now,
    });
  }

  return anomalies;
}

/**
 * Correlate frontend rows with backend failures within a time window.
 * @param {Array<{ id?: string; message?: string; timestamp?: Date|string; type?: string; url?: string }>} frontendErrors
 * @param {Array<{ id?: string; actionType?: string; error?: string; createdAt?: Date|string }>} backendFailures
 * @param {number} [windowMs]
 */
export function correlateFrontendBackendErrors(frontendErrors, backendFailures, windowMs = CORRELATION_WINDOW_MS) {
  const front = Array.isArray(frontendErrors) ? frontendErrors : [];
  const back = Array.isArray(backendFailures) ? backendFailures : [];
  const correlations = [];

  for (const frontend of front) {
    const frontTs = toMs(frontend.timestamp);
    if (!Number.isFinite(frontTs)) continue;

    const matchingBackend = back.find((b) => {
      const backTs = toMs(b.createdAt);
      if (!Number.isFinite(backTs)) return false;
      return Math.abs(backTs - frontTs) < windowMs;
    });

    if (matchingBackend) {
      correlations.push({
        frontendError: summarizeFrontendError(frontend),
        backendFailure: summarizeBackendFailure(matchingBackend),
        timeDiff: Math.abs(toMs(matchingBackend.createdAt) - frontTs),
        rootCauseHint: inferRootCauseHint(frontend, matchingBackend),
      });
    }
  }

  return {
    totalFrontendErrors: front.length,
    totalBackendFailures: back.length,
    correlated: correlations.length,
    correlationRate: front.length > 0 ? Math.round((correlations.length / front.length) * 1000) / 10 : 0,
    correlations: correlations.slice(0, 20),
  };
}

/**
 * @param {{ successRate?: number; totalErrors?: number; stubs?: number; anomalyCount?: number }} input
 */
export function calculateHealthScore(input) {
  let score = 100;
  const successRate = Number(input.successRate);
  const failures = Number(input.failures) || 0;
  const totalExecutions = Number(input.totalExecutions) || 0;

  if (totalExecutions > 0) {
    const failurePenalty = (failures / totalExecutions) * 100;
    score -= failurePenalty * 0.5;
  } else if (Number.isFinite(successRate) && successRate < 100) {
    score -= (100 - successRate) * 0.5;
  }

  const frontendPenalty = Math.min((Number(input.totalErrors) || 0) * 0.5, 30);
  score -= frontendPenalty;

  const anomalyPenalty = (Number(input.anomalyCount) || 0) * 5;
  score -= Math.min(anomalyPenalty, 30);

  const stubPenalty = (Number(input.stubs) || 0) * 0.5;
  score -= Math.min(stubPenalty, 10);

  return Math.round(Math.max(0, Math.min(100, score)));
}

/**
 * @param {{ successRate?: number; totalErrors?: number }} backendHealth
 * @param {{ totalErrors?: number }} frontendHealth
 * @param {Array<{ severity?: string; type?: string; description?: string }>} anomalies
 */
export function generateRecommendations(backendHealth, frontendHealth, anomalies) {
  const recommendations = [];

  if (Number(backendHealth?.successRate) < 95) {
    recommendations.push({
      priority: 'high',
      area: 'backend',
      title: 'Improve API Success Rate',
      description: `Current success rate is ${backendHealth.successRate}%. Target is 95%.`,
      action: 'Review failed executions and fix common errors.',
    });
  }

  if (Number(frontendHealth?.totalErrors) > 20) {
    recommendations.push({
      priority: 'medium',
      area: 'frontend',
      title: 'Reduce Frontend Errors',
      description: `${frontendHealth.totalErrors} errors detected in the last 24 hours.`,
      action: 'Check error logs and fix common frontend issues.',
    });
  }

  for (const anomaly of anomalies ?? []) {
    if (anomaly.severity === 'high') {
      recommendations.push({
        priority: 'high',
        area: 'system',
        title: String(anomaly.type ?? 'anomaly').replace(/_/g, ' ').toUpperCase(),
        description: anomaly.description ?? '',
        action: 'Investigate and resolve the anomaly.',
      });
    }
  }

  return recommendations;
}

function rateOfFailures(rows) {
  if (!rows.length) return 0;
  const failures = rows.filter((o) => String(o.outcome ?? '').toLowerCase() === 'failure').length;
  return (failures / rows.length) * 100;
}

function getTopFailureActions(observations) {
  const failures = observations.filter((o) => String(o.outcome ?? '').toLowerCase() === 'failure');
  const actionCount = {};
  for (const f of failures) {
    const action = String(f.actionType ?? 'unknown');
    actionCount[action] = (actionCount[action] || 0) + 1;
  }
  return Object.entries(actionCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([action, count]) => ({ action, count }));
}

function groupByField(rows, field) {
  const grouped = {};
  for (const row of rows) {
    const key = String(row[field] ?? 'unknown');
    grouped[key] = (grouped[key] || 0) + 1;
  }
  return grouped;
}

function groupByUser(errors) {
  const grouped = {};
  for (const e of errors) {
    const uid = String(e.userId ?? 'anonymous');
    grouped[uid] = (grouped[uid] || 0) + 1;
  }
  return Object.entries(grouped)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([userId, count]) => ({ userId, count }));
}

function getTopErrors(errors) {
  const errorCount = {};
  for (const e of errors) {
    const key = String(e.message ?? '').slice(0, 80);
    if (!key) continue;
    errorCount[key] = (errorCount[key] || 0) + 1;
  }
  return Object.entries(errorCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([message, count]) => ({ message, count }));
}

function toMs(value) {
  if (value instanceof Date) return value.getTime();
  const parsed = Date.parse(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : NaN;
}

function summarizeFrontendError(row) {
  return {
    id: row.id ?? null,
    type: row.type ?? null,
    message: String(row.message ?? '').slice(0, 200),
    url: row.url ?? null,
    timestamp: row.timestamp ?? null,
  };
}

function summarizeBackendFailure(row) {
  return {
    id: row.id ?? null,
    actionType: row.actionType ?? null,
    error: row.error ? String(row.error).slice(0, 200) : null,
    createdAt: row.createdAt ?? null,
  };
}

function inferRootCauseHint(frontend, backend) {
  const frontMsg = String(frontend.message ?? '').toLowerCase();
  const backErr = String(backend.error ?? '').toLowerCase();
  const status = Number(frontend.status);

  if (status >= 500 || frontMsg.includes('internal server error')) {
    return 'Frontend API error likely caused by backend failure';
  }
  if (status === 401 || status === 403 || frontMsg.includes('unauthorized')) {
    return 'Auth/session issue — check token expiry and API auth middleware';
  }
  if (backErr.includes('prisma') || backErr.includes('database')) {
    return 'Database/schema issue surfaced to client';
  }
  if (frontend.type === 'network_error' || status === 0) {
    return 'Network/CORS/connectivity — backend may be unreachable';
  }
  return 'Temporal correlation — review both traces for shared mission or route';
}

export const diagnosticsTimeWindows = {
  dayAgo: () => new Date(Date.now() - MS_DAY),
  hourAgo: () => new Date(Date.now() - MS_HOUR),
  twoHoursAgo: () => new Date(Date.now() - 2 * MS_HOUR),
  thirtyMinAgo: () => new Date(Date.now() - 30 * 60 * 1000),
  sixtyMinAgo: () => new Date(Date.now() - 60 * 60 * 1000),
};
