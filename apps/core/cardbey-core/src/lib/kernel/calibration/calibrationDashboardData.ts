/**
 * Phase 3 — grouped calibration data for future dashboard UI.
 */

import { buildDecisionCalibrationMetrics } from './calibrationMetrics.js';
import { listDecisionRecords } from './calibrationStore.js';
import type { DecisionRecord } from './decisionRecord.types.js';

function topConflictPairs(records: DecisionRecord[], limit = 10) {
  const pairs = new Map<string, number>();

  for (const record of records) {
    if (record.calibration.agreement === 'top1' || record.calibration.agreement === 'top3') {
      continue;
    }
    const performer = record.performer.tool ?? 'unknown';
    const kernel = record.kernel.topAlternative?.toolHint ?? 'unknown';
    const key = `${performer} ↔ ${kernel}`;
    pairs.set(key, (pairs.get(key) ?? 0) + 1);
  }

  return [...pairs.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([pair, count]) => ({ pair, count }));
}

function confidenceDrift(records: DecisionRecord[]) {
  const deltas = records
    .map((r) => r.calibration.confidenceDelta)
    .filter((d): d is number => d != null && Number.isFinite(d));

  if (!deltas.length) {
    return { avgDelta: null, performerStronger: 0, kernelStronger: 0, equal: 0 };
  }

  const avgDelta = Math.round((deltas.reduce((a, b) => a + b, 0) / deltas.length) * 1000) / 1000;
  let performerStronger = 0;
  let kernelStronger = 0;
  let equal = 0;

  for (const d of deltas) {
    if (Math.abs(d) < 0.001) equal += 1;
    else if (d > 0) performerStronger += 1;
    else kernelStronger += 1;
  }

  return { avgDelta, performerStronger, kernelStronger, equal };
}

export function buildCalibrationDashboardData(options: { sinceMs?: number | null } = {}) {
  const sinceMs = options.sinceMs ?? Date.now() - 14 * 24 * 60 * 60 * 1000;
  const metrics = buildDecisionCalibrationMetrics({ sinceMs });
  const records = listDecisionRecords({ sinceMs });

  return {
    summary: {
      total: metrics.total,
      top1AgreementPct: metrics.top1AgreementPct,
      top3AgreementPct: metrics.top3AgreementPct,
      disagreementPct: metrics.disagreementPct,
      readyForAuthority: metrics.readiness.readyForAuthority,
      gates: metrics.readiness,
    },
    disagreementBreakdown: metrics.disagreementReasons,
    confidenceDrift: confidenceDrift(records),
    topConflictPairs: topConflictPairs(records),
    tagCounts: metrics.tagCounts,
    recentDecisionRecords: records.slice(-50).reverse(),
    examples: metrics.examples,
  };
}
