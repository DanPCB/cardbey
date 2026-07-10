/**
 * Phase 2 — parity logging (kernel observes, Performer still decides).
 */

import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import type {
  AlternativeMission,
  CognitiveParityAgreement,
  CognitiveParityRecord,
} from '../types.js';
import {
  getLatestPassiveCognitiveRun,
  persistCognitiveParityRecord,
} from './persist.js';
import { isCampaignTool, isLoyaltyTool } from './parityMetrics.js';
import { buildDecisionRecordFromParity } from '../calibration/buildDecisionRecord.js';

function normalizeTool(tool: string | null | undefined): string | null {
  const t = String(tool ?? '').trim();
  return t || null;
}

function toolsAgree(kernelTool: string | null, performerTool: string | null): boolean {
  if (!kernelTool || !performerTool) return false;
  if (kernelTool === performerTool) return true;
  if (isCampaignTool(kernelTool) && isCampaignTool(performerTool)) return true;
  return false;
}

function performerInTopN(
  alternatives: AlternativeMission[],
  performerTool: string | null,
  n: number,
): boolean {
  if (!performerTool) return false;
  const slice = alternatives.slice(0, n);
  return slice.some((alt) => toolsAgree(normalizeTool(alt.toolHint), performerTool));
}

function resolveAgreement(args: {
  hasKernelRun: boolean;
  top1Agrees: boolean;
  top3Agrees: boolean;
}): CognitiveParityAgreement {
  if (!args.hasKernelRun) return 'no_kernel_run';
  if (args.top1Agrees) return 'top1';
  if (args.top3Agrees) return 'top3';
  return 'disagree';
}

function buildParityTags(args: {
  intentReasonerTool: string | null;
  performerTool: string | null;
  classificationSource: string | null;
  top1Agrees: boolean;
  hasAttachment: boolean;
}): string[] {
  const tags: string[] = [];

  if (!args.top1Agrees) tags.push('disagreement');

  const source = String(args.classificationSource ?? '').toLowerCase();
  if (source.includes('attachment') || (args.hasAttachment && source.includes('loyalty'))) {
    tags.push('attachment_hijack');
  }

  const irCampaign = isCampaignTool(args.intentReasonerTool);
  const irLoyalty = isLoyaltyTool(args.intentReasonerTool);
  const perfCampaign = isCampaignTool(args.performerTool);
  const perfLoyalty = isLoyaltyTool(args.performerTool);

  if ((irCampaign && perfLoyalty) || (irLoyalty && perfCampaign)) {
    tags.push('campaign_vs_loyalty');
  }
  if (args.intentReasonerTool && args.performerTool && args.intentReasonerTool !== args.performerTool) {
    tags.push('performer_override');
  }

  return [...new Set(tags)];
}

function appendParityLogLine(record: CognitiveParityRecord): void {
  const logPath = String(process.env.KERNEL_PARITY_LOG_PATH ?? '').trim();
  if (!logPath) return;
  try {
    mkdirSync(dirname(logPath), { recursive: true });
    appendFileSync(logPath, `${JSON.stringify(record)}\n`, 'utf8');
  } catch (err) {
    console.warn(
      '[KernelCognitive] parity log append failed (non-fatal):',
      err instanceof Error ? err.message : err,
    );
  }
}

export type RecordCognitiveParityInput = {
  streamId?: string | null;
  performerTool?: string | null;
  performerConfidence?: number | null;
  intentReasonerTool?: string | null;
  classificationSource?: string | null;
  hasAttachment?: boolean;
  userText?: string | null;
  attachmentSignals?: {
    ocrWeak?: boolean;
    ocrFailed?: boolean;
    visionAmbiguous?: boolean;
    missingStore?: boolean;
  };
  /** Optional explicit kernel top alternative (computed from run when omitted). */
  topKernelAlternative?: AlternativeMission | null;
  /** Optional explicit agreement (computed when omitted). */
  agreement?: CognitiveParityAgreement | null;
};

/**
 * Compare kernel alternatives with Performer classification.
 * Passive only — never affects routing.
 */
export function recordCognitiveParityComparison(
  args: RecordCognitiveParityInput,
): CognitiveParityRecord | null {
  const streamId = String(args.streamId ?? '').trim();
  if (!streamId) return null;

  const run = getLatestPassiveCognitiveRun(streamId);
  const alternatives = run?.reasoningFrame.alternatives ?? [];
  const top = args.topKernelAlternative ?? alternatives[0] ?? null;
  const kernelTool = normalizeTool(top?.toolHint ?? null);
  const performerTool = normalizeTool(args.performerTool);
  const intentReasonerTool = normalizeTool(args.intentReasonerTool);

  const hasKernelRun = Boolean(run);
  const top1Agrees = hasKernelRun ? toolsAgree(kernelTool, performerTool) : false;
  const top3Agrees = hasKernelRun
    ? performerInTopN(alternatives, performerTool, 3)
    : false;

  const agreement =
    args.agreement ??
    resolveAgreement({
      hasKernelRun,
      top1Agrees,
      top3Agrees,
    });

  const tags = buildParityTags({
    intentReasonerTool,
    performerTool,
    classificationSource: args.classificationSource ?? null,
    top1Agrees,
    hasAttachment: args.hasAttachment === true,
  });

  const record: CognitiveParityRecord = {
    parityId: randomUUID(),
    streamId,
    runId: run?.runId ?? null,
    recordedAt: new Date().toISOString(),
    performerTool,
    performerConfidence:
      args.performerConfidence != null && Number.isFinite(Number(args.performerConfidence))
        ? Number(args.performerConfidence)
        : null,
    intentReasonerTool,
    classificationSource: args.classificationSource ?? null,
    kernelTopTool: kernelTool,
    kernelTopScore: top?.score ?? null,
    topKernelAlternative: top,
    agrees: top1Agrees,
    agreement,
    top1Agrees,
    top3Agrees,
    tags,
    alternatives,
  };

  persistCognitiveParityRecord(record);
  appendParityLogLine(record);

  console.info('[KernelCognitive] parity', {
    streamId: record.streamId,
    agreement: record.agreement,
    top1Agrees: record.top1Agrees,
    top3Agrees: record.top3Agrees,
    performerTool: record.performerTool,
    intentReasonerTool: record.intentReasonerTool,
    kernelTopTool: record.kernelTopTool,
    kernelTopScore: record.kernelTopScore,
    topAlternative: record.topKernelAlternative?.label ?? null,
    tags: record.tags,
    alternativeCount: record.alternatives.length,
  });

  buildDecisionRecordFromParity({
    streamId: record.streamId,
    userText: args.userText,
    performerTool: record.performerTool,
    performerConfidence: record.performerConfidence,
    performerSource: record.classificationSource,
    intentReasonerTool: record.intentReasonerTool,
    agreement: record.agreement,
    tags: record.tags,
    attachmentSignals: args.attachmentSignals,
  });

  return record;
}
