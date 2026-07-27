/**
 * Phase 3 — decision calibration metrics and readiness gates.
 */

import { listDecisionRecords } from './calibrationStore.js';
import type {
  DecisionCalibrationMetrics,
  DecisionRecord,
  DisagreementReason,
} from './decisionRecord.types.js';

const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

function pct(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}

function countTags(records: DecisionRecord[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const record of records) {
    for (const tag of record.calibration.tags) {
      counts[tag] = (counts[tag] ?? 0) + 1;
    }
  }
  return counts;
}

function countReasons(records: DecisionRecord[]): Partial<Record<DisagreementReason, number>> {
  const counts: Partial<Record<DisagreementReason, number>> = {};
  for (const record of records) {
    const reason = record.calibration.disagreementReason;
    if (!reason) continue;
    counts[reason] = (counts[reason] ?? 0) + 1;
  }
  return counts;
}

function isCloseCall(record: DecisionRecord): boolean {
  const alts = record.kernel.alternatives;
  if (alts.length < 2) return false;
  return alts[0].score - alts[1].score < 0.12;
}

function isHighConfidenceDisagreement(record: DecisionRecord): boolean {
  if (record.calibration.agreement === 'top1' || record.calibration.agreement === 'top3') {
    return false;
  }
  const perf = record.performer.confidence ?? 0;
  const kernel = record.kernel.topAlternative?.score ?? 0;
  return perf >= 0.85 || kernel >= 0.85;
}

export function buildDecisionCalibrationMetrics(options: {
  sinceMs?: number | null;
  maxExamples?: number;
} = {}): DecisionCalibrationMetrics {
  const sinceMs = options.sinceMs ?? null;
  const maxExamples = options.maxExamples ?? 25;

  const records = listDecisionRecords({ sinceMs: sinceMs ?? undefined });
  const withKernel = records.filter((r) => r.calibration.agreement !== 'no_kernel_run');
  const top1 = withKernel.filter((r) => r.calibration.agreement === 'top1');
  const top3 = withKernel.filter((r) =>
    r.calibration.agreement === 'top1' || r.calibration.agreement === 'top3',
  );
  const disagreements = withKernel.filter((r) => r.calibration.agreement === 'disagree');
  const unexplained = disagreements.filter(
    (r) => r.calibration.disagreementReason === 'unknown' || r.calibration.disagreementReason == null,
  );

  const fourteenDayCutoff = Date.now() - FOURTEEN_DAYS_MS;
  const recentUnexplained = listDecisionRecords({ sinceMs: fourteenDayCutoff }).filter(
    (r) =>
      r.calibration.agreement === 'disagree' &&
      (r.calibration.disagreementReason === 'unknown' || r.calibration.disagreementReason == null),
  );

  const top1AgreementPct = pct(top1.length, withKernel.length);
  const gate1Agreement = top1AgreementPct >= 99;
  const gate2AllDisagreementsClassified = unexplained.length === 0;
  const gate3NoUnexplained14Days = recentUnexplained.length === 0;

  return {
    total: records.length,
    top1AgreementPct,
    top3AgreementPct: pct(top3.length, withKernel.length),
    disagreementPct: pct(disagreements.length, withKernel.length),
    unexplainedDisagreementCount: unexplained.length,
    disagreementReasons: countReasons(disagreements),
    tagCounts: countTags(records),
    campaignVsLoyaltyConflicts: records.filter((r) =>
      r.calibration.tags.includes('campaign_vs_loyalty'),
    ).length,
    attachmentHijackCases: records.filter((r) =>
      r.calibration.tags.includes('attachment_hijack'),
    ).length,
    highConfidenceDisagreements: disagreements.filter(isHighConfidenceDisagreement).length,
    closeCallCases: records.filter(isCloseCall).length,
    readiness: {
      gate1Agreement,
      gate2AllDisagreementsClassified,
      gate3NoUnexplained14Days,
      readyForAuthority: gate1Agreement && gate2AllDisagreementsClassified && gate3NoUnexplained14Days,
    },
    examples: {
      disagreements: disagreements.slice(-maxExamples),
      unexplained: unexplained.slice(-maxExamples),
      highConfidence: disagreements.filter(isHighConfidenceDisagreement).slice(-maxExamples),
    },
  };
}
