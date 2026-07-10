/**
 * Phase 2 — parity metrics for observe/compare gate (target: 7–14 days of logs).
 */

import type { CognitiveParityMetrics, CognitiveParityRecord } from '../types.js';
import { listCognitiveParityRecords } from './persist.js';

const CAMPAIGN_TOOLS = new Set(['launch_campaign', 'create_campaign']);
const LOYALTY_TOOLS = new Set(['setup_loyalty_program']);

function inWindow(record: CognitiveParityRecord, sinceMs: number | null): boolean {
  if (sinceMs == null) return true;
  return Date.parse(record.recordedAt) >= sinceMs;
}

function pct(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}

/**
 * Build rolling parity metrics from persisted records.
 */
export function buildCognitiveParityMetrics(options: {
  sinceMs?: number | null;
  maxExamples?: number;
} = {}): CognitiveParityMetrics {
  const sinceMs = options.sinceMs ?? null;
  const maxExamples = options.maxExamples ?? 25;

  const records = listCognitiveParityRecords().filter((r) => inWindow(r, sinceMs));
  const withKernel = records.filter((r) => r.agreement !== 'no_kernel_run');
  const top1 = withKernel.filter((r) => r.top1Agrees);
  const top3 = withKernel.filter((r) => r.top3Agrees);
  const disagreements = withKernel.filter((r) => r.agreement === 'disagree');

  const attachmentHijackCases = records.filter((r) => r.tags.includes('attachment_hijack'));
  const campaignVsLoyaltyConflicts = records.filter((r) =>
    r.tags.includes('campaign_vs_loyalty'),
  );

  const windowStartedAt =
    records.length > 0
      ? records.reduce((min, r) => (r.recordedAt < min ? r.recordedAt : min), records[0].recordedAt)
      : null;
  const windowEndedAt =
    records.length > 0
      ? records.reduce((max, r) => (r.recordedAt > max ? r.recordedAt : max), records[0].recordedAt)
      : null;

  return {
    windowStartedAt,
    windowEndedAt,
    totalComparisons: records.length,
    withKernelRun: withKernel.length,
    top1AgreementPct: pct(top1.length, withKernel.length),
    top3AgreementPct: pct(top3.length, withKernel.length),
    disagreementCount: disagreements.length,
    disagreementExamples: disagreements.slice(-maxExamples),
    attachmentHijackCases: attachmentHijackCases.slice(-maxExamples),
    campaignVsLoyaltyConflicts: campaignVsLoyaltyConflicts.slice(-maxExamples),
  };
}

export function isCampaignTool(tool: string | null | undefined): boolean {
  return CAMPAIGN_TOOLS.has(String(tool ?? '').trim());
}

export function isLoyaltyTool(tool: string | null | undefined): boolean {
  return LOYALTY_TOOLS.has(String(tool ?? '').trim());
}
